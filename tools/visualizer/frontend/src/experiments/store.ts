import { useState, useCallback, useEffect } from "react";
import type { Experiment, ExperimentDetail, SubExperiment, ExperimentNote } from "./types";
import { experimentsApi } from "./api";
import { parseHash, navigateTo as hashNavigateTo } from "../hashRouter";

export type View =
  | { kind: "list" }
  | { kind: "detail"; expId: string }
  | { kind: "sub"; expId: string; subId: string }
  | { kind: "note"; expId: string; noteId: string }
  | { kind: "summary" };

export function useExperimentsState() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [currentDetail, setCurrentDetail] = useState<ExperimentDetail | null>(null);
  const [currentSub, setCurrentSub] = useState<SubExperiment | null>(null);
  const [currentNote, setCurrentNote] = useState<ExperimentNote | null>(null);
  const [summaryContent, setSummaryContent] = useState<string>("");
  const [view, setView] = useState<View>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await experimentsApi.list();
      setExperiments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore a view from hash segments (no hash update — used on mount and popstate)
  const restoreFromSegments = useCallback(async (segments: string[]) => {
    if (segments.length === 0) {
      setView({ kind: "list" });
      setCurrentDetail(null);
      setCurrentSub(null);
      setCurrentNote(null);
      await loadExperiments();
      return;
    }

    if (segments[0] === "summary") {
      setLoading(true);
      setError(null);
      try {
        const data = await experimentsApi.getSummary();
        setSummaryContent(data.content_md || "");
        setView({ kind: "summary" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load summary");
      } finally {
        setLoading(false);
      }
      return;
    }

    const expId = segments[0];
    setLoading(true);
    setError(null);
    try {
      const detail = await experimentsApi.get(expId);
      setCurrentDetail(detail);

      if (segments[1] === "sub" && segments[2]) {
        const sub = detail.sub_experiments.find((s: SubExperiment) => s.id === segments[2]);
        if (sub) {
          setCurrentSub(sub);
          setView({ kind: "sub", expId, subId: segments[2] });
          return;
        }
      }

      if (segments[1] === "note" && segments[2]) {
        const note = (detail.experiment_notes || []).find((n: ExperimentNote) => n.id === segments[2]);
        if (note) {
          setCurrentNote(note);
          setView({ kind: "note", expId, noteId: segments[2] });
          return;
        }
      }

      setView({ kind: "detail", expId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiment");
    } finally {
      setLoading(false);
    }
  }, [loadExperiments]);

  // Restore from hash on mount
  useEffect(() => {
    const route = parseHash();
    if (route.page === "experiments" && route.segments.length > 0) {
      restoreFromSegments(route.segments);
    } else {
      loadExperiments();
    }
  }, [restoreFromSegments, loadExperiments]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      const route = parseHash();
      if (route.page !== "experiments") return;
      restoreFromSegments(route.segments);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [restoreFromSegments]);

  const navigateToList = useCallback(() => {
    setView({ kind: "list" });
    setCurrentDetail(null);
    setCurrentSub(null);
    setCurrentNote(null);
    loadExperiments();
    hashNavigateTo({ page: "experiments", segments: [], params: new URLSearchParams() });
  }, [loadExperiments]);

  const navigateToDetail = useCallback(async (expId: string) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await experimentsApi.get(expId);
      setCurrentDetail(detail);
      setView({ kind: "detail", expId });
      hashNavigateTo({ page: "experiments", segments: [expId], params: new URLSearchParams() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiment");
    } finally {
      setLoading(false);
    }
  }, []);

  const navigateToSub = useCallback((expId: string, subId: string) => {
    if (!currentDetail) return;
    const sub = currentDetail.sub_experiments.find((s: SubExperiment) => s.id === subId);
    if (sub) {
      setCurrentSub(sub);
      setView({ kind: "sub", expId, subId });
      hashNavigateTo({ page: "experiments", segments: [expId, "sub", subId] });
    }
  }, [currentDetail]);

  const navigateToNote = useCallback((expId: string, noteId: string) => {
    if (!currentDetail) return;
    const note = (currentDetail.experiment_notes || []).find((n: ExperimentNote) => n.id === noteId);
    if (note) {
      setCurrentNote(note);
      setView({ kind: "note", expId, noteId });
      hashNavigateTo({ page: "experiments", segments: [expId, "note", noteId] });
    }
  }, [currentDetail]);

  const navigateToSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await experimentsApi.getSummary();
      setSummaryContent(data.content_md || "");
      setView({ kind: "summary" });
      hashNavigateTo({ page: "experiments", segments: ["summary"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (view.kind === "detail" || view.kind === "sub" || view.kind === "note") {
      const expId = view.expId;
      try {
        const detail = await experimentsApi.get(expId);
        setCurrentDetail(detail);
      } catch {
        // silent refresh failure
      }
    }
  }, [view]);

  return {
    experiments,
    currentDetail,
    currentSub,
    currentNote,
    summaryContent,
    view,
    loading,
    error,
    setError,
    navigateToList,
    navigateToDetail,
    navigateToSub,
    navigateToNote,
    navigateToSummary,
    refreshDetail,
    loadExperiments,
  };
}
