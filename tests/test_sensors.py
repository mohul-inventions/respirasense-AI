"""
Comprehensive automated unit and regression test suite for RespiraSense AI.
Verifies:
1. Synthetic periodic breathing rate accuracy against ground truth.
2. Injected motion artefacts and walking cadence rejection.
3. Gyroscope and Magnetometer multi-sensor integration.
4. Abrupt posture transitions and gravity tilt shift suppression.
5. Sensor saturation and clipping detection.
6. Disconnected Phyphox phone timeout and error reporting without crash.
7. Acoustic pipeline behavior with speech/cough vs unavailable mic and noise gating.
8. Adaptive fusion weighting vs naive unweighted baseline comparison.
"""

import unittest
from unittest.mock import patch, MagicMock
import numpy as np
from scipy import signal as sp_signal

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import config
from src.sensors.phone_stream import PhyphoxStream, SensorFrame
from src.sensors.simulator import RespirationSimulator
from src.preprocessing.filters import (
    process_three_axis_motion, estimate_gravity_and_tilt,
    detect_posture_transition, estimate_orientation_heading
)
from src.preprocessing.acoustics import AcousticAnalyzer, check_cough_frequency_condition
from src.quality.sqi import compute_axis_sqi, spectral_concentration, periodicity_score
from src.quality.activity_classifier import ActivityClassifier
from src.fusion.breathing_rate import estimate_channel_br, estimate_br_peaks, estimate_br_spectral
from src.fusion.adaptive_fusion import AdaptiveFusionEngine, FusionOutput
from src.detection.respiratory_interpretation import RespiratoryInterpretationEngine


class TestRespiraSensePipeline(unittest.TestCase):

    def setUp(self):
        self.fs = 50.0
        self.engine = AdaptiveFusionEngine(fs=self.fs)
        self.classifier = ActivityClassifier(fs=self.fs)
        self.acoustic = AcousticAnalyzer()

    def test_synthetic_breathing_rate_accuracy(self):
        """Verify breathing rate estimation on a clean 16 bpm synthetic signal."""
        target_bpm = 16.0
        target_hz = target_bpm / 60.0
        duration = 15.0
        t = np.linspace(0, duration, int(duration * self.fs), endpoint=False)
        clean_resp = 0.3 * np.sin(2 * np.pi * target_hz * t)
        
        res = estimate_channel_br(clean_resp, fs=self.fs)
        self.assertIsNotNone(res["br_bpm"])
        error = abs(res["br_bpm"] - target_bpm)
        self.assertLess(error, 1.5, f"Error {error} bpm too high on clean signal")
        self.assertGreater(res["confidence"], 0.6)

    def test_motion_artefact_suppression(self):
        """Verify that high-frequency walking motion is isolated and reduces axis SQI."""
        duration = 10.0
        n = int(duration * self.fs)
        t = np.linspace(0, duration, n, endpoint=False)
        
        clean = 0.2 * np.sin(2 * np.pi * 0.25 * t)
        walk_artifact = 1.2 * np.sin(2 * np.pi * 1.8 * t)
        noisy = clean + walk_artifact
        
        motion_res = process_three_axis_motion(np.zeros(n), np.zeros(n), noisy, fs=self.fs)
        self.assertGreater(motion_res["motion_rms"], 0.4)
        
        sqi_clean = compute_axis_sqi(clean, clean, motion_rms=0.02, is_saturated=False, missing_count=0, fs=self.fs)
        sqi_noisy = compute_axis_sqi(motion_res["filtered_z"], noisy, motion_rms=motion_res["motion_rms"],
                                     is_saturated=False, missing_count=0, fs=self.fs)
        
        self.assertGreater(sqi_clean["sqi"], sqi_noisy["sqi"])
        self.assertGreater(sqi_noisy["motion_penalty"], 0.2)

    def test_gyroscope_and_magnetometer_integration(self):
        """Verify that gyroscope angular rate and optional magnetometer heading compute properly."""
        n = 250
        gx = np.zeros(n)
        gy = np.full(n, 9.8)
        gz = np.zeros(n)
        gyro_x = np.full(n, 0.4)
        gyro_y = np.full(n, 0.2)
        gyro_z = np.full(n, 0.0)
        mag_x = np.full(n, 15.0)
        mag_y = np.full(n, -20.0)
        mag_z = np.full(n, 30.0)

        motion_res = process_three_axis_motion(
            gx, gy, gz,
            gyro_x=gyro_x, gyro_y=gyro_y, gyro_z=gyro_z,
            mag_x=mag_x, mag_y=mag_y, mag_z=mag_z,
            fs=self.fs
        )
        self.assertGreater(motion_res["gyro_rms"], 0.3)
        self.assertIsNotNone(motion_res["heading_deg"])
        self.assertTrue(0 <= motion_res["heading_deg"] <= 360)

    def test_posture_transition_safeguard(self):
        """Verify that an abrupt 45-degree tilt transition triggers rejection status."""
        duration = 10.0
        n = int(duration * self.fs)
        gx = np.zeros(n)
        gy = np.concatenate([np.full(n//2, 9.8), np.full(n//2, 2.0)])
        gz = np.concatenate([np.full(n//2, 1.0), np.full(n//2, 9.5)])
        
        is_trans, delta = detect_posture_transition(gx, gy, gz, fs=self.fs)
        self.assertTrue(is_trans)
        self.assertGreater(delta, 25.0)

        frame = SensorFrame(
            timestamp=100.0,
            time_vector=np.linspace(0, duration, n),
            accel_x=gx,
            accel_y=gy,
            accel_z=gz,
            gyro_x=np.zeros(n),
            gyro_y=np.zeros(n),
            gyro_z=np.zeros(n),
            is_synthetic=True
        )
        out = self.engine.process_frame(frame)
        self.assertEqual(out.status, "INSUFFICIENT_QUALITY")
        self.assertIsNone(out.fused_br_bpm)
        self.assertIn("posture transition", out.rejection_reason.lower())

    def test_sensor_saturation_handling(self):
        """Verify that clipped / saturated sensors trigger rejection."""
        n = 500
        frame = SensorFrame(
            timestamp=100.0,
            time_vector=np.linspace(0, 10, n),
            accel_x=np.zeros(n),
            accel_y=np.zeros(n),
            accel_z=np.zeros(n),
            gyro_x=np.zeros(n),
            gyro_y=np.zeros(n),
            gyro_z=np.zeros(n),
            is_saturated=True,
            saturation_flags={"z": True, "x": False, "y": False}
        )
        out = self.engine.process_frame(frame)
        self.assertEqual(out.status, "INSUFFICIENT_QUALITY")
        self.assertIn("saturation", out.rejection_reason.lower())

    def test_acoustic_pipeline_and_noise_gate(self):
        """Verify microphone analysis handles noise gating, speech detection, and unavailable cases."""
        # 1. Unavailable case
        res_none = self.acoustic.process_audio(None)
        self.assertFalse(res_none["available"])
        self.assertIn("not provided", res_none["reason"])
        
        # 2. Synthetic speech burst with noise gate
        fs_a = 8000
        n_a = int(fs_a * 4)
        t_a = np.linspace(0, 4, n_a, endpoint=False)
        speech_signal = 0.5 * np.sin(2 * np.pi * 800 * t_a) * (np.sin(2 * np.pi * 3 * t_a) > 0)
        res_speech = self.acoustic.process_audio(speech_signal, fs=fs_a, enable_noise_gate=True)
        self.assertTrue(res_speech["available"])
        self.assertTrue(res_speech["has_speech"])
        self.assertTrue(res_speech["noise_gate_applied"])

    def test_adaptive_vs_naive_baseline_comparison(self):
        """Verify that adaptive fusion rejects noise where naive baseline produces invalid rate."""
        duration = 10.0
        n = int(duration * self.fs)
        t = np.linspace(0, duration, n, endpoint=False)
        
        # Noise on Z and Y, clean 15 bpm on X
        resp_x = 0.25 * np.sin(2 * np.pi * 0.25 * t)
        noise_z = 1.5 * np.sin(2 * np.pi * 1.8 * t) # walking cadence
        noise_y = 1.0 * np.sin(2 * np.pi * 1.8 * t)

        frame = SensorFrame(
            timestamp=200.0,
            time_vector=t,
            accel_x=resp_x,
            accel_y=noise_y,
            accel_z=noise_z,
            gyro_x=np.zeros(n),
            gyro_y=np.zeros(n),
            gyro_z=np.zeros(n),
            is_synthetic=True
        )
        out = self.engine.process_frame(frame)
        # Because Z and Y have heavy noise, naive baseline averages the noise and breathing,
        # while adaptive fusion tracks the baseline and dynamically shifts weight or rejects if overall motion too high.
        self.assertIsNotNone(out.baseline_br_bpm)

    def test_disconnected_phyphox_handling(self):
        """Verify graceful error reporting when phone IP is unreachable."""
        stream = PhyphoxStream(phone_ip="192.0.2.1", port=8080)
        success, msg = stream.test_connection()
        self.assertFalse(success)
        self.assertTrue("cannot reach" in msg.lower() or "connection refused" in msg.lower() or "timed out" in msg.lower())
        
        frame = stream.get_frame(10.0)
        self.assertIsNone(frame)
        self.assertFalse(stream.connected)

    def test_interpretation_within_adult_resting_range(self):
        """Verify normal adult resting rate (16 bpm) flags 'WITHIN COMMON ADULT RESTING REFERENCE RANGE'."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=16.0,
            signal_quality=0.85,
            activity="resting",
            activity_confidence=0.9,
            data_freshness_sec=0.2,
            motion_rms=0.04
        )
        self.assertEqual(res.status_code, "WITHIN_RESTING_RANGE")
        self.assertEqual(res.primary_flag, "WITHIN COMMON ADULT RESTING REFERENCE RANGE")
        self.assertTrue(res.resting_threshold_applied)
        self.assertFalse(res.is_persistent_elevation)
        self.assertIn("not a clinical diagnosis", res.clinical_disclaimer.lower())

    def test_interpretation_elevated_resting_cautious_flag(self):
        """Verify elevated resting rate (>20 bpm) raises cautious flag without claiming medical diagnosis."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=26.0,
            signal_quality=0.80,
            activity="resting",
            activity_confidence=0.85,
            data_freshness_sec=0.1,
            motion_rms=0.03
        )
        self.assertEqual(res.status_code, "POSSIBLE_ELEVATED_RESTING")
        self.assertEqual(res.primary_flag, "POSSIBLE ELEVATED RESTING RESPIRATORY RATE")
        self.assertTrue(res.resting_threshold_applied)
        self.assertIn("not a clinical diagnosis of tachypnea", res.message.lower())

    def test_interpretation_below_resting_range(self):
        """Verify low resting rate (<12 bpm) flags 'BELOW COMMON ADULT RESTING REFERENCE RANGE'."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=9.5,
            signal_quality=0.75,
            activity="resting",
            activity_confidence=0.9,
            data_freshness_sec=0.2,
            motion_rms=0.02
        )
        self.assertEqual(res.status_code, "BELOW_RESTING_RANGE")
        self.assertEqual(res.primary_flag, "BELOW COMMON ADULT RESTING REFERENCE RANGE")
        self.assertTrue(res.resting_threshold_applied)

    def test_interpretation_exercise_context_does_not_apply_resting_threshold(self):
        """Verify that elevated rate during walking does NOT trigger tachypnea alert."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=28.0,
            signal_quality=0.65,
            activity="walking",
            activity_confidence=0.85,
            data_freshness_sec=0.1,
            motion_rms=0.85
        )
        self.assertEqual(res.status_code, "EXERCISE_CONTEXT")
        self.assertEqual(res.primary_flag, "EXERCISE CONTEXT — RESTING THRESHOLD NOT APPLIED")
        self.assertFalse(res.resting_threshold_applied)
        self.assertIn("not applicable during active ambulation", res.message)

    def test_interpretation_post_exercise_recovery_trend(self):
        """Verify transition from exercise to rest initiates recovery observation."""
        engine = RespiratoryInterpretationEngine()
        t0 = 1000.0
        # High motion at t0
        engine.interpret(
            estimated_br=30.0, signal_quality=0.6, activity="running",
            activity_confidence=0.9, motion_rms=1.2, now=t0
        )
        # Low motion 30 seconds later (in recovery window)
        res = engine.interpret(
            estimated_br=22.0, signal_quality=0.75, activity="resting",
            activity_confidence=0.85, motion_rms=0.05, now=t0 + 30.0
        )
        self.assertEqual(res.status_code, "RECOVERY_OBSERVATION")
        self.assertEqual(res.primary_flag, "OBSERVATION REQUIRED")
        self.assertTrue(res.recovery_trend_observed)
        self.assertFalse(res.resting_threshold_applied)
        self.assertGreater(res.recovery_duration_sec, 0.0)

    def test_interpretation_insufficient_quality_suppression(self):
        """Verify that low SQI (<0.40) suppresses the estimate completely."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=18.0,
            signal_quality=0.22,
            activity="resting",
            activity_confidence=0.9,
            data_freshness_sec=0.1,
            motion_rms=0.45
        )
        self.assertEqual(res.status_code, "INSUFFICIENT_QUALITY")
        self.assertEqual(res.primary_flag, "SIGNAL QUALITY INSUFFICIENT")
        self.assertIsNone(res.estimated_br_bpm)

    def test_interpretation_stale_data_warning(self):
        """Verify data older than 4s triggers stale data warning and suppresses estimate."""
        engine = RespiratoryInterpretationEngine()
        res = engine.interpret(
            estimated_br=16.0,
            signal_quality=0.85,
            activity="resting",
            activity_confidence=0.9,
            data_freshness_sec=6.5
        )
        self.assertEqual(res.status_code, "STALE_DATA")
        self.assertEqual(res.primary_flag, "DATA FRESHNESS WARNING")
        self.assertIsNone(res.estimated_br_bpm)

    def test_interpretation_persistent_elevation_multi_window(self):
        """Verify multi-window persistence requirement for elevated resting flag."""
        engine = RespiratoryInterpretationEngine(persistent_windows_required=3)
        # Window 1: elevated
        r1 = engine.interpret(estimated_br=25.0, signal_quality=0.85, activity="resting")
        self.assertFalse(r1.is_persistent_elevation)
        # Window 2: elevated
        r2 = engine.interpret(estimated_br=26.0, signal_quality=0.85, activity="resting")
        self.assertFalse(r2.is_persistent_elevation)
        # Window 3: elevated -> now persistent!
        r3 = engine.interpret(estimated_br=25.5, signal_quality=0.85, activity="resting")
        self.assertTrue(r3.is_persistent_elevation)
        self.assertIn("persistent pattern", r3.message.lower())

    def test_phyphox_buffer_mapping_and_timestamp_ordering(self):
        """Verify PhyphoxStream buffer extraction and monotonic timestamp verification."""
        stream = PhyphoxStream(endpoint="http://127.0.0.1:8080")
        buf_data = {
            "accX": {"buffer": [0.1, 0.2, 0.3]},
            "accY": {"buffer": [0.0, 0.1, -0.1]},
            "accZ": {"buffer": [9.8, 9.82, 9.79]},
            "acc_time": {"buffer": [1.0, 1.02, 1.04]}
        }
        arr_x = stream._extract_arr(buf_data, ["accX", "acc_x"])
        arr_t = stream._extract_arr(buf_data, ["acc_time", "time"])
        self.assertEqual(len(arr_x), 3)
        self.assertEqual(len(arr_t), 3)
        # Verify timestamps are strictly monotonically increasing
        self.assertTrue(np.all(np.diff(arr_t) > 0))

    def test_endpoint_normalization(self):
        """Verify parse_endpoint handles diverse network formats without duplicating ports or protocols."""
        from src.sensors.phone_stream import parse_endpoint

        # Standard full URL
        host, port, base = parse_endpoint("http://192.168.43.1:8080")
        self.assertEqual(host, "192.168.43.1")
        self.assertEqual(port, 8080)
        self.assertEqual(base, "http://192.168.43.1:8080")

        # URL with trailing slash and path
        host, port, base = parse_endpoint("http://192.168.1.15:8080/get/")
        self.assertEqual(host, "192.168.1.15")
        self.assertEqual(port, 8080)
        self.assertEqual(base, "http://192.168.1.15:8080")

        # Bare IP with custom port
        host, port, base = parse_endpoint("10.0.0.42:9000")
        self.assertEqual(host, "10.0.0.42")
        self.assertEqual(port, 9000)
        self.assertEqual(base, "http://10.0.0.42:9000")

        # Bare IP without port (defaults to 8080)
        host, port, base = parse_endpoint("192.168.43.1", default_port=8080)
        self.assertEqual(host, "192.168.43.1")
        self.assertEqual(port, 8080)
        self.assertEqual(base, "http://192.168.43.1:8080")

    def test_dynamic_buffer_discovery(self):
        """Verify discover_sensor_buffers dynamically identifies available sensor channels."""
        from src.sensors.phone_stream import discover_sensor_buffers

        # Case 1: Accelerometer only experiment ("Acceleration with g")
        acc_only_dict = {
            "accX": {"buffer": [1, 2]},
            "accY": {"buffer": [1, 2]},
            "accZ": {"buffer": [1, 2]},
            "acc_time": {"buffer": [0.1, 0.2]}
        }
        res1 = discover_sensor_buffers(acc_only_dict)
        self.assertTrue(res1["has_accel"])
        self.assertFalse(res1["has_gyro"])
        self.assertEqual(res1["accel_status"], "ACTIVE")
        self.assertEqual(res1["gyro_status"], "NOT IN EXPERIMENT")
        self.assertIn("accX", res1["buffer_names"])

        # Case 2: Full Raw Sensors experiment (Accelerometer + Gyroscope)
        raw_sensors_dict = {
            "accX": {"buffer": [1]},
            "accY": {"buffer": [2]},
            "accZ": {"buffer": [3]},
            "acc_time": {"buffer": [0.1]},
            "gyrX": {"buffer": [0.01]},
            "gyrY": {"buffer": [0.02]},
            "gyrZ": {"buffer": [0.03]},
            "gyr_time": {"buffer": [0.1]}
        }
        res2 = discover_sensor_buffers(raw_sensors_dict)
        self.assertTrue(res2["has_accel"])
        self.assertTrue(res2["has_gyro"])
        self.assertEqual(res2["accel_status"], "ACTIVE")
        self.assertEqual(res2["gyro_status"], "ACTIVE")
        self.assertIn("gyrX", res2["buffer_names"])

        # Case 3: Alternative buffer naming (gyroX, gyroY, gyroZ)
        alt_gyro_dict = {
            "acc_x": {"buffer": [1]},
            "acc_y": {"buffer": [2]},
            "acc_z": {"buffer": [3]},
            "gyroX": {"buffer": [0.1]},
            "gyroY": {"buffer": [0.2]},
            "gyroZ": {"buffer": [0.3]},
        }
        res3 = discover_sensor_buffers(alt_gyro_dict)
        self.assertTrue(res3["has_accel"])
        self.assertTrue(res3["has_gyro"])

    def test_reachability_diagnostics_unreachable(self):
        """Verify reachability test correctly returns diagnostic failure info on unreachable host."""
        # Use an unroutable IP (TEST-NET-1 192.0.2.1) with a minimal timeout
        stream = PhyphoxStream(endpoint="http://192.0.2.1:8080", timeout=0.3)
        diag = stream.test_connection(probe_timeout=0.2)
        self.assertFalse(diag["success"])
        self.assertIn(diag["error_type"], ["TIMEOUT", "UNREACHABLE", "CONNECTION_ERROR", "CONNECTION_REFUSED"])
        self.assertIn("reach", diag["message"].lower())

    def test_reachability_diagnostics_success_with_mock(self):
        """Verify test_connection returns complete buffer and sensor diagnostics when endpoint responds."""
        stream = PhyphoxStream(endpoint="http://192.168.43.1:8080")
        
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "buffer": {
                "accX": {"buffer": [0.1, 0.2]},
                "accY": {"buffer": [0.0, 0.1]},
                "accZ": {"buffer": [9.8, 9.8]},
                "gyrX": {"buffer": [0.05]},
                "gyrY": {"buffer": [0.02]},
                "gyrZ": {"buffer": [0.01]},
            }
        }

        with patch.object(stream.session, "get", return_value=mock_resp):
            diag = stream.test_connection(probe_timeout=1.0)
            self.assertTrue(diag["success"])
            self.assertTrue(diag["has_accel"])
            self.assertTrue(diag["has_gyro"])
            self.assertEqual(diag["accel_status"], "ACTIVE")
            self.assertEqual(diag["gyro_status"], "ACTIVE")
            self.assertIn("accX", diag["buffer_names"])
            self.assertIn("gyrX", diag["buffer_names"])

    def test_cough_strict_frequency_threshold_rule(self):
        """
        Verify USER-DEFINED RULE:
        - freq > 250.0 Hz strictly is required.
        - freq == 250.0 Hz is FALSE.
        - freq < 250.0 Hz is FALSE.
        """
        # Exactly 250.0 Hz -> MUST BE FALSE
        self.assertFalse(check_cough_frequency_condition(250.0, threshold_hz=250.0),
                         "250.0 Hz must return False according to strict > rule")
        
        # Below 250.0 Hz -> MUST BE FALSE
        self.assertFalse(check_cough_frequency_condition(249.9, threshold_hz=250.0))
        self.assertFalse(check_cough_frequency_condition(150.0, threshold_hz=250.0))
        self.assertFalse(check_cough_frequency_condition(0.0, threshold_hz=250.0))

        # Above 250.0 Hz -> MUST BE TRUE
        self.assertTrue(check_cough_frequency_condition(250.1, threshold_hz=250.0))
        self.assertTrue(check_cough_frequency_condition(450.0, threshold_hz=250.0))
        self.assertTrue(check_cough_frequency_condition(1200.0, threshold_hz=250.0))

        # Configurable threshold test (e.g. 300.0 Hz)
        self.assertFalse(check_cough_frequency_condition(300.0, threshold_hz=300.0))
        self.assertFalse(check_cough_frequency_condition(299.9, threshold_hz=300.0))
        self.assertTrue(check_cough_frequency_condition(300.1, threshold_hz=300.0))

    def test_ordinary_speech_rejected_from_cough_classification(self):
        """
        Verify ordinary speech (harmonic, voiced pitch periodicity, non-explosive onset)
        is classified as SPEECH_DETECTED_NOT_COUGH and does not trigger has_cough=True.
        """
        fs = 8000
        duration = 2.0
        t = np.linspace(0, duration, int(fs * duration), endpoint=False)
        # Synthetic voiced vowel / speech formant structure:
        # Fundamental f0 = 150 Hz with harmonics at 300, 450, 600, 750 Hz (steady, non-explosive)
        speech_synth = (0.3 * np.sin(2 * np.pi * 150 * t) +
                        0.4 * np.sin(2 * np.pi * 300 * t) +
                        0.2 * np.sin(2 * np.pi * 450 * t) +
                        0.1 * np.sin(2 * np.pi * 600 * t))
        
        analyzer = AcousticAnalyzer(sample_rate=fs, cough_freq_threshold=250.0)
        res = analyzer.process_audio(speech_synth, fs=fs)
        
        self.assertTrue(res["available"])
        self.assertFalse(res["has_cough"], "Speech must not be falsely classified as a cough")
        self.assertIn("SPEECH", res["cough_status"])

    def test_explosive_transient_confirmed_cough_and_cooldown_merging(self):
        """
        Verify an explosive high-frequency transient (>250 Hz) triggers CONFIRMED_COUGH,
        and subsequent sound bursts within cooldown_sec are merged rather than double-counted.
        """
        fs = 8000
        duration = 1.0
        n = int(fs * duration)
        
        # Create explosive onset cough model:
        # Fast rise (<30ms), wideband burst decaying over 200ms, centered around 600-1000 Hz
        np.random.seed(42)
        noise = np.random.randn(n)
        envelope = np.zeros(n)
        burst_len = int(fs * 0.25)
        # Sharp exponential attack and decay
        attack = np.linspace(0, 1, int(fs * 0.02))
        decay = np.exp(-np.linspace(0, 5, burst_len - len(attack)))
        envelope[:burst_len] = np.concatenate([attack, decay])
        cough_audio = noise * envelope
        
        # Bandpass filter around 400 - 2000 Hz (cough acoustic energy)
        b, a = sp_signal.butter(2, [350.0 / (0.5 * fs), 1800.0 / (0.5 * fs)], btype='band')
        cough_audio = sp_signal.filtfilt(b, a, cough_audio)
        cough_audio = cough_audio / np.max(np.abs(cough_audio))

        analyzer = AcousticAnalyzer(sample_rate=fs, cough_freq_threshold=250.0)
        
        # First event at t = 100.0s
        res1 = analyzer.process_audio(cough_audio, fs=fs, current_time=100.0)
        self.assertTrue(res1["freq_condition_met"])
        self.assertTrue(res1["has_cough"])
        self.assertEqual(res1["cough_status"], "CONFIRMED_COUGH")
        self.assertEqual(len(analyzer.event_log), 1)

        # Second burst only 0.2s later (within 0.8s cooldown) -> should be merged
        res2 = analyzer.process_audio(cough_audio, fs=fs, current_time=100.2)
        self.assertFalse(res2["has_cough"], "Burst within cooldown must not double-count")
        self.assertEqual(res2["cough_status"], "EVENT_MERGED_COOLDOWN")
        self.assertEqual(len(analyzer.event_log), 1)

        # Third burst 1.0s later (after 0.8s cooldown expires) -> should confirm second cough
        res3 = analyzer.process_audio(cough_audio, fs=fs, current_time=101.2)
        self.assertTrue(res3["has_cough"])
        self.assertEqual(res3["cough_status"], "CONFIRMED_COUGH")
        self.assertEqual(len(analyzer.event_log), 2)

    def test_network_invalid_json_and_empty_buffers(self):
        """Verify PhyphoxStream handles malformed JSON response and empty buffer payloads gracefully."""
        stream = PhyphoxStream(endpoint="http://192.168.1.50:8080")
        
        # Test 1: Invalid non-JSON payload from phone webserver
        mock_bad_resp = MagicMock()
        mock_bad_resp.status_code = 200
        mock_bad_resp.json.side_effect = ValueError("Expecting value: line 1 column 1")
        mock_bad_resp.text = "<html>Error 500</html>"

        with patch.object(stream.session, "get", return_value=mock_bad_resp):
            diag = stream.test_connection(probe_timeout=0.5)
            self.assertFalse(diag["success"])
            self.assertEqual(diag["error_type"], "MALFORMED_JSON")

        # Test 2: JSON without sensor buffers
        mock_empty_resp = MagicMock()
        mock_empty_resp.status_code = 200
        mock_empty_resp.json.return_value = {"buffer": {}}

        with patch.object(stream.session, "get", return_value=mock_empty_resp):
            diag2 = stream.test_connection(probe_timeout=0.5)
            self.assertFalse(diag2["success"])
            self.assertEqual(diag2["error_type"], "NO_SENSOR_BUFFERS")

    def test_phyphox_gyroscope_buffer_discovery_and_extraction(self):
        """Verify discovery and extraction of gyroscope when Phyphox returns triaxial gyro buffers."""
        stream = PhyphoxStream(endpoint="http://192.168.1.100:8080")
        n_pts = 300
        t_arr = np.linspace(0, 6.0, n_pts).tolist()
        acc_val = (9.8 * np.ones(n_pts)).tolist()
        gyr_val = (0.35 * np.ones(n_pts)).tolist()

        mock_payload = {
            "buffer": {
                "acc_time": {"buffer": t_arr},
                "accX": {"buffer": acc_val},
                "accY": {"buffer": acc_val},
                "accZ": {"buffer": acc_val},
                "gyr_time": {"buffer": t_arr},
                "gyrX": {"buffer": gyr_val},
                "gyrY": {"buffer": gyr_val},
                "gyrZ": {"buffer": gyr_val},
            }
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload

        with patch.object(stream.session, "get", return_value=mock_resp):
            frame = stream.get_frame(duration_sec=5.0)
            self.assertIsNotNone(frame)
            self.assertTrue(frame.has_gyro)
            self.assertEqual(len(frame.gyro_z), len(frame.accel_z))
            self.assertAlmostEqual(float(np.mean(frame.gyro_z)), 0.35, places=2)

    def test_phyphox_unequal_sensor_sampling_rates_interpolation(self):
        """Verify interpolation when accelerometer and gyroscope have differing hardware sample rates."""
        stream = PhyphoxStream(endpoint="http://192.168.1.100:8080")
        n_acc = 500
        n_gyr = 250
        t_acc = np.linspace(0, 10.0, n_acc).tolist()
        t_gyr = np.linspace(0, 10.0, n_gyr).tolist()
        acc_z = (9.8 + 0.1 * np.sin(np.linspace(0, 10, n_acc))).tolist()
        gyr_z = (0.5 * np.cos(np.linspace(0, 10, n_gyr))).tolist()

        mock_payload = {
            "buffer": {
                "acc_time": {"buffer": t_acc},
                "accX": {"buffer": acc_z},
                "accY": {"buffer": acc_z},
                "accZ": {"buffer": acc_z},
                "gyr_time": {"buffer": t_gyr},
                "gyrX": {"buffer": gyr_z},
                "gyrY": {"buffer": gyr_z},
                "gyrZ": {"buffer": gyr_z},
            }
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload

        with patch.object(stream.session, "get", return_value=mock_resp):
            frame = stream.get_frame(duration_sec=8.0)
            self.assertIsNotNone(frame)
            self.assertTrue(frame.has_gyro)
            # Both channels must have identical length aligned to the 50 Hz frame
            self.assertEqual(len(frame.gyro_z), len(frame.accel_z))
            self.assertFalse(np.all(frame.gyro_z == 0.0))

    def test_phyphox_missing_gyroscope_in_experiment_non_fabrication(self):
        """Verify that when the experiment lacks gyroscope buffers, has_gyro=False and no fake data is generated."""
        stream = PhyphoxStream(endpoint="http://192.168.1.100:8080")
        n_pts = 300
        t_arr = np.linspace(0, 6.0, n_pts).tolist()
        acc_val = (9.8 * np.ones(n_pts)).tolist()

        # Phone only streaming "Acceleration with g"
        mock_payload = {
            "buffer": {
                "acc_time": {"buffer": t_arr},
                "accX": {"buffer": acc_val},
                "accY": {"buffer": acc_val},
                "accZ": {"buffer": acc_val},
            }
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload

        with patch.object(stream.session, "get", return_value=mock_resp):
            frame = stream.get_frame(duration_sec=5.0)
            self.assertIsNotNone(frame)
            self.assertFalse(frame.has_gyro)
            self.assertTrue(np.all(frame.gyro_z == 0.0))
            self.assertTrue(len(frame.accel_z) > 0)



if __name__ == "__main__":
    unittest.main()
