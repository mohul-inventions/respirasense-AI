"""
Adaptive multi-channel fusion engine with simple baseline comparison.

Integrates:
- 3 independent motion axes: X, Y, Z
- Gyroscope & optional Magnetometer heading data
- Acoustic channel (if available) with noise gating
- Activity state & posture transition context
- Signal Quality Index (SQI)
- Simple baseline benchmark (unweighted naive averaging of all axes)
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import config
from src.preprocessing.filters import process_three_axis_motion
from src.preprocessing.acoustics import AcousticAnalyzer
from src.quality.sqi import compute_axis_sqi
from src.quality.activity_classifier import ActivityClassifier
from src.fusion.breathing_rate import estimate_channel_br
from src.sensors.phone_stream import SensorFrame
from src.preprocessing.vitaldsp_respiratory import VitalDSPRespiratoryProcessor, VitalDSPRespiratoryResult


@dataclass
class FusionOutput:
    # Final adaptive respiratory rate (None if quality insufficient)
    fused_br_bpm: Optional[float]
    confidence: float
    status: str             # "RELIABLE", "DEGRADED", "INSUFFICIENT_QUALITY"
    rejection_reason: Optional[str]
    
    # Simple baseline comparison (unweighted naive average of available axes without SQI rejection)
    baseline_br_bpm: Optional[float]
    
    # Activity and movement context
    activity: str
    activity_confidence: float
    activity_reason: str
    is_posture_transition: bool
    motion_rms: float
    gyro_rms: float
    tilt_deg: float
    heading_deg: Optional[float]
    
    # Multi-axis quality and weights
    weights: Dict[str, float]
    sqi_scores: Dict[str, float]
    channel_br: Dict[str, Optional[float]]
    
    # Detailed diagnostic breakdown
    axis_diagnostics: Dict[str, Any]
    acoustic_diagnostics: Dict[str, Any]
    is_synthetic: bool
    data_source_description: str
    sensor_availability: Dict[str, bool] = field(default_factory=dict)
    vitaldsp_diagnostics: Dict[str, Any] = field(default_factory=dict)


class AdaptiveFusionEngine:
    """
    Adaptive fusion engine evaluating 3-axis motion and acoustics against a naive baseline.
    """

    def __init__(self, fs: float = 50.0):
        self.fs = fs
        self.activity_classifier = ActivityClassifier(fs)
        self.acoustic_analyzer = AcousticAnalyzer()
        self.vitaldsp_processor = VitalDSPRespiratoryProcessor(target_fs=fs)
        self.history = []

    def process_frame(self, frame: SensorFrame) -> FusionOutput:
        """
        Processes a standardized SensorFrame and returns structured FusionOutput.
        """
        fs = frame.measured_sample_rate if frame.measured_sample_rate > 10 else self.fs

        # 1. Process 3-axis motion with Gyro & optional Magnetometer
        motion_res = process_three_axis_motion(
            frame.accel_x, frame.accel_y, frame.accel_z,
            gyro_x=frame.gyro_x, gyro_y=frame.gyro_y, gyro_z=frame.gyro_z,
            mag_x=frame.mag_x, mag_y=frame.mag_y, mag_z=frame.mag_z,
            fs=fs
        )

        # 1b. VitalDSP-assisted multi-axis processing & motion assessment
        vitaldsp_res = self.vitaldsp_processor.process(
            frame.accel_x, frame.accel_y, frame.accel_z,
            timestamps=frame.time_vector,
            fs=fs
        )

        filt_x = motion_res["filtered_x"]
        filt_y = motion_res["filtered_y"]
        filt_z = motion_res["filtered_z"]
        motion_rms = motion_res["motion_rms"]
        gyro_rms = motion_res["gyro_rms"]
        is_trans = motion_res["is_transition"]
        delta_tilt = motion_res["delta_tilt_deg"]
        tilt_deg = motion_res["tilt_deg"]
        heading_deg = motion_res["heading_deg"]

        # 2. Process acoustic samples (if available) with optional noise gating
        acoustic_res = self.acoustic_analyzer.process_audio(
            frame.audio_samples, fs=config.SAMPLE_RATE_AUDIO, enable_noise_gate=True
        )

        # 3. Classify activity
        activity_res = self.activity_classifier.classify(
            frame.accel_x, frame.accel_y, frame.accel_z,
            motion_rms=motion_rms,
            is_transition=is_trans,
            delta_tilt=delta_tilt,
            movement_sig=motion_res["movement_signal"],
            acoustic_info=acoustic_res,
            current_time=frame.timestamp,
        )
        activity = activity_res["activity"]
        act_conf = activity_res["confidence"]
        act_reason = activity_res["reason"]

        if vitaldsp_res.motion_state == "WALKING_MOTION":
            activity = "walking"
            act_conf = max(act_conf, 0.88)
            act_reason = f"Walking cadence {vitaldsp_res.cadence_freq_hz} Hz ({vitaldsp_res.cadence_power_ratio:.0%} cadence energy)"
        elif vitaldsp_res.motion_state == "POSTURE_CHANGE":
            is_trans = True

        # 4. Compute independent SQI for each axis
        sqi_x_res = compute_axis_sqi(filt_x, motion_res["dynamic_x"], motion_rms,
                                     frame.saturation_flags.get("x", False),
                                     frame.missing_samples_count, fs)
        sqi_y_res = compute_axis_sqi(filt_y, motion_res["dynamic_y"], motion_rms,
                                     frame.saturation_flags.get("y", False),
                                     frame.missing_samples_count, fs)
        sqi_z_res = compute_axis_sqi(filt_z, motion_res["dynamic_z"], motion_rms,
                                     frame.saturation_flags.get("z", False),
                                     frame.missing_samples_count, fs)

        sqi_x = sqi_x_res["sqi"]
        sqi_y = sqi_y_res["sqi"]
        sqi_z = sqi_z_res["sqi"]
        sqi_audio = acoustic_res.get("sqi_acoustic", 0.0) if acoustic_res.get("available", False) else 0.0

        # 5. Estimate breathing rate independently on each channel
        br_x_res = estimate_channel_br(filt_x, fs)
        br_y_res = estimate_channel_br(filt_y, fs)
        br_z_res = estimate_channel_br(filt_z, fs)

        br_audio_res = {"br_bpm": None, "confidence": 0.0}
        if acoustic_res.get("available", False) and len(acoustic_res.get("envelope", [])) > 0:
            env = acoustic_res["envelope"]
            step = max(1, int(config.SAMPLE_RATE_AUDIO / fs))
            sub_env = env[::step]
            br_audio_res = estimate_channel_br(sub_env, fs)

        channel_br = {
            "x": br_x_res.get("br_bpm"),
            "y": br_y_res.get("br_bpm"),
            "z": br_z_res.get("br_bpm"),
            "audio": br_audio_res.get("br_bpm"),
        }

        # Calculate Naive Baseline (Unweighted average of all axes, ignoring SQI)
        valid_rates = [v for v in [channel_br["z"], channel_br["y"], channel_br["x"]] if v is not None]
        naive_baseline_br = round(float(np.mean(valid_rates)), 1) if valid_rates else None

        # 6. Adaptive Channel Weighting
        base_w = {"x": 0.15, "y": 0.25, "z": 0.60, "audio": 0.0}
        if acoustic_res.get("available", False):
            base_w = {"x": 0.10, "y": 0.20, "z": 0.45, "audio": 0.25}

        raw_w_x = base_w["x"] * (sqi_x ** 1.5) * max(0.1, br_x_res.get("confidence", 0.0))
        raw_w_y = base_w["y"] * (sqi_y ** 1.5) * max(0.1, br_y_res.get("confidence", 0.0))
        raw_w_z = base_w["z"] * (sqi_z ** 1.5) * max(0.1, br_z_res.get("confidence", 0.0))
        raw_w_audio = base_w["audio"] * (sqi_audio ** 1.5) * max(0.1, br_audio_res.get("confidence", 0.0))

        # Rejection & Safeguards Check (Evaluated in strict logical hierarchy)
        rejection_reason = None
        fused_bpm = None
        status = "RELIABLE"
        max_sqi = max(sqi_x, sqi_y, sqi_z, sqi_audio, vitaldsp_res.sqi)

        # Check 0: VitalDSP walking or excessive motion rejection (strictly accelerometer-based)
        if vitaldsp_res.motion_state == "WALKING_MOTION":
            rejection_reason = vitaldsp_res.rejection_reason or f"Walking motion artifact detected (cadence {vitaldsp_res.cadence_freq_hz} Hz)"
            status = "INSUFFICIENT_QUALITY"
        elif vitaldsp_res.motion_state == "EXCESSIVE_MOTION":
            rejection_reason = vitaldsp_res.rejection_reason or f"Excessive body acceleration / jerk (dynamic RMS: {vitaldsp_res.dynamic_rms:.2f} m/s²)"
            status = "INSUFFICIENT_QUALITY"

        # Check 1: Sensor saturation / hardware clipping
        elif frame.is_saturated:
            rejection_reason = "Sensor saturation / clipping detected"
            status = "INSUFFICIENT_QUALITY"

        # Check 2: Posture transition active
        elif is_trans or activity == "posture_transition":
            rejection_reason = "Suspended during posture transition (movement artifact)"
            status = "INSUFFICIENT_QUALITY"

        # Check 3: Heavy movement or coughing
        elif activity in ["walking", "general_movement"] and motion_rms > 0.8:
            rejection_reason = f"Excessive body movement (RMS: {motion_rms:.2f} m/s²)"
            status = "INSUFFICIENT_QUALITY"

        # Check 4: Overall signal quality
        elif max_sqi < config.SQI_POOR_THRESHOLD:
            rejection_reason = f"Insufficient signal quality (Max SQI: {max_sqi:.2f} < {config.SQI_POOR_THRESHOLD})"
            status = "INSUFFICIENT_QUALITY"

        # 7. Normalize weights and fuse if viable
        tot_w = raw_w_x + raw_w_y + raw_w_z + raw_w_audio

        if tot_w > 1e-6:
            norm_w = {
                "x": round(raw_w_x / tot_w, 3),
                "y": round(raw_w_y / tot_w, 3),
                "z": round(raw_w_z / tot_w, 3),
                "audio": round(raw_w_audio / tot_w, 3),
            }
        else:
            norm_w = {"x": 0.0, "y": 0.0, "z": 0.0, "audio": 0.0}

        if status != "INSUFFICIENT_QUALITY" and tot_w > 0.02:
            usable_val = 0.0
            usable_w = 0.0
            
            for ch in ["z", "y", "x", "audio"]:
                val = channel_br[ch]
                w = norm_w[ch]
                if val is not None and w > 0.05:
                    usable_val += val * w
                    usable_w += w

            if usable_w > 0.15:
                axis_fused = usable_val / usable_w
                if vitaldsp_res.respiratory_rate_bpm is not None and vitaldsp_res.status in ("RELIABLE", "DEGRADED"):
                    if norm_w.get("audio", 0) > 0.15 and channel_br.get("audio"):
                        fused_bpm = round(0.75 * vitaldsp_res.respiratory_rate_bpm + 0.25 * channel_br["audio"], 1)
                    else:
                        fused_bpm = round(0.70 * vitaldsp_res.respiratory_rate_bpm + 0.30 * axis_fused, 1)
                else:
                    fused_bpm = round(axis_fused, 1)
                
                # Check confidence status
                if max_sqi >= config.SQI_GOOD_THRESHOLD and motion_rms < config.MOTION_RMS_REST * 1.5 and vitaldsp_res.status != "INSUFFICIENT_QUALITY":
                    status = "RELIABLE"
                else:
                    status = "DEGRADED"
            else:
                status = "INSUFFICIENT_QUALITY"
                rejection_reason = "No candidate channel met minimum confidence threshold"
                fused_bpm = None
        else:
            fused_bpm = None
            if not rejection_reason:
                rejection_reason = "Total channel confidence below minimum threshold"
            status = "INSUFFICIENT_QUALITY"

        # Overall confidence
        confidence = float(np.clip(max_sqi * (1.0 - min(motion_rms, 1.0) * 0.5), 0.0, 1.0))
        if status == "INSUFFICIENT_QUALITY":
            confidence = min(confidence, 0.25)

        source_desc = "Synthetic Generator (Demo Ground Truth)" if frame.is_synthetic else "Live Phyphox Streaming (Phone)"

        output = FusionOutput(
            fused_br_bpm=fused_bpm,
            confidence=round(confidence, 3),
            status=status,
            rejection_reason=rejection_reason,
            baseline_br_bpm=naive_baseline_br,
            activity=activity,
            activity_confidence=act_conf,
            activity_reason=act_reason,
            is_posture_transition=is_trans,
            motion_rms=round(motion_rms, 4),
            gyro_rms=round(gyro_rms, 4),
            tilt_deg=round(tilt_deg, 1),
            heading_deg=heading_deg,
            weights=norm_w,
            sqi_scores={"x": sqi_x, "y": sqi_y, "z": sqi_z, "audio": sqi_audio},
            channel_br=channel_br,
            axis_diagnostics={
                "sqi_x_details": sqi_x_res,
                "sqi_y_details": sqi_y_res,
                "sqi_z_details": sqi_z_res,
                "delta_tilt_deg": round(delta_tilt, 1),
                "filtered_x": filt_x,
                "filtered_y": filt_y,
                "filtered_z": filt_z,
                "movement_signal": motion_res["movement_signal"],
                "peak_indices_z": br_z_res.get("peak_indices", []),
                "raw_sensor_sample_rate": frame.raw_sensor_sample_rate,
                "measured_sample_rate": frame.measured_sample_rate,
                "missing_samples_count": frame.missing_samples_count,
            },
            acoustic_diagnostics=acoustic_res,
            is_synthetic=frame.is_synthetic,
            data_source_description=source_desc,
            sensor_availability={
                "accel": True,
                "gyro": getattr(frame, "has_gyro", False),
                "mag": getattr(frame, "has_mag", False),
                "audio": getattr(frame, "has_audio", False),
                "bioimpedance": False,
            },
            vitaldsp_diagnostics={
                "available": True,
                "rate_bpm": vitaldsp_res.respiratory_rate_bpm,
                "confidence": vitaldsp_res.confidence,
                "status": vitaldsp_res.status,
                "rejection_reason": vitaldsp_res.rejection_reason,
                "motion_state": vitaldsp_res.motion_state,
                "dynamic_rms": vitaldsp_res.dynamic_rms,
                "hf_motion_rms": vitaldsp_res.hf_motion_rms,
                "jerk_metric": vitaldsp_res.jerk_metric,
                "cadence_freq_hz": vitaldsp_res.cadence_freq_hz,
                "cadence_power_ratio": vitaldsp_res.cadence_power_ratio,
                "selected_axis": vitaldsp_res.selected_axis,
                "pca_variance_explained": vitaldsp_res.pca_variance_explained,
                "axis_quality_scores": vitaldsp_res.axis_quality_scores,
                "sqi": vitaldsp_res.sqi,
                "sqi_breakdown": vitaldsp_res.sqi_breakdown,
                "primary_rate_bpm": vitaldsp_res.primary_rate_bpm,
                "primary_method": vitaldsp_res.primary_method,
                "secondary_rate_bpm": vitaldsp_res.secondary_rate_bpm,
                "secondary_method": vitaldsp_res.secondary_method,
                "discrepancy_bpm": vitaldsp_res.method_discrepancy_bpm,
                "agreement_score": vitaldsp_res.agreement_score,
            },
        )

        self.history.append(output)
        return output
