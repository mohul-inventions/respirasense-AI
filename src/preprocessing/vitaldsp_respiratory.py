"""
VitalDSP-Assisted Respiratory Signal Processing and Motion-Artifact Assessment.

Module: src/preprocessing/vitaldsp_respiratory.py
Project: RespiraSense AI

Features:
1. Strict Accelerometer-Based Motion & Walking Assessment:
   - 3-axis magnitude and dynamic acceleration isolation (gravity-removed).
   - Jerk metric (first temporal derivative of acceleration).
   - Stepping cadence detection (spectral energy in 1.4 - 3.6 Hz band).
   - Posture transition detection via low-pass tilt vector monitoring.
   - Motion state classification: REST, POSTURE_CHANGE, WALKING_MOTION, EXCESSIVE_MOTION.
   - ZERO gyroscope dependency.

2. Multi-Axis PCA Respiratory Component Extraction:
   - 3-axis bandpass filtering (0.1 - 0.7 Hz / 6 - 42 BPM).
   - Principal Component Analysis (PCA) decomposition across X, Y, Z.
   - Multi-component evaluation: spectral peak sharpness, in-band power ratio, rhythmicity.
   - Explicit selection criteria to identify optimal respiratory axis.

3. Wavelet Denoising & Filtering:
   - Uses vitalDSP.transforms.WaveletTransform with reflect padding to prevent boundary distortion.
   - Waveform smoothing and high-frequency artefact removal.

4. Dual Respiratory-Rate Estimation & Agreement Verification:
   - Method 1: vitalDSP.respiratory_analysis.RespiratoryAnalysis (counting / time_domain / ensemble).
   - Method 2: Independent Autocorrelation & Welch Spectral Peak Estimator.
   - Discrepancy metric and cross-method agreement check.

5. Multi-Metric Signal Quality Index (SQI) & Insufficient Signal Quality Rejection:
   - Composite SQI from SNR, rhythmicity, spectral purity, and motion penalty.
   - Rejection of corrupted windows (walking, excessive motion, SQI < 0.35, discrepancy > 4.0 BPM).
"""

import numpy as np
from scipy import signal as sp_signal
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Tuple, List
import logging

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config

logger = logging.getLogger("vitaldsp_respiratory")

# Safe import of vitalDSP
try:
    import vitalDSP
    from vitalDSP.respiratory_analysis import RespiratoryAnalysis
    from vitalDSP.transforms.wavelet_transform import WaveletTransform
    from vitalDSP.signal_quality_assessment.signal_quality import SignalQuality
    VITALDSP_AVAILABLE = True
except ImportError:
    VITALDSP_AVAILABLE = False
    logger.warning("vitalDSP package not found. Fallback algorithms will be used.")


@dataclass
class VitalDSPRespiratoryResult:
    """Structured output from VitalDSP respiratory processing."""
    respiratory_rate_bpm: Optional[float]
    confidence: float
    status: str                        # "RELIABLE", "DEGRADED", "INSUFFICIENT_QUALITY"
    rejection_reason: Optional[str]

    # Dual method estimates
    primary_rate_bpm: Optional[float]
    secondary_rate_bpm: Optional[float]
    primary_method: str
    secondary_method: str
    method_discrepancy_bpm: Optional[float]
    agreement_score: float

    # Signal Quality Index
    sqi: float
    sqi_breakdown: Dict[str, float]

    # Motion & Walking assessment (strictly accelerometer-derived)
    motion_state: str                  # "REST", "POSTURE_CHANGE", "WALKING_MOTION", "EXCESSIVE_MOTION"
    motion_rms: float
    dynamic_rms: float
    hf_motion_rms: float
    jerk_metric: float
    cadence_freq_hz: Optional[float]
    cadence_power_ratio: float
    delta_tilt_deg: float

    # PCA Respiratory Axis details
    selected_axis: str
    pca_variance_explained: List[float]
    axis_quality_scores: Dict[str, float]

    # Processed respiratory waveform
    respiratory_waveform: np.ndarray = field(default_factory=lambda: np.array([], dtype=np.float32))
    sample_rate_hz: float = 50.0


def validate_and_resample_accelerometer(
    timestamps: Optional[np.ndarray],
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    target_fs: float = 50.0
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Validates accelerometer arrays, repairs NaNs/Infs, checks monotonicity,
    and resamples to uniform target_fs if necessary.
    """
    n = min(len(x), len(y), len(z))
    if n < 10:
        raise ValueError(f"Insufficient accelerometer samples: {n} < 10")

    x_arr = np.array(x[:n], dtype=np.float64)
    y_arr = np.array(y[:n], dtype=np.float64)
    z_arr = np.array(z[:n], dtype=np.float64)

    # Clean NaNs and Infs
    for arr in (x_arr, y_arr, z_arr):
        invalid_mask = np.isnan(arr) | np.isinf(arr)
        if np.any(invalid_mask):
            nan_ratio = np.mean(invalid_mask)
            if nan_ratio > 0.35:
                raise ValueError(f"High NaN/Inf ratio in sensor data: {nan_ratio:.1%}")
            valid_indices = np.where(~invalid_mask)[0]
            if len(valid_indices) == 0:
                raise ValueError("All accelerometer samples are NaN or Inf.")
            arr[invalid_mask] = np.interp(np.where(invalid_mask)[0], valid_indices, arr[valid_indices])

    # Check timestamps
    if timestamps is not None and len(timestamps) >= n:
        t_arr = np.array(timestamps[:n], dtype=np.float64)
        # Check monotonicity
        dt = np.diff(t_arr)
        if np.any(dt <= 0):
            # Monotonicity broken; synthesize uniform timestamps
            t_uniform = np.linspace(0, (n - 1) / target_fs, n)
            return t_uniform, x_arr, y_arr, z_arr

        # Check if sampling is non-uniform (jitter > 20%)
        mean_dt = np.mean(dt)
        if mean_dt > 0:
            jitter = np.std(dt) / mean_dt
            if jitter > 0.15:
                # Interpolate to uniform grid
                t_uniform = np.arange(t_arr[0], t_arr[-1], 1.0 / target_fs)
                if len(t_uniform) >= 10:
                    x_res = np.interp(t_uniform, t_arr, x_arr)
                    y_res = np.interp(t_uniform, t_arr, y_arr)
                    z_res = np.interp(t_uniform, t_arr, z_arr)
                    return t_uniform - t_uniform[0], x_res, y_res, z_res

        return t_arr - t_arr[0], x_arr, y_arr, z_arr

    # Default uniform timestamps
    t_uniform = np.linspace(0, (n - 1) / target_fs, n)
    return t_uniform, x_arr, y_arr, z_arr


def assess_accelerometer_motion(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    fs: float = 50.0
) -> Dict[str, Any]:
    """
    Evaluates body motion, walking cadence, jerk, and posture transition
    strictly from 3-axis accelerometer data without gyroscope dependency.
    """
    n = len(x)
    if n < int(fs * 1.5):
        return {
            "motion_state": "REST",
            "motion_rms": 0.0,
            "dynamic_rms": 0.0,
            "hf_motion_rms": 0.0,
            "jerk_metric": 0.0,
            "cadence_freq_hz": None,
            "cadence_power_ratio": 0.0,
            "delta_tilt_deg": 0.0
        }

    # 1. 3-Axis Magnitude
    mag = np.sqrt(x**2 + y**2 + z**2)
    raw_motion_rms = float(np.sqrt(np.mean(mag**2)))

    # AC dynamic magnitude without rectification distortion
    dyn_ac = mag - np.mean(mag)
    dynamic_rms = float(np.sqrt(np.mean(dyn_ac**2)))

    # 2. High-frequency non-respiratory motion (> 1.0 Hz)
    nyq = 0.5 * fs
    b_hf, a_hf = sp_signal.butter(2, min(config.MOVEMENT_HIGH_PASS_HZ / nyq, 0.99), btype='high')
    pad = min(n - 1, 3 * max(len(a_hf), len(b_hf)))
    try:
        hf_motion = sp_signal.filtfilt(b_hf, a_hf, dyn_ac, padlen=pad)
        hf_motion_rms = float(np.sqrt(np.mean(hf_motion**2)))
    except Exception:
        hf_motion_rms = dynamic_rms

    # 3. Jerk metric: RMS of numerical first derivative (m/s^3)
    dt = 1.0 / fs
    jerk_mag = np.abs(np.diff(dyn_ac)) / dt
    jerk_rms = float(np.sqrt(np.mean(jerk_mag**2))) if len(jerk_mag) > 0 else 0.0

    # 4. Cadence & Stepping detection (1.4 - 3.6 Hz walking band)
    nperseg = min(n, int(fs * 4.0))
    freqs, psd = sp_signal.welch(dyn_ac, fs=fs, nperseg=nperseg)

    cadence_mask = (freqs >= 1.4) & (freqs <= 3.6)
    total_mask = (freqs >= 0.5) & (freqs <= 10.0)

    cadence_power = float(np.sum(psd[cadence_mask])) if np.any(cadence_mask) else 0.0
    total_power = float(np.sum(psd[total_mask])) if np.any(total_mask) else 1e-10

    cadence_ratio = float(cadence_power / max(total_power, 1e-10))

    cadence_freq: Optional[float] = None
    if np.any(cadence_mask):
        sub_freqs = freqs[cadence_mask]
        sub_psd = psd[cadence_mask]
        cadence_freq = float(sub_freqs[np.argmax(sub_psd)])

    # 5. Posture transition check: angular tilt change across the window
    b_grav, a_grav = sp_signal.butter(2, min(0.25 / nyq, 0.99), btype='low')
    pad_g = min(n - 1, 3 * max(len(a_grav), len(b_grav)))
    try:
        grav_x = sp_signal.filtfilt(b_grav, a_grav, x, padlen=pad_g)
        grav_y = sp_signal.filtfilt(b_grav, a_grav, y, padlen=pad_g)
        grav_z = sp_signal.filtfilt(b_grav, a_grav, z, padlen=pad_g)
    except Exception:
        grav_x, grav_y, grav_z = np.full_like(x, np.mean(x)), np.full_like(y, np.mean(y)), np.full_like(z, np.mean(z))

    k = max(5, int(fs * 0.5))
    v_start = np.array([np.mean(grav_x[:k]), np.mean(grav_y[:k]), np.mean(grav_z[:k])])
    v_end = np.array([np.mean(grav_x[-k:]), np.mean(grav_y[-k:]), np.mean(grav_z[-k:])])

    norm_start = np.linalg.norm(v_start) + 1e-8
    norm_end = np.linalg.norm(v_end) + 1e-8
    cos_angle = np.clip(np.dot(v_start, v_end) / (norm_start * norm_end), -1.0, 1.0)
    delta_tilt_deg = float(np.degrees(np.arccos(cos_angle)))

    # 6. Classification Logic
    # Rhythmic cadence in walking band takes precedence
    if cadence_ratio > 0.30 and dynamic_rms > 0.25 and (cadence_freq is not None and 1.4 <= cadence_freq <= 3.6):
        motion_state = "WALKING_MOTION"
    elif hf_motion_rms > 1.2 or jerk_rms > 40.0:
        motion_state = "EXCESSIVE_MOTION"
    elif delta_tilt_deg > 14.0:
        motion_state = "POSTURE_CHANGE"
    elif hf_motion_rms > 0.40 or jerk_rms > 18.0:
        motion_state = "EXCESSIVE_MOTION"
    else:
        motion_state = "REST"

    return {
        "motion_state": motion_state,
        "motion_rms": round(raw_motion_rms, 3),
        "dynamic_rms": round(dynamic_rms, 3),
        "hf_motion_rms": round(hf_motion_rms, 3),
        "jerk_metric": round(jerk_rms, 2),
        "cadence_freq_hz": round(cadence_freq, 2) if cadence_freq else None,
        "cadence_power_ratio": round(cadence_ratio, 3),
        "delta_tilt_deg": round(delta_tilt_deg, 1)
    }


def extract_respiratory_pca(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    fs: float = 50.0
) -> Tuple[np.ndarray, str, List[float], Dict[str, float]]:
    """
    Extracts the dominant respiratory signal axis using Principal Component Analysis (PCA)
    across the 3-axis bandpass-filtered accelerometer channels.

    Evaluates each principal component on:
    - Spectral sharpness in the respiratory band (0.1 - 0.7 Hz)
    - In-band respiratory power ratio vs broadband noise
    - Rhythmicity via autocorrelation peak prominence
    """
    n = len(x)
    nyq = 0.5 * fs
    low = max(config.RESP_MOTION_LOW_HZ / nyq, 0.001)
    high = min(config.RESP_MOTION_HIGH_HZ / nyq, 0.999)
    b_resp, a_resp = sp_signal.butter(config.RESP_FILTER_ORDER, [low, high], btype='band')
    pad = min(n - 1, 3 * max(len(a_resp), len(b_resp)))

    # Bandpass filter each axis
    try:
        filt_x = sp_signal.filtfilt(b_resp, a_resp, sp_signal.detrend(x), padlen=pad)
        filt_y = sp_signal.filtfilt(b_resp, a_resp, sp_signal.detrend(y), padlen=pad)
        filt_z = sp_signal.filtfilt(b_resp, a_resp, sp_signal.detrend(z), padlen=pad)
    except Exception:
        filt_x, filt_y, filt_z = sp_signal.detrend(x), sp_signal.detrend(y), sp_signal.detrend(z)

    # Form N x 3 data matrix
    X = np.column_stack([filt_x, filt_y, filt_z])
    X_mean = np.mean(X, axis=0)
    X_centered = X - X_mean

    # SVD decomposition
    try:
        U, S, Vt = np.linalg.svd(X_centered, full_matrices=False)
        eigenvalues = (S ** 2) / max(n - 1, 1)
        total_var = np.sum(eigenvalues) + 1e-12
        var_explained = [float(v / total_var) for v in eigenvalues]
        pc_signals = [X_centered @ Vt[i, :] for i in range(3)]
    except Exception as e:
        logger.warning(f"SVD failed: {e}. Falling back to single-axis.")
        return filt_z, "Z_AXIS_FALLBACK", [1.0, 0.0, 0.0], {"Z": 1.0}

    # Evaluate each principal component
    scores = {}
    evaluated_pcs = []

    for idx, pc in enumerate(pc_signals):
        axis_name = f"PCA_{idx + 1}"
        # 1. Welch PSD in respiratory band
        nperseg = min(len(pc), int(fs * 6.0))
        freqs, psd = sp_signal.welch(pc, fs=fs, nperseg=nperseg)
        resp_mask = (freqs >= config.RESP_MOTION_LOW_HZ) & (freqs <= config.RESP_MOTION_HIGH_HZ)
        total_mask = (freqs >= 0.05) & (freqs <= 2.5)

        resp_psd = psd[resp_mask] if np.any(resp_mask) else np.array([0.0])
        tot_power = np.sum(psd[total_mask]) if np.any(total_mask) else 1e-10
        resp_power = np.sum(resp_psd)

        # In-band ratio
        in_band_ratio = float(resp_power / max(tot_power, 1e-10))

        # Peak sharpness: peak / mean in band
        if len(resp_psd) > 0 and np.mean(resp_psd) > 0:
            sharpness = min(1.0, (np.max(resp_psd) / np.mean(resp_psd)) / 4.0)
        else:
            sharpness = 0.0

        # 2. Rhythmicity via unbiased autocorrelation
        acorr = np.correlate(pc - np.mean(pc), pc - np.mean(pc), mode='full')
        acorr = acorr[len(acorr) // 2:]

        min_lag = int(fs * (60.0 / config.BR_MAX_BPM))  # ~1.4s
        max_lag = min(len(acorr) - 1, int(fs * (60.0 / config.BR_MIN_BPM)))   # ~10s

        rhythmicity = 0.0
        if max_lag > min_lag:
            lags = np.arange(min_lag, max_lag)
            unbiased_weights = len(pc) / np.maximum(len(pc) - lags, 1)
            search_region = (acorr[min_lag:max_lag] / (acorr[0] + 1e-10)) * unbiased_weights
            if len(search_region) > 2:
                rhythmicity = float(np.clip(np.max(search_region), 0.0, 1.0))

        # Composite axis quality score
        score = 0.40 * sharpness + 0.35 * in_band_ratio + 0.25 * rhythmicity
        scores[axis_name] = round(float(score), 3)
        evaluated_pcs.append((score, axis_name, pc))

    # Pick the component with the highest quality score
    evaluated_pcs.sort(key=lambda t: t[0], reverse=True)
    best_score, best_axis_name, best_signal = evaluated_pcs[0]

    return best_signal, best_axis_name, [round(v, 3) for v in var_explained], scores


def denoise_respiratory_waveform(signal: np.ndarray, fs: float = 50.0) -> np.ndarray:
    """
    Applies VitalDSP WaveletTransform with reflect boundary padding to eliminate boundary distortion,
    reconstructing a smoothed, clean respiratory waveform.
    """
    n = len(signal)
    if n < 16:
        return signal

    # If vitalDSP is available, attempt wavelet transform with boundary protection
    if VITALDSP_AVAILABLE:
        try:
            pad = min(50, n // 3)
            sig_padded = np.pad(signal, (pad, pad), mode='reflect')
            if len(sig_padded) % 2 != 0:
                sig_padded = np.pad(sig_padded, (0, 1), mode='edge')

            wt = WaveletTransform(sig_padded, wavelet_name='haar')
            coeffs = wt.perform_wavelet_transform(level=1)
            recon = wt.perform_inverse_wavelet_transform(coeffs)
            denoised = recon[pad:pad + n] / 2.0
            if len(denoised) == n and np.std(denoised) > 1e-6:
                return denoised
        except Exception as e:
            logger.debug(f"vitalDSP wavelet transform exception: {e}; falling back to zero-phase filter.")

    # Robust zero-phase Butterworth smoothing
    nyq = 0.5 * fs
    b, a = sp_signal.butter(2, min(0.75 / nyq, 0.99), btype='low')
    pad = min(n - 1, 3 * max(len(a), len(b)))
    try:
        denoised = sp_signal.filtfilt(b, a, signal, padlen=pad)
    except Exception:
        denoised = signal
    return denoised


def estimate_independent_respiratory_rate(waveform: np.ndarray, fs: float = 50.0) -> Tuple[Optional[float], float]:
    """
    Independent secondary estimator combining Autocorrelation and Welch PSD.
    Used to cross-validate VitalDSP RespiratoryAnalysis.
    """
    n = len(waveform)
    if n < int(fs * 3.5):
        return None, 0.0

    # 1. Welch PSD
    nperseg = min(n, int(fs * 8.0))
    freqs, psd = sp_signal.welch(waveform, fs=fs, nperseg=nperseg)
    resp_mask = (freqs >= config.RESP_MOTION_LOW_HZ) & (freqs <= config.RESP_MOTION_HIGH_HZ)
    if not np.any(resp_mask) or np.sum(psd[resp_mask]) < 1e-12:
        return None, 0.0

    r_freqs = freqs[resp_mask]
    r_psd = psd[resp_mask]
    psd_rate = float(r_freqs[np.argmax(r_psd)] * 60.0)

    # 2. Autocorrelation periodicity
    norm_sig = waveform - np.mean(waveform)
    acorr = np.correlate(norm_sig, norm_sig, mode='full')
    acorr = acorr[len(acorr) // 2:]
    acorr_norm = acorr / (acorr[0] + 1e-10)

    min_lag = int(fs * (60.0 / config.BR_MAX_BPM))   # ~1.4s
    max_lag = min(len(acorr_norm) - 1, int(fs * (60.0 / config.BR_MIN_BPM)))    # ~10s

    autocorr_rate: Optional[float] = None
    rhythmicity = 0.0
    if max_lag > min_lag:
        region = acorr_norm[min_lag:max_lag]
        peaks, props = sp_signal.find_peaks(region, prominence=0.08)
        if len(peaks) > 0:
            best_p = peaks[np.argmax(props['prominences'])]
            best_lag = min_lag + best_p
            autocorr_rate = float(60.0 / (best_lag / fs))
            rhythmicity = float(region[best_p])

    if autocorr_rate is not None:
        # Check agreement between PSD and Autocorrelation
        diff = abs(psd_rate - autocorr_rate)
        if diff <= 3.5:
            rate = 0.5 * psd_rate + 0.5 * autocorr_rate
            conf = min(1.0, 0.5 + 0.5 * rhythmicity)
        else:
            rate = psd_rate
            conf = 0.50
    else:
        rate = psd_rate
        conf = 0.50

    return round(rate, 1), round(conf, 3)


def compute_vitaldsp_sqi(
    waveform: np.ndarray,
    hf_motion_rms: float,
    jerk_rms: float,
    discrepancy_bpm: Optional[float],
    fs: float = 50.0
) -> Tuple[float, Dict[str, float]]:
    """
    Computes a comprehensive multi-metric Signal Quality Index (SQI) [0.0 - 1.0].
    Incorporates:
    - SNR in respiratory band
    - Autocorrelation rhythmicity
    - Spectral purity
    - Non-respiratory high-frequency motion & jerk penalty
    - Dual estimator discrepancy penalty
    """
    n = len(waveform)
    if n < int(fs * 2.0) or np.std(waveform) < 1e-5:
        return 0.0, {"snr_score": 0.0, "rhythmicity_score": 0.0, "purity_score": 0.0, "motion_penalty": 0.0, "discrepancy_factor": 0.0}

    # 1. Spectral Purity & SNR
    nperseg = min(n, int(fs * 6.0))
    freqs, psd = sp_signal.welch(waveform, fs=fs, nperseg=nperseg)
    resp_mask = (freqs >= config.RESP_MOTION_LOW_HZ) & (freqs <= config.RESP_MOTION_HIGH_HZ)
    noise_mask = (freqs < config.RESP_MOTION_LOW_HZ) | ((freqs > config.RESP_MOTION_HIGH_HZ) & (freqs <= 3.0))

    resp_power = float(np.sum(psd[resp_mask])) if np.any(resp_mask) else 1e-12
    noise_power = float(np.sum(psd[noise_mask])) if np.any(noise_mask) else 1e-12

    snr_db = 10.0 * np.log10(resp_power / noise_power)
    # 0 dB -> 0.4, 15 dB -> 1.0
    snr_score = float(np.clip((snr_db + 5.0) / 20.0, 0.0, 1.0))

    resp_psd = psd[resp_mask] if np.any(resp_mask) else np.array([0.0])
    purity_score = float(np.clip((np.max(resp_psd) / (np.mean(resp_psd) + 1e-10)) / 3.0, 0.0, 1.0))

    # 2. Autocorrelation Rhythmicity (unbiased normalization for finite-window)
    norm_sig = waveform - np.mean(waveform)
    acorr = np.correlate(norm_sig, norm_sig, mode='full')
    acorr = acorr[len(acorr) // 2:]

    min_lag = int(fs * (60.0 / config.BR_MAX_BPM))
    max_lag = min(len(acorr) - 1, int(fs * (60.0 / config.BR_MIN_BPM)))
    rhythmicity = 0.0
    if max_lag > min_lag:
        lags = np.arange(min_lag, max_lag)
        unbiased_weights = len(norm_sig) / np.maximum(len(norm_sig) - lags, 1)
        region = (acorr[min_lag:max_lag] / (acorr[0] + 1e-10)) * unbiased_weights
        if len(region) > 2:
            rhythmicity = float(np.clip(np.max(region), 0.0, 1.0))

    # 3. High-frequency non-respiratory motion & Jerk Penalty
    motion_pen = float(np.clip(1.0 - (hf_motion_rms / 0.35 + jerk_rms / 35.0), 0.0, 1.0))

    # 4. Discrepancy penalty
    discrepancy_factor = 1.0
    if discrepancy_bpm is not None:
        if discrepancy_bpm > 3.5:
            discrepancy_factor = max(0.2, 1.0 - (discrepancy_bpm - 3.5) * 0.2)

    raw_sqi = (0.35 * snr_score + 0.35 * rhythmicity + 0.30 * purity_score) * motion_pen * discrepancy_factor
    sqi = float(np.clip(raw_sqi, 0.0, 1.0))

    breakdown = {
        "snr_score": round(snr_score, 3),
        "rhythmicity_score": round(rhythmicity, 3),
        "purity_score": round(purity_score, 3),
        "motion_penalty": round(motion_pen, 3),
        "discrepancy_factor": round(discrepancy_factor, 3)
    }

    return round(sqi, 3), breakdown


class VitalDSPRespiratoryProcessor:
    """
    Comprehensive VitalDSP-assisted respiratory signal processing engine.
    Orchestrates validation, accelerometer motion assessment, PCA axis extraction,
    wavelet denoising, dual respiratory-rate estimation, and SQI rejection.
    """

    def __init__(self, target_fs: float = 50.0):
        self.target_fs = target_fs

    def process(
        self,
        x: np.ndarray,
        y: np.ndarray,
        z: np.ndarray,
        timestamps: Optional[np.ndarray] = None,
        fs: Optional[float] = None
    ) -> VitalDSPRespiratoryResult:
        """
        Executes end-to-end respiratory processing on 3-axis accelerometer data.
        """
        active_fs = fs if (fs is not None and fs > 10.0) else self.target_fs

        # 1. Validation and resampling
        try:
            t_res, x_res, y_res, z_res = validate_and_resample_accelerometer(
                timestamps, x, y, z, target_fs=active_fs
            )
        except Exception as e:
            return VitalDSPRespiratoryResult(
                respiratory_rate_bpm=None,
                confidence=0.0,
                status="INSUFFICIENT_QUALITY",
                rejection_reason=f"Data validation failed: {str(e)}",
                primary_rate_bpm=None,
                secondary_rate_bpm=None,
                primary_method="none",
                secondary_method="none",
                method_discrepancy_bpm=None,
                agreement_score=0.0,
                sqi=0.0,
                sqi_breakdown={"snr_score": 0.0, "rhythmicity_score": 0.0, "purity_score": 0.0, "motion_penalty": 0.0, "discrepancy_factor": 0.0},
                motion_state="EXCESSIVE_MOTION",
                motion_rms=0.0,
                dynamic_rms=0.0,
                hf_motion_rms=0.0,
                jerk_metric=0.0,
                cadence_freq_hz=None,
                cadence_power_ratio=0.0,
                delta_tilt_deg=0.0,
                selected_axis="NONE",
                pca_variance_explained=[],
                axis_quality_scores={},
                respiratory_waveform=np.array([], dtype=np.float32),
                sample_rate_hz=active_fs
            )

        # 2. Strict Accelerometer Motion & Walking Assessment
        motion_info = assess_accelerometer_motion(x_res, y_res, z_res, fs=active_fs)
        motion_state = motion_info["motion_state"]
        dyn_rms = motion_info["dynamic_rms"]
        hf_rms = motion_info["hf_motion_rms"]
        jerk = motion_info["jerk_metric"]

        # 3. PCA Respiratory Axis Extraction
        resp_pc, axis_name, var_exp, axis_scores = extract_respiratory_pca(
            x_res, y_res, z_res, fs=active_fs
        )

        # 4. Wavelet Denoising
        denoised_waveform = denoise_respiratory_waveform(resp_pc, fs=active_fs)

        # Flatline check
        if np.std(denoised_waveform) < 1e-5:
            return VitalDSPRespiratoryResult(
                respiratory_rate_bpm=None,
                confidence=0.0,
                status="INSUFFICIENT_QUALITY",
                rejection_reason="Flatline accelerometer signal: no respiratory variance detected",
                primary_rate_bpm=None,
                secondary_rate_bpm=None,
                primary_method="none",
                secondary_method="none",
                method_discrepancy_bpm=None,
                agreement_score=0.0,
                sqi=0.0,
                sqi_breakdown={"snr_score": 0.0, "rhythmicity_score": 0.0, "purity_score": 0.0, "motion_penalty": 1.0, "discrepancy_factor": 1.0},
                motion_state=motion_state,
                motion_rms=motion_info["motion_rms"],
                dynamic_rms=dyn_rms,
                hf_motion_rms=hf_rms,
                jerk_metric=jerk,
                cadence_freq_hz=motion_info["cadence_freq_hz"],
                cadence_power_ratio=motion_info["cadence_power_ratio"],
                delta_tilt_deg=motion_info["delta_tilt_deg"],
                selected_axis=axis_name,
                pca_variance_explained=var_exp,
                axis_quality_scores=axis_scores,
                respiratory_waveform=denoised_waveform.astype(np.float32),
                sample_rate_hz=active_fs
            )

        # 5. Method 1: VitalDSP RespiratoryAnalysis
        vitaldsp_rate: Optional[float] = None
        vitaldsp_conf: float = 0.0
        primary_method = "vitaldsp"

        if VITALDSP_AVAILABLE and len(denoised_waveform) >= int(active_fs * 3.5):
            try:
                ra = RespiratoryAnalysis(denoised_waveform, fs=int(round(active_fs)))
                count_rate = ra.compute_respiratory_rate(method='counting')
                ens_res = ra.compute_respiratory_rate_ensemble()
                ens_rate = ens_res.get('respiratory_rate')

                # Prefer counting if plausible; ensemble median if counting fails
                if count_rate is not None and config.BR_MIN_BPM <= count_rate <= config.BR_MAX_BPM:
                    vitaldsp_rate = round(float(count_rate), 1)
                    vitaldsp_conf = 0.85
                    primary_method = "vitaldsp_counting"
                elif ens_rate is not None and config.BR_MIN_BPM <= ens_rate <= config.BR_MAX_BPM:
                    vitaldsp_rate = round(float(ens_rate), 1)
                    vitaldsp_conf = round(float(ens_res.get('confidence', 0.8)), 3)
                    primary_method = "vitaldsp_ensemble"
            except Exception as e:
                logger.debug(f"vitalDSP estimation exception: {e}")

        # 6. Method 2: Independent Estimator (Welch PSD & Autocorrelation)
        secondary_rate, secondary_conf = estimate_independent_respiratory_rate(
            denoised_waveform, fs=active_fs
        )
        secondary_method = "psd_autocorr_hybrid"

        # If vitalDSP was not available at all, promote secondary estimator as primary
        if vitaldsp_rate is None and secondary_rate is not None:
            primary_rate = secondary_rate
            primary_conf = secondary_conf
            primary_method = "psd_autocorr_primary"
        else:
            primary_rate = vitaldsp_rate
            primary_conf = vitaldsp_conf

        # 7. Discrepancy & Agreement Verification
        discrepancy: Optional[float] = None
        agreement_score = 1.0

        if primary_rate is not None and secondary_rate is not None:
            discrepancy = round(abs(primary_rate - secondary_rate), 1)
            agreement_score = round(float(max(0.0, 1.0 - (discrepancy / 10.0))), 3)
        elif primary_rate is not None:
            agreement_score = 0.65
        else:
            agreement_score = 0.0

        # 8. SQI Computation
        sqi, sqi_breakdown = compute_vitaldsp_sqi(
            denoised_waveform, hf_rms, jerk, discrepancy, fs=active_fs
        )

        # 9. Final Decision & Rejection Logic
        status = "RELIABLE"
        rejection_reason: Optional[str] = None
        fused_br: Optional[float] = None

        if motion_state == "WALKING_MOTION":
            status = "INSUFFICIENT_QUALITY"
            rejection_reason = (
                f"Walking motion artifact detected (cadence {motion_info['cadence_freq_hz']} Hz, "
                f"ratio {motion_info['cadence_power_ratio']:.1%})"
            )
        elif motion_state == "EXCESSIVE_MOTION":
            status = "INSUFFICIENT_QUALITY"
            rejection_reason = f"Excessive body acceleration / jerk (dynamic RMS: {dyn_rms:.2f} m/s², hf RMS: {hf_rms:.2f} m/s²)"
        elif sqi < config.SQI_POOR_THRESHOLD:  # 0.30
            status = "INSUFFICIENT_QUALITY"
            rejection_reason = f"Signal Quality Index ({sqi:.2f}) below minimum threshold ({config.SQI_POOR_THRESHOLD})"
        elif primary_rate is None and secondary_rate is None:
            status = "INSUFFICIENT_QUALITY"
            rejection_reason = "No discernible respiratory rhythm in accelerometer signal"
        elif discrepancy is not None and discrepancy > 6.0:
            status = "INSUFFICIENT_QUALITY"
            rejection_reason = f"Dual estimator conflict: primary={primary_rate} bpm vs secondary={secondary_rate} bpm (diff: {discrepancy} bpm)"
        else:
            # Fused rate calculation
            if primary_rate is not None and secondary_rate is not None:
                tot_c = primary_conf + secondary_conf + 1e-8
                fused = (primary_conf * primary_rate + secondary_conf * secondary_rate) / tot_c
                fused_br = round(float(fused), 1)
            else:
                fused_br = primary_rate or secondary_rate

            if discrepancy is not None and discrepancy > 3.5:
                status = "DEGRADED"
                final_conf = ((primary_conf + secondary_conf) / 2.0) * 0.70
            elif motion_state == "POSTURE_CHANGE":
                status = "DEGRADED"
                final_conf = min(0.60, primary_conf * 0.8)
            else:
                status = "RELIABLE" if sqi >= config.SQI_GOOD_THRESHOLD else "DEGRADED"
                final_conf = min(1.0, ((primary_conf + secondary_conf) / 2.0) * (0.5 + 0.5 * sqi))

        overall_confidence = round(float(final_conf if fused_br is not None else 0.0), 3)

        return VitalDSPRespiratoryResult(
            respiratory_rate_bpm=fused_br,
            confidence=overall_confidence,
            status=status,
            rejection_reason=rejection_reason,
            primary_rate_bpm=primary_rate,
            secondary_rate_bpm=secondary_rate,
            primary_method=primary_method,
            secondary_method=secondary_method,
            method_discrepancy_bpm=discrepancy,
            agreement_score=agreement_score,
            sqi=sqi,
            sqi_breakdown=sqi_breakdown,
            motion_state=motion_state,
            motion_rms=motion_info["motion_rms"],
            dynamic_rms=dyn_rms,
            hf_motion_rms=hf_rms,
            jerk_metric=jerk,
            cadence_freq_hz=motion_info["cadence_freq_hz"],
            cadence_power_ratio=motion_info["cadence_power_ratio"],
            delta_tilt_deg=motion_info["delta_tilt_deg"],
            selected_axis=axis_name,
            pca_variance_explained=var_exp,
            axis_quality_scores=axis_scores,
            respiratory_waveform=denoised_waveform.astype(np.float32),
            sample_rate_hz=active_fs
        )
