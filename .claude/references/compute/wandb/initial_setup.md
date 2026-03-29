# Weights & Biases — Initial Setup

W&B is used for experiment tracking: training metrics, hyperparameters, model artifacts.

---

## 1. Create Account and Get API Key

1. Sign up at [wandb.ai](https://wandb.ai)
2. Go to **Settings → API Keys** and copy your key
3. Add it to your key_handler:

   ```python
   class KeyHandler:
       wandb_key: str = "your-wandb-api-key"
   ```

   `KeyHandler.set_env_key()` injects it as `WANDB_API_KEY`, which W&B picks up automatically.

---

## 2. Login

**Via CLI:**

```bash
wandb login
# Paste your API key when prompted
```

**Via environment variable (preferred for scripts and clusters):**

```python
from key_handler import KeyHandler
KeyHandler.set_env_key()  # sets WANDB_API_KEY

import wandb
wandb.login()  # reads WANDB_API_KEY automatically
```

**Non-interactive login (for sbatch scripts):**

```bash
export WANDB_API_KEY="your-key"
# wandb.login() called inside the script will use this
```

---

## 3. Project Organization

Structure: `entity/project/run`

- **Entity** — your username or a team name
- **Project** — groups related experiments (e.g., `world-model-curiosity`, `pretraining-v2`)
- **Run** — a single training or eval job

Initialize in your script:

```python
wandb.init(
    project="my-experiment",
    entity="your-username-or-team",
    name="run-name-optional",
    config={
        "model": "Qwen3-1.7B",
        "lr": 1e-4,
        "batch_size": 32,
    }
)
```

---

## 4. Configuring in Training Scripts

**Log metrics:**

```python
wandb.log({"loss": loss.item(), "reward": reward.mean().item()}, step=global_step)
```

**Log at end:**

```python
wandb.finish()
```

**With verl / HuggingFace Trainer** — set these env vars and W&B auto-integrates:

```bash
export WANDB_PROJECT="my-project"
export WANDB_RUN_NAME="run-001"
```

Or pass to Trainer:

```python
from transformers import TrainingArguments
args = TrainingArguments(
    report_to="wandb",
    run_name="run-001",
    ...
)
```

---

## 5. Offline Mode (for clusters without internet)

If the compute node can't reach wandb.ai:

```bash
export WANDB_MODE=offline
```

Sync after the job finishes:

```bash
wandb sync path/to/wandb/run-*
```

---

## 6. Key Settings

| Env var | Purpose |
|---|---|
| `WANDB_API_KEY` | Authentication |
| `WANDB_PROJECT` | Default project name |
| `WANDB_ENTITY` | Default entity |
| `WANDB_RUN_NAME` | Override auto-generated run name |
| `WANDB_MODE` | `online` (default), `offline`, `disabled` |
| `WANDB_DIR` | Where local run files are stored |

Use `WANDB_MODE=disabled` in unit tests or dry runs to suppress all W&B calls.
