import type { Experiment, ExperimentDetail, RunRecord, SubExperiment, ExperimentNote, ActivityLogEntry, Artifact } from "./types";

const BASE = "/api/experiments";

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

export const experimentsApi = {
  list() {
    return fetchJSON<Experiment[]>(`${BASE}/`);
  },

  get(id: string) {
    return fetchJSON<ExperimentDetail>(`${BASE}/${id}`);
  },

  create(data: Partial<Experiment>) {
    return fetchJSON<Experiment>(`${BASE}/`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: Partial<Experiment>) {
    return fetchJSON<Experiment>(`${BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(id: string) {
    return fetchJSON<{ status: string }>(`${BASE}/${id}`, { method: "DELETE" });
  },

  createRun(expId: string, data: Partial<RunRecord>) {
    return fetchJSON<RunRecord>(`${BASE}/${expId}/runs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateRun(expId: string, runId: string, data: Partial<RunRecord>) {
    return fetchJSON<RunRecord>(`${BASE}/${expId}/runs/${runId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteRun(expId: string, runId: string) {
    return fetchJSON<{ status: string }>(`${BASE}/${expId}/runs/${runId}`, { method: "DELETE" });
  },

  createSub(expId: string, data: Partial<SubExperiment>) {
    return fetchJSON<SubExperiment>(`${BASE}/${expId}/subs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateSub(expId: string, subId: string, data: Partial<SubExperiment>) {
    return fetchJSON<SubExperiment>(`${BASE}/${expId}/subs/${subId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteSub(expId: string, subId: string) {
    return fetchJSON<{ status: string }>(`${BASE}/${expId}/subs/${subId}`, { method: "DELETE" });
  },

  // Notes
  createNote(expId: string, data: Partial<ExperimentNote>) {
    return fetchJSON<ExperimentNote>(`${BASE}/${expId}/notes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateNote(expId: string, noteId: string, data: Partial<ExperimentNote>) {
    return fetchJSON<ExperimentNote>(`${BASE}/${expId}/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteNote(expId: string, noteId: string) {
    return fetchJSON<{ status: string }>(`${BASE}/${expId}/notes/${noteId}`, { method: "DELETE" });
  },

  sync() {
    return fetchJSON<{ status: string }>(`${BASE}/sync`, { method: "POST" });
  },

  getSummary() {
    return fetchJSON<{ content_md: string; updated: string }>(`${BASE}/summary`);
  },

  getActivityLog(expId: string, filters?: { scope?: string; type?: string }) {
    const params = new URLSearchParams();
    if (filters?.scope) params.set("scope", filters.scope);
    if (filters?.type) params.set("type", filters.type);
    const qs = params.toString();
    return fetchJSON<ActivityLogEntry[]>(`${BASE}/${expId}/activity-log${qs ? `?${qs}` : ""}`);
  },

  getArtifacts(expId: string) {
    return fetchJSON<Artifact[]>(`${BASE}/${expId}/artifacts`);
  },
};
