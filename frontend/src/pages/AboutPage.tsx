import React from 'react';
import { 
  FileText, HeartPulse, ShieldAlert, Cpu, Sparkles, CheckCircle2, 
  Layers, Compass, ArrowRight
} from 'lucide-react';

interface AboutPageProps {
  setActivePage: (page: string) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ setActivePage }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" />
          Project Overview & Philosophy
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy-800 tracking-tight">
          About RespiraSense AI
        </h1>
        <p className="text-sm sm:text-base text-clinical-muted leading-relaxed">
          An engineering prototype developed for biomedical hackathon research exploring the limits of smartphone inertial sensors for respiratory motion pattern analysis.
        </p>
      </div>

      {/* ── CORE PHILOSOPHY & OBJECTIVE ── */}
      <section className="clinical-card p-6 sm:p-8 bg-white space-y-6">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <HeartPulse className="w-5 h-5 text-teal-600" />
          <h2 className="text-xl font-bold text-navy-800">The Problem We Are Exploring</h2>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-clinical-muted leading-relaxed">
          <p>
            Respiratory rate is one of the most critical human vital signs — an early indicator of physiological deterioration, sepsis, and pulmonary distress. Yet, in modern ambulatory or home healthcare, it remains one of the least frequently and most poorly measured parameters, often estimated by manual chest counting.
          </p>
          <p>
            While consumer smartphones contain high-precision inertial measurement units (accelerometers and gyroscopes) capable of detecting micro-displacements of the anterior thoracic wall, prior attempts at smartphone respiration tracking suffered from a fundamental flaw: <strong>they presented numbers indiscriminately</strong>, even when the subject was walking, coughing, or rolling over.
          </p>
          <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-navy-800 font-medium">
            <strong>RespiraSense AI Philosophy: </strong> A measurement is only as valuable as its reliability. When sensor signals are overwhelmed by motion artifacts or clipping, the responsible engineering response is not to guess a number, but to <strong>transparently report signal insufficiency</strong>.
          </div>
        </div>
      </section>

      {/* ── CURRENT CAPABILITIES VS FUTURE SCOPE ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Implemented Capabilities */}
        <div className="clinical-card p-6 bg-white space-y-4">
          <h3 className="text-base font-bold text-navy-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Verified Prototype Capabilities
          </h3>
          <ul className="space-y-2.5 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Phyphox Real-Time Ingestion: </strong> True incremental REST buffer synchronization over local Wi-Fi with dynamic sample rate tracking.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>0.1 – 0.7 Hz Bandpass Filtering: </strong> 4th-order digital filter isolating physiological excursions between 6 and 42 breaths/min.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Multi-Axis Signal Quality Index (SQI): </strong> Continuous 0.0 – 1.0 scoring based on motion RMS, clipping, and cycle regularity.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Adaptive Weighting vs Baseline: </strong> Dynamically favors optimal axes and benchmarked against an unweighted average baseline.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Activity Testing Laboratory: </strong> Structured protocol sessions with manual labels and exportable session audits.</span>
            </li>
          </ul>
        </div>

        {/* Known Boundaries & Future Scope */}
        <div className="clinical-card p-6 bg-white space-y-4">
          <h3 className="text-base font-bold text-navy-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600" />
            Known Limitations & Future Scope
          </h3>
          <ul className="space-y-2.5 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
              <span><strong>No Bioimpedance Pneumography: </strong> True impedance pneumography requires dedicated analog front-ends and chest electrodes; smartphone accelerometers cannot measure electrical impedance.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
              <span><strong>Inactive Audio Stream: </strong> The acoustic pipeline is inactive when default Phyphox experiments do not stream microphone samples; zero fabrication is maintained.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
              <span><strong>Supine/Reclined Positioning: </strong> Chest wall kinetics are most prominent when the phone rests on the sternum in supine or 45° semi-Fowler position.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
              <span><strong>Future Scope: </strong> Multi-center comparative clinical validation against respiratory inductance plethysmography (RIP) belts and capnography.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── ETHICS & REGULATORY DECLARATION ── */}
      <section className="p-6 rounded-2xl bg-navy-900 text-white space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <ShieldAlert className="w-5 h-5" />
          Academic & Regulatory Boundary Statement
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          RespiraSense AI is developed solely as an engineering and algorithmic research proof-of-concept. It has not been reviewed, cleared, or approved by the FDA, CE, CDSCO, or any medical regulatory authority. It does not provide medical diagnoses, treatment decisions, or clinical monitoring.
        </p>
        <div className="pt-2 flex flex-wrap gap-3">
          <button
            onClick={() => setActivePage('monitoring')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 text-white font-bold text-xs shadow-sm hover:bg-teal-600 transition-all"
          >
            Launch Monitoring Workspace
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
