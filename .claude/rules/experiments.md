# Experiments

You help:
- Design experiments
- Red-team experiments (find failure cases and build test jobs called canarys via `/raca:experiment-preflight`)
- Find and schedule jobs on compute clusters or service providers
- Monitor jobs for any changes and outputs
- Alert the user of outputs, analysis, bugs, etc. 
- Resubmit jobs with bug fixes until the experiment is setup correctly
- Keep the dashboard synced up with latest timeline information and artifacts.

When a user asks about any of these things in anyway, you should find the experiment they are talking about in `notes/experiments`, and check where the experiment is at currently. Then help the user.

Often times a user may have had an experiment that did not follow best practices as outlined in our rules. You should always fix and spot any issues with how the experiment is being handled to prevent bugs from ruining the experiements output.

## When Experiments Come Up

Any time the user discusses an experiment (designing, running, reviewing, or even
casually exploring an idea), the `experiment-management` skill must be active. It
handles folder creation, dashboard sync, and state tracking.

The key rule: **create the experiment folder immediately.** Do not wait for the design
to be "complete." Create it as soon as the conversation turns to a concrete experimental
question. The folder is where all plans, briefs, artifacts, and notes accumulate.
If it doesn't exist, things get lost.

After creating or loading the experiment folder, sync the dashboard via
`/raca:dashboard-sync` so it's visible.

This works alongside any design or planning tools. Those handle the conversation;
the experiment-management skill handles the infrastructure.

## Flow

Track state in `notes/experiments/<exp>/flow_state.json`. Read it on session start.
Update it on every phase transition.

```
DESIGN → REDTEAM → CANARY → VALIDATE → RUN → VALIDATE → REVIEW → NEXT
                                                 ↑           |
                                        (each partial)       ↓
                                                        back to DESIGN
```

**DESIGN**: This is the brainstorming stage and you should encourage the user to articulate their main question. Then, you should repeatedly ask and double check that the question they are asking is not solved already with previous literature. Try to ground their ideas in what exists constantly. This process must go from a users fuzzy thoughts on something to a concrete implementable plan that can run on a compute cluster and produce some output. The output MUST BE VISUALIZABLE. This is the last step of design. Ensure the dashboard website `/tools/visualizer` can render the artifacts that are produced by the experiment or if not, make an implementation plan to create one.

Smallest run that tests the hypothesis. What does success/failure look like?
Before designing a big experiment, check the literature — has someone answered this?
Could we just use their results? Write plan to `EXPERIMENT_README.md`, draft `red_team_brief.md` with user.

**REDTEAM**: Dispatch `red-team-reviewer`. Cannot skip without user override (log skip with `author: user`).

**CANARY**: 5-10 samples. Upload to HF. Then validate.

**VALIDATE**: Every time an artifact lands — canary, partial, or final — run the artifact chain (below).
Dispatch `data-validator`. You also review for scientific substance. If bad → stop and fix.

**RUN**: Submit jobs. When partials land → VALIDATE → assess signal → go/no-go in activity log.
If bugs found mid-run: stop remaining jobs, fix, re-run. Don't burn compute on broken data.

**REVIEW**: What did we find? Show specific data and examples. Write to `EXPERIMENT_README.md`.

**NEXT**: Signal → scale up. No signal → wrong test or dead idea? Unexpected → new hypothesis.

<critical>
Every job must produce artifacts intermediately when it runs for more than an hour. This is to ensure we are not wasting compute. We want to see these intermediate outputs and alert the user of them right when they are produced. You must monitor for these via `/loop` or other mechanisms. A job that does not produce intermediate results MUST BE REFACTORED. Missing intermediate artifacts IS A FAILURE MODE.
</critical>

## Flow State

```json
{
  "phase": "running",
  "hypothesis": "One-line hypothesis",
  "next_action": "What needs to happen next",
  "redteam_status": "pass | pending | skipped-by-user",
  "last_validated_artifact": "org/dataset-name",
  "updated": "2026-03-24T15:30:00Z"
}
```

## The Artifact Chain

Every artifact produced — canary, partial, or final. No exceptions. **This is a step in the
flow, not optional bookkeeping.**

1. **Upload** to HF via `push_dataset_to_hub()` with full metadata and column docs
2. **Verify** — load back from HF, check row count, sample 3-5 rows, inspect content
3. **Validate** — dispatch `data-validator`
4. **Sync dashboard** — `/raca:dashboard-sync`
5. **Log** — activity log entry with counts, token lengths, score ranges

If you produced an artifact and didn't run this chain, you skipped a step. Go back.

## The Dashboard Is the Control Plane

The visualizer (`tools/visualizer/`, live at HF Space) is where the user
monitors experiments. It shows READMEs, timelines, artifacts, everything. It is open 24/7.

**Every state change must be visible on the dashboard.** If you uploaded data, updated notes,
logged to the activity log, or changed experiment status: run `/raca:dashboard-sync`. If the user
can't see it on the website, it didn't happen.

## Artifact Health

<critical>
- NEVER truncate model outputs. Store FULL output always. No `text[:500]`, no post-processing.
- ALWAYS use the model's maximum supported generation length. Below 8192 for generative tasks
  is almost certainly wrong. Thinking models (Qwen3, DeepSeek-R1): 32k-128k.
- ALWAYS upload artifacts to HF immediately after creation. N artifacts for N outputs, never combine.
- Datasets >25GB: flag to user before upload.
- Training metrics go to wandb. Everything else goes to HF. Label all runs (dev and production).
- When OOM or timeout: fix root cause (grad accum, TP, offloading). NEVER shrink generation
  length, reduce batch size, or skip samples.
</critical>

## Hard Gates

- **No compute without red-team.** If `redteam_status` is `pending`, do not submit any job.
- **No analysis before validation.** Latest artifact must have data-validator CLEAN.
- **No silent parameter changes.** Any change to max_tokens, batch size, sample count, epochs,
  temperature, or model requires user approval.

## Streaming & Partial Results

Jobs >1 hour MUST upload partial results to HF as they run:
- Inference: every ~30 min or N samples
- Training: wandb metrics real-time + checkpoints every N steps
- Eval: scored results incrementally

Between sequential jobs: validate partials (sample rows, check truncation, scores).
If flawed — kill remaining jobs NOW. Log go/no-go to activity log.

The user should NEVER wait until a job finishes to see what's happening.

## Job Design

- Short resumable jobs (4-8h) over long jobs. They schedule faster and produce partials.
- Scripts must be resumable from checkpoints. Training: frequent checkpoints. Inference: append JSONL.
- Before submitting: model name correct, max_tokens adequate, reward function tested on >=2 examples, checkpointing enabled, wandb configured.

## Pipeline Commands

Invoke these at the right transition points regardless of how the experiment was designed
(freeform conversation, brainstorming plugins, planning tools, etc.). The pipeline is the
same no matter how you arrive at the experimental design.

- **After design is complete** → invoke `/raca:experiment-preflight` (red-team + canary validation)
- **When preflight passes** → submit jobs, invoke `/loop` to monitor
- **After jobs complete** → invoke `/raca:harvest-and-report` (download, validate, upload artifacts)
- **After any artifact upload or state change** → invoke `/raca:dashboard-sync`

If a design or planning tool (any plugin, skill, or manual conversation) produces an
experimental design, these commands are the next step. Do not wait for the user to ask.

## Autonomous Boundaries

**Can do**: Fix OOM (grad accum, TP, offloading), retry transient errors, install deps,
resume from checkpoints, alternate partitions, download/upload/visualize results.

**Cannot do without user**: Change experimental parameters, switch models, skip conditions,
switch clusters, exceed compute budget, modify Red Team Brief.
