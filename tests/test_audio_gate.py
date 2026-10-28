"""
Comprehensive automated unit and regression test suite for Audio Windowing
and Configurable Noise Gate (AudioNoiseGate) in RespiraSense AI.

Validates:
1. 20 ms window-size calculations at various hardware sample rates.
2. Exact RMS calculation against theoretical benchmarks.
3. dBFS calculation with safe floor handling for zero and near-zero signals.
4. Signal below threshold: gate closes, gain approaches 0.
5. Signal above threshold: gate opens, gain approaches 1.
6. Attack and release envelope follower behavior across sequential 20 ms frames.
7. Hysteresis band preventing rapid switching around the threshold.
8. Empty, non-numerical (NaN, Inf), and clipped window handling.
9. Preservation of pre-gate RMS and dBFS measurements when gate is closed (Phase 5).
10. Separation of pre-gate and post-gate level tracking.
11. Stream chunk slicing into exact 20 ms windows with carryover buffer.
12. Telemetry payload generation for dashboard streaming.
"""

import unittest
import numpy as np
import time

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from src.preprocessing.audio_gate import AudioNoiseGate


class TestAudioNoiseGate(unittest.TestCase):

    def setUp(self):
        # Default test gate: -45 dBFS threshold, 4 dB hysteresis, 15ms attack, 80ms release
        self.gate = AudioNoiseGate(
            threshold_dbfs=-45.0,
            hysteresis_db=4.0,
            attack_ms=15.0,
            release_ms=80.0,
            window_duration_sec=0.020
        )

    def test_20ms_window_size_calculation(self):
        """Verify window sample count: window_samples = round(sample_rate * 0.020)"""
        sample_rates = {
            8000: 160,
            16000: 320,
            22050: 441,
            44100: 882,
            48000: 960,
            96000: 1920,
        }
        for sr, expected_samples in sample_rates.items():
            actual = self.gate.get_window_size(sr)
            self.assertEqual(
                actual, expected_samples,
                f"Sample rate {sr} Hz should yield {expected_samples} samples, got {actual}"
            )

        with self.assertRaises(ValueError):
            self.gate.get_window_size(0)
        with self.assertRaises(ValueError):
            self.gate.get_window_size(-44100)

    def test_rms_calculation(self):
        """Verify exact RMS calculation on known synthetic waveforms."""
        # Empty array
        self.assertEqual(self.gate.compute_rms(np.array([])), 0.0)

        # DC signal of amplitude 0.5 -> RMS = 0.5
        dc = np.full(500, 0.5, dtype=np.float32)
        self.assertAlmostEqual(self.gate.compute_rms(dc), 0.5, places=5)

        # Sine wave with amplitude A -> RMS = A / sqrt(2)
        amp = 0.8
        t = np.linspace(0, 1.0, 1000, endpoint=False)
        sine = amp * np.sin(2 * np.pi * 10 * t)
        expected_rms = amp / np.sqrt(2.0)
        self.assertAlmostEqual(self.gate.compute_rms(sine), expected_rms, places=2)

    def test_dbfs_calculation_and_safe_zero_handling(self):
        """Verify dBFS conversion with safe handling of zero/near-zero inputs."""
        # Full-scale RMS 1.0 = 0 dBFS
        self.assertAlmostEqual(self.gate.compute_dbfs(1.0), 0.0, places=2)

        # RMS = 0.1 -> -20 dBFS
        self.assertAlmostEqual(self.gate.compute_dbfs(0.1), -20.0, places=2)

        # RMS = 0.01 -> -40 dBFS
        self.assertAlmostEqual(self.gate.compute_dbfs(0.01), -40.0, places=2)

        # RMS = 0.0 (silence) must safely clamp to floor_dbfs (-120 dBFS) without math error
        self.assertEqual(self.gate.compute_dbfs(0.0), -120.0)
        self.assertEqual(self.gate.compute_dbfs(-0.0), -120.0)
        self.assertEqual(self.gate.compute_dbfs(1e-12), -120.0)

    def test_signal_above_threshold_opens_gate(self):
        """Verify that audio above threshold (-45 dBFS) opens the gate and gain reaches 1.0."""
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        # Amplitude 0.1 corresponds to ~ -20 dBFS (well above -45 dBFS threshold)
        loud_window = np.full(win_size, 0.1, dtype=np.float32)

        # Run multiple 20 ms frames to allow attack envelope to ramp up
        res = None
        for _ in range(5):
            res = self.gate.process_window(loud_window, sr)

        self.assertIsNotNone(res)
        self.assertEqual(res["gate_state"], "OPEN")
        self.assertAlmostEqual(res["current_gain"], 1.0, places=2)
        self.assertGreater(res["pre_gate_dbfs"], self.gate.threshold_dbfs)
        self.assertAlmostEqual(res["post_gate_rms"], res["pre_gate_rms"], places=4)

    def test_signal_below_threshold_closes_gate(self):
        """Verify that audio below threshold closes the gate and gain approaches 0.0."""
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        # Quiet hiss at amplitude 0.0005 corresponds to ~ -66 dBFS (below -45 dBFS threshold)
        quiet_window = np.full(win_size, 0.0005, dtype=np.float32)

        res = None
        for _ in range(8):
            res = self.gate.process_window(quiet_window, sr)

        self.assertIsNotNone(res)
        self.assertEqual(res["gate_state"], "CLOSED")
        self.assertAlmostEqual(res["current_gain"], 0.0, places=2)
        self.assertAlmostEqual(res["post_gate_rms"], 0.0, places=4)

    def test_attack_and_release_envelope_transitions(self):
        """Verify state transitions: CLOSED -> ATTACK -> OPEN -> RELEASE -> CLOSED."""
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        loud = np.full(win_size, 0.2, dtype=np.float32)
        quiet = np.full(win_size, 0.0001, dtype=np.float32)

        # 1. Start from quiet (CLOSED)
        for _ in range(5):
            self.gate.process_window(quiet, sr)
        self.assertEqual(self.gate.gate_state, "CLOSED")

        # 2. Feed single loud frame -> triggers ATTACK
        r1 = self.gate.process_window(loud, sr)
        self.assertIn(r1["gate_state"], ("ATTACK", "OPEN"))
        self.assertGreater(r1["current_gain"], 0.0)

        # 3. Feed more loud frames -> reaches OPEN
        for _ in range(5):
            r_open = self.gate.process_window(loud, sr)
        self.assertEqual(r_open["gate_state"], "OPEN")
        self.assertAlmostEqual(r_open["current_gain"], 1.0, places=2)

        # 4. Feed quiet frame -> triggers RELEASE
        r_rel = self.gate.process_window(quiet, sr)
        self.assertIn(r_rel["gate_state"], ("RELEASE", "CLOSED"))
        self.assertLess(r_rel["current_gain"], 1.0)

        # 5. Feed more quiet frames -> smoothly settles back to CLOSED
        for _ in range(16):
            r_closed = self.gate.process_window(quiet, sr)
        self.assertEqual(r_closed["gate_state"], "CLOSED")
        self.assertAlmostEqual(r_closed["current_gain"], 0.0, places=2)

    def test_hysteresis_band_behavior(self):
        """
        Verify hysteresis prevents rapid chattering around the threshold:
        - Must cross above threshold (-45 dBFS) to open.
        - Once open, remains OPEN even if signal drops to -47 dBFS (within 4 dB hysteresis band).
        - Closes only when signal drops below close threshold (-49 dBFS).
        """
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        
        # 1. Open the gate with a -35 dBFS signal (amp = 10^(-35/20) ~ 0.0178)
        amp_open = 10.0 ** (-35.0 / 20.0)
        open_win = np.full(win_size, amp_open, dtype=np.float32)
        for _ in range(6):
            self.gate.process_window(open_win, sr)
        self.assertEqual(self.gate.gate_state, "OPEN")

        # 2. Input at -47 dBFS (below open threshold of -45 dBFS, but above close threshold of -49 dBFS)
        amp_hyst = 10.0 ** (-47.0 / 20.0)
        hyst_win = np.full(win_size, amp_hyst, dtype=np.float32)
        r_hyst = self.gate.process_window(hyst_win, sr)
        # Gate must stay OPEN because of hysteresis!
        self.assertEqual(r_hyst["gate_state"], "OPEN")

        # 3. Input at -52 dBFS (below close threshold of -49 dBFS)
        amp_sub = 10.0 ** (-52.0 / 20.0)
        sub_win = np.full(win_size, amp_sub, dtype=np.float32)
        # Run 16 frames to allow release curve to settle to CLOSED
        for _ in range(16):
            r_close = self.gate.process_window(sub_win, sr)
        self.assertEqual(r_close["gate_state"], "CLOSED")

    def test_quiet_breathing_measurements_preserved_when_gate_closed(self):
        """
        CRITICAL PHASE 5 REQUIREMENT:
        When gate closes on quiet breathing (-60 dBFS), pre-gate RMS & dBFS must be preserved,
        quiet_breathing_candidate must be flagged, and post-gate level is suppressed.
        """
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        # Amplitude corresponding to -58 dBFS (typical quiet inhalation / exhalation acoustic excursion)
        amp_quiet_breath = 10.0 ** (-58.0 / 20.0)
        breath_win = np.full(win_size, amp_quiet_breath, dtype=np.float32)

        for _ in range(6):
            res = self.gate.process_window(breath_win, sr)

        # Gate is closed
        self.assertEqual(res["gate_state"], "CLOSED")
        # Post-gate is attenuated
        self.assertAlmostEqual(res["post_gate_rms"], 0.0, places=4)
        # PRE-GATE IS NOT DISCARDED!
        self.assertAlmostEqual(res["pre_gate_dbfs"], -58.0, delta=1.0)
        self.assertGreater(res["pre_gate_rms"], 0.0)
        # Quiet breathing candidate is recognized
        self.assertTrue(res["quiet_breathing_candidate"])
        self.assertIn("preserved", res["status_message"].lower())

    def test_clipping_detection(self):
        """Verify that audio windows with sample magnitude >= 0.999 trigger is_clipped=True."""
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        normal_win = np.full(win_size, 0.4, dtype=np.float32)
        r_norm = self.gate.process_window(normal_win, sr)
        self.assertFalse(r_norm["is_clipped"])

        clipped_win = np.full(win_size, 0.4, dtype=np.float32)
        clipped_win[10] = 1.0  # clipped spike
        r_clip = self.gate.process_window(clipped_win, sr)
        self.assertTrue(r_clip["is_clipped"])

    def test_empty_and_malformed_windows(self):
        """Verify safe handling of empty arrays, NaN, and Inf without crashing."""
        sr = 48000
        # Empty window
        r_empty = self.gate.process_window(np.array([]), sr)
        self.assertFalse(r_empty["is_valid"])
        self.assertEqual(r_empty["reason"], "EMPTY_WINDOW")

        # Window containing NaN and Inf
        win_size = self.gate.get_window_size(sr)
        bad_win = np.zeros(win_size, dtype=np.float32)
        bad_win[0] = np.nan
        bad_win[1] = np.inf
        bad_win[2] = -np.inf
        bad_win[3:] = 0.05

        r_bad = self.gate.process_window(bad_win, sr)
        self.assertTrue(r_bad["is_valid"])
        self.assertTrue(np.all(np.isfinite(r_bad["raw_samples"])))
        self.assertTrue(np.all(np.isfinite(r_bad["gated_samples"])))

    def test_stream_chunk_slicing_with_carryover(self):
        """
        Verify process_stream_chunk correctly slices incoming audio stream
        into exact 20 ms windows, preserving any leftover samples in carry_buffer.
        """
        sr = 16000
        win_size = self.gate.get_window_size(sr)  # 320 samples
        
        # Provide 800 samples = 2 full 320-sample windows + 160 leftover samples
        chunk = np.full(800, 0.02, dtype=np.float32)
        results = self.gate.process_stream_chunk(chunk, sr, timestamp=100.0)

        self.assertEqual(len(results), 2)
        self.assertEqual(len(self.gate.carry_buffer), 160)

        # Feed another 160 samples -> combines with 160 carryover to form 1 full window
        chunk2 = np.full(160, 0.02, dtype=np.float32)
        results2 = self.gate.process_stream_chunk(chunk2, sr, timestamp=100.04)

        self.assertEqual(len(results2), 1)
        self.assertEqual(len(self.gate.carry_buffer), 0)

    def test_telemetry_payload_generation(self):
        """Verify get_telemetry_payload produces compact, downsampled display waveforms."""
        sr = 48000
        win_size = self.gate.get_window_size(sr)
        win = 0.05 * np.sin(np.linspace(0, 10, win_size, dtype=np.float32))
        self.gate.process_window(win, sr)

        payload = self.gate.get_telemetry_payload()
        self.assertTrue(payload["is_valid"])
        self.assertEqual(payload["sample_rate"], sr)
        self.assertEqual(payload["window_duration_ms"], 20)
        self.assertLessEqual(len(payload["pre_gate_waveform"]), 60)
        self.assertLessEqual(len(payload["post_gate_waveform"]), 60)
        self.assertIn("level_history", payload)


if __name__ == "__main__":
    unittest.main()
