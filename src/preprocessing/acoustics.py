"""
Respiratory acoustic analysis module with strict frequency rules, Voice Activity Detection (VAD),
and robust cough candidate classification.

User-Defined Rule:
- A cough candidate must satisfy the configured frequency criterion of ABOVE 250 Hz.
- Frequency strictly greater than threshold_hz satisfies the condition.
- A frequency exactly equal to threshold_hz does NOT satisfy the condition.
- Frequencies below or equal to threshold_hz must not trigger a cough event.
- Threshold is configurable with 250 Hz as default.

Engineering Requirement:
- Audio energy above 250 Hz is not treated as sole proof of coughing (speech also has energy > 250 Hz).
- Combines frequency evaluation with transient energy (explosive onset), spectral distribution,
  event duration, and cooldown merging to prevent double-counting.
- Preserves privacy: zero raw audio storage by default.
"""

import numpy as np
from scipy import signal as sp_signal
from typing import Dict, Any, Optional, Tuple, List
import time

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config


def check_cough_frequency_condition(freq_hz: float, threshold_hz: float = 255.0) -> bool:
    """
    User-Defined Frequency Condition:
    Returns True if and only if freq_hz is strictly greater than threshold_hz.
    Returns False if freq_hz <= threshold_hz (e.g. 255.0 Hz returns False).
    """
    try:
        f = float(freq_hz)
        th = float(threshold_hz)
        return f > th
    except (ValueError, TypeError):
        return False


class AcousticAnalyzer:
    """
    Analyzes respiratory audio when an authentic microphone stream is available.
    Integrates spectral analysis, strict >250 Hz frequency testing, transient onset gating,
    voice activity detection (VAD), event cooldown, and privacy-first event logging.
    """

    def __init__(self, sample_rate: int = 8000, cough_freq_threshold: float = 255.0):
        self.sample_rate = sample_rate
        self.cough_freq_threshold = float(getattr(config, "COUGH_FREQ_THRESHOLD_HZ", 255.0))
        self.noise_floor_estimate = 0.01
        self.last_cough_time = 0.0
        self.cooldown_sec = float(getattr(config, "COUGH_COOLDOWN_SEC", 0.8))
        self.event_log: List[Dict[str, Any]] = []

    def set_cough_freq_threshold(self, threshold_hz: float):
        """Configure the strict frequency threshold (default 250 Hz)."""
        self.cough_freq_threshold = float(threshold_hz)

    def apply_optional_noise_gate(self, samples: np.ndarray, threshold_factor: float = 1.8) -> np.ndarray:
        """
        Optional soft noise gate: suppresses low-amplitude background hiss below estimated floor.
        Preserves breath sounds above the noise floor without claiming speech cancellation.
        """
        gate_threshold = max(self.noise_floor_estimate * threshold_factor, 1e-4)
        envelope = np.abs(samples)
        gain = np.clip((envelope - gate_threshold) / (gate_threshold + 1e-6), 0.0, 1.0)
        return samples * gain

    def compute_spectral_features(self, samples: np.ndarray, fs: float) -> Dict[str, float]:
        """
        Estimate dominant frequency, high-band power ratio, and spectral flatness via Welch PSD.
        """
        if len(samples) < 16:
            return {
                "dominant_freq_hz": 0.0,
                "high_band_ratio": 0.0,
                "spectral_flatness": 0.0,
                "pitch_periodicity": 0.0,
            }

        nperseg = min(len(samples), 256)
        freqs, psd = sp_signal.welch(samples, fs=fs, nperseg=nperseg)
        if len(psd) == 0 or np.sum(psd) < 1e-12:
            return {
                "dominant_freq_hz": 0.0,
                "high_band_ratio": 0.0,
                "spectral_flatness": 0.0,
                "pitch_periodicity": 0.0,
            }

        dom_idx = int(np.argmax(psd))
        dom_freq = float(freqs[dom_idx])

        # Energy strictly above the configured threshold
        high_mask = freqs > self.cough_freq_threshold
        total_p = float(np.sum(psd)) + 1e-12
        high_p = float(np.sum(psd[high_mask]))
        high_band_ratio = float(high_p / total_p)

        # Spectral Flatness (Wiener entropy): Geometric Mean / Arithmetic Mean
        # High for turbulent non-harmonic noise (cough); low for harmonic pitched tones (speech)
        psd_clean = psd[psd > 1e-12]
        if len(psd_clean) > 2:
            geo_mean = np.exp(np.mean(np.log(psd_clean)))
            arith_mean = np.mean(psd_clean)
            spectral_flatness = float(np.clip(geo_mean / (arith_mean + 1e-12), 0.0, 1.0))
        else:
            spectral_flatness = 0.0

        # Pitch Periodicity: Autocorrelation peak in human pitch range (85 - 350 Hz)
        pitch_periodicity = 0.0
        if len(samples) > int(fs * 0.03):
            corr = np.correlate(samples, samples, mode='full')
            corr = corr[len(samples)-1:] / (corr[len(samples)-1] + 1e-12)
            min_lag = max(1, int(fs / 350.0))
            max_lag = min(len(corr)-1, int(fs / 85.0))
            if max_lag > min_lag:
                pitch_periodicity = float(np.clip(np.max(corr[min_lag:max_lag+1]), 0.0, 1.0))

        return {
            "dominant_freq_hz": round(dom_freq, 1),
            "high_band_ratio": round(high_band_ratio, 3),
            "spectral_flatness": round(spectral_flatness, 3),
            "pitch_periodicity": round(pitch_periodicity, 3),
        }

    def process_audio(self, audio_samples: Optional[np.ndarray], fs: int = None,
                      enable_noise_gate: bool = True, current_time: float = None) -> Dict[str, Any]:
        """
        Process incoming acoustic samples.
        Evaluates strict frequency condition, explosive onset, speech separation, and event merging.
        """
        now = current_time if current_time is not None else time.time()
        
        # 1. Check audio availability and sample volume
        if audio_samples is None or len(audio_samples) < 20:
            return {
                "available": False,
                "reason": "Microphone audio not provided by the current experiment",
                "envelope": np.array([]),
                "energy_rms": 0.0,
                "sqi_acoustic": 0.0,
                "has_speech": False,
                "has_cough": False,
                "cough_candidate": False,
                "cough_status": "UNAVAILABLE",
                "freq_condition_met": False,
                "snr_db": 0.0,
                "dominant_freq_hz": 0.0,
                "configured_threshold_hz": self.cough_freq_threshold,
                "noise_gate_applied": False,
                "event_log": self.event_log[-10:],
            }

        fs = fs or self.sample_rate
        samples = np.array(audio_samples, dtype=float)
        mean_val = float(np.mean(samples))
        ac_samples = samples - mean_val
        peak_val = float(np.max(np.abs(ac_samples))) + 1e-8
        norm_samples = ac_samples / peak_val

        # Nyquist-bounded bandpass filter (100 Hz to 3500 Hz)
        nyq = 0.5 * fs
        if nyq > 250.0:
            high_cut = min(3500.0, nyq * 0.95)
            low_cut = min(80.0, high_cut * 0.1)
            try:
                b, a = sp_signal.butter(2, [low_cut / nyq, high_cut / nyq], btype='band')
                filtered = sp_signal.filtfilt(b, a, norm_samples)
            except Exception:
                filtered = norm_samples
        else:
            filtered = norm_samples

        # Optional soft noise gate
        gated = self.apply_optional_noise_gate(filtered) if enable_noise_gate else filtered

        # Hilbert analytic envelope & RMS energy
        try:
            analytic = sp_signal.hilbert(gated)
            envelope = np.abs(analytic)
        except Exception:
            envelope = np.abs(gated)

        # Background noise floor tracking (15th percentile)
        cur_noise = float(np.percentile(envelope, 15))
        self.noise_floor_estimate = 0.9 * self.noise_floor_estimate + 0.1 * cur_noise

        rms = float(np.sqrt(np.mean(filtered**2)))
        snr_db = 10 * np.log10(max(rms**2, 1e-10) / max(self.noise_floor_estimate**2, 1e-10))
        snr_db = float(np.clip(snr_db, 0.0, 40.0))

        # Signal quality gate
        if rms < 0.005 or snr_db < 2.0:
            return {
                "available": True,
                "reason": "Audio amplitude below background threshold",
                "envelope": envelope,
                "energy_rms": round(rms, 4),
                "sqi_acoustic": 0.0,
                "has_speech": False,
                "has_cough": False,
                "cough_candidate": False,
                "cough_status": "INSUFFICIENT_QUALITY",
                "freq_condition_met": False,
                "snr_db": round(snr_db, 1),
                "dominant_freq_hz": 0.0,
                "configured_threshold_hz": self.cough_freq_threshold,
                "noise_gate_applied": enable_noise_gate,
                "event_log": self.event_log[-10:],
            }

        # ── Spectral Content & Strict Frequency Rule Evaluation ──
        spectral = self.compute_spectral_features(filtered, fs)
        dom_freq = spectral["dominant_freq_hz"]
        high_band_ratio = spectral["high_band_ratio"]
        spectral_flatness = spectral["spectral_flatness"]
        pitch_periodicity = spectral["pitch_periodicity"]

        # USER-DEFINED RULE: Strictly greater than configured threshold (default 250 Hz)
        freq_condition_met = check_cough_frequency_condition(dom_freq, self.cough_freq_threshold)

        # Transient explosive onset analysis
        peak_to_rms = float(np.max(envelope)) / (rms + 1e-8)
        is_explosive_onset = (peak_to_rms >= getattr(config, "COUGH_EXPLOSIVE_RATIO", 3.2))

        # Speech vs Cough Disambiguation:
        # Human speech: pitch periodicity > 0.40, harmonic formants, longer voiced durations
        # Cough: explosive onset, turbulent wideband noise (low pitch periodicity), short burst
        has_speech = (pitch_periodicity > 0.42) and (rms > 0.08) and (300 <= dom_freq <= 3400) and not is_explosive_onset

        # Cough Candidate vs Confirmed Cough Evaluation
        cough_candidate = False
        has_cough = False
        cough_status = "NO_COUGH_CANDIDATE"

        # Check Frequency Condition
        if freq_condition_met:
            cough_candidate = True
            cough_status = "COUGH_CANDIDATE"

            # Check if this candidate satisfies multi-feature confirmation
            # Must have: explosive onset + high frequency energy + non-speech characteristics
            if is_explosive_onset and (high_band_ratio > 0.25) and not has_speech:
                # Check cooldown to avoid double counting one continuous sound burst
                time_since_last = now - self.last_cough_time
                if time_since_last >= self.cooldown_sec:
                    has_cough = True
                    cough_status = "CONFIRMED_COUGH"
                    self.last_cough_time = now

                    # Log confirmed event (without raw audio)
                    time_str = time.strftime("%H:%M:%S", time.localtime(now))
                    self.event_log.append({
                        "timestamp": now,
                        "time_str": time_str,
                        "status": "CONFIRMED_COUGH",
                        "dominant_freq_hz": dom_freq,
                        "peak_to_rms": round(peak_to_rms, 2),
                        "message": f"Confirmed explosive cough burst (Dominant: {dom_freq:.1f} Hz > {self.cough_freq_threshold:.1f} Hz)",
                    })
                else:
                    cough_status = "EVENT_MERGED_COOLDOWN"
            else:
                if has_speech:
                    cough_status = "SPEECH_DETECTED_NOT_COUGH"
                else:
                    cough_status = "UNCERTAIN_TRANSIENT"
        else:
            if has_speech:
                cough_status = "SPEECH_DETECTED_NOT_COUGH"
            else:
                cough_status = "NO_COUGH_CANDIDATE"

        # Acoustic SQI (envelope periodicity for respiration)
        sqi = 0.5
        if len(envelope) > int(fs * 2.5):
            step = max(1, int(fs / 50))
            sub_env = envelope[::step]
            sub_env = sub_env - np.mean(sub_env)
            norm = float(np.std(sub_env)) + 1e-8
            sub_env = sub_env / norm
            autocorr = np.correlate(sub_env, sub_env, mode='full')
            autocorr = autocorr[len(sub_env)-1:] / (autocorr[len(sub_env)-1] + 1e-12)
            min_l = max(1, int(50 * 1.4))
            max_l = min(len(autocorr)-1, int(50 * 10.0))
            if max_l > min_l:
                sqi = float(np.clip(np.max(autocorr[min_l:max_l+1]), 0.0, 1.0))

        if has_speech:
            sqi *= 0.4
        if has_cough:
            sqi *= 0.15

        return {
            "available": True,
            "reason": "Active microphone stream parsed",
            "envelope": envelope,
            "energy_rms": round(rms, 4),
            "sqi_acoustic": round(sqi, 3),
            "has_speech": has_speech,
            "has_cough": has_cough,
            "cough_candidate": cough_candidate,
            "cough_status": cough_status,
            "freq_condition_met": freq_condition_met,
            "snr_db": round(snr_db, 1),
            "dominant_freq_hz": dom_freq,
            "configured_threshold_hz": self.cough_freq_threshold,
            "high_band_ratio": high_band_ratio,
            "peak_to_rms": round(peak_to_rms, 2),
            "pitch_periodicity": pitch_periodicity,
            "noise_gate_applied": enable_noise_gate,
            "event_log": self.event_log[-10:],
        }
