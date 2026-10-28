import React from 'react';
import { 
  Activity, LayoutDashboard, Sliders, FlaskConical, CheckCircle2, 
  Cpu, Shield, Smartphone, Wifi, WifiOff, HeartPulse, User, 
  ChevronRight, Sparkles, AlertTriangle, Radio
} from 'lucide-react';
import { SourceMode, ConnectionState } from '../../types/telemetry';

interface DoctrackSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  connectionState: ConnectionState;
}

export const DoctrackSidebar: React.FC<DoctrackSidebarProps> = ({
  activeTab,
  setActiveTab,
  sourceMode,
  setSourceMode,
  connectionState,
}) => {
  const clinicalNav = [
    { id: 'overview', label: 'Clinical Dashboard', icon: LayoutDashboard, badge: 'Live' },
    { id: 'signals', label: 'Waveform Laboratory', icon: Sliders },
    { id: 'patients', label: 'Ward Sensor Grid', icon: HeartPulse, count: '1 Node' },
    { id: 'lab', label: 'Activity Testing Lab', icon: FlaskConical },
  ];

  const engineeringNav = [
    { id: 'technology', label: 'DSP & Filter Science', icon: Cpu },
    { id: 'validation', label: 'Test Suite & Validation', icon: CheckCircle2, badge: '8/8 Pass' },
    { id: 'diagnostics', label: 'Phyphox Diagnostics', icon: Shield },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-40">
      <div className="p-5 space-y-6 overflow-y-auto">
        {/* Brand Logo Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base text-slate-900 tracking-tight">RespiraSense</span>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">AI</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Doctrack Operations Hub</p>
          </div>
        </div>

        {/* Source Mode Switcher */}
        <div className="p-1 rounded-xl bg-slate-100 border border-slate-200/60 flex text-xs font-bold">
          <button
            onClick={() => setSourceMode('LIVE')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              sourceMode === 'LIVE'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${connectionState === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>LIVE Phone</span>
          </button>
          <button
            onClick={() => setSourceMode('SIMULATED')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              sourceMode === 'SIMULATED'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Simulated</span>
          </button>
        </div>

        {/* Clinical Navigation Section */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-2">
            Clinical Operations
          </span>
          {clinicalNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
                {item.count && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Engineering & Validation Navigation */}
        <div className="space-y-1 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-2">
            Biomedical Verification
          </span>
          {engineeringNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Physical Modality Audit Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Hardware Sensors</span>
            <Radio className="w-3 h-3 text-teal-600" />
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between items-center text-slate-700">
              <span>Accelerometer (IMU)</span>
              <span className="font-bold text-emerald-600 font-mono">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span>Gyroscope (Pitch/Roll)</span>
              <span className="font-bold text-teal-600 font-mono">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span>Acoustic Audio</span>
              <span className="font-bold text-slate-400 font-mono">INACTIVE</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span>Bioimpedance</span>
              <span className="font-bold text-purple-600 font-mono text-[10px]">FUTURE SCOPE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Clinician Profile Card */}
      <div className="p-4 border-t border-slate-200/80 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&auto=format&fit=crop&q=80"
                alt="Dr. Sarah Mitchell"
                className="w-9 h-9 rounded-xl object-cover border border-slate-200"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />
            </div>
            <div>
              <div className="font-bold text-xs text-slate-900 leading-tight">Dr. Sarah Mitchell</div>
              <div className="text-[10px] text-slate-400 font-medium">Chief of Pulmonology</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    </aside>
  );
};
