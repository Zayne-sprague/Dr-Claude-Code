---
description: "Post-run harvest: download results, validate, upload to HF, sync dashboard, alert user. Run when artifacts are produced — don't wait for job completion."
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "WebFetch"]
argument-hint: "<experiment-name> [--job-id <id>]"
---

# Harvest & Report

Run this whenever an experiment produces artifacts — partial results during a job, final results after completion, or anything in between. Don't wait for the job to finish.

This is a FLEXIBLE workflow — adapt to the experiment type, but never skip validation or dashboard sync.

## Step 1: Get the artifacts

If the job is on a cluster:
```bash
raca ssh <cluster> "ls <working_dir>/results/"
raca download <cluster> <working_dir>/results/ ./local_results/<experiment>/
```

If artifacts are already local, just locate them.

## Step 2: Validate

Read the Red Team Brief at `notes/experiments/<experiment>/red_team_brief.md`.

Dispatch a `data-validator` subagent:
- Pass the validation criteria from the brief
- Sample 20-50 rows
- Check for: truncation, degenerate repetition, suspicious scores, format violations, missing fields

**You also review**: does the data make scientific sense? Not just format — substance. Compare against what the experiment was supposed to produce.

Anomalies don't block the harvest — they get flagged. But critical issues (all outputs truncated, wrong model loaded, scores nonsensical) should be raised to the user immediately.

## Step 3: Upload to HuggingFace

```python
from hf_utility import push_dataset_to_hub

push_dataset_to_hub(
    dataset=dataset,
    dataset_name="<experiment-slug>-<description>-<version>",
    experiment_slug="<experiment-slug>",  # must match experiment folder name
    metadata={
        "script_name": "<the script that generated this>",
        "model": "<model used>",
        "description": "<what this dataset contains — note if partial>",
        "experiment_name": "<experiment-slug>",
        "job_id": "<cluster:job_id>",
        "cluster": "<cluster>",
        "artifact_status": "partial",  # or "final"
        "canary": False,
    },
    tags=["<experiment-name>", "<condition>"],
    column_descriptions={<column: description for each column>},
)
```

Follow `.claude/rules/huggingface.md`.

For partial results during a running job: **append to the existing HF dataset** rather than creating a new repo each time. But still alert the user that new rows are available.

## Step 4: Update experiment files

1. Add the dataset to the TOP of `notes/experiments/<experiment>/HUGGINGFACE_REPOS.md`
2. Update `EXPERIMENT_README.md` with: run details, metrics, data quality notes, HF link
3. Update `flow_state.json` with current phase and last validated artifact
4. Append to `activity_log.jsonl` with: what was in the artifact, validation status, row count, token lengths, score ranges

## Step 5: Sync dashboard

```
/raca:dashboard-sync
```

The user should see the new artifact on the dashboard immediately. If they can't see it, it didn't happen.

## Step 6: Alert the user

Tell them:
- What artifact was produced (partial or final)
- How many rows, key metrics
- Any anomalies flagged by validation
- Where to see it (dashboard URL, HF link)
- Whether the job is still running or complete

**Get data in front of the user as fast as possible.** This is the whole point.
