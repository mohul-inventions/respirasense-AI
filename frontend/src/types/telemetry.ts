export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'STALE DATA' | 'ERROR';
export type SourceMode = 'LIVE' | 'SIMULATED';
export type SignalReliability = 'HIGH' | 'MEDIUM' | 'LOW' | 'SUSPENDED';

export type ActivityState =
  | 'LOW MOTION'
  | 'WALKING-LIKE MOTION'
  | 'POSTURE TRANSITION'
  | 'POSSIBLE TRANSIENT EVENT'
  | 'HIGH MOTION'
  | 'UNKNOWN ACTIVITY'
  | 'INSUFFICIENT SIGNAL QUALITY';

export interface TelemetryFrame {
  timestamp: number;
  timeVector: number[];
  accelX: number[];
  accelY: number[];
  accelZ: number[];
  filteredBreathing: number[];
  gyroX?: number[];
  gyroY?: number[];
  gyroZ?: number[];
  peakIndices: number[];
  
  // Primary Metrics
  estimatedRespiratoryRate: number | null; // breaths/min (null if suppressed)
  signalQualityIndex: number; // 0.0 - 1.0
  estimationReliability: SignalReliability;
  currentActivity: ActivityState;
  actualSamplingRate: number; // Hz
  dataFreshnessMs: number; // milliseconds since last packet
  
  // Detailed Signal Quality
  sqiPerAxis: {
    x: number;
    y: number;
    z: number;
  };
  axisWeights: {
    x: number;
    y: number;
    z: number;
  };
  motionRms: number; // m/s^2
  gyroRms: number; // rad/s
  tiltAngleDeg: number;
  headingDeg?: number | null;
  missingSampleCount: number;
  isClipped: boolean;
  rejectionReason: string | null;
  activityReason: string;
  
  // Activity-Aware Interpretation (Part 11)
  interpretation?: {
    status_code: string;
    primary_flag: string;
    message: string;
    resting_threshold_applied: boolean;
    is_persistent_elevation: boolean;
    recovery_trend_observed: boolean;
    recovery_duration_sec: number;
    confidence: number;
    estimated_br_bpm: number | null;
    clinical_disclaimer: string;
  };

  // Baseline Comparison
  naiveBaselineBr: number | null;
  
  // Sensors Status Audit
  sensorStatus: {
    accelerometer: 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
    gyroscope: 'ACTIVE' | 'PROBING' | 'UNAVAILABLE';
    magnetometer: 'ACTIVE' | 'PROBING' | 'UNAVAILABLE';
    microphone: 'INACTIVE' | 'ACTIVE';
    bioimpedance: 'NOT CONNECTED — FUTURE SCOPE';
  };
}

export interface ActivityLabSession {
  id: string;
  activityLabel: string;
  notes: string;
  startTime: number;
  endTime?: number;
  durationSec: number;
  samplesRecorded: number;
  meanBr: number | null;
  minBr: number | null;
  maxBr: number | null;
  meanSqi: number;
  suppressionRatio: number; // % of time suppressed due to motion
  detectedActivities: Record<string, number>;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export interface UnitTestResult {
  id: string;
  name: string;
  category: 'Sensor Ingestion' | 'Signal Processing' | 'Signal Quality & Fusion' | 'Activity & Clinical Context' | 'Application Behaviour';
  method: string;
  expectedOutcome: string;
  actualOutcome: string;
  passed: boolean;
  notes: string;
}
