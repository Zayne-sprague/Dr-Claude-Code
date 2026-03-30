---
name: experiment-management
description: |
  Activated when users discuss experiments — designing, running, reviewing, or managing them.
  Enforces the experiment lifecycle, folder structure, and documentation standards.
  This skill ensures every experiment is properly structured, tracked, and reproducible.
---

# Experiment Management

This skill is activated whenever the user talks about experiments. It reinforces the rules in `.claude/rules/experiments.md` and ensures the proper folder structure, documentation, and lifecycle are followed.

## Experiment Folder Structure

Every experiment lives at `notes/experiments/<experiment-name>/`. Create this structure:

```
notes/experiments/<name>/
├── experiment.yaml          # Config: hypothesis, models, tasks, conditions
├── EXPERIMENT_README.md     # What this experiment is about, results, conclusions
├── HUGGINGFACE_REPOS.md     # Table of all HF datasets produced (newest first)
├── questions.md             # Research questions (READ ONLY — never edit)
├── red_team_brief.md        # What could go wrong, validation criteria
├── flow_state.json          # Current phase + state (machine-readable)
├── activity_log.jsonl       # Timeline of events (append-only)
├── user/                    # User's personal notes
│   ├── README.md            # User's interpretation and notes
│   ├── FINDINGS.md          # Key findings and takeaways
│   ├── DECISIONS.md         # Design decisions and rationale
│   └── summary.md           # Executive summary
└── experiments/             # Sub-experiments (focused follow-ups)
    └── <sub-name>.md
```

### When creating a new experiment:

1. Create the directory: `notes/experiments/<name>/`
2. Write `experiment.yaml` with hypothesis, model(s), task(s), conditions
3. Write `EXPERIMENT_README.md` with background, hypothesis, success criteria
4. Write `questions.md` with the research questions driving this experiment
5. Draft `red_team_brief.md` with the user — what could go wrong, what to validate
6. Create `flow_state.json` with initial state: `{"phase": "design", ...}`
7. Create empty `activity_log.jsonl`
8. Create empty `HUGGINGFACE_REPOS.md` with header row
9. Create `user/` directory with template files

## experiment.yaml

```yaml
name: <experiment-name>
hypothesis:
  statement: "One-line hypothesis"
  type: comparative | exploratory | confirmatory
  status: active | concluded | inconclusive
  success_criteria: "What would confirm/reject this"

config:
  models:
    - Qwen/Qwen3-1.7B
  evaluation:
    task: countdown
    n_samples: 100
    max_tokens: 4096
  conditions:
    - name: baseline
      description: "Standard prompting"

observability:
  tags: [countdown, reasoning, onboarding]
  wandb_project: ""
```

## flow_state.json

```json
{
  "phase": "design",
  "hypothesis": "One-line hypothesis",
  "next_action": "What needs to happen next",
  "redteam_status": "pending",
  "last_validated_artifact": null,
  "updated": "2026-03-30T00:00:00Z"
}
```

Valid phases: `design`, `redteam`, `canary`, `validate`, `running`, `review`, `complete`

## Lifecycle Flow

```
DESIGN → REDTEAM → CANARY → VALIDATE → RUN → VALIDATE → REVIEW → NEXT
```

Read `.claude/rules/experiments.md` for the full lifecycle rules. Key hard gates:

- **No compute without red-team.** `redteam_status` must be `pass` before any job submission.
- **No analysis before validation.** Every artifact must pass data-validator.
- **No silent parameter changes.** Any change to max_tokens, batch size, sample count, model requires user approval.

## Activity Log Format

Append to `activity_log.jsonl` on every significant event:

```json
{"timestamp": "2026-03-30T00:00:00Z", "phase": "design", "event": "experiment_created", "message": "Created experiment with Qwen3-1.7B on Countdown", "author": "claude"}
{"timestamp": "2026-03-30T00:05:00Z", "phase": "redteam", "event": "redteam_pass", "message": "Red team review passed", "author": "claude"}
{"timestamp": "2026-03-30T00:10:00Z", "phase": "canary", "event": "job_submitted", "message": "Canary job submitted: 5110572 on torch l40s_courant", "run_ids": ["torch:5110572"], "author": "claude"}
```

## HUGGINGFACE_REPOS.md Format

```markdown
# HuggingFace Repositories

| Dataset | Date | Rows | Purpose |
|---------|------|------|---------|
| [org/exp-canary-v1](https://huggingface.co/datasets/org/exp-canary-v1) | 2026-03-30 | 10 | Canary run |
| [org/exp-results-v1](https://huggingface.co/datasets/org/exp-results-v1) | 2026-03-30 | 100 | Full results |
```

Newest first. Every HF upload gets a row here.

## User Notes (user/ directory)

The `user/` directory is for the researcher's personal notes. Claude helps scaffold these but the user owns the content.

### user/README.md
```markdown
# <Experiment Name> — Notes

## What I'm investigating
<User writes their understanding of the experiment>

## Key observations
<User notes what they see in the data>

## Open questions
<Things to follow up on>
```

### user/FINDINGS.md
```markdown
# Findings

## Key Results
- <Finding 1>
- <Finding 2>

## Surprising Results
- <Anything unexpected>

## Null Results
- <What didn't work and why>
```

### user/DECISIONS.md
```markdown
# Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-30 | Used Qwen3-1.7B | Small enough for quick iteration |
```

### user/summary.md
```markdown
# Summary

<One paragraph summary of the experiment and its outcome>

## Status: <active | concluded | inconclusive>

## Next Steps
- <What to do next based on findings>
```

## When the User Mentions Experiments

Whenever the user talks about experiments, check:

1. **Does the experiment folder exist?** If not, offer to create it.
2. **Read `flow_state.json`** — what phase are we in?
3. **Read the benchmark reference** for the task (`.claude/references/datasets_and_tasks/`)
4. **Enforce the lifecycle** — don't skip phases.
5. **Update state** on every phase transition.
6. **Invoke `/drcc:dashboard-sync`** after any artifact or state change.

## Artifact Chain (mandatory after every output)

1. Upload to HF
2. Verify (load back, check row count, sample rows)
3. Validate (dispatch data-validator agent)
4. Sync dashboard (`/drcc:dashboard-sync`)
5. Log to activity_log.jsonl

If you produced an artifact and didn't run this chain, go back and do it.
