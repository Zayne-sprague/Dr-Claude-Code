import type { DatasetInfo, QuestionData, DatasetSummary, Preset } from "./types";

const BASE = "/api/model";
const PRESETS_BASE = "/api/presets/model";

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  loadDataset(repo: string, column?: string, split?: string, promptColumn?: string) {
    return fetchJSON<DatasetInfo & { columns: string[]; question_fingerprint: string }>(`${BASE}/datasets/load`, {
      method: "POST",
      body: JSON.stringify({ repo, column, split, prompt_column: promptColumn }),
    });
  },

  listDatasets() {
    return fetchJSON<DatasetInfo[]>(`${BASE}/datasets/`);
  },

  getQuestion(dsId: string, idx: number) {
    return fetchJSON<QuestionData>(`${BASE}/datasets/${dsId}/question/${idx}`);
  },

  getSummary(dsId: string) {
    return fetchJSON<DatasetSummary>(`${BASE}/datasets/${dsId}/summary`);
  },

  unloadDataset(dsId: string) {
    return fetchJSON<{ status: string }>(`${BASE}/datasets/${dsId}`, { method: "DELETE" });
  },

  listPresets() {
    return fetchJSON<Preset[]>(`${PRESETS_BASE}`);
  },

  createPreset(name: string, repo: string, column: string, split?: string) {
    return fetchJSON<Preset>(`${PRESETS_BASE}`, {
      method: "POST",
      body: JSON.stringify({ name, repo, column, split }),
    });
  },

  updatePreset(id: string, updates: { name?: string; column?: string; split?: string }) {
    return fetchJSON<Preset>(`${PRESETS_BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },

  deletePreset(id: string) {
    return fetchJSON<{ status: string }>(`${PRESETS_BASE}/${id}`, { method: "DELETE" });
  },
};
