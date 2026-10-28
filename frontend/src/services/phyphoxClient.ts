export interface PhyphoxDiagnostics {
  endpoint: string;
  baseUrl: string;
  phoneIp: string;
  port: number;
  isReachable: boolean;
  lastPollTime: number | null;
  pollLatencyMs: number;
  sampleCount: number;
  measuredSampleRate: number;
  bufferNames: string[];
  hasAccel: boolean;
  hasGyro: boolean;
  accelStatus: 'STREAMING' | 'PAUSED' | 'NOT_DETECTED' | 'DISCONNECTED';
  gyroStatus: 'STREAMING' | 'NOT_IN_EXPERIMENT' | 'PAUSED' | 'DISCONNECTED';
  recentErrors: string[];
}

export function normalizePhyphoxEndpoint(rawInput: string, defaultPort: number = 8080): {
  host: string;
  port: number;
  baseUrl: string;
} {
  if (!rawInput || !rawInput.trim()) {
    return { host: '', port: defaultPort, baseUrl: '' };
  }

  let s = rawInput.trim();
  // Strip trailing slashes, /get, /control, and queries
  s = s.replace(/\/get.*$/i, '').replace(/\/control.*$/i, '').replace(/\/+$/, '');

  // Add temporary scheme if missing for URL parsing
  const withScheme = /^https?:\/\//i.test(s) ? s : `http://${s}`;

  try {
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^[\[\]]+|[\[\]]+$/g, ''); // handle IPv6 brackets
    const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;

    if (!host) {
      return { host: '', port: defaultPort, baseUrl: '' };
    }

    return {
      host,
      port,
      baseUrl: `http://${host}:${port}`,
    };
  } catch {
    // Fallback regex extraction
    const clean = s.replace(/^https?:\/\//i, '').split('/')[0];
    if (clean.includes(':')) {
      const parts = clean.split(':');
      const port = parseInt(parts[1], 10) || defaultPort;
      return { host: parts[0], port, baseUrl: `http://${parts[0]}:${port}` };
    }
    return { host: clean, port: defaultPort, baseUrl: `http://${clean}:${defaultPort}` };
  }
}

export class PhyphoxClient {
  private phoneIp: string = '';
  private port: number = 8080;
  private baseUrl: string = '';
  private lastTimestamp: number | null = null;
  
  // Rolling historical buffers to ensure DSP receives full 10s physiological windows
  private rollingX: number[] = [];
  private rollingY: number[] = [];
  private rollingZ: number[] = [];
  private rollingT: number[] = [];
  private rollingGx: number[] = [];
  private rollingGy: number[] = [];
  private rollingGz: number[] = [];
  private maxRollingSamples = 500; // 10 seconds at 50 Hz

  private diagnostics: PhyphoxDiagnostics = {
    endpoint: '',
    baseUrl: '',
    phoneIp: '',
    port: 8080,
    isReachable: false,
    lastPollTime: null,
    pollLatencyMs: 0,
    sampleCount: 0,
    measuredSampleRate: 50,
    bufferNames: [],
    hasAccel: false,
    hasGyro: false,
    accelStatus: 'DISCONNECTED',
    gyroStatus: 'DISCONNECTED',
    recentErrors: [],
  };

  constructor(endpointInput: string = '', port: number = 8080) {
    this.setEndpoint(endpointInput, port);
  }

  public setEndpoint(endpointInput: string, port: number = 8080) {
    const norm = normalizePhyphoxEndpoint(endpointInput, port);
    this.phoneIp = norm.host;
    this.port = norm.port;
    this.baseUrl = norm.baseUrl;
    this.lastTimestamp = null;
    this.clearRollingBuffers();
    this.updateDiagnosticsEndpoint();
  }

  public clearRollingBuffers() {
    this.rollingX = [];
    this.rollingY = [];
    this.rollingZ = [];
    this.rollingT = [];
    this.rollingGx = [];
    this.rollingGy = [];
    this.rollingGz = [];
  }

  private updateDiagnosticsEndpoint() {
    this.diagnostics.endpoint = this.baseUrl;
    this.diagnostics.baseUrl = this.baseUrl;
    this.diagnostics.phoneIp = this.phoneIp;
    this.diagnostics.port = this.port;
  }

  public getDiagnostics(): PhyphoxDiagnostics {
    return { ...this.diagnostics };
  }

  /**
   * Helper to extract numeric array from varying Phyphox buffer candidate names
   */
  private extractArray(bufferObj: any, candidates: string[]): number[] {
    if (!bufferObj || typeof bufferObj !== 'object') return [];

    // 1. Direct candidate matching
    for (const key of candidates) {
      if (!key) continue;
      if (bufferObj[key]) {
        if (Array.isArray(bufferObj[key].buffer) && bufferObj[key].buffer.length > 0) {
          return bufferObj[key].buffer;
        }
        if (Array.isArray(bufferObj[key]) && bufferObj[key].length > 0) {
          return bufferObj[key];
        }
      }
    }

    // 2. Case-insensitive and partial matching over all available keys in buffer
    const allKeys = Object.keys(bufferObj);
    for (const key of allKeys) {
      const lower = key.toLowerCase();
      for (const cand of candidates) {
        if (!cand) continue;
        const lowerCand = cand.toLowerCase();
        if (lower === lowerCand || lower.includes(lowerCand)) {
          const val = bufferObj[key];
          if (val) {
            if (Array.isArray(val.buffer) && val.buffer.length > 0) return val.buffer;
            if (Array.isArray(val) && val.length > 0) return val;
          }
        }
      }
    }

    return [];
  }

  /**
   * Test connection to the Phyphox REST API endpoint across local Wi-Fi or mobile hotspots.
   */
  public async testConnection(): Promise<{
    success: boolean;
    message: string;
    hasAccel?: boolean;
    hasGyro?: boolean;
    accelStatus?: string;
    gyroStatus?: string;
    bufferNames?: string[];
    diagnostics?: PhyphoxDiagnostics;
  }> {
    if (!this.baseUrl || !this.phoneIp) {
      const msg = 'Phyphox Base URL is empty. Please enter the URL displayed on your phone (e.g. http://192.168.43.1:8080).';
      this.diagnostics.isReachable = false;
      this.diagnostics.accelStatus = 'DISCONNECTED';
      this.diagnostics.gyroStatus = 'DISCONNECTED';
      this.logError(msg);
      return { success: false, message: msg, diagnostics: this.getDiagnostics() };
    }

    const startTime = performance.now();

    // Endpoints for test reachability:
    // 1. Python server proxy (/api/phyphox/test)
    // 2. Vite development server proxy (/phyphox-proxy)
    // 3. Direct browser fetch to phone (if browser CORS allows on local network)
    const pythonProxyUrl = `/api/phyphox/test?base_url=${encodeURIComponent(this.baseUrl)}&port=${this.port}`;
    const viteProxyUrl = `/phyphox-proxy?base_url=${encodeURIComponent(this.baseUrl)}&path=/get`;
    const directUrl = `${this.baseUrl}/get`;

    for (const target of [pythonProxyUrl, viteProxyUrl, directUrl]) {
      try {
        const res = await fetch(target, { signal: AbortSignal.timeout(3000) });
        this.diagnostics.pollLatencyMs = Math.round(performance.now() - startTime);

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          this.diagnostics.isReachable = true;
          this.diagnostics.lastPollTime = Date.now();

          // Check buffers from response
          const bufObj = json.buffer || (json.diagnostics && json.diagnostics.buffer_names ? {} : json);
          const bufferKeys: string[] = Array.isArray(json.buffer_names) 
            ? json.buffer_names 
            : Object.keys(bufObj);
            
          this.diagnostics.bufferNames = bufferKeys;

          // Check Accelerometer presence
          const hasAccel = json.has_accel ?? bufferKeys.some((k) => 
            /acc/i.test(k) || /linear/i.test(k) || k === 'x' || k === 'y' || k === 'z'
          );
          // Check Gyroscope presence
          const hasGyro = json.has_gyro ?? bufferKeys.some((k) => 
            /gyr/i.test(k) || /gyro/i.test(k) || /rot/i.test(k) || k === 'wx' || k === 'wy' || k === 'wz'
          );

          this.diagnostics.hasAccel = hasAccel;
          this.diagnostics.hasGyro = hasGyro;
          this.diagnostics.accelStatus = hasAccel ? 'STREAMING' : 'NOT_DETECTED';
          this.diagnostics.gyroStatus = hasGyro ? 'STREAMING' : 'NOT_IN_EXPERIMENT';

          // Trigger remote start
          await this.triggerRemoteStart();

          const accelDesc = hasAccel ? 'Accelerometer ACTIVE' : 'No accelerometer buffer found';
          const gyroDesc = hasGyro 
            ? 'Gyroscope ACTIVE' 
            : 'Gyroscope not in current experiment (choose "Raw Sensors" in Phyphox to enable)';

          return { 
            success: true, 
            message: `Connected to Phyphox at ${this.baseUrl} (${this.diagnostics.pollLatencyMs}ms latency). [${accelDesc} • ${gyroDesc}]`,
            hasAccel,
            hasGyro,
            bufferNames: this.diagnostics.bufferNames,
            diagnostics: this.getDiagnostics(),
          };
        }
      } catch (err: any) {
        // try next target
      }
    }

    this.diagnostics.isReachable = false;
    this.diagnostics.accelStatus = 'DISCONNECTED';
    this.diagnostics.gyroStatus = 'DISCONNECTED';
    const msg = (
      `Cannot reach ${this.baseUrl}. ` +
      `Check that: (1) Phone and computer are connected to the exact same Wi-Fi network or mobile hotspot; ` +
      `(2) Wi-Fi client isolation or firewall is not blocking port ${this.port}; ` +
      `(3) You entered the new IP shown in Phyphox if you recently switched networks.`
    );
    this.logError(msg);
    return {
      success: false,
      message: msg,
      hasAccel: false,
      hasGyro: false,
      bufferNames: [],
      diagnostics: this.getDiagnostics(),
    };
  }

  /**
   * Send remote start command to Phyphox so recording runs automatically
   */
  public async triggerRemoteStart() {
    if (!this.baseUrl) return;
    const pyUrl = `/api/phyphox/control?base_url=${encodeURIComponent(this.baseUrl)}&cmd=start`;
    const viteUrl = `/phyphox-proxy?base_url=${encodeURIComponent(this.baseUrl)}&path=/control&cmd=start`;
    const directUrl = `${this.baseUrl}/control?cmd=start`;

    for (const url of [pyUrl, viteUrl, directUrl]) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(1500) });
        break;
      } catch {}
    }
  }

  /**
   * Poll sensor data from Phyphox.
   * Returns a complete sliding window (up to 500 samples / 10s) required for biomedical DSP filtering.
   */
  public async pollData(): Promise<{
    accelX: number[];
    accelY: number[];
    accelZ: number[];
    gyroX: number[];
    gyroY: number[];
    gyroZ: number[];
    fs: number;
    hasAccel: boolean;
    hasGyro: boolean;
  } | null> {
    if (!this.baseUrl) return null;
    const t0 = performance.now();

    const pyUrl = `/api/phyphox/get?base_url=${encodeURIComponent(this.baseUrl)}`;
    const viteUrl = `/phyphox-proxy?base_url=${encodeURIComponent(this.baseUrl)}&path=/get`;
    const directUrl = `${this.baseUrl}/get`;

    let json: any = null;

    for (const url of [pyUrl, viteUrl, directUrl]) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          json = await res.json();
          this.diagnostics.pollLatencyMs = Math.round(performance.now() - t0);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!json || !json.buffer) {
      if (this.rollingZ.length === 0) {
        this.triggerRemoteStart();
      }
      this.diagnostics.isReachable = false;
      return null;
    }

    const bufferObj = json.buffer || {};
    this.diagnostics.bufferNames = Object.keys(bufferObj);
    this.diagnostics.lastPollTime = Date.now();
    this.diagnostics.isReachable = true;

    // Flexible extraction across any phone manufacturer or Phyphox experiment
    const zRaw = this.extractArray(bufferObj, ['accz', 'acc_z', 'lin_accz', 'linear_accz', 'z', 'accel_z']);
    const yRaw = this.extractArray(bufferObj, ['accy', 'acc_y', 'lin_accy', 'linear_accy', 'y', 'accel_y']);
    const xRaw = this.extractArray(bufferObj, ['accx', 'acc_x', 'lin_accx', 'linear_accx', 'x', 'accel_x']);
    const tRaw = this.extractArray(bufferObj, ['acc_time', 'time', 't', 'lin_acc_time', 'timestamp']);

    // Dynamic Gyroscope extraction
    const gxRaw = this.extractArray(bufferObj, ['gyrx', 'gyr_x', 'gyrox', 'gyro_x', 'wx', 'w_x', 'rotx', 'rot_x']);
    const gyRaw = this.extractArray(bufferObj, ['gyry', 'gyr_y', 'gyroy', 'gyro_y', 'wy', 'w_y', 'roty', 'rot_y']);
    const gzRaw = this.extractArray(bufferObj, ['gyrz', 'gyr_z', 'gyroz', 'gyro_z', 'wz', 'w_z', 'rotz', 'rot_z']);

    const hasGyro = gxRaw.length > 0 || gyRaw.length > 0 || gzRaw.length > 0;
    this.diagnostics.hasAccel = zRaw.length > 0 || yRaw.length > 0 || xRaw.length > 0;
    this.diagnostics.hasGyro = hasGyro;
    this.diagnostics.accelStatus = this.diagnostics.hasAccel ? 'STREAMING' : 'NOT_DETECTED';
    this.diagnostics.gyroStatus = hasGyro ? 'STREAMING' : 'NOT_IN_EXPERIMENT';

    // Check if we received acceleration data
    if (zRaw.length === 0 && yRaw.length === 0 && xRaw.length === 0) {
      this.triggerRemoteStart();
      return null;
    }

    // Determine sample rate from timestamps if available
    if (tRaw.length >= 2) {
      const deltaT = (tRaw[tRaw.length - 1] - tRaw[0]) / (tRaw.length - 1);
      if (deltaT > 0.0001) {
        this.diagnostics.measuredSampleRate = +(1 / deltaT).toFixed(1);
      }
    }

    const incomingLen = Math.max(zRaw.length, yRaw.length, xRaw.length);
    this.diagnostics.sampleCount += incomingLen;

    if (incomingLen >= 20) {
      const sliceCount = Math.min(incomingLen, this.maxRollingSamples);
      this.rollingZ = zRaw.length ? zRaw.slice(-sliceCount) : Array(sliceCount).fill(9.8);
      this.rollingY = yRaw.length ? yRaw.slice(-sliceCount) : Array(sliceCount).fill(0.0);
      this.rollingX = xRaw.length ? xRaw.slice(-sliceCount) : Array(sliceCount).fill(0.0);
      this.rollingGx = gxRaw.length ? gxRaw.slice(-sliceCount) : [];
      this.rollingGy = gyRaw.length ? gyRaw.slice(-sliceCount) : [];
      this.rollingGz = gzRaw.length ? gzRaw.slice(-sliceCount) : [];
    } else {
      for (let i = 0; i < incomingLen; i++) {
        this.rollingZ.push(zRaw[i] ?? (this.rollingZ[this.rollingZ.length - 1] ?? 9.8));
        this.rollingY.push(yRaw[i] ?? (this.rollingY[this.rollingY.length - 1] ?? 0.0));
        this.rollingX.push(xRaw[i] ?? (this.rollingX[this.rollingX.length - 1] ?? 0.0));
        if (gxRaw.length > i) this.rollingGx.push(gxRaw[i]);
        if (gyRaw.length > i) this.rollingGy.push(gyRaw[i]);
        if (gzRaw.length > i) this.rollingGz.push(gzRaw[i]);
      }
      if (this.rollingZ.length > this.maxRollingSamples) {
        this.rollingZ = this.rollingZ.slice(-this.maxRollingSamples);
        this.rollingY = this.rollingY.slice(-this.maxRollingSamples);
        this.rollingX = this.rollingX.slice(-this.maxRollingSamples);
        this.rollingGx = this.rollingGx.slice(-this.maxRollingSamples);
        this.rollingGy = this.rollingGy.slice(-this.maxRollingSamples);
        this.rollingGz = this.rollingGz.slice(-this.maxRollingSamples);
      }
    }

    return {
      accelX: this.rollingX,
      accelY: this.rollingY,
      accelZ: this.rollingZ,
      gyroX: this.rollingGx,
      gyroY: this.rollingGy,
      gyroZ: this.rollingGz,
      fs: this.diagnostics.measuredSampleRate,
      hasAccel: this.rollingZ.length > 0,
      hasGyro,
    };
  }

  private logError(msg: string) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    this.diagnostics.recentErrors = [entry, ...this.diagnostics.recentErrors.slice(0, 4)];
  }
}
