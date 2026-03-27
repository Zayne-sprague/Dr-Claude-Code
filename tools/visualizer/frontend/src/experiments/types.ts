export interface HfRepo {
  repo: string;
  description: string;
  date: string;
}

// --- Live dashboard state types ---

export interface LiveJobState {
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  cluster: string;
  gpus: number;
  partition?: string;
  slurm_job_id?: string;
  submitted_at: string;
  updated_at: string;
  estimated_completion?: string;
  message: string;
  metrics: Record<string, number | string>;
  blocker?: { reason: string; since: string };
}

export interface LiveHistoryEntry {
  timestamp: string;
  event: string;
  job_id?: string;
  cluster?: string;
  message: string;
}

export interface UnreachableClusterInfo {
  reason: string;
  since: string;
}

export type LiveStatus = "active" | "paused" | "completed" | "idle";
export type DisplayStatus = "active" | "blocked" | "partially_blocked" | "paused" | "completed" | "unreachable" | "idle";

export interface Hypothesis {
  statement: string;
  type: "comparative" | "ablation" | "exploration" | "reproduction";
  status: "pending" | "active" | "supported" | "invalidated" | "inconclusive" | "exploring";
  success_criteria: string;
}

export type Stage = "idea" | "planned" | "active" | "concluded" | "inconclusive";

export interface Experiment {
  id: string;
  name: string;
  research_project: string;
  hypothesis: Hypothesis;
  stage: Stage;
  completeness: number;
  models: string[];
  tasks: string[];
  tags: string[];
  hf_repos: HfRepo[];
  wandb_url: string;
  notes: string;
  zayne_summary: string;
  zayne_readme: string;
  zayne_findings: string;
  zayne_decisions: string;
  red_team_brief: string;
  created: string;
  updated: string;
  run_count?: number;
  sub_count?: number;
  note_count?: number;
  // Live dashboard state (merged from dashboard_state.json)
  live_status?: LiveStatus;
  live_message?: string;
  live_jobs?: Record<string, LiveJobState>;
  unreachable_clusters?: Record<string, UnreachableClusterInfo>;
  live_history?: LiveHistoryEntry[];
  live_started_at?: string;
  live_updated_at?: string;
}

export interface RunRecord {
  id: string;
  experiment_id: string;
  condition: string;
  model: string;
  cluster: string;
  status: "running" | "completed" | "failed";
  hf_dataset: string;
  metrics: Record<string, number | string>;
  timestamp: string;
  notes: string;
}

export interface SubExperiment {
  id: string;
  experiment_id: string;
  name: string;
  hypothesis: string;
  status: string;
  content_md: string;
  hf_repos: HfRepo[];
  created: string;
  updated: string;
}

export interface ExperimentNote {
  id: string;
  experiment_id: string;
  title: string;
  filename: string;
  relative_path: string;
  content_md: string;
  created: string;
  updated: string;
}

// --- Activity Log types ---

export type ActivityEntryType = "action" | "result" | "note" | "milestone";

export interface ActivityLogEntry {
  timestamp: string;
  scope: string;
  type: ActivityEntryType;
  message: string;
  artifacts: string[];
  run_ids: string[];
  author: "agent" | "user";
}

// --- Artifact types ---

export type ArtifactType =
  | "input_data"
  | "inference_output"
  | "training_config"
  | "canary_output"
  | "eval_result"
  | "processed_data";

export type VisualizerType =
  | "model_trace"
  | "arena"
  | "rlm"
  | "rlm_eval"
  | "harbor"
  | "adaevolve"
  | "ttt_discover"
  | "table"
  | "yaml_config"
  | "plotly"
  | "image"
  | "custom";

export interface Artifact {
  dataset_name: string;
  experiment_id: string;
  run_id: string | null;
  artifact_type: ArtifactType | null;
  visualizer_type: VisualizerType | null;
  artifact_group: string | null;
  parent_artifact: string | null;
  size_bytes: number | null;
  description: string;
  model: string;
  tags: string;
  created: string;
  updated: string;
}

export interface ExperimentDetail extends Experiment {
  runs: RunRecord[];
  sub_experiments: SubExperiment[];
  experiment_notes: ExperimentNote[];
  activity_log: ActivityLogEntry[];
  artifacts: Artifact[];
}

// --- Display status derivation ---

export function deriveDisplayStatus(exp: Experiment): DisplayStatus {
  if (exp.live_status === "completed") return "completed";
  if (exp.live_status === "paused") return "paused";
  const jobs = Object.values(exp.live_jobs || {});
  const hasUnreachable = Object.keys(exp.unreachable_clusters || {}).length > 0;
  const runningJobs = jobs.filter((j) => j.status === "running");
  const blockedJobs = jobs.filter((j) => j.status === "blocked");
  if (hasUnreachable && runningJobs.length === 0) return "unreachable";
  if (blockedJobs.length > 0 && blockedJobs.length === jobs.length) return "blocked";
  if (blockedJobs.length > 0 && runningJobs.length > 0) return "partially_blocked";
  if (exp.live_status === "active" || runningJobs.length > 0) return "active";
  return "idle";
}

export function statusBadgeColor(status: DisplayStatus): string {
  const colors: Record<DisplayStatus, string> = {
    active: "bg-green-100 text-green-800",
    blocked: "bg-red-100 text-red-800",
    partially_blocked: "bg-orange-100 text-orange-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    unreachable: "bg-gray-200 text-orange-700",
    idle: "bg-gray-100 text-gray-500",
  };
  return colors[status];
}
