import { useState, useEffect, useCallback } from "react";
import { HF_ORG } from "../../../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlotlyViewerProps {
  datasetRepo: string;
  split?: string;
  onClose: () => void;
}

interface HfRow {
  [key: string]: unknown;
}

interface ColumnStats {
  name: string;
  min: number;
  max: number;
  mean: number;
  count: number;
}

type ViewerMode = "plotly_json" | "numeric_summary" | "empty";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLOTLY_COLUMN_NAMES = ["plotly_json", "chart_data", "figure_json"];
const HF_DATASETS_API = "https://datasets-server.huggingface.co";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectPlotlyColumn(row: HfRow): string | null {
  for (const col of PLOTLY_COLUMN_NAMES) {
    if (col in row) return col;
  }
  return null;
}

function extractNumericColumns(rows: HfRow[]): ColumnStats[] {
  if (rows.length === 0) return [];
  const firstRow = rows[0];
  const stats: ColumnStats[] = [];

  for (const key of Object.keys(firstRow)) {
    const values = rows
      .map((r) => r[key])
      .filter((v) => typeof v === "number" && isFinite(v as number)) as number[];

    if (values.length === 0) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    stats.push({ name: key, min, max, mean, count: values.length });
  }

  return stats;
}

function tryParseJson(raw: unknown): object | null {
  if (typeof raw === "object" && raw !== null) return raw as object;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // not valid JSON
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-gray-100 px-2.5 py-1 rounded transition-colors border border-gray-600"
    >
      {copied ? "Copied!" : "Copy JSON"}
    </button>
  );
}

function PlotlyJsonView({ jsonData }: { jsonData: object }) {
  const formatted = JSON.stringify(jsonData, null, 2);

  // Detect chart type for a helpful header badge
  const chartType =
    (jsonData as Record<string, unknown>).type ||
    (
      (jsonData as Record<string, unknown[]>).data?.[0] as
        | Record<string, unknown>
        | undefined
    )?.type ||
    null;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Info bar */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 bg-amber-900/30 border border-amber-700/40 px-2 py-0.5 rounded">
            plotly JSON
          </span>
          {chartType && (
            <span className="text-xs text-gray-400">
              type:{" "}
              <span className="text-gray-300 font-mono">
                {String(chartType)}
              </span>
            </span>
          )}
          <span className="text-xs text-gray-500 italic">
            Install{" "}
            <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-[11px]">
              react-plotly.js
            </code>{" "}
            for interactive rendering
          </span>
        </div>
        <CopyButton text={formatted} />
      </div>

      {/* JSON code block */}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-700 bg-gray-950">
        <pre className="p-4 text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
          {formatted}
        </pre>
      </div>
    </div>
  );
}

function NumericSummaryView({ stats }: { stats: ColumnStats[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-gray-500 italic">
          No numeric columns found in dataset.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        No Plotly JSON column detected (
        <code className="text-gray-400">
          {PLOTLY_COLUMN_NAMES.join(", ")}
        </code>
        ). Showing numeric column summary.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="text-left py-2 px-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                Column
              </th>
              <th className="text-right py-2 px-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                Count
              </th>
              <th className="text-right py-2 px-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                Min
              </th>
              <th className="text-right py-2 px-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                Max
              </th>
              <th className="text-right py-2 px-3 text-xs text-gray-400 uppercase tracking-wide font-medium">
                Mean
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((col) => (
              <tr
                key={col.name}
                className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors"
              >
                <td className="py-2 px-3 font-mono text-xs text-cyan-300">
                  {col.name}
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-400 font-mono">
                  {col.count}
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-300 font-mono">
                  {col.min.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-300 font-mono">
                  {col.max.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-300 font-mono">
                  {col.mean.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PlotlyViewer({
  datasetRepo,
  split = "train",
  onClose,
}: PlotlyViewerProps) {
  // Ensure dataset repo has org prefix for HF API calls
  const fullRepo = datasetRepo.includes("/") ? datasetRepo : `${HF_ORG}/${datasetRepo}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ViewerMode>("empty");
  const [plotlyJson, setPlotlyJson] = useState<object | null>(null);
  const [numericStats, setNumericStats] = useState<ColumnStats[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);

  const shortName = datasetRepo.split("/").pop() ?? datasetRepo;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch first page of rows (up to 100 for numeric summary)
      const url = `${HF_DATASETS_API}/rows?dataset=${encodeURIComponent(
        fullRepo
      )}&config=default&split=${encodeURIComponent(split)}&offset=0&length=100`;

      const resp = await fetch(url);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HF API error ${resp.status}: ${text.slice(0, 200)}`);
      }

      const data = (await resp.json()) as {
        rows?: { row: HfRow }[];
        num_rows_total?: number;
      };

      const rows: HfRow[] = (data.rows ?? []).map((r) => r.row);
      setRowCount(data.num_rows_total ?? rows.length);

      if (rows.length === 0) {
        setMode("empty");
        return;
      }

      // Try to find a plotly JSON column
      const plotlyCol = detectPlotlyColumn(rows[0]);
      if (plotlyCol !== null) {
        // Use the first row's plotly JSON
        const parsed = tryParseJson(rows[0][plotlyCol]);
        if (parsed !== null) {
          setPlotlyJson(parsed);
          setMode("plotly_json");
          return;
        }
      }

      // Fallback: numeric summary
      const stats = extractNumericColumns(rows);
      setNumericStats(stats);
      setMode(stats.length > 0 ? "numeric_summary" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fullRepo, split]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[85vh] bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-gray-200 truncate">
              {shortName}
            </span>
            {datasetRepo.includes("/") && (
              <span className="text-xs text-gray-500 truncate hidden sm:block">
                {datasetRepo.split("/")[0]}/
              </span>
            )}
            <span className="text-xs text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded">
              {split}
            </span>
            {!loading && rowCount > 0 && (
              <span className="text-xs text-gray-600">
                {rowCount.toLocaleString()} rows
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`https://huggingface.co/datasets/${fullRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 border border-gray-700 rounded"
            >
              HF
            </a>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded hover:bg-gray-700"
              aria-label="Close viewer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden p-5">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Loading dataset...</p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center justify-center h-full">
              <div className="max-w-lg text-center space-y-3">
                <p className="text-sm font-medium text-red-400">
                  Failed to load dataset
                </p>
                <p className="text-xs text-gray-500 font-mono break-words bg-gray-800 rounded p-3">
                  {error}
                </p>
                <button
                  onClick={fetchData}
                  className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-700/50 px-3 py-1 rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && mode === "empty" && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-400">Dataset is empty or has no renderable columns.</p>
                <p className="text-xs text-gray-600">
                  Expected columns for Plotly:{" "}
                  <code className="text-gray-500">
                    {PLOTLY_COLUMN_NAMES.join(", ")}
                  </code>
                </p>
              </div>
            </div>
          )}

          {!loading && !error && mode === "plotly_json" && plotlyJson && (
            <PlotlyJsonView jsonData={plotlyJson} />
          )}

          {!loading && !error && mode === "numeric_summary" && (
            <NumericSummaryView stats={numericStats} />
          )}
        </div>
      </div>
    </div>
  );
}
