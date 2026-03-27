import { useState, useEffect, useCallback } from "react";
import type { Artifact, ArtifactType, HfRepo, RunRecord } from "../types";
import { HF_ORG } from "../../config";
import TableViewer from "./viewers/TableViewer";
import PlotlyViewer from "./viewers/PlotlyViewer";
import ImageViewer from "./viewers/ImageViewer";
import YamlViewer from "./viewers/YamlViewer";

const ARTIFACT_TYPE_COLORS: Record<ArtifactType, string> = {
  input_data: "bg-cyan-900/50 text-cyan-300 border border-cyan-700/50",
  inference_output: "bg-blue-900/50 text-blue-300 border border-blue-700/50",
  training_config: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  canary_output: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
  eval_result: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  processed_data: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
};

const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  input_data: "input data",
  inference_output: "inference output",
  training_config: "training config",
  canary_output: "canary output",
  eval_result: "eval result",
  processed_data: "processed data",
};

interface ArtifactsTabProps {
  artifacts: Artifact[];
  hfRepos: HfRepo[];
  runs: RunRecord[];
  onOpenArtifact: (artifact: Artifact) => void;
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen: (a: Artifact) => void;
}) {
  const typeColorClass =
    artifact.artifact_type
      ? ARTIFACT_TYPE_COLORS[artifact.artifact_type]
      : "bg-gray-800 text-gray-400 border border-gray-700";
  const typeLabel =
    artifact.artifact_type
      ? ARTIFACT_TYPE_LABELS[artifact.artifact_type]
      : "unknown";

  const fullName = artifact.dataset_name.includes("/") ? artifact.dataset_name : `${HF_ORG}/${artifact.dataset_name}`;
  const hfUrl = `https://huggingface.co/datasets/${fullName}`;
  const shortName = artifact.dataset_name.split("/").pop() ?? artifact.dataset_name;
  const createdDate = artifact.created
    ? new Date(artifact.created).toLocaleDateString()
    : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col gap-2 hover:border-gray-700 transition-colors">
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-gray-200 font-medium truncate block" title={artifact.dataset_name}>
            {shortName}
          </span>
          {artifact.dataset_name.includes("/") && (
            <span className="text-xs text-gray-600 truncate block" title={artifact.dataset_name}>
              {artifact.dataset_name.split("/")[0]}/
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColorClass}`}>
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Visualizer type */}
      {artifact.visualizer_type && (
        <div>
          <span className="text-xs text-gray-500">
            viewer: <span className="text-gray-400">{artifact.visualizer_type.replace(/_/g, " ")}</span>
          </span>
        </div>
      )}

      {/* Description */}
      {artifact.description && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{artifact.description}</p>
      )}

      {/* Bottom row: date + actions */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-600">{createdDate ?? ""}</span>
        <div className="flex items-center gap-2">
          <a
            href={hfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-cyan-400 transition-colors"
            title="Open on HuggingFace"
          >
            <ExternalLinkIcon />
          </a>
          <button
            onClick={() => onOpen(artifact)}
            className="text-xs bg-cyan-700/40 hover:bg-cyan-600/50 text-cyan-300 px-2 py-0.5 rounded transition-colors border border-cyan-700/30"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

interface RunGroupProps {
  label: string;
  artifacts: Artifact[];
  defaultOpen?: boolean;
  onOpenArtifact: (a: Artifact) => void;
}

function RunGroup({ label, artifacts, defaultOpen = true, onOpenArtifact }: RunGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <span className={`text-xs transition-transform ${open ? "rotate-90" : ""} text-gray-500`}>▶</span>
        <span className="text-sm font-medium text-gray-300 group-hover:text-gray-200 transition-colors">
          {label}
        </span>
        <span className="text-xs text-gray-600">({artifacts.length})</span>
      </button>
      {open && (
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 pl-4">
          {artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.dataset_name}
              artifact={artifact}
              onOpen={onOpenArtifact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const INLINE_VIEWER_TYPES = new Set(["table", "yaml_config", "plotly", "image"]);

export default function ArtifactsTab({
  artifacts,
  hfRepos,
  runs,
  onOpenArtifact,
}: ArtifactsTabProps) {
  const [activeViewer, setActiveViewer] = useState<{
    type: string;
    repo: string;
  } | null>(null);

  // Close inline viewer on browser back
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (activeViewer && !e.state?.artifactViewer) {
        setActiveViewer(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [activeViewer]);

  // Build a run label lookup: run_id → human label
  const runLabelMap = new Map<string, string>(
    runs.map((r) => [r.id, r.condition ? `${r.condition} (${r.id.slice(0, 6)})` : r.id.slice(0, 8)])
  );

  const handleOpenArtifact = useCallback((artifact: Artifact) => {
    const vtype = artifact.visualizer_type ?? "table";
    if (INLINE_VIEWER_TYPES.has(vtype)) {
      window.history.pushState({ artifactViewer: true }, "");
      setActiveViewer({ type: vtype, repo: artifact.dataset_name });
    } else {
      onOpenArtifact(artifact);
    }
  }, [onOpenArtifact]);

  const closeViewer = useCallback(() => {
    setActiveViewer(null);
    window.history.back();
  }, []);

  const renderContent = () => {
    // ---- Case 1: artifacts array non-empty — grouped view ----
    if (artifacts.length > 0) {
      // Group by run_id
      const grouped = new Map<string | null, Artifact[]>();
      for (const artifact of artifacts) {
        const key = artifact.run_id ?? null;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(artifact);
      }

      // Collect groups (run_id non-null first, null/"Ungrouped" last)
      const groupedEntries: { key: string | null; label: string; artifacts: Artifact[] }[] = [];
      for (const [key, arts] of grouped.entries()) {
        if (key !== null) {
          const label = runLabelMap.get(key) ?? `Run ${key.slice(0, 8)}`;
          groupedEntries.push({ key, label, artifacts: arts });
        }
      }
      // Sort run groups by first artifact created date (newest first)
      groupedEntries.sort((a, b) => {
        const aDate = a.artifacts[0]?.created ?? "";
        const bDate = b.artifacts[0]?.created ?? "";
        return bDate.localeCompare(aDate);
      });

      const ungrouped = grouped.get(null) ?? [];

      return (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">Artifacts</h2>
            <span className="text-xs text-gray-500">{artifacts.length} total</span>
          </div>

          {groupedEntries.map(({ key, label, artifacts: arts }) => (
            <RunGroup
              key={key}
              label={label}
              artifacts={arts}
              onOpenArtifact={handleOpenArtifact}
            />
          ))}

          {ungrouped.length > 0 && (
            <RunGroup
              key="__ungrouped__"
              label="Ungrouped"
              artifacts={ungrouped}
              defaultOpen={groupedEntries.length === 0}
              onOpenArtifact={handleOpenArtifact}
            />
          )}
        </div>
      );
    }

    // ---- Case 2: no artifacts but hfRepos present — legacy fallback ----
    if (hfRepos.length > 0) {
      return (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">HuggingFace Datasets</h2>
            <span className="text-xs text-gray-500 italic">legacy — no manifest entries</span>
          </div>
          <div className="grid gap-2">
            {hfRepos.map((repo, i) => (
              <div
                key={`${repo.repo}-${i}`}
                className="flex items-center justify-between bg-gray-900 rounded p-3 border border-gray-800"
              >
                <div>
                  <a
                    href={`https://huggingface.co/datasets/${repo.repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    {repo.repo}
                  </a>
                  {repo.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{repo.description}</p>
                  )}
                </div>
                <span className="text-xs text-gray-600">{repo.date || ""}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ---- Case 3: both empty ----
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-gray-500 italic">No artifacts recorded yet.</p>
      </div>
    );
  };

  return (
    <div className="relative">
      {renderContent()}

      {activeViewer && (
        <div className="absolute inset-0 z-10 bg-gray-900">
          {activeViewer.type === "table" && (
            <TableViewer datasetRepo={activeViewer.repo} onClose={closeViewer} />
          )}
          {activeViewer.type === "plotly" && (
            <PlotlyViewer datasetRepo={activeViewer.repo} onClose={closeViewer} />
          )}
          {activeViewer.type === "image" && (
            <ImageViewer datasetRepo={activeViewer.repo} onClose={closeViewer} />
          )}
          {activeViewer.type === "yaml_config" && (
            <YamlViewer datasetRepo={activeViewer.repo} onClose={closeViewer} />
          )}
        </div>
      )}
    </div>
  );
}
