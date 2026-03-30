import { useState, useRef } from 'react';
import '../styles/FileUpload.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function FileUpload({ onDashboardGenerated }) {
  const [file, setFile]       = useState(null);
  const [prompt, setPrompt]   = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep]       = useState('');   // loading status message
  const [error, setError]     = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const VALID_EXTS = ['.csv', '.xlsx', '.xls', '.json'];

  const validateAndSet = (selected) => {
    if (!selected) return;
    const ext = selected.name.substring(selected.name.lastIndexOf('.')).toLowerCase();
    if (VALID_EXTS.includes(ext)) {
      setFile(selected);
      setError('');
    } else {
      setError('Please upload a CSV, Excel (.xlsx / .xls), or JSON file.');
      setFile(null);
    }
  };

  const handleFileChange = (e) => validateAndSet(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    validateAndSet(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }

    setLoading(true);
    setError('');

    try {
      setStep('Uploading file...');
      const formData = new FormData();
      formData.append('file', file);
      if (prompt) formData.append('prompt', prompt);

      setStep('Running EDA with pandas...');
      const response = await fetch(`${API_BASE}/api/dashboard/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errData.error || 'Upload failed');
      }

      setStep('Building your dashboard...');
      const result = await response.json();
      onDashboardGenerated(result);
      setFile(null);
      setPrompt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <div className="file-upload-container">
      <div className="upload-card">
        <h1>AI Dashboard Generator</h1>
        <p className="subtitle">
          Upload any CSV, Excel, or JSON file. The AI will run a full EDA with pandas
          and generate an accurate, dynamic dashboard from your data.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Drop zone */}
          <div className="form-group">
            <div
              className={`upload-area ${dragging ? 'dragging' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !loading && inputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Click or drag a file here to upload"
              onKeyDown={(e) => e.key === 'Enter' && !loading && inputRef.current?.click()}
            >
              <span className="upload-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </span>
              <p>
                {file ? (
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                ) : (
                  'Click to select a file or drag and drop here'
                )}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileChange}
                disabled={loading}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Optional prompt */}
          <div className="form-group">
            <label htmlFor="prompt">Focus your dashboard (optional)</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g. 'Show sales trends and top regions' — leave blank for auto-detection"
              disabled={loading}
              rows={3}
            />
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <button type="submit" disabled={!file || loading} className="submit-btn">
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                {step || 'Processing...'}
              </span>
            ) : (
              'Analyse & Generate Dashboard'
            )}
          </button>
        </form>

        <div className="supported-formats">
          <p>Supported formats: CSV, Excel (.xlsx, .xls), JSON</p>
          <div className="pipeline-steps">
            <div className="pipeline-step">
              <span className="pipeline-num">1</span>
              <span>Upload file</span>
            </div>
            <span className="pipeline-arrow" aria-hidden="true">&#8594;</span>
            <div className="pipeline-step">
              <span className="pipeline-num">2</span>
              <span>Pandas EDA</span>
            </div>
            <span className="pipeline-arrow" aria-hidden="true">&#8594;</span>
            <div className="pipeline-step">
              <span className="pipeline-num">3</span>
              <span>Dashboard</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
