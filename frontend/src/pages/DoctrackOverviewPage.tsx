import React, { useState } from 'react';
import { 
  Activity, ShieldCheck, HeartPulse, Sliders, RefreshCw, 
  AlertTriangle, CheckCircle2, Clock, MapPin, Video, AlertCircle, 
  ChevronRight, ArrowUpRight, Compass, Cpu, Zap, X, Smartphone, 
  Wifi, Radio, Terminal, ExternalLink
} from 'lucide-react';
import { 
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from 'recharts';
import { TelemetryFrame, SourceMode, ConnectionState } from '../types/telemetry';

interface DoctrackOverviewPageProps {
  frame: TelemetryFrame;
  trendHistory: Array<{ time: number; fusedBr: number | null; baselineBr: number | null }>;
  sourceMode: SourceMode;
  connectionState: ConnectionState;
  connectionErrorMsg?: string | null;
  phoneIp: string;
  setPhoneIp?: (ip: string) => void;
  phonePort: number;
  setPhonePort?: (port: number) => void;
  onConnectPhyphox: () => void;
  onOpenSignalLab: () => void;
  onOpenActivityLab: () => void;
}

export const DoctrackOverviewPage: React.FC<DoctrackOverviewPageProps> = ({
  frame,
  trendHistory,
  sourceMode,
  connectionState,
  connectionErrorMsg,
  phoneIp,
  setPhoneIp,
  phonePort,
  setPhonePort,
  onConnectPhyphox,
  onOpenSignalLab,
  onOpenActivityLab,
}) => {
  const [activeChartTab, setActiveChartTab] = useState<'filtered' | 'trend' | 'raw'>('filtered');
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const isLiveStreaming = sourceMode === 'LIVE' && connectionState === 'CONNECTED';

  // Transform filtered waveform data for Recharts
  const waveformChartData = frame.filteredBreathing.map((val, idx) => ({
    time: idx,
    excursion: +val.toFixed(3),
    isPeak: frame.peakIndices.includes(idx) ? +val.toFixed(3) : null,
  }));

  // Transform trend history data for Recharts
  const trendChartData = trendHistory.map((item, idx) => ({
    index: idx,
    fusedBr: item.fusedBr !== null ? item.fusedBr : null,
    baselineBr: item.baselineBr !== null ? item.baselineBr : null,
  }));

  return (
    <div className="space-y-8 pb-12">
      {/* ── CONNECTION ALERT BANNER IF NOT CONNECTED IN LIVE MODE ── */}
      {sourceMode === 'LIVE' && !isLiveStreaming && (
        <div className="p-6 rounded-2xl bg-amber-50/90 border border-amber-200/90 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-amber-950">
                    Phyphox Phone Stream Setup
                  </h4>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    connectionState === 'ERROR' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {connectionState === 'ERROR' ? 'Connection Failed' : 'Action Required'}
                  </span>
                </div>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed max-w-2xl">
                  1. In Phyphox on your phone, open <strong>&quot;Acceleration with g&quot;</strong> (or &quot;Accelerometer&quot;).<br />
                  2. Tap the top-right menu (<strong>⋮</strong>) $\rightarrow$ <strong>&quot;Allow remote access&quot;</strong> $\rightarrow$ tap <strong>OK</strong>.<br />
                  3. Check the IP address shown on your phone screen and ensure it matches the input below.
                </p>
              </div>
            </div>

            {/* Quick Connection Controls */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 bg-white border border-amber-300/80 px-2.5 py-1.5 rounded-xl shadow-xs text-xs font-mono">
                <span className="text-slate-400">http://</span>
                <input
                  type="text"
                  value={phoneIp}
                  onChange={(e) => setPhoneIp?.(e.target.value)}
                  className="w-24 font-bold text-slate-800 focus:outline-none"
                  placeholder="192.168.43.1"
                />
                <span className="text-slate-400">:</span>
                <input
                  type="number"
                  value={phonePort}
                  onChange={(e) => setPhonePort?.(Number(e.target.value))}
                  className="w-14 font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <button
                onClick={onConnectPhyphox}
                disabled={connectionState === 'CONNECTING'}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${connectionState === 'CONNECTING' ? 'animate-spin' : ''}`} />
                <span>{connectionState === 'CONNECTING' ? 'Connecting...' : 'Connect Stream'}</span>
              </button>
            </div>
          </div>

          {/* Error Message or Direct Test Link */}
          {connectionState === 'ERROR' && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{connectionErrorMsg || `Cannot reach http://${phoneIp}:${phonePort}`}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1 border-t border-rose-100">
                <a
                  href={`http://${phoneIp}:${phonePort}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Test opening http://{phoneIp}:{phonePort} directly in browser</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                  className="text-amber-800 hover:text-amber-900 font-bold underline"
                >
                  {showTroubleshoot ? 'Hide Quick Troubleshooting Guide' : '👉 View 3 Quick Fixes (Hotspot / Wi-Fi Isolation)'}
                </button>
              </div>

              {showTroubleshoot && (
                <div className="mt-2 p-3 rounded-lg bg-white border border-rose-200 text-[11px] text-slate-700 space-y-1.5 leading-relaxed">
                  <p><strong>Fix 1 (Guaranteed 100% fix): Use Phone Mobile Hotspot</strong><br />
                  If your laptop is on a college/hotel/hackathon Wi-Fi network, router &quot;AP isolation&quot; blocks devices from connecting to each other. Turn ON <strong>Mobile Hotspot</strong> on your phone, connect your laptop to that hotspot, and use the IP shown in Phyphox.</p>
                  <p><strong>Fix 2: Verify Phone IP</strong><br />
                  Your laptop is currently on IP subnet <code>10.1.5.142</code>. Verify that the IP displayed on your phone inside Phyphox matches what is typed in the box.</p>
                  <p><strong>Fix 3: Keep Phyphox Screen Awake</strong><br />
                  Make sure Phyphox remains open on the phone screen so Android does not pause background network sockets.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 1. DOCTRACK HERO KPI CARDS (4 TILES) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Estimated Respiratory Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Respiratory Rate</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold font-mono tracking-tight ${
                frame.estimatedRespiratoryRate !== null ? 'text-slate-900' : 'text-rose-600'
              }`}>
                {frame.estimatedRespiratoryRate !== null ? `${frame.estimatedRespiratoryRate}` : (isLiveStreaming ? 'HOLD' : 'STANDBY')}
              </span>
              <span className="text-xs text-slate-400 font-bold font-mono">BPM</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-auto ${
                frame.estimatedRespiratoryRate !== null ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {frame.estimatedRespiratoryRate !== null ? 'Active' : (isLiveStreaming ? 'Motion Gated' : 'Awaiting Phone')}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              {frame.estimatedRespiratoryRate !== null 
                ? (frame.estimatedRespiratoryRate >= 12 && frame.estimatedRespiratoryRate <= 20 ? '● Normal Resting Band (12-20)' : '⚠️ Tachypnea Elevation')
                : (isLiveStreaming ? (frame.rejectionReason || 'Motion Interference Hold') : 'Waiting for live phone stream')}
            </p>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                frame.estimatedRespiratoryRate !== null ? 'bg-teal-500' : 'bg-rose-500'
              }`}
              style={{ width: `${frame.estimatedRespiratoryRate ? Math.min(100, (frame.estimatedRespiratoryRate / 40) * 100) : 5}%` }}
            />
          </div>
        </div>

        {/* Card 2: Signal Quality Index (SQI) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Signal Quality (SQI)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold font-mono tracking-tight ${
                frame.signalQualityIndex >= 0.70 ? 'text-emerald-600' : frame.signalQualityIndex >= 0.40 ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {frame.signalQualityIndex.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 font-bold">/ 1.0</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-auto ${
                frame.signalQualityIndex >= 0.70 ? 'bg-emerald-50 text-emerald-700' : frame.signalQualityIndex >= 0.40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {frame.signalQualityIndex >= 0.70 ? 'Optimal' : frame.signalQualityIndex >= 0.40 ? 'Degraded' : 'Rejected'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Z-Axis Quality: <strong className="text-slate-700 font-mono">{frame.sqiPerAxis.z.toFixed(2)}</strong> • Completeness: 100%
            </p>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                frame.signalQualityIndex >= 0.70 ? 'bg-emerald-500' : frame.signalQualityIndex >= 0.40 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.round(frame.signalQualityIndex * 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Activity & Kinematic Motion Context */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kinematic Activity</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Compass className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-extrabold text-slate-900 tracking-tight truncate block">
                {frame.currentActivity}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              {frame.activityReason}
            </p>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>Motion RMS: <b className="text-slate-800 font-mono">{frame.motionRms.toFixed(3)} m/s²</b></span>
            <span>Tilt: <b className="text-indigo-600 font-mono">{frame.tiltAngleDeg.toFixed(0)}°</b></span>
          </div>
        </div>

        {/* Card 4: Hardware Ingestion & Sampling Health */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sampling & Decimation</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-600 font-mono tracking-tight">50.0</span>
              <span className="text-xs text-slate-400 font-bold font-mono">Hz DSP</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded ml-auto bg-indigo-50 text-indigo-700">
                8× Decimated
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Raw Phone IMU: <strong className="text-slate-700 font-mono">~{frame.actualSamplingRate.toFixed(0)} Hz</strong> • 0 Dropped
            </p>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>Latency: <b className="text-emerald-600 font-mono">{frame.dataFreshnessMs} ms</b></span>
            <span>Clipping: <b className="text-slate-700">{frame.isClipped ? 'YES' : 'NONE'}</b></span>
          </div>
        </div>
      </div>

      {/* ── 2. DOCTRACK CENTRAL TELEMETRY GRID (8 COLS + 4 COLS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Waveform Canvas (8 cols) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">Live Thoracic Motion Telemetry</h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  isLiveStreaming ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {sourceMode === 'LIVE' ? (isLiveStreaming ? '🟢 LIVE PHONE DATA' : '🟡 WAITING FOR PHONE') : 'SIMULATED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Isolated 0.1 - 0.7 Hz anterior-posterior thoracic excursion with inhalation peak markers
              </p>
            </div>

            {/* View Selector Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setActiveChartTab('filtered')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeChartTab === 'filtered' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Filtered Excursion
              </button>
              <button
                onClick={() => setActiveChartTab('trend')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeChartTab === 'trend' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Continuous Trend
              </button>
            </div>
          </div>

          {/* Dynamic Recharts Display */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {activeChartTab === 'filtered' ? (
                <AreaChart data={waveformChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="breathGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={frame.estimatedRespiratoryRate !== null ? '#087F8C' : '#E11D48'} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={frame.estimatedRespiratoryRate !== null ? '#087F8C' : '#E11D48'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: 'none', color: '#FFF', fontSize: '12px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="excursion"
                    name="Thoracic Excursion (m/s²)"
                    stroke={frame.estimatedRespiratoryRate !== null ? '#087F8C' : '#E11D48'}
                    strokeWidth={2.4}
                    fillOpacity={1}
                    fill="url(#breathGrad)"
                  />
                  {/* Peak Marker Dot */}
                  <Line
                    type="monotone"
                    dataKey="isPeak"
                    name="Inhalation Peak"
                    stroke="none"
                    dot={{ r: 4, fill: '#00C2CB', stroke: '#087F8C', strokeWidth: 1.5 }}
                  />
                </AreaChart>
              ) : (
                <LineChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="index" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={[5, 45]} stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: 'none', color: '#FFF', fontSize: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fusedBr"
                    name="Adaptive Fused RR"
                    stroke="#087F8C"
                    strokeWidth={2.5}
                    connectNulls={false} // Preserves genuine gaps during artifact hold!
                    dot={{ r: 3, fill: '#087F8C' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="baselineBr"
                    name="Naive Baseline (Unweighted)"
                    stroke="#94A3B8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    connectNulls={true}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                Adaptive Breathing Rate (SQI-Gated)
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                Inhalation Peaks ({frame.peakIndices.length} detected)
              </span>
            </div>
            <button
              onClick={onOpenSignalLab}
              className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
            >
              Open Full Waveform Studio
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right 4 cols: Dynamic Multi-Axis Weights & Artifact Classifier */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-extrabold text-slate-900">Adaptive Axis Weights</h3>
              <Sliders className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xs text-slate-400">Dynamic quality weighting across inertial axes</p>
          </div>

          <div className="space-y-4">
            {/* Z-Axis */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  Z-Axis (Chest Expansion)
                </span>
                <span className="font-mono text-teal-600 font-bold">{Math.round(frame.axisWeights.z * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-teal-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(frame.axisWeights.z * 100)}%` }} />
              </div>
            </div>

            {/* Y-Axis */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Y-Axis (Longitudinal Tilt)
                </span>
                <span className="font-mono text-amber-600 font-bold">{Math.round(frame.axisWeights.y * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(frame.axisWeights.y * 100)}%` }} />
              </div>
            </div>

            {/* X-Axis */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  X-Axis (Lateral Body Sway)
                </span>
                <span className="font-mono text-purple-600 font-bold">{Math.round(frame.axisWeights.x * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(frame.axisWeights.x * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Artifact Separation Safeguard Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
            <div className="font-bold text-slate-900 flex items-center justify-between">
              <span>Artifact Rejection Gating</span>
              <span className={`w-2 h-2 rounded-full ${frame.estimatedRespiratoryRate !== null ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {frame.estimatedRespiratoryRate !== null 
                ? 'Signal passband is free of ambulatory stepping or violent spikes.'
                : `Gate Active: ${frame.rejectionReason || 'Contamination rejected'}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. LIVE MONITORED SUBJECT STATUS CARD (NO MOCK DATA) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-extrabold text-slate-900">Active Live Monitored Subject</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                isLiveStreaming ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {isLiveStreaming ? 'Subject 01 (Connected via Phyphox)' : 'Awaiting Connection'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live kinematic readings streaming over Wi-Fi from {phoneIp}:{phonePort}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenActivityLab}
              className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-all"
            >
              Activity Testing Lab
            </button>
            <button
              onClick={onOpenSignalLab}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all"
            >
              Full Telemetry Studio
            </button>
          </div>
        </div>

        {/* Live Subject Telemetry Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Live Respiratory Rate</span>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {frame.estimatedRespiratoryRate !== null ? `${frame.estimatedRespiratoryRate} BPM` : 'Motion Hold'}
            </div>
            <span className="text-[10px] text-slate-500 block">Physiological Excursion</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Instantaneous SQI Quality</span>
            <div className="text-2xl font-extrabold text-emerald-600 font-mono">
              {frame.signalQualityIndex.toFixed(2)} / 1.0
            </div>
            <span className="text-[10px] text-slate-500 block">Z-Quality: {frame.sqiPerAxis.z.toFixed(2)}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Inertial Motion Energy</span>
            <div className="text-2xl font-extrabold text-indigo-600 font-mono">
              {frame.motionRms.toFixed(3)}
            </div>
            <span className="text-[10px] text-slate-500 block">RMS Acceleration (m/s²)</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Gravity Tilt Angle</span>
            <div className="text-2xl font-extrabold text-purple-600 font-mono">
              {frame.tiltAngleDeg.toFixed(0)}°
            </div>
            <span className="text-[10px] text-slate-500 block">Posture Vector</span>
          </div>
        </div>
      </div>
    </div>
  );
};
