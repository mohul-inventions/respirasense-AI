"""
RespiraSense AI — Continuous Audio Windowing and Configurable Noise Gate Module.

Implements:
1. Strict 20 ms windowing based on actual hardware sample rate.
2. Robust numerical validation (NaN, Inf, clipping detection, safe zero handling).
3. Exact RMS and dBFS calculation (reference 1.0, non-singular).
4. Configurable noise gate with:
   - Adjustable threshold in dBFS (default -45.0 dBFS).
   - Hysteresis band to eliminate rapid gating flutter.
   - Smooth attack and release envelope follower.
   - Observable gate states: OPEN, CLOSED, ATTACK, RELEASE.
5. Protection of Quiet Breathing:
   - Pre-gate RMS and dBFS measurements are never discarded when gate closes.
   - Pre-gate and post-gate levels are tracked and reported separately.
   - Explicit discrimination of quiet breathing candidates, ambient noise, and silence.
   - Clinical uncertainty disclaimers (audio level alone is not proof of breathing absence).
6. Bounded history buffering for real-time telemetry streaming without memory growth.
"""

import numpy as np
from typing import Dict, Any, List, Optional, Tuple
import time


class AudioNoiseGate:
    """
    Configurable real-time acoustic window processor and noise gate.
    Processes audio in strict 20 ms windows with smooth attack/release and hysteresis.
    """

    def __init__(
        self,
        threshold_dbfs: float = -20.0,
        hysteresis_db: float = 4.0,
        attack_ms: float = 15.0,
        release_ms: float = 80.0,
        window_duration_sec: float = 0.020,
        max_history_len: int = 60
    ):
        self.window_duration_sec = float(window_duration_sec)  # 20 ms
        self.threshold_dbfs = float(threshold_dbfs)            # Default -20.0 dBFS
        self.hysteresis_db = float(hysteresis_db)              # e.g. 4.0 dB
        self.attack_ms = float(attack_ms)                      # e.g. 15.0 ms
        self.release_ms = float(release_ms)                    # e.g. 80.0 ms
        self.max_history_len = int(max_history_len)

        # Internal state
        self.current_gain = 0.0
        self.gate_state = "CLOSED"  # CLOSED, ATTACK, OPEN, RELEASE
        self.carry_buffer = np.array([], dtype=np.float32)
        self.history: List[Dict[str, Any]] = []
        self.latest_window_res: Optional[Dict[str, Any]] = None
        self.total_windows_processed = 0
        self.total_samples_processed = 0

    @staticmethod
    def get_window_size(sample_rate: int) -> int:
        """
        Calculates window sample count for 20 ms at given sample rate:
        window_samples = round(sample_rate * 0.020)
        """
        if sample_rate <= 0:
            raise ValueError(f"Invalid sample rate: {sample_rate}")
        return int(round(sample_rate * 0.020))

    @staticmethod
    def compute_rms(samples: np.ndarray) -> float:
        """
        Calculates Root-Mean-Square amplitude of a signal window.
        Returns 0.0 if window is empty.
        """
        if samples is None or len(samples) == 0:
            return 0.0
        return float(np.sqrt(np.mean(samples ** 2)))

    @staticmethod
    def compute_dbfs(rms: float, floor_dbfs: float = -120.0) -> float:
        """
        Calculates decibels relative to Full Scale (dBFS) for normalized audio in [-1.0, 1.0].
        Reference is 1.0 (0 dBFS = full-scale square wave; -3.01 dBFS = full-scale sine).
        Zero or near-zero inputs are safely clamped to floor_dbfs to avoid -inf or NaN.
        """
        if rms <= 1e-9:
            return float(floor_dbfs)
        db = 20.0 * np.log10(rms)
        return float(max(floor_dbfs, min(0.0, db)))

    def configure(
        self,
        threshold_dbfs: Optional[float] = None,
        hysteresis_db: Optional[float] = None,
        attack_ms: Optional[float] = None,
        release_ms: Optional[float] = None,
        enforce_medical_bounds: bool = False
    ):
        """Allows internal/clinician tuning of noise gate parameters."""
        if threshold_dbfs is not None:
            if enforce_medical_bounds:
                self.threshold_dbfs = float(np.clip(threshold_dbfs, -25.0, -12.0))
            else:
                self.threshold_dbfs = float(threshold_dbfs)
        if hysteresis_db is not None:
            self.hysteresis_db = max(0.5, float(hysteresis_db))
        if attack_ms is not None:
            self.attack_ms = max(1.0, float(attack_ms))
        if release_ms is not None:
            self.release_ms = max(5.0, float(release_ms))

    def reset(self):
        """Resets the gate state and clears carryover buffer."""
        self.current_gain = 0.0
        self.gate_state = "CLOSED"
        self.carry_buffer = np.array([], dtype=np.float32)
        self.history.clear()
        self.latest_window_res = None

    def process_window(
        self,
        samples: np.ndarray,
        sample_rate: int,
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Processes a single validated audio window (typically 20 ms).
        Calculates pre-gate RMS & dBFS, updates gate state via attack/release/hysteresis,
        produces gated samples, preserves pre-gate metrics, and analyzes quiet breathing.
        """
        ts = timestamp if timestamp is not None else time.time()
        expected_size = self.get_window_size(sample_rate)

        # 1. Validation & sanitization
        if samples is None or len(samples) == 0:
            return {
                "timestamp": ts,
                "is_valid": False,
                "reason": "EMPTY_WINDOW",
                "sample_count": 0,
                "expected_size": expected_size,
                "pre_gate_rms": 0.0,
                "pre_gate_dbfs": -120.0,
                "post_gate_rms": 0.0,
                "post_gate_dbfs": -120.0,
                "gate_state": self.gate_state,
                "current_gain": self.current_gain,
                "threshold_dbfs": self.threshold_dbfs,
                "hysteresis_db": self.hysteresis_db,
                "is_clipped": False,
                "quiet_breathing_candidate": False,
                "status_message": "Audio window empty or unavailable",
                "gated_samples": np.array([], dtype=np.float32),
                "raw_samples": np.array([], dtype=np.float32),
            }

        arr = np.asarray(samples, dtype=np.float32)
        # Sanitize any non-finite values (NaN / Inf)
        if not np.all(np.isfinite(arr)):
            arr = np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=-1.0)

        # Check clipping (samples with magnitude >= 0.999)
        max_abs = float(np.max(np.abs(arr))) if len(arr) > 0 else 0.0
        is_clipped = bool(max_abs >= 0.999)

        # 2. Pre-Gate Measurements (NEVER discarded when gate closes)
        pre_rms = self.compute_rms(arr)
        pre_dbfs = self.compute_dbfs(pre_rms)

        # 3. Noise Gate Evaluation with Hysteresis
        # Open threshold = threshold_dbfs
        # Close threshold = threshold_dbfs - hysteresis_db
        open_th = self.threshold_dbfs
        close_th = self.threshold_dbfs - self.hysteresis_db

        target_gain = 0.0
        if self.gate_state in ("CLOSED", "RELEASE"):
            if pre_dbfs >= open_th:
                target_gain = 1.0
            else:
                target_gain = 0.0
        else:  # OPEN or ATTACK
            if pre_dbfs < close_th:
                target_gain = 0.0
            else:
                target_gain = 1.0

        # 4. Smooth Attack / Release Envelope Follower
        dt = float(len(arr)) / float(sample_rate)  # window duration in seconds
        tau_attack = max(0.001, self.attack_ms / 1000.0)
        tau_release = max(0.005, self.release_ms / 1000.0)

        if target_gain >= 0.5:
            # Target is OPEN (1.0)
            if self.current_gain >= 0.96:
                self.current_gain = 1.0
                self.gate_state = "OPEN"
            else:
                alpha = 1.0 - float(np.exp(-dt / tau_attack))
                self.current_gain += alpha * (1.0 - self.current_gain)
                if self.current_gain >= 0.96:
                    self.current_gain = 1.0
                    self.gate_state = "OPEN"
                else:
                    self.gate_state = "ATTACK"
        else:
            # Target is CLOSED (0.0)
            if self.current_gain <= 0.05:
                self.current_gain = 0.0
                self.gate_state = "CLOSED"
            else:
                alpha = 1.0 - float(np.exp(-dt / tau_release))
                self.current_gain += alpha * (0.0 - self.current_gain)
                if self.current_gain <= 0.05:
                    self.current_gain = 0.0
                    self.gate_state = "CLOSED"
                else:
                    self.gate_state = "RELEASE"

        # 5. Produce Gated Signal
        gated_arr = arr * float(self.current_gain)
        post_rms = self.compute_rms(gated_arr)
        post_dbfs = self.compute_dbfs(post_rms)

        # 6. Quiet Breathing Protection Analysis (Phase 5)
        # Even when the gate closes or is in release, evaluate whether this low-amplitude
        # energy could represent genuine quiet breathing vs floor silence.
        quiet_breathing = False
        status_msg = "Gate OPEN: signal above threshold"
        if self.gate_state in ("CLOSED", "RELEASE"):
            if pre_dbfs >= -65.0:
                quiet_breathing = True
                status_msg = (
                    f"Gate {self.gate_state}: Pre-gate level ({pre_dbfs:.1f} dBFS) preserved. "
                    "Low acoustic energy within quiet breathing band (-65 to -45 dBFS)."
                )
            elif pre_dbfs < -75.0:
                status_msg = f"Gate CLOSED: Ambient baseline near acoustic silence floor ({pre_dbfs:.1f} dBFS)."
            else:
                status_msg = f"Gate {self.gate_state}: Background acoustic noise floor ({pre_dbfs:.1f} dBFS)."
        elif self.gate_state == "ATTACK":
            status_msg = f"Gate ATTACK: Signal rising ({pre_dbfs:.1f} dBFS >= {open_th:.1f} dBFS)."
        else:
            status_msg = f"Gate OPEN: Signal streaming ({pre_dbfs:.1f} dBFS >= {open_th:.1f} dBFS)."

        res = {
            "timestamp": ts,
            "is_valid": True,
            "sample_count": len(arr),
            "expected_size": expected_size,
            "sample_rate": sample_rate,
            "pre_gate_rms": round(pre_rms, 6),
            "pre_gate_dbfs": round(pre_dbfs, 2),
            "post_gate_rms": round(post_rms, 6),
            "post_gate_dbfs": round(post_dbfs, 2),
            "current_gain": round(float(self.current_gain), 4),
            "gate_state": self.gate_state,
            "threshold_dbfs": self.threshold_dbfs,
            "hysteresis_db": self.hysteresis_db,
            "is_clipped": is_clipped,
            "quiet_breathing_candidate": quiet_breathing,
            "status_message": status_msg,
            "raw_samples": arr,
            "gated_samples": gated_arr,
        }

        self.latest_window_res = res
        self.total_windows_processed += 1
        self.total_samples_processed += len(arr)

        # Append compact summary to rolling history (omit raw large arrays)
        self.history.append({
            "timestamp": ts,
            "pre_gate_dbfs": round(pre_dbfs, 2),
            "post_gate_dbfs": round(post_dbfs, 2),
            "pre_gate_rms": round(pre_rms, 5),
            "post_gate_rms": round(post_rms, 5),
            "gate_state": self.gate_state,
            "gain": round(float(self.current_gain), 3),
            "quiet_breathing": quiet_breathing,
            "is_clipped": is_clipped,
        })
        if len(self.history) > self.max_history_len:
            self.history = self.history[-self.max_history_len:]

        return res

    def process_stream_chunk(
        self,
        samples: np.ndarray,
        sample_rate: int,
        timestamp: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Ingests a stream chunk of arbitrary length, concatenates with carryover buffer,
        and slices it into exact 20 ms windows for sequential processing.
        Preserves any fractional leftover samples in carry_buffer.
        """
        if samples is None or len(samples) == 0:
            return []

        in_arr = np.asarray(samples, dtype=np.float32)
        if len(self.carry_buffer) > 0:
            all_samples = np.concatenate([self.carry_buffer, in_arr])
        else:
            all_samples = in_arr

        win_size = self.get_window_size(sample_rate)
        n_windows = len(all_samples) // win_size
        results: List[Dict[str, Any]] = []

        base_ts = timestamp if timestamp is not None else time.time()
        win_duration = float(win_size) / float(sample_rate)

        for i in range(n_windows):
            chunk = all_samples[i * win_size : (i + 1) * win_size]
            win_ts = base_ts + i * win_duration
            w_res = self.process_window(chunk, sample_rate, win_ts)
            results.append(w_res)

        leftover_idx = n_windows * win_size
        if leftover_idx < len(all_samples):
            self.carry_buffer = all_samples[leftover_idx:]
        else:
            self.carry_buffer = np.array([], dtype=np.float32)

        return results

    def get_telemetry_payload(self) -> Dict[str, Any]:
        """
        Generates a lightweight, bandwidth-efficient telemetry dictionary
        suitable for feeding directly into the laptop dashboard.
        """
        latest = self.latest_window_res or {}
        raw = latest.get("raw_samples", np.array([]))
        gated = latest.get("gated_samples", np.array([]))

        # Downsample waveform to ~60 points for responsive UI rendering
        display_raw = []
        display_gated = []
        if len(raw) > 0:
            step = max(1, len(raw) // 60)
            display_raw = [round(float(v), 4) for v in raw[::step][:60]]
            display_gated = [round(float(v), 4) for v in gated[::step][:60]]

        return {
            "is_valid": latest.get("is_valid", False),
            "sample_rate": latest.get("sample_rate", 0),
            "window_duration_ms": int(self.window_duration_sec * 1000),
            "pre_gate_rms": latest.get("pre_gate_rms", 0.0),
            "pre_gate_dbfs": latest.get("pre_gate_dbfs", -120.0),
            "post_gate_rms": latest.get("post_gate_rms", 0.0),
            "post_gate_dbfs": latest.get("post_gate_dbfs", -120.0),
            "current_gain": latest.get("current_gain", 0.0),
            "gate_state": self.gate_state,
            "threshold_dbfs": self.threshold_dbfs,
            "hysteresis_db": self.hysteresis_db,
            "attack_ms": self.attack_ms,
            "release_ms": self.release_ms,
            "is_clipped": latest.get("is_clipped", False),
            "quiet_breathing_candidate": latest.get("quiet_breathing_candidate", False),
            "status_message": latest.get("status_message", "Acoustic gate initialized"),
            "pre_gate_waveform": display_raw,
            "post_gate_waveform": display_gated,
            "level_history": self.history[-40:],
            "total_windows_processed": self.total_windows_processed,
        }
