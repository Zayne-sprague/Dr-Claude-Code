# HuggingFace — Initial Setup

HuggingFace is used for model weights, datasets, and Spaces (hosted apps/dashboards).

---

## 1. Create Account and Token

1. Sign up at [huggingface.co](https://huggingface.co)
2. Go to **Settings → Access Tokens**
3. Create a token:
   - **Read** token — for downloading models and private datasets
   - **Write** token — for uploading datasets, models, and deploying Spaces

   For research workflows you almost always need a **write** token.

4. Add it to your key_handler:

   ```python
   class KeyHandler:
       hf_key: str = "hf_..."
   ```

   `KeyHandler.set_env_key()` injects it as both `HF_TOKEN` and `HF_API_KEY`.

---

## 2. Login

**Via CLI:**

```bash
huggingface-cli login
# Paste your token when prompted
```

**Via Python (preferred for scripts):**

```python
from key_handler import KeyHandler
KeyHandler.set_env_key()  # sets HF_TOKEN

from huggingface_hub import login
login()  # reads HF_TOKEN automatically
```

**Verify:**

```bash
huggingface-cli whoami
```

---

## 3. Organizations and Spaces

**Organizations** — shared namespaces for teams. Datasets and models can live under an org rather than a personal account (e.g., `reasoning-degeneration-dev/dataset-name`).

**Spaces** — hosted ML apps. Two modes:
- **Gradio / Streamlit** — pure Python app, HF handles the runtime
- **Docker** — full container control, needed for complex apps

For the Dr-Claude-Code dashboard, a Docker Space is used. The Space is deployed by pushing a git repo with a `README.md` containing YAML frontmatter that specifies the SDK.

---

## 4. Dataset Uploads

Use `hf_utility.push_dataset_to_hub()` (the workspace wrapper) — not `Dataset.push_to_hub()` directly. The wrapper enforces metadata, README generation, and the org naming convention.

Manual upload example (when not using the wrapper):

```python
from datasets import Dataset
import pandas as pd

df = pd.read_json("results.jsonl", lines=True)
ds = Dataset.from_pandas(df)
ds.push_to_hub("your-org/dataset-name", token="hf_...")
```

---

## 5. Space Deployment Basics

A Space is a git repo hosted at `https://huggingface.co/spaces/<org>/<name>`.

Push to deploy:

```bash
git remote add space https://huggingface.co/spaces/your-org/your-space
git push space main
```

HF rebuilds the Docker image on every push. Build logs visible at `https://huggingface.co/spaces/your-org/your-space/logs`.

The app is live at `https://your-org-your-space.hf.space` (note: hyphens replace slashes in the subdomain).

**Space secrets** — add sensitive values (API keys, tokens) via the Space settings UI under **Repository secrets**. They appear as environment variables at runtime. Never hardcode them in the repo.

---

## 6. Caching Model Weights on Clusters

HF downloads weights to `~/.cache/huggingface/` by default. On HPC clusters, redirect to scratch:

```bash
export HF_HOME=$SCRATCH/.cache/huggingface
```

Pre-download weights on the login node (before submitting your job) so compute nodes don't need internet access:

```bash
huggingface-cli download Qwen/Qwen3-1.7B --local-dir $SCRATCH/models/qwen3-1.7b
```

Then load from local path in your script:

```python
model = AutoModelForCausalLM.from_pretrained("$SCRATCH/models/qwen3-1.7b")
```
