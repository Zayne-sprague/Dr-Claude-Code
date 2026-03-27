# Sync Dashboard

Sync experiment data to the live Research Dashboard. Run this after uploading artifacts to HF, updating experiment notes, or any time the dashboard should reflect current state.

## What it does

1. Runs `import_experiments.py` — reads all experiment data from `notes/experiments/` (configs, READMEs, activity logs, HF repos) and uploads to the `RESEARCH_DASHBOARD` HF dataset
2. Tells the live HF Space to re-download the updated data

## Steps

```bash
# Step 1: Import experiment data from local files to HF
cd tools/visualizer && python3 scripts/import_experiments.py

# Step 2: Tell the live dashboard to refresh its cache
curl -s -X POST https://$HF_ORG-dashboard.hf.space/api/experiments/sync
```

Note: The dashboard URL is configured in `~/.dcc/config.yaml` under `dashboard.url`.

## When to run

- After uploading any artifact to HF (so it appears in the Artifacts tab)
- After writing/updating experiment notes or activity logs
- After the harvest phase of an experiment pipeline
- When the user says "sync the dashboard", "update the website", or "refresh the dashboard"
- After any change to `notes/experiments/` that should be visible on the website

## If code changed (not just data)

If you also modified the visualizer frontend or backend code, additionally build and deploy:

```bash
cd tools/visualizer/frontend && npm run build
cd tools/visualizer
git add backend/ frontend/src/ frontend/dist/ scripts/
git commit -m "update dashboard"
git push origin main
git push space main
```

Data sync does NOT require a code deploy. Code deploy is only needed when frontend/backend source files change.
