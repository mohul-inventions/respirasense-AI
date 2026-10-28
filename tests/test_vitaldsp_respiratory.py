"""
Unit tests for VitalDSP-assisted respiratory signal processing.

File: tests/test_vitaldsp_respiratory.py
Tests:
- Accelerometer validation and NaN repair
- Strictly accelerometer-based motion assessment (rest, walking, posture change, excessive motion)
- PCA respiratory axis extraction
- Dual estimator agreement & SQI scoring
- Insufficient signal quality rejection under walking and excessive movement
- Zero gyroscope dependency verification
"""

import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.preprocessing.vitaldsp_respiratory import (
    validate_and_resample_accelerometer,
    assess_accelerometer_motion,
    extract_respiratory_pca,
    denoise_respiratory_waveform,
    estimate_independent_respiratory_rate,
    compute_vitaldsp_sqi,
    VitalDSPRespiratoryProcessor,
    VitalDSPRespiratoryResult
)


class TestVitalDSPRespiratory(unittest.TestCase):

    def setUp(self):
        np.random.seed(42)
        self.fs = 50.0
        self.duration = 10.0  # seconds
        self.n_samples = int(self.fs * self.duration)
        self.t = np.linspace(0, self.duration, self.n_samples)
        self.processor = VitalDSPRespiratoryProcessor(target_fs=50.0)

    def test_validate_and_resample_clean(self):
        """Clean uniform data passes through without distortion."""
        x = np.sin(2 * np.pi * 0.25 * self.t)
        y = np.zeros_like(x)
        z = np.full_like(x, 9.81)

        t_res, x_res, y_res, z_res = validate_and_resample_accelerometer(self.t, x, y, z, target_fs=self.fs)
        self.assertEqual(len(x_res), self.n_samples)
        self.assertAlmostEqual(float(x_res[0]), float(x[0]), places=4)

    def test_validate_and_resample_nans(self):
        """Sparse NaNs/Infs are cleanly interpolated."""
        x = np.sin(2 * np.pi * 0.25 * self.t)
        x[10] = np.nan
        x[50] = np.inf
        y = np.zeros_like(x)
        z = np.full_like(x, 9.81)

        t_res, x_res, y_res, z_res = validate_and_resample_accelerometer(self.t, x, y, z, target_fs=self.fs)
        self.assertFalse(np.isnan(x_res).any())
        self.assertFalse(np.isinf(x_res).any())

    def test_validate_and_resample_excessive_nans(self):
        """Excessive NaNs (>35%) raise a ValueError."""
        x = np.full(self.n_samples, np.nan)
        y = np.zeros(self.n_samples)
        z = np.zeros(self.n_samples)

        with self.assertRaises(ValueError):
            validate_and_resample_accelerometer(self.t, x, y, z, target_fs=self.fs)

    def test_assess_motion_rest(self):
        """Resting subject with small breathing-related movement has low dynamic RMS and jerk."""
        # Simulated small chest expansion on Z axis + baseline gravity
        x = np.random.normal(0, 0.02, self.n_samples)
        y = np.random.normal(0, 0.02, self.n_samples)
        z = 9.81 + 0.15 * np.sin(2 * np.pi * 0.25 * self.t) + np.random.normal(0, 0.02, self.n_samples)

        res = assess_accelerometer_motion(x, y, z, fs=self.fs)
        self.assertEqual(res["motion_state"], "REST")
        self.assertLess(res["dynamic_rms"], 0.35)
        self.assertLess(res["jerk_metric"], 15.0)

    def test_assess_motion_walking(self):
        """Periodic stepping at 2.0 Hz with elevated amplitude is classified as WALKING_MOTION."""
        # Stepping cadence: 2.0 Hz (120 steps/min), dynamic amplitude 1.2 m/s^2
        cadence_wave = 1.2 * np.sin(2 * np.pi * 2.0 * self.t)
        x = 0.5 * cadence_wave + np.random.normal(0, 0.05, self.n_samples)
        y = 0.3 * cadence_wave + np.random.normal(0, 0.05, self.n_samples)
        z = 9.81 + cadence_wave + np.random.normal(0, 0.05, self.n_samples)

        res = assess_accelerometer_motion(x, y, z, fs=self.fs)
        self.assertEqual(res["motion_state"], "WALKING_MOTION")
        self.assertIsNotNone(res["cadence_freq_hz"])
        self.assertAlmostEqual(res["cadence_freq_hz"], 2.0, delta=0.3)
        self.assertGreater(res["cadence_power_ratio"], 0.35)

    def test_assess_motion_posture_change(self):
        """Abrupt orientation change (phone rotated by 35 degrees) is classified as POSTURE_CHANGE."""
        # Initial: phone flat (Z = 9.81, Y = 0.0)
        # End: phone tilted (Z = 7.0, Y = 6.8)
        half = self.n_samples // 2
        x = np.zeros(self.n_samples)
        y = np.concatenate([np.zeros(half), np.full(self.n_samples - half, 6.8)])
        z = np.concatenate([np.full(half, 9.81), np.full(self.n_samples - half, 7.0)])

        res = assess_accelerometer_motion(x, y, z, fs=self.fs)
        self.assertEqual(res["motion_state"], "POSTURE_CHANGE")
        self.assertGreater(res["delta_tilt_deg"], 15.0)

    def test_assess_motion_excessive(self):
        """High-amplitude random vibration is classified as EXCESSIVE_MOTION."""
        x = np.random.normal(0, 2.5, self.n_samples)
        y = np.random.normal(0, 2.5, self.n_samples)
        z = 9.81 + np.random.normal(0, 2.5, self.n_samples)

        res = assess_accelerometer_motion(x, y, z, fs=self.fs)
        self.assertEqual(res["motion_state"], "EXCESSIVE_MOTION")
        self.assertGreater(res["dynamic_rms"], 1.5)

    def test_extract_respiratory_pca(self):
        """PCA correctly isolates dominant breathing component from multi-axis data."""
        # 16 BPM breathing = 0.267 Hz on Z axis, subtle on Y, noise on X
        resp_16bpm = 0.25 * np.sin(2 * np.pi * 0.267 * self.t)
        x = np.random.normal(0, 0.02, self.n_samples)
        y = 0.05 * resp_16bpm + np.random.normal(0, 0.02, self.n_samples)
        z = 9.81 + resp_16bpm + np.random.normal(0, 0.02, self.n_samples)

        best_sig, axis_name, var_exp, scores = extract_respiratory_pca(x, y, z, fs=self.fs)
        self.assertIn("PCA_", axis_name)
        self.assertGreater(scores[axis_name], 0.2)
        self.assertEqual(len(var_exp), 3)

    def test_clean_breathing_pipeline(self):
        """End-to-end test on clean 15.0 BPM (0.25 Hz) breathing yields accurate rate and RELIABLE status."""
        resp_signal = 0.3 * np.sin(2 * np.pi * 0.25 * self.t)
        x = np.random.normal(0, 0.01, self.n_samples)
        y = np.random.normal(0, 0.01, self.n_samples)
        z = 9.81 + resp_signal + np.random.normal(0, 0.01, self.n_samples)

        result: VitalDSPRespiratoryResult = self.processor.process(x, y, z, timestamps=self.t, fs=self.fs)

        self.assertEqual(result.status, "RELIABLE")
        self.assertIsNone(result.rejection_reason)
        self.assertIsNotNone(result.respiratory_rate_bpm)
        self.assertAlmostEqual(result.respiratory_rate_bpm, 15.0, delta=1.5)
        self.assertGreater(result.confidence, 0.50)
        self.assertGreaterEqual(result.sqi, 0.60)
        self.assertEqual(result.motion_state, "REST")

    def test_walking_rejection(self):
        """Walking corrupts accelerometer; result must be INSUFFICIENT_QUALITY with rate None."""
        cadence_wave = 1.5 * np.sin(2 * np.pi * 2.0 * self.t)
        x = 0.6 * cadence_wave
        y = 0.4 * cadence_wave
        z = 9.81 + cadence_wave

        result = self.processor.process(x, y, z, timestamps=self.t, fs=self.fs)

        self.assertEqual(result.status, "INSUFFICIENT_QUALITY")
        self.assertIsNone(result.respiratory_rate_bpm)
        self.assertIn("Walking motion", result.rejection_reason)
        self.assertEqual(result.motion_state, "WALKING_MOTION")

    def test_excessive_motion_rejection(self):
        """Excessive motion must be rejected with INSUFFICIENT_QUALITY."""
        x = np.random.normal(0, 3.0, self.n_samples)
        y = np.random.normal(0, 3.0, self.n_samples)
        z = 9.81 + np.random.normal(0, 3.0, self.n_samples)

        result = self.processor.process(x, y, z, timestamps=self.t, fs=self.fs)

        self.assertEqual(result.status, "INSUFFICIENT_QUALITY")
        self.assertIsNone(result.respiratory_rate_bpm)
        self.assertIn("Excessive body acceleration", result.rejection_reason)

    def test_flatline_rejection(self):
        """Stationary sensor with no motion or breathing returns insufficient quality."""
        x = np.zeros(self.n_samples)
        y = np.zeros(self.n_samples)
        z = np.full(self.n_samples, 9.81)

        result = self.processor.process(x, y, z, timestamps=self.t, fs=self.fs)

        self.assertEqual(result.status, "INSUFFICIENT_QUALITY")
        self.assertIsNone(result.respiratory_rate_bpm)

    def test_zero_gyroscope_dependency(self):
        """Processor requires ONLY x, y, z accelerometer arrays with no gyro parameters."""
        x = np.sin(2 * np.pi * 0.3 * self.t)
        y = np.zeros_like(x)
        z = np.full_like(x, 9.81)

        # Calling process without any gyro inputs works cleanly
        result = self.processor.process(x, y, z, fs=self.fs)
        self.assertIsInstance(result, VitalDSPRespiratoryResult)


if __name__ == '__main__':
    unittest.main()
