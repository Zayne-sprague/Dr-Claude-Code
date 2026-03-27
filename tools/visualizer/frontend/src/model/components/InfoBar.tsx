import type { DatasetInfo, QuestionData } from "../types";

interface InfoBarProps {
  activeDatasets: DatasetInfo[];
  questionIdx: number;
  sampleIdx: number;
  getQuestionData: (dsId: string) => QuestionData | undefined;
}

export default function InfoBar({ activeDatasets, questionIdx, sampleIdx, getQuestionData }: InfoBarProps) {
  let questionText = "";
  let nSamples = 0;
  const firstData = activeDatasets.length > 0 ? getQuestionData(activeDatasets[0].id) : undefined;
  if (firstData) {
    questionText = firstData.question;
    nSamples = firstData.n_samples;
  }

  if (!questionText) {
    return (
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/80">
        <p className="text-sm text-gray-500 italic">Load repos and select a question to begin</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/80">
      {/* Question text */}
      <div className="text-sm text-gray-200 font-medium mb-2 leading-relaxed max-h-24 overflow-y-auto">
        Q{questionIdx}: {questionText}
      </div>

      {/* Sample bar */}
      {nSamples > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-500 mr-1">Samples:</span>
          {Array.from({ length: nSamples }, (_, i) => {
            const results = activeDatasets.map((ds) => {
              const d = getQuestionData(ds.id);
              return d?.eval_correct[i];
            });
            const allCorrect = results.every((r) => r === true);
            const someCorrect = results.some((r) => r === true);
            const noneCorrect = results.every((r) => r === false);

            let bgColor = "bg-gray-700";
            if (allCorrect) bgColor = "bg-green-700";
            else if (someCorrect) bgColor = "bg-yellow-700";
            else if (noneCorrect) bgColor = "bg-red-900";

            const isSelected = i === sampleIdx;

            return (
              <span
                key={i}
                className={`inline-block w-4 h-4 rounded-sm text-[9px] text-center leading-4 font-mono ${bgColor} ${
                  isSelected ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-gray-900" : ""
                }`}
                title={`Sample ${i + 1}: ${results.map((r, j) => `${activeDatasets[j]?.name}=${r ? "correct" : "wrong"}`).join(", ")}`}
              >
                {i + 1}
              </span>
            );
          })}
          <span className="text-[10px] text-gray-600 ml-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-700 mr-0.5 align-middle" /> all
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-700 mr-0.5 ml-1.5 align-middle" /> some
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-900 mr-0.5 ml-1.5 align-middle" /> none
          </span>
        </div>
      )}

      {/* Per-repo correctness for current sample */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {activeDatasets.map((ds) => {
          const d = getQuestionData(ds.id);
          const correct = d?.eval_correct[sampleIdx];
          return (
            <span key={ds.id} className="text-[11px]">
              <span className="text-gray-500">{ds.name}: </span>
              <span className={correct ? "text-green-400" : "text-red-400"}>
                {correct === undefined ? "?" : correct ? "Correct" : "Wrong"}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
