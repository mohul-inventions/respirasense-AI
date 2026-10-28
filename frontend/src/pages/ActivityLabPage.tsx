import React, { useState, useEffect, useRef } from 'react';
import { 
  FlaskConical, Play, Square, CheckCircle2, AlertTriangle, FileText, 
  Download, Clock, Activity, ShieldCheck, RefreshCw, BarChart2
} from 'lucide-react';
import { ClinicalDspEngine } from '../services/dspEngine';
import { TelemetryFrame, ActivityLabSession } from '../types/telemetry';

const TEST_ACTIVITIES = [
  { id: 'quiet', label: '1. Quiet / Low-Motion Breathing', scenario: 'resting', expected: 'High SQI (≥0.70), Rate Available (12-20 bpm)' },
  { id: 'speaking', label: '2. Speaking Phonation', scenario: 'coughing', expected: 'Mild SQI degradation, Transient Flag' },
  { id: 'walking', label: '3. Walking Ambulatory Cadence', scenario: 'walking', expected: 'Low SQI (<0.35), Rate Safely Suspended' },
  { id: 'posture', label: '4. Posture Transition (Tilt Shift)', scenario: 'posture_transition', expected: 'Tilt Spike (>15°), Rate Suspended' },
  { id: 'cough', label: '5. Cough-Like Kinetic Transient', scenario: 'coughing', expected: 'Transient Energy Impulse, Rate Hold' },
  { id: 'recovery', label: '6. Recovery After Movement', scenario: 'resting', expected: 'Stabilizing SQI, Rate Estimation Resumed' },
];

export const ActivityLabPage: React.FC = () => {
  const [selectedActivity, setSelectedActivity] = useState(TEST_ACTIVITIES[0].id);
  const [notes, setNotes] = useState('');
  const [activeSession, setActiveSession] = useState<ActivityLabSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<ActivityLabSession[]>([]);

  const [dspEngine] = useState(() => new ClinicalDspEngine());
  const [currentFrame, setCurrentFrame] = useState<TelemetryFrame>(() => dspEngine.generateSyntheticScenario('resting', 0));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const accumulatedBrRef = useRef<number[]>([]);
  const accumulatedSqiRef = useRef<number[]>([]);
  const suppressedTicksRef = useRef<number>(0);
  const totalTicksRef = useRef<number>(0);
  const activityCountsRef = useRef<Record<string, number>>({});
  const tickRef = useRef(0);

  // Live Stream Interval during Active Session
  useEffect(() => {
    const timer = setInterval(() => {
      tickRef.current += 1;
      const curActivityObj = TEST_ACTIVITIES.find((a) => a.id === selectedActivity) || TEST_ACTIVITIES[0];
      const frame = dspEngine.generateSyntheticScenario(curActivityObj.scenario, tickRef.current);
      setCurrentFrame(frame);

      if (activeSession && activeSession.status === 'IN_PROGRESS') {
        setElapsedSeconds((prev) => prev + 1);
        totalTicksRef.current += 1;
        accumulatedSqiRef.current.push(frame.signalQualityIndex);

        if (frame.estimatedRespiratoryRate !== null) {
          accumulatedBrRef.current.push(frame.estimatedRespiratoryRate);
        } else {
          suppressedTicksRef.current += 1;
        }

        const actName = frame.currentActivity;
        activityCountsRef.current[actName] = (activityCountsRef.current[actName] || 0) + 1;
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession, selectedActivity, dspEngine]);

  const handleStartSession = () => {
    const act = TEST_ACTIVITIES.find((a) => a.id === selectedActivity)?.label || 'Unknown';
    accumulatedBrRef.current = [];
    accumulatedSqiRef.current = [];
    suppressedTicksRef.current = 0;
    totalTicksRef.current = 0;
    activityCountsRef.current = {};
    setElapsedSeconds(0);

    const newSession: ActivityLabSession = {
      id: `SESSION-${Date.now().toString().slice(-6)}`,
      activityLabel: act,
      notes,
      startTime: Date.now(),
      durationSec: 0,
      samplesRecorded: 0,
      meanBr: null,
      minBr: null,
      maxBr: null,
      meanSqi: 0,
      suppressionRatio: 0,
      detectedActivities: {},
      status: 'IN_PROGRESS',
    };

    setActiveSession(newSession);
  };

  const handleStopSession = () => {
    if (!activeSession) return;

    const brs = accumulatedBrRef.current;
    const sqis = accumulatedSqiRef.current;
    const meanBr = brs.length > 0 ? +(brs.reduce((a, b) => a + b, 0) / brs.length).toFixed(1) : null;
    const minBr = brs.length > 0 ? Math.min(...brs) : null;
    const maxBr = brs.length > 0 ? Math.max(...brs) : null;
    const meanSqi = sqis.length > 0 ? +(sqis.reduce((a, b) => a + b, 0) / sqis.length).toFixed(2) : 0;
    const suppressionRatio = totalTicksRef.current > 0 ? +((suppressedTicksRef.current / totalTicksRef.current) * 100).toFixed(0) : 0;

    const completed: ActivityLabSession = {
      ...activeSession,
      endTime: Date.now(),
      durationSec: elapsedSeconds,
      samplesRecorded: totalTicksRef.current * 50,
      meanBr,
      minBr,
      maxBr,
      meanSqi,
      suppressionRatio,
      detectedActivities: { ...activityCountsRef.current },
      status: 'COMPLETED',
    };

    setActiveSession(null);
    setSessionHistory((prev) => [completed, ...prev]);
  };

  const downloadAuditReport = (session: ActivityLabSession) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(session, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${session.id}_Audit_Report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Header */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" />
          Controlled Activity Evaluation
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy-800 tracking-tight">
          Physical Activity Testing Laboratory
        </h1>
        <p className="text-sm sm:text-base text-clinical-muted leading-relaxed">
          Annotate controlled test intervals with manually labeled activities to evaluate how the system isolates motion artifacts, assesses signal quality, and suppresses unreliable rate estimates.
        </p>
      </div>

      {/* Protocol Configuration & Live Control */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Test Setup Controls */}
        <div className="lg:col-span-5 clinical-card p-6 bg-white space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-navy-800 text-base">1. Configure Test Protocol</h3>
            <p className="text-xs text-clinical-muted">Select an activity to simulate or test on the smartphone</p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-navy-800 block">Manual Activity Label:</label>
            <div className="space-y-2">
              {TEST_ACTIVITIES.map((act) => (
                <button
                  key={act.id}
                  disabled={activeSession !== null}
                  onClick={() => setSelectedActivity(act.id)}
                  className={`w-full p-3 rounded-lg border text-left text-xs transition-all ${
                    selectedActivity === act.id
                      ? 'border-purple-500 bg-purple-50/70 text-purple-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-clinical-muted hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-navy-800">{act.label}</div>
                  <div className="text-[11px] text-clinical-muted mt-0.5 font-normal">Expected: {act.expected}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-navy-800 block">Investigator Notes (Optional):</label>
            <input
              type="text"
              value={notes}
              disabled={activeSession !== null}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Subject lying supine, normal tidal breathing"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2">
            {!activeSession ? (
              <button
                onClick={handleStartSession}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all"
              >
                <Play className="w-4 h-4" />
                Start Test Protocol Session
              </button>
            ) : (
              <button
                onClick={handleStopSession}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all animate-pulse"
              >
                <Square className="w-4 h-4" />
                Stop Session ({elapsedSeconds}s Elapsed)
              </button>
            )}
          </div>
        </div>

        {/* Right: Live Telemetry Observation */}
        <div className="lg:col-span-7 clinical-card p-6 bg-navy-900 text-white border-navy-700 space-y-5">
          <div className="flex justify-between items-center border-b border-navy-800 pb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${activeSession ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">
                {activeSession ? `RECORDING: ${activeSession.activityLabel}` : 'STANDBY (Select Protocol)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-teal-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{elapsedSeconds}s</span>
            </div>
          </div>

          {/* Metrics Overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-navy-800 border border-navy-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Live Rate</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-teal-400">
                {currentFrame.estimatedRespiratoryRate ? `${currentFrame.estimatedRespiratoryRate} BPM` : 'SUSPENDED'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 truncate">
                {currentFrame.rejectionReason || 'Reliable Window'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-navy-800 border border-navy-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Live SQI</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-emerald-400">
                {currentFrame.signalQualityIndex.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Z-Quality: {currentFrame.sqiPerAxis.z.toFixed(2)}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-navy-800 border border-navy-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Classifier</span>
              <div className="text-xs font-bold text-slate-200 mt-1 truncate">
                {currentFrame.currentActivity}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 truncate">
                Motion RMS: {currentFrame.motionRms.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Real-Time Waveform */}
          <div className="space-y-1">
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Filtered Thoracic Waveform (Z-Excursion)</span>
              <span className="text-teal-400 font-mono">0.1 - 0.7 Hz</span>
            </div>
            <div className="h-28 bg-navy-800/80 rounded-lg p-2 border border-navy-700 overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 70">
                <line x1="0" y1="35" x2="300" y2="35" stroke="rgba(255,255,255,0.06)" />
                <path
                  d={currentFrame.filteredBreathing.reduce((acc, val, idx, arr) => {
                    const x = (idx / (arr.length - 1)) * 300;
                    const y = 35 - val * 65;
                    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke={currentFrame.estimatedRespiratoryRate ? '#00E5FF' : '#F43F5E'}
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-navy-800/50 p-2.5 rounded-lg border border-navy-700/60">
            <strong>Methodology Note: </strong> Manual activity labels are user-entered annotations to evaluate algorithm response under deliberate physical movements.
          </div>
        </div>
      </div>

      {/* Session Audit Summary Log */}
      <div className="clinical-card p-6 bg-white space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-navy-800 text-base">2. Completed Test Session Audits</h3>
            <p className="text-xs text-clinical-muted">Quantitative evaluation across test sessions</p>
          </div>
          <span className="text-xs font-mono font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded">
            {sessionHistory.length} Sessions Logged
          </span>
        </div>

        {sessionHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-clinical-muted">
            No test sessions recorded yet. Start a session above to generate an audit report.
          </div>
        ) : (
          <div className="space-y-3">
            {sessionHistory.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <span className="text-xs font-bold text-navy-800 font-mono">{s.id}</span>
                    <span className="mx-2 text-slate-300">•</span>
                    <span className="text-xs font-semibold text-purple-700">{s.activityLabel}</span>
                    {s.notes && <span className="text-xs text-clinical-muted italic ml-2">({s.notes})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">{s.durationSec}s duration</span>
                    <button
                      onClick={() => downloadAuditReport(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-navy-800 shadow-xs"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      Export JSON
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-clinical-muted text-[10px] block">Mean Respiratory Rate</span>
                    <span className="font-mono font-bold text-navy-800">{s.meanBr ? `${s.meanBr} bpm` : '100% Gated Off'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-clinical-muted text-[10px] block">Rate Range (Min - Max)</span>
                    <span className="font-mono font-bold text-navy-800">{s.minBr ? `${s.minBr} - ${s.maxBr} bpm` : 'N/A'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-clinical-muted text-[10px] block">Mean SQI Quality</span>
                    <span className="font-mono font-bold text-emerald-600">{s.meanSqi.toFixed(2)} / 1.0</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-clinical-muted text-[10px] block">Motion Gating Ratio</span>
                    <span className="font-mono font-bold text-purple-600">{s.suppressionRatio}% of interval</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
