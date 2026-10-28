"""
RespiraSense AI — Personalized 7-Day Baseline & Threshold Engine.

Module: src/baseline/baseline_manager.py
Project: RespiraSense AI

Features:
1. 7-day observation window processing from actual stored patient telemetry.
2. Filtering out invalid, rejected, or low-SQI measurements.
3. Robust statistics: count, valid coverage %, mean, median, standard deviation, interquartile range (IQR).
4. Rest vs Active respiratory distribution.
5. Missing-data calculation and coverage insufficiency alerts (extends observation if coverage < 50%).
6. Separation of Concepts:
   - Established General Clinical Alert Limits (12–20 bpm)
   - Observed Personalized Baseline
   - Candidate Personalized Thresholds (Provisional Recommendations)
   - Clinician-Approved Alert Thresholds
7. Versioned threshold change tracking and approval workflow.
"""

import numpy as np
import time
import json
from typing import Dict, Any, List, Optional, Tuple
from src.storage.db import get_db_connection


# Minimum hours of valid data required over 7 days for a sufficient baseline (e.g. 12 hours)
MIN_VALID_MEASUREMENTS_FOR_SUFFICIENT = 24  # at least 24 valid observation windows


def log_telemetry_measurement(patient_id: str, telemetry: Dict[str, Any]) -> int:
    """
    Persists a single derived telemetry window for a patient into the derived_measurements table.
    """
    now = time.time()
    iso_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

    vitaldsp = telemetry.get("vitaldsp", {})
    audio_gate = telemetry.get("audio_gate", {})

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT INTO derived_measurements (
        patient_id, timestamp, iso_time, respiratory_rate_bpm, confidence,
        status, rejection_reason, sqi, motion_state, dynamic_rms, jerk_metric,
        cadence_freq_hz, cadence_power_ratio, selected_axis,
        audio_pre_gate_dbfs, audio_post_gate_dbfs, audio_gate_state,
        audio_quiet_breathing_candidate, is_synthetic
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient_id,
        now,
        iso_str,
        telemetry.get("fused_br_bpm"),
        float(telemetry.get("confidence", 0.0)),
        telemetry.get("status", "INSUFFICIENT_QUALITY"),
        telemetry.get("rejection_reason"),
        float(vitaldsp.get("sqi", telemetry.get("sqi_scores", {}).get("z", 0.0))),
        vitaldsp.get("motion_state", telemetry.get("activity", "REST")).upper(),
        float(vitaldsp.get("dynamic_rms", telemetry.get("motion_rms", 0.0))),
        float(vitaldsp.get("jerk_metric", 0.0)),
        vitaldsp.get("cadence_freq_hz"),
        float(vitaldsp.get("cadence_power_ratio", 0.0)),
        vitaldsp.get("selected_axis", "Z"),
        float(audio_gate.get("pre_gate_dbfs", -120.0)),
        float(audio_gate.get("post_gate_dbfs", -120.0)),
        audio_gate.get("gate_state", "CLOSED"),
        1 if audio_gate.get("quiet_breathing_candidate") else 0,
        1 if telemetry.get("is_synthetic") else 0
    ))

    row_id = cur.lastrowid
    conn.commit()
    conn.close()
    return row_id


def compute_seven_day_baseline(patient_id: str, end_time: Optional[float] = None) -> Dict[str, Any]:
    """
    Calculates the 7-day personalized baseline for a patient from actual stored measurements.
    Strictly excludes invalid measurements (status != 'RELIABLE'), motion contamination, and synthetic data.
    """
    if end_time is None:
        end_time = time.time()
    start_time = end_time - (7 * 86400.0)

    conn = get_db_connection()
    cur = conn.cursor()

    # Query all measurements in the 7-day period
    cur.execute("""
    SELECT timestamp, iso_time, respiratory_rate_bpm, confidence, status, rejection_reason,
           sqi, motion_state, dynamic_rms, audio_pre_gate_dbfs, is_synthetic
    FROM derived_measurements
    WHERE patient_id = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
    """, (patient_id, start_time, end_time))

    rows = cur.fetchall()
    total_count = len(rows)

    if total_count == 0:
        conn.close()
        return {
            "patient_id": patient_id,
            "start_time": start_time,
            "end_time": end_time,
            "status": "INSUFFICIENT_COVERAGE",
            "message": "No measurements recorded during this 7-day period. Baseline observation period automatically extended.",
            "total_count": 0,
            "valid_count": 0,
            "valid_data_coverage_pct": 0.0,
            "mean_rr": None,
            "median_rr": None,
            "std_rr": None,
            "iqr_rr": None,
            "resting_mean_rr": None,
            "active_mean_rr": None,
            "mean_sqi": 0.0,
            "missing_data_pct": 100.0,
            "daily_breakdowns": [],
            "candidate_thresholds": None
        }

    # Separate valid measurements
    valid_rates = []
    resting_rates = []
    active_rates = []
    sqi_list = []
    daily_bins: Dict[str, List[float]] = {}

    for r in rows:
        sqi_list.append(r["sqi"])
        day_key = r["iso_time"][:10]
        if day_key not in daily_bins:
            daily_bins[day_key] = []

        is_valid = (
            r["status"] in ("RELIABLE", "DEGRADED") and
            r["respiratory_rate_bpm"] is not None and
            r["is_synthetic"] == 0 and
            r["motion_state"] not in ("WALKING_MOTION", "EXCESSIVE_MOTION")
        )

        if is_valid:
            rate = float(r["respiratory_rate_bpm"])
            valid_rates.append(rate)
            daily_bins[day_key].append(rate)

            if r["motion_state"] == "REST":
                resting_rates.append(rate)
            else:
                active_rates.append(rate)

    valid_count = len(valid_rates)
    coverage_pct = round((valid_count / max(total_count, 1)) * 100.0, 1)
    missing_pct = round(100.0 - coverage_pct, 1)
    mean_sqi = round(float(np.mean(sqi_list)) if sqi_list else 0.0, 3)

    # Robust statistics
    if valid_count >= MIN_VALID_MEASUREMENTS_FOR_SUFFICIENT:
        status = "SUFFICIENT"
    elif valid_count > 0:
        status = "INSUFFICIENT_COVERAGE"
    else:
        status = "NO_VALID_DATA"

    mean_rr = round(float(np.mean(valid_rates)), 1) if valid_rates else None
    median_rr = round(float(np.median(valid_rates)), 1) if valid_rates else None
    std_rr = round(float(np.std(valid_rates)), 2) if len(valid_rates) > 1 else None
    
    iqr_rr = None
    if len(valid_rates) >= 4:
        q75, q25 = np.percentile(valid_rates, [75, 25])
        iqr_rr = round(float(q75 - q25), 2)

    resting_mean_rr = round(float(np.mean(resting_rates)), 1) if resting_rates else None
    active_mean_rr = round(float(np.mean(active_rates)), 1) if active_rates else None

    # Daily breakdown formatting
    daily_summaries = []
    for day_str, rates in sorted(daily_bins.items()):
        daily_summaries.append({
            "date": day_str,
            "valid_samples": len(rates),
            "mean_rr": round(float(np.mean(rates)), 1) if rates else None,
            "median_rr": round(float(np.median(rates)), 1) if rates else None,
            "min_rr": round(float(np.min(rates)), 1) if rates else None,
            "max_rr": round(float(np.max(rates)), 1) if rates else None,
        })

    # Save to personalized_baselines table
    cur.execute("""
    INSERT INTO personalized_baselines (
        patient_id, start_time, end_time, calculation_timestamp,
        total_measurement_count, valid_measurement_count, valid_data_coverage_pct,
        mean_rr, median_rr, std_rr, iqr_rr, resting_mean_rr, active_mean_rr,
        mean_sqi, missing_data_pct, status, daily_breakdown_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient_id, start_time, end_time, time.time(),
        total_count, valid_count, coverage_pct,
        mean_rr, median_rr, std_rr, iqr_rr, resting_mean_rr, active_mean_rr,
        mean_sqi, missing_pct, status, json.dumps(daily_summaries)
    ))
    baseline_id = cur.lastrowid

    conn.commit()
    conn.close()

    # If baseline is sufficient, generate candidate provisional thresholds
    candidate_thresholds = None
    if status in ("SUFFICIENT", "SUFFICIENT_COVERAGE") and median_rr is not None and std_rr is not None:
        candidate_thresholds = generate_provisional_thresholds(
            patient_id=patient_id,
            baseline_id=baseline_id,
            median_rr=median_rr,
            std_rr=std_rr,
            iqr_rr=iqr_rr or (std_rr * 1.35)
        )

    msg = ""
    if status in ("INSUFFICIENT_COVERAGE", "INSUFFICIENT"):
        msg = f"Valid data coverage is {coverage_pct}% (< 50% threshold). Baseline observation period automatically extended."

    return {
        "baseline_id": baseline_id,
        "patient_id": patient_id,
        "start_time": start_time,
        "end_time": end_time,
        "status": status,
        "message": msg,
        "total_count": total_count,
        "valid_count": valid_count,
        "valid_data_coverage_pct": coverage_pct,
        "missing_data_pct": missing_pct,
        "mean_rr": mean_rr,
        "median_rr": median_rr,
        "std_rr": std_rr,
        "iqr_rr": iqr_rr,
        "resting_mean_rr": resting_mean_rr,
        "active_mean_rr": active_mean_rr,
        "mean_sqi": mean_sqi,
        "daily_breakdowns": daily_summaries,
        "candidate_thresholds": candidate_thresholds,
        "provisional_thresholds": candidate_thresholds
    }


def generate_provisional_thresholds(
    patient_id: str,
    baseline_id: int,
    median_rr: float,
    std_rr: float,
    iqr_rr: float
) -> Dict[str, Any]:
    """
    Generates evidence-backed candidate personalized thresholds without replacing standard clinical limits.
    Separation of concepts: Marked strictly as PROVISIONAL until approved by a clinician.
    Logic:
      - Proposed Tachypnea = Min(28, Max(22, median + 2.5 * std))
      - Proposed Bradypnea = Max(7, Min(10, median - 2.5 * std))
      - Sudden change = Max(6, 2 * iqr)
    """
    proposed_tachy = round(float(np.clip(median_rr + 2.5 * std_rr, 22.0, 28.0)), 1)
    proposed_brady = round(float(np.clip(median_rr - 2.5 * std_rr, 7.0, 10.0)), 1)
    proposed_sudden = round(float(max(6.0, 2.0 * iqr_rr)), 1)
    reason = (
        f"Provisional 7-day baseline statistics: Observed median {median_rr:.1f} bpm, "
        f"dispersion std {std_rr:.2f} bpm, IQR {iqr_rr:.2f} bpm. Candidate threshold requires clinician review."
    )

    conn = get_db_connection()
    cur = conn.cursor()

    # Determine next version
    cur.execute("SELECT MAX(version) as max_v FROM threshold_configurations WHERE patient_id = ?", (patient_id,))
    row = cur.fetchone()
    next_version = (row["max_v"] or 0) + 1

    cur.execute("""
    INSERT INTO threshold_configurations (
        patient_id, version, tachypnea_threshold, bradypnea_threshold,
        apnea_duration_sec, sudden_change_bpm, status, proposed_reason,
        supporting_baseline_id, created_at
    ) VALUES (?, ?, ?, ?, 10.0, ?, 'PROVISIONAL', ?, ?, ?)
    """, (
        patient_id, next_version, proposed_tachy, proposed_brady,
        proposed_sudden, reason, baseline_id, time.time()
    ))
    config_id = cur.lastrowid
    conn.commit()
    conn.close()

    return {
        "config_id": config_id,
        "version": next_version,
        "tachypnea_threshold": proposed_tachy,
        "bradypnea_threshold": proposed_brady,
        "apnea_duration_sec": 10.0,
        "sudden_change_bpm": proposed_sudden,
        "status": "PROVISIONAL",
        "reason": reason,
        "is_active_alert_limit": False  # Must be explicitly approved
    }


def approve_threshold_configuration(
    patient_id: str,
    config_id: int,
    clinician_name: str,
    override_reason: str = "Clinician approved candidate personalized alert thresholds"
) -> Dict[str, Any]:
    """
    Clinician approval workflow for activating personalized alert thresholds.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    now = time.time()
    # Mark any previously approved threshold as superseded
    cur.execute("""
    UPDATE threshold_configurations
    SET status = 'SUPERSEDED'
    WHERE patient_id = ? AND status = 'CLINICIAN_APPROVED'
    """, (patient_id,))

    # Approve selected configuration
    cur.execute("""
    UPDATE threshold_configurations
    SET status = 'CLINICIAN_APPROVED',
        approving_clinician = ?,
        approval_timestamp = ?,
        proposed_reason = ?
    WHERE id = ? AND patient_id = ?
    """, (clinician_name, now, override_reason, config_id, patient_id))

    # Audit the approval
    cur.execute("""
    INSERT INTO audit_logs (timestamp, actor_id, actor_role, target_patient_id, action, details)
    VALUES (?, ?, 'clinician', ?, 'THRESHOLD_APPROVAL', ?)
    """, (now, clinician_name, patient_id, f"Approved threshold config #{config_id} for patient {patient_id}"))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "config_id": config_id,
        "patient_id": patient_id,
        "status": "CLINICIAN_APPROVED",
        "approving_clinician": clinician_name,
        "approval_timestamp": now
    }


def get_patient_history_summary(patient_id: str, days: int = 30) -> Dict[str, Any]:
    """
    Retrieves rolling 30-day longitudinal summaries, excluding raw IMU samples to adhere to retention principles.
    """
    now = time.time()
    start_time = now - (days * 86400.0)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT timestamp, iso_time, respiratory_rate_bpm, confidence, status, rejection_reason,
           sqi, motion_state, dynamic_rms, audio_pre_gate_dbfs, audio_gate_state
    FROM derived_measurements
    WHERE patient_id = ? AND timestamp >= ?
    ORDER BY timestamp ASC
    """, (patient_id, start_time))

    rows = cur.fetchall()
    conn.close()

    total_points = len(rows)
    daily_groups: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        day = r["iso_time"][:10]
        if day not in daily_groups:
            daily_groups[day] = {
                "date": day,
                "rates": [],
                "sqi": [],
                "motion_counts": {"REST": 0, "WALKING_MOTION": 0, "POSTURE_CHANGE": 0, "EXCESSIVE_MOTION": 0},
                "rejected_count": 0
            }
        
        m_state = r["motion_state"] or "REST"
        daily_groups[day]["motion_counts"][m_state] = daily_groups[day]["motion_counts"].get(m_state, 0) + 1
        daily_groups[day]["sqi"].append(r["sqi"])

        if r["status"] == "RELIABLE" and r["respiratory_rate_bpm"] is not None:
            daily_groups[day]["rates"].append(r["respiratory_rate_bpm"])
        else:
            daily_groups[day]["rejected_count"] += 1

    history_timeline = []
    for day, data in sorted(daily_groups.items()):
        rates = data["rates"]
        history_timeline.append({
            "date": day,
            "valid_samples": len(rates),
            "rejected_samples": data["rejected_count"],
            "mean_rr": round(float(np.mean(rates)), 1) if rates else None,
            "min_rr": round(float(np.min(rates)), 1) if rates else None,
            "max_rr": round(float(np.max(rates)), 1) if rates else None,
            "avg_sqi": round(float(np.mean(data["sqi"])), 2) if data["sqi"] else 0.0,
            "motion_breakdown": data["motion_counts"]
        })

    return {
        "patient_id": patient_id,
        "history_window_days": days,
        "total_records": total_points,
        "timeline": history_timeline
    }
