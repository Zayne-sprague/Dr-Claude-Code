# Welcome to Your Dashboard

This is a sample experiment to show you how the dashboard works. Everything you see here is generated from plain files in `notes/experiments/onboarding/`.

## Dashboard Tabs

Each experiment has tabs at the top:

- **Overview** — the experiment's README and your notes (you're reading this now)
- **Red Team Brief** — RACA reviews experiment designs for problems before running. Empty until your first real experiment.
- **Timeline** — chronological log of everything that happened (auto-generated from `activity_log.jsonl`)
- **Runs** — tracks each job submission: model, cluster, status, HuggingFace dataset links
- **Artifacts** — links to all HuggingFace datasets produced by this experiment
- **Files** — browse all experiment files without leaving the dashboard

## What's Automated vs What You Write

Most of this is automated. RACA creates and updates experiment files, uploads artifacts, and keeps the timeline current.

The `user/` folder is yours — RACA doesn't touch it:
- `user/FINDINGS.md` — key results and surprises (this file)
- `user/README.md` — your interpretation and observations
- `user/DECISIONS.md` — design decisions and rationale
- `user/summary.md` — one-paragraph summary when done

## What's Next

This sample experiment hasn't been run yet — it's here to show you the structure. When you're ready:

> *I want to test whether Qwen3-8B follows complex instructions better than Llama-3.1-8B*

Or try the full guided tutorial: `/raca:experiment-tutorial`
