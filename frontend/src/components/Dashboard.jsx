import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Pie, Scatter, Doughnut } from 'react-chartjs-2';
import DataTable from './DataTable';
import '../styles/Dashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
);
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.06)';

// ─── palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  '#6366f1', '#22c55e', '#f97316', '#ef4444',
  '#06b6d4', '#14b8a6', '#ec4899', '#84cc16',
  '#a855f7', '#fb923c', '#f472b6', '#818cf8',
];
const col = (i) => PALETTE[i % PALETTE.length];

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'number') return String(v);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(2);
};

const pctChange = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// ─── tooltip style ────────────────────────────────────────────────────────────
const TOOLTIP = {
  backgroundColor: '#16161e',
  titleColor: '#f8fafc',
  bodyColor: '#94a3b8',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
};

// ─── build chart dataset ──────────────────────────────────────────────────────
const buildDataset = (chart, rows) => {
  const type = chart.type;
  if (type === 'table') return null;

  if (chart.data && chart.data.length > 0) {
    if (type === 'scatter') {
      return {
        labels: [],
        datasets: [{
          label: `${chart.xAxis} vs ${chart.yAxis}`,
          data: chart.data.map((d) => ({ x: d.x ?? d[chart.xAxis], y: d.y ?? d[chart.yAxis] })),
          backgroundColor: col(0) + 'aa',
          borderColor: col(0),
          pointRadius: 5,
        }],
      };
    }
    const labels = chart.data.map((d) => String(d.label ?? d[chart.xAxis] ?? ''));
    const values = chart.data.map((d) => d.sum ?? d.value ?? d[chart.yAxis] ?? 0);
    const isPie = type === 'pie' || type === 'doughnut';
    return {
      labels,
      datasets: [{
        label: chart.yAxis || 'Value',
        data: values,
        backgroundColor: isPie ? labels.map((_, i) => col(i)) : col(0) + 'cc',
        borderColor: isPie ? labels.map((_, i) => col(i)) : col(0),
        borderWidth: 2,
        tension: type === 'line' ? 0.4 : undefined,
        fill: type === 'line' ? { target: 'origin', above: col(0) + '22' } : false,
        pointRadius: type === 'line' ? 4 : undefined,
        pointHoverRadius: type === 'line' ? 6 : undefined,
        borderRadius: type === 'bar' ? 6 : 0,
      }],
    };
  }

  if (!rows || rows.length === 0) return null;
  const yAxes = Array.isArray(chart.yAxis) ? chart.yAxis : [chart.yAxis].filter(Boolean);
  if (!chart.xAxis || yAxes.length === 0) return null;

  const grouped = {};
  rows.forEach((row) => {
    const lbl = String(row[chart.xAxis] ?? 'Unknown');
    if (!grouped[lbl]) { grouped[lbl] = {}; yAxes.forEach((y) => { grouped[lbl][y] = []; }); }
    yAxes.forEach((y) => { const n = Number(row[y]); if (!isNaN(n)) grouped[lbl][y].push(n); });
  });

  const labels = Object.keys(grouped).sort();
  const isPie = type === 'pie' || type === 'doughnut';
  const datasets = yAxes.map((y, i) => {
    const vals = labels.map((l) => {
      const a = grouped[l][y] || [];
      return a.length ? a.reduce((a, b) => a + b, 0) / (isPie ? 1 : a.length) : 0;
    });
    return {
      label: y,
      data: vals,
      backgroundColor: isPie ? labels.map((_, j) => col(j)) : col(i) + 'cc',
      borderColor: isPie ? labels.map((_, j) => col(j)) : col(i),
      borderWidth: 2,
      tension: type === 'line' ? 0.4 : undefined,
      fill: type === 'line' ? { target: 'origin', above: col(i) + '22' } : false,
      pointRadius: type === 'line' ? 4 : undefined,
      borderRadius: type === 'bar' ? 6 : 0,
    };
  });
  return { labels, datasets };
};

// ─── chart options ────────────────────────────────────────────────────────────
const makeOpts = (type, fullscreen = false) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500, easing: 'easeOutQuart' },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        usePointStyle: true,
        padding: 16,
        font: { size: fullscreen ? 13 : 11 },
        color: '#94a3b8',
      },
    },
    tooltip: { ...TOOLTIP },
  },
  scales: (type === 'pie' || type === 'doughnut' || type === 'scatter') ? {} : {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#64748b', font: { size: 11 } },
    },
    x: {
      grid: { display: false },
      ticks: { color: '#64748b', maxRotation: 45, font: { size: 11 } },
    },
  },
});

// ─── Sparkline for KPI cards ──────────────────────────────────────────────────
const Sparkline = ({ values, color }) => {
  if (!values || values.length < 2) return null;
  const w = 80, h = 32;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const Skeleton = ({ className = '', style = {} }) => (
  <div className={`skeleton ${className}`} style={style} aria-hidden="true" />
);

// ─── KPI card ────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, color, description, sparkData, loading }) => {
  const change = sparkData && sparkData.length >= 2
    ? pctChange(sparkData[sparkData.length - 1], sparkData[sparkData.length - 2])
    : null;

  if (loading) {
    return (
      <div className="kpi-card">
        <Skeleton style={{ height: 14, width: '60%', marginBottom: 12 }} />
        <Skeleton style={{ height: 32, width: '80%', marginBottom: 8 }} />
        <Skeleton style={{ height: 10, width: '40%' }} />
      </div>
    );
  }

  return (
    <div className="kpi-card" style={{ '--kpi-color': color }}>
      <div className="kpi-top">
        <div className="kpi-icon" style={{ background: color + '22', color }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
        </div>
        <Sparkline values={sparkData} color={color} />
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-meta">
        <span className="kpi-label">{label}</span>
        {change !== null && (
          <span className={`kpi-change ${change >= 0 ? 'up' : 'down'}`}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {description && <p className="kpi-desc">{description}</p>}
    </div>
  );
};

// ─── Chart card ──────────────────────────────────────────────────────────────
const ChartCard = ({ chart, rows, columns, onFullscreen, loading }) => {
  const [chartType, setChartType] = useState(chart.type);
  const dataset = buildDataset({ ...chart, type: chartType }, rows);
  const opts = makeOpts(chartType);
  const swappable = ['bar', 'line', 'doughnut'];

  if (loading) {
    return (
      <div className="chart-card">
        <div className="chart-header">
          <Skeleton style={{ height: 16, width: '50%' }} />
          <Skeleton style={{ height: 24, width: 60, borderRadius: 20 }} />
        </div>
        <Skeleton style={{ height: 280, marginTop: 16 }} />
      </div>
    );
  }

  const renderChart = () => {
    if (chartType === 'table') return <DataTable data={rows} columns={columns} />;
    if (!dataset) return (
      <div className="chart-empty">No data available</div>
    );
    const Comp = { bar: Bar, line: Line, area: Line, pie: Pie, doughnut: Doughnut, scatter: Scatter }[chartType] || Bar;
    return <Comp data={dataset} options={opts} />;
  };

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title-group">
          <h3>{chart.title}</h3>
          {chart.description && <p className="chart-desc">{chart.description}</p>}
        </div>
        <div className="chart-actions">
          {swappable.includes(chart.type) && (
            <div className="chart-type-toggle">
              {swappable.map((t) => (
                <button
                  key={t}
                  className={`type-btn ${chartType === t ? 'active' : ''}`}
                  onClick={() => setChartType(t)}
                  title={`Switch to ${t}`}
                  aria-pressed={chartType === t}
                >
                  {t === 'bar' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="10" width="6" height="12"/><rect x="9" y="6" width="6" height="16"/><rect x="16" y="2" width="6" height="20"/>
                    </svg>
                  )}
                  {t === 'line' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <polyline points="4 17 9 12 13 15 20 7"/>
                    </svg>
                  )}
                  {t === 'doughnut' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <span className="chart-badge">{chartType.toUpperCase()}</span>
          <button
            className="fullscreen-btn"
            onClick={() => onFullscreen(chart, chartType)}
            title="Expand chart"
            aria-label="Expand chart to fullscreen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="chart-body" style={{ height: chartType === 'table' ? 'auto' : 280 }}>
        {renderChart()}
      </div>
    </div>
  );
};

// ─── Fullscreen modal ─────────────────────────────────────────────────────────
const FullscreenModal = ({ chart, chartType, rows, onClose }) => {
  const dataset = buildDataset({ ...chart, type: chartType }, rows);
  const opts = makeOpts(chartType, true);
  useEffect(() => {
    document.body.classList.add('no-scroll');
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('no-scroll'); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const Comp = { bar: Bar, line: Line, area: Line, pie: Pie, doughnut: Doughnut, scatter: Scatter }[chartType] || Bar;
  return (
    <div className="fs-overlay" role="dialog" aria-modal="true" aria-label={chart.title} onClick={onClose}>
      <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fs-header">
          <div>
            <h2 className="fs-title">{chart.title}</h2>
            {chart.description && <p className="fs-desc">{chart.description}</p>}
          </div>
          <button className="fs-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="fs-body">
          {dataset ? <Comp data={dataset} options={opts} /> : <div className="chart-empty">No data</div>}
        </div>
      </div>
    </div>
  );
};

// ─── EDA Summary ─────────────────────────────────────────────────────────────
const EdaPanel = ({ edaResult }) => {
  if (!edaResult) return (
    <div className="eda-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
      <p>No EDA data available. Upload a file to run pandas EDA.</p>
    </div>
  );
  const { data_quality, column_stats, correlations, top_records, bottom_records } = edaResult;

  return (
    <div className="eda-panel">
      {/* Quality grid */}
      <div className="eda-section">
        <h3 className="eda-section-title">Data Quality</h3>
        <div className="eda-quality-grid">
          {[
            { label: 'Total Rows', value: data_quality?.total_rows?.toLocaleString() },
            { label: 'Columns', value: data_quality?.total_columns },
            { label: 'Missing Values', value: data_quality?.missing_values },
            { label: 'Duplicates Removed', value: data_quality?.duplicates_removed },
            { label: 'Completeness', value: `${data_quality?.completeness_pct ?? '—'}%` },
            { label: 'Numeric Cols', value: data_quality?.numeric_columns },
            { label: 'Categorical Cols', value: data_quality?.categorical_columns },
          ].map((item) => (
            <div key={item.label} className="eda-quality-item">
              <span className="eda-quality-label">{item.label}</span>
              <span className="eda-quality-value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Column stats */}
      {column_stats && Object.keys(column_stats).length > 0 && (
        <div className="eda-section">
          <h3 className="eda-section-title">Column Statistics</h3>
          <div className="eda-table-wrap">
            <table className="eda-table">
              <thead>
                <tr>
                  {['Column', 'Min', 'Max', 'Mean', 'Median', 'Std Dev', 'Outliers'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(column_stats).map(([c, s]) => (
                  <tr key={c}>
                    <td className="eda-col-name">{c}</td>
                    <td>{fmt(s.min)}</td>
                    <td>{fmt(s.max)}</td>
                    <td>{fmt(s.mean)}</td>
                    <td>{fmt(s.median)}</td>
                    <td>{fmt(s.std)}</td>
                    <td>
                      <span className={`badge ${s.outlier_count > 0 ? 'badge-warn' : 'badge-ok'}`}>
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

      {/* Correlations */}
      {correlations && correlations.length > 0 && (
        <div className="eda-section">
          <h3 className="eda-section-title">Top Correlations</h3>
          <div className="corr-grid">
            {correlations.slice(0, 8).map((c, i) => (
              <div key={i} className="corr-card">
                <div className="corr-pair">{c.col1} &times; {c.col2}</div>
                <div
                  className="corr-r"
                  style={{ color: c.r > 0.5 ? '#22c55e' : c.r < -0.5 ? '#ef4444' : '#94a3b8' }}
                >
                  r = {c.r}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top / bottom */}
      {top_records && top_records.length > 0 && (
        <div className="eda-section">
          <div className="eda-top-bottom">
            {[{ title: 'Top 5 Records', rows: top_records }, { title: 'Bottom 5 Records', rows: bottom_records }]
              .filter((b) => b.rows && b.rows.length > 0)
              .map((block) => (
                <div key={block.title} className="tb-block">
                  <h3 className="eda-section-title">{block.title}</h3>
                  <div className="eda-table-wrap">
                    <table className="eda-table">
                      <thead>
                        <tr>{Object.keys(block.rows[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, idx) => (
                          <tr key={idx}>
                            {Object.values(row).map((v, j) => <td key={j}>{fmt(v)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Download CSV ─────────────────────────────────────────────────────────────
const downloadCSV = (rows, columns, name = 'data') => {
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => {
    const v = String(r[c] ?? '').replace(/"/g, '""');
    return v.includes(',') ? `"${v}"` : v;
  }).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ dashboardData, onBackClick }) {
  const { dashboardConfig, data, columns, fileInfo, insights, edaResult } = dashboardData;

  const [metrics, setMetrics]               = useState({});
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filteredData, setFilteredData]     = useState(data || []);
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [search, setSearch]                 = useState('');
  const [fullscreenChart, setFullscreenChart] = useState(null); // { chart, chartType }
  const [mobileNav, setMobileNav]           = useState('overview'); // 'overview' | 'charts' | 'data' | 'eda'
  const mainRef = useRef(null);

  // ── filter + search ──────────────────────────────────────────────────────
  useEffect(() => {
    let f = data || [];
    Object.entries(appliedFilters).forEach(([col, val]) => {
      if (val && val !== 'all') f = f.filter((r) => String(r[col]) === String(val));
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      f = f.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
    }
    setFilteredData(f);
  }, [appliedFilters, search, data]);

  // ── metrics ──────────────────────────────────────────────────────────────
  const calcMetrics = useCallback(async (rows) => {
    const mets = dashboardConfig?.metrics || [];
    if (!mets.length || !rows.length) { setMetricsLoading(false); return; }
    setMetricsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/calculate-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: rows, metrics: mets }),
      });
      const result = await res.json();
      if (result.success) setMetrics(result.metrics);
    } catch {
      const local = {};
      mets.forEach((m) => {
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
    } finally {
      setMetricsLoading(false);
    }
  }, [dashboardConfig]);

  useEffect(() => { calcMetrics(filteredData); }, [filteredData, calcMetrics]);

  // ── sparkline data per metric ─────────────────────────────────────────────
  const getSparkData = (metricId) => {
    const m = (dashboardConfig?.metrics || []).find((x) => x.id === metricId);
    if (!m) return [];
    const vals = filteredData.map((r) => Number(r[m.column])).filter((v) => !isNaN(v));
    // sample up to 12 evenly spaced values
    if (vals.length <= 12) return vals;
    const step = Math.floor(vals.length / 12);
    return vals.filter((_, i) => i % step === 0).slice(0, 12);
  };

  // ── filter helpers ────────────────────────────────────────────────────────
  const filterOpts = (c) => [...new Set((data || []).map((r) => r[c]))].filter(Boolean).slice(0, 30);
  const addFilter    = (c, v) => setAppliedFilters((p) => ({ ...p, [c]: v }));
  const removeFilter = (c)    => setAppliedFilters((p) => { const n = { ...p }; delete n[c]; return n; });
  const clearFilters = ()     => setAppliedFilters({});

  const charts    = dashboardConfig?.charts || [];
  const nonTable  = charts.filter((c) => c.type !== 'table');
  const tableChart = charts.find((c) => c.type === 'table');
  const activeFiltersCount = Object.keys(appliedFilters).length;

  // ── mobile nav scroll ────────────────────────────────────────────────────
  const scrollToSection = (id) => {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileNav(id);
  };

  return (
    <div className="db-wrapper">
      {/* Overlay */}
      {sidebarOpen && (
        <div className="db-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`db-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Filters and navigation">
        <div className="sidebar-header">
          <span className="sidebar-title">Filters</span>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="sidebar-body">
          {/* Stats */}
          <div className="sb-section">
            <p className="sb-label">Data Overview</p>
            <div className="sb-stats">
              {[
                { k: 'Shown', v: filteredData.length.toLocaleString() },
                { k: 'Total', v: (data || []).length.toLocaleString() },
                { k: 'Columns', v: columns?.length },
              ].map((s) => (
                <div key={s.k} className="sb-stat-row">
                  <span>{s.k}</span>
                  <strong>{s.v}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Active filters */}
          {activeFiltersCount > 0 && (
            <div className="sb-section">
              <div className="sb-label-row">
                <p className="sb-label">Active Filters</p>
                <button className="link-btn" onClick={clearFilters}>Clear all</button>
              </div>
              <div className="active-filters">
                {Object.entries(appliedFilters).map(([col, val]) => (
                  <div key={col} className="filter-chip">
                    <span className="chip-col">{col}:</span>
                    <span className="chip-val">{String(val).slice(0, 16)}</span>
                    <button
                      className="chip-remove"
                      onClick={() => removeFilter(col)}
                      aria-label={`Remove ${col} filter`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column filters */}
          <div className="sb-section">
            <p className="sb-label">Filter by Column</p>
            <div className="filter-list">
              {(columns || []).slice(0, 14).map((c) => {
                const opts = filterOpts(c);
                if (opts.length < 2 || opts.length > 30) return null;
                return (
                  <details key={c} className="filter-detail">
                    <summary className="filter-summary">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chevron" aria-hidden="true">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                      {c}
                    </summary>
                    <div className="filter-opts">
                      {opts.map((v) => (
                        <label key={String(v)} className="filter-opt">
                          <input
                            type="checkbox"
                            checked={String(appliedFilters[c]) === String(v)}
                            onChange={() => addFilter(c, v)}
                          />
                          {String(v).slice(0, 26)}
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

      {/* ── MAIN ── */}
      <div className="db-main" ref={mainRef}>

        {/* Header */}
        <header className="db-header">
          <div className="db-header-left">
            <button className="back-btn" onClick={onBackClick} aria-label="Upload new file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span className="back-label">New File</span>
            </button>
            <div className="db-title-group">
              <h1 className="db-title">{dashboardConfig?.dashboardTitle || fileInfo?.name || 'Dashboard'}</h1>
              <p className="db-subtitle">
                {filteredData.length.toLocaleString()} / {(data || []).length.toLocaleString()} rows
                &nbsp;&middot;&nbsp; {columns?.length} cols
                {fileInfo?.name && <>&nbsp;&middot;&nbsp; {fileInfo.name}</>}
              </p>
            </div>
          </div>

          <div className="db-header-right">
            {/* Search */}
            <div className="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="search"
                placeholder="Search data..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
                aria-label="Search data"
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Download */}
            <button
              className="icon-action-btn"
              onClick={() => downloadCSV(filteredData, columns || [], fileInfo?.name?.replace(/\.[^.]+$/, '') || 'data')}
              title="Download filtered data as CSV"
              aria-label="Download CSV"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span className="hide-xs">Export</span>
            </button>

            {/* Filter toggle */}
            <button
              className={`icon-action-btn ${activeFiltersCount > 0 ? 'active-filter-btn' : ''}`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={`Filters${activeFiltersCount > 0 ? ` (${activeFiltersCount} active)` : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
              </svg>
              <span className="hide-xs">Filters</span>
              {activeFiltersCount > 0 && <span className="filter-count">{activeFiltersCount}</span>}
            </button>
          </div>
        </header>

        {/* Tab bar */}
        <nav className="db-tabs" aria-label="Dashboard sections">
          {[
            { id: 'dashboard', label: 'Overview' },
            { id: 'eda', label: 'EDA Report' },
          ].map((t) => (
            <button
              key={t.id}
              className={`db-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              role="tab"
              aria-selected={activeTab === t.id}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'dashboard' && (
          <div className="db-content">
            {/* KPI strip */}
            {dashboardConfig?.metrics?.length > 0 && (
              <section id="section-overview" className="db-section">
                <h2 className="section-heading">Key Metrics</h2>
                <div className="kpi-grid">
                  {dashboardConfig.metrics.map((m, i) => (
                    <KpiCard
                      key={m.id}
                      label={m.label}
                      value={fmt(metrics[m.id]?.value)}
                      color={col(i)}
                      description={m.description}
                      sparkData={getSparkData(m.id)}
                      loading={metricsLoading}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Insights */}
            {insights && (
              <section className="db-section" id="section-insights">
                <h2 className="section-heading">AI Insights</h2>
                <div className="insights-card">
                  <div className="insights-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v4M12 16h.01"/>
                    </svg>
                  </div>
                  <div className="insights-body">
                    {(Array.isArray(insights) ? insights : String(insights).split('\n'))
                      .filter(Boolean)
                      .map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                </div>
              </section>
            )}

            {/* Charts */}
            {nonTable.length > 0 && (
              <section id="section-charts" className="db-section">
                <h2 className="section-heading">Visualisations</h2>
                <div className="charts-grid">
                  {nonTable.map((chart) => (
                    <ChartCard
                      key={chart.id}
                      chart={chart}
                      rows={filteredData}
                      columns={columns}
                      onFullscreen={(c, t) => setFullscreenChart({ chart: c, chartType: t })}
                      loading={false}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Data table */}
            {tableChart && (
              <section id="section-data" className="db-section">
                <div className="section-heading-row">
                  <h2 className="section-heading">Data Table</h2>
                  <button
                    className="link-btn"
                    onClick={() => downloadCSV(filteredData, columns || [], fileInfo?.name?.replace(/\.[^.]+$/, '') || 'data')}
                  >
                    Export CSV
                  </button>
                </div>
                <div className="table-card">
                  <DataTable data={filteredData} columns={columns} />
                </div>
              </section>
            )}

            {/* No charts fallback */}
            {nonTable.length === 0 && !tableChart && (
              <div className="db-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2" aria-hidden="true">
                  <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
                </svg>
                <p>No charts generated yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ── EDA TAB ── */}
        {activeTab === 'eda' && (
          <div className="db-content">
            <EdaPanel edaResult={edaResult} />
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          { id: 'overview', label: 'Overview', icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          )},
          { id: 'charts', label: 'Charts', icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          )},
          { id: 'data', label: 'Data', icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 2a10 6 0 0 1 0 12 10 6 0 0 1 0-12z"/>
              <path d="M2 8s0 10 10 10 10-10 10-10"/>
            </svg>
          )},
          { id: 'filter', label: 'Filter', icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
            </svg>
          )},
        ].map((item) => (
          <button
            key={item.id}
            className={`mob-nav-btn ${(item.id === 'filter' ? sidebarOpen : mobileNav === item.id) ? 'active' : ''}`}
            onClick={() => {
              if (item.id === 'filter') { setSidebarOpen(!sidebarOpen); return; }
              setMobileNav(item.id);
              if (item.id === 'overview' || item.id === 'charts' || item.id === 'data') {
                setActiveTab('dashboard');
                scrollToSection(item.id === 'overview' ? 'overview' : item.id === 'charts' ? 'charts' : 'data');
              }
            }}
            aria-label={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Fullscreen modal */}
      {fullscreenChart && (
        <FullscreenModal
          chart={fullscreenChart.chart}
          chartType={fullscreenChart.chartType}
          rows={filteredData}
          onClose={() => setFullscreenChart(null)}
        />
      )}
    </div>
  );
}
