import { useState, useCallback } from "react";
import type { Artifact, ExperimentDetail as ExperimentDetailType, ExperimentNote } from "../types";
import { HF_ORG } from "../../config";
import { deriveDisplayStatus, statusBadgeColor } from "../types";
import { navigateTo, replaceRoute, parseHash } from "../../hashRouter";
import Markdown from "./Markdown";
import TimelineTab from "./TimelineTab";
import ArtifactsTab from "./ArtifactsTab";

const RUN_STATUS_COLORS: Record<string, string> = {
  running: "text-yellow-400",
  completed: "text-green-400",
  failed: "text-red-400",
};

type Tab = "overview" | "runs" | "artifacts" | "notes" | "live" | "timeline" | "red_team_brief";

const LIVE_JOB_STATUS_COLORS: Record<string, string> = {
  pending: "text-gray-400",
  running: "text-yellow-400",
  completed: "text-green-400",
  failed: "text-red-400",
  blocked: "text-red-400",
};

const TIMELINE_DOT_COLORS: Record<string, string> = {
  blocked: "bg-red-500",
  failed: "bg-red-500",
  error: "bg-red-500",
  completed: "bg-green-500",
  started: "bg-yellow-500",
  submitted: "bg-blue-500",
};

interface Props {
  experiment: ExperimentDetailType;
  onBack: () => void;
  onSelectNote: (noteId: string) => void;
  onRefresh: () => void;
}

/** Group notes by their directory path */
function groupNotesByDir(notes: ExperimentNote[]): Map<string, ExperimentNote[]> {
  const groups = new Map<string, ExperimentNote[]>();
  for (const note of notes) {
    const relPath = note.relative_path || note.filename || "";
    const dir = relPath.includes("/") ? relPath.substring(0, relPath.lastIndexOf("/")) : "(root)";
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(note);
  }
  // Sort directories
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const VALID_TABS = new Set<Tab>(["overview", "runs", "artifacts", "notes", "live", "timeline", "red_team_brief"]);

function getInitialTab(): Tab {
  const route = parseHash();
  const t = route.params.get("tab");
  if (t && VALID_TABS.has(t as Tab)) return t as Tab;
  return "overview";
}

export default function ExperimentDetail({ experiment, onBack, onSelectNote, onRefresh }: Props) {
  const [tab, _setTab] = useState<Tab>(getInitialTab);

  const setTab = useCallback((t: Tab) => {
    _setTab(t);
    const route = parseHash();
    const params = new URLSearchParams(route.params);
    if (t === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", t);
    }
    replaceRoute({ params });
  }, []);

  // Add run form
  const [showAddRun, setShowAddRun] = useState(false);
  const [runForm, setRunForm] = useState({ condition: "", model: "", cluster: "", hf_dataset: "", notes: "" });

  const handleAddRun = async () => {
    if (!runForm.condition) return;
    const { experimentsApi } = await import("../api");
    await experimentsApi.createRun(experiment.id, runForm);
    setRunForm({ condition: "", model: "", cluster: "", hf_dataset: "", notes: "" });
    setShowAddRun(false);
    onRefresh();
  };

  const handleDeleteRun = async (runId: string) => {
    const { experimentsApi } = await import("../api");
    await experimentsApi.deleteRun(experiment.id, runId);
    onRefresh();
  };

  const liveJobCount = Object.keys(experiment.live_jobs || {}).length;
  const isFinished = !!experiment.zayne_findings;

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    ...(experiment.red_team_brief
      ? [{ id: "red_team_brief" as Tab, label: "Red Team Brief" }]
      : []),
    ...(experiment.live_status || liveJobCount > 0
      ? [{ id: "live" as Tab, label: "Live Jobs", count: liveJobCount }]
      : []),
    { id: "timeline", label: "Timeline", count: experiment.activity_log?.length || 0 },
    { id: "runs", label: "Runs", count: experiment.runs?.length || 0 },
    { id: "artifacts", label: "Artifacts", count: experiment.artifacts?.length || experiment.hf_repos?.length || 0 },
    { id: "notes", label: "Files", count: experiment.experiment_notes?.length || 0 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            &larr; Experiments
          </button>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-200">{experiment.name}</h1>
              {isFinished && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-900 text-emerald-300 border border-emerald-700">
                  Finished
                </span>
              )}
              {experiment.live_status && !isFinished && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeColor(deriveDisplayStatus(experiment))}`}>
                  {deriveDisplayStatus(experiment).replace("_", " ")}
                </span>
              )}
            </div>
            {experiment.live_message && (
              <p className="text-xs text-cyan-400/80 mt-0.5">{experiment.live_message}</p>
            )}
            {experiment.zayne_summary ? (
              <div className="mt-1 max-w-2xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">Zayne's Summary</span>
                <p className="text-sm text-gray-300 mt-0.5">
                  {experiment.zayne_summary}
                </p>
              </div>
            ) : experiment.hypothesis?.statement ? (
              <p className="text-sm text-gray-400 mt-1 max-w-2xl italic">
                {experiment.hypothesis.statement}
              </p>
            ) : null}
          </div>
        </div>

        {/* Detail tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                tab === t.id
                  ? "bg-gray-800 text-gray-200 border border-gray-700 border-b-gray-800"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1 text-xs text-gray-500">({t.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "overview" && (
          <div className="space-y-4">
            {/* FINDINGS (above readme, only when filled) */}
            {experiment.zayne_findings && (
              <div className="border-l-4 border-emerald-500 bg-emerald-950/30 rounded-r p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Findings</span>
                <div className="mt-2">
                  <Markdown content={experiment.zayne_findings} />
                </div>
              </div>
            )}

            {/* Zayne's README */}
            {experiment.zayne_readme && (
              <div className="border-l-4 border-amber-500 bg-gray-900/80 rounded-r p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Zayne's README</span>
                <div className="mt-2">
                  <Markdown content={experiment.zayne_readme} />
                </div>
              </div>
            )}

            {/* DECISIONS (below readme, only when filled) */}
            {experiment.zayne_decisions && (
              <div className="border-l-4 border-violet-500 bg-violet-950/30 rounded-r p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Decisions</span>
                <div className="mt-2">
                  <Markdown content={experiment.zayne_decisions} />
                </div>
              </div>
            )}

            {/* Agent Notes (EXPERIMENT_README) - only if no zayne_readme */}
            {!experiment.zayne_readme && experiment.notes && (
              <div className="border-l-4 border-cyan-500 bg-gray-900/80 rounded-r p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Claude Code: Experiment Notes</span>
                <div className="mt-2">
                  <Markdown content={experiment.notes} />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "runs" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-medium text-gray-300">Run History</h2>
              <button
                onClick={() => setShowAddRun(true)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium px-2.5 py-1 rounded transition-colors"
              >
                + Add Run
              </button>
            </div>

            {showAddRun && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Condition" value={runForm.condition} onChange={(e) => setRunForm({ ...runForm, condition: e.target.value })}
                    className="bg-gray-900 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 outline-none" />
                  <input placeholder="Model" value={runForm.model} onChange={(e) => setRunForm({ ...runForm, model: e.target.value })}
                    className="bg-gray-900 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 outline-none" />
                  <input placeholder="Cluster" value={runForm.cluster} onChange={(e) => setRunForm({ ...runForm, cluster: e.target.value })}
                    className="bg-gray-900 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 outline-none" />
                  <input placeholder="HF Dataset" value={runForm.hf_dataset} onChange={(e) => setRunForm({ ...runForm, hf_dataset: e.target.value })}
                    className="bg-gray-900 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 outline-none" />
                </div>
                <input placeholder="Notes" value={runForm.notes} onChange={(e) => setRunForm({ ...runForm, notes: e.target.value })}
                  className="w-full mt-2 bg-gray-900 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 outline-none" />
                <div className="flex gap-2 justify-end mt-2">
                  <button onClick={() => setShowAddRun(false)} className="text-gray-400 text-xs px-2 py-1">Cancel</button>
                  <button onClick={handleAddRun} className="bg-cyan-600 text-white text-xs px-2.5 py-1 rounded">Add</button>
                </div>
              </div>
            )}

            {(experiment.runs || []).length === 0 ? (
              <p className="text-sm text-gray-500">No runs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                      <th className="text-left py-2 px-2">Condition</th>
                      <th className="text-left py-2 px-2">Model</th>
                      <th className="text-left py-2 px-2">Cluster</th>
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Metrics</th>
                      <th className="text-left py-2 px-2">HF Dataset</th>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...experiment.runs].reverse().map((run) => (
                      <tr key={run.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-2 text-gray-300">{run.condition || "-"}</td>
                        <td className="py-2 px-2 text-gray-400">{run.model || "-"}</td>
                        <td className="py-2 px-2 text-gray-400">{run.cluster || "-"}</td>
                        <td className={`py-2 px-2 ${RUN_STATUS_COLORS[run.status] || "text-gray-400"}`}>{run.status}</td>
                        <td className="py-2 px-2 text-gray-400 font-mono text-xs">
                          {Object.keys(run.metrics || {}).length > 0
                            ? Object.entries(run.metrics).map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(3) : v}`).join(", ")
                            : "-"}
                        </td>
                        <td className="py-2 px-2">
                          {run.hf_dataset ? (
                            <a
                              href={`https://huggingface.co/datasets/${run.hf_dataset}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-xs"
                            >
                              {run.hf_dataset.split("/").pop()}
                            </a>
                          ) : "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-500 text-xs">
                          {run.timestamp ? new Date(run.timestamp).toLocaleDateString() : "-"}
                        </td>
                        <td className="py-2 px-2">
                          <button
                            onClick={() => handleDeleteRun(run.id)}
                            className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "artifacts" && (
          <ArtifactsTab
            artifacts={experiment.artifacts || []}
            hfRepos={experiment.hf_repos || []}
            runs={experiment.runs || []}
            onOpenArtifact={(artifact: Artifact) => {
              const INLINE_TYPES = new Set(["table", "yaml_config", "plotly", "image"]);
              if (!artifact.visualizer_type || INLINE_TYPES.has(artifact.visualizer_type)) {
                return;
              }
              const vizTabMap: Record<string, string> = {
                model_trace: "model",
                arena: "arena",
                rlm: "rlm",
                rlm_eval: "rlm-eval",
                "rlm-eval": "rlm-eval",
                harbor: "harbor",
                adaevolve: "adaevolve",
                ttt_discover: "ttt-discover",
                "ttt-discover": "ttt-discover",
              };
              const vizTab = vizTabMap[artifact.visualizer_type];
              if (vizTab) {
                const fullName = artifact.dataset_name.includes("/")
                  ? artifact.dataset_name
                  : `${HF_ORG}/${artifact.dataset_name}`;
                navigateTo({
                  page: "viz",
                  tab: vizTab,
                  params: new URLSearchParams({
                    repos: fullName,
                    from_exp: experiment.id,
                  }),
                });
              }
            }}
          />
        )}

        {tab === "red_team_brief" && experiment.red_team_brief && (
          <div>
            <div className="border-l-4 border-cyan-500 bg-gray-900/80 rounded-r p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-red-400 text-lg">&#9888;</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Claude Code: Red Team Brief</span>
              </div>
              <Markdown content={experiment.red_team_brief} />
            </div>
          </div>
        )}

        {tab === "notes" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-medium text-gray-300">Project Files</h2>
              <span className="text-xs text-gray-500">
                {experiment.experiment_notes?.length || 0} files
              </span>
            </div>

            {(experiment.experiment_notes || []).length === 0 ? (
              <p className="text-sm text-gray-500">No project files found.</p>
            ) : (
              <div className="space-y-4">
                {[...groupNotesByDir(experiment.experiment_notes)].map(([dir, files]) => (
                  <div key={dir}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-cyan-400/70 font-mono">{dir}/</span>
                      <span className="text-xs text-gray-600">({files.length})</span>
                    </div>
                    <div className="grid gap-1 ml-3">
                      {files.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => onSelectNote(note.id)}
                          className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded px-3 py-2 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                {note.filename.endsWith(".yaml") || note.filename.endsWith(".yml") ? "&#9881;" : "&#9776;"}
                              </span>
                              <span className="text-sm text-gray-300 group-hover:text-gray-200 font-mono">
                                {note.filename}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "timeline" && (
          <TimelineTab
            entries={experiment.activity_log || []}
            onArtifactClick={(datasetName) => console.log("artifact clicked:", datasetName)}
          />
        )}

        {tab === "live" && (
          <div className="space-y-6">
            {/* Unreachable clusters warning */}
            {experiment.unreachable_clusters && Object.keys(experiment.unreachable_clusters).length > 0 && (
              <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-orange-400 uppercase tracking-wide mb-2">Unreachable Clusters</h3>
                <div className="space-y-1">
                  {Object.entries(experiment.unreachable_clusters).map(([cluster, info]) => (
                    <div key={cluster} className="flex items-center justify-between text-sm">
                      <span className="text-orange-300 font-medium">{cluster}</span>
                      <span className="text-orange-400/70 text-xs">
                        {info.reason} (since {new Date(info.since).toLocaleString()})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Jobs table */}
            <div>
              <h2 className="text-sm font-medium text-gray-300 mb-3">Active Jobs</h2>
              {liveJobCount === 0 ? (
                <p className="text-sm text-gray-500">No live jobs tracked.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                        <th className="text-left py-2 px-2">ID</th>
                        <th className="text-left py-2 px-2">Cluster</th>
                        <th className="text-left py-2 px-2">GPUs</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Message</th>
                        <th className="text-left py-2 px-2">ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(experiment.live_jobs || {}).map(([jobId, job]) => (
                        <tr
                          key={jobId}
                          className={`border-b border-gray-800/50 ${
                            job.status === "blocked" ? "bg-red-900/10" :
                            job.status === "failed" ? "bg-red-900/10" :
                            "hover:bg-gray-900/50"
                          }`}
                        >
                          <td className="py-2 px-2 text-gray-300 font-mono text-xs">
                            {jobId}
                            {job.slurm_job_id && (
                              <span className="text-gray-600 ml-1">({job.slurm_job_id})</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-400">
                            {job.cluster}
                            {job.partition && (
                              <span className="text-gray-600 text-xs ml-1">/{job.partition}</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-400">{job.gpus}</td>
                          <td className={`py-2 px-2 font-medium ${LIVE_JOB_STATUS_COLORS[job.status] || "text-gray-400"}`}>
                            {job.status}
                            {job.blocker && (
                              <span className="text-red-400/70 text-xs ml-1">
                                ({job.blocker.reason})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-400 text-xs max-w-xs truncate">
                            {job.message || "-"}
                          </td>
                          <td className="py-2 px-2 text-gray-500 text-xs">
                            {job.estimated_completion
                              ? new Date(job.estimated_completion).toLocaleString()
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Job metrics summary */}
            {liveJobCount > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-300 mb-3">Job Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(experiment.live_jobs || {}).map(([jobId, job]) =>
                    Object.keys(job.metrics || {}).length > 0 ? (
                      <div key={jobId} className="bg-gray-900 rounded p-3 border border-gray-800">
                        <span className="text-xs text-gray-500 font-mono">{jobId}</span>
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(job.metrics).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                              <span className="text-gray-400">{k}</span>
                              <span className="text-gray-300 font-mono">
                                {typeof v === "number" ? v.toFixed(3) : v}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h2 className="text-sm font-medium text-gray-300 mb-3">Event Timeline</h2>
              {(!experiment.live_history || experiment.live_history.length === 0) ? (
                <p className="text-sm text-gray-500">No timeline events recorded.</p>
              ) : (
                <div className="space-y-0">
                  {experiment.live_history.slice(-10).reverse().map((entry, i) => {
                    const eventLower = entry.event.toLowerCase();
                    const dotColor =
                      TIMELINE_DOT_COLORS[eventLower] ||
                      (eventLower.includes("block") || eventLower.includes("fail") || eventLower.includes("error")
                        ? "bg-red-500"
                        : "bg-gray-500");
                    return (
                      <div key={i} className="flex items-start gap-3 py-2 border-l-2 border-gray-800 pl-4 relative">
                        <div className={`absolute -left-[5px] top-3 w-2 h-2 rounded-full ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-300">{entry.event}</span>
                            {entry.cluster && (
                              <span className="text-xs text-gray-500">{entry.cluster}</span>
                            )}
                            {entry.job_id && (
                              <span className="text-xs text-gray-600 font-mono">{entry.job_id}</span>
                            )}
                          </div>
                          {entry.message && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.message}</p>
                          )}
                          <span className="text-xs text-gray-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Timestamps */}
            {(experiment.live_started_at || experiment.live_updated_at) && (
              <div className="flex gap-6 text-xs text-gray-600 border-t border-gray-800 pt-3">
                {experiment.live_started_at && (
                  <span>Started: {new Date(experiment.live_started_at).toLocaleString()}</span>
                )}
                {experiment.live_updated_at && (
                  <span>Last update: {new Date(experiment.live_updated_at).toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
