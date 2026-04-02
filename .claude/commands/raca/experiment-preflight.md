---
description: "Pre-flight review: red-team brief, adversarial review, canary job proposal. Run before any compute."
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent"]
argument-hint: "<experiment-name>"
---

# Experiment Pre-flight

Run this before submitting any job that uses compute. It ensures the experiment won't waste GPU hours on bugs, bad configs, or flawed designs.

The experiment name is provided as the argument. If not provided, ask for it.

## Step 1: Locate experiment files

Read:
- `notes/experiments/$EXPERIMENT/experiment.yaml`
- `notes/experiments/$EXPERIMENT/red_team_brief.md` (may not exist yet)
- The experiment code referenced in experiment.yaml

If `experiment.yaml` doesn't exist, create the experiment folder first (use the `experiment-management` skill).

## Step 2: Red Team Brief

If `red_team_brief.md` doesn't exist, **create it now** by reviewing the experiment design. The brief should cover:
- What could go wrong (truncation, wrong eval metric, bad prompt format, OOM, etc.)
- How to validate that results are real
- What a canary job should check

If it already exists and the experiment has changed since it was written, **update it**.

## Step 3: Adversarial review

Dispatch a fresh `red-team-reviewer` subagent. It must NOT receive the design conversation — only the files. This prevents sunk-cost bias.

The reviewer checks:
- Every concern in the Red Team Brief — does the code actually handle it?
- max_tokens, temperature, n_samples — will they produce meaningful results?
- Checkpointing enabled for long jobs?
- Evaluator/reward function matches what the hypothesis needs?
- Output format compatible with HF upload and the dashboard?
- **No `python -c "import X" || pip install` patterns in sbatch scripts** — these hang on GPU nodes due to CUDA init. Use `pip install --quiet` directly.

If the reviewer returns **FAIL**: show findings, fix them, re-run with a NEW subagent. Repeat until PASS.

If the reviewer returns **PASS**: update `flow_state.json` with `redteam_status: "pass"`.

## Step 4: Canary job proposal

Propose a canary job — a small-scale version of the full experiment that:
- Runs for 1-2 hours max
- Produces an actual artifact (uploaded to HF, viewable on dashboard)
- Touches every part of the pipeline the full job will use
- Catches bugs, format issues, logic errors before they waste real compute

### Coverage requirements

The canary MUST cover all domains/conditions in the experiment, not just the first one.

**If the experiment has N domains/tasks/conditions:**
- The canary must touch ALL N (e.g., 5 questions per domain instead of 20 from one domain)
- Each domain may use a different parser, scorer, prompt template, or metadata schema — a single-domain canary cannot catch bugs in the others
- Randomly sample questions (not first-N) to avoid clustering at one difficulty level
- Include at least 1 question from the hardest difficulty per domain

**What to verify per domain:**
- Parser produces correct output (not just "it ran")
- No truncation (`finish_reason != "length"`)
- Metadata deserialization works (e.g., JSON string vs dict)
- Score distribution is plausible (not all 0 or all 1)

**A single-domain canary for a multi-domain experiment is insufficient coverage — flag it in the red team brief.**

Tell the user what the canary will do and ask if they want to run it. If yes, submit it via the `run-job` skill.

The canary is not optional — it's the cheapest way to catch problems. But the user can override: log it with `author: user` if they skip.

## Step 5: Gate decision

If all steps passed:
1. Tell the user: "Pre-flight complete. Ready to submit."
2. Log to `activity_log.jsonl`
3. Sync dashboard

If anything failed, summarize what needs fixing.
