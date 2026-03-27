export interface DatasetInfo {
  id: string;
  repo: string;
  name: string;
  column: string;
  columns: string[];
  split: string;
  promptColumn: string | null;
  n_rows: number;
  n_samples: number;
  active: boolean;
  questionFingerprint: string;
  presetId?: string;
  presetName?: string;
}

export interface TraceAnalysis {
  total_len: number;
  think_len: number;
  answer_len: number;
  backtracks: number;
  restarts: number;
  think_text: string;
  answer_text: string;
}

export interface QuestionData {
  question: string;
  prompt_text: string;
  responses: string[];
  eval_correct: boolean[];
  extractions: string[];
  metadata: Record<string, unknown>;
  analyses: TraceAnalysis[];
  n_samples: number;
  index: number;
}

export interface DatasetSummary {
  n_rows: number;
  n_samples: number;
  has_eval: boolean;
  sample_accuracy?: { correct: number; total: number; rate: number };
  pass_at?: Record<number, { correct: number; total: number; rate: number }>;
}

export interface Preset {
  id: string;
  name: string;
  repo: string;
  column: string;
  split?: string;
}

export type FilterMode = "all" | "improvements" | "regressions" | "both-correct" | "both-wrong";
