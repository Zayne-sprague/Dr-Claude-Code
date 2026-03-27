import type { ExperimentNote } from "../types";
import Markdown from "./Markdown";

interface Props {
  note: ExperimentNote;
  experimentName: string;
  onBack: () => void;
}

export default function NoteView({ note, experimentName, onBack }: Props) {
  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb + header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm mb-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-200 transition-colors">
            &larr; {experimentName}
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">{note.title}</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-200">{note.title}</h1>
        {note.relative_path && (
          <p className="text-xs text-gray-500 mt-1 font-mono">{note.relative_path}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="border-l-4 border-cyan-500 bg-gray-900/80 rounded-r p-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Claude Code</span>
          <div className="mt-3">
            {note.content_md ? (
              <Markdown content={note.content_md} />
            ) : (
              <span className="text-sm text-gray-600 italic">No content.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
