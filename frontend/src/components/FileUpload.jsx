import { useState, useRef } from 'react';
import '../styles/FileUpload.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const VALID_EXTS = ['.csv', '.xlsx', '.xls', '.json'];

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
    title: 'Pandas EDA',
    desc: 'Full statistical analysis with outlier detection and correlation mapping',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
      </svg>
    ),
    title: 'Smart Charts',
    desc: 'Auto-selected chart types: bar, line, pie, scatter — from your actual columns',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
    ),
    title: 'AI Insights',
    desc: 'Plain-language key findings generated from your data',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
      </svg>
    ),
    title: 'Live Filters',
    desc: 'Filter, search and export your data without re-uploading',
  },
];

export default function FileUpload({ onDashboardGenerated }) {
  const [file, setFile]         = useState(null);
  const [prompt, setPrompt]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [step, setStep]         = useState('');
  const [stepIdx, setStepIdx]   = useState(0);
  const [error, setError]       = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const STEPS = ['Uploading file', 'Running pandas EDA', 'Building dashboard'];

  const validateAndSet = (f) => {
    if (!f) return;
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (VALID_EXTS.includes(ext)) { setFile(f); setError(''); }
    else { setError('Please upload a CSV, Excel (.xlsx / .xls), or JSON file.'); setFile(null); }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); validateAndSet(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file first.'); return; }
    setLoading(true);
    setError('');
    try {
      setStep(STEPS[0]); setStepIdx(0);
      const fd = new FormData();
      fd.append('file', file);
      if (prompt) fd.append('prompt', prompt);

      setStep(STEPS[1]); setStepIdx(1);
      const res = await fetch(`${API_BASE}/api/dashboard/upload`, { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(d.error || 'Upload failed');
      }
      setStep(STEPS[2]); setStepIdx(2);
      const result = await res.json();
      onDashboardGenerated(result);
      setFile(null); setPrompt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); setStep('');
    }
  };

  return (
    <div className="fu-page">
      <div className="fu-hero">
        {/* Left — upload card */}
        <div className="fu-card" role="main">
          <div className="fu-card-header">
            <div className="fu-badge">AI-Powered</div>
            <h1 className="fu-title">Dashboard Generator</h1>
            <p className="fu-subtitle">
              Upload any CSV, Excel, or JSON file and get a fully dynamic
              analytics dashboard powered by Python EDA in seconds.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="fu-form">
            {/* Drop zone */}
            <div
              className={`fu-drop ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragging(false)}
              onClick={() => !loading && inputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Click or drag a file here to upload"
              onKeyDown={(e) => e.key === 'Enter' && !loading && inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={(e) => validateAndSet(e.target.files[0])}
                disabled={loading}
                style={{ display: 'none' }}
                aria-hidden="true"
              />
              <div className="fu-drop-icon" aria-hidden="true">
                {file ? (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                  </svg>
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                )}
              </div>
              {file ? (
                <div className="fu-file-info">
                  <span className="fu-file-name">{file.name}</span>
                  <span className="fu-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                  <span className="fu-file-change">Click to change</span>
                </div>
              ) : (
                <div className="fu-drop-text">
                  <span className="fu-drop-primary">Drop your file here</span>
                  <span className="fu-drop-or">or click to browse</span>
                  <span className="fu-drop-formats">CSV &nbsp;·&nbsp; Excel (.xlsx, .xls) &nbsp;·&nbsp; JSON</span>
                </div>
              )}
            </div>

            {/* Optional prompt */}
            <div className="fu-field">
              <label htmlFor="fu-prompt" className="fu-label">
                Focus your dashboard
                <span className="fu-optional">optional</span>
              </label>
              <textarea
                id="fu-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Show sales trends and top regions" — leave blank for auto-detection'
                disabled={loading}
                rows={3}
                className="fu-textarea"
              />
            </div>

            {error && (
              <div className="fu-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={!file || loading} className="fu-submit">
              {loading ? (
                <span className="fu-loading-row">
                  <svg className="fu-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                  </svg>
                  {step || 'Processing...'}
                </span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
                  </svg>
                  Analyse &amp; Generate Dashboard
                </>
              )}
            </button>

            {/* Progress steps (visible during loading) */}
            {loading && (
              <div className="fu-steps">
                {STEPS.map((s, i) => (
                  <div key={s} className={`fu-step ${i < stepIdx ? 'done' : i === stepIdx ? 'active' : ''}`}>
                    <div className="fu-step-dot">
                      {i < stepIdx ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      ) : (
                        i === stepIdx ? <div className="fu-step-pulse" /> : null
                      )}
                    </div>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Right — features */}
        <div className="fu-features" aria-label="Features">
          <p className="fu-features-label">What you get</p>
          <div className="fu-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="fu-feature-card">
                <div className="fu-feature-icon" aria-hidden="true">{f.icon}</div>
                <div>
                  <p className="fu-feature-title">{f.title}</p>
                  <p className="fu-feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
