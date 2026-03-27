import { useState, useEffect, useCallback, useRef } from "react";
import { HF_ORG } from "../../../config";

const PAGE_SIZE = 100;
const CELL_TRUNCATE_LEN = 200;

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

interface TableViewerProps {
  datasetRepo: string;
  split?: string;
  onClose: () => void;
}

// ─── Cell Expansion Modal ─────────────────────────────────────────────────────

interface CellModalProps {
  value: string;
  colName: string;
  onClose: () => void;
}

function CellModal({ value, colName, onClose }: CellModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  }, [value]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <span className="text-sm font-medium text-gray-200 truncate max-w-[80%]">
            {colName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors border border-gray-600"
              title="Copy to clipboard"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors text-lg leading-none px-1"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Full value — scrollable, monospace */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="font-mono text-sm text-gray-100 whitespace-pre-wrap break-words leading-relaxed">
            {value}
          </pre>
        </div>

        {/* Footer with char count */}
        <div className="px-4 py-2 border-t border-gray-700 flex-shrink-0">
          <span className="text-xs text-gray-500">{value.length.toLocaleString()} characters — complete, untruncated</span>
        </div>
      </div>
    </div>
  );
}

// ─── Table Cell ───────────────────────────────────────────────────────────────

interface CellProps {
  value: unknown;
  colName: string;
  onExpand: (value: string, colName: string) => void;
}

function TableCell({ value, colName, onExpand }: CellProps) {
  const str = value === null || value === undefined
    ? ""
    : typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value);

  const isTruncated = str.length > CELL_TRUNCATE_LEN;
  const display = isTruncated ? str.slice(0, CELL_TRUNCATE_LEN) + "..." : str;

  return (
    <td className="px-3 py-2 text-xs text-gray-300 max-w-xs border-b border-gray-800 align-top">
      <span className="whitespace-pre-wrap break-words">{display}</span>
      {isTruncated && (
        <button
          onClick={() => onExpand(str, colName)}
          className="ml-1 text-cyan-400 hover:text-cyan-300 text-xs underline underline-offset-2 transition-colors whitespace-nowrap"
          title="Show complete value"
        >
          Show more
        </button>
      )}
    </td>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === null) return <span className="text-gray-600 ml-1 text-xs">⇅</span>;
  if (dir === "asc") return <span className="text-cyan-400 ml-1 text-xs">↑</span>;
  return <span className="text-cyan-400 ml-1 text-xs">↓</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TableViewer({ datasetRepo, split = "train", onClose }: TableViewerProps) {
  // Ensure dataset repo has org prefix for HF API calls
  const fullRepo = datasetRepo.includes("/") ? datasetRepo : `${HF_ORG}/${datasetRepo}`;

  const [rows, setRows] = useState<HfRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [expandedCell, setExpandedCell] = useState<{ value: string; colName: string } | null>(null);

  const fetchRef = useRef(0);

  const fetchRows = useCallback(async (pageIndex: number) => {
    setLoading(true);
    setError(null);

    const fetchId = ++fetchRef.current;
    const offset = pageIndex * PAGE_SIZE;
    const baseUrl = "https://datasets-server.huggingface.co/rows";
    const urlWithConfig = `${baseUrl}?dataset=${encodeURIComponent(fullRepo)}&config=default&split=${split}&offset=${offset}&length=${PAGE_SIZE}`;
    const urlWithoutConfig = `${baseUrl}?dataset=${encodeURIComponent(fullRepo)}&split=${split}&offset=${offset}&length=${PAGE_SIZE}`;

    let data: HfResponse | null = null;

    try {
      const res = await fetch(urlWithConfig);
      if (res.ok) {
        data = await res.json() as HfResponse;
      } else {
        // Try without config param
        const res2 = await fetch(urlWithoutConfig);
        if (res2.ok) {
          data = await res2.json() as HfResponse;
        } else {
          const errText = await res2.text();
          throw new Error(`API error ${res2.status}: ${errText.slice(0, 200)}`);
        }
      }
    } catch (e) {
      if (fetchRef.current === fetchId) {
        setError(e instanceof Error ? e.message : "Failed to fetch dataset rows");
        setLoading(false);
      }
      return;
    }

    if (fetchRef.current !== fetchId) return;

    if (data) {
      const cols = data.features.map((f) => f.name);
      setColumns(cols);
      setRows(data.rows);
      setTotalRows(data.num_rows_total);
    }
    setLoading(false);
  }, [fullRepo, split]);

  useEffect(() => {
    fetchRows(page);
  }, [fetchRows, page]);

  // ── Derived: search + sort applied to currently loaded page ──
  const filteredRows = (() => {
    let result = rows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        columns.some((col) => {
          const v = r.row[col];
          if (v === null || v === undefined) return false;
          return String(typeof v === "object" ? JSON.stringify(v) : v).toLowerCase().includes(q);
        })
      );
    }

    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a.row[sortCol];
        const bv = b.row[sortCol];
        const as = av === null || av === undefined ? "" : typeof av === "object" ? JSON.stringify(av) : String(av);
        const bs = bv === null || bv === undefined ? "" : typeof bv === "object" ? JSON.stringify(bv) : String(bv);
        // Try numeric sort first
        const an = Number(as);
        const bn = Number(bs);
        if (!isNaN(an) && !isNaN(bn)) {
          return sortDir === "asc" ? an - bn : bn - an;
        }
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }

    return result;
  })();

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir("asc");
      }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const handleExpand = (value: string, colName: string) => {
    setExpandedCell({ value, colName });
  };

  const startRow = page * PAGE_SIZE + 1;
  const endRow = totalRows !== null ? Math.min((page + 1) * PAGE_SIZE, totalRows) : (page + 1) * PAGE_SIZE;
  const hasPrev = page > 0;
  const hasNext = totalRows !== null ? (page + 1) * PAGE_SIZE < totalRows : rows.length === PAGE_SIZE;

  const shortName = datasetRepo.split("/").pop() ?? datasetRepo;

  return (
    <>
      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-40 bg-gray-950 flex flex-col">
        {/* ── Top bar ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Table Viewer</span>
            <span className="text-gray-600">·</span>
            <span className="text-sm font-medium text-gray-200 truncate" title={datasetRepo}>
              {shortName}
            </span>
            <span className="text-xs text-gray-500 truncate hidden sm:block" title={datasetRepo}>
              ({datasetRepo.split("/")[0]})
            </span>
            {totalRows !== null && (
              <span className="text-xs text-gray-500 flex-shrink-0">
                {totalRows.toLocaleString()} rows
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Search */}
            <input
              type="text"
              placeholder="Search all cells…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-600 w-48 sm:w-64"
            />

            {/* Close */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors text-xl leading-none px-1"
              title="Close viewer"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-3 text-gray-400">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Loading rows…</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => fetchRows(page)}
                className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredRows.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-gray-500 italic">
                {searchQuery.trim() ? "No rows match your search." : "No rows returned."}
              </p>
            </div>
          )}

          {!loading && !error && filteredRows.length > 0 && (
            <table className="w-full border-collapse text-left table-auto">
              <thead className="sticky top-0 z-10 bg-gray-900">
                <tr>
                  {/* Row index column */}
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 border-b border-gray-700 w-12 bg-gray-900">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-2.5 text-xs font-medium text-gray-300 border-b border-gray-700 cursor-pointer select-none hover:text-gray-100 hover:bg-gray-800 transition-colors whitespace-nowrap bg-gray-900"
                    >
                      {col}
                      <SortIcon dir={sortCol === col ? sortDir : null} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.row_idx}
                    className="hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-3 py-2 text-xs text-gray-600 border-b border-gray-800 align-top tabular-nums">
                      {r.row_idx}
                    </td>
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        value={r.row[col]}
                        colName={col}
                        onExpand={handleExpand}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination bar ───────────────────────────────────────────── */}
        {!loading && !error && totalRows !== null && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800 bg-gray-900 flex-shrink-0">
            <span className="text-xs text-gray-500">
              {searchQuery.trim()
                ? `${filteredRows.length} matching rows on this page`
                : `Rows ${startRow}–${endRow} of ${totalRows.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={!hasPrev}
                className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-500 tabular-nums">
                Page {page + 1} / {Math.ceil(totalRows / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cell Expansion Modal ─────────────────────────────────────── */}
      {expandedCell && (
        <CellModal
          value={expandedCell.value}
          colName={expandedCell.colName}
          onClose={() => setExpandedCell(null)}
        />
      )}
    </>
  );
}
