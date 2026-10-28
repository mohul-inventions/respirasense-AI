"""
Multi-axis motion signal processing for wearable respiratory monitoring.
Processes X, Y, and Z acceleration channels independently:
- Gravitational orientation estimation & detrending.
- Motion artefact isolation and combined Accel+Gyro movement intensity estimation.
- Optional Magnetometer heading integration for yaw stability.
- Bandpass filtering targeted at plausible physiological respiratory band (0.1 - 0.7 Hz).
- Posture transition detection via low-pass tilt vector monitoring & angular rate.
- Per-axis signal quality evaluation.
"""

import numpy as np
from scipy import signal as sp_signal
from typing import Dict, Tuple, Optional, Any

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


def butter_bandpass(lowcut: float, highcut: float, fs: float, order: int = 4):
    """Design a Butterworth bandpass filter with Nyquist boundary protections."""
    nyq = 0.5 * fs
    low = max(lowcut / nyq, 0.001)
    high = min(highcut / nyq, 0.999)
    if low >= high:
        low = 0.001
        high = 0.999
    b, a = sp_signal.butter(order, [low, high], btype='band')
    return b, a


def butter_lowpass(cutoff: float, fs: float, order: int = 2):
    nyq = 0.5 * fs
    norm = min(max(cutoff / nyq, 0.001), 0.999)
    return sp_signal.butter(order, norm, btype='low')


def butter_highpass(cutoff: float, fs: float, order: int = 2):
    nyq = 0.5 * fs
    norm = min(max(cutoff / nyq, 0.001), 0.999)
    return sp_signal.butter(order, norm, btype='high')


def estimate_gravity_and_tilt(x: np.ndarray, y: np.ndarray, z: np.ndarray, fs: float = 50.0
                              ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """
    Separates quasi-static gravity component (orientation) from dynamic acceleration.
    Low-pass filter at 0.08 Hz isolates gravitational tilt vector.
    Returns: (grav_x, grav_y, grav_z, tilt_angle_deg)
    """
    if len(z) < 15:
        return np.zeros_like(x), np.zeros_like(y), np.zeros_like(z), 0.0

    b, a = butter_lowpass(0.08, fs, order=2)
    pad = min(len(z) - 1, 3 * max(len(a), len(b)))
    try:
        gx = sp_signal.filtfilt(b, a, x, padlen=pad)
        gy = sp_signal.filtfilt(b, a, y, padlen=pad)
        gz = sp_signal.filtfilt(b, a, z, padlen=pad)
    except Exception:
        gx, gy, gz = np.full_like(x, np.mean(x)), np.full_like(y, np.mean(y)), np.full_like(z, np.mean(z))

    mean_gx, mean_gy, mean_gz = np.mean(gx), np.mean(gy), np.mean(gz)
    g_mag = np.sqrt(mean_gx**2 + mean_gy**2 + mean_gz**2) + 1e-8
    tilt_deg = float(np.degrees(np.arcsin(np.clip(mean_gz / g_mag, -1.0, 1.0))))

    return gx, gy, gz, tilt_deg


def estimate_orientation_heading(gx: float, gy: float, gz: float,
                                 mx: Optional[np.ndarray], my: Optional[np.ndarray], mz: Optional[np.ndarray]
                                 ) -> Optional[float]:
    """
    Optional magnetometer tilt-compensated magnetic heading (azimuth).
    Used only when magnetometer data is available to assist orientation tracking.
    """
    if mx is None or len(mx) < 5 or my is None or mz is None:
        return None

    # Mean values
    bx, by, bz = float(np.mean(mx)), float(np.mean(my)), float(np.mean(mz))
    # Normalize gravity vector
    g_norm = np.sqrt(gx**2 + gy**2 + gz**2) + 1e-8
    ax, ay, az = gx / g_norm, gy / g_norm, gz / g_norm

    # Pitch and roll
    pitch = np.arcsin(np.clip(-ax, -1.0, 1.0))
    roll = np.arcsin(np.clip(ay / (np.cos(pitch) + 1e-8), -1.0, 1.0))

    # Tilt-compensated magnetic components
    xh = bx * np.cos(pitch) + bz * np.sin(pitch)
    yh = bx * np.sin(roll) * np.sin(pitch) + by * np.cos(roll) - bz * np.sin(roll) * np.cos(pitch)

    heading = float(np.degrees(np.arctan2(-yh, xh)))
    if heading < 0:
        heading += 360.0
    return round(heading, 1)


def filter_single_axis(sig: np.ndarray, fs: float = 50.0) -> np.ndarray:
    """
    Detrend and bandpass filter an acceleration channel to isolate respiratory motion.
    0.1 Hz (6 bpm) to 0.7 Hz (42 bpm).
    """
    if len(sig) < 20:
        return sig - np.mean(sig)

    detrended = sp_signal.detrend(sig)
    b, a = butter_bandpass(config.RESP_MOTION_LOW_HZ, config.RESP_MOTION_HIGH_HZ, fs, order=config.RESP_FILTER_ORDER)
    pad = min(len(sig) - 1, 3 * max(len(a), len(b)))
    try:
        filtered = sp_signal.filtfilt(b, a, detrended, padlen=pad)
    except Exception:
        filtered = detrended
    return filtered


def extract_combined_movement_intensity(x: np.ndarray, y: np.ndarray, z: np.ndarray,
                                        gyro_x: np.ndarray = None, gyro_y: np.ndarray = None, gyro_z: np.ndarray = None,
                                        fs: float = 50.0) -> Tuple[np.ndarray, float, float]:
    """
    Computes movement intensity using high-frequency linear acceleration (> 1.0 Hz)
    AND angular rate from the gyroscope (if available).
    Returns: (movement_signal, motion_rms_linear, gyro_rms_angular)
    """
    if len(x) < 15:
        return np.zeros(len(x)), 0.0, 0.0

    b, a = butter_highpass(config.MOVEMENT_HIGH_PASS_HZ, fs, order=config.MOVEMENT_FILTER_ORDER)
    pad = min(len(x) - 1, 3 * max(len(a), len(b)))
    try:
        hfx = sp_signal.filtfilt(b, a, x - np.mean(x), padlen=pad)
        hfy = sp_signal.filtfilt(b, a, y - np.mean(y), padlen=pad)
        hfz = sp_signal.filtfilt(b, a, z - np.mean(z), padlen=pad)
        movement = np.sqrt(hfx**2 + hfy**2 + hfz**2)
    except Exception:
        movement = np.zeros(len(x))

    linear_rms = float(np.sqrt(np.mean(movement**2)))

    # Angular rate intensity from gyroscope (rad/s)
    gyro_rms = 0.0
    if gyro_x is not None and len(gyro_x) > 0:
        gyro_mag = np.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
        gyro_rms = float(np.sqrt(np.mean(gyro_mag**2)))

    # Combined motion intensity (scaling 1 rad/s ~ 1.5 m/s^2 equivalent body disturbance)
    combined_rms = linear_rms + 0.5 * gyro_rms
    return movement, combined_rms, gyro_rms


def detect_posture_transition(gx: np.ndarray, gy: np.ndarray, gz: np.ndarray,
                              gyro_x: np.ndarray = None, gyro_y: np.ndarray = None,
                              gyro_z: np.ndarray = None, fs: float = 50.0) -> Tuple[bool, float]:
    """
    Detects abrupt changes in phone orientation or posture shifts.
    A significant shift in the quasi-static gravity vector indicates phone/body movement.
    Returns: (is_transitioning: bool, delta_tilt_deg: float)
    """
    if len(gx) < int(fs * 2):
        return False, 0.0

    k = max(5, int(fs * 0.5))
    start_v = np.array([np.mean(gx[:k]), np.mean(gy[:k]), np.mean(gz[:k])])
    end_v = np.array([np.mean(gx[-k:]), np.mean(gy[-k:]), np.mean(gz[-k:])])

    norm_start = np.linalg.norm(start_v) + 1e-8
    norm_end = np.linalg.norm(end_v) + 1e-8

    cos_angle = np.clip(np.dot(start_v, end_v) / (norm_start * norm_end), -1.0, 1.0)
    delta_deg = float(np.degrees(np.arccos(cos_angle)))

    gyro_active = False
    if gyro_x is not None and len(gyro_x) > 0:
        gyro_mag = np.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
        if np.max(gyro_mag) > 0.8:  # rad/s (~45 deg/s)
            gyro_active = True

    is_transition = (delta_deg > 12.0) or (gyro_active and delta_deg > 6.0)
    return is_transition, delta_deg


def compute_rms(sig: np.ndarray) -> float:
    if len(sig) == 0:
        return 0.0
    return float(np.sqrt(np.mean(sig**2)))


def compute_snr(signal_array: np.ndarray, noise_floor: float = None) -> float:
    if len(signal_array) == 0:
        return 0.0
    if noise_floor is None:
        noise_floor = float(np.percentile(np.abs(signal_array), 10))
    s_power = np.mean(signal_array**2)
    n_power = max(noise_floor**2, 1e-10)
    snr = 10 * np.log10(s_power / n_power + 1e-10)
    return float(np.clip(snr, 0, 50))


def process_three_axis_motion(x: np.ndarray, y: np.ndarray, z: np.ndarray,
                              gyro_x: np.ndarray = None, gyro_y: np.ndarray = None,
                              gyro_z: np.ndarray = None,
                              mag_x: np.ndarray = None, mag_y: np.ndarray = None, mag_z: np.ndarray = None,
                              fs: float = 50.0) -> Dict[str, Any]:
    """
    Complete 3-axis motion processing pipeline with multi-sensor fusion.
    """
    gx, gy, gz, tilt_deg = estimate_gravity_and_tilt(x, y, z, fs)

    # Optional heading from magnetometer if available
    heading = estimate_orientation_heading(float(np.mean(gx)), float(np.mean(gy)), float(np.mean(gz)),
                                           mag_x, mag_y, mag_z)

    # Dynamic motion component along each axis (subtract gravity)
    dyn_x = x - gx
    dyn_y = y - gy
    dyn_z = z - gz

    # Bandpass filter each axis
    filt_x = filter_single_axis(dyn_x, fs)
    filt_y = filter_single_axis(dyn_y, fs)
    filt_z = filter_single_axis(dyn_z, fs)

    # Combined movement intensity using Accel + Gyro
    movement_sig, combined_rms, gyro_rms = extract_combined_movement_intensity(x, y, z, gyro_x, gyro_y, gyro_z, fs)

    # Posture transition check
    is_transition, delta_tilt = detect_posture_transition(gx, gy, gz, gyro_x, gyro_y, gyro_z, fs)

    return {
        "tilt_deg": tilt_deg,
        "heading_deg": heading,
        "is_transition": is_transition,
        "delta_tilt_deg": delta_tilt,
        "motion_rms": combined_rms,
        "gyro_rms": gyro_rms,
        "movement_signal": movement_sig,
        "filtered_x": filt_x,
        "filtered_y": filt_y,
        "filtered_z": filt_z,
        "dynamic_x": dyn_x,
        "dynamic_y": dyn_y,
        "dynamic_z": dyn_z,
        "gravity_z": gz,
    }
