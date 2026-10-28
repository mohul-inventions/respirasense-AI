import React, { useState } from 'react';
import { 
  Shield, Wifi, RefreshCw, AlertCircle, CheckCircle2, XCircle, 
  Smartphone, Terminal, HelpCircle, HardDrive, Cpu, Radio, Network, Info
} from 'lucide-react';
import { PhyphoxClient } from '../services/phyphoxClient';

interface DiagnosticsPageProps {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

export const DiagnosticsPage: React.FC<DiagnosticsPageProps> = ({
  initialUrl,
  onUrlChange,
}) => {
  const [phyphoxUrl, setPhyphoxUrl] = useState<string>(() => {
    return initialUrl || localStorage.getItem('respirasense_phyphox_url') || 'http://192.168.43.1:8080';
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
    hasAccel?: boolean;
    hasGyro?: boolean;
    accelStatus?: string;
    gyroStatus?: string;
    bufferNames?: string[];
  } | null>(null);

  const [phyphoxClient] = useState(() => new PhyphoxClient(phyphoxUrl));

  const handleUrlChange = (newVal: string) => {
    setPhyphoxUrl(newVal);
    localStorage.setItem('respirasense_phyphox_url', newVal);
    if (onUrlChange) {
      onUrlChange(newVal);
    }
  };

  const handleRunDiagnostic = async () => {
    setIsTesting(true);
    setTestResult(null);

    const target = phyphoxUrl.trim();
    if (!target) {
      setTestResult({
        success: false,
        message: 'Please provide a valid Phyphox URL (e.g. http://192.168.43.1:8080)',
      });
      setIsTesting(false);
      return;
    }

    const start = performance.now();

    // 1. First probe via Python backend /api/phyphox/test
    try {
      const res = await fetch(`/api/phyphox/test?base_url=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        const latency = data.latency_ms || Math.round(performance.now() - start);
        setTestResult({
          success: data.success,
          message: data.message,
          latency,
          hasAccel: data.has_accel,
          hasGyro: data.has_gyro,
          accelStatus: data.accel_status,
          gyroStatus: data.gyro_status,
          bufferNames: data.buffer_names,
        });
        setIsTesting(false);
        return;
      }
    } catch {
      // Backend probe unavailable, fallback to client-side probe
    }

    // 2. Client-side fallback probe
    phyphoxClient.setEndpoint(target);
    const clientRes = await phyphoxClient.testConnection();
    const latency = Math.round(performance.now() - start);

    setTestResult({
      success: clientRes.success,
      message: clientRes.message,
      latency,
      hasAccel: clientRes.hasAccel,
      hasGyro: clientRes.hasGyro,
      accelStatus: clientRes.hasAccel ? 'ACTIVE' : 'MISSING',
      gyroStatus: clientRes.hasGyro ? 'ACTIVE' : 'NOT IN EXPERIMENT',
      bufferNames: clientRes.bufferNames,
    });
    setIsTesting(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header */}
      <div className="max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5" />
          Hardware & Connection Telemetry
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy-800 tracking-tight">
          System Diagnostics & Phyphox Network Health
        </h1>
        <p className="text-sm sm:text-base text-clinical-muted leading-relaxed">
          Verify multi-network reachability, inspect live sensor buffer schemas, and diagnose Wi-Fi hotspot transitions across variable subnets.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Interactive Network Probe */}
        <div className="lg:col-span-5 clinical-card p-6 bg-white space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-navy-800 text-base">Phyphox Endpoint Probe</h3>
            <p className="text-xs text-clinical-muted">Test connection to phone and dynamically inspect available sensors</p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-navy-800 block mb-1">
                Phyphox Base URL:
              </label>
              <input
                type="text"
                value={phyphoxUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="e.g. http://192.168.43.1:8080"
                className="w-full font-mono px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500 text-xs"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Enter the exact URL shown on your phone under &quot;Remote access&quot;
              </span>
            </div>

            <button
              onClick={handleRunDiagnostic}
              disabled={isTesting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Probing Smartphone Endpoint...' : 'Probe Phyphox Connection'}</span>
            </button>
          </div>

          {/* Result Banner */}
          {testResult && (
            <div className={`p-4 rounded-xl border text-xs space-y-3 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="font-bold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span>{testResult.success ? 'Endpoint Reachable & Verified' : 'Connection Failed'}</span>
                </div>
                {testResult.latency !== undefined && (
                  <span className="font-mono text-[10px] bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                    {testResult.latency} ms RTT
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed">{testResult.message}</p>

              {/* Sensor Availability Grid */}
              <div className="pt-2 border-t border-emerald-200/50 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white/80 p-2 rounded border border-slate-200/60">
                  <div className="text-slate-500 font-medium">Accelerometer:</div>
                  <div className={`font-bold font-mono ${testResult.hasAccel ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {testResult.accelStatus || (testResult.hasAccel ? 'ACTIVE' : 'MISSING')}
                  </div>
                </div>
                <div className="bg-white/80 p-2 rounded border border-slate-200/60">
                  <div className="text-slate-500 font-medium">Gyroscope:</div>
                  <div className={`font-bold font-mono ${testResult.hasGyro ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {testResult.gyroStatus || (testResult.hasGyro ? 'ACTIVE' : 'NOT IN EXP')}
                  </div>
                </div>
              </div>

              {testResult.bufferNames && testResult.bufferNames.length > 0 && (
                <div className="pt-1 text-[10px] text-slate-600 font-mono">
                  Buffers detected: <span className="font-bold">{testResult.bufferNames.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Diagnostic Stats */}
          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <h4 className="font-bold text-navy-800">Diagnostic Parameters</h4>
            <div className="space-y-1.5 text-clinical-muted">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span>Protocol</span>
                <span className="font-mono text-navy-800">HTTP REST (Phyphox /get)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span>Decimation Pass</span>
                <span className="font-mono text-navy-800">Dynamic ➔ 50 Hz Target</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Timeout Limit</span>
                <span className="font-mono text-navy-800">3000 ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Multi-Network Setup & Firewall Guide */}
        <div className="lg:col-span-7 space-y-6">
          <div className="clinical-card p-6 bg-white space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-navy-800 text-base">Multi-Network Setup Instructions</h3>
              <p className="text-xs text-clinical-muted">Connecting across home Wi-Fi, office networks, and phone mobile hotspots</p>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-clinical-muted leading-relaxed">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <strong className="text-navy-800 block">Switching Networks Changes Your Phone&apos;s IP:</strong>
                  Whenever you switch Wi-Fi networks (e.g. from office to home or enabling your mobile hotspot), your phone receives a completely new IP address. Always check the new URL displayed on your phone&apos;s Phyphox screen and paste it into RespiraSense AI.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <strong className="text-navy-800 block">Streaming Both Accelerometer AND Gyroscope:</strong>
                  In Phyphox, the default <em>&quot;Acceleration with g&quot;</em> experiment only captures linear acceleration. To stream both <strong>Accelerometer and Gyroscope</strong> together, open the <em>&quot;Raw Sensors&quot;</em> experiment in Phyphox. RespiraSense AI dynamically detects whichever buffers are provided.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <strong className="text-navy-800 block">Enable Remote Access:</strong>
                  In Phyphox, tap the three-dots menu (<strong>⋮</strong>) in the top-right corner ➔ select <strong>&quot;Allow remote access&quot;</strong>, then confirm the prompt.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <strong className="text-navy-800 block">Press Play (▶) on Phone:</strong>
                  Phyphox only generates live sensor packets while the experiment is actively running. Tap Play (▶) at the top of the Phyphox screen.
                </div>
              </div>
            </div>
          </div>

          {/* Scientific Disclaimer & Network Isolation Guidance */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span>Network Isolation &amp; Local Reachability Reality</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              The phone and computer <strong>must reside on the same reachable local network</strong>. Entering a new URL in software cannot bypass router Wi-Fi client isolation (common on university or public hospital guest Wi-Fi networks) or router firewall port drops.
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800">
              <strong>Hotspot Recommendation:</strong> If your Wi-Fi router blocks peer-to-peer traffic, turn on <strong>Mobile Hotspot</strong> on your smartphone and connect your laptop directly to the phone&apos;s Wi-Fi hotspot. Phyphox will typically display an IP like <code>http://192.168.43.1:8080</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
