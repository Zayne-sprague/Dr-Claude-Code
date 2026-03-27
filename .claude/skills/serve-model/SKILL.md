---
name: serve-model
description: |
  Deploy a Hugging Face model as a vLLM OpenAI-compatible server on a SLURM cluster.
  Handles GPU planning, sbatch generation, job submission, port forwarding, and health check.
  Run this skill when the user says "serve a model", "host a model", "start vLLM",
  "deploy <model-name>", or "I need an inference endpoint".
---

# Serve Model Skill

This skill deploys a model with vLLM on a SLURM cluster and exposes it as a local OpenAI-compatible endpoint.

## Memory Estimation Reference

| Model Size | Approximate VRAM Needed | Notes                                    |
|------------|-------------------------|------------------------------------------|
| 0.5B–1.5B  | 4 GB                    | Fits on any modern GPU                   |
| 3B–8B      | 20 GB                   | 1× A100/H100 comfortable                 |
| 14B        | 35 GB                   | 1× A100/H100 tight; prefer H100          |
| 30B–32B    | 80 GB                   | 1× H100/A100 80GB, or 2× smaller GPUs   |
| 70B        | 160 GB                  | 2× H100 or 2× A100 80GB                 |
| 70B (AWQ)  | 40 GB                   | Quantized; fits on 1× A100/H100          |
| 72B        | 160 GB                  | Same as 70B                              |
| 110B+      | 220+ GB                 | 3–4× H100                               |

Rule of thumb: `n_params_billion × 2.4 GB` for float16. AWQ reduces by ~4×.

---

## Phase 1: Plan the Deployment

### Step 1.1 — Get model info from user

Ask:
- **Model name or HF path** (e.g., `Qwen/Qwen3-8B`, `meta-llama/Llama-3.1-70B-Instruct`)
- **Cluster nickname** (default: whatever is in `~/.dcc/clusters.yaml`)
- **Quantization?** (none / AWQ / GPTQ / FP8) — if user isn't sure, recommend none for < 32B, AWQ for 70B+
- **Expected concurrent users?** (affects `max_concurrent_requests`)

If the user doesn't specify a cluster, list available clusters:
```bash
dcc cluster list
```

### Step 1.2 — Validate model exists on HF

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://huggingface.co/api/models/$(echo '<model>' | sed 's|/|%2F|g')"
```

If response is 200: model exists. If 404: ask user to confirm the model path.

Note: gated models (Llama, Gemma, etc.) require `HUGGINGFACE_TOKEN` to be set on the cluster.

### Step 1.3 — Read cluster config

```bash
dcc cluster info <nickname>
```

Or read `~/.dcc/clusters.yaml` directly. Extract:
- Available GPU types and VRAM
- GRES format (typed vs generic)
- Default partition and account
- Scratch path

### Step 1.4 — Calculate GPU requirements

Apply memory estimation from the table above. Round up to the nearest GPU count.

For tensor parallelism: vLLM requires `tensor_parallel_size` to evenly divide the model layers.
Standard safe choices: 1, 2, 4, 8.

Present the plan to the user:
```
Model: Qwen/Qwen3-70B-Instruct
Estimated VRAM: ~160 GB
Cluster: torch (H100 SXM, 80 GB each)
Plan: 2× H100, tensor_parallel_size=2
Partition: h100_courant
```

Ask: "Does this look right? Proceed?"

---

## Phase 2: Ensure vLLM is Installed

### Step 2.1 — Check for existing vLLM conda env

```bash
dcc ssh <cluster> "conda env list | grep vllm"
```

If an env with `vllm` in the name exists:
```bash
dcc ssh <cluster> "conda run -n <env-name> python -c 'import vllm; print(vllm.__version__)'"
```

If vLLM imports successfully, note the env name and skip to Phase 3.

### Step 2.2 — Install vLLM if missing

If no vLLM env exists, create one in tmux (so install persists after SSH timeout):

```bash
dcc ssh <cluster> "tmux new-session -d -s vllm-install 'conda create -n vllm python=3.11 -y && conda run -n vllm pip install vllm && echo DONE > /tmp/vllm_install_done.txt' 2>&1"
```

Poll for completion:
```bash
# Check every 60 seconds
dcc ssh <cluster> "cat /tmp/vllm_install_done.txt 2>/dev/null && conda run -n vllm python -c 'import vllm; print(vllm.__version__)'"
```

Typical install time: 5–15 minutes. Inform the user and wait.

If install fails, check the tmux log:
```bash
dcc ssh <cluster> "tmux capture-pane -pt vllm-install -S -200"
```

Common failure modes:
- CUDA version mismatch: check `nvcc --version` vs installed PyTorch CUDA
- Network timeout: retry the pip install
- Disk quota exceeded: check `df -h $SCRATCH`

---

## Phase 3: Write and Submit the sbatch Script

### Step 3.1 — Generate the sbatch script

Write a script to `/tmp/serve_<model_slug>_<timestamp>.sh` (locally), then upload.

The model slug is the model name with `/` replaced by `_` and lowercased.

```bash
#!/bin/bash
#SBATCH --job-name=serve_<model_slug>
#SBATCH --partition=<partition>
#SBATCH --account=<account>
#SBATCH --nodes=1
#SBATCH --ntasks-per-node=1
#SBATCH --cpus-per-task=<n_gpus * 4>
#SBATCH --mem=<n_gpus * 64>G
#SBATCH --gres=<gres_directive>
#SBATCH --time=12:00:00
#SBATCH --output=<scratch>/vllm_serve_%j.log
#SBATCH --error=<scratch>/vllm_serve_%j.err

# Graceful shutdown on SIGTERM (SLURM sends this before killing)
cleanup() {
    echo "[vllm] Caught SIGTERM, shutting down..."
    kill $VLLM_PID 2>/dev/null
    wait $VLLM_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Activate conda env
source $(conda info --base)/etc/profile.d/conda.sh
conda activate vllm

# Pick a dynamic port to avoid conflicts
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
echo "[vllm] Starting on port $PORT"
echo "[vllm] NODE: $(hostname)"
echo "[vllm] JOB_ID: $SLURM_JOB_ID"
echo "[vllm] PORT: $PORT"

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
    --model <model_name> \
    --tensor-parallel-size <tp_size> \
    --max-model-len 32768 \
    --gpu-memory-utilization 0.92 \
    --max-num-seqs 256 \
    --port $PORT \
    --host 0.0.0.0 &
VLLM_PID=$!

# Wait for server to be ready (up to 10 minutes)
for i in $(seq 1 60); do
    if curl -s "http://localhost:$PORT/health" | grep -q "{}"; then
        echo "[vllm] Server is ready on port $PORT"
        break
    fi
    echo "[vllm] Waiting for server... attempt $i/60"
    sleep 10
done

wait $VLLM_PID
```

Upload the script:
```bash
dcc upload <cluster> /tmp/serve_<model_slug>_<timestamp>.sh <scratch>/scripts/serve_<model_slug>.sh
```

### Step 3.2 — Submit the job

```bash
dcc ssh <cluster> "sbatch <scratch>/scripts/serve_<model_slug>.sh"
```

Record the job ID from the output (e.g., `Submitted batch job 123456`).

---

## Phase 4: Monitor Until Running

### Step 4.1 — Poll squeue until RUNNING

```bash
dcc ssh <cluster> "squeue -j <job_id> --format='%i %j %T %R %N' --noheader"
```

States:
- `PENDING` — waiting in queue (normal)
- `RUNNING` — job has started on a node
- `FAILED` / `CANCELLED` — something went wrong

Poll every 30 seconds. Inform the user of queue position if possible:
```bash
dcc ssh <cluster> "squeue -j <job_id> --format='%Q' --noheader"
```

### Step 4.2 — Get node and port from logs

Once RUNNING:
```bash
dcc ssh <cluster> "grep -E 'NODE:|PORT:|ready on port' <scratch>/vllm_serve_<job_id>.log | tail -5"
```

Extract `NODE` and `PORT` from the log output.

If logs aren't ready yet, wait 30 more seconds and retry (the startup script prints these immediately).

---

## Phase 5: Expose and Verify

### Step 5.1 — Set up port forward

```bash
dcc forward <cluster> <remote_port> --local <local_port>
```

If `local_port` is not specified, pick an available one:
```bash
python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"
```

The `dcc forward` command uses SSH ControlMaster for persistence. The forward stays alive as long as the dcc session is active.

### Step 5.2 — Health check

```bash
curl -s http://localhost:<local_port>/health
curl -s http://localhost:<local_port>/v1/models | jq '.data[].id'
```

If health check returns `{}` and models list shows the model name: success.

### Step 5.3 — Tell the user

```
Model is live!
  Endpoint: http://localhost:<local_port>/v1
  Model:    <model_name>
  Job ID:   <job_id>
  Logs:     dcc ssh <cluster> "tail -f <scratch>/vllm_serve_<job_id>.log"

Use with OpenAI client:
  client = openai.OpenAI(base_url="http://localhost:<local_port>/v1", api_key="none")
  response = client.chat.completions.create(model="<model_name>", messages=[...])

To stop:
  dcc ssh <cluster> "scancel <job_id>"
  dcc forward stop <local_port>
```

---

## Phase 6: Stop the Server

When the user says "stop the model", "cancel the job", or "shut down vLLM":

```bash
dcc ssh <cluster> "scancel <job_id>"
dcc forward stop <local_port>
```

Confirm:
```bash
dcc ssh <cluster> "squeue -j <job_id> --noheader 2>/dev/null || echo 'Job no longer in queue'"
```
