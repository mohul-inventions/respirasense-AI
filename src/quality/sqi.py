"""
Comprehensive Signal Quality Index (SQI) computation for wearable respiratory monitoring.

Evaluates each motion axis (X, Y, Z) and acoustic channels individually:
- Spectral concentration within physiological respiratory band (0.1 - 0.7 Hz).
- Autocorrelation periodicity and peak lag stability.
- Breath-to-breath amplitude consistency.
- Motion artefact contamination penalty.
- Missing data & saturation penalties.
"""

import numpy as np
from scipy import signal as sp_signal
from typing import Dict, Any

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config
from src.preprocessing.filters import compute_snr, compute_rms


def spectral_concentration(signal_array: np.ndarray, fs: float = 50.0) -> float:
    """Ratio of power in the respiratory band (0.1 - 0.7 Hz) to total AC power."""
    if len(signal_array) < int(fs * 2.5):
        return 0.3

    # Remove DC
    sig = signal_array - np.mean(signal_array)
    total_var = np.var(sig)
    if total_var < 1e-9:
        return 0.0

    nperseg = min(len(sig), int(fs * 8))
    freqs, psd = sp_signal.welch(sig, fs=fs, nperseg=nperseg)
    total_power = np.trapezoid(psd, freqs) + 1e-10

    resp_mask = (freqs >= config.RESP_MOTION_LOW_HZ) & (freqs <= config.RESP_MOTION_HIGH_HZ)
    resp_power = np.trapezoid(psd[resp_mask], freqs[resp_mask]) if np.any(resp_mask) else 0.0

    return float(np.clip(resp_power / total_power, 0.0, 1.0))


def periodicity_score(signal_array: np.ndarray, fs: float = 50.0) -> float:
    """Autocorrelation peak height in physiological lag window (1.4s to 10s)."""
    if len(signal_array) < int(fs * 3):
        return 0.3

    sig = signal_array - np.mean(signal_array)
    std_val = np.std(sig)
    if std_val < 1e-8:
        return 0.0
    sig = sig / std_val

    autocorr = np.correlate(sig, sig, mode='full')
    autocorr = autocorr[len(sig)-1:]
    autocorr = autocorr / (autocorr[0] + 1e-8)

    min_lag = int(fs / config.RESP_MOTION_HIGH_HZ)
    max_lag = min(int(fs / config.RESP_MOTION_LOW_HZ), len(autocorr) - 1)

    if max_lag <= min_lag or max_lag >= len(autocorr):
        return 0.3

    search_region = autocorr[min_lag:max_lag + 1]
    if len(search_region) == 0:
        return 0.3

    peak = float(np.max(search_region))
    return float(np.clip(peak, 0.0, 1.0))


def amplitude_stability(signal_array: np.ndarray, fs: float = 50.0) -> float:
    """Coefficient of variation of detected breath peaks."""
    if len(signal_array) < int(fs * 4):
        return 0.4

    min_dist = max(1, int(fs * 60 / config.BR_MAX_BPM))
    peaks, props = sp_signal.find_peaks(
        signal_array,
        distance=min_dist,
        prominence=max(0.005, float(np.std(signal_array) * 0.2))
    )

    if len(peaks) < 2:
        return 0.2

    proms = props.get("prominences", np.abs(signal_array[peaks]))
    mean_p = np.mean(proms)
    if mean_p < 1e-8:
        return 0.0
    cv = float(np.std(proms) / mean_p)
    return float(np.clip(1.0 - min(cv, 1.0), 0.0, 1.0))


def compute_axis_sqi(filtered_sig: np.ndarray, raw_sig: np.ndarray,
                     motion_rms: float, is_saturated: bool,
                     missing_count: int, fs: float = 50.0) -> Dict[str, Any]:
    """
    Computes rigorous SQI for a single accelerometer axis.
    Applies penalties for high-frequency motion artefacts, clipping, and missing samples.
    """
    sc = spectral_concentration(raw_sig, fs)
    ps = periodicity_score(filtered_sig, fs)
    amp_s = amplitude_stability(filtered_sig, fs)
    snr = compute_snr(filtered_sig) / 25.0
    snr_norm = float(np.clip(snr, 0.0, 1.0))

    base_sqi = 0.35 * sc + 0.35 * ps + 0.15 * amp_s + 0.15 * snr_norm

    # Penalties
    # 1. Motion artefact penalty: if motion_rms > 0.2 m/s^2, penalize proportional to motion
    motion_penalty = max(0.0, (motion_rms - 0.15) * 1.5)
    
    # 2. Saturation penalty
    sat_penalty = 0.5 if is_saturated else 0.0

    # 3. Missing samples penalty
    miss_penalty = min(0.4, missing_count * 0.1)

    final_sqi = max(0.0, base_sqi - motion_penalty - sat_penalty - miss_penalty)
    final_sqi = float(np.clip(final_sqi, 0.0, 1.0))

    return {
        "sqi": round(final_sqi, 3),
        "spectral_concentration": round(sc, 3),
        "periodicity": round(ps, 3),
        "amplitude_stability": round(amp_s, 3),
        "snr_norm": round(snr_norm, 3),
        "motion_penalty": round(motion_penalty, 3),
        "is_saturated": is_saturated,
        "missing_count": missing_count,
    }
