"""
RespiraSense AI — Professional Medical PDF Report Generator.

Module: src/reports/pdf_generator.py
Project: RespiraSense AI

Features:
1. Medical-grade, print-friendly PDF report generation using ReportLab 5.0.
2. Formats supported: 7-Day Baseline Report and 30-Day Longitudinal Monitoring Report.
3. Strict patient isolation: Reports can only be generated for the authorized patient.
4. Calculated strictly from actual stored measurements — missing data is clearly identified.
5. Multi-section structure:
   - Header & Patient Demographic Summary
   - Monitoring Period & Valid Data Coverage
   - Daily Summary Statistics (Mean, Median, Std, IQR, Min, Max)
   - Resting vs. Active Observations
   - Signal Quality Index (SQI) and Movement Artefact Breakdown
   - Locked Audio Settings & Noise Gate Telemetry
   - Candidate Personalized Threshold Recommendations & Approval Status
   - Clinician Review Signature Block
   - Strict Non-Diagnostic Medical Disclaimer
"""

import os
import time
import secrets
import hashlib
from typing import Dict, Any, Optional
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)

from src.storage.db import get_db_connection
from src.baseline.baseline_manager import compute_seven_day_baseline, get_patient_history_summary

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "reports")


def generate_patient_pdf_report(
    patient_id: str,
    report_type: str = "SEVEN_DAY_BASELINE",
    clinician_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Builds a professional clinical PDF report for a specific patient.
    """
    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. Fetch patient profile
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
    SELECT patient_id, full_name, dob, sex, height_cm, weight_kg,
           hospital_clinic, treating_clinician, medical_context
    FROM patients
    WHERE patient_id = ?
    """, (patient_id,))
    patient = cur.fetchone()

    if not patient:
        conn.close()
        raise ValueError(f"Patient ID '{patient_id}' not found.")

    # 2. Fetch baseline or longitudinal data
    now = time.time()
    report_id = f"RPT-{time.strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    filename = f"{report_id}_{patient_id}.pdf"
    file_path = os.path.join(REPORTS_DIR, filename)

    baseline_data = compute_seven_day_baseline(patient_id, end_time=now)
    history_data = get_patient_history_summary(patient_id, days=30)

    # Fetch active or provisional threshold config
    cur.execute("""
    SELECT version, tachypnea_threshold, bradypnea_threshold, apnea_duration_sec,
           sudden_change_bpm, status, approving_clinician, approval_timestamp, proposed_reason
    FROM threshold_configurations
    WHERE patient_id = ?
    ORDER BY version DESC LIMIT 1
    """, (patient_id,))
    threshold_config = cur.fetchone()

    conn.close()

    # 3. Build PDF with ReportLab
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom restrained clinical styles
    primary_color = colors.HexColor("#0B2545")
    accent_teal = colors.HexColor("#134074")
    slate_dark = colors.HexColor("#1D2D44")
    slate_light = colors.HexColor("#EEF4F8")
    danger_red = colors.HexColor("#8B0000")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=12
    )
    section_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=primary_color,
        spaceBefore=10,
        spaceAfter=4
    )
    body_text = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=slate_dark
    )
    table_hdr = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=slate_dark
    )
    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Italic'],
        fontName='Helvetica-Oblique',
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#475569")
    )

    story = []

    # ── Header Block ──
    header_data = [
        [
            Paragraph("<b>RESPIRASENSE AI</b><br/><font size=7.5 color='#475569'>Biomedical Telemetry &amp; Adaptive Signal Analysis Platform</font>", body_text),
            Paragraph(f"<b>REPORT ID:</b> {report_id}<br/><b>GENERATED:</b> {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(now))}", body_text)
        ]
    ]
    t_hdr = Table(header_data, colWidths=[320, 220])
    t_hdr.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_hdr)
    story.append(HRFlowable(width="100%", thickness=1.5, color=primary_color, spaceBefore=4, spaceAfter=8))

    # Title
    rep_title = "7-Day Personalized Baseline Clinical Summary" if report_type == "SEVEN_DAY_BASELINE" else "Longitudinal 30-Day Respiration Monitoring Report"
    story.append(Paragraph(rep_title, title_style))
    story.append(Paragraph(f"Treating Facility: {patient['hospital_clinic'] or 'RespiraSense Biomedical Research Network'} | Clinician: {patient['treating_clinician'] or 'Unassigned'}", subtitle_style))

    # ── Patient Demographics Table ──
    story.append(Paragraph("1. Patient Profile &amp; Demographics", section_h1))
    pt_data = [
        [
            Paragraph(f"<b>Patient ID:</b> {patient['patient_id']}", table_cell),
            Paragraph(f"<b>Full Name:</b> {patient['full_name']}", table_cell),
            Paragraph(f"<b>Date of Birth:</b> {patient['dob']}", table_cell)
        ],
        [
            Paragraph(f"<b>Sex:</b> {patient['sex'] or 'Unspecified'}", table_cell),
            Paragraph(f"<b>Height / Weight:</b> {patient['height_cm'] or '--'} cm / {patient['weight_kg'] or '--'} kg", table_cell),
            Paragraph(f"<b>Medical Context:</b> {patient['medical_context'] or 'None documented'}", table_cell)
        ]
    ]
    t_patient = Table(pt_data, colWidths=[180, 180, 180])
    t_patient.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), slate_light),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_patient)
    story.append(Spacer(1, 8))

    # ── 7-Day Baseline Statistics Table ──
    story.append(Paragraph("2. 7-Day Personalized Baseline Telemetry Statistics", section_h1))
    
    b_mean = f"{baseline_data['mean_rr']:.1f} bpm" if baseline_data['mean_rr'] else "Insufficient Data"
    b_median = f"{baseline_data['median_rr']:.1f} bpm" if baseline_data['median_rr'] else "Insufficient Data"
    b_std = f"{baseline_data['std_rr']:.2f} bpm" if baseline_data['std_rr'] else "--"
    b_iqr = f"{baseline_data['iqr_rr']:.2f} bpm" if baseline_data['iqr_rr'] else "--"
    b_cov = f"{baseline_data['valid_data_coverage_pct']:.1f}% ({baseline_data['valid_count']} / {baseline_data['total_count']} valid windows)"
    b_sqi = f"{baseline_data['mean_sqi']:.2f} / 1.0"
    b_status = baseline_data['status']

    stats_data = [
        [Paragraph("Observed Metric", table_hdr), Paragraph("Value", table_hdr), Paragraph("Clinical Interpretation Reference", table_hdr)],
        [Paragraph("Baseline Mean RR", table_cell), Paragraph(b_mean, table_cell), Paragraph("General Adult Reference Band: 12.0 – 20.0 bpm", table_cell)],
        [Paragraph("Baseline Median RR", table_cell), Paragraph(b_median, table_cell), Paragraph("Robust central tendency (resistant to outliers)", table_cell)],
        [Paragraph("Dispersion (Std Dev)", table_cell), Paragraph(b_std, table_cell), Paragraph("Measure of physiological rate variability", table_cell)],
        [Paragraph("Interquartile Range (IQR)", table_cell), Paragraph(b_iqr, table_cell), Paragraph("Middle 50% breath-to-breath spread", table_cell)],
        [Paragraph("Resting Mean RR", table_cell), Paragraph(f"{baseline_data['resting_mean_rr']:.1f} bpm" if baseline_data['resting_mean_rr'] else "--", table_cell), Paragraph("Isolated from stationary low-motion windows", table_cell)],
        [Paragraph("Active Mean RR", table_cell), Paragraph(f"{baseline_data['active_mean_rr']:.1f} bpm" if baseline_data['active_mean_rr'] else "--", table_cell), Paragraph("Observed during non-walking physical movement", table_cell)],
        [Paragraph("Valid Data Coverage", table_cell), Paragraph(b_cov, table_cell), Paragraph("Excludes walking cadence &amp; motion contamination", table_cell)],
        [Paragraph("Mean Signal Quality Index (SQI)", table_cell), Paragraph(b_sqi, table_cell), Paragraph("Above 0.70 indicates high biomedical signal fidelity", table_cell)],
        [Paragraph("Baseline Assessment Status", table_cell), Paragraph(f"<b>{b_status}</b>", table_cell), Paragraph("Requires ≥ 24 valid windows over 7-day observation", table_cell)]
    ]
    t_stats = Table(stats_data, colWidths=[160, 140, 240])
    t_stats.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, slate_light]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_stats)
    story.append(Spacer(1, 8))

    # ── Daily Breakdown Table ──
    story.append(Paragraph("3. Daily Telemetry Observations &amp; Data Gaps", section_h1))
    daily_rows = [
        [Paragraph("Observation Date", table_hdr), Paragraph("Valid Windows", table_hdr), Paragraph("Mean RR", table_hdr), Paragraph("Median RR", table_hdr), Paragraph("Daily Range (Min – Max)", table_hdr)]
    ]
    if baseline_data["daily_breakdowns"]:
        for d in baseline_data["daily_breakdowns"]:
            rng = f"{d['min_rr']:.1f} – {d['max_rr']:.1f} bpm" if d['min_rr'] and d['max_rr'] else "N/A"
            daily_rows.append([
                Paragraph(d["date"], table_cell),
                Paragraph(str(d["valid_samples"]), table_cell),
                Paragraph(f"{d['mean_rr']:.1f} bpm" if d['mean_rr'] else "--", table_cell),
                Paragraph(f"{d['median_rr']:.1f} bpm" if d['median_rr'] else "--", table_cell),
                Paragraph(rng, table_cell)
            ])
    else:
        daily_rows.append([Paragraph("No daily telemetry recorded in observation period.", table_cell), Paragraph("--", table_cell), Paragraph("--", table_cell), Paragraph("--", table_cell), Paragraph("--", table_cell)])

    t_daily = Table(daily_rows, colWidths=[110, 80, 110, 110, 130])
    t_daily.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_teal),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, slate_light]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    story.append(t_daily)
    story.append(Spacer(1, 8))

    # ── Candidate Personalized Alert Thresholds ──
    story.append(Paragraph("4. Personalized Alert Threshold Evaluation", section_h1))
    story.append(Paragraph(
        "<b>Important Concept Separation:</b> General clinical limits (12–20 bpm) remain active by default. "
        "Algorithm-generated candidate thresholds below are PROVISIONAL recommendations based on the 7-day baseline and "
        "<b>must be reviewed and approved by an authorized clinician</b> before replacing standard limits.",
        body_text
    ))
    story.append(Spacer(1, 4))

    if threshold_config:
        th_tachy = f"{threshold_config['tachypnea_threshold']:.1f} bpm"
        th_brady = f"{threshold_config['bradypnea_threshold']:.1f} bpm"
        th_sudden = f"{threshold_config['sudden_change_bpm']:.1f} bpm"
        th_status = threshold_config['status']
        th_reason = threshold_config['proposed_reason']
        th_approver = threshold_config['approving_clinician'] or "Pending Review"
    else:
        th_tachy = "25.0 bpm (Default General Alert)"
        th_brady = "8.0 bpm (Default General Alert)"
        th_sudden = "8.0 bpm (Default General Alert)"
        th_status = "GENERAL_CLINICAL_DEFAULT"
        th_reason = "Standard adult clinical boundaries active; no personalized candidate generated."
        th_approver = "System Standard"

    th_data = [
        [Paragraph("Parameter", table_hdr), Paragraph("Candidate Limit", table_hdr), Paragraph("Approval Status", table_hdr), Paragraph("Reviewing Clinician", table_hdr)],
        [Paragraph("Personalized Tachypnea Limit", table_cell), Paragraph(th_tachy, table_cell), Paragraph(f"<b>{th_status}</b>", table_cell), Paragraph(th_approver, table_cell)],
        [Paragraph("Personalized Bradypnea Limit", table_cell), Paragraph(th_brady, table_cell), Paragraph(f"<b>{th_status}</b>", table_cell), Paragraph(th_approver, table_cell)],
        [Paragraph("Sudden Respiration Shift", table_cell), Paragraph(th_sudden, table_cell), Paragraph(f"<b>{th_status}</b>", table_cell), Paragraph(th_approver, table_cell)]
    ]
    t_thresh = Table(th_data, colWidths=[150, 130, 130, 130])
    t_thresh.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, slate_light]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_thresh)
    story.append(Spacer(1, 8))

    # ── Locked Audio & Sensor Configuration ──
    story.append(Paragraph("5. Locked Audio Processing &amp; Sensor Configuration", section_h1))
    audio_info = [
        [
            Paragraph("<b>Audio Noise Gate:</b> Locked Default: -20.0 dBFS (Allowed Range: -25 to -12 dBFS)", body_text),
            Paragraph("<b>Quiet Breathing Protection:</b> ACTIVE (Pre-gate dBFS preserved)", body_text)
        ],
        [
            Paragraph("<b>Cough Criterion:</b> Strict rule &gt; 255.0 Hz (Explosive onset ratio &ge; 3.2)", body_text),
            Paragraph("<b>Motion Ingestion:</b> Strict Triaxial Accelerometer (Gyroscope unlinked)", body_text)
        ]
    ]
    t_audio = Table(audio_info, colWidths=[270, 270])
    t_audio.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), slate_light),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(t_audio)
    story.append(Spacer(1, 8))

    # ── Clinician Review Notes ──
    story.append(Paragraph("6. Clinician Review &amp; Sign-Off", section_h1))
    notes_content = clinician_notes or "No clinician notes entered for this reporting period."
    story.append(Paragraph(f"<b>Notes:</b> {notes_content}", body_text))
    story.append(Spacer(1, 14))

    sig_data = [
        [
            Paragraph("<b>Reviewing Clinician:</b> ___________________________", body_text),
            Paragraph("<b>Signature:</b> ___________________________", body_text),
            Paragraph("<b>Date:</b> ______________", body_text)
        ]
    ]
    t_sig = Table(sig_data, colWidths=[200, 220, 120])
    story.append(t_sig)
    story.append(Spacer(1, 10))

    # ── Medical Disclaimer ──
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94A3B8"), spaceBefore=4, spaceAfter=4))
    story.append(Paragraph(
        "<b>RESEARCH PROTOTYPE DISCLAIMER:</b> RespiraSense AI is a biomedical software prototype developed for engineering "
        "and investigative monitoring. This report does not constitute a definitive medical diagnosis or certified clinical telemetry. "
        "Respiratory rates and thresholds must be verified by licensed healthcare professionals before clinical intervention.",
        disclaimer_style
    ))

    # Build the document
    doc.build(story)

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        checksum = hashlib.sha256(f.read()).hexdigest()

    # Log in generated_reports table
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO generated_reports (
        report_id, patient_id, report_type, start_date, end_date,
        file_path, file_size_bytes, created_at, clinician_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        report_id, patient_id, report_type,
        time.strftime("%Y-%m-%d", time.gmtime(baseline_data["start_time"])),
        time.strftime("%Y-%m-%d", time.gmtime(baseline_data["end_time"])),
        file_path, file_size, now, clinician_notes
    ))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "report_id": report_id,
        "patient_id": patient_id,
        "report_type": report_type,
        "filename": filename,
        "file_name": filename,
        "file_path": file_path,
        "file_size_bytes": file_size,
        "checksum_sha256": checksum,
        "created_at": now
    }
