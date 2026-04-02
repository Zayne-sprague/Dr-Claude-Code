---
name: setup-cluster
description: |
  Walk the user through connecting a new compute cluster (SLURM, RunPod, or local GPU)
  to RACA. Writes config to .raca/clusters.yaml and verifies connectivity.
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

**FIRST: Check `~/.ssh/config` for existing aliases.**

```bash
cat ~/.ssh/config 2>/dev/null
```

If the user's cluster name already appears as a `Host` entry in their SSH config, you already have the hostname, user, port, and key. Tell the user: "I found `<name>` in your SSH config — using hostname `<hostname>`, user `<user>`." Use those values directly.

**Hostname validation:** A valid SSH hostname looks like:
- A FQDN: `login.torch.hpc.nyu.edu`, `frontera.tacc.utexas.edu`
- An IP: `192.168.1.100`
- An SSH config alias: a short name that appears as `Host <name>` in `~/.ssh/config`

If the user gives just a short name like `torch` and it's NOT in `~/.ssh/config`, ask: "Is `torch` a hostname or an alias? I need the full hostname like `login.torch.hpc.nyu.edu`."

Ask the user for (skip any you already found in SSH config):
- **Cluster nickname** (e.g., `torch`, `vista`, `empire`) — short identifier used in `raca` commands
- **Hostname** (e.g., `greene.hpc.nyu.edu`) — the SSH target. If user gives `user@host`, parse both.
- **Username**
- **VPN required?** (yes/no) — if yes, remind user to connect VPN before each auth
- **2FA required?** (yes/no) — note: 2FA clusters need ControlMaster SSH to avoid repeated prompts. If the SSH config has `ControlMaster` entries, the cluster likely uses 2FA.

### Step 1.2 — Write initial config and authenticate

**CRITICAL: Write the config BEFORE attempting any raca commands.**
`raca auth` and `raca ssh` read from `.raca/clusters.yaml` — they will error if the cluster isn't configured yet.

Write a minimal cluster entry to `.raca/clusters.yaml` using the info gathered so far:

```yaml
clusters:
  <nickname>:
    type: slurm
    host: <hostname>
    user: <username>
    vpn_required: <true|false>
    uses_2fa: <true|false>
    default_partition: ""
    partitions: {}
    slurm_account: ""
    module_loads: []
    scratch_path: "$SCRATCH"
    conda_path: "$CONDA_PREFIX"
    gpu_directive_format: "--gpus={count}"
```

Then tell the user to authenticate:

> "I've written the cluster config. Now connect to it — open a **new terminal tab** and run:"
> ```bash
> cd <workspace_path>
> raca auth <nickname>
> ```
> "(Make sure VPN is connected if required. You'll need to complete 2FA.)"
> "Come back here once you're connected."

Wait for the user to confirm they're connected. Then verify:

```bash
raca ssh <nickname> "echo 'SSH OK' && hostname"
```

If this fails:
- Check if user is on VPN (if required)
- Check if `raca auth <nickname>` succeeded
- If still failing, ask for the full SSH config and debug manually

### Step 1.3 — Detect accounts, partitions, and access

Ask: "Do you know which SLURM account and partitions you have access to, or would you like me to discover them automatically?"

**If the user knows:** use what they tell you and skip to Step 1.4.

**If they want auto-discovery:** run this sequence. Standard SLURM introspection commands (`sacctmgr`, `scontrol`) often don't reveal real access restrictions. The only reliable method is `sbatch --test-only`.

```bash
# Step A: Get user's SLURM accounts
raca ssh <nickname> "sacctmgr show associations where user=\$USER format=Account%30 --noheader --parsable2 2>/dev/null | sort -u"
```

Record the accounts (e.g., `torch_pr_219_courant`, `users`).

```bash
# Step B: Get all GPU partitions and their GRES format
raca ssh <nickname> "sinfo --format='%P %G %D %a' --noheader"
```

Parse partitions and GRES. Determine if the cluster uses typed GRES (e.g., `gpu:h100:8`) or generic (`gpu:8`).

```bash
# Step C: Test ACTUAL access with sbatch --test-only
# This is the ONLY reliable way — sacctmgr and scontrol often show misleading AllowAccounts=ALL
```

For each GPU partition found, test access using the correct GRES format:

```bash
# If typed GRES (gpu:h100:8):
raca ssh <nickname> "sbatch --test-only --partition=<partition> --gres=gpu:<type>:1 --account=<account> --time=00:05:00 --wrap='hostname' 2>&1"

# If generic GRES (gpu:8):
raca ssh <nickname> "sbatch --test-only --partition=<partition> --gpus=1 --account=<account> --time=00:05:00 --wrap='hostname' 2>&1"
```

- If it returns a simulated start time → **access confirmed**
- If it says "not valid for this job" → **no access**, skip this partition

Present only the partitions the user CAN access:

```
I tested your access on each partition:
  ✓ h200_courant  — gpu:h200:8 (12 nodes) — account: torch_pr_219_courant
  ✓ l40s_courant  — gpu:l40s:4 (6 nodes)  — account: torch_pr_219_courant
  ✗ h100          — no access
  ✗ a100          — no access

I'll use h200_courant as the default. Sound good?
```

### Step 1.4 — Detect scratch path, modules, and SLURM environment

```bash
raca ssh <nickname> "echo SCRATCH=\$SCRATCH; echo WORK=\$WORK; echo HOME=\$HOME; echo CONDA=\$CONDA_PREFIX; module avail cuda 2>&1 | head -10"
```

Note the scratch path (e.g., `/scratch/$USER`, `/scratch1/$USER`).
Check if CUDA modules are available via the module system. Record the CUDA version.

**SLURM library path check:** Some clusters require `LD_LIBRARY_PATH` to be set for SLURM commands to work in non-interactive SSH sessions (modules aren't loaded automatically). Test this:

```bash
raca ssh <nickname> "which sinfo && sinfo --version"
```

If `sinfo` is not found or returns "No such file or directory" despite being on PATH, the cluster likely needs a `slurm_prefix`. Try:

```bash
raca ssh <nickname> "module show slurm 2>&1 | grep LD_LIBRARY_PATH"
```

If that reveals library paths, record them as a `slurm_prefix` that must be sourced before any SLURM command on this cluster.

### Step 1.5 — Update cluster config with detected info

Update the entry in `.raca/clusters.yaml` with all detected details:

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
    # slurm_prefix: only needed if SLURM commands fail in non-interactive SSH
    # Example: "export LD_LIBRARY_PATH=/cm/shared/apps/slurm/current/lib64:$LD_LIBRARY_PATH"
    slurm_prefix: ""
    notes: ""
```

### Step 1.6 — Verify with raca

```bash
raca cluster list
raca ssh <nickname> "squeue -u $USER | head -5"
```

If both succeed, tell the user:

> "Cluster `<nickname>` is configured. You can now:
> - SSH in: `raca ssh <nickname>`
> - Upload files: `raca upload <nickname> ./local/path /remote/path`
> - Submit jobs via sbatch templates in `.claude/references/templates/sbatch/`"

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

Append to `.raca/clusters.yaml`:

```yaml
clusters:
  runpod:
    type: runpod
    api_key_env: RUNPOD_API_KEY
    default_gpu: H100 SXM
    notes: "API key loaded from RUNPOD_API_KEY env var"
```

Tell the user: "RunPod is configured. Use `raca runpod launch --gpu H100 --image <image>` to start a pod."

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

Append to `.raca/clusters.yaml`:

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

Tell the user: "Local cluster configured. Use `raca ssh local` to run commands or submit via the local backend."

---

## Completion

After any cluster type is configured:

1. Run `raca cluster list` to confirm it appears
2. Tell the user the cluster nickname and the commands they can use
3. Remind them to run `raca auth <nickname>` if it's a SLURM cluster requiring 2FA or ControlMaster setup
