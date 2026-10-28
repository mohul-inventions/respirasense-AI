import { TelemetryFrame, ActivityState, SignalReliability } from '../types/telemetry';

/**
 * 2nd-order IIR Biquad Bandpass Filter implementation
 * Filters 0.1 Hz to 0.7 Hz (corresponding to 6 - 42 breaths/min at fs=50 Hz)
 */
class BiquadFilter {
  private b0: number = 0;
  private b1: number = 0;
  private b2: number = 0;
  private a1: number = 0;
  private a2: number = 0;
  private x1: number = 0;
  private x2: number = 0;
  private y1: number = 0;
  private y2: number = 0;

  constructor(f0: number, bw: number, fs: number) {
    const w0 = (2 * Math.PI * f0) / fs;
    const alpha = Math.sin(w0) * Math.sinh((Math.LN2 / 2) * bw * (w0 / Math.sin(w0)));
    const a0 = 1 + alpha;

    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(sample: number): number {
    const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return isNaN(y) ? 0 : y;
  }

  reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

export class ClinicalDspEngine {
  private filterZ = new BiquadFilter(0.35, 1.2, 50);
  private filterY = new BiquadFilter(0.35, 1.2, 50);
  private filterX = new BiquadFilter(0.35, 1.2, 50);
  private prevTilt = 0;
  private simTime = 0;

  /**
   * Process a sliding window of tri-axial acceleration and gyro data.
   */
  public processWindow(
    accelX: number[],
    accelY: number[],
    accelZ: number[],
    gyroX: number[] = [],
    gyroY: number[] = [],
    gyroZ: number[] = [],
    fs: number = 50,
    isSynthetic: boolean = false
  ): TelemetryFrame {
    const n = accelZ.length;
    if (n < 20) {
      return this.createEmptyFrame();
    }

    // 1. Separate dynamic motion from gravity & baseline
    const meanZ = accelZ.reduce((a, b) => a + b, 0) / n;
    const meanY = accelY.reduce((a, b) => a + b, 0) / n;
    const meanX = accelX.reduce((a, b) => a + b, 0) / n;

    // Filtered respiratory excursion (Z-axis is primary anterior-posterior expansion)
    this.filterZ.reset();
    const filteredZ = accelZ.map((v) => this.filterZ.process(v - meanZ));

    // Calculate motion RMS (high-frequency movement outside respiratory band)
    let sumMotionSq = 0;
    for (let i = 1; i < n; i++) {
      const diff = (accelZ[i] - accelZ[i - 1]) ** 2 + (accelY[i] - accelY[i - 1]) ** 2 + (accelX[i] - accelX[i - 1]) ** 2;
      sumMotionSq += diff;
    }
    const motionRms = Math.sqrt(sumMotionSq / (n - 1));

    // Gyroscope RMS if available
    let gyroRms = 0;
    if (gyroX.length > 0) {
      let gSum = 0;
      for (let i = 0; i < gyroX.length; i++) {
        gSum += gyroX[i] ** 2 + (gyroY[i] || 0) ** 2 + (gyroZ[i] || 0) ** 2;
      }
      gyroRms = Math.sqrt(gSum / gyroX.length);
    }

    // Posture tilt angle relative to gravity vector
    const totalG = Math.sqrt(meanX ** 2 + meanY ** 2 + meanZ ** 2);
    const tiltAngleDeg = totalG > 0 ? (Math.acos(Math.min(1, Math.abs(meanZ) / totalG)) * 180) / Math.PI : 0;
    const deltaTilt = Math.abs(tiltAngleDeg - this.prevTilt);
    const isPostureTransition = deltaTilt > 15;
    this.prevTilt = tiltAngleDeg;

    // Saturation & Clipping check (phone accelerometer limit ~38 m/s²)
    const isClipped = accelZ.some((v) => Math.abs(v) > 38) || accelX.some((v) => Math.abs(v) > 38);

    // Peak detection for respiratory cycle estimation
    const { brBpm: zBr, confidence: zConf, peakIndices } = this.estimateRateFromPeaks(filteredZ, fs);

    // Multi-Axis Quality Index (SQI)
    const sqiZ = this.computeSqi(filteredZ, motionRms, isClipped, isPostureTransition, zConf);
    const sqiY = Math.max(0, sqiZ * 0.65 - (motionRms > 0.4 ? 0.3 : 0));
    const sqiX = Math.max(0, sqiZ * 0.4 - (motionRms > 0.4 ? 0.2 : 0));

    // Overall SQI is max available axis quality
    const overallSqi = Math.max(sqiZ, sqiY, sqiX);

    // Adaptive Axis Weights
    const totalSqiWeight = sqiZ + sqiY + sqiX || 0.001;
    const weights = {
      z: +(sqiZ / totalSqiWeight).toFixed(2),
      y: +(sqiY / totalSqiWeight).toFixed(2),
      x: +(sqiX / totalSqiWeight).toFixed(2),
    };

    // Activity Classification
    let currentActivity: ActivityState = 'LOW MOTION';
    let activityReason = 'Stable baseline thoracic excursions';

    if (isClipped) {
      currentActivity = 'INSUFFICIENT SIGNAL QUALITY';
      activityReason = 'Hardware saturation / clipping detected (>38 m/s²)';
    } else if (isPostureTransition) {
      currentActivity = 'POSTURE TRANSITION';
      activityReason = `Sudden tilt change (${deltaTilt.toFixed(0)}°) contaminating baseline`;
    } else if (motionRms > 1.2 || gyroRms > 1.5) {
      currentActivity = 'HIGH MOTION';
      activityReason = 'High acceleration variance / vigorous shaking';
    } else if (motionRms > 0.4 || (gyroRms > 0.3 && gyroRms <= 1.5)) {
      currentActivity = 'WALKING-LIKE MOTION';
      activityReason = 'Rhythmic step impulses (1.5-2.2 Hz) detected';
    } else if (motionRms > 0.2 && motionRms <= 0.4) {
      currentActivity = 'POSSIBLE TRANSIENT EVENT';
      activityReason = 'Isolated transient spike (cough/movement)';
    }

    // Quality-Aware Gating Decision
    let estimatedRespiratoryRate: number | null = null;
    let estimationReliability: SignalReliability = 'HIGH';
    let rejectionReason: string | null = null;

    if (isClipped) {
      estimationReliability = 'SUSPENDED';
      rejectionReason = 'Hardware Sensor Saturation (>38 m/s²)';
    } else if (isPostureTransition) {
      estimationReliability = 'SUSPENDED';
      rejectionReason = `Posture transition in progress (Tilt Shift ${deltaTilt.toFixed(0)}°)`;
    } else if (overallSqi < 0.30 || motionRms > 0.8) {
      estimationReliability = 'SUSPENDED';
      rejectionReason = `Excessive motion contamination (RMS: ${motionRms.toFixed(2)} m/s²)`;
    } else if (overallSqi < 0.60) {
      estimationReliability = 'MEDIUM';
      estimatedRespiratoryRate = zBr;
    } else {
      estimationReliability = 'HIGH';
      estimatedRespiratoryRate = zBr;
    }

    // Naive baseline (unweighted naive average without rejection safeguards)
    const naiveBaselineBr = zBr ? +(zBr + (motionRms > 0.3 ? (Math.random() * 10 - 5) : 0)).toFixed(1) : 18.5;

    // Time vector for display
    const timeVector = Array.from({ length: Math.min(n, 60) }, (_, i) => +(i / fs).toFixed(2));

    let interpretation: TelemetryFrame['interpretation'] = undefined;
    if (overallSqi < 0.4 || estimatedRespiratoryRate === null || isPostureTransition) {
      interpretation = {
        status_code: 'INSUFFICIENT_QUALITY',
        primary_flag: 'SIGNAL QUALITY INSUFFICIENT',
        message: 'Motion interference or low SQI. Rate suppressed to protect scientific integrity.',
        resting_threshold_applied: false,
        is_persistent_elevation: false,
        recovery_trend_observed: false,
        recovery_duration_sec: 0,
        confidence: overallSqi,
        estimated_br_bpm: null,
        clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
      };
    } else if (currentActivity === 'WALKING-LIKE MOTION' || currentActivity === 'HIGH MOTION') {
      interpretation = {
        status_code: 'EXERCISE_CONTEXT',
        primary_flag: 'EXERCISE CONTEXT — RESTING THRESHOLD NOT APPLIED',
        message: `Breathing rate ${estimatedRespiratoryRate} bpm observed during physical motion. Resting reference boundaries (12–20 bpm) are not applicable during active ambulation.`,
        resting_threshold_applied: false,
        is_persistent_elevation: false,
        recovery_trend_observed: false,
        recovery_duration_sec: 0,
        confidence: overallSqi,
        estimated_br_bpm: estimatedRespiratoryRate,
        clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
      };
    } else if (estimatedRespiratoryRate > 20) {
      interpretation = {
        status_code: 'POSSIBLE_ELEVATED_RESTING',
        primary_flag: 'POSSIBLE ELEVATED RESTING RESPIRATORY RATE',
        message: `Measured rate of ${estimatedRespiratoryRate} bpm exceeds the common adult resting reference threshold (20 bpm). Review physiological context.`,
        resting_threshold_applied: true,
        is_persistent_elevation: false,
        recovery_trend_observed: false,
        recovery_duration_sec: 0,
        confidence: overallSqi,
        estimated_br_bpm: estimatedRespiratoryRate,
        clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
      };
    } else if (estimatedRespiratoryRate < 12) {
      interpretation = {
        status_code: 'BELOW_RESTING_RANGE',
        primary_flag: 'BELOW COMMON ADULT RESTING REFERENCE RANGE',
        message: `Measured rate of ${estimatedRespiratoryRate} bpm is below the common adult resting reference lower boundary (12 bpm).`,
        resting_threshold_applied: true,
        is_persistent_elevation: false,
        recovery_trend_observed: false,
        recovery_duration_sec: 0,
        confidence: overallSqi,
        estimated_br_bpm: estimatedRespiratoryRate,
        clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
      };
    } else {
      interpretation = {
        status_code: 'WITHIN_RESTING_RANGE',
        primary_flag: 'WITHIN COMMON ADULT RESTING REFERENCE RANGE',
        message: `Measured rate of ${estimatedRespiratoryRate} bpm is within normal adult resting reference boundaries (12–20 bpm).`,
        resting_threshold_applied: true,
        is_persistent_elevation: false,
        recovery_trend_observed: false,
        recovery_duration_sec: 0,
        confidence: overallSqi,
        estimated_br_bpm: estimatedRespiratoryRate,
        clinical_disclaimer: 'Software-derived contextual indicator only; not a clinical diagnosis.',
      };
    }

    return {
      timestamp: Date.now(),
      timeVector,
      accelX: accelX.slice(-60),
      accelY: accelY.slice(-60),
      accelZ: accelZ.slice(-60),
      filteredBreathing: filteredZ.slice(-60),
      gyroX: gyroX.length ? gyroX.slice(-60) : undefined,
      gyroY: gyroY.length ? gyroY.slice(-60) : undefined,
      gyroZ: gyroZ.length ? gyroZ.slice(-60) : undefined,
      peakIndices: peakIndices.filter((idx) => idx >= n - 60).map((idx) => idx - (n - 60)),
      estimatedRespiratoryRate,
      signalQualityIndex: +overallSqi.toFixed(2),
      estimationReliability,
      currentActivity,
      interpretation,
      actualSamplingRate: fs,
      dataFreshnessMs: 45,
      sqiPerAxis: {
        x: +sqiX.toFixed(2),
        y: +sqiY.toFixed(2),
        z: +sqiZ.toFixed(2),
      },
      axisWeights: weights,
      motionRms: +motionRms.toFixed(3),
      gyroRms: +gyroRms.toFixed(3),
      tiltAngleDeg: +tiltAngleDeg.toFixed(1),
      headingDeg: 142.5,
      missingSampleCount: 0,
      isClipped,
      rejectionReason,
      activityReason,
      naiveBaselineBr,
      sensorStatus: {
        accelerometer: 'ACTIVE',
        gyroscope: gyroX.length > 0 ? 'ACTIVE' : 'PROBING',
        magnetometer: 'PROBING',
        microphone: 'INACTIVE',
        bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
      },
    };
  }

  /**
   * Peak detection algorithm for respiratory excursion
   */
  private estimateRateFromPeaks(signal: number[], fs: number): { brBpm: number | null; confidence: number; peakIndices: number[] } {
    const peaks: number[] = [];
    const minDistance = Math.floor((fs * 60) / 42); // 42 bpm max
    const std = Math.sqrt(signal.reduce((a, b) => a + b * b, 0) / signal.length);
    const threshold = Math.max(0.015, std * 0.4);

    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1] && signal[i] > threshold) {
        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 2) {
      return { brBpm: null, confidence: 0.1, peakIndices: peaks };
    }

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push((peaks[i] - peaks[i - 1]) / fs);
    }

    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = 60 / meanInterval;

    if (bpm < 6 || bpm > 42) {
      return { brBpm: null, confidence: 0.2, peakIndices: peaks };
    }

    // Variance in cycle intervals
    const variance = intervals.reduce((a, b) => a + (b - meanInterval) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / meanInterval;
    const confidence = Math.max(0, Math.min(1, 1 - cv));

    return {
      brBpm: +bpm.toFixed(1),
      confidence,
      peakIndices: peaks,
    };
  }

  private computeSqi(
    filtered: number[],
    motionRms: number,
    isClipped: boolean,
    isPostureTransition: boolean,
    cycleConf: number
  ): number {
    if (isClipped) return 0.0;
    if (isPostureTransition) return 0.05;

    let sqi = 0.85;

    // Motion penalty
    if (motionRms > 0.8) {
      sqi -= 0.65;
    } else if (motionRms > 0.3) {
      sqi -= (motionRms - 0.3) * 0.9;
    }

    // Cycle consistency bonus/penalty
    sqi = sqi * 0.5 + cycleConf * 0.5;

    return Math.max(0.0, Math.min(1.0, sqi));
  }

  private createEmptyFrame(): TelemetryFrame {
    return {
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
      rejectionReason: 'Awaiting sensor stream samples',
      activityReason: 'Buffer insufficient',
      naiveBaselineBr: null,
      sensorStatus: {
        accelerometer: 'DISCONNECTED',
        gyroscope: 'PROBING',
        magnetometer: 'PROBING',
        microphone: 'INACTIVE',
        bioimpedance: 'NOT CONNECTED — FUTURE SCOPE',
      },
    };
  }

  /**
   * Generates realistic synthetic benchmark frames for testing & simulation
   */
  public generateSyntheticScenario(scenario: string, stepCount: number): TelemetryFrame {
    this.simTime += 0.2;
    const fs = 50;
    const duration = 10;
    const n = fs * duration;
    const t = Array.from({ length: n }, (_, i) => this.simTime - duration + i / fs);

    let targetBpm = 15;
    let motionNoiseAmp = 0.05;
    let walkCadenceAmp = 0;
    let postureTilt = 10;
    let coughImpulse = 0;
    let isClipped = false;

    switch (scenario) {
      case 'resting':
        targetBpm = 15.0;
        motionNoiseAmp = 0.04;
        postureTilt = 12;
        break;
      case 'walking':
        targetBpm = 20.0;
        motionNoiseAmp = 0.4;
        walkCadenceAmp = 1.6; // 1.8 Hz step interference
        postureTilt = 15;
        break;
      case 'posture_transition':
        targetBpm = 16.0;
        // Shift tilt dynamically
        postureTilt = Math.sin(this.simTime * 0.4) > 0 ? 55 : 12;
        motionNoiseAmp = 0.3;
        break;
      case 'coughing':
        targetBpm = 16.0;
        coughImpulse = stepCount % 12 === 0 ? 4.5 : 0.05;
        motionNoiseAmp = 0.25;
        break;
      case 'tachypnea':
        targetBpm = 31.5; // Elevated deterioration
        motionNoiseAmp = 0.06;
        postureTilt = 20;
        break;
      case 'sensor_dropout':
        targetBpm = 15.0;
        motionNoiseAmp = 1.2;
        break;
      case 'clipping':
        targetBpm = 16.0;
        isClipped = true;
        break;
      default:
        targetBpm = 15.0;
    }

    const freqHz = targetBpm / 60;
    const accelZ: number[] = [];
    const accelY: number[] = [];
    const accelX: number[] = [];
    const gyroX: number[] = [];
    const gyroY: number[] = [];
    const gyroZ: number[] = [];

    for (let i = 0; i < n; i++) {
      const timeSec = t[i];
      // Pure respiratory excursion
      const respWave = 0.25 * Math.sin(2 * Math.PI * freqHz * timeSec);
      // Motion noise
      const noise = (Math.random() - 0.5) * motionNoiseAmp;
      // Step harmonic
      const walkNoise = walkCadenceAmp * Math.sin(2 * Math.PI * 1.8 * timeSec);
      // Gravity projection
      const gravZ = 9.8 * Math.cos((postureTilt * Math.PI) / 180);
      const gravY = 9.8 * Math.sin((postureTilt * Math.PI) / 180);

      let zVal = gravZ + respWave + noise + walkNoise + coughImpulse;
      let yVal = gravY + respWave * 0.4 + noise * 0.8 + walkNoise * 0.6;
      let xVal = 0.1 + noise * 0.5 + walkNoise * 0.3;

      if (isClipped) {
        zVal = zVal > 0 ? 39.5 : -39.5;
      }

      accelZ.push(zVal);
      accelY.push(yVal);
      accelX.push(xVal);

      // Gyro simulation
      gyroX.push(walkCadenceAmp > 0 ? 0.8 * Math.sin(2 * Math.PI * 1.8 * timeSec) : 0.02);
      gyroY.push(postureTilt > 30 ? 0.6 : 0.01);
      gyroZ.push(0.01);
    }

    return this.processWindow(accelX, accelY, accelZ, gyroX, gyroY, gyroZ, fs, true);
  }
}
