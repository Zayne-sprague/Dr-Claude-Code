# RunPod — Initial Setup

RunPod is a cloud GPU marketplace. Useful for burst compute when HPC queues are long.

---

## 1. Account and API Key

1. Create an account at [runpod.io](https://www.runpod.io)
2. Go to **Settings → API Keys** and create a key
3. Add it to your key_handler:

   ```python
   class KeyHandler:
       runpod_key: str = "your-runpod-api-key"
   ```

4. The RunPod CLI and SDK pick up `RUNPOD_API_KEY` from the environment — `KeyHandler.set_env_key()` handles this.

---

## 2. GPU Types and Pricing

Common options (prices approximate — check runpod.io for current rates):

| GPU | VRAM | Use case | Approx $/hr |
|---|---|---|---|
| RTX 3090 | 24 GB | Development, small models | ~$0.20–0.40 |
| RTX 4090 | 24 GB | Fast inference, mid models | ~$0.40–0.70 |
| A100 (40 GB) | 40 GB | Training, large models | ~$1.00–1.50 |
| A100 (80 GB) | 80 GB | Large model training | ~$1.50–2.00 |
| H100 (80 GB) | 80 GB | Fastest training | ~$2.50–4.00 |

Use **Community Cloud** for cheaper rates (shared hardware, less reliability) and **Secure Cloud** for guaranteed availability.

---

## 3. Pod vs Serverless

**Pods** — persistent VMs you start and stop manually. Best for:
- Interactive development
- Long training runs
- Jobs that need state between steps

**Serverless** — pay-per-second workers that scale to zero. Best for:
- Inference APIs
- Short batch jobs
- Cost-sensitive workloads

For research training runs, use Pods.

---

## 4. SSH Access to Pods

When launching a pod:
1. Under **SSH Terminal Access**, add your public key (`~/.ssh/id_ed25519.pub`)
2. After the pod starts, RunPod shows the SSH command: `ssh root@<ip> -p <port>`

Add to `~/.ssh/config` for convenience:

```
Host runpod-myrun
    HostName <ip>
    User root
    Port <port>
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking no
```

Then: `ssh runpod-myrun`

---

## 5. Storage

**Workspace volume** — ephemeral disk attached to the pod. Gone when the pod is deleted. Use for temp files only.

**Network volume** — persistent storage that survives pod deletion. Mount it when launching a pod. Use for:
- Model checkpoints
- Datasets
- Conda environments (so you don't reinstall every time)

Create a network volume from the RunPod dashboard before launching your pod, then select it at launch time.

Recommended layout on a network volume:

```
/workspace/
    models/        # downloaded weights
    datasets/      # training data
    envs/          # conda environments
    checkpoints/   # training checkpoints
```

---

## 6. Common Templates

When launching a pod, select a template:

- **RunPod PyTorch** — CUDA + PyTorch pre-installed, Jupyter available
- **vLLM** — ready-to-run vLLM inference server
- **Stable Diffusion** — image generation stack

For custom work, start from the PyTorch template and install your deps in a conda env stored on the network volume.

---

## 7. Cost Control

- **Stop pods when not in use** — you pay for stopped pods (disk only) but not running ones… actually you pay for running pods by the second. Stop or terminate when done.
- Set a **spending limit** in your RunPod account settings.
- Use `spot` instances where available for ~50% discount (can be preempted).
- Prefer Community Cloud for dev/canary runs; Secure Cloud for production training.
