---
description: "Pre-flight review for experiments: Red Team Brief check, local dry-run, adversarial review, optional canary shard"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent"]
argument-hint: "<experiment-name>"
---

# Experiment Pre-flight

This is a RIGID workflow. Follow every step. Do not skip steps. Do not rationalize shortcuts.

The experiment name is provided as the argument. If not provided, ask for it.

## Step 1: Locate experiment files

Read the following files for this experiment:
- `notes/experiments/$EXPERIMENT/experiment.yaml`
- `notes/experiments/$EXPERIMENT/red_team_brief.md`
- The research project code referenced in experiment.yaml's `research_project` field

If `experiment.yaml` does not exist, STOP. Tell the user: "This experiment has no experiment.yaml. Create one before running preflight."

If `red_team_brief.md` does not exist, STOP. Tell the user: "This experiment has no Red Team Brief. Write one before running preflight."

## Step 2: Local dry-run

Run the experiment pipeline locally on 5-10 samples to catch configuration errors.

1. Read experiment.yaml to understand what command/script runs the experiment
2. Identify the script or command and modify it (or use CLI flags) to run on only 5-10 samples
3. Run it locally: `python <script> [--n-samples 5]` or equivalent
4. Check output:
   - Did it run without errors?
   - Are outputs in the expected format?
   - Are output lengths reasonable (not suspiciously short)?
   - Did the right model get loaded?

If the dry-run fails, diagnose the error, fix it, and re-run. Do NOT proceed to adversarial review with a broken pipeline.

Report dry-run results to the user before proceeding.

## Step 3: Adversarial review

Dispatch a fresh subagent to adversarially review this experiment. The subagent must NOT receive the design conversation history — only the files.

Use the Agent tool with this prompt structure:

```
You are the Red Team Reviewer. Your job is to find reasons this experiment run will waste compute.

Read these files:
1. Red Team Brief: notes/experiments/<experiment>/red_team_brief.md
2. Experiment config: notes/experiments/<experiment>/experiment.yaml
3. The experiment code: <path to main script from experiment.yaml>
4. Dry-run output: <paste the dry-run results here>

Check every concern listed in the Red Team Brief. For each one, verify the current code and config actually handle it correctly.

Also check for general issues:
- Are max_tokens, temperature, n_samples set to values that will produce meaningful results?
- Is checkpointing enabled for long-running jobs?
- Are there hardcoded paths that won't work on the target cluster?
- Does the evaluator/reward function match what the hypothesis needs?
- Will the output format be compatible with HF upload and the visualizer?

Output format:
## Pre-flight Review

**Status:** PASS | FAIL

**Findings:**
- [Finding 1]: [specific issue] — [why it would waste compute]
- [Finding 2]: ...

If PASS: "No issues found. Safe to submit."
If FAIL: List every issue that must be fixed before submission.
```

If the reviewer returns FAIL:
1. Show the findings to the user
2. Fix each issue
3. Re-run the adversarial review (dispatch a NEW subagent — do not reuse)
4. Repeat until PASS

## Step 4: Canary shard (if required by Red Team Brief)

Read the Red Team Brief's "Canary Shard" section.

If it says "skip", proceed to Step 5.

If it says "required":
1. Submit a small job (50 samples) to the target cluster via `dcc ssh <cluster> "<submit command>"`
2. Wait for completion (poll via `dcc ssh <cluster> "squeue -u $USER -j <id>"` every 5 minutes, max 2 hours)
3. If queue wait exceeds 2 hours, log "Canary timed out — proceeding without canary" and skip to Step 5
4. When complete, download results and validate against the Red Team Brief's "How do I know the results are real?" criteria
5. Save canary results to `notes/experiments/<experiment>/canary_<date>/`

If canary validation fails, show findings to user. Do NOT proceed to full submission.

## Step 5: Gate decision

If all steps passed:
1. Tell the user: "Pre-flight complete. All checks passed. Ready to submit full run."
2. Compute SHA-256 hash of `red_team_brief.md`:
   ```bash
   shasum -a 256 notes/experiments/<experiment>/red_team_brief.md
   ```
3. Record the hash — it will be written to the pipeline log when the pipeline starts.

If any step failed, summarize what needs to be fixed before re-running preflight.
