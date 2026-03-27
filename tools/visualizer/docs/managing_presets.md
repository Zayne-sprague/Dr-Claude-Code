# Managing AGG_VIS_PRESETS Programmatically

## Overview

The agg_visualizer stores presets in the HuggingFace dataset repo `your-org/AGG_VIS_PRESETS`. Each visualizer type has its own JSON file:

| Type | File | Extra Fields |
|------|------|-------------|
| `model` | `model_presets.json` | `column` (default: `"model_responses"`) |
| `arena` | `arena_presets.json` | none |
| `rlm` | `rlm_presets.json` | `config` (default: `"rlm_call_traces"`) |
| `harbor` | `harbor_presets.json` | none |

## Preset Schema

Every preset has these base fields:

```json
{
  "id": "8-char hex",
  "name": "Human-readable name",
  "repo": "org/dataset-name",
  "split": "train"
}
```

Plus type-specific fields listed above.

## How to Add Presets from Experiment Markdown Files

### Step 1: Identify repos and their visualizer type

Read the experiment markdown file(s) and extract all HuggingFace repo links. Categorize each:

- **Countdown / MuSR datasets** (model response traces) → `model` type, set `column: "response"`
- **FrozenLake / arena datasets** (game episodes) → `arena` type
- **Harbor / SWE-bench datasets** → `harbor` type
- **RLM call traces** → `rlm` type, set `config: "rlm_call_traces"`

### Step 2: Download existing presets from HF

```python
from huggingface_hub import hf_hub_download
import json

PRESETS_REPO = "your-org/AGG_VIS_PRESETS"

def load_hf_presets(vis_type):
    try:
        path = hf_hub_download(PRESETS_REPO, f"{vis_type}_presets.json", repo_type="dataset")
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []

existing_model = load_hf_presets("model")
existing_arena = load_hf_presets("arena")
# ... etc for rlm, harbor

# Build set of repos already present
existing_repos = set()
for presets_list in [existing_model, existing_arena]:
    for p in presets_list:
        existing_repos.add(p["repo"])
```

### Step 3: Build new presets, skipping duplicates

```python
import uuid

new_presets = []  # list of (vis_type, name, repo)

# Example: adding strategy compliance countdown presets
new_presets.append(("model", "SC Countdown K2-Inst TreeSearch",
    "your-org/t1-strategy-countdown-treesearch-kimi-k2-instruct-kimi-inst"))

# ... add all repos from the markdown ...

# Filter out existing
to_add = {"model": [], "arena": [], "rlm": [], "harbor": []}
for vis_type, name, repo in new_presets:
    if repo in existing_repos:
        continue  # skip duplicates
    preset = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "repo": repo,
        "split": "train",
    }
    if vis_type == "model":
        preset["column"] = "response"
    elif vis_type == "rlm":
        preset["config"] = "rlm_call_traces"
    to_add[vis_type].append(preset)
```

### Step 4: Merge and upload to HF

```python
import tempfile, os
from huggingface_hub import HfApi

api = HfApi()

# Merge new presets with existing
final_model = existing_model + to_add["model"]
final_arena = existing_arena + to_add["arena"]

for vis_type, presets in [("model", final_model), ("arena", final_arena)]:
    if not presets:
        continue
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(presets, f, indent=2)
        tmp = f.name
    api.upload_file(
        path_or_fileobj=tmp,
        path_in_repo=f"{vis_type}_presets.json",
        repo_id=PRESETS_REPO,
        repo_type="dataset",
    )
    os.unlink(tmp)
```

### Step 5: Sync the deployed HF Space

After uploading to the HF dataset, tell the running Space to re-download presets:

```bash
curl -X POST "https://your-org-agg-trace-visualizer.hf.space/api/presets/sync"
```

This forces the Space to re-download all preset files from `AGG_VIS_PRESETS` without needing a restart or redeployment.

### Step 6: Sync local preset files

```python
import shutil
from huggingface_hub import hf_hub_download

local_dir = "/Users/rs2020/Research/tools/visualizers/agg_visualizer/backend/presets"
for vis_type in ["model", "arena", "rlm", "harbor"]:
    try:
        path = hf_hub_download(PRESETS_REPO, f"{vis_type}_presets.json", repo_type="dataset")
        shutil.copy2(path, f"{local_dir}/{vis_type}_presets.json")
    except Exception:
        pass
```

## Naming Convention

Preset names follow this pattern to be descriptive and avoid future conflicts:

```
{Experiment} {Task} {Model} {Variant}
```

### Experiment prefixes
- `SC` — Strategy Compliance
- `Wing` — Wingdings Compliance

### Model abbreviations
- `K2-Inst` — Kimi-K2-Instruct (RLHF)
- `K2-Think` — Kimi-K2-Thinking (RLVR)
- `Q3-Inst` — Qwen3-Next-80B Instruct (RLHF)
- `Q3-Think` — Qwen3-Next-80B Thinking (RLVR)

### Task names
- `Countdown` — 8-arg arithmetic countdown
- `MuSR` — MuSR murder mysteries
- `FrozenLake` — FrozenLake grid navigation

### Variant names (strategy compliance only)
- `TreeSearch` / `Baseline` / `Anti` — countdown tree search experiment
- `CritFirst` / `Anti-CritFirst` — criterion-first cross-cutting analysis
- `Counterfactual` / `Anti-Counterfactual` — counterfactual hypothesis testing
- `BackChain` — backward chaining (FrozenLake)

### Examples

```
SC Countdown K2-Inst TreeSearch       # Strategy compliance, countdown, Kimi instruct, tree search variant
SC MuSR Q3-Think Counterfactual       # Strategy compliance, MuSR, Qwen thinking, counterfactual variant
SC FrozenLake K2-Think BackChain      # Strategy compliance, FrozenLake, Kimi thinking, backward chaining
Wing Countdown Q3-Inst                # Wingdings, countdown, Qwen instruct (no variant — wingdings has one condition)
Wing MuSR K2-Think                    # Wingdings, MuSR, Kimi thinking
```

## Important Notes

- **Always check for existing repos** before adding. The script above uses `existing_repos` set to skip duplicates.
- **The `column` field matters for model presets.** Strategy compliance and wingdings datasets use `"response"` as the response column, not the default `"model_responses"`.
- **Local files are fallback cache.** The agg_visualizer downloads from HF on startup and caches locally. After uploading to HF, sync the local files so the running app picks up changes without restart (or hit the `/api/presets/sync` endpoint).
- **Don't modify rlm or harbor presets** unless adding datasets of those types. The script above only touches model and arena.
