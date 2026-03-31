---
name: setup-runpod
description: |
  Walk the user through setting up RunPod as a compute provider for RACA.
  Covers account creation, API key, GPU selection, pricing, pod vs serverless, known
  issues, and writing the RunPod entry in .raca/clusters.yaml.
  Run this skill when the user says "set up RunPod", "add RunPod", "configure RunPod",
  or "I want to use RunPod".
---

# RunPod Setup Skill

This is a RIGID workflow. Follow every step in order. Do not skip phases.

---

## Phase 0: Check for existing config

Before anything else, check if RunPod is already configured:

```bash
cat .raca/clusters.yaml 2>/dev/null | grep -A5 "type: runpod"
```

If a RunPod entry already exists, tell the user what's there and ask: "Would you like to reconfigure RunPod, or just verify the existing setup?"

Also check if the API key is already set:

```bash
echo ${RUNPOD_API_KEY:+set}
```

---

## Phase 1: Account and API Key

### Step 1.1 — Account creation

If the user doesn't have a RunPod account yet, direct them to:

> "Go to https://www.runpod.io and create an account. Add a payment method before continuing — pods cannot be launched without billing configured."

Wait for the user to confirm they have an account.

### Step 1.2 — Get API key

> "Go to https://www.runpod.io/console/user/settings and click **API Keys**. Create a new key (any name). Copy it — it won't be shown again."

**Security rule:** Never store the API key in any file. It goes into an environment variable only.

Ask the user to paste the key, then save it to their shell profile:

```bash
# Test the key first
RUNPOD_API_KEY=<paste_here>
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://api.runpod.io/graphql?query={myself{id,email}}" | python3 -m json.tool
```

If the response contains `"id"` and `"email"`, the key works. Then tell the user:

> "Add this to your `~/.zshrc` or `~/.bashrc` so it persists across sessions:
> ```bash
> export RUNPOD_API_KEY=<your_key>
> ```
> Run `source ~/.zshrc` to apply it now."

---

## Phase 2: Understanding GPU Types and Pricing

Explain the available GPU types before the user picks a default. Present this reference:

### GPU Reference (RunPod, as of early 2026)

| GPU | VRAM | Est. $/hr (community) | Est. $/hr (secure) | Best for |
|-----|------|----------------------|-------------------|----------|
| H200 SXM | 141 GB | ~$3.49 | ~$4.49 | 70B+ models, large RL |
| H100 SXM | 80 GB | ~$2.49 | ~$3.49 | 7B-70B training |
| H100 PCIe | 80 GB | ~$1.99 | ~$2.99 | 7B-70B inference |
| A100 SXM | 80 GB | ~$1.64 | ~$2.49 | 7B-70B; solid multi-GPU |
| L40S | 48 GB | ~$0.99 | ~$1.49 | Single-GPU inference/training |
| RTX 4090 | 24 GB | ~$0.44 | — | 1B-7B models, budget option |
| RTX 3090 | 24 GB | ~$0.22 | — | Smallest models, cheapest |

**Pricing note:** Prices fluctuate by availability. Always check https://www.runpod.io/console/gpu-cloud before launching.

### Community vs Secure Cloud

- **Community Cloud**: Cheaper, runs on partner hardware. Not suitable for sensitive data.
- **Secure Cloud**: More expensive, datacenter-grade, better uptime guarantees.

For research and experimentation, community cloud is usually fine.

---

## Phase 3: Pod vs Serverless

Ask the user which they want to set up:

> "RunPod has two modes:
> 1. **Pods** — a persistent virtual machine with SSH access. You pay per hour (even idle). Best for interactive work, training runs, and anything that needs SSH.
> 2. **Serverless** — stateless workers that spin up per-request. You pay per second of compute. Best for batch inference APIs.
>
> Which do you need? (Most research workflows use **Pods**.)"

For the rest of this skill, we focus on **Pods** — which is what `raca` and the job runner use.

---

## Phase 4: Known Issues

Before the user launches anything, brief them on known RunPod problems. These are not JTK bugs — they are RunPod platform issues.

### Critical: Multi-GPU L40S CUDA failures

**If the user plans to use 2+ L40S GPUs: warn them immediately.**

> "IMPORTANT: Multi-GPU L40S pods on RunPod have a known CUDA initialization bug (driver 550.x does not handle non-contiguous device files). `nvidia-smi` works but `torch.cuda.is_available()` fails with `cuInit() returns 3` or `cuInit() returns 999`.
>
> **Use RTX 4090, A100, or H100 for multi-GPU training. L40S is only safe for single-GPU.**"

### SSH environment variables not inherited

Environment variables set via Docker `--env` (like `HF_TOKEN`, `WANDB_API_KEY`) are not available in SSH sessions. They're only set for the container's init process (PID 1).

Fix — source them at the start of any SSH script:
```bash
while IFS= read -r -d '' line; do export "$line" 2>/dev/null; done < /proc/1/environ 2>/dev/null
```

### Disk space

RunPod pods have limited ephemeral container disk (default ~10-20 GB) plus a separate volume disk you configure. Checkpoints fill up fast:

| Model size | Checkpoint size | Risk |
|------------|----------------|------|
| 0.5B | ~2-4 GB | Low on 50 GB volume |
| 1.5B | ~6-10 GB | Moderate |
| 7B | ~28-40 GB | High — barely fits one checkpoint |

**Always set `save_freq` high** (e.g., 100+ steps) or use a volume disk ≥100 GB.

### Torch CUDA version mismatch

`pip install torch>=2.5` on RunPod's CUDA 12.1 base image installs a CUDA 12.8 torch build. The runtime and toolkit mismatch causes failures. **Do not upgrade torch on RunPod pods** — the base image already has a compatible version.

### Watchdog processes hanging SSH

Background watchdog processes in install scripts can hold SSH sessions open indefinitely. Always redirect and disown background processes:
```bash
(sleep $TIMEOUT && kill 1) > /dev/null 2>&1 &
disown
```

### flash_attn cannot be compiled on RunPod

Building flash_attn from source on RunPod takes 40+ minutes and consumes so much memory that SSH becomes unresponsive. The CUDA toolkit version mismatch makes the compiled binary unusable anyway. Use a mock flash_attn package (pure PyTorch, no CUDA kernels) when a framework requires it.

---

## Phase 5: Write the config

Ask the user: "What GPU type do you want as the default for RunPod pods?"

Write (or append) the RunPod entry to `.raca/clusters.yaml`:

```yaml
clusters:
  runpod:
    type: runpod
    api_key_env: RUNPOD_API_KEY
    default_gpu: H100 SXM        # or whatever the user chose
    default_cloud: community      # community or secure
    notes: "API key loaded from RUNPOD_API_KEY env var. Multi-GPU L40S: known CUDA bug — use RTX 4090/A100/H100 instead."
```

If `.raca/clusters.yaml` doesn't exist yet, create it with a `clusters:` root.

---

## Phase 6: Verify

```bash
# Confirm key is accessible
echo "API key set: ${RUNPOD_API_KEY:+yes}"

# Query available GPU types (optional, confirms API connectivity)
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://api.runpod.io/graphql?query={gpuTypes{id,displayName,memoryInGb,securePrice,communityPrice}}" \
  | python3 -m json.tool | head -40
```

Tell the user:

> "RunPod is configured. To launch a pod, use `/raca:run-job` and select `runpod` as the cluster, or run `raca runpod launch --gpu <type>` directly."

Remind them about cost awareness:

> "RunPod pods charge by the hour. Always terminate pods when you're done — check https://www.runpod.io/console/pods to make sure nothing is left running."
