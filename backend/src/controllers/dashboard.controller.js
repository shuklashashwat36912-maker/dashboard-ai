const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { parseCSV, parseExcel, parseJSON, analyzeData } = require('../services/parseData');
const { generateDashboardConfig, generateInsights } = require('../services/gemini');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Run the Python EDA script on the uploaded file.
 * Returns a Promise that resolves to the parsed JSON result.
 */
const runPythonEDA = (filePath) => {
  return new Promise((resolve, reject) => {
    // Try python3 first, then python
    const pythonCmds = ['python3', 'python'];
    const scriptPath = path.join(__dirname, 'eda_runner.py');

    const tryCmd = (cmds) => {
      if (cmds.length === 0) {
        return reject(new Error('Python not available on this server'));
      }
      const cmd = cmds[0];
      execFile(cmd, [scriptPath, filePath], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // binary not found, try next
            return tryCmd(cmds.slice(1));
          }
          return reject(new Error(`Python EDA failed: ${stderr || err.message}`));
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseErr) {
          reject(new Error(`Could not parse EDA output: ${stdout.slice(0, 300)}`));
        }
      });
    };

    tryCmd(pythonCmds);
  });
};

// ─── controllers ────────────────────────────────────────────────────────────

/**
 * Upload file, run Python EDA, and optionally enhance with Gemini AI.
 */
const uploadAndGenerateDashboard = async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    // Validate extension
    if (!['.csv', '.xlsx', '.xls', '.json'].includes(fileExt)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel, or JSON' });
    }

    // ── Step 1: Parse file for row count / basic info ──────────────────
    let parseResult;
    if (fileExt === '.csv') {
      parseResult = parseCSV(filePath);
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      parseResult = parseExcel(filePath);
    } else {
      parseResult = parseJSON(filePath);
    }
    const { data, columns, rowCount } = parseResult;

    // ── Step 2: Run pandas EDA ─────────────────────────────────────────
    let edaResult = null;
    let edaError = null;
    try {
      edaResult = await runPythonEDA(filePath);
      if (!edaResult.success) {
        edaError = edaResult.error;
        edaResult = null;
      }
    } catch (e) {
      edaError = e.message;
      console.warn('[EDA] Python EDA unavailable, falling back to JS analysis:', edaError);
    }

    // ── Step 3: JS-based analysis (always run as backup / supplement) ──
    const analysis = analyzeData(data, columns);

    // ── Step 4: Generate dashboard config (AI or rule-based) ───────────
    const { prompt } = req.body;
    let dashboardConfig;
    let insights;

    if (edaResult) {
      // Use EDA output directly — charts and metrics are pre-computed
      dashboardConfig = {
        dashboardTitle: edaResult.dashboard_title,
        charts: edaResult.charts,
        metrics: edaResult.metrics,
        insights: edaResult.insights.join('\n'),
      };
      insights = edaResult.insights.join('\n\n');
    } else {
      // Fallback: use Gemini / rule-based JS
      dashboardConfig = await generateDashboardConfig(data, columns, analysis, prompt);
      insights = await generateInsights(data, columns, analysis);
    }

    // ── Step 5: Cleanup ────────────────────────────────────────────────
    fs.unlinkSync(filePath);
    filePath = null;

    res.json({
      success: true,
      fileInfo: {
        name: req.file.originalname,
        type: fileExt,
        rowCount,
        columnCount: columns.length,
      },
      columns,
      dashboardConfig,
      insights,
      // Send EDA enriched data so frontend has real stats
      edaResult: edaResult || null,
      data: data.slice(0, 200),   // first 200 rows for charts/table
      totalRows: data.length,
    });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('[Dashboard] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Regenerate dashboard config from already-uploaded data.
 */
const regenerateDashboard = async (req, res) => {
  try {
    const { data, columns, prompt } = req.body;
    if (!data || !columns) {
      return res.status(400).json({ error: 'Data and columns are required' });
    }
    const analysis = analyzeData(data, columns);
    const dashboardConfig = await generateDashboardConfig(data, columns, analysis, prompt);
    res.json({ success: true, dashboardConfig });
  } catch (error) {
    console.error('[Regenerate] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Calculate aggregated metrics accurately using raw data.
 */
const calculateMetrics = (req, res) => {
  try {
    const { data, metrics } = req.body;

    if (!data || !metrics) {
      return res.status(400).json({ error: 'Data and metrics are required' });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Data must be a non-empty array' });
    }
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'Metrics must be a non-empty array' });
    }

    const results = {};

    metrics.forEach((metric) => {
      try {
        const { id, column, aggregation } = metric;
        if (!id || !column || !aggregation) throw new Error('Each metric must have id, column, and aggregation');

        const rawValues = data.map((row) => row[column]);
        const numericValues = rawValues
          .map((val) => {
            if (val === null || val === undefined || val === '') return null;
            const num = Number(val);
            return isNaN(num) ? null : num;
          })
          .filter((v) => v !== null && isFinite(v));

        let result = 0;
        const validCount = numericValues.length;

        switch (aggregation.toLowerCase()) {
          case 'sum':
            result = numericValues.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
          case 'average':
          case 'mean':
            result = validCount > 0
              ? parseFloat((numericValues.reduce((a, b) => a + b, 0) / validCount).toFixed(4))
              : 0;
            break;
          case 'count':
            result = data.length;
            break;
          case 'max':
          case 'maximum':
            result = validCount > 0 ? Math.max(...numericValues) : 0;
            break;
          case 'min':
          case 'minimum':
            result = validCount > 0 ? Math.min(...numericValues) : 0;
            break;
          case 'median': {
            if (validCount > 0) {
              const sorted = [...numericValues].sort((a, b) => a - b);
              result = validCount % 2 === 0
                ? (sorted[validCount / 2 - 1] + sorted[validCount / 2]) / 2
                : sorted[Math.floor(validCount / 2)];
            }
            break;
          }
          case 'stddev':
          case 'standarddeviation': {
            if (validCount > 1) {
              const avg = numericValues.reduce((a, b) => a + b, 0) / validCount;
              const variance = numericValues.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / validCount;
              result = parseFloat(Math.sqrt(variance).toFixed(4));
            }
            break;
          }
          case 'distinct':
          case 'unique':
            result = new Set(numericValues).size;
            break;
          default:
            throw new Error(`Unknown aggregation: ${aggregation}`);
        }

        results[id] = {
          value: typeof result === 'number' ? result : 0,
          label: metric.label || column,
          column,
          aggregation,
          validCount,
          totalCount: rawValues.length,
        };
      } catch (metricError) {
        console.error(`[Metrics] Error for metric ${metric.id}:`, metricError);
        results[metric.id] = { value: 0, error: metricError.message };
      }
    });

    res.json({ success: true, metrics: results, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[Metrics] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { uploadAndGenerateDashboard, regenerateDashboard, calculateMetrics };
