import React, { useState } from 'react';
import { Activity, Shield, Cpu, PlayCircle, FlaskConical, CheckCircle2, FileText, Menu, X, ExternalLink, Building2, Sparkles } from 'lucide-react';

interface HeaderProps {
  activePage: string;
  setActivePage: (page: string) => void;
  isLive: boolean;
}

export const Header: React.FC<HeaderProps> = ({ activePage, setActivePage, isLive }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home', label: 'Home', icon: Activity },
    { id: 'technology', label: 'Technology', icon: Cpu },
    { id: 'monitoring', label: 'Monitoring Workspace', icon: PlayCircle },
    { id: 'validation', label: 'Research & Validation', icon: CheckCircle2 },
    { id: 'lab', label: 'Activity Lab', icon: FlaskConical },
    { id: 'diagnostics', label: 'Setup & Diagnostics', icon: Shield },
    { id: 'about', label: 'About', icon: FileText },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-clinical-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Product Brand */}
          <div 
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={() => setActivePage('home')}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-navy-800 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-navy-800">RespiraSense</span>
                <span className="text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-200">AI</span>
              </div>
              <p className="text-[11px] text-clinical-muted font-medium hidden sm:block">Respiratory Signal Analysis Platform</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-teal-50 text-teal-600 border border-teal-200 shadow-xs'
                      : 'text-clinical-muted hover:text-navy-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => setActivePage('monitoring')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold shadow-sm transition-all shadow-teal-500/25"
            >
              <PlayCircle className="w-4 h-4" />
              Open Monitoring
            </button>
            <a
              href="http://localhost:8501"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-800 hover:bg-navy-900 text-slate-200 text-xs font-semibold border border-navy-700 shadow-sm transition-all"
              title="Launch dedicated Python Streamlit Telemetry Dashboard"
            >
              <span>Streamlit Hub</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-clinical-muted hover:text-navy-800 hover:bg-slate-100"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-clinical-border bg-white px-4 pt-2 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-teal-50 text-teal-600 border border-teal-200'
                    : 'text-clinical-muted hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <button
              onClick={() => {
                setActivePage('monitoring');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-teal-500 text-white text-xs font-bold shadow-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Open Monitoring Workspace
            </button>
            <a
              href="http://localhost:8501"
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-navy-800 text-slate-200 text-xs font-semibold"
            >
              <span>Open Streamlit Dashboard</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
