---
name: run-job
description: |
  Core job execution skill. Takes an experiment design or canary specification and
  handles the full job lifecycle: write sbatch script, submit, monitor, handle
  artifacts, resume on failure, and report results.
  Run this skill when the user says "run this job", "submit the experiment", "launch
  the canary", or "run on <cluster>".
---

# Run Job Skill

This is a RIGID workflow. Complete every phase in order. Do not skip steps.

---

## Phase 0: Pre-flight Checks

Before writing a single line of script:

### 0.1 — Read benchmark reference (if applicable)

If this job runs evaluation or RL training on a known benchmark, check the reference index:

```
.claude/references/datasets_and_tasks/datasets_and_tasks_map.md
```

If the benchmark appears in the index, read its reference file before continuing. The reference file contains:
- Correct evaluation method (do NOT guess at scoring)
- Known pitfalls (wrong data_source names, off-by-one errors, etc.)
- Prompt format and few-shot count
- Setup checklist for eval / RL training

If the benchmark is NOT in the index and the job is non-trivial, invoke `/raca:benchmark-reference` to create a reference before proceeding.

### 0.2 — Read the cluster config

```bash
cat .raca/clusters.yaml
```

Identify the target cluster. Extract:
- `type` (slurm / runpod / local)
- `default_partition`, `default_account`, `scratch_path`
- `gres_format` (typed: `gpu:h100:N` vs generic: `gpu:N`)
- `modules`, `conda_env` if set
- GPU type and VRAM (look up in the GPU reference table below if needed)

### 0.3 — Verify connectivity

For SLURM clusters:
```bash
raca ssh <cluster> "echo 'SSH OK' && whoami && squeue -u \$USER | head -5"
```

For RunPod: confirm `$RUNPOD_API_KEY` is set.

For local: check `nvidia-smi`.

If connectivity fails, stop and resolve before continuing.

### 0.4 — Estimate memory and time

Before any non-trivial job, estimate whether the model fits on the target GPU.

For training/inference jobs, consider:
- Model parameters × dtype size × overhead multiplier
- Sequence length effects on KV cache / activations

**GPU VRAM Reference:**

| GPU | VRAM | Notes |
|-----|------|-------|
| H200 | 141 GB | Best for 70B+ |
| GH200 | 96 GB | Unified memory |
| H100 | 80 GB | Flagship datacenter |
| A100 | 80 GB | Common in academic clusters |
| L40S | 48 GB | Strong for inference |
| A6000 | 48 GB | Workstation GPU |
| RTX 4090 | 24 GB | Consumer; great for dev |
| RTX 3090 | 24 GB | Consumer; older |
| T4 | 16 GB | Budget cloud |

If the job looks too large for the GPU, say so before submitting. Suggest: more GPUs, smaller model, or different cluster.

---

## Phase 1: Write the sbatch Script

### 1.1 — Choose the right template

Templates live at `.claude/references/templates/sbatch/`:
- `base.sbatch.j2` — minimal skeleton, always read this first
- `training.sbatch.j2` — for RL/SFT training jobs
- `vllm.sbatch.j2` — for vLLM inference serving jobs

Read the appropriate template. Fill in all variables from the cluster config and job spec.

### 1.2 — Write the script

The script file goes at: `<scratch_path>/jobs/<job_name>/run.sh`

Or locally: `./jobs/<job_name>/run.sh`

**Hard rules for all scripts:**

- **Never truncate output.** Use the model's full supported `max_tokens` / `max_model_len`. A truncated response is a failed response.
- **Always checkpoint.** For jobs >30 min: write results to a checkpoint file after every batch. The script must be resumable — on restart, skip rows already processed.
- **Upload to HF incrementally.** For jobs >1 hour: upload partial results every ~30 min or N samples. Use `hf_utility.push_dataset_to_hub()`.
- **Redirect caches.** Set `HF_HOME`, `TORCH_HOME`, `TMPDIR` to scratch to avoid quota issues.
- **Log everything.** Pipe stdout+stderr to a log file: `2>&1 | tee $LOG_FILE`.

**Script structure:**

```bash
#!/bin/bash
#SBATCH --job-name=<name>
#SBATCH --partition=<partition>
#SBATCH <gpu_directive>        # e.g. --gres=gpu:h100:1 or --gpus=1
#SBATCH --time=<HH:MM:SS>
#SBATCH --output=<scratch>/logs/%j.out
#SBATCH --error=<scratch>/logs/%j.err
#SBATCH --account=<slurm_account>  # omit if not needed

# === Environment ===
# (module loads, conda activate, etc. from cluster config)

# === Cache Redirect ===
export HF_HOME=<scratch>/.cache/huggingface
export TORCH_HOME=<scratch>/.cache/torch
export TMPDIR=<scratch>/tmp
mkdir -p $HF_HOME $TORCH_HOME $TMPDIR <scratch>/logs

# === Job Body ===
# ... experiment-specific code ...

echo "Job completed: $(date)"
```

### 1.3 — Review with user before submitting

Show the script to the user. Confirm:
- Job name, partition, GPU count, time limit
- Model path / name
- Input data path
- Output path
- `max_tokens` setting

**Never change experimental parameters without user confirmation.** This includes: model name, max_tokens, batch size, sample count, temperature, epochs.

---

## Phase 2: Submit the Job

### For SLURM:

Upload the script to the cluster, then submit:

```bash
# Upload script
raca upload <cluster> ./jobs/<job_name>/run.sh <scratch>/jobs/<job_name>/run.sh

# Submit
raca ssh <cluster> "mkdir -p <scratch>/logs && sbatch <scratch>/jobs/<job_name>/run.sh"
```

Capture the job ID from the output (e.g., `Submitted batch job 12345`).

### For RunPod:

Launch a pod with the appropriate GPU and run the setup + job script via SSH. Always:
- Inject your SSH public key via `PUBLIC_KEY` env var
- Source `/proc/1/environ` at the start of the SSH script for env vars
- Install rsync first if not present: `which rsync || apt-get install -y rsync`
- Upload code via rsync before running

### For local:

```bash
bash ./jobs/<job_name>/run.sh 2>&1 | tee ./jobs/<job_name>/run.log &
echo $! > ./jobs/<job_name>/pid
```

---

## Phase 3: Monitor

After submitting, enter a monitoring loop. Check every 5-10 minutes:

### For SLURM:

```bash
# Job status
raca ssh <cluster> "squeue -j <job_id> --format='%i %T %R %M %l'"

# Tail the log
raca ssh <cluster> "tail -50 <scratch>/logs/<job_id>.out"

# Check for errors
raca ssh <cluster> "grep -i 'error\|traceback\|exception\|nan\|killed' <scratch>/logs/<job_id>.out | tail -20"
```

### Health checks to run on each loop iteration:

1. **Truncation check:** Is the model producing reasonable-length outputs? If outputs are consistently hitting the `max_tokens` limit, they are being truncated. Stop and fix.
2. **NaN loss:** Grep the log for `nan` or `inf` in loss values. If found, stop and investigate (LR too high, bad data).
3. **OOM:** Look for `CUDA out of memory` or `Killed` in the log. If found, do NOT reduce batch size silently — report to user and ask for guidance.
4. **Checkpoint progress:** Verify checkpoints are being written at the expected frequency.
5. **Disk space:** Periodically check `df -h` on scratch — checkpoint accumulation can fill the disk.

### Stop conditions:

- **Job completes normally** → proceed to Phase 4
- **Job fails with fixable error** (transient network, missing dir, etc.) → fix and resubmit, report to user
- **Job fails with critical error** (OOM, NaN loss, bad data) → stop, report to user, wait for instructions
- **Job times out** → check for checkpoints, then proceed to Phase 5 (Resume)

---

## Phase 4: Artifact Handling

When artifacts are produced (canary, partial, or final):

### 4.1 — Download results

```bash
raca download <cluster> <scratch>/results/<job_name>/ ./results/<job_name>/
```

### 4.2 — Run the artifact chain (no exceptions)

Every artifact, every time:

1. **Upload to HF** via `hf_utility.push_dataset_to_hub()` with full metadata and column docs
2. **Verify** — load back from HF, check row count, sample 3-5 rows, inspect content
3. **Validate** — dispatch `data-validator` agent to check for truncation, missing fields, score distribution issues
4. **Sync dashboard** — invoke `/raca:dashboard-sync`
5. **Log** — write an activity log entry with: artifact name, row count, token length range, score range

### 4.3 — Health validation

After downloading, inspect outputs:
- Are responses complete (not cut off mid-sentence)?
- Are scores in a reasonable range for this benchmark?
- Are there any `null` or empty response fields?

If validation fails, do NOT proceed to analysis. Fix the root cause and re-run.

---

## Phase 5: Resume (on timeout or failure)

If the job timed out or failed partway through:

### 5.1 — Check for checkpoints

```bash
raca ssh <cluster> "ls -la <scratch>/results/<job_name>/checkpoints/"
```

If checkpoints exist:
- Download them: `raca download <cluster> <scratch>/results/<job_name>/checkpoints/ ./checkpoints/`
- Verify the latest checkpoint is valid (not corrupted mid-write)

### 5.2 — Resubmit with resume flag

If the script supports resuming (it should — see Phase 1 hard rules):

```bash
raca ssh <cluster> "sbatch <scratch>/jobs/<job_name>/run.sh --resume"
```

Or set a `RESUME_FROM_CHECKPOINT` environment variable in the script.

Report to the user: "Job timed out at step N. Resuming from checkpoint."

### 5.3 — If no checkpoints

If there are no checkpoints and the job ran for a significant time, this means the job was not properly checkpointing. Report to the user:

> "The job failed without checkpoints. The work is lost. Before resubmitting, I need to add checkpointing to the script — this is critical for jobs longer than 30 minutes."

Add checkpointing, get user approval, resubmit.

---

## Phase 6: Report Results

When the job is complete and artifacts are validated:

1. Show a summary table of results (scores, counts, token lengths)
2. Sample 3-5 representative outputs for qualitative review
3. Note any anomalies or concerns (score distribution, truncation rate, outliers)
4. State clearly: "Job complete. Artifacts at HF: `<dataset_name>`. Dashboard synced."
5. Suggest next steps based on results (scale up, fix issues, move to next condition)

---

## Appendix: Common Failures and Fixes

| Error | Diagnosis | Fix |
|-------|-----------|-----|
| `CUDA out of memory` | Model too large for GPU | Report to user; suggest more GPUs or smaller model |
| Loss is `nan` | Bad LR, bad data, overflow | Report to user; check data quality and LR |
| Output always hits `max_tokens` | Truncation bug | Increase `max_tokens`; never silently reduce |
| `sbatch: error: Batch job submission failed` | Wrong account or partition | Re-run `sbatch --test-only` to diagnose |
| Job exits with code 1, no output | Script error before any output | Check `.err` file, not `.out` |
| HF upload fails | Auth error or network | Check `HF_TOKEN` is set; retry |
| `No space left on device` | Scratch full from checkpoints | Increase `save_freq`; clean old checkpoints |
| SSH drops during RunPod setup | Watchdog holding descriptors | Add `> /dev/null 2>&1 & disown` to background processes |
