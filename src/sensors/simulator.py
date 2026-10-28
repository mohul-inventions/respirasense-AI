"""
Multi-scenario realistic respiratory data simulator.
Used for controlled testing, unit tests, and demonstrative validation.
Clearly flags all generated data with `is_synthetic=True`.
Includes multi-axis accelerometer, gyroscope, optional magnetometer, and acoustic channels.
"""

import numpy as np
import time
from typing import Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config
from src.sensors.phone_stream import SensorFrame


class RespirationSimulator:
    """
    Generates synthetic multi-sensor respiratory data with ground truth.
    Scenarios include resting, walking, speaking, coughing, posture transitions,
    and respiratory deterioration (tachypnea).
    """

    def __init__(self, sample_rate: int = None, scenarios: list = None):
        self.sample_rate = sample_rate or config.SAMPLE_RATE_ACCEL
        self.scenarios = scenarios or config.SIMULATE_SCENARIOS
        self._build_full_signal()
        self.playback_pos = 0
        self.start_time = time.time()
        self.connected = True
        self.last_status_message = "Simulator Running"
        self.last_error = None

    def _build_full_signal(self):
        """Pre-build the full simulation timeline with multi-axis motion and acoustics."""
        all_t = []
        all_x, all_y, all_z = [], [], []
        all_gx, all_gy, all_gz = [], [], []
        all_mx, all_my, all_mz = [], [], []
        all_audio = []
        all_labels = []
        all_true_br = []

        cur_t = 0.0

        for scenario in self.scenarios:
            duration = scenario.get("duration", 30)
            n_samples = int(duration * self.sample_rate)
            t = np.linspace(0, duration, n_samples, endpoint=False)
            time_axis = cur_t + t
            cur_t += duration

            br = scenario.get("br", 15.0)
            noise_level = scenario.get("noise", 0.05)
            name = scenario.get("name", "resting")
            freq = br / 60.0  # Hz

            # Baseline gravity vector (e.g. phone standing upright against chest: Z forward, Y upright)
            grav_x = 0.0
            grav_y = 9.4
            grav_z = 2.8

            # Respiratory chest displacement (primarily along anterior-posterior Z axis, some Y)
            resp_z = 0.25 * np.sin(2 * np.pi * freq * t)
            resp_y = 0.08 * np.sin(2 * np.pi * freq * t + 0.2)
            resp_x = 0.02 * np.sin(2 * np.pi * freq * t + 0.4)

            # Synthetic acoustic sound envelope (microphone)
            audio_mod = 0.18 * (np.abs(np.sin(2 * np.pi * freq * t))) ** 2
            mic_noise = 0.02 * np.random.randn(n_samples)
            audio_channel = audio_mod + mic_noise

            # Gyroscope baseline
            gx = 0.01 * np.random.randn(n_samples)
            gy = 0.01 * np.random.randn(n_samples)
            gz = 0.01 * np.random.randn(n_samples)

            # Optional Magnetometer baseline (Earth's magnetic field ~ 45 microteslas)
            mx = 20.0 + 0.1 * np.random.randn(n_samples)
            my = -15.0 + 0.1 * np.random.randn(n_samples)
            mz = 35.0 + 0.1 * np.random.randn(n_samples)

            acc_x = grav_x + resp_x + noise_level * np.random.randn(n_samples)
            acc_y = grav_y + resp_y + noise_level * np.random.randn(n_samples)
            acc_z = grav_z + resp_z + noise_level * np.random.randn(n_samples)

            if name == "resting":
                pass  # Clean baseline

            elif name == "walking":
                step_freq = 1.85
                acc_z += noise_level * 0.9 * np.sin(2 * np.pi * step_freq * t)
                acc_y += noise_level * 1.4 * np.sin(2 * np.pi * step_freq * t + 0.5)
                acc_x += noise_level * 0.6 * np.sin(2 * np.pi * (step_freq / 2) * t)
                gy += 0.3 * np.sin(2 * np.pi * step_freq * t)
                audio_channel += 0.04 * np.abs(np.sin(2 * np.pi * step_freq * t))

            elif name == "speaking":
                audio_channel += noise_level * np.abs(np.sin(2 * np.pi * 5.0 * t)) * (np.sin(2 * np.pi * 0.8 * t) > 0)
                acc_z += 0.04 * np.random.randn(n_samples)

            elif name == "coughing":
                for _ in range(max(1, int(duration / 5))):
                    idx = np.random.randint(10, n_samples - 20)
                    acc_z[idx:idx+15] += noise_level * 3.5
                    acc_y[idx:idx+15] += noise_level * 2.5
                    audio_channel[idx:idx+15] += noise_level * 4.0
                    gx[idx:idx+15] += 0.5

            elif name == "posture_transition":
                tilt = np.linspace(0, 1, n_samples)
                acc_y = (1 - tilt) * grav_y + tilt * 2.0
                acc_z = (1 - tilt) * grav_z + tilt * 9.2
                gx += 0.8 * np.sin(np.pi * tilt)

            elif name == "deterioration":
                shallow_resp = 0.10 * np.sin(2 * np.pi * freq * t)
                acc_z = grav_z + shallow_resp + 0.02 * np.random.randn(n_samples)
                audio_channel = 0.07 * (np.abs(np.sin(2 * np.pi * freq * t))) ** 2

            all_t.append(time_axis)
            all_x.append(acc_x)
            all_y.append(acc_y)
            all_z.append(acc_z)
            all_gx.append(gx)
            all_gy.append(gy)
            all_gz.append(gz)
            all_mx.append(mx)
            all_my.append(my)
            all_mz.append(mz)
            all_audio.append(audio_channel)
            all_labels.extend([name] * n_samples)
            all_true_br.extend([br] * n_samples)

        self.full_t = np.concatenate(all_t)
        self.full_x = np.concatenate(all_x)
        self.full_y = np.concatenate(all_y)
        self.full_z = np.concatenate(all_z)
        self.full_gx = np.concatenate(all_gx)
        self.full_gy = np.concatenate(all_gy)
        self.full_gz = np.concatenate(all_gz)
        self.full_mx = np.concatenate(all_mx)
        self.full_my = np.concatenate(all_my)
        self.full_mz = np.concatenate(all_mz)
        self.full_audio = np.concatenate(all_audio)
        self.full_labels = all_labels
        self.full_true_br = all_true_br

        self.total_samples = len(self.full_z)
        self.total_duration = self.total_samples / self.sample_rate

    def get_frame(self, duration_sec: float = None) -> Optional[SensorFrame]:
        duration_sec = duration_sec or config.WINDOW_DURATION
        n_samples = int(duration_sec * self.sample_rate)

        if self.playback_pos >= self.total_samples:
            self.playback_pos = 0

        end = min(self.playback_pos + n_samples, self.total_samples)
        sl = slice(self.playback_pos, end)

        frame = SensorFrame(
            timestamp=time.time(),
            time_vector=self.full_t[sl],
            accel_x=self.full_x[sl],
            accel_y=self.full_y[sl],
            accel_z=self.full_z[sl],
            gyro_x=self.full_gx[sl],
            gyro_y=self.full_gy[sl],
            gyro_z=self.full_gz[sl],
            mag_x=self.full_mx[sl],
            mag_y=self.full_my[sl],
            mag_z=self.full_mz[sl],
            audio_samples=self.full_audio[sl],
            audio_sample_rate=config.SAMPLE_RATE_AUDIO,
            audio_source_type="synthetic_audio",
            activity_label=self.full_labels[self.playback_pos],
            true_br=float(self.full_true_br[self.playback_pos]),
            is_synthetic=True,
            measured_sample_rate=float(self.sample_rate),
            missing_samples_count=0,
            is_saturated=False,
            saturation_flags={"x": False, "y": False, "z": False},
            has_gyro=True,
            has_mag=True,
            has_audio=True,
        )
        self.playback_pos = end
        return frame

    def reset(self):
        self.playback_pos = 0
        self.start_time = time.time()
