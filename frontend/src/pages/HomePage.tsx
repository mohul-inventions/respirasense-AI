import React, { useState, useEffect } from 'react';
import { 
  PlayCircle, ArrowRight, ShieldCheck, Activity, AlertTriangle, 
  CheckCircle2, Compass, Cpu, Layers, BarChart3, RefreshCw, Smartphone
} from 'lucide-react';
import { ClinicalDspEngine } from '../services/dspEngine';

interface HomePageProps {
  setActivePage: (page: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ setActivePage }) => {
  const [demoScenario, setDemoScenario] = useState<'resting' | 'walking' | 'coughing' | 'tachypnea'>('resting');
  const [demoStep, setDemoStep] = useState(0);
  const [dspEngine] = useState(() => new ClinicalDspEngine());
  const [demoFrame, setDemoFrame] = useState(() => dspEngine.generateSyntheticScenario('resting', 0));

  useEffect(() => {
    const timer = setInterval(() => {
      setDemoStep((prev) => prev + 1);
      setDemoFrame(dspEngine.generateSyntheticScenario(demoScenario, demoStep));
    }, 400);
    return () => clearInterval(timer);
  }, [demoScenario, demoStep, dspEngine]);

  return (
    <div className="space-y-20 pb-16">
      {/* ── 1. HERO SECTION ── */}
      <section className="relative pt-12 pb-16 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-teal-50/70 to-transparent -z-10 pointer-events-none rounded-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                Biomedical Signal Processing Prototype
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold text-navy-800 tracking-tight leading-[1.15]">
                Understand Respiratory Signals. <br />
                <span className="text-teal-600">See the Bigger Picture.</span>
              </h1>

              <p className="text-base sm:text-lg text-clinical-muted leading-relaxed max-w-2xl">
                RespiraSense AI transforms smartphone motion signals into interpretable respiratory-pattern estimates, helping users explore signal quality, movement interference, and the reliability of each measurement.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => setActivePage('monitoring')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-sm shadow-md shadow-teal-500/25 transition-all transform hover:-translate-y-0.5"
                >
                  <PlayCircle className="w-5 h-5" />
                  Launch Monitoring Dashboard
                </button>
                <button
                  onClick={() => setActivePage('technology')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-navy-800 font-bold text-sm border border-clinical-border shadow-xs transition-all"
                >
                  Explore the Technology
                  <ArrowRight className="w-4 h-4 text-clinical-muted" />
                </button>
              </div>

              {/* Verified Capabilities Pill Bar */}
              <div className="pt-4 border-t border-slate-200/70 flex flex-wrap gap-4 text-xs text-clinical-muted">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Real-time Phyphox Stream
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Signal Quality Index (SQI)
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Motion Artefact Rejection
                </span>
              </div>
            </div>

            {/* Right Custom Product Visual */}
            <div className="lg:col-span-5">
              <div className="relative clinical-card p-6 bg-gradient-to-br from-white to-slate-50 border-teal-500/20 shadow-xl">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-navy-800">Chest Placement Visual</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Illustrative Architecture</span>
                </div>

                {/* Custom SVG Component: Smartphone on Sternum with Kinetic Wave */}
                <div className="my-6 flex flex-col items-center justify-center">
                  <svg className="w-full max-w-[280px] h-48" viewBox="0 0 300 200" fill="none">
                    {/* Sternum / Torso Contour */}
                    <path d="M50 180 C80 140, 100 130, 150 130 C200 130, 220 140, 250 180" stroke="#CBD5E1" strokeWidth="3" strokeDasharray="4 4" />
                    <path d="M150 50 L150 130" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="3 3" />
                    
                    {/* Smartphone Body */}
                    <rect x="110" y="80" width="80" height="70" rx="10" fill="#0B1F33" stroke="#087F8C" strokeWidth="2.5" />
                    <rect x="115" y="85" width="70" height="50" rx="6" fill="#12304A" />
                    
                    {/* Dynamic Respiratory Waveform on Screen */}
                    <path 
                      d="M120 110 Q 130 95, 140 110 T 160 110 T 180 110" 
                      fill="none" 
                      stroke="#00E5FF" 
                      strokeWidth="2.5"
                    />
                    
                    {/* Acceleration Vector Arrows */}
                    {/* Z Axis (Perpendicular Chest Expansion) */}
                    <path d="M150 75 L150 40" stroke="#087F8C" strokeWidth="2" markerEnd="url(#arrow-z)" />
                    <circle cx="150" cy="40" r="3" fill="#087F8C" />
                    <text x="156" y="44" fill="#087F8C" fontSize="10" fontFamily="sans-serif" fontWeight="bold">+Z (Expansion)</text>

                    {/* Y Axis (Longitudinal) */}
                    <path d="M195 115 L225 115" stroke="#F59E0B" strokeWidth="1.5" />
                    <circle cx="225" cy="115" r="2.5" fill="#F59E0B" />
                    <text x="200" y="130" fill="#B7791F" fontSize="9" fontFamily="sans-serif">+Y (Tilt)</text>
                  </svg>

                  {/* Micro Metric Preview */}
                  <div className="w-full grid grid-cols-2 gap-2 mt-2">
                    <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-100 text-center">
                      <span className="text-[10px] text-teal-700 font-semibold block">Primary Modality</span>
                      <span className="text-xs font-bold text-navy-800">Triaxial Inertial IMU</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[10px] text-clinical-muted font-semibold block">Processing Filter</span>
                      <span className="text-xs font-bold text-navy-800">0.1 - 0.7 Hz Bandpass</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-center text-clinical-muted italic">
                  Diagram depicts anterior-posterior displacement vector during quiet tidal breathing.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST & CAPABILITY STRIP ── */}
      <section className="bg-navy-800 text-white py-8 border-y border-navy-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <div className="text-teal-400 font-extrabold text-2xl font-mono">100%</div>
              <div className="text-xs font-bold text-slate-200">Real Sensor Ingestion</div>
              <p className="text-[11px] text-slate-400">Direct streaming via Phyphox REST API</p>
            </div>
            <div className="space-y-1">
              <div className="text-teal-400 font-extrabold text-2xl font-mono">0.0 – 1.0</div>
              <div className="text-xs font-bold text-slate-200">Bounded SQI Index</div>
              <p className="text-[11px] text-slate-400">Multi-axis quality & completeness scoring</p>
            </div>
            <div className="space-y-1">
              <div className="text-teal-400 font-extrabold text-2xl font-mono">15° Tilt</div>
              <div className="text-xs font-bold text-slate-200">Posture Shift Gating</div>
              <p className="text-[11px] text-slate-400">Suspends rate during mechanical reorientation</p>
            </div>
            <div className="space-y-1">
              <div className="text-teal-400 font-extrabold text-2xl font-mono">Zero</div>
              <div className="text-xs font-bold text-slate-200">Silent Fabrications</div>
              <p className="text-[11px] text-slate-400">Clear rejection when signals are degraded</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. THE PROBLEM SECTION ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">Signal Processing Challenges</h2>
          <h3 className="text-3xl font-extrabold text-navy-800 tracking-tight">Respiratory Signals Are Not Always Easy to Interpret</h3>
          <p className="mt-3 text-sm text-clinical-muted leading-relaxed">
            Estimating breathing from consumer phone sensors is prone to severe motion interference. An accurate system must detect when signals are unusable rather than producing fabricated numbers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="clinical-card p-6 clinical-card-hover space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Activity className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-base text-navy-800">Subtle Chest Motion</h4>
            <p className="text-xs text-clinical-muted leading-relaxed">
              Quiet tidal breathing produces subtle anterior-posterior chest excursions (often &lt; 0.2 m/s² acceleration), requiring sensitive filtering to isolate from sensor thermal noise.
            </p>
          </div>

          {/* Card 2 */}
          <div className="clinical-card p-6 clinical-card-hover space-y-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-base text-navy-800">Walking & Posture Shift</h4>
            <p className="text-xs text-clinical-muted leading-relaxed">
              Ambulatory stepping produces harmonic cadence (1.5 – 2.2 Hz) with acceleration magnitudes 10× stronger than breathing, corrupting naive frequency estimators.
            </p>
          </div>

          {/* Card 3 */}
          <div className="clinical-card p-6 clinical-card-hover space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <Layers className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-base text-navy-800">Speaking & Cough Spikes</h4>
            <p className="text-xs text-clinical-muted leading-relaxed">
              Speech phonation and spasmodic coughing create non-respiratory kinetic transients and acoustic bursts that can artificially inflate cycle detection if unmanaged.
            </p>
          </div>

          {/* Card 4 */}
          <div className="clinical-card p-6 clinical-card-hover space-y-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-base text-navy-800">Unreliable Estimates</h4>
            <p className="text-xs text-clinical-muted leading-relaxed">
              Presenting a single numerical respiratory rate without an accompanying Signal Quality Index creates dangerous false clinical confidence. Poor signals must be suppressed.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. THE SOLUTION PIPELINE ── */}
      <section className="bg-slate-50/70 border-y border-clinical-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">Methodological Architecture</h2>
            <h3 className="text-3xl font-extrabold text-navy-800 tracking-tight">From Motion Signals to Meaningful Insight</h3>
            <p className="mt-3 text-sm text-clinical-muted leading-relaxed">
              Our 6-stage signal processing and quality assessment workflow cleanly separates breathing patterns from mechanical motion interference.
            </p>
          </div>

          {/* Pipeline Visual Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { step: '01', title: 'Smartphone Sensors', desc: 'Acquires triaxial accX/Y/Z and optional gyro over WiFi via Phyphox.', icon: Smartphone },
              { step: '02', title: 'Signal Processing', desc: 'Separates gravity, applies 0.1-0.7 Hz IIR bandpass, dynamic decimation.', icon: Cpu },
              { step: '03', title: 'Motion Assessment', desc: 'Computes motion RMS and detects posture tilts (>15°) and transitions.', icon: Compass },
              { step: '04', title: 'Quality Evaluation', desc: 'Computes multi-axis SQI (0-1) across completeness and consistency.', icon: BarChart3 },
              { step: '05', title: 'Rate Estimation', desc: 'Extracts inhalation peaks with Welch PSD and plausibility checks.', icon: Activity },
              { step: '06', title: 'Interpretable UI', desc: 'Displays honest metrics or flags explicit rejection reason.', icon: ShieldCheck },
            ].map((st, idx) => {
              const Icon = st.icon;
              return (
                <div key={idx} className="clinical-card p-5 bg-white relative flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-mono font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded">{st.step}</span>
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-navy-800 mb-1">{st.title}</h4>
                    <p className="text-[11px] text-clinical-muted leading-relaxed">{st.desc}</p>
                  </div>
                  {idx < 5 && (
                    <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-teal-500 font-bold">
                      →
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 5. LIVE DASHBOARD PREVIEW & SIMULATOR ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-600">Interactive Demonstration</span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-navy-800 tracking-tight">
              Test Scenario Responses in Real-Time
            </h3>
            <p className="text-sm text-clinical-muted leading-relaxed">
              Observe how the signal processing engine responds to different physical activities. Notice that during walking or severe coughing, the respiratory rate is <strong>safely suspended</strong> rather than displaying a corrupted reading.
            </p>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-navy-800 block">Select Demonstration Scenario:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'resting', label: '1. Quiet Resting' },
                  { id: 'walking', label: '2. Walking Artifact' },
                  { id: 'coughing', label: '3. Cough Transient' },
                  { id: 'tachypnea', label: '4. Rapid Breathing' },
                ].map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => setDemoScenario(sc.id as any)}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-all ${
                      demoScenario === sc.id
                        ? 'bg-teal-50 text-teal-700 border-teal-300 shadow-xs'
                        : 'bg-white text-clinical-muted border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-800 leading-relaxed">
              <strong>Demonstration Notice: </strong> This preview uses deterministic synthetic kinematic models. The live monitoring page connects to genuine smartphone hardware.
            </div>
          </div>

          {/* Interactive Card Preview */}
          <div className="lg:col-span-7">
            <div className="clinical-card p-6 bg-navy-900 border-navy-700 text-white shadow-xl">
              <div className="flex justify-between items-center pb-4 border-b border-navy-800">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-xs font-mono font-bold text-slate-300">SIMULATED BENCHMARK STREAM</span>
                </div>
                <span className="text-[11px] font-mono text-teal-400">Scenario: {demoScenario.toUpperCase()}</span>
              </div>

              {/* Dynamic Readouts */}
              <div className="grid grid-cols-3 gap-4 my-6">
                <div className="p-4 rounded-xl bg-navy-800/80 border border-navy-700">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Estimated Rate</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className={`text-2xl font-extrabold font-mono ${demoFrame.estimatedRespiratoryRate ? 'text-teal-400' : 'text-rose-400'}`}>
                      {demoFrame.estimatedRespiratoryRate ? `${demoFrame.estimatedRespiratoryRate}` : 'SUSPENDED'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">BPM</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {demoFrame.estimatedRespiratoryRate ? 'Within Physiological Range' : demoFrame.rejectionReason}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-navy-800/80 border border-navy-700">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Signal Quality (SQI)</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className={`text-2xl font-extrabold font-mono ${demoFrame.signalQualityIndex >= 0.6 ? 'text-emerald-400' : (demoFrame.signalQualityIndex >= 0.35 ? 'text-amber-400' : 'text-rose-400')}`}>
                      {demoFrame.signalQualityIndex.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400">/ 1.0</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {demoFrame.signalQualityIndex >= 0.6 ? 'High Quality Excursion' : 'Motion Penalized'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-navy-800/80 border border-navy-700">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Activity State</div>
                  <div className="mt-1 text-sm font-bold text-slate-200">
                    {demoFrame.currentActivity}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    Motion RMS: {demoFrame.motionRms.toFixed(2)} m/s²
                  </div>
                </div>
              </div>

              {/* Waveform Canvas Simulation */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Filtered Breath Waveform (Z-Axis Excursion)</span>
                  <span className="font-mono text-teal-400">50 Hz Decimated</span>
                </div>
                <div className="h-20 bg-navy-800/60 rounded-lg p-2 border border-navy-700 flex items-center justify-center overflow-hidden">
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 60">
                    <path
                      d={demoFrame.filteredBreathing.reduce((acc, val, idx, arr) => {
                        const x = (idx / (arr.length - 1)) * 300;
                        const y = 30 - val * 60;
                        return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                      }, '')}
                      fill="none"
                      stroke={demoFrame.estimatedRespiratoryRate ? '#00E5FF' : '#F43F5E'}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-navy-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Reliability Gate: <strong>{demoFrame.estimationReliability}</strong></span>
                <button
                  onClick={() => setActivePage('monitoring')}
                  className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-semibold"
                >
                  Open Full Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. FINAL CALL TO ACTION ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 text-white p-8 sm:p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="max-w-2xl mx-auto space-y-4">
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Explore Respiratory Signals with Greater Transparency.
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Connect your smartphone over local Wi-Fi or launch our physical activity testing laboratory to evaluate signal stability under walking, coughing, and posture transitions.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-3">
              <button
                onClick={() => setActivePage('monitoring')}
                className="px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs shadow-md transition-all"
              >
                Open Monitoring Workspace
              </button>
              <button
                onClick={() => setActivePage('lab')}
                className="px-5 py-3 rounded-xl bg-navy-700 hover:bg-navy-600 text-slate-200 font-bold text-xs border border-navy-600 transition-all"
              >
                Launch Activity Lab Protocol
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
