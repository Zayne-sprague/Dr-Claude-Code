# Experiments — Detailed Reference

## How to Think About Each Phase

### DESIGN
- What specific question are we answering?
- What is the **smallest run** that gives signal? Not the full matrix — the 1-2 condition proof of concept.
- What artifacts will we produce? What does each one look like?
- What does success look like? What does failure look like?
- Check literature: has someone done this? Could we use their results?
- Write plan to `EXPERIMENT_README.md`, draft `red_team_brief.md` with user.

### REDTEAM
- Dispatch `red-team-reviewer` with: Red Team Brief, experiment.yaml, code, dry-run output
- Mode: `full` for production, `fast-pass` for canary
- If FAIL: fix findings, re-submit. If PASS: record in flow state + activity log.

### CANARY
- Run locally or submit very short job
- Produce actual output artifacts (even if tiny)
- Upload to HF immediately, then validate

### VALIDATE
- Dispatch `data-validator` on the artifact
- YOU also review: does the content make scientific sense? Not just format — substance.
- If wrong: diagnose, fix, re-run. If right: proceed. Sync dashboard.

### RUNNING — Between-Job Evaluation
1. Dispatch `data-validator` on partial artifact — is data healthy?
2. YOU review partials — is there signal? Should we continue or pivot?
3. Log assessment to activity log
4. If corrupted/degenerate: STOP remaining jobs, diagnose, fix
5. If good but no signal: discuss with user — continue or cut losses?

### REVIEW
- Does it support or contradict the hypothesis?
- What's surprising or unexpected?
- Show specific examples and distributions — don't summarize
- Write findings to `EXPERIMENT_README.md`
- Confounds? Alternative explanations?

### NEXT
- Signal found, need more data → design full experiment (back to DESIGN)
- Signal found, need refinement → follow-up targeting specific finding
- No signal → dead idea or wrong test? Different approach?
- Unexpected finding → new hypothesis

## Mindset

- Not a pipeline executor. Think scientifically.
- Show data and examples, not summaries.
- Don't skip validation because results "look fine."
- Don't design the full experiment before proving the core idea works.
- Don't reduce parameters to make things easier — run fewer conditions instead.

## Flow State Schema (Full)

```json
{
  "phase": "running",
  "step": "between-job-eval-batch-2",
  "completed": ["design", "redteam", "canary", "canary-review"],
  "skipped": [],
  "blocked": null,
  "hypothesis": "One-line hypothesis being tested",
  "artifacts": {
    "canary-v1": {"status": "validated", "hf": "org/dataset-canary-v1"},
    "batch-1": {"status": "validated", "hf": "org/dataset-batch-1"},
    "batch-2": {"status": "pending-validation", "hf": "org/dataset-batch-2"}
  },
  "jobs": {
    "84921": {"cluster": "empire", "status": "completed"},
    "84935": {"cluster": "empire", "status": "running"}
  },
  "next_action": "Validate batch-2 partial results, check for entropy collapse signal",
  "updated": "2026-03-24T15:30:00Z"
}
```

## Dispatching Agents

**Red-team reviewer** (REDTEAM phase):
- Pass: red_team_brief.md, experiment.yaml, experiment script, dry-run output
- Mode: `full` for production, `fast-pass` for canary

**Data-validator** (VALIDATE phase):
- Pass: validation criteria from red_team_brief.md, 20-50 row sample, expected schema

## Infrastructure

- **Job submission**: `exp run` (auto compute discovery) or `sbatch`
- **Compute discovery**: `jtk find-compute --gpus N --plugin X --time Xh`
- **SSH**: `python3 -m experiment_runner.cli ssh <cluster> "<cmd>"` — NOT raw ssh
- **HF uploads**: `hf_utility.push_dataset_to_hub()` with full metadata
- **Dashboard**: `exp dashboard update/show/job-submitted/job-completed`
- **Sync**: `/sync-dashboard` (import_experiments.py + curl sync endpoint)
- **Activity log**: `notes/experiments/<exp>/activity_log.jsonl`
- **Inference**: `inference_engine.InferenceEngine`
- **API keys**: `key_handler.KeyHandler`

## Scaffolding

```bash
exp init <experiment-name> --project <project-name> --create-project
```

Creates in `notes/experiments/<name>/`:
- `experiment.yaml`, `EXPERIMENT_README.md`, `HUGGINGFACE_REPOS.md`, `experiments/`

After scaffolding: plan artifacts in README, write red_team_brief.md, create flow_state.json.

## Activity Log Format

`activity_log.jsonl` — feeds the website timeline.

```json
{"timestamp": "...", "scope": "baseline-qwen3", "type": "result",
 "message": "Between-job verification: score/mean 0.714→0.822, entropy stable. GO.",
 "artifacts": [], "run_ids": ["925062"], "author": "agent"}
```

Types: `action`, `result`, `note` (user-requested), `milestone`.
Scope: run label, `debug`, `cross-run`, `meta`.

## Dashboard Commands

| Event | Command |
|-------|---------|
| Begin managing | `exp dashboard update <exp> --status active --message "..."` |
| Submit job | `exp dashboard job-submitted <exp> --job <id> --cluster <c> --gpus <n>` |
| Job completes | `exp dashboard job-completed <exp> --job <id> --metrics '{...}'` |
| Blocked | `exp dashboard blocked <exp> --job <id> --reason "..."` |
| Job fails | `exp dashboard job-failed <exp> --job <id> --reason "..."` |
| Session ends | `exp dashboard update <exp> --status paused --message "..."` |
| All done | `exp dashboard update <exp> --status completed --message "..."` |

## Syncing the Dashboard

```bash
cd tools/visualizer && python3 scripts/import_experiments.py
curl -s -X POST https://$HF_ORG-agg-trace-visualizer.hf.space/api/experiments/sync
```

`/sync-dashboard` does both. Run after every artifact upload, note update, or state change.

## Session Protocol

1. Read `flow_state.json` + `experiment.yaml`. `exp dashboard show <exp>`. Update to active.
2. Before run: follow flow phases. Don't skip to `exp run`.
3. During: update dashboard. Don't poll obsessively.
4. Failure: diagnose first. Dashboard blocker. No degraded retries.
5. Session end: update flow_state with next_action. Dashboard to paused.

## Post-Upload Verification (Detail)

After every upload, before continuing:

1. **Visibility**: Load from HF, confirm accessible, row count matches
2. **Visualization**: Renders in declared visualizer type, columns present
3. **Data integrity** — sample 3-5 rows:
   - Inference: full-length responses? Complete (not cut mid-sentence)? Thinking trace present?
   - Eval: scores in expected ranges? Varying (not all identical)?
   - Input: prompts well-formed? Correct format?
   - Configs: all expected parameters present?
4. **Log**: activity log with: "Verified X: N rows, avg Y tokens, scores [A, B]"

## Artifact Type Taxonomy

| Type | Description | Destination |
|------|-------------|-------------|
| `input_data` | Prompts, datasets fed to models | HF |
| `inference_output` | Raw model responses — full, untruncated | HF |
| `training_config` | YAML configs, hyperparameters | HF |
| `canary_output` | Preflight dry-run results | HF |
| `eval_result` | Scored outputs from evals | HF |
| `processed_data` | Computed scores, aggregations | HF |
| `training_metrics` | Loss curves, reward curves | **wandb** |

## Red Team Brief

- Write collaboratively with user (~5-10 min)
- Once autonomous execution starts, brief is locked
- Fix infrastructure autonomously, CANNOT change experimental parameters

## Scratch Cleanup

1. SSH, `myquota`
2. `squeue` — never touch running job files
3. Candidates: completed checkpoints, merged weights, experiment envs (export yml first), caches, stale HF caches (>30d)
4. Present list — ASK before removing
5. `myquota` again, log removals

## Visualizer

- Path: `tools/visualizers/agg_visualizer/`
- Live: `$HF_ORG/agg-trace-visualizer`
- Presets: `$HF_ORG/AGG_VIS_PRESETS`
- The dashboard is the primary way the user monitors experiments — keep it current

## Conductor Handoff

Write to `notes/experiments/<exp>/handoffs/`: summary, takeaways, action items, artifact links.
