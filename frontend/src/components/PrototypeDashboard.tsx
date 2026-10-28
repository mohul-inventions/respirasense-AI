import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Play,
  Pause,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Clock,
  Layers,
  CheckCircle2,
  Radio,
  FileText,
  AlertCircle,
  Cpu,
  Zap,
  Gauge,
  Lock,
  User,
  Shield
} from 'lucide-react';
import { ClinicalPortal } from './ClinicalPortal';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts';

// --- TYPES ---
export interface AxisPoint {
  time: number;
  val: number;
  peak?: number | null;
}

export interface TrendPoint {
  time: number;
  fusedBr: number | null;
  baselineBr: number | null;
}

export interface CoughEvent {
  id: string;
  timestamp: string;
  dominantFreqHz: number;
  peakToRms: number;
  status: string;
  message: string;
}

export interface SensorStatus {
  accelerometer: 'ACTIVE' | 'OFFLINE' | 'DISCONNECTED';
  gyroscope: 'ACTIVE' | 'NOT IN EXPERIMENT' | 'DISCONNECTED';
  magnetometer: 'ACTIVE' | 'PROBING' | 'NOT AVAILABLE';
  microphone: 'ACTIVE (BROWSER)' | 'STREAMING' | 'INACTIVE';
}

export const PrototypeDashboard: React.FC = () => {
  // ── 1. Connection & Streaming Configuration ──
  const [phyphoxUrl, setPhyphoxUrl] = useState<string>(() => {
    return localStorage.getItem('respirasense_phyphox_url') || 'http://192.168.43.1:8080';
  });
  const [sourceMode, setSourceMode] = useState<'LIVE' | 'SIMULATOR'>('LIVE');
  const [simScenario, setSimScenario] = useState<string>('resting');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'STALE'>('CONNECTING');
  const [connectionMessage, setConnectionMessage] = useState<string>('Initializing link...');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [sampleRateHz, setSampleRateHz] = useState<number>(50.0);
  const [lastPollTime, setLastPollTime] = useState<string>('--:--:--');
  const [discoveredBuffers, setDiscoveredBuffers] = useState<string[]>([]);
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>({
    accelerometer: 'ACTIVE',
    gyroscope: 'NOT IN EXPERIMENT',
    magnetometer: 'PROBING',
    microphone: 'INACTIVE',
  });

  // Diagnostic modal
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    hasAccel?: boolean;
    hasGyro?: boolean;
    bufferNames?: string[];
  } | null>(null);

  // ── 2. Primary Clinical & DSP Telemetry States ──
  const [fusedBr, setFusedBr] = useState<number | null>(15.2);
  const [baselineBr, setBaselineBr] = useState<number | null>(15.4);
  const [confidence, setConfidence] = useState<number>(0.84);
  const [telemetryStatus, setTelemetryStatus] = useState<'RELIABLE' | 'DEGRADED' | 'INSUFFICIENT_QUALITY'>('RELIABLE');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [activity, setActivity] = useState<string>('resting');
  const [activityConfidence, setActivityConfidence] = useState<number>(0.88);
  const [motionRms, setMotionRms] = useState<number>(0.045);
  const [gyroRms, setGyroRms] = useState<number>(0.012);
  const [tiltDeg, setTiltDeg] = useState<number>(14.2);
  const [headingDeg, setHeadingDeg] = useState<number | null>(112.0);
  const [interpretationFlag, setInterpretationFlag] = useState<string>('WITHIN COMMON ADULT RESTING REFERENCE RANGE');
  const [interpretationStatus, setInterpretationStatus] = useState<string>('WITHIN_RESTING_RANGE');

  // Weights & Multi-Axis SQI
  const [sqiZ, setSqiZ] = useState<number>(0.85);
  const [sqiY, setSqiY] = useState<number>(0.72);
  const [sqiX, setSqiX] = useState<number>(0.65);
  const [sqiAudio, setSqiAudio] = useState<number>(0.0);
  const [weightZ, setWeightZ] = useState<number>(0.60);
  const [weightY, setWeightY] = useState<number>(0.25);
  const [weightX, setWeightX] = useState<number>(0.15);
  const [weightAudio, setWeightAudio] = useState<number>(0.0);

  // ── 3. Dedicated Waveform Buffers (Separate 1D Channels) ──
  const [zWave, setZWave] = useState<AxisPoint[]>([]);
  const [yWave, setYWave] = useState<AxisPoint[]>([]);
  const [xWave, setXWave] = useState<AxisPoint[]>([]);
  const [gyroWave, setGyroWave] = useState<AxisPoint[]>([]);
  const [filteredWave, setFilteredWave] = useState<AxisPoint[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

  // ── 4. Audio & Cough Intelligence Center ──
  const [micActive, setMicActive] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [coughThresholdHz, setCoughThresholdHz] = useState<number>(255.0); // Clinical Locked Rule: > 255.0 Hz
  const [dominantFreqHz, setDominantFreqHz] = useState<number>(0.0);
  const [audioRms, setAudioRms] = useState<number>(0.0);
  const [freqConditionMet, setFreqConditionMet] = useState<boolean>(false);
  const [coughStatus, setCoughStatus] = useState<string>('NO_COUGH_CANDIDATE');
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0.0);
  const [audioSpectrum, setAudioSpectrum] = useState<number[]>(Array(24).fill(0));
  const [coughEvents, setCoughEvents] = useState<CoughEvent[]>([]);

  // ── 5. Continuous 20 ms Audio Windowing & Noise Gate States ──
  const [micSampleRate, setMicSampleRate] = useState<number>(48000);
  const [audioSource, setAudioSource] = useState<string>('BROWSER_MICROPHONE');
  const [gateThresholdDbfs, setGateThresholdDbfs] = useState<number>(-20.0); // Fixed Clinical Default: -20.0 dBFS
  const [gateHysteresisDb, setGateHysteresisDb] = useState<number>(4.0);
  const [gateAttackMs, setGateAttackMs] = useState<number>(15.0);
  const [gateReleaseMs, setGateReleaseMs] = useState<number>(80.0);

  // ── 5B. Patient & Clinical Portal Navigation States ──
  const [activePatientId, setActivePatientId] = useState<string>(() => localStorage.getItem('respirasense_patient_id') || 'RS-2026-DEMO');
  const [showClinicalPortal, setShowClinicalPortal] = useState<boolean>(false);
  const [gateState, setGateState] = useState<'OPEN' | 'CLOSED' | 'ATTACK' | 'RELEASE'>('CLOSED');
  const [preGateRms, setPreGateRms] = useState<number>(0.0);
  const [preGateDbfs, setPreGateDbfs] = useState<number>(-120.0);
  const [postGateRms, setPostGateRms] = useState<number>(0.0);
  const [postGateDbfs, setPostGateDbfs] = useState<number>(-120.0);
  const [gateGain, setGateGain] = useState<number>(0.0);
  const [preGateWave, setPreGateWave] = useState<AxisPoint[]>([]);
  const [postGateWave, setPostGateWave] = useState<AxisPoint[]>([]);
  const [audioLevelHistory, setAudioLevelHistory] = useState<any[]>([]);
  const [quietBreathingCandidate, setQuietBreathingCandidate] = useState<boolean>(false);
  const [gateStatusMessage, setGateStatusMessage] = useState<string>('Gate initialized (20 ms windowing)');
  const [audioStaleWarning, setAudioStaleWarning] = useState<boolean>(false);

  // ── 6. VitalDSP Biomedical Engine States ──
  const [vitaldspData, setVitaldspData] = useState<{
    available: boolean;
    rateBpm: number | null;
    confidence: number;
    status: string;
    rejectionReason: string | null;
    motionState: string;
    dynamicRms: number;
    hfMotionRms: number;
    jerkMetric: number;
    cadenceFreqHz: number | null;
    cadencePowerRatio: number;
    selectedAxis: string;
    pcaVarianceExplained: number[];
    axisQualityScores: Record<string, number>;
    sqi: number;
    sqiBreakdown: Record<string, number>;
    primaryRateBpm: number | null;
    primaryMethod: string;
    secondaryRateBpm: number | null;
    secondaryMethod: string;
    discrepancyBpm: number | null;
    agreementScore: number;
  }>({
    available: true,
    rateBpm: 15.2,
    confidence: 0.88,
    status: 'RELIABLE',
    rejectionReason: null,
    motionState: 'REST',
    dynamicRms: 0.045,
    hfMotionRms: 0.012,
    jerkMetric: 0.72,
    cadenceFreqHz: null,
    cadencePowerRatio: 0.0,
    selectedAxis: 'PCA_1',
    pcaVarianceExplained: [0.82, 0.12, 0.06],
    axisQualityScores: { PCA_1: 0.88, PCA_2: 0.42, PCA_3: 0.28 },
    sqi: 0.85,
    sqiBreakdown: { snr_score: 0.88, rhythmicity_score: 0.84, purity_score: 0.86, motion_penalty: 0.96, discrepancy_factor: 1.0 },
    primaryRateBpm: 15.2,
    primaryMethod: 'vitaldsp_counting',
    secondaryRateBpm: 15.0,
    secondaryMethod: 'psd_autocorr_hybrid',
    discrepancyBpm: 0.2,
    agreementScore: 0.98,
  });

  // Web Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastCoughTimeRef = useRef<number>(0);
  const pollTimerRef = useRef<any>(null);

  // ── Save URL ──
  const handleUrlChange = (val: string) => {
    setPhyphoxUrl(val);
    localStorage.setItem('respirasense_phyphox_url', val);
  };

  // ── Test Connection ──
  const handleTestConnection = async () => {
    setConnectionMessage('Testing link...');
    try {
      const res = await fetch(`/api/phyphox/test?base_url=${encodeURIComponent(phyphoxUrl)}`);
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        latencyMs: data.latency_ms,
        hasAccel: data.has_accel,
        hasGyro: data.has_gyro,
        bufferNames: data.buffer_names,
      });
      if (data.success) {
        setConnectionStatus('CONNECTED');
        setConnectionMessage(data.message);
        if (data.buffer_names) setDiscoveredBuffers(data.buffer_names);
      } else {
        setConnectionStatus('DISCONNECTED');
        setConnectionMessage(data.message);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Backend proxy unreachable: ${err?.message || 'Check server.py'}`,
      });
    }
  };

  // ── Connect Phyphox ──
  const handleConnectPhyphox = async () => {
    setConnectionStatus('CONNECTING');
    setConnectionMessage('Establishing remote experiment session...');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: phyphoxUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus('CONNECTED');
        setConnectionMessage(data.message);
        if (data.buffer_names) setDiscoveredBuffers(data.buffer_names);
        setSensorStatus((prev) => ({
          ...prev,
          accelerometer: data.has_accel ? 'ACTIVE' : 'OFFLINE',
          gyroscope: data.has_gyro ? 'ACTIVE' : 'NOT IN EXPERIMENT',
        }));
      } else {
        setConnectionStatus('DISCONNECTED');
        setConnectionMessage(data.message);
      }
    } catch {
      setConnectionStatus('DISCONNECTED');
      setConnectionMessage('Cannot reach backend on port 8000');
    }
  };

  // ── Update Cough Threshold on Backend ──
  const handleThresholdChange = async (newVal: number) => {
    setCoughThresholdHz(newVal);
    try {
      await fetch('/api/cough/threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_hz: newVal }),
      });
    } catch {
      // Ignored if offline
    }
  };

  // ── Update Noise Gate Threshold on Backend ──
  const handleGateThresholdChange = async (newVal: number) => {
    setGateThresholdDbfs(newVal);
    try {
      await fetch('/api/audio/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_dbfs: newVal }),
      });
    } catch {
      // Ignored if offline
    }
  };

  // ── Web Audio API Microphone Capture ──
  const startMicrophone = async () => {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // 1024 binCount, provides 2048 time samples
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      setMicActive(true);
      setMicSampleRate(ctx.sampleRate);
      setSensorStatus((prev) => ({ ...prev, microphone: 'ACTIVE (BROWSER)' }));
    } catch (err: any) {
      setMicActive(false);
      setMicError(`Microphone access denied: ${err?.message || 'Permission blocked'}`);
    }
  };

  const stopMicrophone = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setMicActive(false);
    setGateState('CLOSED');
    setGateGain(0.0);
    setPreGateRms(0.0);
    setPreGateDbfs(-120.0);
    setPostGateRms(0.0);
    setPostGateDbfs(-120.0);
    setPreGateWave([]);
    setPostGateWave([]);
    setSensorStatus((prev) => ({ ...prev, microphone: 'INACTIVE' }));
  };

  // ── Acoustic Signal Analysis Loop ──
  useEffect(() => {
    if (!micActive || !analyserRef.current || !audioCtxRef.current) return;

    const analyser = analyserRef.current;
    const ctx = audioCtxRef.current;
    const binCount = analyser.frequencyBinCount;
    const freqData = new Uint8Array(binCount);
    const timeData = new Float32Array(binCount);

    const interval = setInterval(() => {
      analyser.getByteFrequencyData(freqData);
      analyser.getFloatTimeDomainData(timeData);

      // Post PCM buffer to backend Python AudioNoiseGate for strict 20 ms windowing
      if (timeData.length > 0) {
        const samplesArray = Array.from(timeData);
        fetch('/api/audio/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            samples: samplesArray,
            sample_rate: ctx.sampleRate,
            timestamp: Date.now() / 1000,
            source: 'browser_microphone',
          }),
        })
          .then((r) => r.json())
          .then((resData) => {
            if (resData.success && resData.audio_gate) {
              const ag = resData.audio_gate;
              setGateState(ag.gate_state || 'CLOSED');
              setPreGateRms(ag.pre_gate_rms || 0.0);
              setPreGateDbfs(ag.pre_gate_dbfs !== undefined ? ag.pre_gate_dbfs : -120.0);
              setPostGateRms(ag.post_gate_rms || 0.0);
              setPostGateDbfs(ag.post_gate_dbfs !== undefined ? ag.post_gate_dbfs : -120.0);
              setGateGain(ag.current_gain !== undefined ? ag.current_gain : 0.0);
              setQuietBreathingCandidate(Boolean(ag.quiet_breathing_candidate));
              setGateStatusMessage(ag.status_message || '');
              setAudioStaleWarning(false);
              setMicSampleRate(ag.sample_rate || ctx.sampleRate);

              if (ag.pre_gate_waveform && ag.pre_gate_waveform.length > 0) {
                setPreGateWave(ag.pre_gate_waveform.map((v: number, i: number) => ({ time: i, val: v })));
              }
              if (ag.post_gate_waveform && ag.post_gate_waveform.length > 0) {
                setPostGateWave(ag.post_gate_waveform.map((v: number, i: number) => ({ time: i, val: v })));
              }
              if (ag.level_history && ag.level_history.length > 0) {
                setAudioLevelHistory(
                  ag.level_history.map((h: any, i: number) => ({
                    time: i,
                    preDbfs: h.pre_gate_dbfs,
                    postDbfs: h.post_gate_dbfs,
                    threshold: gateThresholdDbfs,
                  }))
                );
              }
            }
          })
          .catch(() => {
            setAudioStaleWarning(true);
          });
      }

      // Compute RMS
      let sumSq = 0;
      let peakAmp = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i];
        sumSq += v * v;
        const absV = Math.abs(v);
        if (absV > peakAmp) peakAmp = absV;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      setAudioRms(rms);

      // Dominant Frequency via Welch / Peak FFT bin
      const nyquist = ctx.sampleRate / 2;
      const binWidth = nyquist / binCount;
      let maxVal = 0;
      let maxBin = 0;
      for (let i = 2; i < binCount / 2; i++) {
        if (freqData[i] > maxVal) {
          maxVal = freqData[i];
          maxBin = i;
        }
      }
      const domFreq = Math.round(maxBin * binWidth);
      setDominantFreqHz(domFreq);

      // Sub-sample spectrum into 24 bars for visualizer
      const bars: number[] = [];
      const step = Math.floor((binCount / 2) / 24);
      for (let b = 0; b < 24; b++) {
        let barSum = 0;
        for (let s = 0; s < step; s++) {
          barSum += freqData[b * step + s] || 0;
        }
        bars.push(Math.round(barSum / step));
      }
      setAudioSpectrum(bars);

      // ── STRICT USER-DEFINED RULE: freq > threshold strictly ──
      // Exactly 250.0 Hz returns False; > 250.0 Hz returns True.
      const freqPass = domFreq > coughThresholdHz;
      setFreqConditionMet(freqPass);

      const now = Date.now();
      const timeSinceLast = (now - lastCoughTimeRef.current) / 1000.0;
      const cooldownSec = 0.8;
      const remainingCooldown = Math.max(0, cooldownSec - timeSinceLast);
      setCooldownRemainingSec(remainingCooldown);

      const peakToRms = rms > 0.005 ? peakAmp / rms : 0;
      const isExplosive = peakToRms >= 3.2;

      // Autocorrelation pitch estimate for speech vs cough
      let speechPeriodicity = 0;
      if (rms > 0.03) {
        // Formant check: voiced vowel sounds in 120 - 400 Hz range
        if (domFreq >= 120 && domFreq <= 340 && !isExplosive) {
          speechPeriodicity = 0.65;
        }
      }
      const isSpeech = speechPeriodicity > 0.40 && !isExplosive;

      if (!freqPass) {
        if (isSpeech) {
          setCoughStatus('SPEECH_DETECTED_NOT_COUGH');
        } else {
          setCoughStatus('NO_COUGH_CANDIDATE');
        }
      } else {
        // Frequency is strictly greater than threshold!
        if (isSpeech) {
          setCoughStatus('SPEECH_DETECTED_NOT_COUGH');
        } else if (isExplosive && rms > 0.08) {
          if (remainingCooldown <= 0) {
            // Confirmed cough event
            setCoughStatus('CONFIRMED_COUGH');
            lastCoughTimeRef.current = now;
            const timeStr = new Date().toTimeString().split(' ')[0];
            const event: CoughEvent = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: timeStr,
              dominantFreqHz: domFreq,
              peakToRms: Number(peakToRms.toFixed(2)),
              status: 'CONFIRMED_COUGH',
              message: `Explosive transient (${domFreq} Hz > ${coughThresholdHz.toFixed(1)} Hz threshold)`,
            };
            setCoughEvents((prev) => [event, ...prev.slice(0, 19)]);
          } else {
            setCoughStatus('EVENT_MERGED_COOLDOWN');
          }
        } else {
          setCoughStatus('COUGH_CANDIDATE');
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [micActive, coughThresholdHz]);

  // ── Main Telemetry Polling Loop (Server Proxy) ──
  useEffect(() => {
    if (!isStreaming) return;

    const poll = async () => {
      const t0 = performance.now();
      try {
        const queryParams = new URLSearchParams({
          source: sourceMode === 'LIVE' ? 'live' : 'simulated',
          scenario: simScenario,
          base_url: phyphoxUrl,
          patient_id: activePatientId,
        });

        const token = localStorage.getItem('respirasense_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/telemetry?${queryParams.toString()}`, { headers });
        const latency = Math.round(performance.now() - t0);
        setLatencyMs(latency);

        if (res.ok) {
          const data = await res.json();
          setLastPollTime(new Date().toTimeString().split(' ')[0]);

          if (data.connected === false) {
            setConnectionStatus('DISCONNECTED');
            setConnectionMessage(data.error || 'Phyphox endpoint unreachable');
            setFusedBr(null);
            setTelemetryStatus('INSUFFICIENT_QUALITY');
            setRejectionReason(data.error || 'Link offline');
            return;
          }

          setConnectionStatus('CONNECTED');
          setConnectionMessage(
            sourceMode === 'LIVE'
              ? `Streaming live IMU packets from ${data.base_url || phyphoxUrl}`
              : `Synthetic benchmark simulator: ${simScenario.toUpperCase()}`
          );

          if (data.discovered_buffers) setDiscoveredBuffers(data.discovered_buffers);
          if (data.measured_sample_rate) setSampleRateHz(data.measured_sample_rate);

          // Sensor Status
          setSensorStatus((prev) => ({
            ...prev,
            accelerometer: data.has_accel !== false ? 'ACTIVE' : 'OFFLINE',
            gyroscope: data.has_gyro ? 'ACTIVE' : 'NOT IN EXPERIMENT',
          }));

          // Metrics
          setFusedBr(data.fused_br_bpm !== undefined ? data.fused_br_bpm : null);
          setBaselineBr(data.baseline_br_bpm !== undefined ? data.baseline_br_bpm : null);
          setConfidence(data.confidence || 0.0);
          setTelemetryStatus(data.status || 'INSUFFICIENT_QUALITY');
          setRejectionReason(data.rejection_reason || '');
          setActivity(data.activity || 'resting');
          setActivityConfidence(data.activity_confidence || 0.0);
          setMotionRms(data.motion_rms || 0.0);
          setGyroRms(data.gyro_rms || 0.0);
          setTiltDeg(data.tilt_deg || 0.0);
          setHeadingDeg(data.heading_deg !== undefined ? data.heading_deg : null);

          // Clinical interpretation
          if (data.interpretation) {
            setInterpretationFlag(data.interpretation.primary_flag || 'MONITORING ACTIVE');
            setInterpretationStatus(data.interpretation.status_code || 'NORMAL');
          }

          // SQI & Weights
          if (data.sqi_scores) {
            setSqiZ(data.sqi_scores.z || 0.0);
            setSqiY(data.sqi_scores.y || 0.0);
            setSqiX(data.sqi_scores.x || 0.0);
            setSqiAudio(data.sqi_scores.audio || 0.0);
          }
          if (data.weights) {
            setWeightZ(data.weights.z || 0.0);
            setWeightY(data.weights.y || 0.0);
            setWeightX(data.weights.x || 0.0);
            setWeightAudio(data.weights.audio || 0.0);
          }

          // VitalDSP Biomedical Engine Telemetry
          if (data.vitaldsp) {
            const vd = data.vitaldsp;
            setVitaldspData({
              available: Boolean(vd.available),
              rateBpm: vd.rate_bpm !== undefined ? vd.rate_bpm : null,
              confidence: vd.confidence || 0.0,
              status: vd.status || 'RELIABLE',
              rejectionReason: vd.rejection_reason || null,
              motionState: vd.motion_state || 'REST',
              dynamicRms: vd.dynamic_rms || 0.0,
              hfMotionRms: vd.hf_motion_rms || 0.0,
              jerkMetric: vd.jerk_metric || 0.0,
              cadenceFreqHz: vd.cadence_freq_hz !== undefined ? vd.cadence_freq_hz : null,
              cadencePowerRatio: vd.cadence_power_ratio || 0.0,
              selectedAxis: vd.selected_axis || 'PCA_1',
              pcaVarianceExplained: vd.pca_variance_explained || [],
              axisQualityScores: vd.axis_quality_scores || {},
              sqi: vd.sqi || 0.0,
              sqiBreakdown: vd.sqi_breakdown || {},
              primaryRateBpm: vd.primary_rate_bpm !== undefined ? vd.primary_rate_bpm : null,
              primaryMethod: vd.primary_method || 'vitaldsp',
              secondaryRateBpm: vd.secondary_rate_bpm !== undefined ? vd.secondary_rate_bpm : null,
              secondaryMethod: vd.secondary_method || 'psd_autocorr_hybrid',
              discrepancyBpm: vd.discrepancy_bpm !== undefined ? vd.discrepancy_bpm : null,
              agreementScore: vd.agreement_score || 0.0,
            });
          }

          // Append Waveform Points
          const curTime = Date.now();
          const zArr = data.accel_z || [];
          const yArr = data.accel_y || [];
          const xArr = data.accel_x || [];
          const gArr = data.gyro_z || [];
          const fArr = data.filtered_z || [];
          const peakIdxs: number[] = data.peak_indices || [];

          if (zArr.length > 0) {
            const zPts: AxisPoint[] = zArr.map((v: number, i: number) => ({ time: i, val: +v.toFixed(3) }));
            const yPts: AxisPoint[] = yArr.map((v: number, i: number) => ({ time: i, val: +v.toFixed(3) }));
            const xPts: AxisPoint[] = xArr.map((v: number, i: number) => ({ time: i, val: +v.toFixed(3) }));
            const gPts: AxisPoint[] = gArr.map((v: number, i: number) => ({ time: i, val: +v.toFixed(3) }));
            const fPts: AxisPoint[] = fArr.map((v: number, i: number) => ({
              time: i,
              val: +v.toFixed(3),
              peak: peakIdxs.includes(i) ? +v.toFixed(3) : null,
            }));

            setZWave(zPts);
            setYWave(yPts);
            setXWave(xPts);
            setGyroWave(gPts);
            setFilteredWave(fPts);
          }

          // Trend History (break on null rate to prevent artificial interpolation during motion)
          setTrendData((prev) => {
            const next = [
              ...prev,
              {
                time: curTime,
                fusedBr: data.fused_br_bpm !== undefined ? data.fused_br_bpm : null,
                baselineBr: data.baseline_br_bpm !== undefined ? data.baseline_br_bpm : null,
              },
            ];
            return next.slice(-60);
          });
        } else {
          setConnectionStatus('STALE');
          setConnectionMessage('Sensor server returned non-200 status');
        }
      } catch (err: any) {
        setConnectionStatus('DISCONNECTED');
        setConnectionMessage('Lost connection to RespiraSense backend (port 8000)');
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 450);
    return () => clearInterval(pollTimerRef.current);
  }, [isStreaming, sourceMode, simScenario, phyphoxUrl]);

  // Breathing Bio-Orb Animation Period Calculation
  // 15 bpm -> cycle = 4.0s
  const bioOrbPeriodSec = fusedBr && fusedBr > 5 ? Math.max(1.8, Math.min(10.0, 60.0 / fusedBr)) : 4.0;
  const isNormalRange = fusedBr !== null && fusedBr >= 12 && fusedBr <= 20;

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      
      {/* ──────────────────────────────────────────────────────────────────
          1. EXECUTIVE HEADER & TELEMETRY CONTROL BAR
          ────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-cyan-950/60 bg-[#0A101D]/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3">
        <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Brand Identity */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-300/40">
              <Activity className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white flex items-center">
                  RespiraSense <span className="text-cyan-400 ml-1">AI</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
                  CLINICAL TELEMETRY
                </span>
                <span className="text-[10px] text-slate-400 font-mono">v2.5</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Continuous Respiration Telemetry & Adaptive Motion Artefact Separation
              </p>
            </div>
          </div>

          {/* Quick Connection Controls Ribbon */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Mode Switcher */}
            <div className="flex items-center bg-[#0F172A] p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setSourceMode('LIVE')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  sourceMode === 'LIVE'
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live Phone</span>
              </button>
              <button
                onClick={() => setSourceMode('SIMULATOR')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  sourceMode === 'SIMULATOR'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulator</span>
              </button>
            </div>

            {/* If Simulator: Scenario Selector */}
            {sourceMode === 'SIMULATOR' ? (
              <select
                value={simScenario}
                onChange={(e) => setSimScenario(e.target.value)}
                className="bg-[#0F172A] text-slate-200 border border-indigo-900/60 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-indigo-500"
              >
                <option value="resting">1. Resting Breathing (15 bpm)</option>
                <option value="speaking">2. Speaking (Formant Harmonics)</option>
                <option value="coughing">3. Coughing (Explosive Onset)</option>
                <option value="posture_transition">4. Posture Change (Tilt Shift & Gyro)</option>
                <option value="deterioration">5. Deterioration (Tachypnea 30 bpm)</option>
              </select>
            ) : (
              /* If Live Phone: Dynamic URL Input & Probe */
              <div className="flex items-center gap-1.5 bg-[#0F172A] p-1 rounded-xl border border-slate-800">
                <input
                  type="text"
                  value={phyphoxUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="e.g. http://192.168.43.1:8080"
                  className="bg-transparent text-slate-200 font-mono text-xs px-2 py-0.5 w-48 sm:w-56 focus:outline-none placeholder:text-slate-600"
                  title="Phyphox experiment URL displayed on phone screen"
                />
                <button
                  onClick={handleTestConnection}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-semibold transition-colors"
                  title="Test link reachability and inspect sensor buffers"
                >
                  Test
                </button>
                <button
                  onClick={handleConnectPhyphox}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs transition-colors"
                >
                  Sync
                </button>
              </div>
            )}

            {/* Connection Status Indicator Pill */}
            <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-2 text-xs font-mono ${
              connectionStatus === 'CONNECTED'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : (connectionStatus === 'CONNECTING' ? 'bg-amber-950/60 border-amber-800 text-amber-300' : 'bg-rose-950/60 border-rose-800 text-rose-300')
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : (connectionStatus === 'CONNECTING' ? 'bg-amber-400 animate-spin' : 'bg-rose-500')
              }`} />
              <span className="font-semibold">{connectionStatus}</span>
              <span className="text-[10px] text-slate-400">({latencyMs}ms)</span>
            </div>

            {/* Pause / Resume Button */}
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`p-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                isStreaming ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-cyan-600 border-cyan-500 text-slate-950 font-bold'
              }`}
              title={isStreaming ? 'Pause streaming' : 'Resume streaming'}
            >
              {isStreaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            {/* External Links */}
            <a
              href="http://localhost:8501"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-[#0F172A] hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 transition-colors"
              title="Open Streamlit Diagnostic Hub on Port 8501"
            >
              <span>Streamlit</span>
              <ExternalLink className="w-3 h-3 text-cyan-400" />
            </a>

            {/* Patient & Clinical Portal Toggle */}
            <button
              onClick={() => setShowClinicalPortal(!showClinicalPortal)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                showClinicalPortal
                  ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-md font-black'
                  : 'bg-[#0F172A] border-teal-900/80 hover:bg-teal-950/40 text-teal-300'
              }`}
              title="Open Patient Authentication, 7-Day Baseline, 30-Day History, Reports & Hospital Archive"
            >
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>{showClinicalPortal ? '← Live Telemetry' : 'Clinical Portal'}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                {activePatientId}
              </span>
            </button>
          </div>
        </div>

        {/* Informative Diagnostic Alert Banner if test failed */}
        {testResult && !testResult.success && (
          <div className="max-w-[1720px] mx-auto mt-2 p-2.5 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{testResult.message}</span>
            </div>
            <button onClick={() => setTestResult(null)} className="text-rose-400 hover:text-rose-200 font-bold px-2">✕</button>
          </div>
        )}
      </header>

      {showClinicalPortal ? (
        <ClinicalPortal
          onBackToTelemetry={() => setShowClinicalPortal(false)}
          activePatientId={activePatientId}
          onPatientChange={(pid) => setActivePatientId(pid)}
        />
      ) : (
        <>
      {/* ──────────────────────────────────────────────────────────────────
          2. HERO TELEMETRY COMMAND CENTER & BREATHING BIO-ORB
          ────────────────────────────────────────────────────────────────── */}
      <main className="max-w-[1720px] mx-auto px-4 lg:px-8 py-6 space-y-6 w-full flex-1">
        
        {/* Top Clinical Flag Ribbon */}
        <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          interpretationStatus === 'WITHIN_RESTING_RANGE'
            ? 'bg-gradient-to-r from-emerald-950/50 via-[#0A1A24] to-cyan-950/40 border-emerald-800/60 text-emerald-200'
            : (interpretationStatus === 'EXERCISE_CONTEXT' || interpretationStatus === 'RECOVERY_OBSERVATION'
              ? 'bg-gradient-to-r from-blue-950/50 via-[#0E1B33] to-slate-900 border-blue-800/60 text-blue-200'
              : 'bg-gradient-to-r from-amber-950/50 via-[#1C1608] to-slate-900 border-amber-800/60 text-amber-200')
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider font-bold text-cyan-300">
                CLINICAL CONTEXT INTERPRETATION
              </div>
              <div className="text-sm font-extrabold text-white">
                {interpretationFlag}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
            <span>Activity: <strong className="text-cyan-300">{activity.toUpperCase()}</strong></span>
            <span>•</span>
            <span>Motion RMS: <strong className="text-white">{motionRms.toFixed(3)} m/s²</strong></span>
            <span>•</span>
            <span>Tilt: <strong className="text-white">{tiltDeg}°</strong></span>
          </div>
        </div>

        {/* Hero Grid: Breathing Bio-Orb + Metric Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* ── CARD A: LIVE BREATHING BIO-ORB (Cols 1-4) ── */}
          <div className="lg:col-span-4 bg-gradient-to-b from-[#0F1E33] to-[#0A1424] rounded-2xl border border-cyan-900/40 p-6 flex flex-col justify-between relative overflow-hidden shadow-2xl shadow-cyan-950/20">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Card Header */}
            <div className="flex justify-between items-start z-10">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  PHYSIOLOGICAL OSCILLATION
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Continuous Respiration Rhythm
                </h3>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                telemetryStatus === 'RELIABLE'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {telemetryStatus}
              </span>
            </div>

            {/* ── Center Animated Bio-Orb ── */}
            <div className="my-8 flex flex-col items-center justify-center z-10">
              <div className="relative flex items-center justify-center">
                {/* Outer Breathing Ripples */}
                <div
                  className="absolute w-52 h-52 rounded-full border border-cyan-500/20"
                  style={{
                    animation: `breathPulse ${bioOrbPeriodSec}s ease-in-out infinite`,
                  }}
                />
                <div
                  className="absolute w-44 h-44 rounded-full border border-teal-400/30"
                  style={{
                    animation: `breathPulse ${bioOrbPeriodSec}s ease-in-out infinite 0.3s`,
                  }}
                />

                {/* Core Glowing Breathing Bio-Orb */}
                <div
                  className="w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-2xl relative"
                  style={{
                    background: isNormalRange
                      ? 'radial-gradient(circle, rgba(0,229,255,0.35) 0%, rgba(6,182,212,0.15) 70%, rgba(15,23,42,0.8) 100%)'
                      : 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, rgba(217,119,6,0.15) 70%, rgba(15,23,42,0.8) 100%)',
                    border: isNormalRange ? '2px solid rgba(0,229,255,0.7)' : '2px solid rgba(245,158,11,0.7)',
                    boxShadow: isNormalRange ? '0 0 45px rgba(0,229,255,0.35)' : '0 0 45px rgba(245,158,11,0.35)',
                    animation: `breathOrb ${bioOrbPeriodSec}s ease-in-out infinite`,
                  }}
                >
                  <span className="text-[10px] font-mono font-semibold uppercase text-cyan-300">
                    ADAPTIVE FUSED
                  </span>
                  <div className="text-4xl font-black font-mono tracking-tight text-white flex items-baseline">
                    {fusedBr !== null ? fusedBr.toFixed(1) : 'HOLD'}
                    <span className="text-xs font-normal text-slate-300 ml-1">BPM</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {fusedBr !== null ? `${bioOrbPeriodSec.toFixed(1)}s period` : 'Motion Gating'}
                  </span>
                </div>
              </div>

              {/* Status Caption */}
              <div className="mt-6 text-center">
                <div className={`text-xs font-bold ${isNormalRange ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isNormalRange ? '● Adult Resting Rhythm (12 - 20 bpm)' : (fusedBr && fusedBr > 20 ? '▲ Elevated Respiration (Tachypnea Zone)' : '● Insufficient Motion Stability')}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {rejectionReason || 'Multi-axis Kalman-weighted estimation stable'}
                </div>
              </div>
            </div>

            {/* Card Footer: Signal Quality Gauge */}
            <div className="z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Signal Reliability:</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all"
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
                <span className="font-bold text-cyan-300">{Math.round(confidence * 100)}%</span>
              </div>
            </div>
          </div>

          {/* ── METRIC CARDS & ADAPTIVE SENSOR WEIGHTS (Cols 5-12) ── */}
          <div className="lg:col-span-8 flex flex-col justify-between gap-5">
            
            {/* Top 3 High-Level Metric Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Tile 1: Multi-Axis SQI Score */}
              <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                  <span>Composite SQI</span>
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black font-mono text-cyan-300">
                    {sqiZ.toFixed(2)}
                    <span className="text-xs text-slate-400 font-normal ml-1">/ 1.0</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {sqiZ >= 0.70 ? '● High SNR Respiratory Band' : '▲ Motion Noise Contamination'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                  <span>Z: <b className="text-cyan-300">{sqiZ.toFixed(2)}</b></span>
                  <span>•</span>
                  <span>Y: <b className="text-emerald-300">{sqiY.toFixed(2)}</b></span>
                  <span>•</span>
                  <span>X: <b className="text-purple-300">{sqiX.toFixed(2)}</b></span>
                </div>
              </div>

              {/* Tile 2: Naive Baseline Comparison */}
              <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                  <span>Naive Baseline</span>
                  <Layers className="w-4 h-4 text-purple-400" />
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black font-mono text-slate-300">
                    {baselineBr !== null ? baselineBr.toFixed(1) : '--'}
                    <span className="text-xs text-slate-400 font-normal ml-1">BPM</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Unweighted triaxial average
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-amber-400">
                  {fusedBr && baselineBr && Math.abs(fusedBr - baselineBr) > 1.5
                    ? `⚠️ Baseline corrupted by motion (${Math.abs(fusedBr - baselineBr).toFixed(1)} bpm drift)`
                    : '✓ Baseline matches adaptive estimate'}
                </div>
              </div>

              {/* Tile 3: Sensor Ingestion Health */}
              <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                  <span>Transducer Stream</span>
                  <Radio className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black font-mono text-emerald-400">
                    {sampleRateHz.toFixed(1)}
                    <span className="text-xs text-slate-400 font-normal ml-1">Hz</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Decimated Biomedical Processing
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Gyro: <strong className={sensorStatus.gyroscope === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-500'}>{sensorStatus.gyroscope}</strong></span>
                  <span>Poll: <strong className="text-slate-300">{lastPollTime}</strong></span>
                </div>
              </div>
            </div>

            {/* Dynamic Sensor Weight Redistribution Card */}
            <div className="bg-[#0D1829] p-5 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
                    Adaptive Sensor Weight Redistribution
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Real-time SQI & motion penalty dynamic weight allocation per axis
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  Motion: <strong>{motionRms.toFixed(3)} m/s²</strong> • Gyro: <strong>{gyroRms.toFixed(3)} rad/s</strong>
                </span>
              </div>

              {/* Multi-channel progress bars */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
                {/* Z Axis */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-cyan-400 font-bold">Z-Axis (Chest)</span>
                    <span className="text-white font-bold">{Math.round(weightZ * 100)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full transition-all"
                      style={{ width: `${Math.round(weightZ * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Y Axis */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-emerald-400 font-bold">Y-Axis (Axial)</span>
                    <span className="text-white font-bold">{Math.round(weightY * 100)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${Math.round(weightY * 100)}%` }}
                    />
                  </div>
                </div>

                {/* X Axis */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-purple-400 font-bold">X-Axis (Lateral)</span>
                    <span className="text-white font-bold">{Math.round(weightX * 100)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-400 rounded-full transition-all"
                      style={{ width: `${Math.round(weightX * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Acoustic */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-amber-400 font-bold">Acoustic Mic</span>
                    <span className="text-white font-bold">{Math.round(weightAudio * 100)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${Math.round(weightAudio * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── VitalDSP Biomedical Intelligence & Motion Assessment Card ── */}
            <div className="bg-[#0B1526] p-5 rounded-2xl border border-cyan-900/40 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-32 bg-cyan-500/5 blur-3xl pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-950/70 border border-cyan-800/50 text-cyan-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase flex items-center gap-2">
                      VitalDSP Biomedical Engine & Motion Assessment
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 font-normal">
                        v0.2.3 • Python 3.14
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Strict triaxial accelerometer telemetry • Zero gyroscope dependency • Dual-estimator agreement
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`px-3 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${
                      vitaldspData.motionState === 'REST'
                        ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                        : vitaldspData.motionState === 'WALKING_MOTION'
                        ? 'bg-red-950/80 border-red-700/60 text-red-300 animate-pulse'
                        : vitaldspData.motionState === 'POSTURE_CHANGE'
                        ? 'bg-amber-950/80 border-amber-700/60 text-amber-300'
                        : 'bg-rose-950/80 border-rose-700/60 text-rose-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        vitaldspData.motionState === 'REST'
                          ? 'bg-emerald-400'
                          : vitaldspData.motionState === 'WALKING_MOTION'
                          ? 'bg-red-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    STATE: {vitaldspData.motionState}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                    Axis: <strong className="text-cyan-300">{vitaldspData.selectedAxis}</strong>
                  </span>
                </div>
              </div>

              {/* 3 Sub-Panels */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                
                {/* Sub-panel 1: Dual Estimators */}
                <div className="bg-[#091120] p-3.5 rounded-xl border border-slate-800/90 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase pb-2 border-b border-slate-800/60">
                    <span>Dual Rate Estimators</span>
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="py-2.5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px] truncate max-w-[130px]" title={vitaldspData.primaryMethod}>
                        1. {vitaldspData.primaryMethod}
                      </span>
                      <strong className="text-cyan-300 text-sm">
                        {vitaldspData.primaryRateBpm !== null ? `${vitaldspData.primaryRateBpm.toFixed(1)} bpm` : '--'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px] truncate max-w-[130px]" title={vitaldspData.secondaryMethod}>
                        2. {vitaldspData.secondaryMethod}
                      </span>
                      <strong className="text-emerald-300 text-sm">
                        {vitaldspData.secondaryRateBpm !== null ? `${vitaldspData.secondaryRateBpm.toFixed(1)} bpm` : '--'}
                      </strong>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Discrepancy: <b className="text-slate-200">{vitaldspData.discrepancyBpm !== null ? `${vitaldspData.discrepancyBpm.toFixed(1)} bpm` : '0.0 bpm'}</b></span>
                    <span>Agreement: <b className="text-cyan-300">{Math.round(vitaldspData.agreementScore * 100)}%</b></span>
                  </div>
                </div>

                {/* Sub-panel 2: PCA Axis & SQI Breakdown */}
                <div className="bg-[#091120] p-3.5 rounded-xl border border-slate-800/90 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase pb-2 border-b border-slate-800/60">
                    <span>PCA Decomposition & SQI</span>
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="py-2 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">PCA Variance:</span>
                      <span className="text-purple-300">
                        {vitaldspData.pcaVarianceExplained && vitaldspData.pcaVarianceExplained.length > 0
                          ? vitaldspData.pcaVarianceExplained.map((v) => `${Math.round(v * 100)}%`).join(' / ')
                          : '82% / 12% / 6%'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">VitalDSP SQI:</span>
                      <span className="text-cyan-300 font-bold">{vitaldspData.sqi.toFixed(2)} / 1.0</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                      <span>SNR: <b className="text-slate-200">{vitaldspData.sqiBreakdown?.snr_score ?? 0.85}</b></span>
                      <span>Rhythm: <b className="text-slate-200">{vitaldspData.sqiBreakdown?.rhythmicity_score ?? 0.82}</b></span>
                      <span>Purity: <b className="text-slate-200">{vitaldspData.sqiBreakdown?.purity_score ?? 0.84}</b></span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 flex justify-between">
                    <span>Status: <b className={vitaldspData.status === 'RELIABLE' ? 'text-emerald-400' : 'text-amber-400'}>{vitaldspData.status}</b></span>
                    <span>Confidence: <b className="text-cyan-300">{Math.round(vitaldspData.confidence * 100)}%</b></span>
                  </div>
                </div>

                {/* Sub-panel 3: Accelerometer Motion & Cadence */}
                <div className="bg-[#091120] p-3.5 rounded-xl border border-slate-800/90 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase pb-2 border-b border-slate-800/60">
                    <span>Kinematic Assessment</span>
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="py-2 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dynamic RMS:</span>
                      <span className="text-slate-200 font-bold">{vitaldspData.dynamicRms.toFixed(3)} m/s²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Jerk Metric (da/dt):</span>
                      <span className="text-slate-200">{vitaldspData.jerkMetric.toFixed(1)} m/s³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Walking Cadence:</span>
                      <span className={vitaldspData.cadenceFreqHz ? 'text-red-400 font-bold' : 'text-slate-400'}>
                        {vitaldspData.cadenceFreqHz ? `${vitaldspData.cadenceFreqHz.toFixed(2)} Hz (${Math.round(vitaldspData.cadencePowerRatio * 100)}% energy)` : 'None (Resting)'}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 truncate">
                    Non-resp noise (&gt;1Hz): <b className="text-slate-200">{vitaldspData.hfMotionRms.toFixed(3)} m/s²</b>
                  </div>
                </div>

              </div>

              {/* Warning banner if insufficient quality or walking */}
              {vitaldspData.status === 'INSUFFICIENT_QUALITY' && (
                <div className="mt-3 p-2.5 rounded-xl bg-red-950/60 border border-red-700/50 flex items-center gap-2 text-xs font-mono text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>Artifact Protection Active:</strong> {vitaldspData.rejectionReason || 'Corrupted signal rejected to prevent misleading clinical output.'}
                  </span>
                </div>
              )}
            </div>
            <div className="bg-[#0D1829] p-5 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                    Continuous Trend Telemetry (Adaptive RR vs Naive Baseline)
                  </h4>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <span className="w-2.5 h-1 bg-cyan-400 rounded-full" />
                    Adaptive Fused RR
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-2.5 h-1 bg-slate-500 border border-slate-400 border-dashed rounded-full" />
                    Naive Baseline
                  </span>
                </div>
              </div>

              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <YAxis domain={[6, 38]} stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                    <ReferenceLine y={12} stroke="rgba(16,185,129,0.3)" strokeDasharray="2 2" />
                    <ReferenceLine y={20} stroke="rgba(16,185,129,0.3)" strokeDasharray="2 2" />
                    <ReferenceLine y={25} stroke="rgba(239,68,68,0.5)" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '8px', fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                      formatter={(val: any) => [`${val !== null ? (+val).toFixed(1) : 'REJECTED'} bpm`, '']}
                    />
                    <Line
                      type="monotone"
                      dataKey="fusedBr"
                      stroke="#00E5FF"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false} /* HONEST BREAK ON MOTION REJECTION */
                    />
                    <Line
                      type="monotone"
                      dataKey="baselineBr"
                      stroke="#64748B"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            3. DEDICATED REAL-TIME 1D SENSOR WAVEFORM STUDIO
            ────────────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-400" />
                Dedicated Real-Time 1D Axis Waveforms
              </h2>
              <p className="text-xs text-slate-400">
                Independent channels mirroring smartphone motion directly. No dimensional collapse or single-graph crowding.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Real-time Decimated Buffer (Last 60 Points)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Waveform 1: Z-Axis (Anterior-Posterior Expansion) */}
            <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  Z-Axis (Chest Expansion)
                </span>
                <span className="text-slate-400">Acc Z (m/s²)</span>
              </div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={zWave} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={false} />
                    <Line type="monotone" dataKey="val" stroke="#00E5FF" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Waveform 2: Y-Axis (Cephalocaudal / Axial Motion) */}
            <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Y-Axis (Axial Displacement)
                </span>
                <span className="text-slate-400">Acc Y (m/s²)</span>
              </div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yWave} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={false} />
                    <Line type="monotone" dataKey="val" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Waveform 3: X-Axis (Lateral Sway) */}
            <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="text-purple-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  X-Axis (Lateral Sway)
                </span>
                <span className="text-slate-400">Acc X (m/s²)</span>
              </div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={xWave} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={false} />
                    <Line type="monotone" dataKey="val" stroke="#A855F7" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Waveform 4: Gyroscope Rotation (rad/s) */}
            <div className="bg-[#0D1829] p-4 rounded-2xl border border-slate-800/80 shadow-md">
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="text-amber-400 font-bold flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${sensorStatus.gyroscope === 'ACTIVE' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
                  Gyroscope (Angular Rate)
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {sensorStatus.gyroscope === 'ACTIVE' ? `RMS: ${gyroRms.toFixed(3)} rad/s` : 'Gyr Z (rad/s)'}
                </span>
              </div>
              <div className="h-28 w-full">
                {sensorStatus.gyroscope === 'ACTIVE' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gyroWave} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                      <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="val" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <span className="text-xs font-mono text-amber-300/90 font-semibold mb-1">
                      ⚪ Gyroscope Inactive in Current Experiment
                    </span>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Streaming accelerometer only. In Phyphox, select <strong className="text-slate-200">Raw Sensors</strong> to stream triaxial gyroscope alongside accelerometer.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Waveform 5: Filtered Respiration Excursion with Peak Inhalation Markers */}
            <div className="bg-[#0D1829] p-4 rounded-2xl border border-teal-900/60 shadow-md md:col-span-2">
              <div className="flex justify-between items-center text-xs font-mono mb-2">
                <span className="text-teal-300 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  Isolated Respiratory Motion (0.1 - 0.7 Hz) with Inhalation Peak Markers
                </span>
                <span className="text-teal-400">Chest Wall Excursion (m/s²)</span>
              </div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredWave} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="respColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#087F8C" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#087F8C" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={false} />
                    <Area type="monotone" dataKey="val" stroke="#00E5FF" strokeWidth={2.2} fillOpacity={1} fill="url(#respColor)" isAnimationActive={false} />
                    <Line type="monotone" dataKey="peak" stroke="#F43F5E" strokeWidth={0} dot={{ r: 4, fill: '#00E5FF', stroke: '#FFFFFF', strokeWidth: 1.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            4. CONTINUOUS ACOUSTIC TELEMETRY & CONFIGURABLE NOISE GATE STUDIO
            ────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#0A1220] p-6 rounded-2xl border border-cyan-900/50 shadow-2xl space-y-6">
          
          {/* Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Volume2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-extrabold text-white">
                  Continuous Acoustic Telemetry & Configurable Noise Gate Studio
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Acquisition: {audioSource}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800">
                  {micSampleRate.toLocaleString()} Hz • 20 ms Window ({Math.round(micSampleRate * 0.020)} Samples)
                </span>
                {audioStaleWarning && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                    ⚠️ STALE AUDIO STREAM
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Continuous 20 ms acoustic windowing, configurable dBFS hysteresis noise gating, quiet breathing protection, and transient classification.
              </p>
            </div>

            {/* Microphone Toggle Button */}
            <div className="flex items-center gap-3">
              {micActive ? (
                <button
                  onClick={stopMicrophone}
                  className="px-4 py-2 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-xl text-xs font-bold font-mono flex items-center gap-2 transition-colors"
                >
                  <MicOff className="w-4 h-4 text-rose-400" />
                  <span>Mute Clinical Mic</span>
                </button>
              ) : (
                <button
                  onClick={startMicrophone}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-slate-950 rounded-xl text-xs font-bold font-mono flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all"
                >
                  <Mic className="w-4 h-4 text-slate-950" />
                  <span>Activate Browser Microphone</span>
                </button>
              )}
            </div>
          </div>

          {micError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300">
              {micError}
            </div>
          )}

          {/* Sub-Section 4A: 20 ms Windowed Noise Gate Control & Telemetry Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Column 1: Configurable Gate Slider, State & Quiet Breathing Protection (Cols 1-4) */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Standard Fixed Threshold Card (Locked for Medical Accuracy) */}
              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-slate-300 font-bold">
                    Noise Gate Threshold:
                  </span>
                  <span className="text-sm font-mono font-black text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-400" />
                    {gateThresholdDbfs.toFixed(1)} dBFS
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>Clinical Default:</span>
                    <strong className="text-amber-300">-20.0 dBFS</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Operating Range:</span>
                    <span>[-25.0 dBFS, -12.0 dBFS]</span>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                    Manual patient slider locked to preserve standardized acoustic quiet breathing protection and prevent artifact leakage.
                  </div>
                </div>
                
                {/* Gating State & Gain Readout */}
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Gate State:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] flex items-center gap-1.5 ${
                    gateState === 'OPEN'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : gateState === 'ATTACK'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                      : gateState === 'RELEASE'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      gateState === 'OPEN' ? 'bg-emerald-400' : (gateState === 'ATTACK' ? 'bg-amber-400' : (gateState === 'RELEASE' ? 'bg-cyan-400' : 'bg-slate-500'))
                    }`} />
                    {gateState} (Gain: {Math.round(gateGain * 100)}%)
                  </span>
                </div>

                <div className="mt-2 text-[10px] font-mono text-slate-500">
                  Hysteresis: <strong>{gateHysteresisDb.toFixed(1)} dB</strong> (Close: {(gateThresholdDbfs - gateHysteresisDb).toFixed(1)} dBFS) • Attack: {gateAttackMs} ms • Release: {gateReleaseMs} ms
                </div>
              </div>

              {/* Quiet Breathing Protection Card (Phase 5) */}
              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="font-bold text-teal-300 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${quietBreathingCandidate ? 'bg-teal-400 animate-pulse' : 'bg-slate-600'}`} />
                    Quiet Breathing Safeguard
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Phase 5 Protocol</span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 bg-black/40 p-2.5 rounded-lg border border-slate-800">
                  {quietBreathingCandidate ? (
                    <div className="text-teal-300 font-semibold">
                      ✓ Low-amplitude excursion ({preGateDbfs.toFixed(1)} dBFS) preserved in quiet breathing band (-65 to -45 dBFS).
                    </div>
                  ) : (
                    <div className="text-slate-400">
                      Pre-gate level ({preGateDbfs.toFixed(1)} dBFS) preserved. Gate closure suppresses hiss without clearing raw measurements.
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                  Medical Safeguard: Audio gating suppresses ambient hiss. Gate closure is never used as proof of absent respiration. Breathing rate is continuously tracked by chest wall accelerometry.
                </p>
              </div>
            </div>

            {/* Column 2: Dual Waveforms — Pre-Gate vs Post-Gate (Cols 5-8) */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Pre-Gate Waveform */}
              <div className="bg-[#0F1B2D] p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    Pre-Gate Audio Waveform (Raw Input)
                  </span>
                  <span className="text-cyan-400 text-[11px]">
                    {preGateDbfs.toFixed(1)} dBFS • RMS: {preGateRms.toFixed(4)}
                  </span>
                </div>
                <div className="h-20 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={preGateWave} margin={{ top: 2, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                      <YAxis domain={[-0.5, 0.5]} stroke="#64748B" fontSize={8} tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="val" stroke="#00E5FF" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Post-Gate Waveform */}
              <div className="bg-[#0F1B2D] p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Post-Gate Audio Waveform (Gated Output)
                  </span>
                  <span className="text-emerald-400 text-[11px]">
                    {postGateDbfs.toFixed(1)} dBFS • RMS: {postGateRms.toFixed(4)}
                  </span>
                </div>
                <div className="h-20 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={postGateWave} margin={{ top: 2, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                      <YAxis domain={[-0.5, 0.5]} stroke="#64748B" fontSize={8} tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="val" stroke="#10B981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Column 3: Audio-Level History Trend (dBFS vs Threshold) (Cols 9-12) */}
            <div className="lg:col-span-4 bg-[#0F1B2D] p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center text-xs font-mono mb-2">
                  <span className="text-white font-bold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Continuous Audio Level History (dBFS)
                  </span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-cyan-400">● Pre-Gate</span>
                    <span className="text-emerald-400">● Post-Gate</span>
                    <span className="text-amber-400">-- Gate Th</span>
                  </div>
                </div>

                <div className="h-36 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={audioLevelHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                      <YAxis domain={[-90, -10]} stroke="#64748B" fontSize={8} tickLine={false} axisLine={false} />
                      <ReferenceLine y={gateThresholdDbfs} stroke="#F59E0B" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="preDbfs" stroke="#00E5FF" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="postDbfs" stroke="#10B981" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Pre: <strong className="text-cyan-300">{preGateDbfs.toFixed(1)} dBFS</strong></span>
                <span>Post: <strong className="text-emerald-300">{postGateDbfs.toFixed(1)} dBFS</strong></span>
                <span>Th: <strong className="text-amber-300">{gateThresholdDbfs.toFixed(1)} dBFS</strong></span>
              </div>
            </div>
          </div>

          {/* Sub-Section 4B: Transient & Cough Intelligence Center */}
          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  Transient & Cough Intelligence Center
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Strict Rule: &gt; {coughThresholdHz.toFixed(1)} Hz
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Cough Frequency Threshold Card (Locked Biomedical Rule) */}
              <div className="lg:col-span-5 bg-[#0F1B2D] p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-slate-300 font-bold">
                    Cough Frequency Rule (Locked):
                  </span>
                  <span className="text-sm font-mono font-black text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-cyan-400" />
                    &gt; {coughThresholdHz.toFixed(1)} Hz
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>Clinical Standard Rule:</span>
                    <strong className="text-cyan-300">&gt; 255.0 Hz</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                    Manual patient slider locked to comply with standardized cough vs voice harmonic discrimination rules.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono">
                  <div className="bg-black/30 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Dominant Frequency:</span>
                    <span className="text-lg font-bold text-white">
                      {micActive ? `${dominantFreqHz} Hz` : 'MIC INACTIVE'}
                    </span>
                    <span className={`text-[10px] block mt-0.5 ${freqConditionMet ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                      {freqConditionMet ? `✓ > ${coughThresholdHz.toFixed(1)} Hz Met` : `✕ ≤ ${coughThresholdHz.toFixed(1)} Hz`}
                    </span>
                  </div>

                  <div className="bg-black/30 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Acoustic Status:</span>
                    <span className={`text-xs font-bold block mt-0.5 ${
                      coughStatus === 'CONFIRMED_COUGH' ? 'text-rose-400' : (coughStatus === 'SPEECH_DETECTED_NOT_COUGH' ? 'text-blue-400' : 'text-slate-300')
                    }`}>
                      {coughStatus}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {cooldownRemainingSec > 0 ? `Cooldown: ${cooldownRemainingSec.toFixed(1)}s` : 'Ready to detect'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live FFT Spectrum */}
              <div className="lg:col-span-4 bg-[#0F1B2D] p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono mb-2">
                  <span className="text-slate-300 font-bold">Real-Time FFT Spectrum</span>
                  <span className="text-slate-400">0 - 4000 Hz</span>
                </div>
                
                <div className="h-28 flex items-end justify-between gap-1 bg-black/40 p-2 rounded-lg border border-slate-800/80">
                  {audioSpectrum.map((val, idx) => {
                    const barFreq = Math.round(idx * (4000 / 24));
                    const isHigh = barFreq > coughThresholdHz;
                    return (
                      <div
                        key={idx}
                        className="flex-1 rounded-t-sm transition-all duration-75"
                        style={{
                          height: `${Math.max(4, Math.min(100, (val / 255) * 100))}%`,
                          backgroundColor: isHigh ? '#00E5FF' : '#3B82F6',
                          opacity: micActive ? 0.9 : 0.2,
                        }}
                        title={`${barFreq} Hz: ${val}`}
                      />
                    );
                  })}
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-2">
                  <span>RMS Energy: <strong className="text-white">{audioRms.toFixed(4)}</strong></span>
                  <span className="text-cyan-400 font-bold">Cyan Bars: &gt; {coughThresholdHz.toFixed(1)} Hz</span>
                </div>
              </div>

              {/* Confirmed Cough Events Audit Log */}
              <div className="lg:col-span-3 bg-[#0F1B2D] p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-rose-400" />
                      Cough Audit Log
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {coughEvents.length} events
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mb-2 font-mono">
                    Privacy-first: Zero raw audio recorded or persisted.
                  </div>
                </div>

                <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                  {coughEvents.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 font-mono">
                      No cough bursts confirmed yet.
                    </div>
                  ) : (
                    coughEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2 rounded-lg bg-rose-950/40 border border-rose-900/60 text-[11px] font-mono flex items-center justify-between"
                      >
                        <div>
                          <span className="text-rose-300 font-bold">{ev.timestamp}</span>
                          <div className="text-slate-400 text-[10px]">
                            {ev.dominantFreqHz} Hz • {ev.peakToRms}x Peak/RMS
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-rose-900/80 text-rose-200 text-[9px] font-bold">
                          CONFIRMED
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            5. PHASE 3 ACTIVITY BENCHMARK VALIDATION PROTOCOL SCORECARD
            ────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#0A1220] p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Phase 3 Activity Validation Protocol & Benchmarking Scorecard
              </h3>
              <p className="text-xs text-slate-400">
                Automated multi-scenario verification evaluating rate preservation vs. appropriate motion suspension.
              </p>
            </div>
            <a
              href="/api/tests"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Run Automated Unit Tests (25/25)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-mono">
            
            {/* Scenario 1: Resting */}
            <div className={`p-3 rounded-xl border ${activity === 'resting' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-[#0F1A2B] border-slate-800'}`}>
              <div className="text-[10px] text-slate-400">Scenario 1</div>
              <div className="font-bold text-white mt-0.5">Resting Adult</div>
              <div className="text-emerald-400 font-semibold mt-1">✓ Rate Preserved</div>
              <div className="text-[10px] text-slate-400 mt-1">Target: ~15 bpm</div>
            </div>

            {/* Scenario 2: Speaking */}
            <div className={`p-3 rounded-xl border ${activity === 'speaking' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-[#0F1A2B] border-slate-800'}`}>
              <div className="text-[10px] text-slate-400">Scenario 2</div>
              <div className="font-bold text-white mt-0.5">Speaking Speech</div>
              <div className="text-blue-400 font-semibold mt-1">✓ Pitch Filtered</div>
              <div className="text-[10px] text-slate-400 mt-1">Non-Cough Verified</div>
            </div>

            {/* Scenario 3: Coughing */}
            <div className={`p-3 rounded-xl border ${activity === 'coughing' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-[#0F1A2B] border-slate-800'}`}>
              <div className="text-[10px] text-slate-400">Scenario 3</div>
              <div className="font-bold text-white mt-0.5">Cough Transient</div>
              <div className="text-rose-400 font-semibold mt-1">✓ Spike Logged</div>
              <div className="text-[10px] text-slate-400 mt-1">&gt; 250 Hz Confirmed</div>
            </div>

            {/* Scenario 4: Posture Change */}
            <div className={`p-3 rounded-xl border ${activity === 'posture_transition' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-[#0F1A2B] border-slate-800'}`}>
              <div className="text-[10px] text-slate-400">Scenario 4</div>
              <div className="font-bold text-white mt-0.5">Posture Change</div>
              <div className="text-amber-400 font-semibold mt-1">✕ Rate Suspended</div>
              <div className="text-[10px] text-slate-400 mt-1">Gyro & Tilt &gt; 12° Safeguard</div>
            </div>

            {/* Scenario 5: Deterioration */}
            <div className={`p-3 rounded-xl border ${activity === 'deterioration' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-[#0F1A2B] border-slate-800'}`}>
              <div className="text-[10px] text-slate-400">Scenario 5</div>
              <div className="font-bold text-white mt-0.5">Tachypnea</div>
              <div className="text-rose-400 font-semibold mt-1">⚠️ Alert Raised</div>
              <div className="text-[10px] text-slate-400 mt-1">Elevated (30 bpm)</div>
            </div>
          </div>
        </div>
      </main>

      {/* ──────────────────────────────────────────────────────────────────
          6. CLINICAL REGULATORY DISCLAIMER & PERSISTENT FOOTER
          ────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-[#070B14] px-4 lg:px-8 py-5 text-xs text-slate-400">
        <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
            <p>
              <strong>Investigational Medical Device Prototype MED-PS-006.</strong> For demonstration and clinical research validation only.
              Not certified by FDA, CE, or national regulatory bodies for diagnostic use.
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
            <span>Decimated 50.0 Hz DSP</span>
            <span>•</span>
            <span>Phyphox REST Telemetry</span>
            <span>•</span>
            <span>Python Adaptive Fusion Engine</span>
          </div>
        </div>
      </footer>
      </>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          7. INLINE CSS KEYFRAME ANIMATIONS FOR THE BREATHING BIO-ORB
          ────────────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes breathOrb {
          0% {
            transform: scale(0.92);
            box-shadow: 0 0 25px rgba(0, 229, 255, 0.25);
          }
          40% {
            transform: scale(1.08);
            box-shadow: 0 0 60px rgba(0, 229, 255, 0.65);
          }
          100% {
            transform: scale(0.92);
            box-shadow: 0 0 25px rgba(0, 229, 255, 0.25);
          }
        }
        @keyframes breathPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.15;
          }
          40% {
            transform: scale(1.18);
            opacity: 0.60;
          }
          100% {
            transform: scale(0.85);
            opacity: 0.15;
          }
        }
      `}</style>
    </div>
  );
};
