---
description: "Find the best compute option for a job across all configured clusters. Reads .raca/clusters.yaml, checks queue status, estimates cost, and presents a ranked comparison."
allowed-tools: ["Bash", "Read", "Edit", "Glob", "Grep"]
argument-hint: "[--gpus N] [--time Xh] [--job-type training|inference|eval]"
---

# Find Compute

Find the best place to run a job across all configured compute in `.raca/clusters.yaml`.

## Step 1: Read the cluster config

```bash
cat .raca/clusters.yaml
```

Extract all configured clusters. For each, note:
- `type` (slurm / runpod / local)
- GPU types and VRAM
- For SLURM: partitions and accounts available

## Step 2: Parse arguments

From the command arguments, extract:
- `--gpus N` — number of GPUs needed (default: 1)
- `--time Xh` — estimated job duration (default: unknown)
- `--job-type` — training, inference, or eval (for cost/capability reasoning)

## Step 3: Check each cluster

### For SLURM clusters

For each configured SLURM cluster, run these checks via `raca ssh`:

```bash
# Check queue status — what's running and pending
raca ssh <cluster> "squeue --format='%P %T %G %M %l' --noheader | head -30"

# Check partition availability
raca ssh <cluster> "sinfo --format='%P %G %D %a %t' --noheader"

# Verify actual access with sbatch --test-only
raca ssh <cluster> "sbatch --test-only --partition=<partition> <gpu_directive> --account=<account> --time=00:05:00 --wrap='hostname' 2>&1"
```

If `raca ssh` fails (VPN, auth), note the cluster as "unreachable" — do not skip it silently.

From the queue output, estimate wait time:
- 0 jobs in partition → **idle** (minutes)
- 1-5 jobs → **minutes** to hours
- 6-20 jobs → **hours**
- 20+ jobs → **days** — flag as congested

### For RunPod

Check if the API key is available:
```bash
echo ${RUNPOD_API_KEY:+set}
```

If set, estimate cost:
```
hourly_cost = GPU_cost_per_hour (from .raca/clusters.yaml or reference table)
total_cost = hourly_cost × estimated_hours × gpu_count
```

RunPod GPU pricing reference (community cloud, approximate):
| GPU | $/hr |
|-----|------|
| H200 SXM | ~$3.49 |
| H100 SXM | ~$2.49 |
| A100 SXM | ~$1.64 |
| L40S | ~$0.99 |
| RTX 4090 | ~$0.44 |
| RTX 3090 | ~$0.22 |

Note: RunPod has no queue wait — pods start in ~1-3 minutes.

### For local

```bash
nvidia-smi --query-gpu=name,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null \
  || system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset|VRAM"
```

If GPUs are available and utilization is <30%, local is "idle".

## Step 4: Present the ranked comparison

Format a table showing all checked clusters. Sort by estimated total time (queue wait + compute time). Include cost for RunPod.

```
Compute options for this job (N GPUs, ~Xh estimated):

Cluster       | GPU        | VRAM   | Queue     | Est. Total  | Cost     | Notes
--------------|------------|--------|-----------|-------------|----------|-------
torch/l40s    | L40S       | 48 GB  | idle      | ~1.5h       | $0       | Access confirmed
empire/a100   | A100       | 80 GB  | ~2h wait  | ~3.5h       | $0       | Access confirmed
runpod        | RTX 4090   | 24 GB  | none      | ~2h         | ~$0.88   | Billed per hour
torch/h200    | H200       | 141 GB | days      | 24h+        | $0       | Congested — avoid
```

**Recommendation:** State which cluster you recommend and why. Consider:
- Queue wait vs compute time trade-off
- Whether the GPU has enough VRAM for the job
- Cost (RunPod charges real money)
- Whether the conda env / install is ready (from cluster config)

**Multi-GPU L40S warning (RunPod only):** If `gpus > 1` and `gpu_type == L40S` on RunPod, warn:
> "Multi-GPU L40S pods on RunPod have known CUDA initialization failures (driver 550.x bug). Use A100 or H100 for multi-GPU instead."

## Step 5: Ask which cluster to use

> "Which cluster would you like to use? I'll proceed with job setup once you confirm."

After the user picks a cluster, confirm access one more time:

```bash
raca ssh <cluster> "echo 'Ready: $(hostname)'"
```

Then hand off to the run-job skill or proceed with job setup.
