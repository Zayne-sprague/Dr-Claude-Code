---
name: parallel-install
description: |
  Install multiple packages on a cluster simultaneously using parallel tmux sessions.
  Faster than sequential installs when packages don't depend on each other.
  Run this skill when the user says "install X and Y", "set up the full environment",
  "install everything I need", or lists multiple packages at once.
---

# Parallel Install Skill

Install multiple packages at the same time using parallel tmux sessions. Each package gets its own session so they can run concurrently.

---

## Phase 1: Plan the Installs

### Step 1.1 — Parse the package list

From the user's request, extract:
- Package names (e.g., vllm, verl, llama_factory, custom packages)
- Target cluster
- Target conda env(s) — may be one shared env or separate envs per package

If the user didn't specify, ask: "Should each package get its own conda env, or install everything into one env?"

For most use cases, separate envs are better (avoid dependency conflicts between vLLM and verl).

### Step 1.2 — Check what's already installed

For each package, check in parallel (run all these checks at once):

```bash
dcc ssh <cluster> "
for env_pkg in 'vllm:vllm' 'verl:verl' 'llamafactory:llamafactory'; do
    env=\${env_pkg%%:*}
    pkg=\${env_pkg##*:}
    result=\$(conda run -n \$env python -c \"import \$pkg; print(\$pkg.__version__)\" 2>&1)
    echo \"\$env: \$result\"
done
"
```

Mark already-installed packages as SKIP.

### Step 1.3 — Estimate time and present the plan

Time estimates per package:
| Package          | Estimated Time | Notes                                  |
|------------------|----------------|----------------------------------------|
| vLLM             | 5–10 min       | Pre-built wheels available for CUDA 12 |
| vLLM (flash-attn)| 20–60 min      | Source build on aarch64                |
| verl             | 10–20 min      | flash-attn build may add time          |
| LLaMA Factory    | 5–15 min       |                                        |
| custom (small)   | 1–5 min        |                                        |
| custom (large)   | 5–20 min       | Depends on deps                        |

Since installs run in parallel, total time ≈ max of individual times (not sum).

Present a plan to the user:

```
Install Plan (parallel):
  [1] vllm → conda env: vllm          (~8 min)
  [2] verl → conda env: verl          (~20 min)
  [3] llama_factory → conda env: llm  (~10 min)

Running in parallel. Estimated total time: ~20 min.
Packages already installed: (none)

Proceed?
```

Wait for user confirmation before starting.

---

## Phase 2: Dispatch Parallel Installs

### Step 2.1 — Start all tmux sessions simultaneously

Create all tmux sessions at once:

```bash
dcc ssh <cluster> "
tmux new-session -d -s install_vllm 'conda create -n vllm python=3.11 -y && conda run -n vllm pip install vllm && echo DONE > /tmp/install_vllm_done.txt; bash' 2>/dev/null
tmux new-session -d -s install_verl 'conda create -n verl python=3.11 -y && conda run -n verl pip install torch==2.4.0 --index-url https://download.pytorch.org/whl/cu121 && conda run -n verl pip install verl && conda run -n verl pip install flash-attn --no-build-isolation && echo DONE > /tmp/install_verl_done.txt; bash' 2>/dev/null
tmux new-session -d -s install_llamafactory 'conda create -n llamafactory python=3.11 -y && conda run -n llamafactory pip install llamafactory && echo DONE > /tmp/install_llamafactory_done.txt; bash' 2>/dev/null
"
```

Confirm sessions started:
```bash
dcc ssh <cluster> "tmux list-sessions | grep install_"
```

### Step 2.2 — Monitor all sessions

Poll every 60 seconds. Check each session's sentinel file and capture recent output:

```bash
dcc ssh <cluster> "
echo '=== vllm ===' && cat /tmp/install_vllm_done.txt 2>/dev/null || tmux capture-pane -pt install_vllm -S -5 2>/dev/null | tail -3
echo '=== verl ===' && cat /tmp/install_verl_done.txt 2>/dev/null || tmux capture-pane -pt install_verl -S -5 2>/dev/null | tail -3
echo '=== llamafactory ===' && cat /tmp/install_llamafactory_done.txt 2>/dev/null || tmux capture-pane -pt install_llamafactory -S -5 2>/dev/null | tail -3
"
```

Report to the user:
```
Status update:
  vllm:         DONE (finished in 7 min)
  verl:         installing flash-attn... (12 min elapsed)
  llamafactory: DONE (finished in 9 min)
```

Continue polling until all sentinel files exist.

---

## Phase 3: Collect Results

### Step 3.1 — Verify each install

After all sessions show DONE, verify each import:

```bash
dcc ssh <cluster> "
conda run -n vllm python -c 'import vllm; print(\"vllm\", vllm.__version__)' 2>&1
conda run -n verl python -c 'import verl; print(\"verl\", verl.__version__)' 2>&1
conda run -n llamafactory python -c 'import llamafactory; print(\"llamafactory ok\")' 2>&1
"
```

### Step 3.2 — Report results

For each package, report: INSTALLED, FAILED, or SKIPPED (already present).

```
Install Results:
  vllm         — INSTALLED (v0.6.6, env: vllm)
  verl         — INSTALLED (v0.4.1, env: verl)
  llamafactory — INSTALLED (env: llamafactory)

All packages ready.
```

If any FAILED, show the error from the tmux log and offer to debug:
```bash
dcc ssh <cluster> "tmux capture-pane -pt install_<failed_pkg> -S -100"
```

Then invoke the `install-package` skill for the failed package to troubleshoot individually.

### Step 3.3 — Clean up tmux sessions

```bash
dcc ssh <cluster> "tmux kill-session -t install_vllm 2>/dev/null; tmux kill-session -t install_verl 2>/dev/null; tmux kill-session -t install_llamafactory 2>/dev/null"
```

---

## Notes

- Parallel installs work best when packages go into separate conda envs. If they share an env, pip may serialize installs internally due to locking.
- If the cluster has limited CPU cores on the login node, consider staggering heavy builds (like flash-attn) by a few minutes to avoid overloading the node.
- For packages that require GPU access during install (rare), you'll need to run the install inside an interactive SLURM job instead:
  ```bash
  dcc ssh <cluster> "salloc --partition=<gpu_partition> --gres=gpu:1 --time=1:00:00"
  ```
