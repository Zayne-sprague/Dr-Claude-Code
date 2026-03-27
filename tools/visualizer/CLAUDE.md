# Experiment Dashboard Visualizer

Research dashboard with experiment tracking and trace visualization.

- **Live**: https://huggingface.co/spaces/{HF_ORG}/dashboard
- **GitHub**: `{github-org}/dashboard-repo`
- **Remotes**: `origin` (GitHub), `space` (HF Space)

## Updating the Website

When the user says "update the website", "sync the dashboard", or "push to the website":

1. **Build the frontend**:
   ```bash
   cd tools/visualizer/frontend && npm run build
   ```

2. **Import experiment data** (reads local files, uploads to HF dataset):
   ```bash
   cd tools/visualizer && python3 scripts/import_experiments.py
   ```

3. **Sync the live Space** (tells the running app to re-download data from HF):
   ```bash
   curl -s -X POST https://{HF_ORG}-dashboard.hf.space/api/experiments/sync
   ```

4. **Push code to HF Space** (deploys new frontend/backend code):
   ```bash
   cd tools/visualizer
   git add -A && git commit -m "update dashboard"
   git push origin main
   git push space main
   ```

Steps 1-3 sync **data** (experiments, summary findings, presets). Step 4 deploys **code** changes.

If only `summary_findings.md` changed (no code changes), steps 2-3 are sufficient.

## Summary Findings

- Source file: `{WORKSPACE}/notes/experiments/summary_findings.md`
- Only the user writes this file — never edit it
- Synced to HF via `import_experiments.py` → served at `GET /api/experiments/summary`
- Shown on the Experiments page via the "Findings / Summary" button

## Experiment Discovery

`scripts/import_experiments.py` auto-discovers all experiments in `notes/experiments/`, skipping `old/`, `_templates/`, and hidden directories. To hide specific experiments, add them to `EXCLUDED_EXPERIMENTS` in the script.

## Stack

- **Backend**: Flask (Python), blueprints in `backend/api/`
- **Frontend**: React + TypeScript + Tailwind, built with Vite into `frontend/dist/`
- **Data**: HF datasets (`RESEARCH_DASHBOARD` for experiments, `AGG_VIS_PRESETS` for visualizer presets)

## AdaEvolve Traces

### Required HuggingFace Dataset Columns

| Column | Type | Purpose |
|--------|------|---------|
| iteration | int | Iteration number |
| island_id | int | Which island produced this solution |
| score | float | Current iteration score |
| best_score | float | Best score so far |
| delta | float | Change from previous iteration |
| adaptation_type | string | "L1_explore", "L1_exploit", "L2_migrate", "L3_meta" |
| exploration_intensity | float | How exploratory this iteration was |
| is_valid | bool | Whether solution is valid |
| task_id | string | Task identifier |
| prompt_text | string | (optional) Input prompt to model |
| reasoning_trace | string | (optional) Thinking/reasoning output |
| program_code | string | (optional) Generated/evolved code |

### Color Mapping

L1_explore=blue, L1_exploit=green, L2_migrate=amber, L3_meta=red, other=gray.

### Adding a Preset

1. Upload dataset to HuggingFace (org: `your-org`)
2. Add entry to `your-org/AGG_VIS_PRESETS` file `adaevolve_presets.json`:
   ```json
   {"id": "8-char-hex", "name": "Descriptive Name", "repo": "org/dataset-name", "split": "train"}
   ```
3. Sync: `curl -X POST "https://your-org-agg-trace-visualizer.hf.space/api/presets/sync"`

### Naming Convention

`{Task} {Model}: {Description} ({N} iter)`
