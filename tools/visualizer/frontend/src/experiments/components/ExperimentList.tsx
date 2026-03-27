import { useState } from "react";
import type { Experiment, LiveJobState } from "../types";
import { deriveDisplayStatus, statusBadgeColor } from "../types";

function jobSummaryText(jobs: Record<string, LiveJobState>): string {
  const all = Object.values(jobs);
  if (all.length === 0) return "";
  const running = all.filter((j) => j.status === "running").length;
  const blocked = all.filter((j) => j.status === "blocked").length;
  const completed = all.filter((j) => j.status === "completed").length;
  const parts: string[] = [];
  if (running > 0) parts.push(`${running}/${all.length} running`);
  if (blocked > 0) parts.push(`${blocked} blocked`);
  if (completed > 0 && running === 0 && blocked === 0) parts.push(`${completed} completed`);
  return parts.join(", ");
}

type SortKey = "updated" | "name" | "completeness";

interface Props {
  experiments: Experiment[];
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onSummary: () => void;
}

export default function ExperimentList({ experiments, onSelect, onRefresh, onSummary }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [filterFinished, setFilterFinished] = useState<"all" | "finished" | "active">("all");

  const filtered = experiments.filter((e) => {
    if (filterFinished === "all") return true;
    const isFinished = !!e.zayne_findings;
    return filterFinished === "finished" ? isFinished : !isFinished;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "updated":
        return (b.updated || "").localeCompare(a.updated || "");
      case "name":
        return a.name.localeCompare(b.name);
      case "completeness":
        return (b.completeness || 0) - (a.completeness || 0);
      default:
        return 0;
    }
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-gray-200">Experiments</h1>
        <div className="flex items-center gap-3">
          {/* Filter */}
          <select
            value={filterFinished}
            onChange={(e) => setFilterFinished(e.target.value as "all" | "finished" | "active")}
            className="bg-gray-800 text-gray-300 text-sm rounded px-2 py-1.5 border border-gray-700"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="finished">Finished</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-gray-800 text-gray-300 text-sm rounded px-2 py-1.5 border border-gray-700"
          >
            <option value="updated">Last Updated</option>
            <option value="name">Name</option>
            <option value="completeness">Completeness</option>
          </select>

          <button
            onClick={onSummary}
            className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded transition-colors"
          >
            Findings / Summary
          </button>
        </div>
      </div>

      {/* Experiment cards */}
      <div className="flex-1 overflow-y-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg mb-2">No experiments found</p>
            <p className="text-sm">Try a different filter</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sorted.map((exp) => {
              const isFinished = !!exp.zayne_findings;
              return (
                <button
                  key={exp.id}
                  onClick={() => onSelect(exp.id)}
                  className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isFinished && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-900 text-emerald-300 border border-emerald-700">
                            Finished
                          </span>
                        )}
                        <h3 className="text-sm font-medium text-gray-200 truncate">
                          {exp.name}
                        </h3>
                        {exp.live_status && !isFinished && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeColor(deriveDisplayStatus(exp))}`}>
                            {deriveDisplayStatus(exp).replace("_", " ")}
                          </span>
                        )}
                      </div>
                      {exp.live_message && (
                        <p className="text-xs text-cyan-400/80 mt-0.5 truncate">
                          {exp.live_message}
                        </p>
                      )}
                      {/* Zayne's summary takes priority, fallback to hypothesis */}
                      {exp.zayne_summary ? (
                        <div className="mt-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/70">Zayne's Summary</span>
                          <p className="text-xs text-gray-300 line-clamp-2">
                            {exp.zayne_summary}
                          </p>
                        </div>
                      ) : exp.hypothesis?.statement ? (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 italic">
                          {exp.hypothesis.statement}
                        </p>
                      ) : null}
                      {exp.live_jobs && Object.keys(exp.live_jobs).length > 0 && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-400">
                            {jobSummaryText(exp.live_jobs)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end ml-4 shrink-0">
                      <span className="text-xs text-gray-600">
                        {exp.updated ? new Date(exp.updated).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
