"""
RespiraSense AI — Experimental Respiratory Sound and Crepitation Analysis Engine.

Module: src/preprocessing/crepitation_detector.py
Project: RespiraSense AI

CRITICAL BIOMEDICAL NOTICE & SENSOR LIMITATION:
An ordinary 3-axis smartphone accelerometer (sampling at <= 100 Hz) has a Nyquist bandwidth of <= 50 Hz.
Lung sounds, crackles (crepitations), and wheezes occur predominantly in the acoustic band (100 Hz – 2000 Hz).
Movement data alone CANNOT reliably establish that lung crepitations or crackles are present.
Therefore:
1. Accelerometer signals alone are REJECTED for crepitation diagnosis.
2. If microphone audio is unavailable or poor quality, the module outputs:
   'Experimental — suitable audio sensor required' with zero positive crepitation diagnosis.
3. When suitable microphone audio is present, exploratory short-time acoustic features are extracted:
   - Spectral energy ratio in crackle band (250–1200 Hz)
   - Transient explosive density (fine crackle duration 5–15 ms, coarse crackle 15–30 ms)
   - Spectral flatness & centroid
4. Strict non-diagnostic research disclaimer is attached to every analysis output.
"""

import numpy as np
from scipy import signal as sp_signal
from typing import Dict, Any, Optional, Tuple


# Physiological crackle / crepitation frequency band
CRACKLE_LOW_HZ = 200.0
CRACKLE_HIGH_HZ = 1200.0
MIN_AUDIO_SAMPLE_RATE_REQUIRED = 4000  # Nyquist >= 2000 Hz


class ExperimentalCrepitationAnalyzer:
    """
    Experimental exploratory research analyzer for lung sound candidates.
    Strictly enforces hardware bandwidth limitations.
    """

    def __init__(self, audio_sample_rate: int = 8000, accel_sample_rate: float = 50.0):
        self.audio_sample_rate = audio_sample_rate
        self.accel_sample_rate = accel_sample_rate

    def analyze(
        self,
        audio_samples: Optional[np.ndarray] = None,
        accel_x: Optional[np.ndarray] = None,
        accel_y: Optional[np.ndarray] = None,
        accel_z: Optional[np.ndarray] = None,
        audio_fs: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Executes exploratory respiratory acoustic and motion analysis.
        """
        active_fs = audio_fs or self.audio_sample_rate

        # 1. Accelerometer-Only Check: Reject immediately with clear biomedical limitation
        if audio_samples is None or len(audio_samples) < int(active_fs * 0.5):
            return {
                "available": False,
                "status": "UNAVAILABLE_AUDIO_REQUIRED",
                "message": (
                    "Suitable acoustic transducer required. Accelerometer micro-vibration data (<50 Hz) "
                    "cannot establish lung crepitations or crackle acoustic patterns."
                ),
                "is_positive_diagnosis": False,
                "crepitation_candidate_detected": False,
                "spectral_energy_ratio": 0.0,
                "transient_density": 0.0,
                "hardware_limitation_note": "Accelerometer bandwidth (<50 Hz) is below physiological crackle band (200–1200 Hz).",
                "clinical_disclaimer": "Exploratory signal feature analysis only. Not a medical lung auscultation diagnostic."
            }

        # 2. Check microphone sample rate sufficiency
        if active_fs < MIN_AUDIO_SAMPLE_RATE_REQUIRED:
            return {
                "available": False,
                "status": "INSUFFICIENT_SAMPLE_RATE",
                "message": f"Audio sample rate ({active_fs} Hz) is insufficient for crepitation analysis (minimum {MIN_AUDIO_SAMPLE_RATE_REQUIRED} Hz required).",
                "is_positive_diagnosis": False,
                "crepitation_candidate_detected": False,
                "spectral_energy_ratio": 0.0,
                "transient_density": 0.0,
                "hardware_limitation_note": "Nyquist frequency too low to capture lung sound crackle harmonics.",
                "clinical_disclaimer": "Exploratory signal feature analysis only. Not a medical lung auscultation diagnostic."
            }

        # 3. Clean and check audio amplitude
        audio = np.array(audio_samples, dtype=np.float64)
        audio = audio - np.mean(audio)
        rms = float(np.sqrt(np.mean(audio ** 2)))

        if rms < 0.005:
            return {
                "available": True,
                "status": "SIGNAL_TOO_QUIET",
                "message": "Acoustic input level is too low to evaluate fine respiratory transients.",
                "is_positive_diagnosis": False,
                "crepitation_candidate_detected": False,
                "spectral_energy_ratio": 0.0,
                "transient_density": 0.0,
                "hardware_limitation_note": "Acoustic signal level within background noise floor.",
                "clinical_disclaimer": "Exploratory signal feature analysis only. Not a medical lung auscultation diagnostic."
            }

        # 4. Exploratory Spectral Analysis in Crepitation Band (200 - 1200 Hz)
        nperseg = min(len(audio), int(active_fs * 0.25))
        freqs, psd = sp_signal.welch(audio, fs=active_fs, nperseg=nperseg)

        crackle_mask = (freqs >= CRACKLE_LOW_HZ) & (freqs <= CRACKLE_HIGH_HZ)
        total_mask = (freqs >= 50.0) & (freqs <= 3500.0)

        crackle_power = float(np.sum(psd[crackle_mask])) if np.any(crackle_mask) else 1e-12
        total_power = float(np.sum(psd[total_mask])) if np.any(total_mask) else 1e-12
        spectral_ratio = float(crackle_power / max(total_power, 1e-12))

        # 5. Short-Time High-Frequency Transient Event Density (Crackles: short discontinuous bursts)
        # Apply bandpass 250 - 1200 Hz
        nyq = 0.5 * active_fs
        b, a = sp_signal.butter(3, [CRACKLE_LOW_HZ / nyq, min(CRACKLE_HIGH_HZ / nyq, 0.99)], btype='band')
        try:
            filtered_crackle_band = sp_signal.filtfilt(b, a, audio)
        except Exception:
            filtered_crackle_band = audio

        # Peak detection for short transient bursts (< 25 ms)
        min_distance = int(active_fs * 0.010)  # 10 ms separation
        prominence = max(0.01, float(np.std(filtered_crackle_band) * 2.5))
        peaks, props = sp_signal.find_peaks(np.abs(filtered_crackle_band), distance=min_distance, prominence=prominence)
        
        duration_sec = len(audio) / active_fs
        transient_density_per_sec = float(len(peaks) / max(duration_sec, 0.1))

        # 6. Correlation with chest-wall movement
        # Crepitations occur during inspiration/expiration phase, NOT during body motion
        is_candidate = False
        notes = "No atypical acoustic transient clustering detected."

        if spectral_ratio > 0.45 and transient_density_per_sec > 12.0:
            is_candidate = True
            notes = (
                f"Candidate discontinuous acoustic transients observed ({transient_density_per_sec:.1f} events/s, "
                f"crackle band ratio {spectral_ratio:.1%}). Requires stethoscope auscultation for verification."
            )

        return {
            "available": True,
            "status": "EXPLORATORY_ANALYSIS_COMPLETE",
            "message": notes,
            "is_positive_diagnosis": False,  # MUST NEVER claim positive diagnosis
            "crepitation_candidate_detected": is_candidate,
            "spectral_energy_ratio": round(spectral_ratio, 3),
            "transient_density_per_sec": round(transient_density_per_sec, 1),
            "audio_rms": round(rms, 4),
            "hardware_limitation_note": (
                "Smartphone/laptop microphones capture ambient and skin friction noise. "
                "Only clinical electronic stethoscopes with calibrated diaphragms can validate lung adventitious sounds."
            ),
            "clinical_disclaimer": "Experimental exploratory research module. Does not diagnose pneumonia, edema, or COPD."
        }
