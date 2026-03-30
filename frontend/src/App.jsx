import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import ThemeSwitcher from './components/ThemeSwitcher';
import './App.css';

function AppContent() {
  const [dashboardData, setDashboardData] = useState(null);

  const handleDashboardGenerated = (data) => {
    setDashboardData(data);
  };

  const handleBackClick = () => {
    setDashboardData(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <svg className="brand-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18"/>
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
            </svg>
            <span className="brand-text">AI Dashboard</span>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="app-main">
        {!dashboardData ? (
          <FileUpload onDashboardGenerated={handleDashboardGenerated} />
        ) : (
          <Dashboard dashboardData={dashboardData} onBackClick={handleBackClick} />
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
