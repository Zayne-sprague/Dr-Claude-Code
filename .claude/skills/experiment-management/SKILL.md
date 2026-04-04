---
name: experiment-management
description: |
  Activated when users discuss experiments — designing, running, reviewing, or managing them.
  Handles folder creation, dashboard sync, state tracking, and lifecycle enforcement.
  Users may enter at any stage. Meet them where they are, but ensure red-teaming
  and validation happen before compute runs.
---

# Experiment Management

This skill is activated whenever the user talks about experiments. Read `.claude/rules/experiments.md` for the full rules. This skill handles the infrastructure — folder structure, dashboard sync, state tracking.

## Coordination with Other Design Skills

When the user is **designing** an experiment, another design/brainstorming skill may also be active (e.g., `superpowers:brainstorming`). If so, the two are not in conflict — they handle different concerns:

- **The design skill** drives the *conversation*: clarifying questions, proposing approaches, presenting design, getting approval.
- **This skill** drives the *infrastructure*: folder creation, dashboard sync, state tracking, lifecycle gates.

**When a design skill is active alongside this one:**

1. The design skill runs the conversation — questions, approaches, design presentation.
2. The experiment folder is still created **immediately** by this skill — don't wait for the design process to finish.
3. The design spec goes to `EXPERIMENT_README.md` in the experiment folder, NOT the design skill's default spec location (e.g., `docs/superpowers/specs/`). This skill's output location takes precedence for experiments.
4. After the user approves the design, the next step is the **experiment lifecycle** (update `flow_state.json` → `/raca:experiment-preflight` → canary → run), NOT the design skill's default next step (e.g., `writing-plans`). If implementation planning is needed for experiment code, it can be used within the lifecycle, but the experiment flow owns the top-level sequence.

**When no design skill is active:** This skill handles the full design conversation itself, following the flow defined in `.claude/rules/experiments.md`.

## Experiment Folder Structure

Every experiment lives at `notes/experiments/<experiment-name>/`. Create this structure **immediately** when a conversation turns to a concrete experiment — do not wait for the design to be "complete":

```
notes/experiments/<name>/
├── experiment.yaml          # Config: hypothesis, models, tasks, conditions
├── EXPERIMENT_README.md     # What this experiment is about, results, conclusions
├── HUGGINGFACE_REPOS.md     # Table of all HF datasets produced (newest first)
├── questions.md             # Research questions (READ ONLY — never edit)
├── red_team_brief.md        # What could go wrong, validation criteria
├── flow_state.json          # Current phase + state (machine-readable)
├── activity_log.jsonl       # Timeline of events (append-only)
├── user/                    # User's personal notes (RACA doesn't touch these)
│   ├── README.md
│   ├── FINDINGS.md
│   ├── DECISIONS.md
│   └── summary.md
└── experiments/             # Sub-experiments (focused follow-ups)
    └── <sub-name>.md
```

After creating or loading the folder, **sync the dashboard** via `/raca:dashboard-sync`.

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

## When the User Mentions Experiments

Users enter at different stages. Some want to design from scratch, others already have code and want to run it, others have results and want to analyze them. **Meet them where they are**, but enforce the non-negotiables:

1. **Does the experiment folder exist?** If not, **create it now.** Don't ask, don't wait.
2. **Sync the dashboard** via `/raca:dashboard-sync` so it's visible immediately.
3. **Read `flow_state.json`** — what phase are we in? Resume from there.
4. **Check the benchmark reference** if the task has one (`.claude/references/datasets_and_tasks/`).
5. **Before any compute**: red-team review must have passed. If it hasn't, run `/raca:experiment-preflight`.
6. **After any artifact**: run the artifact chain (below). No exceptions.

This skill works alongside any design or planning tools. Those handle the *how* of designing. This skill handles the *where* (folder structure, dashboard, state tracking).

## Hard Gates

These cannot be skipped regardless of where the user entered:

- **No compute without red-team.** `redteam_status` must be `pass` before any job submission. If the user wants to skip, log it with `author: user`.
- **No analysis before validation.** Every artifact must pass the data-validator.
- **No silent parameter changes.** Any change to max_tokens, batch size, sample count, model requires user approval.

## Artifact Chain (mandatory after every output)

Every artifact — partial or final, canary or production — gets this treatment immediately:

1. **Upload** to HF via `push_dataset_to_hub()` with metadata, column docs, and `experiment_slug` set to the experiment folder name. All artifacts must be prefixed with the experiment slug (e.g., `scaling-laws-results-v1`). Include provenance metadata (job_id, cluster, artifact_status).
2. **Verify** — load back from HF, check row count, sample rows, compare against `red-team-brief.md`
3. **Validate** — dispatch `data-validator` agent
4. **Sync dashboard** — update `HUGGINGFACE_REPOS.md`, then `/raca:dashboard-sync`
5. **Log** — append to `activity_log.jsonl`
6. **Alert the user** — tell them new data is available and where to see it

Do NOT wait until the job finishes. Process artifacts AS THEY COME IN.

## Activity Log Format

Append to `activity_log.jsonl` on every significant event:

```json
{"timestamp": "2026-03-30T00:00:00Z", "phase": "design", "event": "experiment_created", "message": "Created experiment with Qwen3-1.7B on Countdown", "author": "claude"}
{"timestamp": "2026-03-30T00:10:00Z", "phase": "canary", "event": "job_submitted", "message": "Canary job submitted: 5110572 on torch l40s_courant", "run_ids": ["torch:5110572"], "author": "claude"}
{"timestamp": "2026-03-30T01:00:00Z", "phase": "running", "event": "artifact_uploaded", "message": "Partial results: 50 rows, avg 1.2k tokens, uploaded to HF", "author": "claude"}
```
