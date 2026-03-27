import { useState } from "react";
import type { QuestionData } from "../types";
import { highlightTrace } from "../utils/traceHighlight";
import { parsePrompt, type ParsedMessage } from "../utils/promptParser";

export interface DragHandleProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

interface TracePanelProps {
  datasetName: string;
  repoName?: string;
  data: QuestionData | undefined;
  sampleIdx: number;
  isLoading?: boolean;
  dragHandleProps?: DragHandleProps;
}

export default function TracePanel({ datasetName, repoName, data, sampleIdx, isLoading, dragHandleProps }: TracePanelProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="h-full border border-gray-700 rounded-lg flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full border border-gray-700 rounded-lg flex items-center justify-center">
        <div className="text-gray-500 text-sm">No data</div>
      </div>
    );
  }

  const isCorrect = data.eval_correct[sampleIdx];
  const analysis = data.analyses[sampleIdx];
  const extraction = data.extractions?.[sampleIdx];

  const borderColor = isCorrect === undefined
    ? "border-gray-700"
    : isCorrect
    ? "border-green-600"
    : "border-red-600";

  const thinkSegments = highlightTrace(analysis?.think_text || "");
  const answerText = analysis?.answer_text || "";

  const promptMessages = data.prompt_text ? parsePrompt(data.prompt_text) : [];

  return (
    <div className={`h-full border-2 ${borderColor} rounded-lg flex flex-col bg-gray-900/50`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate" title={repoName ? `${datasetName}\n${repoName}` : datasetName}>{datasetName}</span>
          {isCorrect !== undefined && (
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
              isCorrect ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
            }`}>
              {isCorrect ? "CORRECT" : "WRONG"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="text-[10px] text-gray-500">
            {analysis && (
              <>Think: {analysis.think_len.toLocaleString()} | BT: {analysis.backtracks}</>
            )}
          </span>
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              title="Drag to reorder"
              className="drag-handle text-gray-600 hover:text-gray-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" />
                <circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" />
                <circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" />
                <circle cx="11" cy="13" r="1.5" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Extraction / extracted answer */}
      {extraction && (
        <div className="px-3 py-1.5 border-b border-gray-700/50 bg-gray-800/30 overflow-x-auto whitespace-nowrap">
          <span className="text-[10px] text-gray-500 uppercase font-medium">Extracted: </span>
          <span className="text-xs text-gray-300 font-mono">{extraction}</span>
        </div>
      )}

      {/* Trace content */}
      <div className="flex-1 overflow-y-auto trace-scroll px-3 py-2">
        {/* Prompt section — collapsible */}
        {promptMessages.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setPromptExpanded(!promptExpanded)}
              className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 hover:text-gray-300 transition-colors"
            >
              <span className="text-[10px]">{promptExpanded ? "\u25BC" : "\u25B6"}</span>
              Prompt ({promptMessages.length} message{promptMessages.length !== 1 ? "s" : ""})
            </button>
            {promptExpanded && (
              <div className="space-y-1.5">
                {promptMessages.map((msg, i) => (
                  <PromptMessage key={i} message={msg} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thinking section */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Thinking ({analysis?.think_len.toLocaleString() || 0} chars)
          </div>
          <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono">
            {thinkSegments.map((seg, i) => (
              <span key={i} className={seg.className}>{seg.text}</span>
            ))}
          </pre>
        </div>

        {/* Answer section */}
        {answerText && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Answer ({analysis?.answer_len.toLocaleString() || 0} chars)
            </div>
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-gray-100 font-bold">
              {answerText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_STYLES: Record<string, { border: string; label: string; bg: string }> = {
  system: { border: "border-l-purple-500", label: "text-purple-400", bg: "bg-purple-500/5" },
  user: { border: "border-l-blue-500", label: "text-blue-400", bg: "bg-blue-500/5" },
  assistant: { border: "border-l-green-500", label: "text-green-400", bg: "bg-green-500/5" },
  prompt: { border: "border-l-gray-500", label: "text-gray-400", bg: "bg-gray-500/5" },
};

function PromptMessage({ message }: { message: ParsedMessage }) {
  const style = ROLE_STYLES[message.role] || ROLE_STYLES.prompt;
  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r pl-2 py-1`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${style.label}`}>
        {message.role}
      </div>
      <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-gray-300 max-h-60 overflow-y-auto">
        {message.content}
      </pre>
    </div>
  );
}
