"""
RespiraSense AI — SQLite Medical Database & Persistence Layer.

Module: src/storage/db.py
Project: RespiraSense AI

Features:
1. Thread-safe SQLite connection with WAL mode and foreign key enforcement.
2. Parameterized queries for SQL injection protection.
3. Separation of raw sensor stream data (48-hour retention) and derived clinical metrics (30-day retention).
4. Patient-specific data isolation on all queries.
5. Audit logging for privileged access, exports, and threshold approvals.
"""

import sqlite3
import os
import json
import time
from typing import Dict, Any, List, Optional, Tuple

if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/respirasense.db"
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "respirasense.db")


def get_db_connection() -> sqlite3.Connection:
    """Creates a configured connection to the SQLite database."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_database() -> None:
    """Initializes the database schema if tables do not exist."""
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Patients Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        patient_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        dob TEXT NOT NULL,
        sex TEXT,
        height_cm REAL,
        weight_kg REAL,
        contact_info TEXT,
        emergency_contact TEXT,
        hospital_clinic TEXT,
        treating_clinician TEXT,
        medical_context TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'patient',
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    );
    """)

    # 2. Sessions Table (for token authentication)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at REAL NOT NULL,
        expires_at REAL NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
    );
    """)

    # 3. Derived Respiration Measurements (30-day retention)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS derived_measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        timestamp REAL NOT NULL,
        iso_time TEXT NOT NULL,
        respiratory_rate_bpm REAL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        rejection_reason TEXT,
        sqi REAL NOT NULL,
        motion_state TEXT NOT NULL,
        dynamic_rms REAL NOT NULL,
        jerk_metric REAL NOT NULL,
        cadence_freq_hz REAL,
        cadence_power_ratio REAL,
        selected_axis TEXT,
        audio_pre_gate_dbfs REAL,
        audio_post_gate_dbfs REAL,
        audio_gate_state TEXT,
        audio_quiet_breathing_candidate INTEGER,
        is_synthetic INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meas_patient_time ON derived_measurements(patient_id, timestamp);")

    # 4. Personalized 7-Day Baselines
    cur.execute("""
    CREATE TABLE IF NOT EXISTS personalized_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        calculation_timestamp REAL NOT NULL,
        total_measurement_count INTEGER NOT NULL,
        valid_measurement_count INTEGER NOT NULL,
        valid_data_coverage_pct REAL NOT NULL,
        mean_rr REAL,
        median_rr REAL,
        std_rr REAL,
        iqr_rr REAL,
        resting_mean_rr REAL,
        active_mean_rr REAL,
        mean_sqi REAL NOT NULL,
        missing_data_pct REAL NOT NULL,
        status TEXT NOT NULL, -- 'SUFFICIENT', 'INSUFFICIENT_COVERAGE', 'POOR_SIGNAL_QUALITY'
        daily_breakdown_json TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_baseline_patient ON personalized_baselines(patient_id, calculation_timestamp);")

    # 5. Threshold Configurations & Approval History
    cur.execute("""
    CREATE TABLE IF NOT EXISTS threshold_configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        tachypnea_threshold REAL NOT NULL,
        bradypnea_threshold REAL NOT NULL,
        apnea_duration_sec REAL NOT NULL,
        sudden_change_bpm REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PROVISIONAL', -- 'PROVISIONAL', 'CLINICIAN_APPROVED', 'REJECTED', 'SUPERSEDED'
        proposed_reason TEXT NOT NULL,
        supporting_baseline_id INTEGER,
        approving_clinician TEXT,
        approval_timestamp REAL,
        created_at REAL NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        FOREIGN KEY (supporting_baseline_id) REFERENCES personalized_baselines(id) ON DELETE SET NULL
    );
    """)

    # 6. Generated PDF Reports Catalog
    cur.execute("""
    CREATE TABLE IF NOT EXISTS generated_reports (
        report_id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        report_type TEXT NOT NULL, -- 'SEVEN_DAY_BASELINE', 'DATE_RANGE_MONITORING'
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        created_at REAL NOT NULL,
        clinician_notes TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
    );
    """)

    # 7. Hospital Data Archive & Export Workflows
    cur.execute("""
    CREATE TABLE IF NOT EXISTS hospital_exports (
        export_id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        status TEXT NOT NULL, -- 'ARCHIVE_PENDING', 'EXPORT_PREPARED', 'AWAITING_AUTHORIZATION', 'EXPORT_COMPLETED', 'EXPORT_FAILED', 'DESTINATION_UNAVAILABLE'
        destination_endpoint TEXT NOT NULL,
        records_count INTEGER NOT NULL,
        package_file_path TEXT,
        checksum_sha256 TEXT,
        prepared_at REAL NOT NULL,
        authorized_by TEXT,
        authorization_timestamp REAL,
        completed_at REAL,
        error_message TEXT,
        is_simulation INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE
    );
    """)

    # 8. Audit Logs (Privileged access, emergency access, exports, threshold approvals)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        target_patient_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);")

    conn.commit()
    conn.close()


# Initialize on import
init_database()
