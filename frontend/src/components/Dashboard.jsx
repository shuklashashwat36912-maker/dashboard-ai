import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line, Pie, Scatter, Doughnut } from 'react-chartjs-2';
import DataTable from './DataTable';
import '../styles/Dashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend,
);
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.08)';

// ─── colour palette ──────────────────────────────────────────────────────────
const PALETTE = [
  '#6366f1', '#22c55e', '#f97316', '#ef4444',
  '#06b6d4', '#14b8a6', '#ec4899', '#84cc16',
  '#a855f7', '#fb923c', '#f472b6', '#818cf8',
];
const col = (i) => PALETTE[i % PALETTE.length];

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatValue = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'number') return String(v);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(2);
};

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1a24',
  titleColor: '#f8fafc',
  bodyColor: '#94a3b8',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
};

// ─── chart builder ────────────────────────────────────────────────────────────
/**
 * Build Chart.js dataset from a chart config object.
 * Supports two data sources:
 *   1. chart.data  — pre-aggregated array from Python EDA (preferred)
 *   2. filteredData rows — fall back when chart.data is absent
 */
const buildChartDataset = (chart, filteredRows) => {
  const type = chart.type;
  if (type === 'table') return null;

  // ── source: pre-aggregated from EDA ──────────────────────────────────────
  if (chart.data && chart.data.length > 0) {
    const isScatter = type === 'scatter';

    if (isScatter) {
      // scatter data: [{x, y}, ...]
      const pts = chart.data.map((d) => ({ x: d.x ?? d[chart.xAxis], y: d.y ?? d[chart.yAxis] }));
      return {
        labels: [],
        datasets: [{
          label: `${chart.xAxis} vs ${chart.yAxis}`,
          data: pts,
          backgroundColor: col(0) + '99',
          borderColor: col(0),
          pointRadius: 5,
        }],
      };
    }

    const labels = chart.data.map((d) => String(d.label ?? d[chart.xAxis] ?? ''));
    const values = chart.data.map((d) => d.sum ?? d.value ?? d[chart.yAxis] ?? 0);

    return {
      labels,
      datasets: [{
        label: chart.yAxis || 'Value',
        data: values,
        backgroundColor: (type === 'pie' || type === 'doughnut')
          ? labels.map((_, i) => col(i))
          : col(0),
        borderColor: (type === 'pie' || type === 'doughnut')
          ? labels.map((_, i) => col(i))
          : col(0),
        borderWidth: 2,
        tension: type === 'line' ? 0.4 : undefined,
        fill: type === 'area' || type === 'line',
        pointRadius: type === 'line' ? 4 : undefined,
      }],
    };
  }

  // ── fallback: aggregate from raw rows ─────────────────────────────────────
  if (!filteredRows || filteredRows.length === 0) return null;
  const yAxes = Array.isArray(chart.yAxis) ? chart.yAxis : [chart.yAxis].filter(Boolean);
  if (!chart.xAxis || yAxes.length === 0) return null;

  const grouped = {};
  filteredRows.forEach((row) => {
    const label = String(row[chart.xAxis] ?? 'Unknown');
    if (!grouped[label]) {
      grouped[label] = {};
      yAxes.forEach((y) => { grouped[label][y] = []; });
    }
    yAxes.forEach((y) => {
      const num = Number(row[y]);
      if (!isNaN(num)) grouped[label][y].push(num);
    });
  });

  const labels = Object.keys(grouped).sort();
  const datasets = yAxes.map((y, idx) => {
    const values = labels.map((lbl) => {
      const arr = grouped[lbl][y] || [];
      if (!arr.length) return 0;
      return (type === 'pie' || type === 'doughnut')
        ? arr.reduce((a, b) => a + b, 0)
        : arr.reduce((a, b) => a + b, 0) / arr.length;
    });
    return {
      label: y,
      data: values,
      backgroundColor: (type === 'pie' || type === 'doughnut') ? labels.map((_, i) => col(i)) : col(idx),
      borderColor: (type === 'pie' || type === 'doughnut') ? labels.map((_, i) => col(i)) : col(idx),
      borderWidth: 2,
      tension: type === 'line' ? 0.4 : undefined,
      fill: type === 'area' || type === 'line',
      pointRadius: type === 'line' ? 4 : undefined,
    };
  });

  return { labels, datasets };
};

// ─── chart options factory ────────────────────────────────────────────────────
const makeOptions = (type) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: { usePointStyle: true, padding: 15, font: { size: 12 }, color: '#94a3b8' },
    },
    title: { display: false },
    tooltip: { ...TOOLTIP_STYLE },
  },
  scales: (type === 'pie' || type === 'doughnut' || type === 'scatter') ? {} : {
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
    x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45 } },
  },
});

// ─── sub-components ───────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, description }) => (
  <div className="kpi-card" style={{ borderLeftColor: color }}>
    <div className="kpi-header">
      <div>
        <h3>{label}</h3>
        <p className="kpi-description">{description || ''}</p>
      </div>
      <span className="kpi-icon" style={{ backgroundColor: color }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
        </svg>
      </span>
    </div>
    <div className="kpi-content">
      <div className="kpi-value">{value}</div>
    </div>
  </div>
);

const ChartCard = ({ chart, filteredRows, columns }) => {
  const chartData = buildChartDataset(chart, filteredRows);
  const opts = makeOptions(chart.type);

  const renderInner = () => {
    if (chart.type === 'table') {
      return <DataTable data={filteredRows} columns={columns} />;
    }
    if (!chartData) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
          No data available for this chart
        </div>
      );
    }
    const C = { bar: Bar, line: Line, area: Line, pie: Pie, doughnut: Doughnut, scatter: Scatter }[chart.type] || Bar;
    return <C data={chartData} options={opts} />;
  };

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3>{chart.title}</h3>
          {chart.description && <p className="chart-description">{chart.description}</p>}
        </div>
        <span className="chart-badge">{chart.type.toUpperCase()}</span>
      </div>
      <div className="chart-wrapper" style={{ height: chart.type === 'table' ? 'auto' : '320px' }}>
        {renderInner()}
      </div>
    </div>
  );
};

// ─── EDA Summary panel ────────────────────────────────────────────────────────
const EdaSummary = ({ edaResult }) => {
  if (!edaResult) return null;
  const { data_quality, column_stats, correlations, top_records, bottom_records } = edaResult;

  return (
    <div className="section eda-summary-section">
      <h2 className="section-title">EDA Summary</h2>

      {/* Data quality */}
      <div className="eda-quality-grid">
        {[
          { label: 'Total Rows', value: data_quality.total_rows?.toLocaleString() },
          { label: 'Columns', value: data_quality.total_columns },
          { label: 'Missing Values', value: data_quality.missing_values },
          { label: 'Duplicates Removed', value: data_quality.duplicates_removed },
          { label: 'Completeness', value: `${data_quality.completeness_pct}%` },
          { label: 'Numeric Cols', value: data_quality.numeric_columns },
          { label: 'Categorical Cols', value: data_quality.categorical_columns },
        ].map((item) => (
          <div key={item.label} className="eda-quality-item">
            <span className="eda-quality-label">{item.label}</span>
            <span className="eda-quality-value">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Column statistics */}
      {column_stats && Object.keys(column_stats).length > 0 && (
        <div className="eda-col-stats">
          <h3>Column Statistics</h3>
          <div className="eda-stats-table-wrapper">
            <table className="eda-stats-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Mean</th>
                  <th>Median</th>
                  <th>Std Dev</th>
                  <th>Outliers</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(column_stats).map(([col, s]) => (
                  <tr key={col}>
                    <td>{col}</td>
                    <td>{formatValue(s.min)}</td>
                    <td>{formatValue(s.max)}</td>
                    <td>{formatValue(s.mean)}</td>
                    <td>{formatValue(s.median)}</td>
                    <td>{formatValue(s.std)}</td>
                    <td>
                      <span className={`badge ${s.outlier_count > 0 ? 'warning' : 'success'}`}>
                        {s.outlier_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top correlations */}
      {correlations && correlations.length > 0 && (
        <div className="eda-correlations">
          <h3>Top Correlations</h3>
          <div className="corr-grid">
            {correlations.slice(0, 6).map((c, i) => (
              <div key={i} className="corr-card">
                <div className="corr-cols">{c.col1} &times; {c.col2}</div>
                <div
                  className="corr-value"
                  style={{ color: c.r > 0.5 ? '#22c55e' : c.r < -0.5 ? '#ef4444' : '#94a3b8' }}
                >
                  r = {c.r}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top / bottom records */}
      {top_records && top_records.length > 0 && (
        <div className="eda-top-bottom">
          <div className="tb-block">
            <h3>Top 5 Records</h3>
            <div className="tb-table-wrapper">
              <table className="tb-table">
                <thead>
                  <tr>{Object.keys(top_records[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {top_records.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => <td key={j}>{formatValue(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {bottom_records && bottom_records.length > 0 && (
            <div className="tb-block">
              <h3>Bottom 5 Records</h3>
              <div className="tb-table-wrapper">
                <table className="tb-table">
                  <thead>
                    <tr>{Object.keys(bottom_records[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {bottom_records.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => <td key={j}>{formatValue(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── main component ───────────────────────────────────────────────────────────
export default function Dashboard({ dashboardData, onBackClick }) {
  const { dashboardConfig, data, columns, fileInfo, insights, edaResult } = dashboardData;

  const [metrics, setMetrics]               = useState({});
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filteredData, setFilteredData]     = useState(data || []);
  const [activeTab, setActiveTab]           = useState('dashboard'); // 'dashboard' | 'eda'

  // ── filtering ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let filtered = data || [];
    Object.entries(appliedFilters).forEach(([column, value]) => {
      if (value && value !== 'all') {
        filtered = filtered.filter((row) => String(row[column]) === String(value));
      }
    });
    setFilteredData(filtered);
  }, [appliedFilters, data]);

  // ── metrics calculation ────────────────────────────────────────────────────
  const calculateMetrics = useCallback(async (rows) => {
    const metricsToCalc = dashboardConfig?.metrics || [];
    if (!metricsToCalc.length || !rows.length) return;
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/calculate-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: rows, metrics: metricsToCalc }),
      });
      const result = await response.json();
      if (result.success) setMetrics(result.metrics);
    } catch (err) {
      // Compute locally as fallback
      const local = {};
      metricsToCalc.forEach((m) => {
        const vals = rows.map((r) => Number(r[m.column])).filter((v) => !isNaN(v));
        let value = 0;
        if (m.aggregation === 'sum') value = vals.reduce((a, b) => a + b, 0);
        else if (m.aggregation === 'avg') value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        else if (m.aggregation === 'count') value = rows.length;
        else if (m.aggregation === 'max') value = vals.length ? Math.max(...vals) : 0;
        else if (m.aggregation === 'min') value = vals.length ? Math.min(...vals) : 0;
        local[m.id] = { value, label: m.label, column: m.column };
      });
      setMetrics(local);
    }
  }, [dashboardConfig]);

  useEffect(() => {
    calculateMetrics(filteredData);
  }, [filteredData, calculateMetrics]);

  // ── filter helpers ─────────────────────────────────────────────────────────
  const getFilterOptions = (col) =>
    [...new Set((data || []).map((row) => row[col]))].filter(Boolean).slice(0, 30);

  const addFilter    = (col, val) => setAppliedFilters((p) => ({ ...p, [col]: val }));
  const removeFilter = (col)      => setAppliedFilters((p) => { const n = { ...p }; delete n[col]; return n; });
  const clearFilters = ()         => setAppliedFilters({});

  // ── chart groups ───────────────────────────────────────────────────────────
  const charts    = dashboardConfig?.charts || [];
  const nonTable  = charts.filter((c) => c.type !== 'table');
  const tableChart = charts.find((c) => c.type === 'table');

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-wrapper">
      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay visible"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`} aria-label="Filters">
        <div className="sidebar-header">
          <h2>Filters</h2>
          <button className="toggle-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="sidebar-content">
          {/* Data overview */}
          <div className="filter-section">
            <h3>Data Overview</h3>
            <div className="data-info">
              <div className="info-item">
                <span className="info-label">Shown</span>
                <span className="info-value">{filteredData.length.toLocaleString()}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Total</span>
                <span className="info-value">{(data || []).length.toLocaleString()}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Columns</span>
                <span className="info-value">{columns?.length}</span>
              </div>
            </div>
          </div>

          {/* Active filters */}
          {Object.keys(appliedFilters).length > 0 && (
            <div className="filter-section">
              <h3>Active Filters</h3>
              <div className="active-filters">
                {Object.entries(appliedFilters).map(([col, val]) => (
                  <div key={col} className="filter-tag">
                    <span className="filter-label">{col}</span>
                    <span className="filter-value">{String(val)}</span>
                    <button className="filter-remove" onClick={() => removeFilter(col)} aria-label={`Remove ${col} filter`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button className="clear-filters-btn" onClick={clearFilters}>Clear All</button>
            </div>
          )}

          {/* Column filters */}
          <div className="filter-section">
            <h3>Filter by Column</h3>
            <div className="columns-list">
              {(columns || []).slice(0, 12).map((col) => {
                const opts = getFilterOptions(col);
                if (opts.length < 2 || opts.length > 30) return null;
                return (
                  <details key={col} className="filter-dropdown">
                    <summary className="column-item">
                      <span className="column-icon">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </span>
                      <span className="column-name">{col}</span>
                    </summary>
                    <div className="filter-options">
                      {opts.map((val) => (
                        <label key={String(val)} className="filter-option">
                          <input
                            type="checkbox"
                            checked={String(appliedFilters[col]) === String(val)}
                            onChange={() => addFilter(col, val)}
                          />
                          {String(val).slice(0, 24)}
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <button className="back-btn" onClick={onBackClick}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Upload New File
            </button>
            <div className="header-title">
              <h1>{dashboardConfig?.dashboardTitle || fileInfo?.name || 'Dashboard'}</h1>
              <p className="header-subtitle">
                {filteredData.length.toLocaleString()} of {(data || []).length.toLocaleString()} records
                &nbsp;·&nbsp; {columns?.length} columns
                {fileInfo && ` · ${fileInfo.name}`}
              </p>
            </div>
          </div>
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
            Filters
          </button>
        </div>

        {/* Tabs */}
        <div className="dashboard-tabs">
          <button
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          {edaResult && (
            <button
              className={`tab-btn ${activeTab === 'eda' ? 'active' : ''}`}
              onClick={() => setActiveTab('eda')}
            >
              EDA Report
            </button>
          )}
        </div>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <>
            {/* KPI cards */}
            {dashboardConfig?.metrics?.length > 0 && (
              <div className="section kpi-section">
                <h2 className="section-title">Key Metrics</h2>
                <div className="kpi-grid">
                  {dashboardConfig.metrics.map((metric, idx) => (
                    <StatCard
                      key={metric.id}
                      label={metric.label}
                      value={formatValue(metrics[metric.id]?.value)}
                      color={col(idx)}
                      description={metric.description}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* AI / rule-based insights */}
            {insights && (
              <div className="section insights-section">
                <h2 className="section-title">Key Insights</h2>
                <div className="insights-card">
                  <div className="insights-content">
                    {Array.isArray(insights)
                      ? insights.map((line, i) => <p key={i}>{line}</p>)
                      : String(insights).split('\n').map((line, i) => <p key={i}>{line}</p>)
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Charts grid */}
            {nonTable.length > 0 && (
              <div className="section main-visuals-section">
                <h2 className="section-title">Visualisations</h2>
                <div className="charts-container charts-auto-grid">
                  {nonTable.map((chart) => (
                    <ChartCard
                      key={chart.id}
                      chart={chart}
                      filteredRows={filteredData}
                      columns={columns}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Data table */}
            {tableChart && (
              <div className="section table-section">
                <h2 className="section-title">Detailed Data View</h2>
                <div className="table-card">
                  <div className="table-wrapper">
                    <DataTable data={filteredData} columns={columns} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── EDA TAB ── */}
        {activeTab === 'eda' && <EdaSummary edaResult={edaResult} />}
      </div>
    </div>
  );
}
