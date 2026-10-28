"""
Breathing rate estimation from periodic motion and acoustic channels.
Combines peak-to-peak interval detection and Welch spectral density.
Includes physiological bounds, agreement checks, and confidence penalties.
"""

import numpy as np
from scipy import signal as sp_signal
from typing import Dict, Any, Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


def estimate_br_peaks(filtered_signal: np.ndarray, fs: float = 50.0) -> Dict[str, Any]:
    """
    Time-domain breathing rate estimation via peak-to-peak interval timing.
    """
    if len(filtered_signal) < int(fs * 3.5):
        return {"br_bpm": None, "confidence": 0.0, "n_peaks": 0}

    # Minimum sample distance between breath peaks based on max breathing rate (42 bpm)
    min_dist = max(1, int(fs * 60.0 / config.BR_MAX_BPM))
    prominence = max(0.005, float(np.std(filtered_signal) * 0.25))

    peaks, _ = sp_signal.find_peaks(filtered_signal, distance=min_dist, prominence=prominence)

    if len(peaks) < 2:
        return {"br_bpm": None, "confidence": 0.0, "n_peaks": len(peaks)}

    intervals_sec = np.diff(peaks) / fs
    mean_interval = float(np.mean(intervals_sec))
    std_interval = float(np.std(intervals_sec))

    if mean_interval <= 0:
        return {"br_bpm": None, "confidence": 0.0, "n_peaks": len(peaks)}

    raw_bpm = 60.0 / mean_interval
    cv = std_interval / mean_interval  # Coefficient of variation of breath cycles
    regularity_conf = max(0.0, 1.0 - min(cv, 1.0))

    # Physiological plausibility check
    is_plausible = (config.BR_MIN_BPM <= raw_bpm <= config.BR_MAX_BPM)
    if not is_plausible:
        regularity_conf *= 0.2

    clamped_bpm = float(np.clip(raw_bpm, config.BR_MIN_BPM, config.BR_MAX_BPM))

    return {
        "br_bpm": round(clamped_bpm, 1),
        "confidence": round(regularity_conf, 3),
        "n_peaks": len(peaks),
        "mean_interval_sec": round(mean_interval, 2),
        "is_plausible": is_plausible,
        "peak_indices": peaks.tolist(),
    }


def estimate_br_spectral(filtered_signal: np.ndarray, fs: float = 50.0) -> Dict[str, Any]:
    """
    Frequency-domain breathing rate estimation via Welch power spectral density.
    """
    if len(filtered_signal) < int(fs * 4.0):
        return {"br_bpm": None, "confidence": 0.0}

    nperseg = min(len(filtered_signal), int(fs * 8))
    freqs, psd = sp_signal.welch(filtered_signal, fs=fs, nperseg=nperseg)

    # Respiratory frequency window: 0.1 to 0.7 Hz (6 to 42 bpm)
    mask = (freqs >= config.RESP_MOTION_LOW_HZ) & (freqs <= config.RESP_MOTION_HIGH_HZ)
    r_freqs = freqs[mask]
    r_psd = psd[mask]

    if len(r_psd) == 0 or np.sum(r_psd) < 1e-12:
        return {"br_bpm": None, "confidence": 0.0}

    peak_idx = np.argmax(r_psd)
    dom_freq = float(r_freqs[peak_idx])
    bpm = dom_freq * 60.0

    # Sharpness / peak-to-average ratio in band
    peak_p = float(r_psd[peak_idx])
    mean_p = float(np.mean(r_psd)) + 1e-10
    spectral_purity = min(1.0, (peak_p / mean_p) / 4.0)

    # Ratio of dominant peak to total band power
    tot_p = np.sum(r_psd) + 1e-10
    p_ratio = min(1.0, peak_p / tot_p)

    conf = 0.5 * spectral_purity + 0.5 * p_ratio

    return {
        "br_bpm": round(bpm, 1),
        "dominant_freq_hz": round(dom_freq, 3),
        "confidence": round(float(conf), 3),
    }


def estimate_channel_br(filtered_signal: np.ndarray, fs: float = 50.0) -> Dict[str, Any]:
    """
    Combines peak detection and spectral estimation for a single sensor channel.
    Cross-checks agreement between time-domain and frequency-domain methods.
    """
    p_res = estimate_br_peaks(filtered_signal, fs)
    s_res = estimate_br_spectral(filtered_signal, fs)

    p_bpm = p_res.get("br_bpm")
    s_bpm = s_res.get("br_bpm")
    p_conf = p_res.get("confidence", 0.0)
    s_conf = s_res.get("confidence", 0.0)

    if p_bpm is None and s_bpm is None:
        return {"br_bpm": None, "confidence": 0.0, "method": "none", "agreement": 0.0}

    if p_bpm is None:
        return {"br_bpm": s_bpm, "confidence": round(s_conf * 0.75, 3), "method": "spectral_only", "agreement": 0.0}

    if s_bpm is None:
        return {"br_bpm": p_bpm, "confidence": round(p_conf * 0.75, 3), "method": "peaks_only", "agreement": 0.0}

    # Both available: check agreement
    diff = abs(p_bpm - s_bpm)
    agreement = max(0.0, 1.0 - (diff / max(p_bpm, 1.0)))

    # Weighted combination
    tot_c = p_conf + s_conf + 1e-8
    fused_bpm = (p_conf * p_bpm + s_conf * s_bpm) / tot_c
    fused_conf = ((p_conf + s_conf) / 2.0) * (0.6 + 0.4 * agreement)

    if diff > 5.0:
        fused_conf *= 0.5  # Penalize heavy disagreement between methods

    return {
        "br_bpm": round(float(fused_bpm), 1),
        "confidence": round(float(np.clip(fused_conf, 0.0, 1.0)), 3),
        "method": "peaks+spectral",
        "agreement": round(float(agreement), 3),
        "peak_bpm": p_bpm,
        "spectral_bpm": s_bpm,
        "peak_indices": p_res.get("peak_indices", []),
    }
