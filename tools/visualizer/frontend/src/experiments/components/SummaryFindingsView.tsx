import Markdown from "./Markdown";

interface Props {
  content: string;
  onBack: () => void;
}

export default function SummaryFindingsView({ content, onBack }: Props) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm mb-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-200 transition-colors">
            &larr; Experiments
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">Findings & Summary</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-200">Findings & Summary</h1>
        <p className="text-xs text-gray-500 mt-1">Definitive statements on what has been learned from experiments</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl">
          <div className="bg-gray-900 rounded p-6">
            {content ? (
              <Markdown content={content} />
            ) : (
              <span className="text-sm text-gray-600 italic">No findings written yet.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
