import { useState } from "react";
import type { SubExperiment } from "../types";
import { experimentsApi } from "../api";
import Markdown from "./Markdown";

interface Props {
  sub: SubExperiment;
  experimentName: string;
  onBack: () => void;
  onRefresh: () => void;
}

export default function SubExperimentView({ sub, experimentName, onBack, onRefresh }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(sub.content_md || "");
  const [hypothesis, setHypothesis] = useState(sub.hypothesis || "");
  const [status, setStatus] = useState(sub.status || "active");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await experimentsApi.updateSub(sub.experiment_id, sub.id, {
        content_md: content,
        hypothesis,
        status,
      });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb + header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm mb-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-200 transition-colors">
            &larr; {experimentName}
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">{sub.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-200">{sub.name}</h1>
            {editing ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  placeholder="Hypothesis"
                  className="bg-gray-900 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700 outline-none flex-1"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700"
                >
                  <option value="active">active</option>
                  <option value="concluded">concluded</option>
                  <option value="inconclusive">inconclusive</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-1">
                {sub.hypothesis && (
                  <p className="text-sm text-gray-400">{sub.hypothesis}</p>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${
                  status === "concluded" ? "bg-green-600" :
                  status === "active" ? "bg-yellow-600" : "bg-gray-600"
                }`}>
                  {status}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setContent(sub.content_md || ""); }}
                  className="text-gray-400 hover:text-gray-200 text-sm px-3 py-1.5 rounded transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium px-3 py-1.5 rounded transition-colors">
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-gray-200 text-sm px-3 py-1.5 rounded border border-gray-700 transition-colors">
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-gray-900 text-gray-200 text-sm rounded px-4 py-3 border border-gray-700 focus:border-cyan-500 outline-none resize-y font-mono"
              rows={30}
              placeholder="Write your sub-experiment report in markdown..."
            />
          ) : (
            <div className="bg-gray-900 rounded p-6 min-h-[300px]">
              {sub.content_md ? (
                <Markdown content={sub.content_md} />
              ) : (
                <span className="text-sm text-gray-600 italic">No content yet. Click Edit to add your sub-experiment report.</span>
              )}
            </div>
          )}

          {/* HF Repos */}
          {(sub.hf_repos || []).length > 0 && (
            <div className="mt-6">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Linked Datasets</span>
              <div className="grid gap-2 mt-2">
                {sub.hf_repos.map((repo, i) => (
                  <a
                    key={`${repo.repo}-${i}`}
                    href={`https://huggingface.co/datasets/${repo.repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    {repo.repo}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-6 flex gap-4 text-xs text-gray-600">
            {sub.created && <span>Created: {new Date(sub.created).toLocaleDateString()}</span>}
            {sub.updated && <span>Updated: {new Date(sub.updated).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
