import { lazy, Suspense } from "react";
import { useHashRoute, navigateTo } from "../hashRouter";

const ModelApp = lazy(() => import("../model/ModelApp"));

type TabId = "model";

const TABS: { id: TabId; label: string; color: string; activeClass: string }[] = [
  { id: "model", label: "Model Trace", color: "blue", activeClass: "border-blue-500 text-blue-400" },
];

const VALID_TABS = new Set<string>(TABS.map(t => t.id));

export default function VisualizerApp() {
  const route = useHashRoute();
  const activeTab: TabId = VALID_TABS.has(route.tab) ? (route.tab as TabId) : "model";

  return (
    <div className="h-full flex flex-col">
      {/* Visualizer tab bar */}
      <div className="flex items-center border-b border-gray-800 bg-gray-900/50 px-2 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigateTo({ page: "viz", tab: tab.id })}
            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? tab.activeClass
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active visualizer */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading...
            </div>
          }
        >
          {activeTab === "model" && (
            <div className="theme-model h-full">
              <ModelApp />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
