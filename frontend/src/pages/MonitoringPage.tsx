import React, { useState } from 'react';
import { 
  Play, Pause, RefreshCw, Smartphone, Wifi, WifiOff, AlertTriangle, 
  CheckCircle2, ShieldAlert, Activity, ArrowRight, Settings, Sliders, ExternalLink
} from 'lucide-react';
import { TelemetryFrame, SourceMode, ConnectionState, ActivityState } from '../types/telemetry';

interface MonitoringPageProps {
  sourceMode?: SourceMode;
  setSourceMode?: (mode: SourceMode) => void;
  currentFrame?: TelemetryFrame;
  trendHistory?: Array<{ time: number; fusedBr: number | null; baselineBr: number | null }>;
  phyphoxUrl?: string;
  setPhyphoxUrl?: (url: string) => void;
  phoneIp?: string;
  setPhoneIp?: (ip: string) => void;
  phonePort?: number;
  setPhonePort?: (port: number) => void;
  connectionState?: ConnectionState;
  onConnectPhyphox?: () => void;
  onTestPhyphox?: (url?: string) => Promise<any>;
  testResult?: {
    success: boolean;
    message: string;
    latencyMs?: number;
    hasAccel?: boolean;
    hasGyro?: boolean;
    accelStatus?: string;
    gyroStatus?: string;
    bufferNames?: string[];
  } | null;
  isMonitoring?: boolean;
  setIsMonitoring?: (m: boolean) => void;
  lastSuccessfulPoll?: string | null;
  latestError?: string | null;
  sampleCount?: number;
}

export const MonitoringPage: React.FC<MonitoringPageProps> = ({
  sourceMode = 'LIVE',
  setSourceMode,
  currentFrame,
  trendHistory = [],
  phyphoxUrl = '',
  setPhyphoxUrl,
  phoneIp = '',
  setPhoneIp,
  phonePort = 8080,
  setPhonePort,
  connectionState = 'DISCONNECTED',
  onConnectPhyphox,
  onTestPhyphox,
  testResult,
  isMonitoring = true,
  setIsMonitoring,
  lastSuccessfulPoll,
  latestError,
  sampleCount = 0,
}) => {
  // If frame is not passed, create a default awaiting-stream frame
  const frame: TelemetryFrame = currentFrame || {
    timestamp: Date.now(),
    timeVector: [],
    accelX: [],
    accelY: [],
    accelZ: [],
    filteredBreathing: [],
    peakIndices: [],
    estimatedRespiratoryRate: null,
    signalQualityIndex: 0.0,
    estimationReliability: 'SUSPENDED',
    currentActivity: 'INSUFFICIENT SIGNAL QUALITY',
    actualSamplingRate: 50,
    dataFreshnessMs: 0,
    sqiPerAxis: { x: 0, y: 0, z: 0 },
    axisWeights: { x: 0.33, y: 0.33, z: 0.34 },
    motionRms: 0,
    gyroRms: 0,
    tiltAngleDeg: 0,
    missingSampleCount: 0,
    isClipped: false,
    rejectionReason: 'Awaiting Phyphox Wi-Fi sensor packets',
    activityReason: 'No live stream detected',
    naiveBaselineBr: null,
    sensorStatus: {
      accelerometer: 'ACTIVE',
      gyroscope: 'PROBING',
      magnetometer: 'PROBING',
      microphone: 'INACTIVE',
      bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
    },
  };

  const isLiveConnected = sourceMode === 'LIVE' && connectionState === 'CONNECTED';

  return (
    <div className="space-y-6 pb-12">
      {/* ── HEADER BANNER ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Waveform Studio & Real-Time Sensor Telemetry
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
              sourceMode === 'LIVE'
                ? (connectionState === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200')
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }`}>
              {sourceMode === 'LIVE' ? (connectionState === 'CONNECTED' ? '🟢 LIVE PHYPHOX' : '🟡 WAITING FOR PHONE') : 'SIMULATED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {sourceMode === 'LIVE'
              ? (isLiveConnected ? `Streaming active from ${phyphoxUrl || 'Phyphox endpoint'} • Decimated 50 Hz DSP` : `Enter the Phyphox URL displayed on your phone below (works on any Wi-Fi or mobile hotspot)`)
              : 'Synthetic kinematic scenario active for baseline verification'}
          </p>
        </div>

        {/* Live Phone Connection Box */}
        {sourceMode === 'LIVE' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
              <input
                type="text"
                value={phyphoxUrl}
                onChange={(e) => setPhyphoxUrl && setPhyphoxUrl(e.target.value)}
                className="w-56 px-2.5 py-1 bg-white border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-teal-500"
                placeholder="e.g. http://192.168.43.1:8080"
                title="Current Phyphox experiment URL displayed on phone screen"
              />
              <button
                onClick={() => onTestPhyphox && onTestPhyphox(phyphoxUrl)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-xs shadow-xs transition-all font-sans"
                title="Probe reachability & inspect sensor buffers"
              >
                Test
              </button>
              <button
                onClick={onConnectPhyphox}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded font-bold text-xs shadow-xs transition-all font-sans"
              >
                {connectionState === 'CONNECTING' ? 'Pinging...' : 'Connect'}
              </button>
            </div>

            {/* Separate Accel & Gyro Status Indicators */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold">
              <span className={`px-2 py-1 rounded-lg border ${
                frame.sensorStatus?.accelerometer === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                ACCEL: {frame.sensorStatus?.accelerometer || 'OFFLINE'}
              </span>
              <span className={`px-2 py-1 rounded-lg border ${
                frame.sensorStatus?.gyroscope === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`} title={frame.sensorStatus?.gyroscope === 'ACTIVE' ? 'Gyroscope streaming live' : 'Gyroscope not in current Phyphox experiment. Enable Raw Sensors in Phyphox to stream gyroscope.'}>
                GYRO: {frame.sensorStatus?.gyroscope === 'ACTIVE' ? 'ACTIVE' : 'NOT IN EXP'}
              </span>
            </div>
          </div>
        )}

        {/* Small Connection Diagnostic Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-500">
          <span className={`w-2 h-2 rounded-full ${connectionState === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : (connectionState === 'CONNECTING' ? 'bg-amber-500 animate-spin' : 'bg-rose-500')}`} />
          <span>Last poll: <b className="text-slate-700">{lastSuccessfulPoll || 'None'}</b></span>
          <span>•</span>
          <span>Samples: <b className="text-slate-700">{sampleCount.toLocaleString()}</b></span>
          {latestError && (
            <>
              <span>•</span>
              <span className="text-rose-600 font-semibold truncate max-w-[200px]" title={latestError}>Error: {latestError}</span>
            </>
          )}
        </div>
      </div>

      {/* Test Diagnostic Alert Banner if recently run */}
      {testResult && (
        <div className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
          testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            <span className="font-bold">{testResult.success ? '✓ Reachability Verified:' : '✗ Connection Failed:'}</span>
            <span>{testResult.message}</span>
            {testResult.latencyMs !== undefined && (
              <span className="font-mono text-[11px] bg-white/70 px-1.5 py-0.5 rounded">
                {testResult.latencyMs} ms
              </span>
            )}
          </div>
          {testResult.bufferNames && testResult.bufferNames.length > 0 && (
            <div className="font-mono text-[11px] text-slate-600">
              Buffers found: <strong>{testResult.bufferNames.join(', ')}</strong>
            </div>
          )}
        </div>
      )}

      {/* ── B. PRIMARY METRIC CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Estimated Respiratory Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Resp Rate</span>
            <Activity className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-extrabold font-mono ${
                frame.estimatedRespiratoryRate !== null ? 'text-teal-600' : 'text-rose-600'
              }`}>
                {frame.estimatedRespiratoryRate !== null ? frame.estimatedRespiratoryRate : 'HOLD'}
              </span>
              <span className="text-xs text-slate-400 font-medium">BPM</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {frame.estimatedRespiratoryRate !== null ? 'Physiological Excursion' : (frame.rejectionReason || 'Awaiting packets')}
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Target: 12 - 20 bpm
          </div>
        </div>

        {/* Card 2: Signal Quality Index */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Signal Quality</span>
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-extrabold font-mono ${
                frame.signalQualityIndex >= 0.70 ? 'text-emerald-600' : (frame.signalQualityIndex >= 0.40 ? 'text-amber-600' : 'text-rose-600')
              }`}>
                {frame.signalQualityIndex.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">/ 1.0</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {frame.signalQualityIndex >= 0.70 ? '● Optimal Signal' : (frame.signalQualityIndex >= 0.40 ? '▲ Degraded Noise' : '✕ Low / Motion')}
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                frame.signalQualityIndex >= 0.70 ? 'bg-emerald-500' : (frame.signalQualityIndex >= 0.40 ? 'bg-amber-500' : 'bg-rose-500')
              }`}
              style={{ width: `${Math.round(frame.signalQualityIndex * 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Estimation Reliability */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Reliability</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="my-2">
            <span className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded ${
              frame.estimationReliability === 'HIGH' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              frame.estimationReliability === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {frame.estimationReliability}
            </span>
            <p className="text-[10px] text-slate-400 mt-1">
              {frame.estimationReliability === 'HIGH' ? 'Confidence > 75%' : (frame.estimationReliability === 'MEDIUM' ? 'Advisory Notice' : 'Gated Off')}
            </p>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {frame.rejectionReason || 'No Active Gating'}
          </div>
        </div>

        {/* Card 4: Current Activity Assessment */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Activity</span>
            <Smartphone className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="my-2">
            <div className="text-xs font-extrabold text-slate-900 leading-tight truncate">
              {frame.currentActivity}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 truncate">
              {frame.activityReason}
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Motion RMS: {frame.motionRms.toFixed(3)}
          </div>
        </div>

        {/* Card 5: Actual Sampling Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Sampling Rate</span>
            <RefreshCw className="w-3.5 h-3.5 text-cyan-600" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold font-mono text-cyan-600">50.0</span>
              <span className="text-xs text-slate-400 font-mono">Hz DSP</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              From ~{frame.actualSamplingRate.toFixed(0)} Hz Phone IMU
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Dynamic Decimation
          </div>
        </div>

        {/* Card 6: Data Freshness */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Latency</span>
            <Wifi className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold font-mono text-emerald-600">
                {frame.dataFreshnessMs}
              </span>
              <span className="text-xs text-slate-400 font-mono">ms</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Zero Stale Buffers
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Loss: {frame.missingSampleCount} dropped
          </div>
        </div>
      </div>

      {/* ── B2. ACTIVITY-AWARE RESPIRATORY INTERPRETATION CARD (Part 11 & 16.3) ── */}
      {(() => {
        const interp = frame.interpretation || {
          status_code: frame.estimatedRespiratoryRate === null ? 'INSUFFICIENT_QUALITY' : 'WITHIN_RESTING_RANGE',
          primary_flag: frame.estimatedRespiratoryRate === null ? 'SIGNAL QUALITY INSUFFICIENT' : 'WITHIN COMMON ADULT RESTING REFERENCE RANGE',
          message: frame.estimatedRespiratoryRate === null
            ? (frame.rejectionReason || 'Rate suppressed due to motion or inadequate signal quality.')
            : `Measured rate of ${frame.estimatedRespiratoryRate} bpm within common adult resting baseline (12–20 bpm).`,
          resting_threshold_applied: frame.estimatedRespiratoryRate !== null && frame.currentActivity === 'LOW MOTION',
          is_persistent_elevation: false,
          recovery_trend_observed: false,
          recovery_duration_sec: 0,
          confidence: frame.signalQualityIndex,
          estimated_br_bpm: frame.estimatedRespiratoryRate,
          clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
        };

        const isElevated = interp.status_code === 'POSSIBLE_ELEVATED_RESTING';
        const isBelow = interp.status_code === 'BELOW_RESTING_RANGE';
        const isExercise = interp.status_code === 'EXERCISE_CONTEXT';
        const isRecovery = interp.status_code === 'RECOVERY_OBSERVATION';
        const isInsufficient = interp.status_code === 'INSUFFICIENT_QUALITY' || interp.status_code === 'STALE_DATA';

        const borderColor = isElevated ? 'border-amber-300 bg-amber-50/60' :
          isBelow ? 'border-sky-300 bg-sky-50/60' :
          isExercise ? 'border-indigo-300 bg-indigo-50/60' :
          isRecovery ? 'border-purple-300 bg-purple-50/60' :
          isInsufficient ? 'border-slate-300 bg-slate-50/80' :
          'border-teal-200 bg-teal-50/60';

        const badgeColor = isElevated ? 'bg-amber-100 text-amber-800 border-amber-300' :
          isBelow ? 'bg-sky-100 text-sky-800 border-sky-300' :
          isExercise ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
          isRecovery ? 'bg-purple-100 text-purple-800 border-purple-300' :
          isInsufficient ? 'bg-slate-200 text-slate-700 border-slate-300' :
          'bg-emerald-100 text-emerald-800 border-emerald-300';

        return (
          <div className={`p-5 rounded-2xl border ${borderColor} shadow-xs space-y-4`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-navy-800 tracking-tight flex items-center gap-2">
                    Activity-Aware Respiratory Interpretation
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Part 11 Physiological Logic
                    </span>
                  </h3>
                  <p className="text-[11px] text-clinical-muted">
                    Rates are evaluated strictly in the context of user activity and signal quality
                  </p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${badgeColor}`}>
                {interp.primary_flag}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
              <div className="md:col-span-8 space-y-2">
                <p className="text-slate-800 font-medium leading-relaxed">
                  {interp.message}
                </p>
                <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 pt-1">
                  <span>Current Activity: <b className="text-slate-800">{frame.currentActivity}</b></span>
                  <span>•</span>
                  <span>Resting Threshold Applied: <b className={interp.resting_threshold_applied ? 'text-teal-700 font-bold' : 'text-slate-600'}>
                    {interp.resting_threshold_applied ? 'YES (12–20 bpm)' : 'NO (Exertion / Unstable)'}
                  </b></span>
                  {interp.recovery_trend_observed && (
                    <>
                      <span>•</span>
                      <span className="text-purple-700 font-bold">Recovery Window: {interp.recovery_duration_sec}s</span>
                    </>
                  )}
                  {interp.is_persistent_elevation && (
                    <>
                      <span>•</span>
                      <span className="text-amber-700 font-bold">Persistent Across ≥3 Windows</span>
                    </>
                  )}
                </div>
              </div>

              <div className="md:col-span-4 bg-white/80 p-3 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-semibold">Signal Integrity Check</span>
                  <span className={`font-mono font-bold ${frame.signalQualityIndex >= 0.4 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {frame.signalQualityIndex >= 0.4 ? 'ADEQUATE' : 'REJECTED'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 leading-snug">
                  <strong>Scientific Disclaimer: </strong>
                  {interp.clinical_disclaimer}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── C. MULTI-CHANNEL WAVEFORMS ── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600" />
              Live Multi-Channel Accelerometer & Gyroscope Telemetry
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real triaxial kinetic signals streaming from smartphone hardware via Phyphox
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100">
            Source: {sourceMode} ({connectionState})
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Channel 1: Filtered Breathing Waveform + Inhalation Peak Markers */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-teal-700 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Isolated Respiratory Excursion (0.1 - 0.7 Hz)
              </span>
              <span className="font-mono text-slate-400">Excursion (m/s²)</span>
            </div>
            <div className="h-32 bg-white rounded-lg p-2 border border-slate-200 relative overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 80">
                <line x1="0" y1="40" x2="300" y2="40" stroke="#F1F5F9" />
                <path
                  d={frame.filteredBreathing.reduce((acc, val, idx, arr) => {
                    const x = (idx / Math.max(1, arr.length - 1)) * 300;
                    const y = 40 - val * 70;
                    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke={frame.estimatedRespiratoryRate !== null ? '#087F8C' : '#E11D48'}
                  strokeWidth="2.2"
                />
                {frame.peakIndices.map((pIdx, k) => {
                  const x = (pIdx / 60) * 300;
                  const val = frame.filteredBreathing[pIdx] || 0;
                  const y = 40 - val * 70;
                  return (
                    <g key={k}>
                      <circle cx={x} cy={y} r="4" fill="#00C2CB" stroke="#087F8C" strokeWidth="1.5" />
                      <line x1={x} y1={y} x2={x} y2={y - 10} stroke="#00C2CB" strokeWidth="1" strokeDasharray="1 1" />
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Peaks Detected: <strong className="text-slate-700">{frame.peakIndices.length}</strong></span>
              <span>Passband: 6 – 42 breaths/min</span>
            </div>
          </div>

          {/* Channel 2: Raw Accelerometer Z-Axis (Anterior-Posterior Chest Expansion) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800">Raw Z-Axis IMU (Anterior-Posterior)</span>
              <span className="font-mono text-slate-400">m/s² (with Gravity)</span>
            </div>
            <div className="h-32 bg-white rounded-lg p-2 border border-slate-200 relative overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 80">
                <path
                  d={frame.accelZ.reduce((acc, val, idx, arr) => {
                    const x = (idx / Math.max(1, arr.length - 1)) * 300;
                    const y = 70 - ((val + 2) / 20) * 60;
                    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="1.8"
                />
              </svg>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Z-Quality: <strong className="text-slate-700 font-mono">{frame.sqiPerAxis.z.toFixed(2)}</strong></span>
              <span>Dynamic Weight: <strong className="text-indigo-600 font-mono">{Math.round(frame.axisWeights.z * 100)}%</strong></span>
            </div>
          </div>

          {/* Channel 3: Raw Accelerometer X & Y (Lateral & Longitudinal) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-amber-700">Raw X & Y Axes (Lateral & Pitch)</span>
              <span className="font-mono text-slate-400">m/s²</span>
            </div>
            <div className="h-32 bg-white rounded-lg p-2 border border-slate-200 relative overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 80">
                <path
                  d={frame.accelY.reduce((acc, val, idx, arr) => {
                    const x = (idx / Math.max(1, arr.length - 1)) * 300;
                    const y = 50 - (val / 15) * 40;
                    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="1.5"
                />
                <path
                  d={frame.accelX.reduce((acc, val, idx, arr) => {
                    const x = (idx / Math.max(1, arr.length - 1)) * 300;
                    const y = 50 - (val / 10) * 30;
                    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke="#9333EA"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span className="text-amber-700">Y-Weight: {Math.round(frame.axisWeights.y * 100)}%</span>
              <span className="text-purple-700">X-Weight: {Math.round(frame.axisWeights.x * 100)}%</span>
            </div>
          </div>

          {/* Channel 4: Gyroscope Angular Velocity */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-indigo-700 flex items-center gap-1.5">
                Gyroscope Angular Velocity
                {frame.sensorStatus?.gyroscope === 'ACTIVE' ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono font-bold">STREAMING</span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-sans font-medium">INACTIVE IN CURRENT EXPERIMENT</span>
                )}
              </span>
              <span className="font-mono text-slate-400">rad/s</span>
            </div>
            <div className="h-32 bg-white rounded-lg p-2 border border-slate-200 relative overflow-hidden">
              {frame.gyroX && frame.gyroX.length > 0 && frame.sensorStatus?.gyroscope === 'ACTIVE' ? (
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 80">
                  <line x1="0" y1="40" x2="300" y2="40" stroke="#F1F5F9" />
                  <path
                    d={frame.gyroX.reduce((acc, val, idx, arr) => {
                      const x = (idx / Math.max(1, arr.length - 1)) * 300;
                      const y = 40 - val * 30;
                      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                    }, '')}
                    fill="none"
                    stroke="#4F46E5"
                    strokeWidth="1.8"
                  />
                  {frame.gyroY && frame.gyroY.length > 0 && (
                    <path
                      d={frame.gyroY.reduce((acc, val, idx, arr) => {
                        const x = (idx / Math.max(1, arr.length - 1)) * 300;
                        const y = 40 - val * 30;
                        return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                      }, '')}
                      fill="none"
                      stroke="#818CF8"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                  )}
                </svg>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-3 text-xs text-slate-500 bg-slate-50/70 rounded">
                  <div className="font-semibold text-slate-700 mb-1">Gyroscope channel inactive in active experiment</div>
                  <p className="text-[11px] text-slate-400 max-w-sm">
                    Phyphox &apos;Acceleration with g&apos; provides only linear accelerometer buffers. To stream both Accelerometer &amp; Gyroscope simultaneously, open <strong>&apos;Raw Sensors&apos;</strong> in Phyphox.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Gyro RMS: <strong className="text-slate-700 font-mono">{(frame.gyroRms || 0).toFixed(3)} rad/s</strong></span>
              <span>Tilt: <strong className="text-indigo-600 font-mono">{(frame.tiltAngleDeg || 0).toFixed(0)}°</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ── D. LONGITUDINAL TREND CHART (Discontinuous across invalid intervals) ── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              Continuous Respiratory-Rate Trend & Gating Timeline
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Invalid or suppressed periods appear as blank gaps to prevent misleading linear interpolation
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-teal-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
              Valid Rate (BPM)
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2.5 h-1 bg-slate-300" />
              12–20 Adult Range
            </span>
          </div>
        </div>

        <div className="h-44 bg-slate-50 rounded-xl p-3 border border-slate-200 relative overflow-hidden flex flex-col justify-between">
          <div className="relative w-full h-32">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 100">
              {/* Normal adult reference band: 12 to 20 bpm (mapped from 0 to 45 bpm) */}
              <rect x="0" y={100 - (20 / 45) * 100} width="400" height={(8 / 45) * 100} fill="#E6F5F4" opacity="0.6" />
              <line x1="0" y1={100 - (20 / 45) * 100} x2="400" y2={100 - (20 / 45) * 100} stroke="#99D5D0" strokeDasharray="3 3" />
              <line x1="0" y1={100 - (12 / 45) * 100} x2="400" y2={100 - (12 / 45) * 100} stroke="#99D5D0" strokeDasharray="3 3" />

              {/* Data points and disconnected segments */}
              {trendHistory.map((pt, idx) => {
                if (pt.fusedBr === null) return null;
                const x = (idx / Math.max(1, trendHistory.length - 1)) * 400;
                const y = Math.max(5, Math.min(95, 100 - (pt.fusedBr / 45) * 100));

                const prev = trendHistory[idx - 1];
                const prevX = ((idx - 1) / Math.max(1, trendHistory.length - 1)) * 400;
                const prevY = prev && prev.fusedBr !== null ? Math.max(5, Math.min(95, 100 - (prev.fusedBr / 45) * 100)) : null;

                return (
                  <g key={idx}>
                    {prevY !== null && (
                      <line x1={prevX} y1={prevY} x2={x} y2={y} stroke="#087F8C" strokeWidth="2" />
                    )}
                    <circle cx={x} cy={y} r="3" fill="#087F8C" />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono border-t border-slate-200/60 pt-2">
            <span>-30s History Window</span>
            <span>Current Window: {frame.estimatedRespiratoryRate !== null ? `${frame.estimatedRespiratoryRate} bpm` : 'SUPPRESSED (Quality Gate)'}</span>
            <span>Real-time Decimation</span>
          </div>
        </div>
      </div>

      {/* ── E. MOTION-INTERFERENCE & SENSOR STATUS PANELS (Part 16.5 & 16.6) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Motion Interference Panel (Section 16.5) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-navy-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              Motion-Interference Assessment (Section 16.5)
            </h3>
            <p className="text-xs text-clinical-muted">
              Physical movement metrics evaluated for artifact contamination
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block mb-1">Current Movement State</span>
              <strong className="text-slate-900 font-mono text-sm">{frame.currentActivity}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block mb-1">Motion RMS Intensity</span>
              <strong className="text-slate-900 font-mono text-sm">{frame.motionRms.toFixed(3)} m/s²</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block mb-1">Thoracic Tilt Angle</span>
              <strong className="text-slate-900 font-mono text-sm">{frame.tiltAngleDeg.toFixed(1)}°</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block mb-1">Signal Retention Action</span>
              <strong className={`font-mono text-sm ${frame.estimatedRespiratoryRate !== null ? 'text-emerald-700' : 'text-rose-600'}`}>
                {frame.estimatedRespiratoryRate !== null ? 'RETAINED' : 'SUPPRESSED'}
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900">
            <strong>Motion Impact Explanation: </strong>
            {frame.rejectionReason || 'Kinetic noise is within normal limits; respiratory pattern estimation is active.'}
          </div>
        </div>

        {/* Right: Sensor Status Audit Panel (Section 16.6) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-navy-800 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-teal-600" />
              Verified Hardware Sensors Audit (Section 16.6)
            </h3>
            <p className="text-xs text-clinical-muted">
              Honest hardware status — never reporting active without verified stream
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-800">MEMS Triaxial Accelerometer</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ACTIVE (X, Y, Z)
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-800">Triaxial Gyroscope</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                frame.gyroRms > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                {frame.gyroRms > 0 ? 'ACTIVE (Angular Velocity)' : 'NOT AVAILABLE'}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-800">Magnetometer</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                OPTIONAL / PROBING
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-800">Microphone Acoustic Stream</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                ACOUSTIC STREAM INACTIVE
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-800">Bioimpedance Pneumography</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                NOT CONNECTED — FUTURE HARDWARE SCOPE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
