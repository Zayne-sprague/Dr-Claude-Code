import { useState, useEffect, useCallback, useRef } from "react";
import { HF_ORG } from "../../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HfRow {
  row_idx: number;
  row: Record<string, unknown>;
}

interface HfFeature {
  feature_idx: number;
  name: string;
  type: Record<string, unknown>;
}

interface HfResponse {
  rows: HfRow[];
  features: HfFeature[];
  num_rows_total: number;
}

interface YamlViewerProps {
  datasetRepo: string;
  split?: string;
  onClose: () => void;
}

// ─── Syntax Highlighting ──────────────────────────────────────────────────────

/**
 * Color scheme for JSON tokens in dark theme.
 * Keys: cyan, strings: green, numbers: amber, booleans: purple, null: gray.
 */
function getValueColor(value: unknown): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (typeof value === "boolean") return "text-purple-400";
  if (typeof value === "number") return "text-amber-400";
  if (typeof value === "string") return "text-green-400";
  return "text-gray-200";
}

function StringValue({ value }: { value: string }) {
  // Render quoted string with green color
  return <span className="text-green-400">&quot;{value}&quot;</span>;
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-gray-400">null</span>;
  if (typeof value === "boolean")
    return <span className="text-purple-400">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-amber-400">{String(value)}</span>;
  if (typeof value === "string") return <StringValue value={value} />;
  return <span className={getValueColor(value)}>{String(value)}</span>;
}

// ─── Recursive JSON Node ──────────────────────────────────────────────────────

interface JsonNodeProps {
  data: unknown;
  depth?: number;
  /** If provided, render this key inline before the value */
  keyName?: string;
  /** Whether this node is the last sibling (no trailing comma) */
  isLast?: boolean;
  /** For top-level keys on the root object: controlled collapse state */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function JsonNode({
  data,
  depth = 0,
  keyName,
  isLast = true,
  collapsed,
  onToggleCollapse,
}: JsonNodeProps) {
  const indent = "  ".repeat(depth);
  const isTopLevel = depth === 0 && onToggleCollapse !== undefined;

  // Render the key label (if any)
  const keyEl = keyName !== undefined ? (
    <span className="text-cyan-400">&quot;{keyName}&quot;</span>
  ) : null;

  const separator = keyName !== undefined ? (
    <span className="text-gray-400">: </span>
  ) : null;

  // ── Object ────────────────────────────────────────────────────────────────
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    const isEmpty = entries.length === 0;

    if (isEmpty) {
      return (
        <div>
          <span className="text-gray-600">{indent}</span>
          {keyEl}{separator}
          <span className="text-gray-200">{"{}"}</span>
          {!isLast && <span className="text-gray-500">,</span>}
        </div>
      );
    }

    // Collapsible header
    const isCollapsed = collapsed === true;

    return (
      <div>
        <div
          className={isTopLevel ? "cursor-pointer group" : ""}
          onClick={isTopLevel ? onToggleCollapse : undefined}
        >
          <span className="text-gray-600">{indent}</span>
          {isTopLevel && (
            <span className={`text-gray-500 mr-1 text-xs transition-transform inline-block ${isCollapsed ? "" : "rotate-90"} group-hover:text-gray-300`}>
              ▶
            </span>
          )}
          {keyEl}{separator}
          <span className="text-gray-200">{"{"}</span>
          {isCollapsed && (
            <>
              <span className="text-gray-500"> … </span>
              <span className="text-gray-200">{"}"}</span>
              {!isLast && <span className="text-gray-500">,</span>}
            </>
          )}
        </div>

        {!isCollapsed && (
          <>
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                data={v}
                depth={depth + 1}
                keyName={k}
                isLast={i === entries.length - 1}
              />
            ))}
            <div>
              <span className="text-gray-600">{indent}</span>
              <span className="text-gray-200">{"}"}</span>
              {!isLast && <span className="text-gray-500">,</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Array ─────────────────────────────────────────────────────────────────
  if (Array.isArray(data)) {
    const isEmpty = data.length === 0;

    if (isEmpty) {
      return (
        <div>
          <span className="text-gray-600">{indent}</span>
          {keyEl}{separator}
          <span className="text-gray-200">{"[]"}</span>
          {!isLast && <span className="text-gray-500">,</span>}
        </div>
      );
    }

    const isCollapsed = collapsed === true;

    return (
      <div>
        <div
          className={isTopLevel ? "cursor-pointer group" : ""}
          onClick={isTopLevel ? onToggleCollapse : undefined}
        >
          <span className="text-gray-600">{indent}</span>
          {isTopLevel && (
            <span className={`text-gray-500 mr-1 text-xs transition-transform inline-block ${isCollapsed ? "" : "rotate-90"} group-hover:text-gray-300`}>
              ▶
            </span>
          )}
          {keyEl}{separator}
          <span className="text-gray-200">{"["}</span>
          {isCollapsed && (
            <>
              <span className="text-gray-500"> … </span>
              <span className="text-gray-200">{"]"}</span>
              {!isLast && <span className="text-gray-500">,</span>}
            </>
          )}
        </div>

        {!isCollapsed && (
          <>
            {data.map((item, i) => (
              <JsonNode
                key={i}
                data={item}
                depth={depth + 1}
                isLast={i === data.length - 1}
              />
            ))}
            <div>
              <span className="text-gray-600">{indent}</span>
              <span className="text-gray-200">{"]"}</span>
              {!isLast && <span className="text-gray-500">,</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Primitive ─────────────────────────────────────────────────────────────
  return (
    <div>
      <span className="text-gray-600">{indent}</span>
      {keyEl}{separator}
      <PrimitiveValue value={data} />
      {!isLast && <span className="text-gray-500">,</span>}
    </div>
  );
}

// ─── Root Object Renderer (top-level collapsible sections) ───────────────────

function JsonRoot({ data }: { data: unknown }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (data === null || data === undefined) {
    return <span className="text-gray-400">null</span>;
  }

  // Top-level object: render each key as a collapsible section
  if (typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-gray-200">{"{}"}</span>;
    }

    return (
      <div>
        <div><span className="text-gray-200">{"{"}</span></div>
        {entries.map(([k, v], i) => (
          <JsonNode
            key={k}
            data={v}
            depth={1}
            keyName={k}
            isLast={i === entries.length - 1}
            collapsed={collapsed[k] ?? false}
            onToggleCollapse={() => toggle(k)}
          />
        ))}
        <div><span className="text-gray-200">{"}"}</span></div>
      </div>
    );
  }

  // Top-level array or primitive — render normally
  return <JsonNode data={data} depth={0} />;
}

// ─── Row Selector ─────────────────────────────────────────────────────────────

interface RowSelectorProps {
  rows: HfRow[];
  currentIdx: number;
  onChange: (idx: number) => void;
}

function RowSelector({ rows, currentIdx, onChange }: RowSelectorProps) {
  if (rows.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Row:</span>
      <select
        value={currentIdx}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-cyan-600"
      >
        {rows.map((r, i) => (
          <option key={r.row_idx} value={i}>
            #{r.row_idx}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function YamlViewer({ datasetRepo, split = "train", onClose }: YamlViewerProps) {
  // Ensure dataset repo has org prefix for HF API calls
  const fullRepo = datasetRepo.includes("/") ? datasetRepo : `${HF_ORG}/${datasetRepo}`;

  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const fetchRef = useRef(0);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const fetchId = ++fetchRef.current;
    const baseUrl = "https://datasets-server.huggingface.co/rows";
    const urlWithConfig = `${baseUrl}?dataset=${encodeURIComponent(fullRepo)}&config=default&split=${split}&offset=0&length=100`;
    const urlWithoutConfig = `${baseUrl}?dataset=${encodeURIComponent(fullRepo)}&split=${split}&offset=0&length=100`;

    let data: HfResponse | null = null;

    try {
      const res = await fetch(urlWithConfig);
      if (res.ok) {
        data = await res.json() as HfResponse;
      } else {
        const res2 = await fetch(urlWithoutConfig);
        if (res2.ok) {
          data = await res2.json() as HfResponse;
        } else {
          const errText = await res2.text();
          throw new Error(`API error ${res2.status}: ${errText.slice(0, 300)}`);
        }
      }
    } catch (e) {
      if (fetchRef.current === fetchId) {
        setError(e instanceof Error ? e.message : "Failed to fetch dataset");
        setLoading(false);
      }
      return;
    }

    if (fetchRef.current !== fetchId) return;

    if (data) {
      setRows(data.rows);
      setSelectedRowIdx(0);
    }
    setLoading(false);
  }, [fullRepo, split]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Derive parsed data for the selected row ──────────────────────────────
  const selectedRow = rows[selectedRowIdx] ?? null;

  /**
   * Convert a dataset row into displayable JSON data.
   *
   * Strategy:
   *  1. If the row has exactly one column and its value is a string that parses
   *     as JSON/YAML-ish object → parse and display that.
   *  2. If the row has a column named "config", "yaml", "json", or "data" that
   *     contains a string → try to parse it.
   *  3. Otherwise display the whole row object directly.
   */
  const parsedData: unknown = (() => {
    if (!selectedRow) return null;
    const rowObj = selectedRow.row;
    const keys = Object.keys(rowObj);

    // Try single-column string parse
    if (keys.length === 1) {
      const val = rowObj[keys[0]];
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          // Not valid JSON — fall through to raw display
          return rowObj;
        }
      }
    }

    // Try known config column names
    const configColNames = ["config", "yaml", "json", "data", "content", "value"];
    for (const col of configColNames) {
      if (col in rowObj && typeof rowObj[col] === "string") {
        try {
          return JSON.parse(rowObj[col] as string);
        } catch {
          // Not valid JSON — fall through
        }
      }
    }

    // Default: show the whole row
    return rowObj;
  })();

  // ── Canonical JSON string for copy-to-clipboard ──────────────────────────
  const jsonString = parsedData !== null
    ? JSON.stringify(parsedData, null, 2)
    : "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  }, [jsonString]);

  const shortName = datasetRepo.split("/").pop() ?? datasetRepo;
  const orgName = datasetRepo.includes("/") ? datasetRepo.split("/")[0] : "";

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 flex flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-medium flex-shrink-0">
            Config Viewer
          </span>
          <span className="text-gray-600">·</span>
          <span
            className="text-sm font-medium text-gray-200 truncate"
            title={datasetRepo}
          >
            {shortName}
          </span>
          {orgName && (
            <span
              className="text-xs text-gray-500 truncate hidden sm:block"
              title={datasetRepo}
            >
              ({orgName})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Row selector (only if multiple rows) */}
          {rows.length > 1 && (
            <RowSelector
              rows={rows}
              currentIdx={selectedRowIdx}
              onChange={setSelectedRowIdx}
            />
          )}

          {/* Copy button */}
          {!loading && !error && jsonString && (
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors"
              title="Copy entire config as JSON"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
          )}

          {/* HuggingFace link */}
          <a
            href={`https://huggingface.co/datasets/${fullRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-cyan-400 transition-colors"
            title="Open on HuggingFace"
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>

          {/* Close */}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-xl leading-none px-1"
            title="Close viewer (Esc)"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-gray-950">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-3 text-gray-400">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-sm">Loading config…</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchRows}
              className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && rows.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-gray-500 italic">No data found in this dataset.</p>
          </div>
        )}

        {/* Syntax-highlighted JSON */}
        {!loading && !error && parsedData !== null && (
          <div className="p-6">
            <pre className="font-mono text-sm leading-relaxed whitespace-pre bg-gray-950 rounded-lg p-4 border border-gray-800 overflow-x-auto">
              <JsonRoot data={parsedData} />
            </pre>
          </div>
        )}
      </div>

      {/* ── Footer hint ──────────────────────────────────────────────────── */}
      {!loading && !error && parsedData !== null && (
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 flex-shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            Click top-level keys to collapse/expand · Press Esc to close
          </span>
          <span className="text-xs text-gray-600">
            {rows.length > 1 ? `${rows.length} rows available` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
