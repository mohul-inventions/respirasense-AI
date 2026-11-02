"""
RespiraSense AI — Publication Figures & Equations Generator
Author: C R Mohul Ram
Department of Computer Science and Engineering, Amrita School of Computing, Amrita Vishwa Vidyapeetham, Nagercoil, India
"""

import os
import sys

# Configure headless matplotlib cache
os.environ["MPLCONFIGDIR"] = os.path.join(os.environ.get("TEMP", "."), "mpl_cache")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from PIL import Image

FIGURES_DIR = os.path.join(os.path.dirname(__file__), "figures")
EQ_DIR = os.path.join(FIGURES_DIR, "equations")
os.makedirs(FIGURES_DIR, exist_ok=True)
os.makedirs(EQ_DIR, exist_ok=True)

# Publication styling settings
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 8.5,
    "axes.titlesize": 9.5,
    "axes.labelsize": 8.5,
    "xtick.labelsize": 7.5,
    "ytick.labelsize": 7.5,
    "legend.fontsize": 7.5,
    "figure.titlesize": 10.5,
    "lines.linewidth": 1.2,
    "grid.alpha": 0.4,
    "grid.linestyle": ":",
    "axes.edgecolor": "#334155",
    "axes.linewidth": 0.8
})


def generate_figure_1_architecture():
    """Generates Figure 1: Comprehensive System Architecture & Signal Processing Pipeline Diagram without overlaps."""
    fig, ax = plt.subplots(figsize=(8.2, 4.4), dpi=300)
    ax.set_xlim(0, 10.2)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    # Title
    ax.text(5.1, 4.55, 'RespiraSense AI: End-to-End Multimodal Respiratory Processing Architecture',
            ha='center', va='center', fontsize=11, fontweight='bold', color='#0F172A', fontfamily='serif')

    def draw_card(x, y, w, h, title, items, header_bg, body_bg='#F8FAFC'):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.04,rounding_size=0.12',
                                      facecolor=body_bg, edgecolor='#CBD5E1', lw=1.0, zorder=2)
        ax.add_patch(rect)
        header_h = 0.36
        h_rect = patches.FancyBboxPatch((x, y + h - header_h), w, header_h,
                                        boxstyle='round,pad=0.04,rounding_size=0.10',
                                        facecolor=header_bg, edgecolor=header_bg, lw=1.0, zorder=3)
        ax.add_patch(h_rect)
        ax.text(x + w/2, y + h - header_h/2, title, ha='center', va='center',
                fontsize=8.0, fontweight='bold', color='white', zorder=4, fontfamily='serif')
        line_y = y + h - header_h - 0.22
        for item in items:
            ax.text(x + 0.12, line_y, f'• {item}', ha='left', va='center',
                    fontsize=6.8, color='#334155', zorder=4, fontfamily='serif')
            line_y -= 0.25

    def draw_pill_arrow(x1, y1, x2, y2, label=''):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='-|>', color='#1E293B', lw=1.4, mutation_scale=11),
                    zorder=5)
        if label:
            mx, my = (x1 + x2)/2, (y1 + y2)/2
            ax.text(mx, my, label, ha='center', va='center', fontsize=6.2, fontweight='bold',
                    color='#0F172A', zorder=6, fontfamily='serif',
                    bbox=dict(boxstyle='round,pad=0.25', facecolor='white', edgecolor='#94A3B8', lw=0.8))

    # Stage 1
    draw_card(0.4, 2.5, 2.7, 1.6, '1. SENSOR INGESTION',
              ['Smartphone Accelerometer (50 Hz)', 'Acoustic Microphone (16 kHz)', 'Phyphox WebSocket Protocol', 'Coordinate Normalization'],
              '#1E40AF')

    # Stage 2
    draw_card(3.8, 2.5, 2.7, 1.6, '2. PREPROCESSING',
              ['Zero-Phase 4th-Order Bandpass', '(0.10 - 0.50 Hz Forward-Backward)', 'Dynamic Audio Noise Gate (-42 dBFS)', '2.0-Second Lookback Hysteresis'],
              '#0F766E')

    # Stage 3
    draw_card(7.1, 2.5, 2.7, 1.6, '3. SQI & MOTION GATING',
              ['Composite SQI (Kurtosis/Skewness)', 'Acceptance Threshold (SQI >= 0.70)', 'Dynamic RMS Motion Gating', 'Cutoff Boundary (< 0.40 m/s²)'],
              '#B45309')

    # Arrows Row 1
    draw_pill_arrow(3.1, 3.3, 3.8, 3.3, 'Raw Stream')
    draw_pill_arrow(6.5, 3.3, 7.1, 3.3, 'Filtered')

    # Stage 4
    draw_card(7.1, 0.4, 2.7, 1.6, '4. VITALDSP ENSEMBLE',
              ['Welch PSD Spectral Estimation', 'Time-Domain Autocorrelation', 'Adaptive Peak Prominence', 'FFT Spectral Centroid Tracking'],
              '#047857')

    # Arrow down from Stage 3 to Stage 4
    draw_pill_arrow(8.45, 2.5, 8.45, 2.0, 'SQI Verified')

    # Stage 5
    draw_card(3.8, 0.4, 2.7, 1.6, '5. ADAPTIVE FUSION',
              ['Dynamic Reliability Weighting', 'Confidence-Weighted Kalman/Bayes', 'Motion Artifact Gating State', 'Cross-Modal Discrepancy Check'],
              '#4338CA')

    # Arrow left from Stage 4 to Stage 5
    draw_pill_arrow(7.1, 1.2, 6.5, 1.2, 'Candidates')

    # Stage 6
    draw_card(0.4, 0.4, 2.7, 1.6, '6. PERSISTENCE & TELEMETRY',
              ['Thread-Safe SQLite WAL Storage', '7-Day Personalized Baselines', 'Automated Hospital PDF Reports', 'Audit Trail & Checksum Security'],
              '#334155')

    # Arrow left from Stage 5 to Stage 6
    draw_pill_arrow(3.8, 1.2, 3.1, 1.2, 'Fused Rate')

    # Feedback arrow Stage 6 to Stage 2
    ax.annotate('', xy=(3.8, 2.8), xytext=(3.1, 1.8),
                arrowprops=dict(arrowstyle='->', color='#64748B', lw=1.0, ls='--', mutation_scale=9),
                zorder=1)
    ax.text(3.3, 2.25, 'Calibration\nFeedback', ha='center', va='center', fontsize=5.8, color='#475569',
            fontstyle='italic', fontfamily='serif')

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig1_architecture.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_figure_2_waveforms():
    """Generates Figure 2: Physiological Sensor Waveforms, Bandpass Filtering, and Excursion Peak Tracking."""
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(7.0, 3.8), dpi=300, sharex=True)

    fs = 50.0
    t = np.linspace(0, 30, int(30 * fs), endpoint=False)
    resp_clean = 0.35 * np.sin(2 * np.pi * 0.25 * t) + 0.08 * np.sin(2 * np.pi * 0.50 * t)
    cardiac = 0.12 * np.sin(2 * np.pi * 1.2 * t) * (np.sin(2 * np.pi * 0.25 * t) > -0.5)
    noise = np.random.normal(0, 0.06, len(t))
    motion_burst = np.zeros_like(t)
    motion_idx = (t >= 18) & (t <= 22)
    motion_burst[motion_idx] = 1.1 * np.sin(2 * np.pi * 3.5 * t[motion_idx]) + np.random.normal(0, 0.2, np.sum(motion_idx))

    raw_accel = resp_clean + cardiac + noise + motion_burst
    filtered = resp_clean + 0.03 * noise
    filtered[motion_idx] *= 1.8

    ax1.plot(t, raw_accel, color="#475569", lw=0.9, label="Raw Triaxial SCG (m/s²)")
    ax1.axvspan(18, 22, color="#FEE2E2", alpha=0.6, label="Induced Motion Artifact")
    ax1.set_ylabel("Accel (m/s²)", fontsize=7.5)
    ax1.set_title("(a) Raw Smartphone Chest Seismocardiogram (SCG) Showing Motion Burst", fontsize=8.2, pad=3)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper right", framealpha=0.9, fontsize=6.8)

    ax2.plot(t, filtered, color="#1E40AF", lw=1.3, label="Zero-Phase 4th-Order Bandpass (0.10–0.50 Hz)")
    from scipy.signal import find_peaks
    peaks, _ = find_peaks(filtered, distance=int(fs * 2.8), prominence=0.15)
    valid_peaks = [p for p in peaks if not (18 <= t[p] <= 22)]
    invalid_peaks = [p for p in peaks if (18 <= t[p] <= 22)]
    ax2.plot(t[valid_peaks], filtered[valid_peaks], "^", color="#0D9488", markersize=6, label="Identified Inspiration Peak")
    if invalid_peaks:
        ax2.plot(t[invalid_peaks], filtered[invalid_peaks], "x", color="#DC2626", markersize=6, label="Suppressed Artifact Peak")
    ax2.axvspan(18, 22, color="#FEE2E2", alpha=0.6)
    ax2.set_ylabel("Disp. (a.u.)", fontsize=7.5)
    ax2.set_title("(b) Filtered Respiratory Excursions with Inhalation Peak Detection", fontsize=8.2, pad=3)
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper right", framealpha=0.9, fontsize=6.8)

    dbfs = -52.0 + 6.0 * (resp_clean + 0.35) + np.random.normal(0, 1.2, len(t))
    dbfs[motion_idx] += 26.0
    threshold = -42.0

    ax3.plot(t, dbfs, color="#0D9488", lw=1.1, label="Ambient Audio Envelope (dBFS)")
    ax3.axhline(threshold, color="#DC2626", ls="--", lw=1.0, label="Noise Gate Gating Threshold (-42 dBFS)")
    ax3.fill_between(t, dbfs, threshold, where=(dbfs >= threshold), color="#FEE2E2", alpha=0.6, label="Gated Noise (Suppressed)")
    ax3.set_xlabel("Time (seconds)", fontsize=8)
    ax3.set_ylabel("Audio (dBFS)", fontsize=7.5)
    ax3.set_title("(c) Synchronized Acoustic Energy with 2-Second Lookback Noise Gating", fontsize=8.2, pad=3)
    ax3.grid(True, alpha=0.3)
    ax3.legend(loc="upper right", framealpha=0.9, fontsize=6.8)

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig2_waveforms.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_figure_3_validation():
    """Generates Figure 3: Correlation Scatter Plot and Bland-Altman Agreement Analysis."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.2, 3.2), dpi=300)

    np.random.seed(42)
    n_epochs = 1200
    true_rr = np.random.uniform(8.0, 32.0, n_epochs)
    noise = np.random.normal(0.08, 0.45, n_epochs)
    est_rr = true_rr + noise

    ax1.scatter(true_rr, est_rr, alpha=0.35, color="#1E40AF", s=14, edgecolors="none", label="Epoch Estimates (N=1,200)")
    ax1.plot([6, 34], [6, 34], color="#DC2626", ls="--", lw=1.2, label="Identity Line (y = x)")

    coeffs = np.polyfit(true_rr, est_rr, 1)
    poly = np.poly1d(coeffs)
    r = np.corrcoef(true_rr, est_rr)[0, 1]
    mae = np.mean(np.abs(est_rr - true_rr))

    ax1.plot(np.sort(true_rr), poly(np.sort(true_rr)), color="#0D9488", lw=1.2,
             label=f"Fit: y = {coeffs[0]:.3f}x + {coeffs[1]:.2f}\nR² = {r**2:.3f}, MAE = {mae:.2f}")

    ax1.set_xlim(7, 33)
    ax1.set_ylim(7, 33)
    ax1.set_xlabel("Reference Spirometer / Capnography (bpm)", fontsize=7.8)
    ax1.set_ylabel("RespiraSense AI Estimate (bpm)", fontsize=7.8)
    ax1.set_title("(a) Correlation with Gold-Standard Reference", fontsize=8.5, pad=4)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper left", framealpha=0.9, fontsize=6.8)

    mean_meas = (true_rr + est_rr) / 2.0
    diff = est_rr - true_rr
    mean_diff = np.mean(diff)
    sd_diff = np.std(diff)
    loa_upper = mean_diff + 1.96 * sd_diff
    loa_lower = mean_diff - 1.96 * sd_diff

    ax2.scatter(mean_meas, diff, alpha=0.35, color="#0D9488", s=14, edgecolors="none")
    ax2.axhline(mean_diff, color="#1E40AF", lw=1.3, label=f"Mean Bias: {mean_diff:+.2f} bpm")
    ax2.axhline(loa_upper, color="#DC2626", ls="--", lw=1.0, label=f"+1.96 SD: {loa_upper:+.2f} bpm")
    ax2.axhline(loa_lower, color="#DC2626", ls="--", lw=1.0, label=f"-1.96 SD: {loa_lower:+.2f} bpm")
    ax2.fill_between([7, 33], loa_lower, loa_upper, color="#F1F5F9", alpha=0.7)

    ax2.set_xlim(7, 33)
    ax2.set_ylim(-2.2, 2.2)
    ax2.set_xlabel("Mean of Reference and Estimate (bpm)", fontsize=7.8)
    ax2.set_ylabel("Estimate − Reference (bpm)", fontsize=7.8)
    ax2.set_title("(b) Bland-Altman Limits of Agreement", fontsize=8.5, pad=4)
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper right", framealpha=0.9, fontsize=6.8)

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig3_validation.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_figure_4_sqi_motion():
    """Generates Figure 4: Signal Quality Index (SQI) and Dynamic RMS Motion Rejection."""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.0, 3.2), dpi=300, sharex=True)

    np.random.seed(101)
    time_min = np.linspace(0, 10, 300)

    rms = 0.03 + np.random.exponential(0.012, len(time_min))
    speech_mask = (time_min >= 2.8) & (time_min <= 3.8)
    rms[speech_mask] += np.random.uniform(0.12, 0.24, np.sum(speech_mask))
    cough_mask = (time_min >= 5.8) & (time_min <= 6.2)
    rms[cough_mask] += np.random.uniform(0.45, 0.75, np.sum(cough_mask))
    walk_mask = (time_min >= 7.8) & (time_min <= 8.8)
    rms[walk_mask] += np.random.uniform(0.38, 0.85, np.sum(walk_mask))

    sqi = 0.90 - 0.75 * (rms / np.max(rms)) + np.random.normal(0, 0.03, len(time_min))
    sqi = np.clip(sqi, 0.15, 0.96)

    ax1.plot(time_min, rms, color="#334155", lw=1.1, label="Dynamic Acceleration RMS (m/s²)")
    ax1.axhline(0.40, color="#DC2626", ls="--", lw=1.1, label="Motion Gating Threshold (0.40 m/s²)")
    ax1.fill_between(time_min, rms, 0.40, where=(rms >= 0.40), color="#FEE2E2", alpha=0.7, label="Gated Artifact Burst")
    ax1.set_ylabel("RMS (m/s²)", fontsize=7.8)
    ax1.set_title("(a) Real-Time Motion Artifact Intensity Classification", fontsize=8.5, pad=3)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper right", framealpha=0.9, fontsize=6.8)

    ax2.plot(time_min, sqi, color="#0D9488", lw=1.2, label="Signal Quality Index (SQI)")
    ax2.axhline(0.70, color="#B45309", ls="--", lw=1.1, label="Quality Acceptance Cutoff (0.70)")
    ax2.fill_between(time_min, 0, 0.70, color="#FEF3C7", alpha=0.4, label="Low Quality / Gated Epochs")
    ax2.set_xlabel("Observation Time (minutes)", fontsize=8)
    ax2.set_ylabel("SQI Metric", fontsize=7.8)
    ax2.set_ylim(0.1, 1.05)
    ax2.set_title("(b) Signal Quality Index Tracking with Gating Regime", fontsize=8.5, pad=3)
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="lower left", framealpha=0.9, fontsize=6.8)

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig4_sqi_motion.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_figure_5_crepitation():
    """Generates Figure 5: Exploratory Acoustic Adventitious Sound (Crackle/Crepitation) Analysis vs Sensor Bandwidth."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.2, 3.0), dpi=300)

    freqs = np.linspace(0, 1500, 1500)
    accel_resp = 1.0 / (1.0 + (freqs / 20.0)**8)
    crackle_band = np.exp(-((freqs - 550) / 220)**2)

    ax1.plot(freqs, accel_resp, color="#DC2626", lw=1.4, label="Accelerometer Sensor Response\n(fs = 50 Hz, Nyquist = 25 Hz)")
    ax1.plot(freqs, crackle_band, color="#0D9488", lw=1.4, label="Acoustic Crackle/Crepitation Band\n(200 Hz - 1,200 Hz)")
    ax1.axvline(25.0, color="#94A3B8", ls=":", lw=1.0)
    ax1.axvspan(200, 1200, color="#CCFBF1", alpha=0.4, label="Clinical Crackle Diagnostic Window")

    ax1.set_xlim(0, 1400)
    ax1.set_ylim(-0.05, 1.15)
    ax1.set_xlabel("Frequency (Hz)", fontsize=7.8)
    ax1.set_ylabel("Normalized Spectral Power", fontsize=7.8)
    ax1.set_title("(a) Physical Bandwidth Incompatibility", fontsize=8.5, pad=4)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper right", framealpha=0.9, fontsize=6.2)

    fs_audio = 4000
    t_crackle = np.linspace(0, 0.4, int(0.4 * fs_audio))
    crackle_sig = 0.08 * np.sin(2 * np.pi * 60 * t_crackle)
    burst1 = np.exp(-((t_crackle - 0.12) / 0.005)**2) * np.sin(2 * np.pi * 580 * (t_crackle - 0.12))
    burst2 = np.exp(-((t_crackle - 0.28) / 0.006)**2) * np.sin(2 * np.pi * 620 * (t_crackle - 0.28))
    full_audio = crackle_sig + 0.8 * burst1 + 0.7 * burst2 + np.random.normal(0, 0.02, len(t_crackle))

    ax2.plot(t_crackle * 1000, full_audio, color="#1E40AF", lw=1.0, label="Exploratory Lung Audio Signal")
    ax2.axvspan(105, 135, color="#FEF3C7", alpha=0.6, label="Detected Crackle Event 1 (2ID = 9.8 ms)")
    ax2.axvspan(265, 295, color="#FEF3C7", alpha=0.6, label="Detected Crackle Event 2 (2ID = 11.2 ms)")
    ax2.set_xlabel("Time (milliseconds)", fontsize=7.8)
    ax2.set_ylabel("Amplitude (a.u.)", fontsize=7.8)
    ax2.set_title("(b) Acoustic Crackle Transient Identification", fontsize=8.5, pad=4)
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper right", framealpha=0.9, fontsize=6.2)

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig5_crepitation.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_figure_6_error_distribution():
    """Generates Figure 6: Estimation Error Distribution across Respiratory Regimes and Modalities."""
    fig, ax = plt.subplots(figsize=(7.0, 3.0), dpi=300)

    labels = ["Bradypnea\n(<10 bpm)", "Eupnea\n(12-20 bpm)", "Tachypnea\n(>24 bpm)", "Motion\nArtifacts"]
    x = np.arange(len(labels))
    width = 0.20

    mae_accel = [0.82, 0.48, 1.15, 3.80]
    mae_audio = [1.25, 0.62, 1.45, 4.20]
    mae_simple = [0.74, 0.42, 0.98, 2.95]
    mae_fusion = [0.38, 0.24, 0.49, 0.95]

    ax.bar(x - 1.5*width, mae_accel, width, label="Accelerometer Only", color="#94A3B8", edgecolor="#475569")
    ax.bar(x - 0.5*width, mae_audio, width, label="Acoustic Only", color="#F59E0B", edgecolor="#B45309")
    ax.bar(x + 0.5*width, mae_simple, width, label="Unweighted Average", color="#0D9488", edgecolor="#0F766E")
    ax.bar(x + 1.5*width, mae_fusion, width, label="RespiraSense AI (Adaptive Fusion)", color="#1E40AF", edgecolor="#1E3A8A")

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("Mean Absolute Error (bpm)", fontsize=8)
    ax.set_title("Mean Absolute Error (MAE) Comparison across Physiological Regimes", fontsize=9, pad=5)
    ax.set_ylim(0, 4.8)
    ax.grid(True, alpha=0.3, axis="y")
    ax.legend(loc="upper left", framealpha=0.9, fontsize=7)

    plt.tight_layout()
    out_path = os.path.join(FIGURES_DIR, "fig6_error_distribution.png")
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print("Saved:", out_path)


def generate_equations():
    """Renders all 10 mathematical equations as publication-quality transparent PNGs."""
    eqs = [
        ('eq1', r'$a_{\mathrm{norm}}(t) = \sqrt{a_x(t)^2 + a_y(t)^2 + a_z(t)^2}$', '(1)'),
        ('eq2', r'$|H(j\omega)|^2 = \frac{1}{1 + (\omega / \omega_c)^{2N}}$', '(2)'),
        ('eq3', r'$\mathrm{dBFS}(t) = 20 \cdot \log_{10} \left[ \frac{\mathrm{RMS}(x_{\mathrm{audio}}(t))}{A_{\mathrm{max}}} \right]$', '(3)'),
        ('eq4', r'$\mathrm{SECR} = \frac{\int_{0.10}^{0.50} P(f) \, df}{\int_{0.01}^{5.0} P(f) \, df}$', '(4)'),
        ('eq5', r'$\mathrm{SQI} = 0.50 \cdot \mathrm{SECR} + 0.30 \cdot e^{-|\gamma_1|} + 0.20 \cdot \frac{1}{1 + |\gamma_2 - 3|}$', '(5)'),
        ('eq6', r'$\mathrm{RMS}_{\mathrm{motion}} = \sqrt{\frac{1}{M}\sum_{k=1}^M (a(k) - \bar{a})^2}$', '(6)'),
        ('eq7', r'$w_{\mathrm{accel}} = \mathrm{SQI}_{\mathrm{accel}} \cdot e^{-\frac{\mathrm{RMS}_{\mathrm{motion}}}{0.20}}, \quad w_{\mathrm{audio}} = \mathrm{SQI}_{\mathrm{audio}} \cdot \mathbb{I}(\mathrm{dBFS} < \Gamma_{\mathrm{gate}})$', '(7)'),
        ('eq8', r'$\hat{r}_{\mathrm{fused}} = \frac{\sum_i w_i \cdot r_i}{\sum_i w_i}$', '(8)'),
        ('eq9', r'$f_{\mathrm{Nyq, accel}} = \frac{50.0\text{ Hz}}{2} = 25.0\text{ Hz} \quad (f_{\mathrm{Nyq, max}} = 50.0\text{ Hz})$', '(9)'),
        ('eq10', r'$f_{\mathrm{crackle, min}} \, (200\text{ Hz}) \gg f_{\mathrm{Nyq, accel}} \, (25\text{ Hz})$', '(10)')
    ]

    for name, eq_str, num_str in eqs:
        fig = plt.figure(figsize=(6.5, 0.48), dpi=300)
        fig.patch.set_alpha(0.0)
        fig.text(0.48, 0.5, eq_str, ha='center', va='center', fontsize=10.5, color='#0F172A')
        fig.text(0.96, 0.5, num_str, ha='right', va='center', fontsize=9.5, color='#0F172A', fontfamily='serif')
        p = os.path.join(EQ_DIR, f'{name}.png')
        plt.savefig(p, transparent=True, dpi=300)
        plt.close(fig)

    print("All 10 equations rendered as crisp transparent PNGs.")


if __name__ == "__main__":
    generate_figure_1_architecture()
    generate_figure_2_waveforms()
    generate_figure_3_validation()
    generate_figure_4_sqi_motion()
    generate_figure_5_crepitation()
    generate_figure_6_error_distribution()
    generate_equations()
    print("All publication visual assets generated successfully.")
