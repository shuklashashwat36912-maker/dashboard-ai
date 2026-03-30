"""
Dynamic EDA Runner - runs pandas-based Exploratory Data Analysis on any uploaded file.
Called by Node.js via child_process. Reads file path from argv[1], outputs JSON to stdout.
"""

import sys
import json
import warnings
import pandas as pd
import numpy as np

warnings.filterwarnings('ignore')


def safe_val(v):
    """Convert numpy / pandas scalars to JSON-serialisable Python types."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v) if not np.isnan(v) and not np.isinf(v) else None
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, (np.ndarray,)):
        return [safe_val(x) for x in v.tolist()]
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return None
    return v


def run_eda(file_path: str) -> dict:
    # ------------------------------------------------------------------ #
    # 1. Load data                                                         #
    # ------------------------------------------------------------------ #
    ext = file_path.rsplit('.', 1)[-1].lower()
    if ext == 'csv':
        df = pd.read_csv(file_path)
    elif ext in ('xlsx', 'xls'):
        df = pd.read_excel(file_path)
    elif ext == 'json':
        df = pd.read_json(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    original_rows = len(df)

    # ------------------------------------------------------------------ #
    # 2. Data cleaning                                                     #
    # ------------------------------------------------------------------ #
    missing_before = int(df.isnull().sum().sum())
    duplicates_before = int(df.duplicated().sum())

    df = df.drop_duplicates()
    # Drop completely empty rows/cols
    df = df.dropna(how='all')

    missing_after = int(df.isnull().sum().sum())
    rows_after_clean = len(df)

    # ------------------------------------------------------------------ #
    # 3. Column classification                                             #
    # ------------------------------------------------------------------ #
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()

    # Try to parse any object columns that look like dates
    date_cols = []
    for col in categorical_cols:
        try:
            parsed = pd.to_datetime(df[col], infer_format=True, errors='coerce')
            if parsed.notna().sum() / max(len(df), 1) > 0.7:
                date_cols.append(col)
        except Exception:
            pass
    text_cols = [c for c in categorical_cols if c not in date_cols]

    # ------------------------------------------------------------------ #
    # 4. Summary statistics for numeric columns                            #
    # ------------------------------------------------------------------ #
    column_stats = {}
    for col in numeric_cols:
        s = df[col].dropna()
        if len(s) == 0:
            continue
        q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
        iqr = q3 - q1
        lb, ub = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_count = int(((s < lb) | (s > ub)).sum())
        column_stats[col] = {
            'type': 'numeric',
            'count': int(s.count()),
            'missing': int(df[col].isnull().sum()),
            'mean': safe_val(s.mean()),
            'median': safe_val(s.median()),
            'std': safe_val(s.std()),
            'min': safe_val(s.min()),
            'max': safe_val(s.max()),
            'sum': safe_val(s.sum()),
            'q1': safe_val(q1),
            'q3': safe_val(q3),
            'iqr': safe_val(iqr),
            'skewness': safe_val(float(s.skew())),
            'kurtosis': safe_val(float(s.kurtosis())),
            'outlier_count': outlier_count,
        }

    # ------------------------------------------------------------------ #
    # 5. Category value counts                                             #
    # ------------------------------------------------------------------ #
    category_stats = {}
    for col in text_cols:
        vc = df[col].value_counts().head(20)
        category_stats[col] = {
            'type': 'categorical',
            'unique_count': int(df[col].nunique()),
            'missing': int(df[col].isnull().sum()),
            'top_values': [{'value': str(k), 'count': int(v)} for k, v in vc.items()],
        }

    # ------------------------------------------------------------------ #
    # 6. Correlation matrix (numeric only, top pairs)                      #
    # ------------------------------------------------------------------ #
    correlations = []
    if len(numeric_cols) >= 2:
        corr_matrix = df[numeric_cols].corr()
        seen = set()
        for i, c1 in enumerate(numeric_cols):
            for j, c2 in enumerate(numeric_cols):
                if i < j:
                    key = (c1, c2)
                    if key not in seen:
                        seen.add(key)
                        val = safe_val(corr_matrix.loc[c1, c2])
                        if val is not None:
                            correlations.append({'col1': c1, 'col2': c2, 'r': round(val, 3)})
        correlations.sort(key=lambda x: abs(x['r']) if x['r'] is not None else 0, reverse=True)
        correlations = correlations[:10]

    # ------------------------------------------------------------------ #
    # 7. Group-by aggregations for categorical × numeric                  #
    # ------------------------------------------------------------------ #
    group_analyses = []
    for cat_col in text_cols[:3]:          # at most 3 categorical cols
        for num_col in numeric_cols[:3]:   # at most 3 numeric cols
            try:
                grp = df.groupby(cat_col)[num_col].agg(['sum', 'mean', 'count']).reset_index()
                grp = grp.sort_values('sum', ascending=False).head(15)
                rows = []
                for _, row in grp.iterrows():
                    rows.append({
                        'label': str(row[cat_col]),
                        'sum': safe_val(row['sum']),
                        'mean': safe_val(row['mean']),
                        'count': safe_val(row['count']),
                    })
                group_analyses.append({
                    'group_by': cat_col,
                    'metric': num_col,
                    'data': rows,
                })
            except Exception:
                pass

    # ------------------------------------------------------------------ #
    # 8. Trend detection (first date or sequential numeric column)        #
    # ------------------------------------------------------------------ #
    trend_data = []
    # Look for columns that could be a time-axis or sequential label
    label_candidates = date_cols + [c for c in text_cols if any(
        kw in c.lower() for kw in ('month', 'year', 'quarter', 'week', 'day', 'date', 'period', 'time', 'q1', 'q2', 'q3', 'q4')
    )]
    if label_candidates and numeric_cols:
        label_col = label_candidates[0]
        num_col = numeric_cols[0]
        try:
            grp = df.groupby(label_col)[num_col].sum().reset_index().head(20)
            for _, row in grp.iterrows():
                trend_data.append({'label': str(row[label_col]), 'value': safe_val(row[num_col])})
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    # 9. Top / bottom records                                              #
    # ------------------------------------------------------------------ #
    top_records = []
    bottom_records = []
    if numeric_cols:
        primary_metric = numeric_cols[0]
        # Pick a name/label column (first text col, or index)
        name_col = text_cols[0] if text_cols else None
        top_df = df.nlargest(5, primary_metric)
        bot_df = df.nsmallest(5, primary_metric)
        for _, row in top_df.iterrows():
            rec = {col: safe_val(row[col]) for col in df.columns[:6]}
            top_records.append(rec)
        for _, row in bot_df.iterrows():
            rec = {col: safe_val(row[col]) for col in df.columns[:6]}
            bottom_records.append(rec)

    # ------------------------------------------------------------------ #
    # 10. Data quality summary                                             #
    # ------------------------------------------------------------------ #
    completeness = round((1 - missing_after / max(df.size, 1)) * 100, 1)
    data_quality = {
        'total_rows': rows_after_clean,
        'original_rows': original_rows,
        'total_columns': len(df.columns),
        'missing_values': missing_after,
        'duplicates_removed': duplicates_before,
        'completeness_pct': completeness,
        'numeric_columns': len(numeric_cols),
        'categorical_columns': len(text_cols),
        'date_columns': len(date_cols),
    }

    # ------------------------------------------------------------------ #
    # 11. AI-ready insight bullets (rule-based, no API required)          #
    # ------------------------------------------------------------------ #
    insights = []
    insights.append(f"Dataset contains {rows_after_clean:,} records across {len(df.columns)} fields.")

    if missing_before > 0:
        insights.append(f"Data cleaning removed {duplicates_before} duplicates and found {missing_before} missing values.")
    else:
        insights.append(f"Data quality is excellent — no missing values or duplicates detected.")

    for col in numeric_cols[:2]:
        st = column_stats.get(col, {})
        if st:
            insights.append(
                f"{col}: ranges from {st['min']:,} to {st['max']:,} with a mean of {st['mean']:,.2f}."
            )

    if group_analyses:
        ga = group_analyses[0]
        if ga['data']:
            top_grp = ga['data'][0]
            insights.append(
                f"Top '{ga['group_by']}' by {ga['metric']}: '{top_grp['label']}' "
                f"with a total of {top_grp['sum']:,}."
            )

    if correlations:
        c = correlations[0]
        direction = "positive" if c['r'] > 0 else "negative"
        insights.append(
            f"Strong {direction} correlation (r={c['r']}) found between '{c['col1']}' and '{c['col2']}'."
        )

    # ------------------------------------------------------------------ #
    # 12. Suggested chart configs (dynamic, schema-agnostic)              #
    # ------------------------------------------------------------------ #
    charts = []
    metrics_config = []

    # Metric cards (sum/avg of top numeric cols)
    for i, col in enumerate(numeric_cols[:4]):
        metrics_config.append({
            'id': f'metric_{i}',
            'label': f'Total {col}',
            'column': col,
            'aggregation': 'sum',
        })
    if text_cols:
        metrics_config.append({
            'id': 'metric_records',
            'label': 'Total Records',
            'column': df.columns[0],
            'aggregation': 'count',
        })

    # Bar chart: first group analysis
    if group_analyses:
        ga = group_analyses[0]
        charts.append({
            'id': 'chart_bar_1',
            'title': f'{ga["metric"]} by {ga["group_by"]}',
            'type': 'bar',
            'xAxis': ga['group_by'],
            'yAxis': ga['metric'],
            'description': f'Compares {ga["metric"]} across {ga["group_by"]} groups',
            'data': ga['data'],
        })

    # Pie chart: second group analysis
    if len(group_analyses) > 1:
        ga2 = group_analyses[1]
        charts.append({
            'id': 'chart_pie_1',
            'title': f'{ga2["metric"]} Distribution by {ga2["group_by"]}',
            'type': 'pie',
            'xAxis': ga2['group_by'],
            'yAxis': ga2['metric'],
            'description': f'Proportion of {ga2["metric"]} per {ga2["group_by"]}',
            'data': ga2['data'],
        })
    elif group_analyses:
        # Same data as bar but as doughnut
        ga = group_analyses[0]
        charts.append({
            'id': 'chart_pie_1',
            'title': f'{ga["metric"]} Share by {ga["group_by"]}',
            'type': 'doughnut',
            'xAxis': ga['group_by'],
            'yAxis': ga['metric'],
            'description': f'Proportion of {ga["metric"]} per {ga["group_by"]}',
            'data': ga['data'],
        })

    # Line/trend chart
    if trend_data:
        charts.append({
            'id': 'chart_line_1',
            'title': f'{numeric_cols[0]} Trend',
            'type': 'line',
            'xAxis': label_candidates[0],
            'yAxis': numeric_cols[0],
            'description': 'Time-series or sequential trend analysis',
            'data': trend_data,
        })

    # Scatter: top correlated pair
    if correlations and len(numeric_cols) >= 2:
        best = correlations[0]
        scatter_data = []
        for _, row in df[[best['col1'], best['col2']]].dropna().head(200).iterrows():
            scatter_data.append({'x': safe_val(row[best['col1']]), 'y': safe_val(row[best['col2']])})
        charts.append({
            'id': 'chart_scatter_1',
            'title': f'Correlation: {best["col1"]} vs {best["col2"]}',
            'type': 'scatter',
            'xAxis': best['col1'],
            'yAxis': best['col2'],
            'description': f'r = {best["r"]} — shows relationship between the two variables',
            'data': scatter_data,
        })

    # Third group analysis as another bar
    if len(group_analyses) > 2:
        ga3 = group_analyses[2]
        charts.append({
            'id': 'chart_bar_2',
            'title': f'{ga3["metric"]} by {ga3["group_by"]}',
            'type': 'bar',
            'xAxis': ga3['group_by'],
            'yAxis': ga3['metric'],
            'description': f'Compares {ga3["metric"]} across {ga3["group_by"]} groups',
            'data': ga3['data'],
        })

    # Always add table
    charts.append({
        'id': 'chart_table',
        'title': 'Full Dataset',
        'type': 'table',
        'description': 'Scrollable data table with all columns',
    })

    # ------------------------------------------------------------------ #
    # 13. Final output                                                     #
    # ------------------------------------------------------------------ #
    return {
        'success': True,
        'schema': {
            'numeric_columns': numeric_cols,
            'categorical_columns': text_cols,
            'date_columns': date_cols,
            'all_columns': df.columns.tolist(),
        },
        'data_quality': data_quality,
        'column_stats': column_stats,
        'category_stats': category_stats,
        'correlations': correlations,
        'group_analyses': group_analyses,
        'trend_data': trend_data,
        'top_records': top_records,
        'bottom_records': bottom_records,
        'insights': insights,
        'charts': charts,
        'metrics': metrics_config,
        'dashboard_title': f'EDA Dashboard — {", ".join(df.columns[:3].tolist())}...' if len(df.columns) > 3 else f'EDA Dashboard — {", ".join(df.columns.tolist())}',
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No file path provided'}))
        sys.exit(1)

    file_path = sys.argv[1]
    try:
        result = run_eda(file_path)
        print(json.dumps(result, default=str))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)
