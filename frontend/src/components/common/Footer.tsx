import React from 'react';
import { Activity, ShieldAlert, Cpu, HeartPulse } from 'lucide-react';

interface FooterProps {
  setActivePage: (page: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setActivePage }) => {
  return (
    <footer className="bg-navy-900 text-slate-300 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white shadow-md">
                <Activity className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg text-white tracking-tight">RespiraSense AI</span>
            </div>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              A smartphone-assisted respiratory signal analysis platform that estimates breathing patterns from chest motion signals, assesses signal quality (SQI), and identifies movement interference. Developed for biomedical engineering exploration.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-[11px] text-teal-400 font-mono">
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Project MED-PS-006 • Non-Invasive Telemetry</span>
            </div>
          </div>

          {/* Platform Navigation */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActivePage('home')} className="hover:text-teal-400 transition-colors">
                  Home Overview
                </button>
              </li>
              <li>
                <button onClick={() => setActivePage('technology')} className="hover:text-teal-400 transition-colors">
                  Technology & Filters
                </button>
              </li>
              <li>
                <button onClick={() => setActivePage('monitoring')} className="hover:text-teal-400 transition-colors">
                  Monitoring Dashboard
                </button>
              </li>
              <li>
                <button onClick={() => setActivePage('lab')} className="hover:text-teal-400 transition-colors">
                  Activity Testing Lab
                </button>
              </li>
              <li>
                <button onClick={() => setActivePage('validation')} className="hover:text-teal-400 transition-colors">
                  Research & Validation
                </button>
              </li>
              <li>
                <button onClick={() => setActivePage('about')} className="hover:text-teal-400 transition-colors">
                  About Methodology
                </button>
              </li>
            </ul>
          </div>

          {/* System & Architecture */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">System Specifications</h4>
            <div className="space-y-2 text-xs text-slate-400">
              <p className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-teal-400" />
                <span>Sensor: Android IMU via Phyphox</span>
              </p>
              <p>Passband: 0.1 – 0.7 Hz (6 – 42 bpm)</p>
              <p>Dynamic Rate: 50 Hz DSP Decimation</p>
              <p>Hardware Boundary: Phone IMU only</p>
              <p>Bioimpedance: Future Scope</p>
            </div>
          </div>
        </div>

        {/* Regulatory & Clinical Disclaimer */}
        <div className="mt-8 pt-6 border-t border-navy-800/80">
          <div className="p-4 rounded-xl bg-navy-800/50 border border-navy-700/60 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <strong className="text-amber-300 font-semibold">Biomedical Engineering Hackathon Disclaimer: </strong>
              RespiraSense AI is an experimental engineering prototype designed for signal quality investigation and motion artifact rejection research. It is <strong>NOT</strong> a certified medical device, does not provide clinical diagnostic conclusions, and must never be used as a substitute for certified patient monitoring equipment, pulse oximetry, or professional medical evaluation.
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 gap-2">
            <div>© {new Date().getFullYear()} RespiraSense AI Research Prototype. All rights reserved.</div>
            <div className="font-mono text-[10px]">Version 1.0.0-PROTOTYPE • Python SciPy DSP Pipeline</div>
          </div>
        </div>
      </div>
    </footer>
  );
};
