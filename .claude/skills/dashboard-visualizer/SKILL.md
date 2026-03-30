---
name: dashboard-visualizer
description: |
  Maintains knowledge about the Dr. Claude Code visualization website. Answers questions
  about what visualizations are currently supported, how to check if artifacts can be
  displayed, and how to add new visualizer tabs. Also handles code edits to the
  frontend/backend when a new visualization type is needed.
  Run this skill when the user asks "what can the dashboard show?", "add a new
  visualizer", "why isn't my data showing up?", or "how does the visualizer work?".
---

# Dashboard Visualizer Skill

---

## Project Layout

```
tools/visualizer/
  backend/
    app.py                    # Flask app factory, registers blueprints
    api/
      experiments.py          # /api/experiments/* — experiment metadata, activity logs
      manifest.py             # /api/manifest/* — HF dataset manifests
      model_datasets.py       # /api/model/datasets/* — loads HF datasets for model trace viewer
      presets.py              # /api/presets/* — saved dataset presets
  frontend/
    src/
      App.tsx                 # Top-level router: routes to Experiments or Visualizer page
      hashRouter.ts           # Hash-based routing (#page=viz&tab=model)
      experiments/            # Experiments page (README, activity log, artifact list)
        ExperimentsApp.tsx
        api.ts
        components/
        store.ts
        types.ts
      model/                  # Model Trace Viewer tab
        ModelApp.tsx
        api.ts
        components/
          Sidebar.tsx         # Dataset selector, preset management
          TracePanel.tsx      # Side-by-side trace comparison
          QuestionNav.tsx     # Navigate between questions/examples
          InfoBar.tsx         # Dataset metadata display
        store.ts
        types.ts
        utils/
      visualizer/
        VisualizerApp.tsx     # Tab bar + router for all visualizer tabs
  scripts/
    import_experiments.py    # Reads notes/experiments/, uploads to HF dashboard dataset
```

---

## Pages and Tabs

The app has two top-level pages:

### 1. Experiments Page (`#page=experiments`)

Shows all experiments in the workspace:
- README content for each experiment
- Activity log (JSONL timeline of steps, go/no-go decisions, notes)
- Artifact list (links to HF datasets)
- Status badges (running, complete, failed, etc.)

Data source: The `RESEARCH_DASHBOARD` HF dataset, populated by `import_experiments.py`.

### 2. Visualizer Page (`#page=viz`)

A tabbed interface for interactively exploring model output data. Currently has one tab:

#### Model Trace Viewer (`#page=viz&tab=model`)

Loads a HuggingFace dataset and displays model traces (prompts + responses) side by side.

**What it can display:**
- Any HF dataset with a text column containing model responses
- Side-by-side comparison of multiple datasets on the same questions
- Navigation through individual examples (by question index)

**Column auto-detection:**

The backend (`model_datasets.py`) detects which column contains the model's responses using this fallback order:
1. User-specified column (from the sidebar UI)
2. `model_responses`
3. `model_response`
4. `response`
5. `responses`
6. `output`
7. `outputs`
8. `completion`
9. `messages`
10. First column in the dataset (last resort)

Similarly for the prompt column:
1. User-specified
2. `formatted_prompt`
3. `prompt`
4. `question`
5. `input`
6. `instruction`

**If the user's data isn't showing correctly:**
- Check that the response column is one of the names above, OR instruct them to specify it manually in the sidebar
- The response column must contain strings or lists of strings
- Non-string columns (scores, metadata) are shown in the InfoBar, not the trace panel

---

## Checking If Artifacts Can Be Displayed

To determine if a new HF dataset will work in the Model Trace Viewer, check:

1. **Does it have a response column?** Must be named one of: `model_responses`, `model_response`, `response`, `responses`, `output`, `outputs`, `completion`, `messages`. Or the user can specify it manually.

2. **Does it have a prompt column?** Not required, but nice for context. Must be named: `formatted_prompt`, `prompt`, `question`, `input`, `instruction`.

3. **Are responses strings?** If the response column contains lists (e.g., `["response1", "response2"]`), the viewer handles that (shows multi-sample traces). If it contains dicts or nested objects, it may not render correctly.

4. **Is the dataset public?** The visualizer loads from HF — private datasets require a `HF_TOKEN`. The backend reads `HF_TOKEN` from the environment.

Tell the user: "Your dataset `<name>` should work in the Model Trace Viewer. Load it by pasting `<org>/<name>` into the sidebar."

---

## How to Add a New Visualizer Tab

When the user wants a new visualization type (e.g., a score distribution chart, a training curve viewer, a comparison table):

### Step 1: Plan

Determine:
- What data does it need? (HF dataset columns, experiment metadata, etc.)
- What's the right component type? (table, chart, side-by-side trace, image gallery)
- Does it need a new backend endpoint, or can it reuse existing ones?

### Step 2: Create the frontend module

Copy the `model/` directory as a starting point:

```bash
cp -r tools/visualizer/frontend/src/model tools/visualizer/frontend/src/<new_tab>
```

Rename files: `ModelApp.tsx` → `<NewTab>App.tsx`, update all internal references.

Minimum files needed:
- `<NewTab>App.tsx` — main component
- `api.ts` — API calls for this tab's data
- `types.ts` — TypeScript types
- `store.ts` — state management (Zustand)

### Step 3: Register the tab in VisualizerApp.tsx

Edit `tools/visualizer/frontend/src/visualizer/VisualizerApp.tsx`:

```typescript
// Add to the TABS array:
{ id: "<tab_id>", label: "<Tab Label>", color: "green", activeClass: "border-green-500 text-green-400" },

// Add to the lazy import and switch statement:
const NewTabApp = lazy(() => import("../<new_tab>/<NewTab>App"));
```

### Step 4: Add backend endpoint (if needed)

Create `tools/visualizer/backend/api/<new_tab>.py`:

```python
from flask import Blueprint, jsonify
bp = Blueprint("<new_tab>", __name__, url_prefix="/api/<new_tab>")

@bp.route("/data")
def get_data():
    # ... load and return data ...
    return jsonify({"rows": [...]})
```

Register in `tools/visualizer/backend/app.py`:

```python
from .api import <new_tab>
app.register_blueprint(<new_tab>.bp)
```

### Step 5: Build and deploy

```bash
# Build frontend
cd tools/visualizer/frontend && npm run build

# Commit and push
cd tools/visualizer
git add backend/ frontend/src/ frontend/dist/ scripts/
git commit -m "add <tab_name> visualizer tab"
git push origin main
git push space main  # deploys to HF Space
```

**Note:** Data syncs (experiment metadata, artifacts) do NOT require a build or deploy. Only source code changes to frontend/backend require this.

---

## Checking Currently Supported Visualizations

If the user asks "what can the dashboard show?":

1. Read `tools/visualizer/frontend/src/visualizer/VisualizerApp.tsx` to get the current TABS array
2. For each tab, describe what it shows and how to use it
3. Check `tools/visualizer/frontend/src/experiments/` to describe the experiments page

The canonical list is always in the source — don't rely on this document alone, as new tabs may have been added.

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Dataset not loading | Private dataset, missing HF_TOKEN | Set `HF_TOKEN` in the backend environment |
| Responses showing as raw JSON | Response column contains dicts | Use a column that has strings or string lists |
| No prompt shown | Prompt column name not recognized | Rename to `prompt` or `formatted_prompt`, or specify manually |
| Experiments page empty | `import_experiments.py` not run | Run `/drcc:dashboard-sync` |
| Tab not appearing | Not added to TABS array | Follow Step 3 of "Add a New Visualizer Tab" |
| Changes not live after code edit | Frontend not rebuilt | `cd frontend && npm run build && git push space main` |
