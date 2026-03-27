import type { FilterMode } from "../types";

interface QuestionNavProps {
  questionIdx: number;
  sampleIdx: number;
  maxQuestions: number;
  maxSamples: number;
  filter: FilterMode;
  onQuestionChange: (idx: number) => void;
  onSampleChange: (idx: number) => void;
  onFilterChange: (filter: FilterMode) => void;
}

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "improvements", label: "Improvements" },
  { value: "regressions", label: "Regressions" },
  { value: "both-correct", label: "Both Correct" },
  { value: "both-wrong", label: "Both Wrong" },
];

export default function QuestionNav({
  questionIdx, sampleIdx, maxQuestions, maxSamples,
  filter, onQuestionChange, onSampleChange, onFilterChange,
}: QuestionNavProps) {
  const prevQ = () => onQuestionChange(Math.max(0, questionIdx - 1));
  const nextQ = () => onQuestionChange(Math.min(maxQuestions - 1, questionIdx + 1));
  const prevS = () => onSampleChange(Math.max(0, sampleIdx - 1));
  const nextS = () => onSampleChange(Math.min(maxSamples - 1, sampleIdx + 1));

  return (
    <div className="px-4 py-2 border-t border-gray-700 bg-gray-900/80 flex items-center justify-between flex-wrap gap-2">
      {/* Question navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={prevQ}
          disabled={questionIdx <= 0}
          className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-600 text-gray-300 transition-colors"
        >
          &larr; Prev Q
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Q</span>
          <input
            type="number"
            value={questionIdx}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= 0 && v < maxQuestions) onQuestionChange(v);
            }}
            className="w-16 px-1.5 py-1 text-xs text-center bg-gray-800 border border-gray-600 rounded text-gray-200 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">/ {maxQuestions > 0 ? maxQuestions - 1 : 0}</span>
        </div>
        <button
          onClick={nextQ}
          disabled={questionIdx >= maxQuestions - 1}
          className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-600 text-gray-300 transition-colors"
        >
          Next Q &rarr;
        </button>
      </div>

      {/* Sample navigation */}
      {maxSamples > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={prevS}
            disabled={sampleIdx <= 0}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-600 text-gray-300 transition-colors"
          >
            &larr; Prev S
          </button>
          <span className="text-xs text-gray-400">
            Sample {sampleIdx + 1}/{maxSamples}
          </span>
          <button
            onClick={nextS}
            disabled={sampleIdx >= maxSamples - 1}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-600 text-gray-300 transition-colors"
          >
            Next S &rarr;
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              filter === f.value
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="text-[10px] text-gray-600">
        <kbd className="px-1 bg-gray-800 rounded">j</kbd>/<kbd className="px-1 bg-gray-800 rounded">k</kbd> question
        {" "}
        <kbd className="px-1 bg-gray-800 rounded">h</kbd>/<kbd className="px-1 bg-gray-800 rounded">l</kbd> sample
      </div>
    </div>
  );
}
