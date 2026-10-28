"""
Activity classifier and movement context engine.
Categories supported:
- resting
- walking (cadence 1.2 - 2.8 Hz)
- speaking (acoustic burstiness)
- coughing (abrupt transient spike)
- posture_transition (tilt angle shift)
- recovery (post-exercise or post-movement settling)
- unknown (insufficient quality or unclassified dynamic state)
"""

import numpy as np
from scipy import signal as sp_signal
from collections import deque
from typing import Dict, Any, Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


class ActivityClassifier:
    """
    Transparent, rule-based activity classifier based on measurable physical features.
    """

    def __init__(self, fs: float = 50.0):
        self.fs = fs
        self.history = deque(maxlen=8)
        self.last_high_motion_time = 0.0

    def _check_step_cadence(self, movement: np.ndarray) -> Tuple[bool, float]:
        """Detect walking cadence (1.2 to 2.8 Hz peak in high-pass motion magnitude)."""
        if len(movement) < int(self.fs * 2):
            return False, 0.0

        freqs, psd = sp_signal.welch(movement, fs=self.fs, nperseg=min(len(movement), int(self.fs * 4)))
        walk_mask = (freqs >= 1.2) & (freqs <= 2.8)
        if not np.any(walk_mask):
            return False, 0.0

        total_p = np.sum(psd) + 1e-10
        walk_p = np.sum(psd[walk_mask])
        ratio = float(walk_p / total_p)
        return (ratio > 0.32), ratio

    def _count_transient_spikes(self, raw_z: np.ndarray) -> int:
        """Count sudden high-amplitude spikes (cough-like events)."""
        if len(raw_z) < 15:
            return 0
        diff = np.abs(np.diff(raw_z))
        threshold = max(0.8, np.std(diff) * 3.5)
        spikes = np.where(diff > threshold)[0]
        if len(spikes) == 0:
            return 0
        
        # Cluster spikes within 0.25 seconds
        min_gap = int(0.25 * self.fs)
        count = 1
        last = spikes[0]
        for s in spikes[1:]:
            if s - last > min_gap:
                count += 1
                last = s
        return count

    def classify(self, x: np.ndarray, y: np.ndarray, z: np.ndarray,
                 motion_rms: float, is_transition: bool, delta_tilt: float,
                 movement_sig: np.ndarray, acoustic_info: Dict[str, Any] = None,
                 current_time: float = 0.0) -> Dict[str, Any]:
        """
        Classifies physical activity state.
        """
        is_walking, walk_ratio = self._check_step_cadence(movement_sig)
        spike_count = self._count_transient_spikes(z)
        
        has_speech = False
        has_cough = False
        if acoustic_info and acoustic_info.get("available", False):
            has_speech = acoustic_info.get("has_speech", False)
            has_cough = acoustic_info.get("has_cough", False)

        activity = "unknown"
        confidence = 0.5
        reason = "Unclassified state"

        # 1. Posture transition
        if is_transition or delta_tilt > 12.0:
            activity = "posture_transition"
            confidence = min(0.9, 0.6 + delta_tilt / 45.0)
            reason = f"Abrupt tilt change ({delta_tilt:.1f}°)"

        # 2. Walking (cadence 1.2 - 2.8 Hz)
        elif is_walking and motion_rms > config.MOTION_RMS_REST * 1.8:
            activity = "walking"
            confidence = min(0.95, 0.5 + walk_ratio)
            reason = f"Rhythmic step cadence detected ({walk_ratio:.0%} power in 1.2-2.8 Hz)"
            self.last_high_motion_time = current_time

        # 3. Speaking (voice activity detected, no explosive cough)
        elif has_speech and not has_cough:
            activity = "speaking"
            confidence = 0.85
            reason = "Vocal acoustic harmonics detected with minimal body sway"

        # 4. Coughing (confirmed acoustic cough, or violent motion impulse without speech)
        elif has_cough or (spike_count >= 3 and motion_rms > 0.40 and not has_speech):
            activity = "coughing"
            confidence = 0.88
            reason = "Explosive transient burst detected (> 250 Hz acoustic or severe motion jerk)"

        # 5. Recovery after movement
        elif (current_time - self.last_high_motion_time < 20.0) and (motion_rms < config.MOTION_RMS_REST * 1.5):
            activity = "recovery"
            confidence = 0.75
            reason = f"Settling at rest after recent movement ({int(current_time - self.last_high_motion_time)}s ago)"

        # 6. Resting
        elif motion_rms < config.MOTION_RMS_REST:
            activity = "resting"
            confidence = 0.88
            reason = f"Low movement RMS ({motion_rms:.3f} m/s²)"

        # 7. General movement
        elif motion_rms >= config.MOTION_RMS_REST:
            activity = "general_movement"
            confidence = 0.65
            reason = f"Non-rhythmic motion (RMS: {motion_rms:.3f} m/s²)"

        # Temporal smoothing with majority vote
        self.history.append(activity)
        from collections import Counter
        smoothed = Counter(self.history).most_common(1)[0][0]

        return {
            "activity": smoothed,
            "raw_activity": activity,
            "confidence": round(confidence, 3),
            "reason": reason,
            "motion_rms": round(motion_rms, 4),
            "walk_cadence_ratio": round(walk_ratio, 3),
            "cough_spikes": spike_count,
            "delta_tilt_deg": round(delta_tilt, 1),
        }
