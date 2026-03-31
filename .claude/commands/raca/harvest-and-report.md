---
description: "Post-run harvest: download results, validate data, upload to HF, update visualizer, write notes, handoff to conductor"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "WebFetch"]
argument-hint: "<experiment-name> [--job-id <id>]"
---

# Harvest & Report

This command runs the post-completion pipeline for an experiment. It downloads results, validates them, uploads to HuggingFace, updates the visualizer, writes analysis notes, and produces a handoff.

This is a FLEXIBLE workflow — adapt steps to the experiment type, but do not skip validation or handoff.

The experiment name is provided as the argument. Job ID is optional (auto-detected from job list if not specified).

## Step 1: Identify completed job

```bash
raca ssh <cluster> "squeue -u $USER --format='%i %j %T %M' | grep <experiment>"
```

Find the most recent COMPLETED job for this experiment. If `--job-id` was provided, use that specific job.

If no completed job found, STOP. Tell the user.

## Step 2: Download artifacts

Download results from the cluster:

```bash
raca ssh <cluster> "ls <working_dir>/results/"
raca download <cluster> <working_dir>/results/ ./local_results/<experiment>/
```

Store downloaded artifacts at a known local path for subsequent steps.

## Step 3: Adversarial data review

Read the Red Team Brief's "How do I know the results are real?" section at `notes/experiments/<experiment>/red_team_brief.md`.

Dispatch a data-validator subagent via the Agent tool:

```
You are the Data Validator. Review these experiment outputs for quality issues.

Validation criteria (from Red Team Brief):
<paste the "How do I know the results are real?" section>

Data to review:
<paste or reference 20-50 sample outputs from the results>

Check for:
1. Each criterion from the Red Team Brief
2. Degenerate repetition (same tokens/phrases repeated)
3. Suspiciously short or long outputs vs. expected range
4. Reward hacking patterns (high scores with garbage content)
5. Format violations (missing expected fields/columns)
6. Distribution anomalies (all scores identical, unexpected clustering)

Output format:
## Data Validation

**Status:** CLEAN | ANOMALIES_FOUND

**Sample reviewed:** N outputs out of M total

**Findings:**
- [Finding]: [specific anomaly with example] — [severity: info|warning|critical]

**Overall assessment:** [1-2 sentence summary of data quality]
```

Anomalies do NOT block the harvest — they get flagged in the handoff. Continue to Step 4 regardless.

## Step 4: Upload to HuggingFace

```python
from hf_utility import push_dataset_to_hub
import os

push_dataset_to_hub(
    dataset=dataset,
    dataset_name="<experiment>-<description>-<version>",
    org=os.environ["HF_ORG"],
    metadata={
        "script_name": "<the script that generated this>",
        "model": "<model used>",
        "description": "<what this dataset contains>",
        "hyperparameters": {<key params>},
        "input_datasets": [<any input datasets>],
    },
    tags=["<experiment-name>", "<condition>"],
    column_descriptions={<column: description for each column>},
    experiment_doc_link="<link to experiment notes>",
)
```

Follow the HF dataset standards in `.claude/rules/huggingface-datasets.md`.

## Step 5: Update HUGGINGFACE_REPOS.md

Add the new dataset to the TOP of `notes/experiments/<experiment>/HUGGINGFACE_REPOS.md`:

```markdown
## <dataset-name> (YYYY-MM-DD)
- **Rows:** N
- **Purpose:** <brief description>
- **Link:** https://huggingface.co/datasets/$HF_ORG/<dataset-name>
```

## Step 6: Aggregate metrics

Compute summary statistics from the results:
- Primary metric (accuracy, reward, loss, etc.) with mean and std
- Per-condition breakdowns if applicable
- Comparison against hypothesis success criteria from experiment.yaml

Format as a markdown table.

## Step 7: Update visualizer (if applicable)

Determine if this experiment has a visualizer type.

If yes:
1. Create a preset entry for the visualizer:
   ```json
   {"id": "<8-char-hex>", "name": "<experiment> <model>: <description>", "repo": "$HF_ORG/<dataset>", "split": "train"}
   ```
2. Upload preset to HF (append to existing presets, never overwrite)
3. Test locally if possible: start visualizer, verify the data renders

If the experiment doesn't have a visualizer type, skip this step.

## Step 8: Write analysis to notes

Update `notes/experiments/<experiment>/EXPERIMENT_README.md` with:
- Run details: date, cluster, job ID, duration
- Aggregate metrics table (from Step 6)
- Data quality notes (from Step 3 — validator findings)
- Flagged anomalies with specific examples
- HF dataset link
- Visualizer preset link (if applicable)

Do NOT write interpretation or conclusions — that's for the human review session. Stick to facts and measurements.

## Step 9: Write handoff

Create handoff file at `notes/experiments/<experiment>/handoffs/YYYY-MM-DD-HH-MM-ready-for-review.md`:

```markdown
# Experiment Handoff: <experiment-name>
## State: READY_FOR_REVIEW

## Summary
<1-2 sentences: what completed, primary metric, pass/fail against hypothesis>

## Key Takeaways
- <bullet 1: most important finding>
- <bullet 2: notable result or pattern>
- <bullet 3: any anomalies flagged>

## Action Items
- [ ] <what the researcher needs to review or decide>
- [ ] <any follow-up experiments suggested by results>

## Artifacts
- HF dataset: $HF_ORG/<dataset-name>
- Full analysis: notes/experiments/<experiment>/EXPERIMENT_README.md
- Data validation: <N> outputs reviewed, <N> anomalies
```

Send a macOS notification:
```bash
osascript -e 'display notification "Results ready for <experiment>" with title "Research Pipeline"'
```

## Step 10: Update dashboard

Run `/sync-dashboard` to push the updated notes and artifact links to the live dashboard.
