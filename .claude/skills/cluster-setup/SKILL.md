---
name: cluster-setup
description: |
  Walk the user through connecting a new compute cluster (SLURM, RunPod, or local GPU)
  to Dr. Claude Code. Writes config to ~/.dcc/clusters.yaml and verifies connectivity.
  Run this skill when the user says "add a cluster", "set up a cluster", "connect to HPC",
  or "configure RunPod".
---

# Cluster Setup Skill

This is a RIGID workflow. Follow every step. Do not skip phases. Ask before proceeding at each gate.

## GPU Memory Reference Table

Use this when estimating GPU requirements:

| GPU        | VRAM   | Notes                              |
|------------|--------|------------------------------------|
| H200       | 141 GB | Best for 70B+ models               |
| H100 SXM   | 80 GB  | Flagship datacenter GPU            |
| H100 PCIe  | 80 GB  | Slightly lower bandwidth than SXM  |
| A100 SXM   | 80 GB  | Common in academic clusters        |
| A100 PCIe  | 80 GB  | Common in academic clusters        |
| GH200      | 96 GB  | Grace Hopper — CPU+GPU unified mem |
| L40S       | 48 GB  | Strong for inference               |
| A6000      | 48 GB  | Workstation GPU                    |
| V100       | 32 GB  | Older; common in legacy clusters   |
| RTX 4090   | 24 GB  | Consumer; great for local dev      |
| RTX 3090   | 24 GB  | Consumer; older                    |
| RTX 4080   | 16 GB  | Consumer mid-range                 |
| T4         | 16 GB  | Common in cloud / budget clusters  |
| RTX 3080   | 10 GB  | Consumer entry                     |
| RTX 4070   | 12 GB  | Consumer mid-range                 |

---

## Phase 0: Identify Cluster Type

Ask the user:

> "What type of cluster are you setting up?
> 1. SLURM (university HPC, national lab, etc.)
> 2. RunPod (cloud GPU rental)
> 3. Local machine (workstation or server you control directly)"

Route to the appropriate phase based on their answer.

---

## Phase 1a: SLURM Cluster Setup

### Step 1.1 — Gather connection info

Ask the user for:
- **Cluster nickname** (e.g., `torch`, `vista`, `empire`) — short identifier used in `dcc` commands
- **Hostname** (e.g., `greene.hpc.nyu.edu`)
- **Username**
- **VPN required?** (yes/no) — if yes, remind user to connect VPN before each auth
- **2FA required?** (yes/no) — note: 2FA clusters need ControlMaster SSH to avoid repeated prompts
- **Default partition** (can be detected in next step)
- **Default SLURM account** (e.g., `courant`, `gpu_users`) — needed for `sbatch --account=`

### Step 1.2 — Test basic SSH connectivity

```bash
dcc ssh <nickname> "echo 'SSH OK' && hostname"
```

If this fails:
- Check if user is on VPN (if required)
- Check if `dcc auth <nickname>` has been run yet — if not, tell the user: "Run `dcc auth <nickname>` first to establish the ControlMaster connection."
- If still failing, ask for the full SSH config and debug manually

### Step 1.3 — Detect GPU partitions

```bash
dcc ssh <nickname> "sinfo --format='%P %G %D %a' --noheader | grep -E 'gpu|h100|h200|a100|l40|v100|rtx' -i"
```

Parse the output. For each partition line:
- Column 1: partition name
- Column 2: GRES (generic resources) — e.g., `gpu:h100:8` means 8× H100s
- Column 3: node count
- Column 4: availability (up/down)

Present a summary to the user:
```
Found GPU partitions:
  h100_courant    — gpu:h100:8   (8 nodes, up)
  l40s_courant    — gpu:l40s:4   (4 nodes, up)
  gpu             — gpu:v100:16  (16 nodes, up)
```

Ask: "Which partition should be the default for new jobs?"

### Step 1.4 — Detect scratch path and modules

```bash
dcc ssh <nickname> "echo \$SCRATCH && ls /scratch 2>/dev/null | head -5 && module avail cuda 2>&1 | head -10"
```

Note the scratch path (e.g., `/scratch/$USER`, `/scratch1/$USER`, `/tmp/scratch`).

Check if CUDA modules are available via the module system. Record the CUDA version.

### Step 1.5 — Determine GPU GRES directive format

Some clusters use `--gres=gpu:N`, others use `--gres=gpu:<type>:N`.

```bash
dcc ssh <nickname> "sinfo -o '%G' --noheader | head -3"
```

If output shows typed GPUs (e.g., `gpu:h100:8`), the cluster uses typed GRES: `--gres=gpu:h100:1`.
If output shows generic GPUs (e.g., `gpu:8`), use generic: `--gres=gpu:1`.

Record this for sbatch template generation.

### Step 1.6 — Write cluster config

Append to `~/.dcc/clusters.yaml`:

```yaml
clusters:
  <nickname>:
    type: slurm
    host: <hostname>
    user: <username>
    vpn_required: <true|false>
    two_factor: <true|false>
    default_partition: <partition>
    default_account: <account>
    scratch_path: /scratch/<username>
    gres_format: <typed|generic>   # typed = gpu:h100:N, generic = gpu:N
    gpu_types:
      - name: <partition>
        gpu: <gpu model>
        vram_gb: <vram from reference table>
        nodes: <count>
    modules:
      cuda: <cuda version if available>
    notes: ""
```

### Step 1.7 — Verify with dcc

```bash
dcc cluster list
dcc ssh <nickname> "squeue -u $USER | head -5"
```

If both succeed, tell the user:

> "Cluster `<nickname>` is configured. You can now:
> - SSH in: `dcc ssh <nickname>`
> - Upload files: `dcc upload <nickname> ./local/path /remote/path`
> - Submit jobs via sbatch templates in `templates/sbatch/`"

---

## Phase 1b: RunPod Setup

### Step 2.1 — Get API key

Ask: "Please provide your RunPod API key (from console.runpod.io → Settings → API Keys)."

Do NOT log or store the key in any file directly — tell the user to set it as an environment variable:

```bash
export RUNPOD_API_KEY=<key>
# Or add to ~/.zshrc / ~/.bashrc for persistence
```

### Step 2.2 — Validate API key

```bash
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://api.runpod.io/graphql?query={myself{id,email}}" | jq .
```

If the response contains an `id` and `email`, the key is valid.

### Step 2.3 — Write config

Append to `~/.dcc/clusters.yaml`:

```yaml
clusters:
  runpod:
    type: runpod
    api_key_env: RUNPOD_API_KEY
    default_gpu: H100 SXM
    notes: "API key loaded from RUNPOD_API_KEY env var"
```

Tell the user: "RunPod is configured. Use `dcc runpod launch --gpu H100 --image <image>` to start a pod."

---

## Phase 1c: Local GPU Setup

### Step 3.1 — Detect GPUs

```bash
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
```

Parse the output. Present a summary:

```
Found GPUs:
  GPU 0: RTX 4090 — 24576 MiB VRAM
  GPU 1: RTX 4090 — 24576 MiB VRAM
```

### Step 3.2 — Write config

Append to `~/.dcc/clusters.yaml`:

```yaml
clusters:
  local:
    type: local
    host: localhost
    gpus:
      - index: 0
        name: RTX 4090
        vram_gb: 24
      - index: 1
        name: RTX 4090
        vram_gb: 24
    notes: ""
```

### Step 3.3 — Verify

```bash
python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.device_count())"
```

Tell the user: "Local cluster configured. Use `dcc ssh local` to run commands or submit via the local backend."

---

## Completion

After any cluster type is configured:

1. Run `dcc cluster list` to confirm it appears
2. Tell the user the cluster nickname and the commands they can use
3. Remind them to run `dcc auth <nickname>` if it's a SLURM cluster requiring 2FA or ControlMaster setup
