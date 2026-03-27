import { useExperimentsState } from "./store";
import ExperimentList from "./components/ExperimentList";
import ExperimentDetail from "./components/ExperimentDetail";
import SubExperimentView from "./components/SubExperimentView";
import NoteView from "./components/NoteView";
import SummaryFindingsView from "./components/SummaryFindingsView";

export default function ExperimentsApp() {
  const state = useExperimentsState();

  if (state.loading && state.experiments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading experiments...
      </div>
    );
  }

  if (state.error && state.experiments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <p className="text-red-400 mb-2">{state.error}</p>
        <button
          onClick={state.loadExperiments}
          className="text-cyan-400 hover:text-cyan-300 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.view.kind === "summary") {
    return (
      <SummaryFindingsView
        content={state.summaryContent}
        onBack={state.navigateToList}
      />
    );
  }

  if (state.view.kind === "note" && state.currentNote && state.currentDetail) {
    return (
      <NoteView
        note={state.currentNote}
        experimentName={state.currentDetail.name}
        onBack={() => state.navigateToDetail(state.view.kind === "note" ? state.view.expId : "")}
      />
    );
  }

  if (state.view.kind === "sub" && state.currentSub && state.currentDetail) {
    return (
      <SubExperimentView
        sub={state.currentSub}
        experimentName={state.currentDetail.name}
        onBack={() => state.navigateToDetail(state.view.kind === "sub" ? state.view.expId : "")}
        onRefresh={state.refreshDetail}
      />
    );
  }

  if (state.view.kind === "detail" && state.currentDetail) {
    return (
      <ExperimentDetail
        experiment={state.currentDetail}
        onBack={state.navigateToList}
        onSelectNote={(noteId) => state.navigateToNote(state.view.kind === "detail" ? state.view.expId : "", noteId)}
        onRefresh={state.refreshDetail}
      />
    );
  }

  return (
    <ExperimentList
      experiments={state.experiments}
      onSelect={state.navigateToDetail}
      onRefresh={state.loadExperiments}
      onSummary={state.navigateToSummary}
    />
  );
}
