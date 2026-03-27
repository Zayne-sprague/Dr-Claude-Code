import { useEffect, useCallback, useRef, useState } from "react";
import { useAppState } from "./store";
import Sidebar from "./components/Sidebar";
import TracePanel, { type DragHandleProps } from "./components/TracePanel";
import InfoBar from "./components/InfoBar";
import QuestionNav from "./components/QuestionNav";
import type { DatasetInfo, QuestionData, Preset } from "./types";
import { api } from "./api";

export default function ModelApp() {
  const state = useAppState();

  const handleLoadPreset = useCallback(async (preset: Preset) => {
    await state.addDataset(preset.repo, preset.column, preset.split, undefined, preset.id, preset.name);
  }, [state.addDataset]);

  const handleSavePreset = useCallback(async (name: string, repo: string, column: string, split?: string) => {
    const preset = await api.createPreset(name, repo, column, split);
    state.setPresets((prev) => [...prev, preset]);
  }, []);

  const handleDeletePreset = useCallback(async (id: string, datasetId?: string) => {
    await api.deletePreset(id);
    state.setPresets((prev) => prev.filter((p) => p.id !== id));
    if (datasetId) {
      state.clearDatasetPreset(datasetId);
    }
  }, [state.clearDatasetPreset]);

  const handleUpdatePreset = useCallback(async (presetId: string, datasetId: string, updates: { name?: string }) => {
    const updated = await api.updatePreset(presetId, updates);
    state.setPresets(prev => prev.map(p => p.id === presetId ? updated : p));
    if (updates.name) {
      state.updateDatasetPresetName(datasetId, updates.name);
    }
  }, [state.updateDatasetPresetName]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "j":
          state.setQuestionIdx((prev) => Math.min(state.maxQuestions - 1, prev + 1));
          break;
        case "k":
          state.setQuestionIdx((prev) => Math.max(0, prev - 1));
          break;
        case "l":
          state.setSampleIdx((prev) => Math.min(state.maxSamples - 1, prev + 1));
          break;
        case "h":
          state.setSampleIdx((prev) => Math.max(0, prev - 1));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.maxQuestions, state.maxSamples, state.setQuestionIdx, state.setSampleIdx]);

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar
        datasets={state.datasets}
        presets={state.presets}
        loading={state.loading}
        groups={state.groups}
        groupIds={state.groupIds}
        currentGroupId={state.currentGroupId}
        onAddDataset={state.addDataset}
        onRemoveDataset={state.removeDataset}
        onToggleDataset={state.toggleDataset}
        onSetCurrentGroup={state.setCurrentGroupId}
        onLoadPreset={handleLoadPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        onUpdatePreset={handleUpdatePreset}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Error banner */}
        {state.error && (
          <div className="px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-300 text-sm flex items-center justify-between">
            <span>{state.error}</span>
            <button onClick={() => state.setError(null)} className="text-red-400 hover:text-red-300 ml-2">
              Dismiss
            </button>
          </div>
        )}

        <InfoBar
          activeDatasets={state.activeDatasets}
          questionIdx={state.questionIdx}
          sampleIdx={state.sampleIdx}
          getQuestionData={state.getQuestionData}
        />

        {/* Trace panels (drag to reorder) */}
        <PanelContainer
          datasets={state.orderedActiveDatasets}
          getQuestionData={state.getQuestionData}
          sampleIdx={state.sampleIdx}
          onReorder={state.reorderPanels}
        />

        <QuestionNav
          questionIdx={state.questionIdx}
          sampleIdx={state.sampleIdx}
          maxQuestions={state.maxQuestions}
          maxSamples={state.maxSamples}
          filter={state.filter}
          onQuestionChange={state.setQuestionIdx}
          onSampleChange={state.setSampleIdx}
          onFilterChange={state.setFilter}
        />
      </div>
    </div>
  );
}

/* ── Drag-to-reorder panel container ── */

interface PanelContainerProps {
  datasets: DatasetInfo[];
  getQuestionData: (dsId: string) => QuestionData | undefined;
  sampleIdx: number;
  onReorder: (fromId: string, toId: string) => void;
}

function PanelContainer({ datasets, getQuestionData, sampleIdx, onReorder }: PanelContainerProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    // Use a transparent 1x1 image so the browser doesn't clone the panel
    const ghost = document.createElement("canvas");
    ghost.width = 1;
    ghost.height = 1;
    e.dataTransfer.setDragImage(ghost, 0, 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setOverId(null);
    dragCounter.current = {};
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragCounter.current[id] = (dragCounter.current[id] || 0) + 1;
    setOverId(id);
  }, []);

  const handleDragLeave = useCallback((_e: React.DragEvent, id: string) => {
    dragCounter.current[id] = (dragCounter.current[id] || 0) - 1;
    if (dragCounter.current[id] <= 0) {
      dragCounter.current[id] = 0;
      setOverId(prev => prev === id ? null : prev);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      onReorder(draggedId, targetId);
    }
    setDraggedId(null);
    setOverId(null);
    dragCounter.current = {};
  }, [draggedId, onReorder]);

  if (datasets.length === 0) {
    return (
      <div className="flex-1 flex gap-2 p-2 overflow-x-auto min-h-0">
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-lg mb-2">No repos active</p>
            <p className="text-sm">Add a HuggingFace repo from the sidebar to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex gap-2 p-2 overflow-x-auto min-h-0">
      {datasets.map((ds) => {
        const isDragged = draggedId === ds.id;
        const isOver = overId === ds.id && draggedId !== null && draggedId !== ds.id;

        const handleProps: DragHandleProps = {
          draggable: true,
          onDragStart: (e) => handleDragStart(e, ds.id),
          onDragEnd: handleDragEnd,
        };

        return (
          <div
            key={ds.id}
            onDragEnter={(e) => handleDragEnter(e, ds.id)}
            onDragLeave={(e) => handleDragLeave(e, ds.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, ds.id)}
            className={`flex-1 min-w-0 transition-all duration-150 ${
              isDragged ? "opacity-30 scale-[0.97]" : ""
            } ${isOver ? "panel-drop-target" : ""}`}
          >
            <TracePanel
              datasetName={ds.presetName || ds.name}
              repoName={ds.presetName ? ds.name : undefined}
              data={getQuestionData(ds.id)}
              sampleIdx={sampleIdx}
              dragHandleProps={handleProps}
            />
          </div>
        );
      })}
    </div>
  );
}
