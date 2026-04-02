# Welcome to RACA

This is a sample experiment to show you how the dashboard works. You're looking at the **Overview** tab right now — it displays the experiment's README (this file).

Everything you see here is generated from plain files in `notes/experiments/onboarding/`. You can browse them in your editor anytime.

## How This Dashboard Works

Each experiment has several tabs at the top. Here's what they do:

### Overview (you are here)

Displays the experiment's README and any notes you've written in the `user/` folder. This is the main landing page for each experiment — a summary of what the experiment is, what you're investigating, and what you found.

### Red Team Brief

Before any experiment runs, RACA reviews the design for potential problems — wrong evaluation metrics, truncated outputs, missing baselines, wasted compute. The brief lives at `red_team_brief.md`. This tab will be empty until you run your first real experiment.

### Timeline

A chronological log of everything that happened: when jobs were submitted, when artifacts were uploaded, when bugs were found and fixed. This is auto-generated from `activity_log.jsonl` — RACA writes to it as events happen.

### Runs

Tracks each job submission — which model, which cluster, what status (pending, running, completed, failed), and links to the HuggingFace dataset with the results. Empty until you run something.

### Artifacts

Links to all HuggingFace datasets produced by this experiment — canary runs, partial results, final data. Each artifact has metadata about what generated it. Empty until artifacts are uploaded.

### Files

All the markdown and YAML files in the experiment folder. Click any file to read it. This is a quick way to browse the experiment's configuration and notes without leaving the dashboard.

## Folder Structure

```
notes/experiments/onboarding/
  EXPERIMENT_README.md    ← this file (shows in Overview tab)
  experiment.yaml         ← config: hypothesis, models, tasks
  flow_state.json         ← current phase (design/running/complete)
  HUGGINGFACE_REPOS.md    ← links to all uploaded datasets
  questions.md            ← research questions (read-only)
  red_team_brief.md       ← created during preflight review
  activity_log.jsonl      ← timeline entries (auto-generated)
  user/                   ← YOUR notes — RACA doesn't touch these
    README.md             ← your interpretation and observations
    FINDINGS.md           ← key results and surprises
    DECISIONS.md          ← design decisions and rationale
    summary.md            ← one-paragraph summary when done
```

**Most of this is automated.** RACA creates and updates the experiment files, uploads artifacts, and keeps the timeline current. The only files you write are in `user/` — that's your space for notes, findings, and decisions.

## What's Next

This sample experiment hasn't been run yet — it's just here to show you the structure. When you're ready to run a real experiment, just tell RACA:

> *I want to test whether Qwen3-8B follows complex instructions better than Llama-3.1-8B*

Or try the full guided tutorial:

> */raca:experiment-tutorial*
