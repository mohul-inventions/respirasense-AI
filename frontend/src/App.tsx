import React, { useState, useEffect, useRef } from 'react';
import { PrototypeDashboard } from './components/PrototypeDashboard';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { HomePage } from './pages/HomePage';
import { MonitoringPage } from './pages/MonitoringPage';
import { ActivityLabPage } from './pages/ActivityLabPage';
import { ValidationPage } from './pages/ValidationPage';
import { TechnologyPage } from './pages/TechnologyPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { AboutPage } from './pages/AboutPage';

import { ClinicalDspEngine } from './services/dspEngine';
import { PhyphoxClient } from './services/phyphoxClient';
import { TelemetryFrame, SourceMode, ConnectionState } from './types/telemetry';

export const App: React.FC = () => {
  // Mode: default to the requested Prototype MED-PS-006 Single-Page Dashboard
  const [viewMode, setViewMode] = useState<'PROTOTYPE_MED_PS_006' | 'PORTAL'>('PROTOTYPE_MED_PS_006');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [sourceMode, setSourceMode] = useState<SourceMode>('LIVE');
  const [scenario, setScenario] = useState<string>('resting');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);

  // Phone connection (Configurable for any Wi-Fi or mobile hotspot)
  const [phyphoxUrl, setPhyphoxUrl] = useState<string>(() => {
    return localStorage.getItem('respirasense_phyphox_url') || 'http://192.168.43.1:8080';
  });
  const [phoneIp, setPhoneIp] = useState<string>('192.168.43.1');
  const [phonePort, setPhonePort] = useState<number>(8080);
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState<string | null>(null);
  const [lastSuccessfulPoll, setLastSuccessfulPoll] = useState<string | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    hasAccel?: boolean;
    hasGyro?: boolean;
    accelStatus?: string;
    gyroStatus?: string;
    bufferNames?: string[];
  } | null>(null);

  // DSP & Hardware
  const [dspEngine] = useState(() => new ClinicalDspEngine());
  const [phyphoxClient] = useState(() => new PhyphoxClient(localStorage.getItem('respirasense_phyphox_url') || 'http://192.168.43.1:8080'));

  // Current Telemetry Frame & Trend Histories
  const [currentFrame, setCurrentFrame] = useState<TelemetryFrame>(() => ({
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
  }));
  const [trendHistory, setTrendHistory] = useState<Array<{ time: number; fusedBr: number | null; baselineBr: number | null }>>([]);

  const stepCounterRef = useRef(0);

  const handleTestPhyphox = async (targetUrl?: string) => {
    const urlToTest = (targetUrl || phyphoxUrl).trim();
    if (!urlToTest) {
      setTestResult({
        success: false,
        message: 'Please enter a valid Phyphox URL (e.g. http://192.168.43.1:8080)',
      });
      return;
    }

    try {
      const res = await fetch(`/api/phyphox/test?base_url=${encodeURIComponent(urlToTest)}`);
      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: data.success,
          message: data.message,
          latencyMs: data.latency_ms,
          hasAccel: data.has_accel,
          hasGyro: data.has_gyro,
          accelStatus: data.accel_status,
          gyroStatus: data.gyro_status,
          bufferNames: data.buffer_names,
        });
        return data;
      }
    } catch {
      // Backend unavailable, fallback to client-side test
    }

    phyphoxClient.setEndpoint(urlToTest);
    const clientRes = await phyphoxClient.testConnection();
    setTestResult({
      success: clientRes.success,
      message: clientRes.message,
      hasAccel: clientRes.hasAccel,
      hasGyro: clientRes.hasGyro,
      bufferNames: clientRes.bufferNames,
    });
    return clientRes;
  };

  const handleConnectPhyphox = async () => {
    setConnectionState('CONNECTING');
    setConnectionErrorMsg(null);
    setLatestError(null);

    const cleanUrl = phyphoxUrl.trim();
    if (!cleanUrl) {
      setConnectionState('ERROR');
      setConnectionErrorMsg('Please specify the Phyphox URL displayed on your phone');
      return;
    }

    // Persist URL
    localStorage.setItem('respirasense_phyphox_url', cleanUrl);

    // 1. Trigger the genuine Python backend connection function (/api/connect)
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: cleanUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConnectionState('CONNECTED');
          setConnectionErrorMsg(null);
          setLatestError(null);
          setLastSuccessfulPoll(new Date().toLocaleTimeString());
          setSourceMode('LIVE');
          if (data.phone_ip) setPhoneIp(data.phone_ip);
          if (data.port) setPhonePort(data.port);
          return;
        } else {
          setConnectionState('ERROR');
          setConnectionErrorMsg(data.message);
          setLatestError(data.message);
          return;
        }
      }
    } catch {
      // Backend request fallback to client-side probe
    }

    // 2. Client-side fallback probe if backend is restarting
    phyphoxClient.setEndpoint(cleanUrl);
    const res2 = await phyphoxClient.testConnection();
    if (res2.success) {
      setConnectionState('CONNECTED');
      setConnectionErrorMsg(null);
      setLatestError(null);
      setLastSuccessfulPoll(new Date().toLocaleTimeString());
      setSourceMode('LIVE');
    } else {
      setConnectionState('ERROR');
      setConnectionErrorMsg(res2.message);
      setLatestError(res2.message);
    }
  };

  // Attempt initial connection to phone on load
  useEffect(() => {
    if (phyphoxUrl) {
      handleConnectPhyphox();
    }
  }, []);

  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(async () => {
      stepCounterRef.current += 1;
      const now = new Date();

      if (sourceMode === 'SIMULATED') {
        try {
          const res = await fetch(`/api/telemetry?source=simulated&scenario=${scenario}`);
          if (res.ok) {
            const data = await res.json();
            if (data.connected !== false) {
              setConnectionState('CONNECTED');
              setLastSuccessfulPoll(now.toLocaleTimeString());
              setSampleCount((prev) => prev + (data.accel_z?.length || 50));
              const mapped: TelemetryFrame = {
                timestamp: data.timestamp ? Math.round(data.timestamp * 1000) : Date.now(),
                timeVector: data.time_vector || [],
                accelX: data.accel_x || [],
                accelY: data.accel_y || [],
                accelZ: data.accel_z || [],
                filteredBreathing: data.filtered_z || [],
                peakIndices: data.peak_indices || [],
                estimatedRespiratoryRate: data.fused_br_bpm !== undefined ? data.fused_br_bpm : null,
                signalQualityIndex: data.confidence !== undefined ? +data.confidence.toFixed(2) : 0,
                estimationReliability: data.confidence >= 0.7 ? 'HIGH' : (data.confidence >= 0.4 ? 'MEDIUM' : 'SUSPENDED'),
                currentActivity: data.activity || 'LOW MOTION',
                actualSamplingRate: data.measured_sample_rate || 50,
                dataFreshnessMs: 35,
                sqiPerAxis: {
                  x: data.sqi_scores?.x !== undefined ? +data.sqi_scores.x.toFixed(2) : 0.33,
                  y: data.sqi_scores?.y !== undefined ? +data.sqi_scores.y.toFixed(2) : 0.33,
                  z: data.sqi_scores?.z !== undefined ? +data.sqi_scores.z.toFixed(2) : 0.34,
                },
                axisWeights: {
                  x: data.weights?.x !== undefined ? +data.weights.x.toFixed(2) : 0.33,
                  y: data.weights?.y !== undefined ? +data.weights.y.toFixed(2) : 0.33,
                  z: data.weights?.z !== undefined ? +data.weights.z.toFixed(2) : 0.34,
                },
                motionRms: data.motion_rms || 0,
                gyroRms: data.gyro_rms || 0,
                tiltAngleDeg: data.tilt_deg || 0,
                missingSampleCount: data.missing_samples_count || 0,
                isClipped: data.is_saturated || false,
                rejectionReason: data.rejection_reason || null,
                activityReason: data.activity_reason || '',
                naiveBaselineBr: data.baseline_br_bpm !== undefined ? data.baseline_br_bpm : null,
                interpretation: data.interpretation,
                sensorStatus: {
                  accelerometer: 'ACTIVE',
                  gyroscope: 'ACTIVE',
                  magnetometer: 'PROBING',
                  microphone: 'INACTIVE',
                  bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
                },
              };
              setCurrentFrame(mapped);
              setTrendHistory((prev) => [
                ...prev.slice(-39),
                {
                  time: Math.round(now.getTime() / 1000) % 10000,
                  fusedBr: mapped.estimatedRespiratoryRate,
                  baselineBr: mapped.naiveBaselineBr,
                },
              ]);
              return;
            }
          }
        } catch {}

        // Fallback synthetic generator for testing
        const frame = dspEngine.generateSyntheticScenario(scenario, stepCounterRef.current);
        setCurrentFrame(frame);
        setTrendHistory((prev) => [
          ...prev.slice(-39),
          {
            time: Math.round(now.getTime() / 1000) % 10000,
            fusedBr: frame.estimatedRespiratoryRate,
            baselineBr: frame.naiveBaselineBr,
          },
        ]);
      } else {
        // LIVE MODE (Queries user-configured Phyphox Base URL)
        let gotLive = false;

        // Ingest from Python backend /api/telemetry (Python queries Phyphox, bypasses browser CORS)
        try {
          const res = await fetch(`/api/telemetry?source=live&base_url=${encodeURIComponent(phyphoxUrl)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.connected === false || data.status === 'DISCONNECTED') {
              setConnectionState('ERROR');
              const err = data.error || 'Awaiting live sensor stream from Phyphox';
              setLatestError(err);
              setConnectionErrorMsg(err);
              // CRITICAL: NEVER silently substitute synthetic data! Keep hold frame:
              setCurrentFrame((prev) => ({
                ...prev,
                timestamp: Date.now(),
                estimatedRespiratoryRate: null,
                signalQualityIndex: 0.0,
                estimationReliability: 'SUSPENDED',
                rejectionReason: err,
                currentActivity: 'INSUFFICIENT SIGNAL QUALITY',
                sensorStatus: {
                  accelerometer: 'DISCONNECTED',
                  gyroscope: 'UNAVAILABLE',
                  magnetometer: 'PROBING',
                  microphone: 'INACTIVE',
                  bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
                },
              }));
              return;
            } else if (data.accel_z && data.accel_z.length > 0) {
              setConnectionState('CONNECTED');
              setLastSuccessfulPoll(now.toLocaleTimeString());
              setLatestError(null);
              setConnectionErrorMsg(null);
              setSampleCount((prev) => prev + (data.accel_z?.length || 50));

              const mapped: TelemetryFrame = {
                timestamp: data.timestamp ? Math.round(data.timestamp * 1000) : Date.now(),
                timeVector: data.time_vector || [],
                accelX: data.accel_x || [],
                accelY: data.accel_y || [],
                accelZ: data.accel_z || [],
                filteredBreathing: data.filtered_z || [],
                gyroX: data.gyro_x || [],
                gyroY: data.gyro_y || [],
                gyroZ: data.gyro_z || [],
                peakIndices: data.peak_indices || [],
                estimatedRespiratoryRate: data.fused_br_bpm !== undefined ? data.fused_br_bpm : null,
                signalQualityIndex: data.confidence !== undefined ? +data.confidence.toFixed(2) : 0,
                estimationReliability: data.confidence >= 0.7 ? 'HIGH' : (data.confidence >= 0.4 ? 'MEDIUM' : 'SUSPENDED'),
                currentActivity: data.activity || 'LOW MOTION',
                actualSamplingRate: data.measured_sample_rate || 50,
                dataFreshnessMs: 35,
                sqiPerAxis: {
                  x: data.sqi_scores?.x !== undefined ? +data.sqi_scores.x.toFixed(2) : 0.33,
                  y: data.sqi_scores?.y !== undefined ? +data.sqi_scores.y.toFixed(2) : 0.33,
                  z: data.sqi_scores?.z !== undefined ? +data.sqi_scores.z.toFixed(2) : 0.34,
                },
                axisWeights: {
                  x: data.weights?.x !== undefined ? +data.weights.x.toFixed(2) : 0.33,
                  y: data.weights?.y !== undefined ? +data.weights.y.toFixed(2) : 0.33,
                  z: data.weights?.z !== undefined ? +data.weights.z.toFixed(2) : 0.34,
                },
                motionRms: data.motion_rms || 0,
                gyroRms: data.gyro_rms || 0,
                tiltAngleDeg: data.tilt_deg || 0,
                missingSampleCount: data.missing_samples_count || 0,
                isClipped: data.is_saturated || false,
                rejectionReason: data.rejection_reason || null,
                activityReason: data.activity_reason || '',
                naiveBaselineBr: data.baseline_br_bpm !== undefined ? data.baseline_br_bpm : null,
                interpretation: data.interpretation,
                sensorStatus: {
                  accelerometer: data.has_accel !== false ? 'ACTIVE' : 'DISCONNECTED',
                  gyroscope: data.has_gyro ? 'ACTIVE' : 'UNAVAILABLE',
                  magnetometer: 'PROBING',
                  microphone: 'INACTIVE',
                  bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
                },
              };
              setCurrentFrame(mapped);
              setTrendHistory((prev) => [
                ...prev.slice(-39),
                {
                  time: Math.round(now.getTime() / 1000) % 10000,
                  fusedBr: mapped.estimatedRespiratoryRate,
                  baselineBr: mapped.naiveBaselineBr,
                },
              ]);
              gotLive = true;
            }
          }
        } catch {
          // Fallback to client-side phyphoxClient
        }

        if (gotLive) return;

        // Fallback: poll via client-side phyphoxClient
        phyphoxClient.setEndpoint(phyphoxUrl);
        const data = await phyphoxClient.pollData();
        if (data && data.accelZ.length > 0) {
          setConnectionState('CONNECTED');
          setLastSuccessfulPoll(now.toLocaleTimeString());
          setLatestError(null);
          setSampleCount((prev) => prev + data.accelZ.length);

          const frame = dspEngine.processWindow(
            data.accelX,
            data.accelY,
            data.accelZ,
            data.gyroX,
            data.gyroY,
            data.gyroZ,
            data.fs || 50,
            false
          );
          frame.gyroX = data.gyroX;
          frame.gyroY = data.gyroY;
          frame.gyroZ = data.gyroZ;
          frame.sensorStatus = {
            accelerometer: data.hasAccel ? 'ACTIVE' : 'DISCONNECTED',
            gyroscope: data.hasGyro ? 'ACTIVE' : 'UNAVAILABLE',
            magnetometer: 'PROBING',
            microphone: 'INACTIVE',
            bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
          };
          setCurrentFrame(frame);

          setTrendHistory((prev) => [
            ...prev.slice(-39),
            {
              time: Math.round(now.getTime() / 1000) % 10000,
              fusedBr: frame.estimatedRespiratoryRate,
              baselineBr: frame.naiveBaselineBr,
            },
          ]);
        } else {
          if (connectionState === 'CONNECTED') {
            setConnectionState('STALE DATA');
          }
        }
      }
    }, 450);

    return () => clearInterval(timer);
  }, [isStreaming, sourceMode, scenario, connectionState, dspEngine, phyphoxClient, phyphoxUrl]);

  if (viewMode === 'PROTOTYPE_MED_PS_006') {
    return (
      <div className="relative">
        <div className="fixed bottom-3 right-3 z-50">
          <button
            onClick={() => setViewMode('PORTAL')}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-lg text-xs font-mono shadow-xl backdrop-blur-sm transition-all flex items-center gap-2"
            title="Switch to Academic Portal Multi-Page View"
          >
            <span>Academic Portal View →</span>
          </button>
        </div>
        <PrototypeDashboard />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F7FAFC] text-[#172B3A] font-sans antialiased">
      {/* ── 0. RETURN TO PROTOTYPE DASHBOARD BAR ── */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs font-mono flex items-center justify-between border-b border-slate-800">
        <span className="text-cyan-400 font-semibold">Respiration Monitoring System • Prototype MED-PS-006</span>
        <button
          onClick={() => setViewMode('PROTOTYPE_MED_PS_006')}
          className="px-2.5 py-0.5 bg-cyan-900/80 hover:bg-cyan-800 text-cyan-200 border border-cyan-700 rounded text-[11px] font-bold transition-colors"
        >
          ← Return to MED-PS-006 Single-Page Dashboard
        </button>
      </div>

      {/* ── 1. GLOBAL CLINICAL HEADER & PORTAL NAVIGATION ── */}
      <Header
        activePage={activeTab}
        setActivePage={setActiveTab}
        isLive={sourceMode === 'LIVE' && connectionState === 'CONNECTED'}
      />

      {/* ── 2. MAIN APPLICATION WORKSPACE ── */}
      <main className="flex-1 w-full">
        {activeTab === 'home' && <HomePage setActivePage={setActiveTab} />}
        {activeTab === 'technology' && <TechnologyPage />}

        {activeTab === 'monitoring' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Top Workspace Controls Ribbon */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Source:</span>
                <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setSourceMode('LIVE')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${sourceMode === 'LIVE' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    LIVE — PHYPHOX
                  </button>
                  <button
                    onClick={() => setSourceMode('SIMULATED')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${sourceMode === 'SIMULATED' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    SIMULATED — TESTING
                  </button>
                </div>
              </div>

              {sourceMode === 'SIMULATED' ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Testing Scenario:</span>
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-teal-500 font-sans"
                  >
                    <option value="resting">1. Resting Adult Breathing (15 bpm)</option>
                    <option value="speaking">2. Speaking (Voice Harmonics)</option>
                    <option value="coughing">3. Coughing (Explosive Transients)</option>
                    <option value="posture_transition">4. Posture Change (Tilt Shift & Gyro)</option>
                    <option value="tachypnea">5. Elevated Respiration (31 bpm)</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <input
                    type="text"
                    value={phyphoxUrl}
                    onChange={(e) => {
                      setPhyphoxUrl(e.target.value);
                      localStorage.setItem('respirasense_phyphox_url', e.target.value);
                    }}
                    className="w-56 px-2.5 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-teal-500"
                    placeholder="e.g. http://192.168.43.1:8080"
                    title="Phyphox experiment URL displayed on phone screen"
                  />
                  <button
                    onClick={() => handleTestPhyphox()}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-xs shadow-xs transition-all font-sans"
                    title="Probe reachability and verify sensor buffers"
                  >
                    Test
                  </button>
                  <button
                    onClick={handleConnectPhyphox}
                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded font-bold text-xs shadow-xs transition-all font-sans"
                  >
                    {connectionState === 'CONNECTING' ? 'Pinging...' : 'Connect'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsStreaming(!isStreaming)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isStreaming ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-teal-600 text-white'}`}
                >
                  {isStreaming ? 'Pause Stream' : 'Resume Stream'}
                </button>
                <a
                  href="http://localhost:8501"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy-800 hover:bg-navy-900 text-slate-200 border border-navy-700 shadow-xs"
                >
                  Streamlit Hub ↗
                </a>
              </div>
            </div>

            {/* Persistent Simulated Warning Banner (Part 18) */}
            {sourceMode === 'SIMULATED' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold flex items-center justify-between">
                <span>⚠️ SIMULATED DATA — NOT A REAL MEASUREMENT</span>
                <span className="text-[11px] font-normal text-amber-800">
                  Scenario: {scenario.toUpperCase()} • Explicit Testing Mode
                </span>
              </div>
            )}

            <MonitoringPage
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              currentFrame={currentFrame}
              trendHistory={trendHistory}
              phyphoxUrl={phyphoxUrl}
              setPhyphoxUrl={(url) => {
                setPhyphoxUrl(url);
                localStorage.setItem('respirasense_phyphox_url', url);
              }}
              phoneIp={phoneIp}
              setPhoneIp={setPhoneIp}
              phonePort={phonePort}
              setPhonePort={setPhonePort}
              connectionState={connectionState}
              onConnectPhyphox={handleConnectPhyphox}
              onTestPhyphox={handleTestPhyphox}
              testResult={testResult}
              isMonitoring={isStreaming}
              setIsMonitoring={setIsStreaming}
              lastSuccessfulPoll={lastSuccessfulPoll}
              latestError={latestError}
              sampleCount={sampleCount}
            />
          </div>
        )}

        {activeTab === 'lab' && <ActivityLabPage />}
        {activeTab === 'validation' && <ValidationPage />}
        {activeTab === 'diagnostics' && (
          <DiagnosticsPage
            initialUrl={phyphoxUrl}
            onUrlChange={(url) => {
              setPhyphoxUrl(url);
              localStorage.setItem('respirasense_phyphox_url', url);
            }}
          />
        )}
        {activeTab === 'about' && <AboutPage setActivePage={setActiveTab} />}
      </main>

      {/* ── 3. PERSISTENT ACADEMIC MEDICAL CENTRE FOOTER ── */}
      <Footer setActivePage={setActiveTab} />
    </div>
  );
};

export default App;
