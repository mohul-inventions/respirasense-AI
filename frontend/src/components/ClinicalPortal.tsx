import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  FileText,
  Database,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Calendar,
  Activity,
  ArrowRight,
  RefreshCw,
  Clock,
  Waves,
  HeartPulse,
  Layers,
  FileCheck,
  Building,
  Info,
  ChevronDown
} from 'lucide-react';

interface ClinicalPortalProps {
  onBackToTelemetry: () => void;
  activePatientId?: string;
  onPatientChange?: (patientId: string) => void;
}

export const ClinicalPortal: React.FC<ClinicalPortalProps> = ({
  onBackToTelemetry,
  activePatientId: initialPatientId,
  onPatientChange
}) => {
  const [activeTab, setActiveTab] = useState<'BASELINE' | 'HISTORY' | 'REPORTS' | 'EXPORT' | 'SOUNDS' | 'AUTH'>('BASELINE');

  // Auth State
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('respirasense_token') || '');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activePatientId, setActivePatientId] = useState<string>(() => localStorage.getItem('respirasense_patient_id') || initialPatientId || 'RS-2026-DEMO');

  // Form states
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Registration state
  const [regFullName, setRegFullName] = useState('');
  const [regDob, setRegDob] = useState('1985-06-15');
  const [regSex, setRegSex] = useState('MALE');
  const [regHeight, setRegHeight] = useState('175');
  const [regWeight, setRegWeight] = useState('72');
  const [regContext, setRegContext] = useState('Mild nocturnal dyspnea, post-viral airway recovery');
  const [regHospital, setRegHospital] = useState('Metro Health Respiratory Care Center');
  const [regClinician, setRegClinician] = useState('Dr. Sarah Chen, MD (Pulmonology)');
  const [regPassword, setRegPassword] = useState('RespiraCare2026!');

  // Baseline data
  const [baselineData, setBaselineData] = useState<any>(null);
  const [loadingBaseline, setLoadingBaseline] = useState<boolean>(false);

  // History data
  const [historyData, setHistoryData] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Reports data
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);
  const [reportNotes, setReportNotes] = useState<string>('Standard 7-day post-viral respiratory trajectory review.');

  // Hospital Export data
  const [exportPackage, setExportPackage] = useState<any>(null);
  const [exportStatus, setExportStatus] = useState<string>('IDLE');
  const [exportMessage, setExportMessage] = useState<string>('');
  const [destinationEndpoint, setDestinationEndpoint] = useState<string>('https://hospital-ehr.internal-net.local/v1/fhir-ingest');

  // Emergency Access state
  const [emergencyReason, setEmergencyReason] = useState<string>('Acute nocturnal desaturation observed during shift rounds.');
  const [emergencyResult, setEmergencyResult] = useState<any>(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState<boolean>(false);

  // Crepitation Analysis state
  const [crepitationData, setCrepitationData] = useState<any>(null);
  const [loadingCrepitation, setLoadingCrepitation] = useState<boolean>(false);

  // Initialize and check current user
  useEffect(() => {
    if (authToken) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.session) {
          setCurrentUser(data.session);
          if (data.session.patient_id) {
            setActivePatientId(data.session.patient_id);
            localStorage.setItem('respirasense_patient_id', data.session.patient_id);
            if (onPatientChange) onPatientChange(data.session.patient_id);
          }
        } else {
          setAuthToken('');
          localStorage.removeItem('respirasense_token');
        }
      })
      .catch(() => {});
    }
  }, [authToken]);

  // Fetch baseline when tab or patient changes
  const fetchBaseline = async (pid: string = activePatientId) => {
    setLoadingBaseline(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/patient/baseline?patient_id=${encodeURIComponent(pid)}`, { headers });
      const data = await res.json();
      setBaselineData(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingBaseline(false);
    }
  };

  // Fetch 30-day history
  const fetchHistory = async (pid: string = activePatientId) => {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/patient/history?patient_id=${encodeURIComponent(pid)}&days=30`, { headers });
      const data = await res.json();
      setHistoryData(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch Crepitations
  const fetchCrepitations = async () => {
    setLoadingCrepitation(true);
    try {
      const res = await fetch('/api/experimental/crepitations');
      const data = await res.json();
      setCrepitationData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCrepitation(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'BASELINE') fetchBaseline();
    if (activeTab === 'HISTORY') fetchHistory();
    if (activeTab === 'SOUNDS') fetchCrepitations();
  }, [activeTab, activePatientId]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginId, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }
      setAuthToken(data.token);
      localStorage.setItem('respirasense_token', data.token);
      setCurrentUser(data.patient);
      setActivePatientId(data.patient.patient_id);
      localStorage.setItem('respirasense_patient_id', data.patient.patient_id);
      if (onPatientChange) onPatientChange(data.patient.patient_id);
      setAuthSuccess(`Welcome, ${data.patient.full_name} (${data.patient.patient_id})`);
      setActiveTab('BASELINE');
    } catch (err: any) {
      setAuthError(err.message || 'Login network error');
    }
  };

  // Handle Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: regFullName,
          dob: regDob,
          sex: regSex,
          height_cm: regHeight,
          weight_kg: regWeight,
          medical_context: regContext,
          hospital_clinic: regHospital,
          treating_clinician: regClinician,
          password: regPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed');
        return;
      }
      setAuthSuccess(`Patient registered! New ID: ${data.patient_id}. You can now log in.`);
      setLoginId(data.patient_id);
      setLoginPassword(regPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Registration error');
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token: authToken })
      });
    } catch (e) {}
    setAuthToken('');
    localStorage.removeItem('respirasense_token');
    setCurrentUser(null);
    setAuthSuccess('Logged out successfully.');
  };

  // Generate Report
  const handleGenerateReport = async (type: string = 'SEVEN_DAY_BASELINE') => {
    setGeneratingReport(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: activePatientId,
          report_type: type,
          clinician_notes: reportNotes
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReportsList(prev => [data, ...prev]);
      } else {
        alert(data.error || 'Report generation failed');
      }
    } catch (err: any) {
      alert('Error generating report: ' + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Prepare Hospital Export
  const handlePrepareExport = async () => {
    setExportStatus('PREPARING');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/export/prepare', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: activePatientId,
          destination_endpoint: destinationEndpoint
        })
      });
      const data = await res.json();
      if (res.ok) {
        setExportPackage(data);
        setExportStatus(data.status);
        setExportMessage(data.message);
      } else {
        setExportStatus('FAILED');
        setExportMessage(data.error || 'Preparation failed');
      }
    } catch (e: any) {
      setExportStatus('FAILED');
      setExportMessage(e.message);
    }
  };

  // Transmit Hospital Export
  const handleAuthorizeExport = async (simulateFail: boolean = false) => {
    if (!exportPackage?.export_id) return;
    setExportStatus('TRANSMITTING');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/export/authorize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          export_id: exportPackage.export_id,
          simulate_network_failure: simulateFail
        })
      });
      const data = await res.json();
      setExportStatus(data.status);
      setExportMessage(data.message || data.error || '');
    } catch (e: any) {
      setExportStatus('FAILED');
      setExportMessage(e.message);
    }
  };

  // Emergency Break-Glass Request
  const handleEmergencyAccess = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/emergency/access', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_patient_id: activePatientId,
          justification_reason: emergencyReason,
          clinician_role: 'clinician'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEmergencyResult(data);
      } else {
        alert(data.error || 'Emergency access failed');
      }
    } catch (e: any) {
      alert('Emergency request error: ' + e.message);
    }
  };

  // Approve Thresholds
  const handleApproveThreshold = async (configId: number) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/patient/threshold/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: activePatientId,
          config_id: configId,
          override_reason: 'Clinician confirmed personalized thresholds against 7-day baseline'
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Thresholds approved and activated successfully.');
        fetchBaseline();
      } else {
        alert(data.error || 'Approval failed');
      }
    } catch (e: any) {
      alert('Threshold approval error: ' + e.message);
    }
  };

  return (
    <div className="bg-[#0B132B] text-slate-100 min-h-screen p-6 font-sans">
      
      {/* Top Banner & Navigation */}
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToTelemetry}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
            >
              ← Live Telemetry
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-teal-400" />
                RespiraSense AI <span className="text-teal-400 font-mono text-xs uppercase px-2 py-0.5 bg-teal-950/80 rounded border border-teal-800">Clinical Portal</span>
              </h1>
              <p className="text-xs text-slate-400">
                Patient Authentication, 7-Day Baseline, 30-Day Longitudinal History & Hospital Archive
              </p>
            </div>
          </div>

          {/* Current Patient & Session Card */}
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <User className="w-4 h-4 text-teal-400" />
            <div className="text-xs">
              <span className="text-slate-400 text-[11px] block">Active Patient:</span>
              <span className="font-mono font-bold text-teal-300">{activePatientId}</span>
              {currentUser && <span className="text-slate-400 ml-1.5">({currentUser.full_name})</span>}
            </div>
            {currentUser ? (
              <button
                onClick={handleLogout}
                className="ml-2 px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-300 text-xs rounded border border-red-800 transition"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('AUTH')}
                className="ml-2 px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded transition"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'BASELINE', label: '7-Day Baseline & Limits', icon: Activity },
            { id: 'HISTORY', label: '30-Day Longitudinal History', icon: Calendar },
            { id: 'REPORTS', label: 'Medical PDF Reports', icon: FileText },
            { id: 'EXPORT', label: 'Hospital Archive & Break-Glass', icon: Database },
            { id: 'SOUNDS', label: 'Experimental Lung Sounds', icon: Waves },
            { id: 'AUTH', label: 'Patient Identity & Registration', icon: User },
          ].map(tab => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  isSel
                    ? 'bg-teal-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSel ? 'text-slate-950' : 'text-teal-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: 7-DAY PERSONALIZED BASELINE */}
        {activeTab === 'BASELINE' && (
          <div className="space-y-6">
            
            {/* 4-Way Conceptual Separation Notice */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Concept 1: General Standard</span>
                <h4 className="text-sm font-bold text-white mt-1">General Clinical Limits</h4>
                <div className="text-xl font-mono font-black text-amber-400 mt-2">12 – 20 <span className="text-xs font-normal text-slate-400">bpm</span></div>
                <p className="text-[11px] text-slate-400 mt-1">Standard adult resting reference boundaries used prior to baseline maturity.</p>
              </div>

              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-teal-400 uppercase tracking-wider block">Concept 2: Observed Data</span>
                <h4 className="text-sm font-bold text-white mt-1">Personalized Baseline</h4>
                <div className="text-xl font-mono font-black text-teal-300 mt-2">
                  {baselineData?.median_rr ? `${baselineData.median_rr.toFixed(1)} bpm` : '--'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Observed 7-day median from actual valid resting measurements (IQR: {baselineData?.iqr_rr?.toFixed(1) || '--'}).
                </p>
              </div>

              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">Concept 3: Candidate Rule</span>
                <h4 className="text-sm font-bold text-white mt-1">Candidate Thresholds</h4>
                <div className="text-sm font-mono text-cyan-300 mt-2 font-bold">
                  {baselineData?.candidate_thresholds ? (
                    `${baselineData.candidate_thresholds.provisional_low_threshold_bpm} – ${baselineData.candidate_thresholds.provisional_high_threshold_bpm} bpm`
                  ) : 'Requires 50% Coverage'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Provisional mathematical thresholds. Unenforced until clinician approval.</p>
              </div>

              <div className="bg-[#0F1B2D] p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">Concept 4: Enforced Limit</span>
                <h4 className="text-sm font-bold text-white mt-1">Clinician-Approved Limits</h4>
                <div className="text-sm font-mono text-emerald-400 mt-2 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  {baselineData?.candidate_thresholds?.status === 'CLINICIAN_APPROVED' ? 'Active Personalized' : 'General Limits Active (12-20)'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Clinician signature required to replace standard general bounds.</p>
              </div>
            </div>

            {/* Baseline Summary & Coverage Banner */}
            <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-400" />
                    7-Day Longitudinal Respiratory Statistics
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Calculated from actual recorded telemetry excluding movement artefacts, walking periods, and invalid SQI windows.
                  </p>
                </div>
                <button
                  onClick={() => fetchBaseline()}
                  disabled={loadingBaseline}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBaseline ? 'animate-spin' : ''}`} />
                  Refresh Baseline
                </button>
              </div>

              {/* Coverage & Status Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 text-xs font-mono">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Valid Coverage:</span>
                  <span className={`text-base font-bold ${
                    (baselineData?.valid_data_coverage_pct || 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {baselineData?.valid_data_coverage_pct || 0}%
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Mean RR:</span>
                  <span className="text-base font-bold text-white">
                    {baselineData?.mean_rr ? `${baselineData.mean_rr.toFixed(1)} bpm` : '--'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Median RR:</span>
                  <span className="text-base font-bold text-teal-300">
                    {baselineData?.median_rr ? `${baselineData.median_rr.toFixed(1)} bpm` : '--'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Std Dev:</span>
                  <span className="text-base font-bold text-white">
                    {baselineData?.std_rr ? `±${baselineData.std_rr.toFixed(1)}` : '--'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Resting vs Active:</span>
                  <span className="text-sm font-bold text-cyan-300">
                    {baselineData?.resting_mean_rr ? `${baselineData.resting_mean_rr.toFixed(1)} / ${baselineData.active_mean_rr?.toFixed(1) || '--'}` : '--'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Mean SQI:</span>
                  <span className="text-base font-bold text-emerald-400">
                    {baselineData?.mean_sqi ? baselineData.mean_sqi.toFixed(2) : '--'}
                  </span>
                </div>
              </div>

              {/* Insufficient coverage warning if under 50% */}
              {(baselineData?.valid_data_coverage_pct || 0) < 50 && (
                <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Coverage Insufficiency Warning:</strong> Valid data coverage is {baselineData?.valid_data_coverage_pct || 0}% (&lt; 50% threshold). Observation window automatically extended; candidate thresholds remain provisional.
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-900/80 rounded text-[10px] font-mono font-bold">
                    EXTENDED OBSERVATION
                  </span>
                </div>
              )}

              {/* Candidate Threshold Approval Panel */}
              {baselineData?.candidate_thresholds && (
                <div className="mt-5 p-4 bg-slate-900/90 rounded-xl border border-cyan-900/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                        Candidate Threshold Proposal #{baselineData.candidate_thresholds.config_id || 1}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        baselineData.candidate_thresholds.status === 'CLINICIAN_APPROVED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {baselineData.candidate_thresholds.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Proposed Low Limit: <strong>{baselineData.candidate_thresholds.provisional_low_threshold_bpm} bpm</strong> • Proposed High Limit: <strong>{baselineData.candidate_thresholds.provisional_high_threshold_bpm} bpm</strong> (Confidence: {baselineData.candidate_thresholds.confidence_score})
                    </p>
                  </div>
                  {baselineData.candidate_thresholds.status !== 'CLINICIAN_APPROVED' && (
                    <button
                      onClick={() => handleApproveThreshold(baselineData.candidate_thresholds.config_id || 1)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Approve Thresholds (Clinician Review)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Daily Breakdown Table */}
            {baselineData?.daily_breakdowns && baselineData.daily_breakdowns.length > 0 && (
              <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
                <h4 className="text-xs font-mono uppercase text-slate-400 tracking-wider mb-3">Daily Breakdown History (7 Days)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Valid Samples</th>
                        <th className="pb-2">Mean RR (bpm)</th>
                        <th className="pb-2">Median RR (bpm)</th>
                        <th className="pb-2">Std Dev</th>
                        <th className="pb-2">Min - Max</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {baselineData.daily_breakdowns.map((d: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="py-2.5 font-bold text-white">{d.date}</td>
                          <td className="py-2.5 text-teal-400">{d.count}</td>
                          <td className="py-2.5">{d.mean_rr ? d.mean_rr.toFixed(1) : '--'}</td>
                          <td className="py-2.5 text-cyan-300 font-bold">{d.median_rr ? d.median_rr.toFixed(1) : '--'}</td>
                          <td className="py-2.5 text-slate-400">{d.std_rr ? `±${d.std_rr.toFixed(1)}` : '--'}</td>
                          <td className="py-2.5 text-slate-300">{d.min_rr ? `${d.min_rr.toFixed(1)} – ${d.max_rr?.toFixed(1)}` : '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 30-DAY LONGITUDINAL PATIENT HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-400" />
                    30-Day Longitudinal Patient Timeline
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Adheres to data minimization: raw IMU samples are omitted, displaying derived daily summaries.
                  </p>
                </div>
                <button
                  onClick={() => fetchHistory()}
                  disabled={loadingHistory}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  Reload Timeline
                </button>
              </div>

              {historyData?.timeline && historyData.timeline.length > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-xs font-mono text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2.5">Date</th>
                        <th className="pb-2.5">Valid Windows</th>
                        <th className="pb-2.5">Rejected Windows</th>
                        <th className="pb-2.5">Mean Rate</th>
                        <th className="pb-2.5">Min / Max</th>
                        <th className="pb-2.5">Average SQI</th>
                        <th className="pb-2.5">Rest vs Walking vs Posture</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {historyData.timeline.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="py-3 font-bold text-white">{row.date}</td>
                          <td className="py-3 text-emerald-400">{row.valid_samples}</td>
                          <td className="py-3 text-amber-400">{row.rejected_samples}</td>
                          <td className="py-3 font-bold text-teal-300">{row.mean_rr ? `${row.mean_rr.toFixed(1)} bpm` : '--'}</td>
                          <td className="py-3 text-slate-300">{row.min_rr ? `${row.min_rr} – ${row.max_rr} bpm` : '--'}</td>
                          <td className="py-3 text-cyan-300">{row.avg_sqi.toFixed(2)}</td>
                          <td className="py-3 text-[11px] text-slate-400">
                            Rest: {row.motion_breakdown?.REST || 0} • Walk: {row.motion_breakdown?.WALKING_MOTION || 0} • Posture: {row.motion_breakdown?.POSTURE_CHANGE || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No 30-day historical records logged yet for patient <strong>{activePatientId}</strong>.<br/>
                  Live telemetry streaming will automatically log derived measurements into the longitudinal database.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MEDICAL PDF REPORTS */}
        {activeTab === 'REPORTS' && (
          <div className="space-y-6">
            <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
                <FileText className="w-4 h-4 text-teal-400" />
                Professional Clinical PDF Report Generator (ReportLab 5.0)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="text-xs font-mono text-slate-300 block mb-1.5 font-bold">
                      Clinician Observations / Longitudinal Review Notes:
                    </label>
                    <textarea
                      value={reportNotes}
                      onChange={(e) => setReportNotes(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                      placeholder="Enter optional clinical findings for inclusion in the PDF..."
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleGenerateReport('SEVEN_DAY_BASELINE')}
                      disabled={generatingReport}
                      className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                    >
                      <FileCheck className="w-4 h-4" />
                      {generatingReport ? 'Generating PDF...' : 'Generate 7-Day Baseline Report (PDF)'}
                    </button>
                    <button
                      onClick={() => handleGenerateReport('THIRTY_DAY_LONGITUDINAL')}
                      disabled={generatingReport}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs font-bold transition flex items-center gap-2 border border-slate-700"
                    >
                      <Calendar className="w-4 h-4" />
                      Generate 30-Day Longitudinal Report (PDF)
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                  <span className="text-[10px] font-mono text-teal-400 uppercase tracking-wider block font-bold">PDF Report Features</span>
                  <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                    <li>Hospital header and demographic summary</li>
                    <li>7-day coverage % and missing data calculations</li>
                    <li>Resting vs active respiratory distributions</li>
                    <li>SQI and movement artefact breakdown</li>
                    <li>Locked default audio gate settings verification</li>
                    <li>Provisional vs approved alert threshold limits</li>
                    <li>Formal non-diagnostic research disclaimer</li>
                  </ul>
                </div>
              </div>

              {/* Reports Download List */}
              <div className="mt-6 pt-6 border-t border-slate-800">
                <h4 className="text-xs font-mono uppercase text-slate-400 tracking-wider mb-3">Generated Reports Archive</h4>
                {reportsList.length > 0 ? (
                  <div className="space-y-3">
                    {reportsList.map((rep, idx) => (
                      <div key={idx} className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-teal-400" />
                          <div className="text-xs font-mono">
                            <div className="font-bold text-white">{rep.filename}</div>
                            <div className="text-[10px] text-slate-400">
                              Report ID: {rep.report_id} • SHA-256: {rep.checksum_sha256?.substring(0, 16)}... • Size: {(rep.file_size_bytes / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </div>
                        <a
                          href={`/api/reports/download?report_id=${encodeURIComponent(rep.report_id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download PDF
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No reports generated in this session yet. Click the button above to generate a clinical PDF.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: HOSPITAL ARCHIVE & BREAK-GLASS WORKFLOW */}
        {activeTab === 'EXPORT' && (
          <div className="space-y-6">
            <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
                <Database className="w-4 h-4 text-teal-400" />
                Hospital Data Export & Emergency Break-Glass Engine
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                
                {/* Export Machine */}
                <div className="space-y-4">
                  <span className="text-xs font-mono text-teal-400 uppercase font-bold block">1. Standard Hospital EHR Ingest</span>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">Destination Endpoint (Simulated Mode Active):</label>
                    <input
                      type="text"
                      value={destinationEndpoint}
                      onChange={(e) => setDestinationEndpoint(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handlePrepareExport}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                    >
                      <Database className="w-3.5 h-3.5" />
                      Prepare JSON + PDF Archive
                    </button>
                    {exportPackage && (
                      <button
                        onClick={() => handleAuthorizeExport(false)}
                        className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Authorize Transfer
                      </button>
                    )}
                  </div>

                  {/* Safety Test Button */}
                  {exportPackage && (
                    <div className="pt-2">
                      <button
                        onClick={() => handleAuthorizeExport(true)}
                        className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 rounded text-xs font-mono border border-red-800 transition flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        Test Non-Destructive Failure (Simulate Unreachable Endpoint)
                      </button>
                    </div>
                  )}

                  {/* Export Status Card */}
                  {exportPackage && (
                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Export State:</span>
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          exportStatus === 'EXPORT_COMPLETED' ? 'bg-emerald-950 text-emerald-300' : (exportStatus === 'DESTINATION_UNAVAILABLE' ? 'bg-red-950 text-red-300' : 'bg-cyan-950 text-cyan-300')
                        }`}>
                          {exportStatus}
                        </span>
                      </div>
                      <div className="text-slate-400">Package: <span className="text-white">{exportPackage.package_file}</span></div>
                      <div className="text-slate-400">SHA-256: <span className="text-teal-300">{exportPackage.checksum_sha256?.substring(0, 20)}...</span></div>
                      {exportMessage && <div className="text-amber-300 pt-1">{exportMessage}</div>}
                    </div>
                  )}
                </div>

                {/* Emergency Break-Glass */}
                <div className="space-y-4 bg-slate-900/60 p-4 rounded-xl border border-amber-900/40">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-xs font-mono uppercase font-bold">2. Emergency Clinician Break-Glass Access</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Bypasses ordinary patient boundary access in acute critical emergencies. Requires mandatory justification and produces immutable audit records.
                  </p>

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">Clinical Emergency Justification (Required):</label>
                    <textarea
                      value={emergencyReason}
                      onChange={(e) => setEmergencyReason(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                      placeholder="Document clinical reason for break-glass triage..."
                    />
                  </div>

                  <button
                    onClick={handleEmergencyAccess}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded text-xs font-black transition flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Trigger Emergency Break-Glass Access
                  </button>

                  {emergencyResult && (
                    <div className="bg-slate-950 p-3 rounded-lg border border-amber-800 text-[11px] font-mono space-y-1">
                      <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Emergency Access Granted & Audited
                      </div>
                      <div className="text-slate-300">Patient: {emergencyResult.patient?.full_name}</div>
                      <div className="text-slate-400">Recent Records Retrieved: {emergencyResult.recent_telemetry?.length || 0}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: EXPERIMENTAL RESPIRATORY SOUNDS & CREPITATIONS */}
        {activeTab === 'SOUNDS' && (
          <div className="space-y-6">
            <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Waves className="w-4 h-4 text-cyan-400" />
                    Experimental Respiratory Sound & Crepitation Analysis
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Physical hardware boundary enforcement: Accelerometer micro-vibrations cannot diagnose lung crackles.
                  </p>
                </div>
                <button
                  onClick={fetchCrepitations}
                  disabled={loadingCrepitation}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCrepitation ? 'animate-spin' : ''}`} />
                  Analyze Sound
                </button>
              </div>

              {/* Physical Sensor Limitation Box */}
              <div className="mt-4 p-4 bg-red-950/30 border border-red-800/80 rounded-xl text-xs space-y-1.5">
                <span className="font-bold text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Biomedical Sensor Limitation Rule (Nyquist Frequency Enforcement):
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Smartphone accelerometers sample at ≤ 100 Hz, yielding an absolute Nyquist bandwidth of ≤ 50 Hz.
                  Fine and coarse lung crackles (crepitations) occur exclusively between <strong>200 Hz and 1200 Hz</strong>.
                  Consequently, accelerometer data alone is <strong>strictly rejected</strong> for crackle detection to eliminate false positives.
                </p>
              </div>

              {/* Analysis Result */}
              {crepitationData && (
                <div className="mt-5 bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Analysis Status:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      crepitationData.available ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {crepitationData.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Positive Crepitation Diagnosis:</span>
                    <span className="font-bold text-amber-400">
                      {crepitationData.is_positive_diagnosis ? 'TRUE (CANDIDATE ONLY)' : 'FALSE (NO DIAGNOSIS CLAIMED)'}
                    </span>
                  </div>
                  <div className="p-3 bg-black/40 rounded border border-slate-800 text-[11px] text-slate-400">
                    <span className="text-slate-300 font-bold block mb-1">Sensor Limitation Statement:</span>
                    {crepitationData.biomedical_limitation}
                  </div>
                  <div className="text-[10px] text-slate-500 italic">
                    Disclaimer: {crepitationData.disclaimer}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: AUTH & PATIENT REGISTRATION */}
        {activeTab === 'AUTH' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Login Box */}
              <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal-400" />
                  Patient / Clinician Secure Login
                </h3>
                <p className="text-xs text-slate-400">
                  PBKDF2-HMAC-SHA256 authenticated login (200,000 rounds) with role-based access control.
                </p>

                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">Patient ID or Full Name:</label>
                    <input
                      type="text"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="e.g. RS-2026-XXXX or Jane Doe"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">Password:</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold transition shadow"
                  >
                    Authenticate
                  </button>
                </form>

                {/* Quick Switcher for Demo */}
                <div className="pt-3 border-t border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 block mb-2">QUICK DEMO PROFILES:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setActivePatientId('RS-2026-DEMO');
                        localStorage.setItem('respirasense_patient_id', 'RS-2026-DEMO');
                        if (onPatientChange) onPatientChange('RS-2026-DEMO');
                        setActiveTab('BASELINE');
                      }}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-teal-300 text-xs rounded border border-slate-800 font-mono"
                    >
                      Demo Patient
                    </button>
                    <button
                      onClick={() => {
                        setActivePatientId('RS-2026-SARAH');
                        localStorage.setItem('respirasense_patient_id', 'RS-2026-SARAH');
                        if (onPatientChange) onPatientChange('RS-2026-SARAH');
                        setActiveTab('BASELINE');
                      }}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-300 text-xs rounded border border-slate-800 font-mono"
                    >
                      Sarah Jenkins
                    </button>
                  </div>
                </div>
              </div>

              {/* Registration Box */}
              <div className="bg-[#0F1B2D] p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-400" />
                  New Patient Self-Registration
                </h3>
                
                <form onSubmit={handleRegister} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">Full Legal Name:</label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Eleanor Vance"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">DOB:</label>
                      <input
                        type="date"
                        value={regDob}
                        onChange={(e) => setRegDob(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs font-mono text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Sex:</label>
                      <select
                        value={regSex}
                        onChange={(e) => setRegSex(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs font-mono text-white"
                      >
                        <option value="FEMALE">Female</option>
                        <option value="MALE">Male</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Height (cm):</label>
                      <input
                        type="number"
                        value={regHeight}
                        onChange={(e) => setRegHeight(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-300 block mb-1">Password (min 8 chars, mixed case & digit):</label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-white"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded text-xs font-bold transition border border-teal-800/60"
                  >
                    Register Patient & Generate Patient ID
                  </button>
                </form>
              </div>
            </div>

            {/* Notification messages */}
            {authError && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{authError}</span>
              </div>
            )}
            {authSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};