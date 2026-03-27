---
name: install-package
description: |
  Install ML frameworks and Python packages on a remote SLURM cluster.
  Handles vllm, verl, llama_factory, and arbitrary pip packages.
  Always runs installs inside tmux for persistence across SSH disconnects.
  Run this skill when the user says "install <package> on <cluster>",
  "set up the environment", "I need vllm installed", or "configure the cluster env".
---

# Install Package Skill

This skill installs Python packages on a cluster, always using tmux for persistence so an SSH disconnect doesn't abort the install.

---

## Phase 1: Identify What to Install

### Step 1.1 — Gather info

Ask the user:
- **What package?** (vllm, verl, llama_factory, or a custom package/requirements.txt)
- **What cluster?** (from `~/.dcc/clusters.yaml`)
- **Which conda env?** (existing env name, or should we create a new one?)

If the user doesn't specify a conda env, ask: "Install into an existing env or create a new one?"

### Step 1.2 — Check if already installed

```bash
dcc ssh <cluster> "conda run -n <env> python -c 'import <package>; print(<package>.__version__)' 2>&1"
```

If the import succeeds and the version is acceptable, tell the user it's already installed and stop.

If not installed or wrong version, proceed.

### Step 1.3 — Check disk space

```bash
dcc ssh <cluster> "df -h $SCRATCH | tail -1 && df -h $HOME | tail -1"
```

Warn if < 10 GB free in SCRATCH (installs like vLLM with flash-attn can take 3–8 GB).

---

## Phase 2: Install the Package

### Step 2.1 — Create tmux session

All installs run in tmux so an SSH disconnect doesn't abort them:

```bash
dcc ssh <cluster> "tmux new-session -d -s install_<package> 2>/dev/null || echo 'session exists'"
```

If a session with that name already exists, attach to it and check status:
```bash
dcc ssh <cluster> "tmux capture-pane -pt install_<package> -S -50"
```

### Step 2.2 — Run the install recipe

#### vLLM

Standard install for most CUDA 12.x clusters:

```bash
dcc ssh <cluster> "tmux send-keys -t install_vllm '
conda create -n vllm python=3.11 -y && \
conda run -n vllm pip install vllm && \
echo VLLM_INSTALL_DONE > /tmp/vllm_done.txt
' Enter"
```

For clusters with older CUDA (11.x), use a pre-built wheel:
```bash
# Check CUDA version first
dcc ssh <cluster> "nvcc --version | grep release"
# Then install matching vLLM build from https://github.com/vllm-project/vllm/releases
```

#### verl (RLVR training framework)

```bash
dcc ssh <cluster> "tmux send-keys -t install_verl '
conda create -n verl python=3.11 -y && \
conda run -n verl pip install torch==2.4.0 --index-url https://download.pytorch.org/whl/cu121 && \
conda run -n verl pip install verl && \
conda run -n verl pip install flash-attn --no-build-isolation && \
echo VERL_INSTALL_DONE > /tmp/verl_done.txt
' Enter"
```

Note: flash-attn build from source takes 20–60 minutes on clusters without pre-built wheels. On aarch64 (ARM) clusters, pre-built wheels may not be available — see Troubleshooting.

#### LLaMA Factory (fine-tuning framework)

```bash
dcc ssh <cluster> "tmux send-keys -t install_llamafactory '
conda create -n llamafactory python=3.11 -y && \
conda run -n llamafactory pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 && \
conda run -n llamafactory pip install llamafactory && \
echo LLAMAFACTORY_DONE > /tmp/llamafactory_done.txt
' Enter"
```

#### Custom package / requirements.txt

Upload the requirements file first:
```bash
dcc upload <cluster> ./requirements.txt <scratch>/requirements.txt
```

Then install:
```bash
dcc ssh <cluster> "tmux send-keys -t install_custom '
conda run -n <env> pip install -r <scratch>/requirements.txt && \
echo CUSTOM_DONE > /tmp/custom_done.txt
' Enter"
```

### Step 2.3 — Monitor progress

Check the tmux pane every 60 seconds:

```bash
dcc ssh <cluster> "tmux capture-pane -pt install_<package> -S -30"
```

Look for:
- Progress bars (pip install)
- Error messages ("ERROR", "failed building wheel", "CUDA error")
- The `DONE` sentinel file

Check for the sentinel:
```bash
dcc ssh <cluster> "cat /tmp/<package>_done.txt 2>/dev/null"
```

Inform the user of progress every few minutes. Typical times:
- vLLM (pre-built): 3–8 min
- vLLM (with flash-attn source build): 20–60 min
- verl: 10–30 min (flash-attn source build adds time)
- LLaMA Factory: 5–15 min

---

## Phase 3: Verify the Install

### Step 3.1 — Test import

```bash
dcc ssh <cluster> "conda run -n <env> python -c 'import <package>; print(<package>.__version__)'"
```

For vLLM, also verify GPU access:
```bash
dcc ssh <cluster> "conda run -n <env> python -c '
import torch
import vllm
print(f\"vLLM {vllm.__version__}\")
print(f\"PyTorch {torch.__version__}\")
print(f\"CUDA available: {torch.cuda.is_available()}\")
print(f\"GPU count: {torch.cuda.device_count()}\")
'"
```

If this succeeds, tell the user the install is complete and which env to use.

### Step 3.2 — On failure, diagnose

If the import fails, get the full error:
```bash
dcc ssh <cluster> "conda run -n <env> python -c 'import <package>' 2>&1"
```

---

## Troubleshooting Reference

### CUDA version mismatch
Symptom: `ImportError: libcudart.so.XX.X not found` or similar.

Diagnosis:
```bash
dcc ssh <cluster> "nvcc --version && conda run -n <env> python -c 'import torch; print(torch.version.cuda)'"
```

Fix: Install PyTorch matching the cluster's CUDA version from https://pytorch.org/get-started/locally/

### flash-attn build failure on aarch64 (ARM clusters)
Symptom: `error: command 'gcc' failed` during flash-attn wheel build.

Fix: Build from source with CUDA-aware compiler:
```bash
dcc ssh <cluster> "tmux send-keys -t flash_build '
conda run -n <env> pip install ninja packaging && \
conda run -n <env> MAX_JOBS=4 pip install flash-attn --no-build-isolation 2>&1 | tee /tmp/flash_build.log
' Enter"
```

If that fails too, check if a pre-built wheel exists for your CUDA version at:
https://github.com/Dao-AILab/flash-attention/releases

### OOM during build (rare)
Symptom: `Killed` during compilation or `std::bad_alloc`.

Fix: Reduce parallel jobs:
```bash
dcc ssh <cluster> "conda run -n <env> MAX_JOBS=2 pip install flash-attn --no-build-isolation"
```

### Disk quota exceeded
Symptom: `No space left on device` during install.

Fix:
```bash
dcc ssh <cluster> "df -h $SCRATCH $HOME"
# Clean pip cache
dcc ssh <cluster> "conda run -n <env> pip cache purge"
# If conda envs are eating space, check
dcc ssh <cluster> "du -sh ~/miniconda3/envs/*"
```

### Package not found on PyPI
Symptom: `No matching distribution found for <package>`.

Fix: Check the exact package name on PyPI. Some packages have different install names:
- `llama_factory` → install as `llamafactory`
- `verl` → install as `verl` (check their GitHub for the current pip name)
