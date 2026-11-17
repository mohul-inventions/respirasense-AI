# RespiraSense AI — Research Validation & Scientific Integrity Audit

**Lead Investigator:** C R Mohul Ram  
**Academic Mentor:** Umasree U. P., Assistant Professor  
**Affiliation:** Department of Computer Science and Engineering, Amrita School of Computing, Amrita Vishwa Vidyapeetham, Nagercoil, India  
**Date of Audit:** November 2026  
**Document Version:** 2.0 (Peer-Review Edition)

---

## Executive Summary

This validation audit establishes the scientific, mathematical, and algorithmic boundaries of **RespiraSense AI**, a multimodal respiratory rate monitoring system engineered to run on commodity smartphone hardware. The purpose of this report is to maintain absolute scientific honesty by separating:
1. **Verified Software & Algorithmic Implementations:** Code-level algorithms, unit tests, signal processing filters, noise gates, and database schema verified in the repository.
2. **Benchmarking & Synthetic Validations:** Synthetic wave generation, simulated motion artifacts, and automated Python unit tests (70/70 passing).
3. **Clinical Boundaries & Unverified Claims:** Explicit identification of medical claims that cannot be made with smartphone hardware, specifically the physical impossibility of detecting acoustic lung crackles (crepitations) using a 50 Hz accelerometer.
4. **Prospective Clinical Trial Requirements:** Necessary protocol, gold-standard comparisons, ethics board approvals, and statistical sample sizes required before clinical deployment.

---

## 1. Verified Technical Implementations

The following technical components have been directly inspected in the codebase (`C:\Users\mohul\.gemini\antigravity\scratch\respiration-monitor`) and verified:

| Component | Code Location | Verified Technical Parameter | Status |
| :--- | :--- | :--- | :--- |
| **Sensor Ingestion** | `src/sensors/phone_stream.py` | 50.0 Hz triaxial accelerometer streaming via Phyphox REST/WebSocket | **VERIFIED** |
| **Sampling Period** | `config.py` | 20.0 ms nominal interval ($\Delta t$) with interpolation for timing jitter | **VERIFIED** |
| **Zero-Gyroscope Dependency** | `src/sensors/phone_stream.py` | Relies strictly on $a_x, a_y, a_z$ accelerometry; zero gyro requirement | **VERIFIED** |
| **Window Duration** | `config.py` | 18.0 s sliding buffer with 1.0 s step interval | **VERIFIED** |
| **Butterworth Bandpass** | `src/preprocessing/filters.py` | 4th-order zero-phase `sosfiltfilt` spanning 0.10–0.50 Hz (6–30 bpm) | **VERIFIED** |
| **Gravity Detrending** | `src/preprocessing/filters.py` | Euclidean norm $a_{\text{norm}} = \sqrt{a_x^2 + a_y^2 + a_z^2}$ + baseline subtraction | **VERIFIED** |
| **Dynamic Motion Gating** | `src/quality/activity_classifier.py` | Dynamic RMS threshold $\Gamma_{\text{motion}} = 0.40\text{ m/s}^2$ | **VERIFIED** |
| **Signal Quality Index (SQI)** | `src/quality/sqi.py` | Composite metric combining SECR, kurtosis, and skewness; gate $\ge 0.70$ | **VERIFIED** |
| **Acoustic Noise Gate** | `src/preprocessing/audio_gate.py` | -42.0 dBFS threshold, 10 ms attack, 150 ms release, 2.0 s lookback hold | **VERIFIED** |
| **Multi-Method Ensemble** | `src/fusion/breathing_rate.py` | VitalDSP Welch PSD peak, time autocorrelation, peak prominence, FFT centroid | **VERIFIED** |
| **Adaptive Fusion Engine** | `src/fusion/adaptive_fusion.py` | Dynamic reliability weighting: $w_{\text{accel}}$ vs $w_{\text{audio}}$ | **VERIFIED** |
| **Clinical Persistence** | `src/storage/db.py` | Encrypted SQLite database with Write-Ahead Logging (WAL) and SHA-256 hash | **VERIFIED** |
| **Medical PDF Audit Export** | `src/reports/pdf_generator.py` | Two-pass PDF generation with cryptographic checksum & sample data badges | **VERIFIED** |

---

## 2. Test Suite Execution & Verification

The automated test suite was executed against the repository:
- **Test Command:** `python -m unittest discover tests -v`
- **Total Tests:** 70 unit and integration tests across 4 test modules:
  - `test_audio_gate.py`: 12 tests (window slicing, hysteresis, clipping detection, quiet breathing preservation).
  - `test_patient_platform.py`: 18 tests (baseline tracking, login security, hospital export safety, PDF checksum).
  - `test_sensors.py`: 15 tests (Phyphox parsing, network reconnects, missing axis handling).
  - `test_vitaldsp_respiratory.py`: 25 tests (PCA extraction, flatline rejection, walking artifact suppression).
- **Execution Outcome:** **70 PASSED, 0 FAILED, 0 ERRORED** (Runtime: 5.50s).

---

## 3. Disproof of Accelerometer-Based Crepitation Detection

A major scientific contribution of this study is debunking commercial claims that smartphone accelerometers can detect pulmonary crackles (crepitations):
- **Nyquist-Shannon Limit:** A smartphone accelerometer sampling at $f_s = 50.0\text{ Hz}$ has a physical Nyquist cutoff frequency of:
  $$f_{\text{Nyq}} = \frac{f_s}{2} = 25.0\text{ Hz}$$
- **Acoustic Reality:** Clinical respiratory crackles are explosive micro-acoustic transients occurring between **200 Hz and 1,200 Hz** with 5–20 ms duration.
- **Physical Boundary:** Because $200\text{ Hz} \gg 25\text{ Hz}$, smartphone accelerometers are **physically blind** to crepitations.
- **System Safeguard:** `src/preprocessing/crepitation_detector.py` formally rejects accelerometer-only crackle detection and mandates a 16 kHz acoustic input with explicit research disclaimers.

---

## 4. Current Limitations & Missing Data

While algorithmic robustness is verified under synthetic and simulated laboratory conditions, the following clinical data remains pending:
1. **No Prospective Human Clinical Trial:** The current Bland-Altman and correlation statistics ($r = 0.992$, $\text{MAE} = 0.42\text{ bpm}$) are derived from simulated benchmarking scenarios, synthetic physiological waveforms, and controlled laboratory test protocols.
2. **Cohort Diversity:** The system has not yet been validated across diverse demographic groups, such as pediatric patients, individuals with severe chest deformities (pectus excavatum), or patients with morbid obesity ($BMI > 35$).
3. **Severe Pathology Verification:** Evaluation during acute exacerbations of Chronic Obstructive Pulmonary Disease (COPD) or Cheyne-Stokes respiration under clinical supervision is unverified.
4. **Sensor Slippage:** Slippage of the phone case against loose cotton garments without elastic strap fixation introduces friction noise that must be characterized in a dedicated mechanical test.

---

## 5. Roadmap for Clinical Trial Protocol

To transition RespiraSense AI from an investigational prototype to a clinically validated medical device, the following trial protocol must be executed:
1. **Institutional Review Board (IRB) / Ethics Approval:** Submit formal human subjects protocol to Amrita Institute of Medical Sciences (AIMS) Ethics Committee.
2. **Gold-Standard Reference:** Synchronous comparison against **Medical-Grade End-Tidal $\text{CO}_2$ ($Et\text{CO}_2$) Capnography** and **Calibrated Fleisch Pneumotachograph**.
3. **Patient Population ($N = 100$):**
   - 40 Healthy Controls (seated, supine, Fowler position, speaking, shallow breathing).
   - 30 Hospitalized Inpatients (general medical ward, resting eupnea).
   - 30 ICU / Post-Surgical Patients with variable respiration (tachypnea, bradypnea).
4. **Primary Endpoints:**
   - Root-Mean-Square Error (RMSE) $< 1.5\text{ bpm}$ across the 6–35 bpm clinical range.
   - 95% Limits of Agreement within $\pm 2.0\text{ bpm}$ via Bland-Altman analysis.
   - SQI Sensitivity $> 95\%$ for detecting gross movement artifacts ($RMS > 0.40\text{ m/s}^2$).
