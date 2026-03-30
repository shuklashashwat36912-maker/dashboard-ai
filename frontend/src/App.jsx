import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import ThemeSwitcher from './components/ThemeSwitcher';
import './App.css';

function AppContent() {
  const [dashboardData, setDashboardData] = useState(null);

  return (
    <div className="app-root">
      {/* ── Global header ── */}
      <header className="app-header" role="banner">
        <div className="app-header-inner">
          <div className="app-brand">
            <div className="app-brand-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
              </svg>
            </div>
            <span className="app-brand-text">DataViz AI</span>
          </div>

          {/* Breadcrumb */}
          <nav className="app-breadcrumb" aria-label="Breadcrumb">
            <span className="bc-item">Home</span>
            {dashboardData && (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="bc-sep" aria-hidden="true">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span className="bc-item bc-current">
                  {dashboardData.dashboardConfig?.dashboardTitle
                    || dashboardData.fileInfo?.name
                    || 'Dashboard'}
                </span>
              </>
            )}
          </nav>

          <ThemeSwitcher />
        </div>
      </header>

      {/* ── Main view ── */}
      <main className="app-main" id="main-content">
        {!dashboardData ? (
          <FileUpload onDashboardGenerated={setDashboardData} />
        ) : (
          <Dashboard dashboardData={dashboardData} onBackClick={() => setDashboardData(null)} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
