import { lazy, Suspense } from "react";
import { useHashRoute, navigateTo, useCopyLink } from "./hashRouter";

const VisualizerApp = lazy(() => import("./visualizer/VisualizerApp"));
const ExperimentsApp = lazy(() => import("./experiments/ExperimentsApp"));

type PageId = "experiments" | "visualizer";

const PAGES: { id: PageId; label: string }[] = [
  { id: "experiments", label: "Experiments" },
  { id: "visualizer", label: "Visualizer" },
];

export default function App() {
  const route = useHashRoute();
  const activePage: PageId = route.page === "viz" ? "visualizer" : "experiments";
  const { copyLink, copied } = useCopyLink();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Top navigation bar */}
      <div className="flex items-center border-b border-gray-700 bg-gray-900 px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-300 mr-6 py-2.5">
          Research Dashboard
        </span>
        {PAGES.map((page) => (
          <button
            key={page.id}
            onClick={() => navigateTo({ page: page.id === "visualizer" ? "viz" : "experiments" })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activePage === page.id
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {page.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={copyLink}
            className="px-2.5 py-1 text-xs font-medium rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <span className="text-xs text-gray-600">
            Research Dashboard
          </span>
        </div>
      </div>

      {/* Active page */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading...
            </div>
          }
        >
          {activePage === "experiments" && <ExperimentsApp />}
          {activePage === "visualizer" && <VisualizerApp />}
        </Suspense>
      </div>
    </div>
  );
}
