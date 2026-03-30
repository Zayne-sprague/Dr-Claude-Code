import { useState, useCallback, useEffect, useMemo } from "react";
import type { DatasetInfo, QuestionData, Preset, FilterMode } from "./types";
import { api } from "./api";
import { parseHash, replaceRoute } from "../hashRouter";

interface GroupIndices {
  questionIdx: number;
  sampleIdx: number;
}

export function useAppState() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [questionDataMap, setQuestionDataMap] = useState<Record<string, QuestionData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Per-group navigation indices
  const [groupIndices, setGroupIndices] = useState<Record<string, GroupIndices>>({});
  // Which group is currently displayed (fingerprint)
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  // Load presets on mount
  useEffect(() => {
    api.listPresets().then(setPresets).catch(() => {});
  }, []);

  // Sync URL state on mount (read from hash params) — q/s/filter only, repos loaded below
  useEffect(() => {
    const route = parseHash();
    const params = route.params;
    const q = parseInt(params.get("q") || "0");
    const s = parseInt(params.get("s") || "0");
    const f = (params.get("filter") || "all") as FilterMode;
    setFilter(f);
    // q and s will be applied once the first group is set
    if (!isNaN(q) || !isNaN(s)) {
      // Store initial URL indices to apply to first group loaded
      (window as unknown as Record<string, unknown>).__initialQ = isNaN(q) ? 0 : q;
      (window as unknown as Record<string, unknown>).__initialS = isNaN(s) ? 0 : s;
    }
  }, []);

  // Derive groups from datasets by fingerprint
  const groups = useMemo(() => {
    const map: Record<string, DatasetInfo[]> = {};
    for (const ds of datasets) {
      const fp = ds.questionFingerprint;
      if (!map[fp]) map[fp] = [];
      map[fp].push(ds);
    }
    return map;
  }, [datasets]);

  const groupIds = useMemo(() => Object.keys(groups).sort(), [groups]);

  // Auto-set currentGroupId if not set or invalid
  useEffect(() => {
    if (currentGroupId && groups[currentGroupId]) return;
    // Pick first group that has active datasets, or first group overall
    const activeGroup = groupIds.find(gid => groups[gid].some(d => d.active));
    if (activeGroup) {
      setCurrentGroupId(activeGroup);
    } else if (groupIds.length > 0) {
      setCurrentGroupId(groupIds[0]);
    } else {
      setCurrentGroupId(null);
    }
  }, [groupIds, groups, currentGroupId]);

  // Active datasets = active datasets in current group
  const activeDatasets = useMemo(
    () => datasets.filter(d => d.active && d.questionFingerprint === currentGroupId),
    [datasets, currentGroupId]
  );

  // Panel ordering: track display order of active dataset IDs
  const [panelOrder, setPanelOrder] = useState<string[]>([]);

  // Keep panelOrder in sync with activeDatasets: add new IDs at end, remove stale ones
  useEffect(() => {
    const activeIds = new Set(activeDatasets.map(d => d.id));
    setPanelOrder(prev => {
      const kept = prev.filter(id => activeIds.has(id));
      const newIds = activeDatasets.map(d => d.id).filter(id => !prev.includes(id));
      const merged = [...kept, ...newIds];
      // Only update if changed to avoid unnecessary renders
      if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) return prev;
      return merged;
    });
  }, [activeDatasets]);

  // Ordered active datasets according to panelOrder
  const orderedActiveDatasets = useMemo(() => {
    const map = new Map(activeDatasets.map(d => [d.id, d]));
    return panelOrder.map(id => map.get(id)).filter((d): d is DatasetInfo => d !== undefined);
  }, [activeDatasets, panelOrder]);

  const reorderPanels = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setPanelOrder(prev => {
      const order = [...prev];
      const fromIdx = order.indexOf(fromId);
      const toIdx = order.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromId);
      return order;
    });
  }, []);

  // Current group's indices
  const currentIndices = currentGroupId ? groupIndices[currentGroupId] : undefined;
  const questionIdx = currentIndices?.questionIdx ?? 0;
  const sampleIdx = currentIndices?.sampleIdx ?? 0;

  const setQuestionIdx = useCallback((val: number | ((prev: number) => number)) => {
    if (!currentGroupId) return;
    setGroupIndices(prev => {
      const cur = prev[currentGroupId] ?? { questionIdx: 0, sampleIdx: 0 };
      const newQ = typeof val === "function" ? val(cur.questionIdx) : val;
      return { ...prev, [currentGroupId]: { ...cur, questionIdx: newQ } };
    });
  }, [currentGroupId]);

  const setSampleIdx = useCallback((val: number | ((prev: number) => number)) => {
    if (!currentGroupId) return;
    setGroupIndices(prev => {
      const cur = prev[currentGroupId] ?? { questionIdx: 0, sampleIdx: 0 };
      const newS = typeof val === "function" ? val(cur.sampleIdx) : val;
      return { ...prev, [currentGroupId]: { ...cur, sampleIdx: newS } };
    });
  }, [currentGroupId]);

  // Update hash params when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    const activeRepos = datasets.filter((d) => d.active);
    if (activeRepos.length > 0) {
      params.set("repos", activeRepos.map((d) => d.repo).join(","));
      params.set("cols", activeRepos.map((d) => d.column).join(","));
      params.set("pcols", activeRepos.map((d) => d.promptColumn || "formatted_prompt").join(","));
    }
    params.set("q", String(questionIdx));
    params.set("s", String(sampleIdx));
    if (filter !== "all") params.set("filter", filter);
    if (currentGroupId) params.set("group", currentGroupId);
    replaceRoute({ params });
  }, [datasets, questionIdx, sampleIdx, filter, currentGroupId]);

  // Fetch question data for active datasets in current group when question changes
  useEffect(() => {
    activeDatasets.forEach((ds) => {
      const key = `${ds.id}:${questionIdx}`;
      if (!questionDataMap[key]) {
        api.getQuestion(ds.id, questionIdx).then((data) => {
          setQuestionDataMap((prev) => ({ ...prev, [key]: data }));
        }).catch(() => {});
      }
    });
  }, [questionIdx, activeDatasets]);

  const addDataset = useCallback(async (
    repo: string, column?: string, split?: string, promptColumn?: string,
    presetId?: string, presetName?: string,
  ) => {
    setLoading((prev) => ({ ...prev, [repo]: true }));
    setError(null);
    try {
      const { question_fingerprint, ...rest } = await api.loadDataset(repo, column, split, promptColumn);
      const fp = question_fingerprint ?? "";
      const dsInfo: DatasetInfo = {
        ...rest,
        questionFingerprint: fp,
        active: true,
        presetId,
        presetName,
      };

      setDatasets((prev) => {
        if (prev.some((d) => d.id === dsInfo.id)) return prev;
        return [...prev, dsInfo];
      });

      // Initialize group indices if new group, or inherit existing
      setGroupIndices(prev => {
        if (prev[fp]) return prev; // Group already exists, new repo inherits its indices
        // New group — check for initial URL params or start at 0
        const win = window as unknown as Record<string, unknown>;
        const initQ = typeof win.__initialQ === "number" ? win.__initialQ : 0;
        const initS = typeof win.__initialS === "number" ? win.__initialS : 0;
        // Only use initial params for the very first group
        const isFirstGroup = Object.keys(prev).length === 0;
        return {
          ...prev,
          [fp]: { questionIdx: isFirstGroup ? initQ : 0, sampleIdx: isFirstGroup ? initS : 0 },
        };
      });

      // Switch to the new dataset's group
      setCurrentGroupId(fp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dataset");
    } finally {
      setLoading((prev) => ({ ...prev, [repo]: false }));
    }
  }, []);

  // Auto-load repos from URL (must be after addDataset declaration)
  useEffect(() => {
    const { params } = parseHash();
    const repoList = params.get("repos")?.split(",").filter(Boolean) || [];
    const colList = params.get("cols")?.split(",") || [];
    const pcolList = params.get("pcols")?.split(",") || [];
    for (let i = 0; i < repoList.length; i++) {
      addDataset(repoList[i], colList[i] || undefined, undefined, pcolList[i] || undefined);
    }
  }, [addDataset]);

  const removeDataset = useCallback(async (id: string) => {
    await api.unloadDataset(id).catch(() => {});
    setDatasets((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const toggleDataset = useCallback((id: string) => {
    setDatasets((prev) => {
      const updated = prev.map((d) => (d.id === id ? { ...d, active: !d.active } : d));
      // If toggling ON a dataset from a different group, switch to that group
      const toggled = updated.find(d => d.id === id);
      if (toggled && toggled.active) {
        setCurrentGroupId(toggled.questionFingerprint);
      }
      return updated;
    });
  }, []);

  const updateDatasetPresetName = useCallback((dsId: string, name: string) => {
    setDatasets(prev => prev.map(d => d.id === dsId ? { ...d, presetName: name } : d));
  }, []);

  const clearDatasetPreset = useCallback((dsId: string) => {
    setDatasets(prev => prev.map(d => d.id === dsId ? { ...d, presetId: undefined, presetName: undefined } : d));
  }, []);

  const maxQuestions = Math.min(...activeDatasets.map((d) => d.n_rows), Infinity);
  const maxSamples = Math.max(...activeDatasets.map((d) => d.n_samples), 0);

  const getQuestionData = (dsId: string): QuestionData | undefined => {
    return questionDataMap[`${dsId}:${questionIdx}`];
  };

  return {
    datasets, presets, setPresets,
    questionIdx, setQuestionIdx,
    sampleIdx, setSampleIdx,
    filter, setFilter,
    loading, error, setError,
    activeDatasets, orderedActiveDatasets, maxQuestions, maxSamples,
    addDataset, removeDataset, toggleDataset,
    updateDatasetPresetName, clearDatasetPreset,
    getQuestionData, reorderPanels,
    // Group state
    groups, groupIds, currentGroupId, setCurrentGroupId,
  };
}
