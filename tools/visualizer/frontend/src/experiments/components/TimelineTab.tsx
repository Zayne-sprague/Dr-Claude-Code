import { useState, useMemo } from "react";
import type { ActivityLogEntry, ActivityEntryType } from "../types";

interface TimelineTabProps {
  entries: ActivityLogEntry[];
  onArtifactClick: (datasetName: string) => void;
}

// Deterministic color hash for run-scoped labels
function scopeColor(scope: string): string {
  if (scope === "debug") return "bg-gray-700 text-gray-300";
  if (scope === "cross-run") return "bg-purple-900/60 text-purple-300";
  if (scope === "meta") return "bg-blue-900/60 text-blue-300";

  // Deterministic hash for other scopes (run labels etc.)
  let hash = 0;
  for (let i = 0; i < scope.length; i++) {
    hash = (hash * 31 + scope.charCodeAt(i)) & 0xffff;
  }
  const palette = [
    "bg-emerald-900/60 text-emerald-300",
    "bg-amber-900/60 text-amber-300",
    "bg-rose-900/60 text-rose-300",
    "bg-teal-900/60 text-teal-300",
    "bg-indigo-900/60 text-indigo-300",
    "bg-fuchsia-900/60 text-fuchsia-300",
    "bg-orange-900/60 text-orange-300",
    "bg-lime-900/60 text-lime-300",
  ];
  return palette[hash % palette.length];
}

const TYPE_ICONS: Record<ActivityEntryType, string> = {
  action: "▶",
  result: "◆",
  note: "✎",
  milestone: "⚑",
};

const TYPE_LABELS: ActivityEntryType[] = ["action", "result", "note", "milestone"];

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (isNaN(diffMs)) return iso;

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function TimelineTab({ entries, onArtifactClick }: TimelineTabProps) {
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [activeTypes, setActiveTypes] = useState<Set<ActivityEntryType>>(
    new Set(TYPE_LABELS)
  );

  // Sorted most-recent-first (ensure stable order even if backend varies)
  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [entries]
  );

  const uniqueScopes = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.scope));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(
    () =>
      sorted.filter(
        (e) =>
          (scopeFilter === "all" || e.scope === scopeFilter) &&
          activeTypes.has(e.type)
      ),
    [sorted, scopeFilter, activeTypes]
  );

  function toggleType(t: ActivityEntryType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        // Keep at least one type active
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-500 italic">
        No activity log entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Scope dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Scope</span>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700 outline-none focus:border-cyan-500"
          >
            <option value="all">All</option>
            {uniqueScopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Type filter chips */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide mr-1">Type</span>
          {TYPE_LABELS.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                activeTypes.has(t)
                  ? "bg-cyan-900/50 border-cyan-700 text-cyan-300"
                  : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-400"
              }`}
            >
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-600 ml-auto flex items-center gap-2">
          <span className="text-cyan-600">LLM-generated log</span>
          <span>{filtered.length} of {entries.length}</span>
        </span>
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-4">
          No entries match the current filters.
        </div>
      ) : (
        <div className="space-y-0 border-l-2 border-gray-800 pl-4">
          {filtered.map((entry, i) => (
            <div
              key={i}
              className="relative py-3 border-b border-gray-800/50 last:border-0"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[17px] top-4 w-2 h-2 rounded-full bg-gray-600" />

              <div className="flex flex-wrap items-start gap-2">
                {/* Timestamp */}
                <span
                  title={new Date(entry.timestamp).toISOString()}
                  className="text-xs text-gray-600 shrink-0 mt-0.5 cursor-default"
                >
                  {relativeTime(entry.timestamp)}
                </span>

                {/* Scope badge */}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${scopeColor(
                    entry.scope
                  )}`}
                >
                  {entry.scope}
                </span>

                {/* Type icon + label */}
                <span className="text-xs text-gray-500 shrink-0 mt-0.5">
                  {TYPE_ICONS[entry.type]}
                </span>

                {/* Author */}
                <span
                  className={`text-xs shrink-0 mt-0.5 font-medium ${
                    entry.author === "agent"
                      ? "text-cyan-500"
                      : "text-amber-400"
                  }`}
                >
                  {entry.author === "agent" ? "Claude Code" : "Researcher"}
                </span>
              </div>

              {/* Message */}
              <p className="text-sm text-gray-300 mt-1">{entry.message}</p>

              {/* Artifact chips */}
              {entry.artifacts && entry.artifacts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {entry.artifacts.map((ds) => (
                    <button
                      key={ds}
                      onClick={() => onArtifactClick(ds)}
                      className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/40 border border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/70 hover:text-cyan-300 transition-colors"
                    >
                      {ds}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
