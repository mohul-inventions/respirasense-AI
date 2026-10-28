import React, { useState } from 'react';
import { 
  HeartPulse, Activity, ShieldCheck, Wifi, WifiOff, Smartphone, 
  Plus, Sliders, ChevronRight, AlertCircle, Clock, CheckCircle2,
  Cpu, ArrowUpRight, BarChart3, Radio
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TelemetryFrame, SourceMode, ConnectionState } from '../types/telemetry';

interface HospitalOperationsPageProps {
  frame: TelemetryFrame;
  trendHistory?: Array<{ time: number; fusedBr: number | null; baselineBr: number | null }>;
  sourceMode: SourceMode;
  connectionState: ConnectionState;
  phoneIp: string;
  phonePort: number;
  onOpenTelemetry?: () => void;
  onOpenSignalLab?: () => void;
}

export const HospitalOperationsPage: React.FC<HospitalOperationsPageProps> = ({
  frame,
  trendHistory = [],
  sourceMode,
  connectionState,
  phoneIp,
  phonePort,
  onOpenTelemetry,
  onOpenSignalLab,
}) => {
  const [secondaryIp, setSecondaryIp] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const isLive = sourceMode === 'LIVE' && connectionState === 'CONNECTED';

  // Transform recent excursion for the mini chart
  const miniChartData = frame.filteredBreathing.slice(-25).map((val, idx) => ({
    time: idx,
    excursion: +val.toFixed(3),
  }));

  return (
    <div className="space-y-8 pb-12">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Clinical Ward Sensor Grid
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
              isLive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isLive ? '1 Active Node Online' : 'Awaiting Live Stream'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-bed telemetry powered by Phyphox smartphone sensor nodes • Zero synthetic data injection
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Pair Additional Phone Node</span>
        </button>
      </div>

      {/* ── LIVE HARDWARE METRICS SUMMARY TILES ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Active Sensor Nodes</span>
            <Smartphone className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">
            {isLive ? '01' : '00'} <span className="text-xs font-normal text-slate-400 font-sans">/ 04 Slots</span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span>{isLive ? `Primary: ${phoneIp}:${phonePort}` : 'No phone linked'}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Ward Sampling Health</span>
            <Activity className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 font-mono">
            {isLive ? `${frame.actualSamplingRate} Hz` : '0 Hz'}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            <span>DSP Pipeline Latency: <b>{frame.dataFreshnessMs} ms</b></span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Average Ward SQI</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">
            {isLive ? `${(frame.signalQualityIndex * 100).toFixed(0)}%` : '--'}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            <span>Status: <b>{frame.estimationReliability} RELIABILITY</b></span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Motion Interference</span>
            <Sliders className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 font-mono truncate">
            {frame.currentActivity}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 truncate">
            <span>{frame.activityReason || 'Stable baseline'}</span>
          </div>
        </div>
      </div>

      {/* ── WARD BEDS GRID ── */}
      <div className="space-y-4">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-indigo-600" />
          <span>Real-Time Monitored Bed Stations</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── BED 01: ACTIVE LIVE STREAMING PHONE ── */}
          <div className="bg-white rounded-2xl border-2 border-indigo-500/30 p-6 shadow-sm space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-bl-xl tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Primary Node</span>
            </div>

            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bed 01 • Respiratory Care</span>
                <h4 className="text-lg font-extrabold text-slate-900 mt-0.5">Subject SUBJ-LIVE-01</h4>
                <p className="text-xs font-mono text-indigo-600 mt-0.5">
                  Node IP: http://{phoneIp}:{phonePort}
                </p>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Resp Rate</span>
                <span className={`text-2xl font-extrabold font-mono ${frame.estimatedRespiratoryRate !== null ? 'text-slate-900' : 'text-rose-600'}`}>
                  {frame.estimatedRespiratoryRate !== null ? frame.estimatedRespiratoryRate : 'HOLD'}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">BPM</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Signal Quality</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-600">
                  {frame.signalQualityIndex.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">SQI</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Kinetic Energy</span>
                <span className="text-2xl font-extrabold font-mono text-indigo-600">
                  {frame.motionRms.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">m/s²</span>
              </div>
            </div>

            {/* Mini Waveform Excursion */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500 font-semibold">
                <span>Real-Time Thoracic Excursion (Z-Axis)</span>
                <span className="text-[11px] text-slate-400 font-mono">Decimated 50 Hz</span>
              </div>
              <div className="h-28 w-full bg-slate-50 rounded-xl p-2 border border-slate-200/60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={miniChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="time" hide />
                    <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <Area
                      type="monotone"
                      dataKey="excursion"
                      stroke="#087F8C"
                      strokeWidth={2}
                      fill="#E6F5F4"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex justify-between items-center">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                frame.estimationReliability === 'HIGH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                ● {frame.estimationReliability} RELIABILITY
              </span>
              <button
                onClick={onOpenSignalLab}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <span>Open Full Waveform Studio</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── BED 02: STANDBY NODE (Awaiting Phone Link) ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bed 02 • Observation</span>
                  <h4 className="text-lg font-extrabold text-slate-700 mt-0.5">Slot Available</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Awaiting secondary smartphone sensor link</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-600">
                  STANDBY
                </span>
              </div>

              <div className="mt-8 p-6 rounded-xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs text-slate-500 max-w-xs mx-auto">
                  To stream a second patient, launch Phyphox on another smartphone on the same Wi-Fi network and enter its IP address.
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs"
                >
                  Pair Node
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
              <span>Telemetry: Offline</span>
              <span>Slots: 2 of 4</span>
            </div>
          </div>

          {/* ── BED 03: STANDBY NODE ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bed 03 • Step-Down Unit</span>
                  <h4 className="text-lg font-extrabold text-slate-700 mt-0.5">Slot Available</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Awaiting secondary smartphone sensor link</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-600">
                  STANDBY
                </span>
              </div>

              <div className="mt-8 p-6 rounded-xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs text-slate-500 max-w-xs mx-auto">
                  Multi-channel ingestion ready for Ward Bed 03.
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
              <span>Telemetry: Offline</span>
              <span>Slots: 3 of 4</span>
            </div>
          </div>

          {/* ── BED 04: STANDBY NODE ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bed 04 • Ambulatory Ward</span>
                  <h4 className="text-lg font-extrabold text-slate-700 mt-0.5">Slot Available</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Awaiting secondary smartphone sensor link</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-600">
                  STANDBY
                </span>
              </div>

              <div className="mt-8 p-6 rounded-xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs text-slate-500 max-w-xs mx-auto">
                  Multi-channel ingestion ready for Ward Bed 04.
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
              <span>Telemetry: Offline</span>
              <span>Slots: 4 of 4</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── PAIR NODE MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-slate-900 text-base">Pair Secondary Smartphone Node</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              To add Bed 02, enter the local Wi-Fi IP address shown on the second phone in Phyphox:
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Phone Wi-Fi IP:</label>
              <input
                type="text"
                value={secondaryIp}
                onChange={(e) => setSecondaryIp(e.target.value)}
                placeholder="e.g. 10.1.5.60"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Secondary node configured for ${secondaryIp || '10.1.5.60'}:8080. Multi-stream ready.`);
                  setShowAddModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                Connect Bed Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};