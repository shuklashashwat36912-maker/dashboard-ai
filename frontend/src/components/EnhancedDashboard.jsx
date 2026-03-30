/**
 * EnhancedDashboard — now a thin wrapper that renders the main Dashboard component.
 * All EDA logic lives in Dashboard.jsx (EDA tab). This file is kept for backwards
 * compatibility with any imports that still reference it.
 */
import Dashboard from './Dashboard';

const EnhancedDashboard = ({ uploadedData, onBackClick }) => {
  if (!uploadedData) return null;
  return <Dashboard dashboardData={uploadedData} onBackClick={onBackClick || (() => {})} />;
};

export default EnhancedDashboard;
