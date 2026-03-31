---
description: "Sync experiment data and artifacts to the live Research Dashboard. Run after any artifact is produced, experiment state changes, or notes are updated."
allowed-tools: ["Bash", "Read", "Glob"]
argument-hint: "[experiment_name]"
---

# Dashboard Sync

Sync experiment metadata, activity logs, and artifact references to the live Research Dashboard.

## When to run

- After uploading any artifact to HuggingFace (so it appears in the Artifacts tab)
- After writing or updating experiment notes or activity logs
- After the harvest phase of an experiment pipeline
- After any change to experiment state (phase transitions, go/no-go decisions)
- When the user says "sync the dashboard", "update the website", or "refresh the dashboard"

## Step 1: Check HUGGINGFACE_REPOS.md (if syncing a specific experiment)

If an experiment name was passed as an argument, read its artifact registry:

```bash
cat notes/experiments/<experiment_name>/HUGGINGFACE_REPOS.md 2>/dev/null
```

This confirms what HF datasets should appear in the Artifacts tab after sync.

## Step 2: Run import_experiments.py

This reads all experiment data from `notes/experiments/` — including configs, READMEs, activity logs, and HF repo lists — and uploads the aggregated data to the `RESEARCH_DASHBOARD` HF dataset.

```bash
cd tools/visualizer && .tools-venv/bin/python scripts/import_experiments.py
```

If the `.tools-venv` doesn't exist or the command fails:

```bash
# Fallback: use system python if venv is missing
cd tools/visualizer && python3 scripts/import_experiments.py
```

Capture the output. If it reports errors (missing files, HF auth failure), report them to the user.

## Step 3: Trigger dashboard refresh

Tell the live HF Space to re-download the updated data:

```bash
# Dashboard URL is in .raca/config.yaml
DASHBOARD_URL=$(python3 -c "import yaml; print(yaml.safe_load(open('.raca/config.yaml'))['dashboard']['url'])" 2>/dev/null)

if [ -n "$DASHBOARD_URL" ]; then
    curl -s -X POST "${DASHBOARD_URL}/api/experiments/sync"
else
    echo "No dashboard URL configured — skipping remote refresh"
fi
```

## Step 4: Report what was synced

Tell the user:

```
Dashboard synced:
  Experiments: N experiments updated
  Artifacts: list any new HF datasets found (from HUGGINGFACE_REPOS.md)
  URL: <dashboard_url> (if configured)
```

If the sync URL call returns an error (e.g., Space is sleeping), note it but don't treat it as a failure — the data is still updated in the HF dataset and will appear when the Space wakes.

## Step 5 (code changes only): Deploy updated frontend/backend

Data syncs do NOT require a build or deploy. Only run this if frontend or backend source files were also modified in this session:

```bash
cd tools/visualizer/frontend && npm run build
cd tools/visualizer
git add backend/ frontend/src/ frontend/dist/ scripts/
git commit -m "update dashboard"
git push origin main
git push space main
```

Only do this if the user has explicitly made code changes to the visualizer — not for routine data syncs.
