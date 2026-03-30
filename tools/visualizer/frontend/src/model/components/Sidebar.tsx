import { useState } from "react";
import type { DatasetInfo, Preset } from "../types";

// Consistent group colors for visual distinction
const GROUP_COLORS = [
  { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-400", label: "text-blue-300" },
  { bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-400", label: "text-emerald-300" },
  { bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-400", label: "text-amber-300" },
  { bg: "bg-purple-500", border: "border-purple-500", text: "text-purple-400", label: "text-purple-300" },
  { bg: "bg-rose-500", border: "border-rose-500", text: "text-rose-400", label: "text-rose-300" },
  { bg: "bg-cyan-500", border: "border-cyan-500", text: "text-cyan-400", label: "text-cyan-300" },
];

interface SidebarProps {
  datasets: DatasetInfo[];
  presets: Preset[];
  loading: Record<string, boolean>;
  groups: Record<string, DatasetInfo[]>;
  groupIds: string[];
  currentGroupId: string | null;
  onAddDataset: (repo: string, column?: string, split?: string, promptColumn?: string) => void;
  onRemoveDataset: (id: string) => void;
  onToggleDataset: (id: string) => void;
  onSetCurrentGroup: (groupId: string) => void;
  onLoadPreset: (preset: Preset) => void;
  onSavePreset: (name: string, repo: string, column: string, split?: string) => void;
  onDeletePreset: (id: string, datasetId?: string) => void;
  onUpdatePreset: (presetId: string, datasetId: string, updates: { name?: string }) => void;
}

export default function Sidebar({
  datasets, presets, loading,
  groups, groupIds, currentGroupId,
  onAddDataset, onRemoveDataset, onToggleDataset, onSetCurrentGroup,
  onLoadPreset, onSavePreset, onDeletePreset, onUpdatePreset,
}: SidebarProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [columnInput, setColumnInput] = useState("");
  const [splitInput, setSplitInput] = useState("train");
  const [promptColumnInput, setPromptColumnInput] = useState("");
  const [presetSearch, setPresetSearch] = useState("");
  // Track which dataset is currently being saved as a preset (by dataset id)
  const [savingPresetForId, setSavingPresetForId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  // Track which dataset is selected for preset editing
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editPresetName, setEditPresetName] = useState("");

  const handleAdd = () => {
    if (!repoInput.trim()) return;
    onAddDataset(
      repoInput.trim(),
      columnInput.trim() || undefined,
      splitInput.trim() || undefined,
      promptColumnInput.trim() || undefined,
    );
    setRepoInput("");
    setShowAddModal(false);
  };

  const handleSavePresetForRepo = (ds: DatasetInfo) => {
    if (!presetName.trim()) return;
    onSavePreset(presetName.trim(), ds.repo, ds.column, ds.split);
    setPresetName("");
    setSavingPresetForId(null);
  };

  const getGroupColor = (groupId: string) => {
    const idx = groupIds.indexOf(groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  return (
    <div className="w-72 min-w-72 bg-gray-900 border-r border-gray-700 flex flex-col h-full">
      {/* Presets section */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Presets</h3>
        </div>
        {presets.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No presets saved</p>
        ) : (
          <>
            {presets.length > 6 && (
              <input
                type="text"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                placeholder="Search presets..."
                className="w-full px-2 py-1 mb-2 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            )}
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {presets
                .filter((p) => !presetSearch || p.name.toLowerCase().includes(presetSearch.toLowerCase()) || p.repo.toLowerCase().includes(presetSearch.toLowerCase()))
                .map((p) => (
                <div key={p.id} className="group relative">
                  <button
                    onClick={() => onLoadPreset(p)}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 text-gray-300 transition-colors"
                    title={`${p.repo} (${p.column}, ${p.split ?? "train"})`}
                  >
                    {p.name}
                  </button>
                  <div className="hidden group-hover:flex absolute top-full left-0 mt-1 z-10 gap-1">
                    <button
                      onClick={() => onDeletePreset(p.id)}
                      className="px-1.5 py-0.5 text-[10px] bg-red-900 hover:bg-red-800 rounded text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Datasets section — grouped by question fingerprint */}
      <div className="flex-1 overflow-y-auto p-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Loaded Repos</h3>
        {datasets.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No repos loaded. Add one below.</p>
        ) : (
          <div className="space-y-3">
            {groupIds.map((gid) => {
              const color = getGroupColor(gid);
              const groupDatasets = groups[gid];
              const isCurrentGroup = gid === currentGroupId;

              return (
                <div key={gid}>
                  {/* Group header — clickable to switch group */}
                  <button
                    onClick={() => onSetCurrentGroup(gid)}
                    className={`w-full flex items-center gap-1.5 mb-1 px-1 py-0.5 rounded transition-colors ${
                      isCurrentGroup ? "bg-gray-800" : "hover:bg-gray-800/50"
                    }`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full ${color.bg} shrink-0`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isCurrentGroup ? color.label : "text-gray-500"
                    }`}>
                      Group {groupIds.indexOf(gid) + 1}
                      <span className="normal-case font-normal ml-1 text-gray-600">
                        ({groupDatasets.length} repo{groupDatasets.length !== 1 ? "s" : ""})
                      </span>
                    </span>
                    {isCurrentGroup && (
                      <span className="text-[9px] text-gray-600 ml-auto">viewing</span>
                    )}
                  </button>

                  {/* Repos in this group */}
                  <div className={`space-y-1 border-l-2 ml-1 pl-2 ${
                    isCurrentGroup ? color.border : "border-gray-700"
                  }`}>
                    {groupDatasets.map((ds) => (
                      <div key={ds.id}>
                        <div
                          onClick={() => {
                            if (ds.presetId) {
                              setEditingDatasetId(editingDatasetId === ds.id ? null : ds.id);
                              setEditPresetName(ds.presetName || "");
                              setShowAddModal(false);
                            }
                          }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                            ds.active ? "bg-gray-800" : "bg-gray-900 opacity-60"
                          } ${editingDatasetId === ds.id ? "ring-1 ring-blue-500" : ""} ${ds.presetId ? "cursor-pointer" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={ds.active}
                            onChange={() => onToggleDataset(ds.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-200 truncate text-xs font-medium" title={ds.presetName ? `${ds.presetName}\n${ds.repo}` : ds.repo}>
                              {ds.presetName || ds.name}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {ds.column} | {ds.n_rows} rows | {ds.n_samples} samples
                            </div>
                          </div>
                          {/* Save as preset */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSavingPresetForId(savingPresetForId === ds.id ? null : ds.id);
                              setPresetName("");
                            }}
                            className={`transition-colors shrink-0 ${
                              savingPresetForId === ds.id
                                ? "text-blue-400"
                                : "text-gray-600 hover:text-blue-400"
                            }`}
                            title="Save as preset"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </button>
                          {/* Remove */}
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveDataset(ds.id); }}
                            className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                            title="Remove"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        {/* Inline preset name input */}
                        {savingPresetForId === ds.id && (
                          <div className="flex gap-1 mt-1 ml-6">
                            <input
                              type="text"
                              value={presetName}
                              onChange={(e) => setPresetName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSavePresetForRepo(ds);
                                if (e.key === "Escape") setSavingPresetForId(null);
                              }}
                              placeholder="Preset name..."
                              className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSavePresetForRepo(ds)}
                              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preset edit panel */}
      {editingDatasetId && (() => {
        const editDs = datasets.find(d => d.id === editingDatasetId);
        if (!editDs?.presetId) return null;
        return (
          <div className="p-3 border-t border-gray-700 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Edit Preset</div>
            <input
              type="text"
              value={editPresetName}
              onChange={(e) => setEditPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editPresetName.trim()) {
                  onUpdatePreset(editDs.presetId!, editDs.id, { name: editPresetName.trim() });
                  setEditingDatasetId(null);
                }
                if (e.key === "Escape") setEditingDatasetId(null);
              }}
              placeholder="Preset name..."
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (editPresetName.trim()) {
                    onUpdatePreset(editDs.presetId!, editDs.id, { name: editPresetName.trim() });
                    setEditingDatasetId(null);
                  }
                }}
                disabled={!editPresetName.trim()}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-white transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  onDeletePreset(editDs.presetId!, editDs.id);
                  setEditingDatasetId(null);
                }}
                className="px-2 py-1 text-xs bg-red-900 hover:bg-red-800 rounded text-red-300 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setEditingDatasetId(null)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Add repo section */}
      <div className="p-3 border-t border-gray-700">
        {!showAddModal ? (
          <button
            onClick={() => {
              setEditingDatasetId(null);
              setShowAddModal(true);
              setRepoInput("");
              setColumnInput("");
              setSplitInput("train");
              setPromptColumnInput("");
            }}
            className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium transition-colors"
          >
            + Add Repo
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="org/dataset-name"
              className="w-full px-2 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={columnInput}
                onChange={(e) => setColumnInput(e.target.value)}
                placeholder="Response col (auto-detect)"
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="text"
                value={splitInput}
                onChange={(e) => setSplitInput(e.target.value)}
                placeholder="Split"
                className="w-16 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={promptColumnInput}
                onChange={(e) => setPromptColumnInput(e.target.value)}
                placeholder="Prompt col (auto-detect)"
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!repoInput.trim() || loading[repoInput.trim()]}
                className="flex-1 px-2 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-white transition-colors"
              >
                {loading[repoInput.trim()] ? "Loading..." : "Load"}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
