# Experiments — Detailed Reference

## How to Think About Each Phase

Users may enter at any stage. The flow is a guide, not a rigid pipeline. But red-teaming and validation are non-negotiable.

### DESIGN
- What specific question are we answering?
- What is the **smallest run** that gives signal? Not the full matrix — the 1-2 condition proof of concept.
- What artifacts will we produce? Can the dashboard visualize them? If not, plan the visualizer work too.
- What does success look like? What does failure look like?
- Check literature: has someone done this? Could we use their results?
- Write plan to `EXPERIMENT_README.md`, draft `red_team_brief.md` with user.

### REDTEAM
- Triggered anytime the experiment changes meaningfully (new model, new baseline, new approach — anything that needs compute again)
- Dispatch `red-team-reviewer` with: Red Team Brief, experiment.yaml, code, dry-run output
- Produces or updates `red_team_brief.md` — exposes failure modes and how to avoid them
- Proposes a canary job
- Cannot skip without user override (log skip with `author: user`)

### CANARY
- Mini job: 1-2 hours, few outputs, but touches the entire pipeline end-to-end
- MUST produce an actual artifact that gets uploaded to HF and reviewed
- Purpose: catch bugs, validate format, confirm logic before burning real compute
- Even if the experiment doesn't need a cluster, do a small-scale version

### VALIDATE
- Be extremely observant during any job (canary or production)
- As artifacts arrive: inspect them, compare against `red-team-brief.md`, alert the user
- Fix obvious bugs (crashes, no output). Be proactive about bad data too (truncation, wrong format, suspicious scores)
- Dispatch `data-validator` on every artifact

### RUN
- Use `run-job` skill for job lifecycle
- Monitor via `/loop` — especially for jobs stuck in PENDING
- Keep all experiment files up to date (`activity_log.jsonl`, `flow_state.json`, `HUGGINGFACE_REPOS.md`, `EXPERIMENT_README.md`)
- Sync dashboard after every state change
- Save everything needed to reproduce: sbatch scripts, model params, training configs. Think: "In a year, what would we need to rerun this?"

### REVIEW
- Get data in front of the user as fast as possible, in the most useful visual form
- Upload partial results as they arrive — don't wait for completion
- Show specific examples and raw data. Trust is established by transparency, not summaries.
- Write findings to `EXPERIMENT_README.md`

### NEXT
- Signal found → scale up or design follow-up (back to DESIGN)
- No signal → wrong test or dead idea? Different approach?
- Unexpected finding → new hypothesis
- Let the user drive. Ensure all artifacts are clean and up-to-date on the dashboard.

## Mindset

- Not a pipeline executor. Think scientifically.
- Show data and examples, not summaries.
- Don't skip validation because results "look fine."
- Don't design the full experiment before proving the core idea works.
- Don't reduce parameters to make things easier — run fewer conditions instead.
- GET DATA TO THE USER AS FAST AS POSSIBLE.

## Flow State Schema

```json
{
  "phase": "running",
  "hypothesis": "One-line hypothesis being tested",
  "next_action": "What needs to happen next",
  "redteam_status": "pass | pending | skipped-by-user",
  "last_validated_artifact": "org/dataset-name",
  "updated": "2026-03-24T15:30:00Z"
}
```

## Activity Log Format

`activity_log.jsonl` — feeds the website timeline.

```json
{"timestamp": "...", "scope": "baseline-qwen3", "type": "result",
 "message": "Partial results: 50 rows uploaded, avg 1.2k tokens. Scores look healthy.",
 "artifacts": ["org/dataset-v1"], "run_ids": ["925062"], "author": "agent"}
```

Types: `action`, `result`, `note` (user-requested), `milestone`.

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

## Post-Upload Verification

After every upload, before continuing:

1. **Visibility**: Load from HF, confirm accessible, row count matches
2. **Data integrity** — sample 3-5 rows:
   - Inference: full-length responses? Not cut mid-sentence? Thinking trace present?
   - Eval: scores in expected ranges? Varying (not all identical)?
   - Input: prompts well-formed? Correct format?
3. **Log**: activity log entry with counts, token lengths, score ranges
4. **Dashboard**: `/raca:dashboard-sync`
