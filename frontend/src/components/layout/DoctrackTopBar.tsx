import React from 'react';
import { 
  Search, Bell, Play, Pause, RefreshCw, Smartphone, 
  ExternalLink, Wifi, ShieldAlert, Sparkles, Filter
} from 'lucide-react';
import { SourceMode, ConnectionState } from '../../types/telemetry';

interface DoctrackTopBarProps {
  sourceMode: SourceMode;
  connectionState: ConnectionState;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  scenario: string;
  setScenario: (sc: string) => void;
  phoneIp: string;
  setPhoneIp: (ip: string) => void;
  phonePort: number;
  setPhonePort: (port: number) => void;
  onConnectPhyphox: () => void;
  lastSuccessfulPoll?: string | null;
  latestError?: string | null;
  sampleCount?: number;
}

export const DoctrackTopBar: React.FC<DoctrackTopBarProps> = ({
  sourceMode,
  connectionState,
  isStreaming,
  setIsStreaming,
  scenario,
  setScenario,
  phoneIp,
  setPhoneIp,
  phonePort,
  setPhonePort,
  onConnectPhyphox,
  lastSuccessfulPoll,
  latestError,
  sampleCount = 0,
}) => {
  return (
    <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 sticky top-0 z-30 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      {/* Left: Global Search & Room Context */}
      <div className="flex items-center gap-4 flex-1 w-full md:w-auto">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search patients, vitals, signals (⌘K)..."
            className="w-full pl-9 pr-12 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-200/70 text-[10px] font-mono text-slate-500">
            ⌘K
          </kbd>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 border-l border-slate-200 pl-4 font-medium">
          <span>Pulmonology & Respiratory Care</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono text-slate-700 font-bold">Main Wing Bay 4</span>
        </div>
      </div>

      {/* Right Controls: Mode specifics, Play/Pause, Notifications */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Scenario Selector when in SIMULATED Mode */}
        {sourceMode === 'SIMULATED' ? (
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <span className="text-[10px] font-bold text-amber-700 px-2 uppercase">Scenario:</span>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="resting">1. Quiet Resting (15 bpm)</option>
              <option value="walking">2. Walking Artifact (1.8 Hz)</option>
              <option value="posture_transition">3. Posture Transition (Tilt Shift)</option>
              <option value="coughing">4. Cough Transient Impulse</option>
              <option value="tachypnea">5. Tachypnea Deterioration (31.5 bpm)</option>
              <option value="clipping">6. Hardware Saturation Rail</option>
            </select>
          </div>
        ) : (
          /* Live Phyphox Connection Input */
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs font-mono">
              <span className="text-slate-400 pl-1">http://</span>
              <input
                type="text"
                value={phoneIp}
                onChange={(e) => setPhoneIp(e.target.value)}
                className="w-36 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                placeholder="e.g. 192.168.43.1"
              />
              <span className="text-slate-400">:</span>
              <input
                type="number"
                value={phonePort}
                onChange={(e) => setPhonePort(Number(e.target.value))}
                className="w-14 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs focus:outline-none"
              />
              <button
                onClick={onConnectPhyphox}
                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-bold transition-all"
                title="Connect backend to Phyphox server"
              >
                Sync
              </button>
            </div>

            {/* Small Connection Diagnostic Pill */}
            <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${connectionState === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : (connectionState === 'CONNECTING' ? 'bg-amber-500 animate-spin' : 'bg-rose-500')}`} />
              <span>Poll: <b>{lastSuccessfulPoll || 'None'}</b></span>
              <span>•</span>
              <span>Samples: <b>{sampleCount.toLocaleString()}</b></span>
              {latestError && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 truncate max-w-[150px]" title={latestError}>Err: {latestError}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Play/Pause Streaming Toggle */}
        <button
          onClick={() => setIsStreaming(!isStreaming)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
            isStreaming
              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isStreaming ? 'Pause' : 'Resume'}</span>
        </button>

        {/* Streamlit Hub Direct Launcher */}
        <a
          href="http://localhost:8501"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all"
          title="Open Python Streamlit Continuous Monitoring Hub"
        >
          <span>Streamlit Hub</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>

        {/* Notification Bell */}
        <button className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 relative transition-all">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-2 right-2 ring-2 ring-white" />
        </button>
      </div>
    </header>
  );
};
