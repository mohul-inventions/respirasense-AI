"""
RespiraSense AI — Sample Biomedical Respiratory Monitoring Report Generator.

Module: src/reports/sample_report_generator.py
Project: RespiraSense AI

Features:
- Produces a premium, 4-page hospital-style biomedical monitoring demonstration report.
- Strictly adheres to non-diagnostic research prototype guidelines.
- Clearly labels all demonstration and synthetic values.
- Page 1: Cover & Demographic / Telemetry Summary with Demonstration Badge.
- Page 2: High-Resolution Respiratory Signal Waveform, Rate Trend, and SQI Charts.
- Page 3: Professional Measurement & Quality Verification Table.
- Page 4: Technical Signal Interpretation, Physical Limitations & Research Disclaimer.
- Formatted for standard A4 paper with NumberedCanvas running headers and footers.
"""

import os
import io
import time
import secrets
import hashlib
from typing import Dict, Any, Optional, Tuple

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

from src.storage.db import get_db_connection

if os.environ.get("VERCEL"):
    REPORTS_DIR = "/tmp/data/reports"
else:
    REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "reports")


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and stamp running headers,
    footers, and total page numbers ('Page X of Y') on A4 pages.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))

        # Running Header (Pages 2 through 4)
        if self._pageNumber > 1:
            self.drawString(36, 810, "RESPIRASENSE AI — SAMPLE BIOMEDICAL MONITORING REPORT")
            self.drawRightString(559, 810, "SAMPLE DATA — NOT FOR CLINICAL USE")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(36, 804, 559, 804)

        # Running Footer (All pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(36, 36, 559, 36)

        self.drawString(36, 25, "RespiraSense AI | Research Prototype | Sample Report")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(559, 25, page_str)
        self.restoreState()


def render_signal_analysis_charts() -> Tuple[io.BytesIO, io.BytesIO]:
    """
    Renders high-resolution biomedical charts for Page 2:
    1. Respiratory Rate Trend over Time & Signal Quality Index (SQI).
    2. Isolated Respiratory Waveform Excursion & Triaxial Dynamic Motion RMS.
    """
    # ── Figure 1: Rate Trend and SQI ──
    fig1, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(7.2, 3.3), dpi=200, sharex=True,
        gridspec_kw={'height_ratios': [1.2, 0.8]}
    )
    t_min = np.linspace(0, 10, 60)
    # Simulated physiological resting respiratory rate around 15.2 bpm
    rr = 15.2 + 0.6 * np.sin(2 * np.pi * 0.05 * t_min) + 0.15 * np.cos(2 * np.pi * 0.12 * t_min)

    ax1.axhspan(12.0, 20.0, color='#E0F2FE', alpha=0.6, label='Common Adult Resting Range (12.0 – 20.0 bpm)')
    ax1.plot(t_min, rr, color='#028090', lw=1.8, marker='o', markersize=3, label='Estimated Respiration Rate (bpm)')
    ax1.set_ylabel('Rate (bpm)', fontsize=8, fontweight='bold', color='#0F172A')
    ax1.set_ylim(8.0, 24.0)
    ax1.legend(loc='upper right', fontsize=6.5, framealpha=0.9)
    ax1.grid(True, linestyle='--', alpha=0.4)
    ax1.set_title('Respiratory Rate Trend Over Time (10-Minute Continuous Window)', fontsize=8.5, fontweight='bold', color='#0B2545', pad=4)

    sqi = 0.86 + 0.04 * np.sin(0.08 * t_min)
    ax2.plot(t_min, sqi, color='#059669', lw=1.5, label='Signal Quality Index (SQI)')
    ax2.axhline(0.70, color='#D97706', linestyle=':', lw=1.2, label='Quality Reliability Gate (0.70)')
    ax2.set_ylabel('SQI [0-1]', fontsize=8, fontweight='bold', color='#0F172A')
    ax2.set_xlabel('Elapsed Monitoring Time (Minutes:Seconds)', fontsize=8, fontweight='bold', color='#0F172A')
    ax2.set_ylim(0.0, 1.05)
    ax2.legend(loc='lower right', fontsize=6.5, framealpha=0.9)
    ax2.grid(True, linestyle='--', alpha=0.4)

    plt.tight_layout()
    buf1 = io.BytesIO()
    fig1.savefig(buf1, format='png', bbox_inches='tight')
    plt.close(fig1)
    buf1.seek(0)

    # ── Figure 2: Waveform & Motion Acceleration ──
    fig2, (ax3, ax4) = plt.subplots(
        2, 1, figsize=(7.2, 3.3), dpi=200, sharex=True,
        gridspec_kw={'height_ratios': [1.2, 0.8]}
    )
    t_sec = np.linspace(0, 30, 300)
    # 15.0 bpm corresponds to period T = 4.0 seconds (f = 0.25 Hz)
    resp_wave = 0.038 * np.sin(2 * np.pi * 0.25 * t_sec) + 0.005 * np.sin(2 * np.pi * 0.5 * t_sec)
    ax3.plot(t_sec, resp_wave, color='#0B2545', lw=1.6, label='Isolated Respiration Displacement (Filtered Z-Axis m/s²)')

    # Peak markers at inhalation maxima (approx every 4.0 seconds)
    peak_indices_x = np.arange(1.0, 30.0, 4.0)
    peak_indices_y = [0.038 + 0.005] * len(peak_indices_x)
    ax3.scatter(peak_indices_x, peak_indices_y, color='#00A896', s=28, zorder=5, label='Detected Inhalation Peak Markers')
    ax3.set_ylabel('Excursion (m/s²)', fontsize=8, fontweight='bold', color='#0F172A')
    ax3.legend(loc='upper right', fontsize=6.5, framealpha=0.9)
    ax3.grid(True, linestyle='--', alpha=0.4)
    ax3.set_title('High-Speed Respiration Waveform & Dynamic Motion Gating (30-Second Detail)', fontsize=8.5, fontweight='bold', color='#0B2545', pad=4)

    # Stationary motion RMS
    motion_rms = 0.042 + 0.008 * np.sin(0.5 * t_sec)
    ax4.plot(t_sec, motion_rms, color='#4F46E5', lw=1.3, label='Triaxial Dynamic Motion RMS (m/s²)')
    ax4.axhline(0.40, color='#DC2626', linestyle='--', lw=1.2, label='Excessive Movement Gating Cutoff (0.40 m/s²)')
    ax4.set_ylabel('Motion RMS', fontsize=8, fontweight='bold', color='#0F172A')
    ax4.set_xlabel('Sample Window Timeline (Seconds)', fontsize=8, fontweight='bold', color='#0F172A')
    ax4.set_ylim(0.0, 0.50)
    ax4.legend(loc='upper right', fontsize=6.5, framealpha=0.9)
    ax4.grid(True, linestyle='--', alpha=0.4)

    plt.tight_layout()
    buf2 = io.BytesIO()
    fig2.savefig(buf2, format='png', bbox_inches='tight')
    plt.close(fig2)
    buf2.seek(0)

    return buf1, buf2


def generate_sample_pdf_report(
    patient_id: str = "DEMO-001",
    patient_name: str = "Demo Patient",
    is_synthetic: bool = True,
    telemetry_summary: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generates a 4-page biomedical engineering demonstration report.
    """
    os.makedirs(REPORTS_DIR, exist_ok=True)
    now = time.time()
    report_id = f"DEMO-RPT-{time.strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
    filename = f"{report_id}_SampleReport.pdf"
    file_path = os.path.join(REPORTS_DIR, filename)

    # Setup Document: Standard A4 page geometry with 36 pt (0.5 in) margins
    doc = SimpleDocTemplate(
        file_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=42,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()

    # Premium Clinical Color Palette
    navy_dark = colors.HexColor("#0B2545")
    navy_accent = colors.HexColor("#134074")
    teal_primary = colors.HexColor("#028090")
    teal_dark = colors.HexColor("#006D77")
    slate_dark = colors.HexColor("#1E293B")
    slate_light = colors.HexColor("#F8FAFC")
    amber_bg = colors.HexColor("#FFFBEB")
    amber_border = colors.HexColor("#F59E0B")
    amber_text = colors.HexColor("#B45309")

    # Typography Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=navy_dark,
        spaceAfter=3
    )
    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=12
    )
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=navy_dark,
        spaceBefore=8,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'BodyClinical',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=slate_dark
    )
    body_bold = ParagraphStyle(
        'BodyBold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    badge_style = ParagraphStyle(
        'BadgeText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=amber_text,
        alignment=1
    )
    table_header_style = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )
    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=slate_dark
    )
    disclaimer_box_style = ParagraphStyle(
        'DisclaimerBox',
        parent=styles['Italic'],
        fontName='Helvetica-Oblique',
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor("#334155")
    )

    story = []

    # ══════════════════════════════════════════════════════════════════
    # PAGE 1 — REPORT COVER & DEMOGRAPHIC / TELEMETRY SUMMARY
    # ══════════════════════════════════════════════════════════════════

    # Top Header
    header_table_data = [
        [
            Paragraph("<b>RESPIRASENSE AI</b><br/><font size=7.5 color='#475569'>Smartphone-Assisted Respiratory Monitoring</font>", body_style),
            Paragraph(f"<b>REPORT ID:</b> {report_id}<br/><b>GENERATED:</b> {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(now))}", body_style)
        ]
    ]
    t_top = Table(header_table_data, colWidths=[310, 213])
    t_top.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_top)
    story.append(HRFlowable(width="100%", thickness=1.5, color=navy_dark, spaceBefore=4, spaceAfter=8))

    story.append(Paragraph("Sample Respiratory Monitoring Report", title_style))
    story.append(Paragraph("Biomedical Engineering Demonstration Document • Multi-Axis Motion &amp; Acoustic Analysis", subtitle_style))

    # Prominent Sample Badge
    sample_badge_data = [
        [Paragraph("SAMPLE DATA — NOT FOR CLINICAL USE", badge_style)]
    ]
    t_badge = Table(sample_badge_data, colWidths=[523])
    t_badge.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), amber_bg),
        ('BOX', (0, 0), (-1, -1), 1.0, amber_border),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(t_badge)
    story.append(Spacer(1, 10))

    # Patient Information Block
    story.append(Paragraph("1. Patient &amp; Acquisition Information", section_heading))
    patient_info_rows = [
        [
            Paragraph(f"<b>Patient ID:</b> {patient_id}", table_cell_style),
            Paragraph(f"<b>Patient Name:</b> {patient_name}", table_cell_style),
            Paragraph("<b>Age:</b> Not provided", table_cell_style)
        ],
        [
            Paragraph("<b>Sex:</b> Not provided", table_cell_style),
            Paragraph(f"<b>Report ID:</b> {report_id}", table_cell_style),
            Paragraph(f"<b>Generated At:</b> {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(now))}", table_cell_style)
        ],
        [
            Paragraph("<b>Monitoring Period:</b> 10.0 Minutes (600s sample window)", table_cell_style),
            Paragraph("<b>Sensor Modality:</b> Triaxial IMU (Phone Placement: Chest)", table_cell_style),
            Paragraph("<b>Data Status:</b> <font color='#028090'><b>Synthetic Demo Benchmark</b></font>", table_cell_style)
        ]
    ]
    t_pat = Table(patient_info_rows, colWidths=[174, 174, 175])
    t_pat.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), slate_light),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
    ]))
    story.append(t_pat)
    story.append(Spacer(1, 10))

    # Summary Metrics Executive Section
    story.append(Paragraph("2. Executive Telemetry Summary", section_heading))
    summary_cards_data = [
        [
            Paragraph("<b>ESTIMATED RESPIRATION RATE</b><br/><font size=14 color='#028090'><b>15.2 bpm</b></font><br/><font size=7 color='#64748B'>Adult Normal Reference: 12.0 – 20.0 bpm<br/>Status: <b>AVAILABLE (NORMAL RESTING)</b></font>", body_style),
            Paragraph("<b>SIGNAL QUALITY INDEX (SQI)</b><br/><font size=14 color='#059669'><b>0.86 / 1.0</b></font><br/><font size=7 color='#64748B'>Reliability Threshold: &gt; 0.70<br/>Status: <b>HIGH FIDELITY / STABLE</b></font>", body_style)
        ],
        [
            Paragraph("<b>DYNAMIC MOTION CLASSIFICATION</b><br/><font size=12 color='#0B2545'><b>STATIONARY REST</b></font><br/><font size=7 color='#64748B'>Dynamic Acceleration RMS: 0.042 m/s²<br/>Status: <b>NO MOVEMENT INTERFERENCE</b></font>", body_style),
            Paragraph("<b>MONITORING DURATION &amp; DATA SOURCE</b><br/><font size=12 color='#0B2545'><b>10.0 min (600 s)</b></font><br/><font size=7 color='#64748B'>Source: <b>Controlled Synthetic Benchmark</b><br/>Integrity: <b>VERIFIED REPEATABLE</b></font>", body_style)
        ]
    ]
    t_cards = Table(summary_cards_data, colWidths=[256, 256])
    t_cards.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94A3B8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_cards)
    story.append(Spacer(1, 10))

    # Data Availability & Prototype Statement
    notice_text = (
        "<b>DATA AVAILABILITY DISCLOSURE:</b> This sample report was compiled using a controlled synthetic physiological "
        "model simulating a healthy adult resting breathing rate of 15.2 bpm with respiratory sinus arrhythmia and minimal "
        "sensor displacement artifacts. All metrics and waveforms presented below are mathematically simulated to demonstrate "
        "the reporting and analysis capabilities of the RespiraSense AI platform without exposing protected patient health data."
    )
    story.append(Paragraph(notice_text, body_style))

    # ══════════════════════════════════════════════════════════════════
    # PAGE 2 — RESPIRATORY SIGNAL ANALYSIS (CHARTS)
    # ══════════════════════════════════════════════════════════════════
    story.append(PageBreak())

    story.append(Paragraph("3. Respiratory Signal Waveforms &amp; Dynamic Artefact Analysis", section_heading))
    story.append(Paragraph(
        "Continuous 10-minute trend and high-resolution 30-second waveform extracted from triaxial accelerometer telemetry. "
        "Inhalation peaks are isolated using bandpass-filtered breathing displacement and adaptive thresholding.",
        body_style
    ))
    story.append(Spacer(1, 6))

    # Render Matplotlib Charts
    chart1_buf, chart2_buf = render_signal_analysis_charts()

    # Image 1: Rate Trend and SQI
    img1 = Image(chart1_buf, width=515, height=235)
    story.append(img1)
    story.append(Spacer(1, 8))

    # Image 2: Waveform and Motion RMS
    img2 = Image(chart2_buf, width=515, height=235)
    story.append(img2)
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "<b>Note:</b> In the event of network disruption, sensor detachment, or excessive ambulatory walking artifacts (&gt; 0.40 m/s²), "
        "the adaptive fusion engine safely suspends rate estimation and raises an artifact warning rather than presenting corrupted data.",
        disclaimer_box_style
    ))

    # ══════════════════════════════════════════════════════════════════
    # PAGE 3 — MEASUREMENTS & DATA QUALITY TABLE
    # ══════════════════════════════════════════════════════════════════
    story.append(PageBreak())

    story.append(Paragraph("4. Comprehensive Measurement &amp; Data Quality Evaluation", section_heading))
    story.append(Paragraph(
        "Tabular evaluation of key physiological and signal-quality parameters. "
        "Missing, corrupted, or non-evaluated metrics are marked explicitly as N/A.",
        body_style
    ))
    story.append(Spacer(1, 8))

    # Required table structure: Parameter | Value | Status | Notes
    table_content = [
        [
            Paragraph("Parameter", table_header_style),
            Paragraph("Value", table_header_style),
            Paragraph("Status", table_header_style),
            Paragraph("Notes / Limitations", table_header_style)
        ],
        [
            Paragraph("<b>Respiratory Rate</b>", table_cell_style),
            Paragraph("15.2 bpm", table_cell_style),
            Paragraph("Available", table_cell_style),
            Paragraph("VitalDSP ensemble estimation (peak detection + PSD autocorrelation hybrid). Ground truth: 15.0 bpm.", table_cell_style)
        ],
        [
            Paragraph("<b>Signal Quality Index</b>", table_cell_style),
            Paragraph("0.86 / 1.0", table_cell_style),
            Paragraph("Supported", table_cell_style),
            Paragraph("High signal fidelity. Composite of SNR (0.88), rhythmicity (0.84), and spectral purity (0.86).", table_cell_style)
        ],
        [
            Paragraph("<b>Motion Status</b>", table_cell_style),
            Paragraph("Stationary Rest", table_cell_style),
            Paragraph("Supported", table_cell_style),
            Paragraph("Minimal motion interference. Triaxial dynamic RMS = 0.042 m/s² (&lt; 0.10 m/s² rest threshold).", table_cell_style)
        ],
        [
            Paragraph("<b>Monitoring Duration</b>", table_cell_style),
            Paragraph("10.0 min (600 s)", table_cell_style),
            Paragraph("Available", table_cell_style),
            Paragraph("Calculated from strictly monotonic sensor timestamps at nominal 50.0 Hz sampling rate.", table_cell_style)
        ],
        [
            Paragraph("<b>Data Source</b>", table_cell_style),
            Paragraph("Synthetic Demo", table_cell_style),
            Paragraph("Verified", table_cell_style),
            Paragraph("Simulated demonstration dataset using Resting Sinusoidal Physiological model.", table_cell_style)
        ],
        [
            Paragraph("<b>Acoustic Noise Gate</b>", table_cell_style),
            Paragraph("-20.0 dBFS", table_cell_style),
            Paragraph("Supported", table_cell_style),
            Paragraph("Clinical default noise gate locked in operating band [-25.0, -12.0] dBFS; quiet breathing candidate preserved.", table_cell_style)
        ],
        [
            Paragraph("<b>Cough Detection Rule</b>", table_cell_style),
            Paragraph("&gt; 255.0 Hz", table_cell_style),
            Paragraph("Supported", table_cell_style),
            Paragraph("Strict acoustic frequency boundary enforced: dominant peak must exceed 255.0 Hz with onset ratio &ge; 3.2.", table_cell_style)
        ],
        [
            Paragraph("<b>Hardware Saturation</b>", table_cell_style),
            Paragraph("None (0.0%)", table_cell_style),
            Paragraph("Supported", table_cell_style),
            Paragraph("No accelerometer rail clipping detected (sensor dynamic limits: &plusmn;38.0 m/s²).", table_cell_style)
        ],
        [
            Paragraph("<b>Airflow Measurement</b>", table_cell_style),
            Paragraph("N/A", table_cell_style),
            Paragraph("Unavailable", table_cell_style),
            Paragraph("Smartphone sensors detect chest/abdominal motion, not oral/nasal airflow directly.", table_cell_style)
        ],
        [
            Paragraph("<b>Clinical Risk Score</b>", table_cell_style),
            Paragraph("N/A", table_cell_style),
            Paragraph("Unavailable", table_cell_style),
            Paragraph("Diagnostic risk scoring is omitted by design to comply with non-diagnostic research scope.", table_cell_style)
        ]
    ]

    t_eval = Table(table_content, colWidths=[120, 85, 80, 238])
    t_eval.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), navy_dark),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, slate_light]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_eval)
    story.append(Spacer(1, 14))

    # Notes on Data Integrity
    story.append(Paragraph("<b>Data Quality Notes &amp; Clinical Threshold Rules:</b>", body_bold))
    story.append(Paragraph(
        "• <b>Adult Reference Band:</b> Normal resting respiratory rate is clinically defined as 12.0 to 20.0 breaths per minute. "
        "Estimated rates outside this band during stationary observation warrant attention but do not constitute standalone diagnostic proof.<br/>"
        "• <b>Missing Data Protocol:</b> Parameter values are displayed as N/A whenever sensor telemetry is unavailable or quality index falls below acceptable thresholds.<br/>"
        "• <b>Alarm Philosophy:</b> Commercial green/yellow/red alarm indicators have been replaced with objective engineering classifications to avoid false clinical alarms.",
        body_style
    ))

    # ══════════════════════════════════════════════════════════════════
    # PAGE 4 — INTERPRETATION, PHYSICAL LIMITATIONS & NEXT STEPS
    # ══════════════════════════════════════════════════════════════════
    story.append(PageBreak())

    story.append(Paragraph("5. Technical Interpretation, Physical Limitations &amp; Next Steps", section_heading))
    story.append(Spacer(1, 4))

    story.append(Paragraph("<b>A. Technical Signal Interpretation (Data-Driven Only)</b>", body_bold))
    story.append(Paragraph(
        "Based strictly on the available 10-minute demonstration dataset, the observed respiration signal demonstrates consistent "
        "periodicity (median 15.2 bpm) with acceptable central tendency stability. The Signal Quality Index remains robust (0.86), "
        "indicating clear inhalation-exhalation displacement peaks without high-frequency stepping or running harmonic interference. "
        "Dynamic acceleration RMS remained below 0.05 m/s², confirming stationary conditions throughout the sample observation.",
        body_style
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>B. Physical Biomedical Sensor Limitations</b>", body_bold))
    story.append(Paragraph(
        "1. <b>Chest Displacement vs. Direct Airflow:</b> Smartphone accelerometers quantify micro-mechanical movements of the "
        "chest and abdominal wall. They do not measure volumetric tidal airflow, partial pressure of end-tidal carbon dioxide (PetCO2), "
        "or blood oxygen saturation (SpO2). Shallow breathing or obstructive hypopnea with paradoxical chest movement may present "
        "discrepancies compared to direct spirometry.<br/>"
        "2. <b>Movement Artefact Sensitivity:</b> Ambulatory movements, speech formants, coughing bursts, and changes in patient "
        "posture produce mechanical accelerations that exceed respiratory signals by 10 to 50 times. In these conditions, estimation "
        "must be suppressed.<br/>"
        "3. <b>Frequency Bandwidth Constraints:</b> Accelerometers operating at &le; 100 Hz (Nyquist &le; 50 Hz) cannot detect "
        "acoustic adventitious lung sounds (crackles/crepitations occur between 200 Hz and 1200 Hz). The system explicitly rejects "
        "motion-only detection of lung sounds.<br/>"
        "4. <b>Reference Standard Comparison:</b> This software prototype has not undergone prospective multi-center clinical trials. "
        "Before clinical adoption, comparison against calibrated hospital capnography and pneumotachometry is required.",
        body_style
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>C. Next Steps for Clinical Translation</b>", body_bold))
    story.append(Paragraph(
        "• Establish formal observational validation protocols against clinical capnography.<br/>"
        "• Integrate standardized FHIR / HL7 EHR export interfaces for hospital ingestion.<br/>"
        "• Conduct multi-patient repeatability studies across diverse body mass indices and recumbent postures.",
        body_style
    ))
    story.append(Spacer(1, 12))

    # Prominent Research Prototype Disclaimer Block
    disclaimer_text = (
        "<b>MANDATORY RESEARCH PROTOTYPE DISCLAIMER:</b><br/>"
        "“This document is generated by RespiraSense AI, a research prototype for smartphone-assisted respiratory signal analysis. "
        "It is not a medical diagnosis, a substitute for professional medical evaluation, or a certified medical-device report. "
        "Demonstration values, if present, are simulated and must not be interpreted as real patient measurements.”"
    )
    t_disc = Table([[Paragraph(disclaimer_text, disclaimer_box_style)]], colWidths=[523])
    t_disc.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#94A3B8")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_disc)
    story.append(Spacer(1, 10))

    # Technical Provenance & Traceability
    story.append(Paragraph("<b>Document Provenance &amp; Verification:</b>", body_bold))
    provenance_data = [
        [
            Paragraph("<b>Software Version:</b> RespiraSense AI v2.5.0 (Clinical Build)", table_cell_style),
            Paragraph("<b>Report Type:</b> Demonstration Sample Report", table_cell_style)
        ],
        [
            Paragraph(f"<b>Generation Timestamp:</b> {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(now))}", table_cell_style),
            Paragraph("<b>Dataset Type:</b> Controlled Synthetic Demonstration", table_cell_style)
        ],
        [
            Paragraph("<b>Medical Certification:</b> NONE (Investigational Prototype)", table_cell_style),
            Paragraph("<b>Hospital / Clinician Signature:</b> NOT APPLICABLE", table_cell_style)
        ]
    ]
    t_prov = Table(provenance_data, colWidths=[260, 263])
    t_prov.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_prov)

    # Build Document with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        checksum = hashlib.sha256(f.read()).hexdigest()

    # Log in generated_reports table if database exists
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT patient_id FROM patients WHERE patient_id = ?", (patient_id,))
        if not cur.fetchone():
            cur.execute("""
            INSERT OR IGNORE INTO patients (
                patient_id, full_name, dob, sex, password_hash, salt, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'DEMO_HASH', 'DEMO_SALT', ?, ?)
            """, (patient_id, patient_name or "Demo Patient", "1990-01-01", "UNKNOWN", now, now))

        cur.execute("""
        INSERT INTO generated_reports (
            report_id, patient_id, report_type, start_date, end_date,
            file_path, file_size_bytes, created_at, clinician_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id, patient_id, "SAMPLE_DEMONSTRATION",
            time.strftime("%Y-%m-%d", time.gmtime(now - 600)),
            time.strftime("%Y-%m-%d", time.gmtime(now)),
            file_path, file_size, now, "Demonstration sample respiratory report with synthetic physiological data."
        ))
        conn.commit()
    except Exception:
        pass
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    return {
        "success": True,
        "report_id": report_id,
        "patient_id": patient_id,
        "filename": filename,
        "file_name": filename,
        "file_path": file_path,
        "file_size_bytes": file_size,
        "checksum_sha256": checksum,
        "is_synthetic": is_synthetic,
        "page_count": 4,
        "generated_at": now
    }
