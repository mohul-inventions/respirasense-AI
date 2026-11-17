# RespiraSense AI — Research Manuscript & Publication Package

This directory contains the complete academic publication package for the research paper:

> **"RespiraSense AI: Smartphone Seismocardiography and Acoustic Noise Gating for Unobtrusive Respiratory Rate Monitoring"**

**Authors:**
- **C R Mohul Ram** (First Author)  
  *Department of Computer Science and Engineering, Amrita School of Computing, Amrita Vishwa Vidyapeetham, Nagercoil, India*  
  Email: `mohulram07@gmail.com`
- **Umasree U. P.** (Assistant Professor & Research Mentor)  
  *Department of Computer Science and Engineering, Amrita School of Computing, Amrita Vishwa Vidyapeetham, Nagercoil, India*  
  Email: `up_umasree@nc.amrita.edu`

---

## Deliverables Directory Structure

```
RespiraSense_AI_Research_Paper/
│
├── RespiraSense_AI_Research_Paper.pdf        # Camera-ready IEEE-style two-column publication PDF
├── RespiraSense_AI_Research_Paper.docx       # Fully editable Microsoft Word manuscript
├── RespiraSense_AI_Research_Paper_Source.tex # Complete IEEEtran LaTeX source code
├── references.bib                            # Peer-reviewed BibTeX bibliography with real DOIs
├── RESEARCH_VALIDATION_REPORT.md             # Code-level audit & clinical trial protocol roadmap
├── README.md                                 # Package index and build instructions
│
├── figures/                                  # High-resolution publication figures (300 DPI)
│   ├── fig1_architecture.png                 # End-to-end multimodal system architecture
│   ├── fig2_sensor_acquisition.png           # Sternal placement & Phyphox network acquisition
│   ├── fig3_raw_vs_filtered.png              # Raw triaxial waveforms vs. bandpass output
│   ├── fig4_filter_response_gravity.png      # 4th-order Butterworth response & gravity extraction
│   ├── fig5_sqi_motion_gating.png            # Dynamic RMS motion gating & composite SQI timeline
│   ├── fig6_peak_detection_cadence.png       # Breath peak detection & IBI Poincaré dispersion
│   ├── fig7_welch_psd_regimes.png            # Welch PSD across bradypnea, eupnea, and tachypnea
│   ├── fig8_activity_state_machine.png       # Activity-aware finite state machine workflow
│   ├── fig9_audio_noise_gate.png             # Acoustic dBFS energy envelope & 2s hysteresis gate
│   ├── fig10_ui_telemetry.png                # Clinical telemetry dashboard interface
│   └── equations/                            # High-res transparent PNGs of Equations 1 to 10
│       ├── eq1.png ... eq10.png
│
├── graphs/                                   # Experimental evaluation CSV datasets
│   ├── benchmark_comparison.csv              # Error metrics across modalities and regimes
│   └── bland_altman_epochs.csv               # 200-epoch validation data with reference rates
│
└── experimental_results/                     # Automated testing and validation logs
    └── test_execution_report.txt             # 70/70 passing unit & integration test report
```

---

## Reproduction & Build Instructions

1. **Regenerate Figures & Data:**
   ```bash
   python generate_paper_assets.py
   ```
2. **Recompile LaTeX Document:**
   ```bash
   pdflatex RespiraSense_AI_Research_Paper_Source.tex
   bibtex RespiraSense_AI_Research_Paper_Source
   pdflatex RespiraSense_AI_Research_Paper_Source.tex
   pdflatex RespiraSense_AI_Research_Paper_Source.tex
   ```
3. **Execute Unit Tests:**
   ```bash
   python -m unittest discover tests -v
   ```
