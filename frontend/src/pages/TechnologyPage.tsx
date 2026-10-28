import React from 'react';
import { 
  Cpu, Compass, Filter, ShieldCheck, AlertCircle, Layers, Check, X, 
  HelpCircle, ChevronRight, Activity, Zap
} from 'lucide-react';

export const TechnologyPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
      {/* Page Header */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-wider">
          <Cpu className="w-3.5 h-3.5" />
          DSP & Biomedical Engineering
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy-800 tracking-tight">
          Signal Processing Architecture & Physiological Foundations
        </h1>
        <p className="text-sm sm:text-base text-clinical-muted leading-relaxed">
          A transparent explanation of the algorithms, filtering stages, signal quality evaluation, and real-world hardware boundaries of smartphone-based respiratory tracking.
        </p>
      </div>

      {/* ── SECTION 1: SENSOR ACQUISITION ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 font-bold">01</div>
          <div>
            <h2 className="text-xl font-bold text-navy-800">1. Triaxial Sensor Acquisition & Kinematics</h2>
            <p className="text-xs text-clinical-muted">Mechanical chest wall excursion vs direct airflow</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4 text-xs sm:text-sm text-clinical-muted leading-relaxed">
            <p>
              When a smartphone rests on a supine or reclined subject&apos;s sternum or abdomen, its internal micro-electro-mechanical systems (MEMS) accelerometer records total specific force along three orthogonal axes:
            </p>
            <ul className="space-y-2 pl-4 list-disc text-navy-800">
              <li><strong>Z-Axis (Anterior-Posterior): </strong> Measures the primary upward and downward displacement of the thoracic cage as the diaphragm and intercostal muscles contract during inspiration and relaxation during expiration.</li>
              <li><strong>Y-Axis (Longitudinal / Cephalocaudal): </strong> Measures cranial-caudal tilting and torso elevation angle.</li>
              <li><strong>X-Axis (Lateral / Transverse): </strong> Captures lateral ribcage expansion and side-to-side body sway.</li>
            </ul>
            <div className="p-3.5 rounded-lg bg-teal-50/70 border border-teal-200 text-xs text-navy-800">
              <strong>Critical Scientific Fact: </strong> An accelerometer measures <em>structural chest-wall motion</em>, not internal lung tidal volume, airflow rate, or gas exchange. Tidal volume and respiratory rate are estimated indirectly from periodic kinetic displacement when signal quality permits.
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-50 p-5 rounded-xl border border-clinical-border space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-navy-800">Ingestion Telemetry Parameters</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-clinical-muted">Hardware Sample Rate</span>
                <span className="font-mono font-bold text-navy-800">~400 Hz (Native Phone IMU)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-clinical-muted">DSP Target Sampling</span>
                <span className="font-mono font-bold text-teal-600">50 Hz (Decimated / Resampled)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-clinical-muted">Timestamp Validation</span>
                <span className="font-mono font-bold text-navy-800">Hardware clock jitter tracking</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-clinical-muted">Transport Protocol</span>
                <span className="font-mono font-bold text-navy-800">Phyphox HTTP REST via WiFi</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: GYROSCOPE & POSTURE ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 font-bold">02</div>
          <div>
            <h2 className="text-xl font-bold text-navy-800">2. Gyroscope Angular Rate & Rotation Separation</h2>
            <p className="text-xs text-clinical-muted">Differentiating respiratory translation from rotational artifacts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-clinical-muted leading-relaxed">
          <div className="space-y-3">
            <p>
              Linear acceleration alone cannot easily distinguish between a sudden postural roll and a deep diaphragmatic heave. The triaxial gyroscope (measuring angular velocity in rad/s) provides the critical rotational disambiguation:
            </p>
            <p>
              During quiet breathing, chest rotation is near zero (&lt; 0.05 rad/s). When a subject changes position (e.g. rolling from supine to lateral decubitus), the gyroscope registers large angular rate spikes (&gt; 0.4 rad/s) across pitch and roll axes.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-navy-800 flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-600" />
              Dynamic Rotation Safeties
            </div>
            <p className="text-xs text-slate-600">
              When gyro angular RMS exceeds 0.3 rad/s or the calculated gravity tilt vector shifts by more than 15°, the system triggers a <strong>POSTURE TRANSITION</strong> state and temporarily holds rate estimation until the baseline stabilizes.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: SIGNAL PROCESSING PIPELINE ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 font-bold">03</div>
          <div>
            <h2 className="text-xl font-bold text-navy-800">3. Multi-Stage Digital Signal Processing Pipeline</h2>
            <p className="text-xs text-clinical-muted">Bandpass filtering, detrending, and spectral isolation</p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-clinical-muted leading-relaxed">
            The mathematical pipeline transforms raw continuous time-series acceleration into isolated respiratory waveforms through four discrete stages:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-xs font-mono font-bold text-teal-600">Stage A</div>
              <h4 className="text-xs font-bold text-navy-800">Gravity Vector Detrending</h4>
              <p className="text-[11px] text-clinical-muted">
                Earth&apos;s 9.81 m/s² gravitational vector is estimated using a rolling low-pass window (cutoff &lt; 0.05 Hz) and subtracted to center excursions around zero.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-xs font-mono font-bold text-teal-600">Stage B</div>
              <h4 className="text-xs font-bold text-navy-800">0.1 – 0.7 Hz IIR Bandpass</h4>
              <p className="text-[11px] text-clinical-muted">
                A 4th-order equivalent Butterworth bandpass filter isolates physiological breathing frequencies (6 – 42 breaths/min), rejecting high-frequency tremors.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-xs font-mono font-bold text-teal-600">Stage C</div>
              <h4 className="text-xs font-bold text-navy-800">Motion RMS Extraction</h4>
              <p className="text-[11px] text-clinical-muted">
                A complementary high-pass filter (&gt;1.0 Hz) computes residual kinetic energy. Elevated motion RMS flags ambulatory and transient movement artifacts.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-xs font-mono font-bold text-teal-600">Stage D</div>
              <h4 className="text-xs font-bold text-navy-800">Peak & Welch Spectral PSD</h4>
              <p className="text-[11px] text-clinical-muted">
                Combines time-domain inter-breath interval timing with Welch power spectral density estimation to determine rate plausibility.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <strong>Honest Engineering Limitation: </strong> Digital bandpass filtering attenuates out-of-band energy, but it cannot magically remove walking or jogging if the cadence (e.g. 1.0 – 1.4 Hz harmonic leakage) overlaps the passband. This is why multi-stage <strong>Signal Quality Index (SQI) gating</strong> is mandatory.
          </div>
        </div>
      </section>

      {/* ── SECTION 4: SIGNAL QUALITY INDEX (SQI) ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 font-bold">04</div>
          <div>
            <h2 className="text-xl font-bold text-navy-800">4. Bounded Signal Quality Index (SQI) Formulation</h2>
            <p className="text-xs text-clinical-muted">A deterministic 0.0 – 1.0 software score, not an imaginary clinical certainty</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4 text-xs sm:text-sm text-clinical-muted leading-relaxed">
            <p>
              The Signal Quality Index (SQI) is computed independently for each axis on every analysis window. It synthesizes five explicit quantitative metrics into a bounded score between 0.0 and 1.0:
            </p>
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-1.5">
              <div className="text-teal-400 font-bold">// SQI Composite Formula</div>
              <div>SQI = (1 - P_clipping) × (1 - P_missing) × [ W_motion × (1 - norm(RMS)) + W_cycle × (1 - CV_intervals) ]</div>
            </div>
            <p className="text-xs">
              Where <code>P_clipping</code> penalizes hardware rail saturation (&gt;38 m/s²), <code>P_missing</code> penalizes network packet drops, <code>norm(RMS)</code> reflects high-frequency movement interference, and <code>CV_intervals</code> evaluates breath-to-breath regularity.
            </p>
          </div>

          <div className="lg:col-span-5 bg-slate-50 p-5 rounded-xl border border-clinical-border space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-navy-800">SQI Threshold Decision Matrix</h4>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="font-bold text-emerald-800 flex justify-between">
                  <span>SQI ≥ 0.70</span>
                  <span>Optimal Signal</span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-0.5">Clear tidal excursions; respiratory rate published with high confidence.</p>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="font-bold text-amber-800 flex justify-between">
                  <span>0.40 ≤ SQI &lt; 0.70</span>
                  <span>Degraded Signal</span>
                </div>
                <p className="text-[11px] text-amber-700 mt-0.5">Mild noise present; rate displayed with prominent advisory warning.</p>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                <div className="font-bold text-rose-800 flex justify-between">
                  <span>SQI &lt; 0.40</span>
                  <span>Rejected / Suspended</span>
                </div>
                <p className="text-[11px] text-rose-700 mt-0.5">Severe motion or saturation; rate is suppressed with reason displayed.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: HARDWARE LIMITATIONS & INTEGRITY ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 font-bold">05</div>
          <div>
            <h2 className="text-xl font-bold text-navy-800">5. Hardware Boundaries & Regulatory Integrity</h2>
            <p className="text-xs text-clinical-muted">Explicit clarification of what standard smartphone sensors cannot do</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs sm:text-sm">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-navy-800 flex items-center gap-1.5">
              <X className="w-4 h-4 text-rose-600" />
              Bioimpedance Pneumography
            </h4>
            <p className="text-clinical-muted text-xs leading-relaxed">
              True impedance pneumography requires specialized high-frequency electrical bioimpedance front-ends and thoracic electrodes. A consumer smartphone <strong>cannot</strong> measure electrical impedance; any such future hardware requires dedicated external telemetry boards.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-navy-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Microphone & Acoustics
            </h4>
            <p className="text-clinical-muted text-xs leading-relaxed">
              While the Python pipeline supports an optional acoustic analyzer with soft noise gating, standard Phyphox accelerometer experiments do not stream audio. RespiraSense AI honestly reports the acoustic stream as <strong>INACTIVE</strong> rather than faking audio data.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-navy-800 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-teal-600" />
              Magnetometer Sensitivity
            </h4>
            <p className="text-clinical-muted text-xs leading-relaxed">
              Smartphone magnetometers are susceptible to indoor electromagnetic distortions from medical beds and electronics. The compass heading is treated purely as an orientation diagnostic, never as a primary respiratory driver.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
