"""
RespiraSense AI — Patient Platform, Baseline, PDF Reports, Export & Crepitation Test Suite.

File: tests/test_patient_platform.py
Project: RespiraSense AI
"""

import unittest
import os
import time
import numpy as np
import tempfile
import sqlite3

from src.storage.db import init_database, get_db_connection
from src.auth.auth_manager import (
    register_patient, authenticate_user, validate_session, logout_session,
    authorize_patient_access, validate_password_strength, hash_password, verify_password
)
from src.baseline.baseline_manager import (
    log_telemetry_measurement, compute_seven_day_baseline,
    approve_threshold_configuration, get_patient_history_summary
)
from src.reports.pdf_generator import generate_patient_pdf_report
from src.export.hospital_export import (
    prepare_hospital_export, authorize_and_transmit_export, request_emergency_access
)
from src.preprocessing.crepitation_detector import (
    ExperimentalCrepitationAnalyzer, CRACKLE_LOW_HZ, CRACKLE_HIGH_HZ
)
from src.preprocessing.audio_gate import AudioNoiseGate
import config


class TestPatientPlatform(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_database()

    def setUp(self):
        self.test_patient_data = {
            "full_name": "Test Subject Alpha",
            "dob": "1990-04-12",
            "sex": "FEMALE",
            "height_cm": 168.0,
            "weight_kg": 60.5,
            "medical_context": "Mild asthma history, post-viral follow up",
            "hospital_clinic": "St. Jude Pulmonary Lab",
            "treating_clinician": "Dr. House, MD",
            "password": "StrongPassword2026!"
        }

    def tearDown(self):
        pass

    # ─────────────────────────────────────────────────────────────
    # 1. AUTHENTICATION & PATIENT ISOLATION TESTS
    # ─────────────────────────────────────────────────────────────

    def test_password_strength_validation(self):
        # Too short
        ok, msg = validate_password_strength("Short1!")
        self.assertFalse(ok)
        # No digit
        ok, msg = validate_password_strength("NoDigitsHere!")
        self.assertFalse(ok)
        # No uppercase
        ok, msg = validate_password_strength("lowercase123!")
        self.assertFalse(ok)
        # Valid
        ok, msg = validate_password_strength("ValidMedPass2026!")
        self.assertTrue(ok)

    def test_pbkdf2_hash_and_verification(self):
        pwd = "SecureHospitalPassword99!"
        pwd_hash, salt = hash_password(pwd)
        self.assertTrue(verify_password(pwd, pwd_hash, salt))
        self.assertFalse(verify_password("WrongPassword!", pwd_hash, salt))

    def test_patient_registration_and_authentication(self):
        reg_res = register_patient(self.test_patient_data)
        self.assertTrue(reg_res["success"])
        patient_id = reg_res["patient_id"]
        self.assertTrue(patient_id.startswith("RS-"))

        # Authenticate by Patient ID
        auth_res = authenticate_user(patient_id, "StrongPassword2026!")
        self.assertTrue(auth_res["success"])
        self.assertIn("token", auth_res)
        token = auth_res["token"]

        # Validate Session
        sess = validate_session(token)
        self.assertIsNotNone(sess)
        self.assertEqual(sess["patient_id"], patient_id)

        # Logout
        self.assertTrue(logout_session(token))
        self.assertIsNone(validate_session(token))

    def test_invalid_login_rejection(self):
        with self.assertRaises(PermissionError):
            authenticate_user("NonExistentPatient", "AnyPassword123!")

    def test_patient_isolation_boundary_enforcement(self):
        p1 = register_patient({
            "full_name": "Patient Isolation One",
            "dob": "1992-01-01",
            "password": "PasswordOne2026!"
        })
        p2 = register_patient({
            "full_name": "Patient Isolation Two",
            "dob": "1994-02-02",
            "password": "PasswordTwo2026!"
        })

        session_p1 = {"patient_id": p1["patient_id"], "role": "patient"}

        # P1 accessing P1 records -> Allowed
        authorize_patient_access(session_p1, p1["patient_id"])

        # P1 attempting to access P2 records -> Denied
        with self.assertRaises(PermissionError):
            authorize_patient_access(session_p1, p2["patient_id"])

        # Clinician accessing P2 records -> Allowed
        session_clinician = {"patient_id": "CLINICIAN-01", "role": "clinician"}
        authorize_patient_access(session_clinician, p2["patient_id"])

    # ─────────────────────────────────────────────────────────────
    # 2. 7-DAY BASELINE & THRESHOLD ENGINE TESTS
    # ─────────────────────────────────────────────────────────────

    def test_seven_day_baseline_statistics_and_coverage(self):
        p = register_patient({
            "full_name": "Baseline Test Patient",
            "dob": "1988-11-20",
            "password": "BaselinePass2026!"
        })
        pid = p["patient_id"]

        # Log 30 valid resting observations (15 to 17 bpm)
        for i in range(30):
            telemetry = {
                "fused_br_bpm": 15.0 + (i % 3) * 0.5,
                "confidence": 0.85,
                "status": "RELIABLE",
                "rejection_reason": None,
                "sqi_scores": {"sqi": 0.88},
                "activity": "resting",
                "motion_rms": 0.04,
                "is_synthetic": False
            }
            log_telemetry_measurement(pid, telemetry)

        # Also inject an invalid walking frame to test exclusion
        walking_telemetry = {
            "fused_br_bpm": 28.0,
            "confidence": 0.20,
            "status": "INSUFFICIENT_QUALITY",
            "rejection_reason": "Excessive cadence harmonics",
            "sqi_scores": {"sqi": 0.15},
            "activity": "walking",
            "motion_rms": 1.25,
            "is_synthetic": False
        }
        log_telemetry_measurement(pid, walking_telemetry)

        # Compute 7-day baseline
        baseline = compute_seven_day_baseline(pid)
        self.assertIn(baseline["status"], ("SUFFICIENT", "SUFFICIENT_COVERAGE"))
        self.assertGreater(baseline["valid_count"], 0)
        self.assertAlmostEqual(baseline["median_rr"], 15.5, delta=1.0)
        self.assertIsNotNone(baseline["iqr_rr"])
        self.assertIsNotNone(baseline["candidate_thresholds"])

        # Verify candidate provisional limits are separated from clinical standard
        cand = baseline["candidate_thresholds"]
        self.assertIn("tachypnea_threshold", cand)
        self.assertIn("bradypnea_threshold", cand)
        self.assertEqual(cand["status"], "PROVISIONAL")

        # Approve thresholds
        approved = approve_threshold_configuration(pid, cand["config_id"], "Dr. House, MD")
        self.assertTrue(approved["success"])
        self.assertEqual(approved["status"], "CLINICIAN_APPROVED")

    def test_insufficient_coverage_baseline_handling(self):
        p = register_patient({
            "full_name": "Low Coverage Patient",
            "dob": "1995-05-05",
            "password": "LowCoverage2026!"
        })
        pid = p["patient_id"]

        # Only 2 measurements logged (< 24 required windows)
        for _ in range(2):
            log_telemetry_measurement(pid, {
                "fused_br_bpm": 16.0,
                "confidence": 0.8,
                "status": "RELIABLE",
                "activity": "resting",
                "is_synthetic": False
            })

        baseline = compute_seven_day_baseline(pid)
        self.assertEqual(baseline["status"], "INSUFFICIENT_COVERAGE")
        self.assertIn("Baseline observation period automatically extended", baseline["message"])

    def test_30_day_longitudinal_summary_minimization(self):
        p = register_patient({
            "full_name": "Longitudinal Patient",
            "dob": "1978-08-18",
            "password": "Longitudinal2026!"
        })
        pid = p["patient_id"]

        log_telemetry_measurement(pid, {
            "fused_br_bpm": 14.8,
            "confidence": 0.85,
            "status": "RELIABLE",
            "activity": "resting",
            "is_synthetic": False
        })

        hist = get_patient_history_summary(pid, days=30)
        self.assertEqual(hist["patient_id"], pid)
        self.assertEqual(hist["history_window_days"], 30)
        self.assertGreater(len(hist["timeline"]), 0)
        # Verify no raw IMU points exist in timeline
        for day in hist["timeline"]:
            self.assertNotIn("accel_x", day)
            self.assertNotIn("accel_z", day)
            self.assertIn("valid_samples", day)

    # ─────────────────────────────────────────────────────────────
    # 3. REPORTLAB MEDICAL PDF GENERATION TESTS
    # ─────────────────────────────────────────────────────────────

    def test_medical_pdf_report_generation_and_checksum(self):
        p = register_patient({
            "full_name": "Report Subject Beta",
            "dob": "1982-03-30",
            "hospital_clinic": "Mount Sinai Respiratory Center",
            "treating_clinician": "Dr. Sarah Chen, MD",
            "password": "ReportPassword2026!"
        })
        pid = p["patient_id"]

        # Add sample measurements so report has tables
        for _ in range(5):
            log_telemetry_measurement(pid, {
                "fused_br_bpm": 16.2,
                "confidence": 0.82,
                "status": "RELIABLE",
                "activity": "resting",
                "is_synthetic": False
            })

        report_meta = generate_patient_pdf_report(
            patient_id=pid,
            report_type="SEVEN_DAY_BASELINE",
            clinician_notes="Stable recovery with resting respiration in normal range."
        )

        self.assertIn("report_id", report_meta)
        self.assertIn("file_path", report_meta)
        self.assertTrue(os.path.isfile(report_meta["file_path"]))
        self.assertGreater(report_meta["file_size_bytes"], 1000)
        self.assertEqual(len(report_meta["checksum_sha256"]), 64)

    # ─────────────────────────────────────────────────────────────
    # 4. HOSPITAL EXPORT & EMERGENCY BREAK-GLASS TESTS
    # ─────────────────────────────────────────────────────────────

    def test_hospital_export_state_machine_and_safety(self):
        p = register_patient({
            "full_name": "Export Test Subject",
            "dob": "1975-10-10",
            "password": "ExportPassword2026!"
        })
        pid = p["patient_id"]

        # Step 1: Prepare export
        prep = prepare_hospital_export(pid, destination_endpoint="https://hospital.ehr.local/api/ingest")
        self.assertTrue(prep["success"])
        self.assertEqual(prep["status"], "AWAITING_AUTHORIZATION")
        export_id = prep["export_id"]

        # Step 2: Non-destructive failure test (Simulate network timeout)
        fail_res = authorize_and_transmit_export(
            export_id=export_id,
            authorizing_actor_id="DR-01",
            authorizing_role="clinician",
            simulate_network_failure=True
        )
        self.assertFalse(fail_res["success"])
        self.assertEqual(fail_res["status"], "DESTINATION_UNAVAILABLE")

        # Verify primary database records were NOT deleted upon failure
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM patients WHERE patient_id = ?", (pid,))
        self.assertEqual(cur.fetchone()["cnt"], 1)
        conn.close()

        # Step 3: Successful export
        success_res = authorize_and_transmit_export(
            export_id=export_id,
            authorizing_actor_id="DR-01",
            authorizing_role="clinician",
            simulate_network_failure=False
        )
        self.assertTrue(success_res["success"])
        self.assertEqual(success_res["status"], "EXPORT_COMPLETED")

    def test_emergency_break_glass_access(self):
        p = register_patient({
            "full_name": "Emergency Patient",
            "dob": "1960-12-05",
            "password": "EmergencyPassword2026!"
        })
        pid = p["patient_id"]

        # Non-clinician rejection
        with self.assertRaises(PermissionError):
            request_emergency_access("PATIENT-01", "patient", pid, "I want to see records")

        # Short justification rejection (< 10 chars)
        with self.assertRaises(ValueError):
            request_emergency_access("DR-02", "clinician", pid, "Too short")

        # Valid break-glass access
        em_res = request_emergency_access(
            clinician_id="DR-ER-01",
            clinician_role="clinician",
            target_patient_id=pid,
            justification_reason="Acute nocturnal respiratory distress in ER bay 3."
        )
        self.assertTrue(em_res["success"])
        self.assertTrue(em_res["emergency_access_granted"])
        self.assertEqual(em_res["patient"]["patient_id"], pid)

    # ─────────────────────────────────────────────────────────────
    # 5. FIXED AUDIO SETTINGS & COUGH STRICT RULE TESTS
    # ─────────────────────────────────────────────────────────────

    def test_audio_noise_gate_default_and_medical_bounds(self):
        gate = AudioNoiseGate()
        self.assertEqual(gate.threshold_dbfs, -20.0)

        # Enforce medical range [-25.0, -12.0]
        gate.configure(threshold_dbfs=-50.0, enforce_medical_bounds=True)
        self.assertEqual(gate.threshold_dbfs, -25.0)

        gate.configure(threshold_dbfs=-5.0, enforce_medical_bounds=True)
        self.assertEqual(gate.threshold_dbfs, -12.0)

    def test_cough_strict_frequency_rule(self):
        from src.preprocessing.acoustics import check_cough_frequency_condition, AcousticAnalyzer
        analyzer = AcousticAnalyzer()
        self.assertEqual(analyzer.cough_freq_threshold, 255.0)

        # Boundary condition: exactly 255.0 Hz must be REJECTED (strict > 255.0)
        self.assertFalse(check_cough_frequency_condition(255.0, 255.0))
        # 254.9 Hz -> REJECTED
        self.assertFalse(check_cough_frequency_condition(254.9, 255.0))
        # 255.1 Hz -> ACCEPTED
        self.assertTrue(check_cough_frequency_condition(255.1, 255.0))

    # ─────────────────────────────────────────────────────────────
    # 6. EXPERIMENTAL CREPITATION / CRACKLE ANALYSIS TESTS
    # ─────────────────────────────────────────────────────────────

    def test_crepitation_detector_rejects_accelerometer_only(self):
        analyzer = ExperimentalCrepitationAnalyzer()

        # Motion only (accelerometer at 50 Hz, Nyquist = 25 Hz)
        accel_triax = np.ones((500, 3))
        res = analyzer.analyze(audio_samples=None, accel_x=accel_triax[:, 0])

        self.assertFalse(res["available"])
        self.assertEqual(res["status"], "UNAVAILABLE_AUDIO_REQUIRED")
        self.assertFalse(res["is_positive_diagnosis"])
        self.assertIn("Accelerometer bandwidth", res["hardware_limitation_note"])
        self.assertIn("not a medical", res["clinical_disclaimer"].lower())

    def test_crepitation_detector_exploratory_with_audio(self):
        analyzer = ExperimentalCrepitationAnalyzer(audio_sample_rate=8000)

        # Synthesize audio with crackle band frequency (500 Hz)
        fs = 8000
        t = np.linspace(0, 1.0, fs, endpoint=False)
        audio = 0.5 * np.sin(2 * np.pi * 500.0 * t)

        res = analyzer.analyze(audio_samples=audio, audio_fs=fs)
        self.assertTrue(res["available"])
        self.assertIn("spectral_energy_ratio", res)
        self.assertIn("transient_density_per_sec", res)
        # Always verified non-diagnostic
        self.assertFalse(res["is_positive_diagnosis"])
        self.assertIn("exploratory research", res["clinical_disclaimer"].lower())


if __name__ == "__main__":
    unittest.main()
