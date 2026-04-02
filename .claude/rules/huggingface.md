# HuggingFace

Org is resolved automatically by `hf_utility` (in order): `HF_ORG` env var → `.raca/config.yaml` `hf_org` field → logged-in HF username.

**The canonical source for `hf_org` is `.raca/config.yaml`.** Set once during onboarding, used everywhere. When generating sbatch scripts, pass `hf_org` from config as a template variable. NEVER hardcode an org name in templates, scripts, or rules.

## hf_utility Package

All HuggingFace uploads go through `hf_utility` (`packages/hf_utility/`). It handles README generation, manifest tracking, and retries.

```python
from hf_utility import push_dataset_to_hub, delete_datasets, get_manifest

# Upload a dataset — org is resolved automatically
push_dataset_to_hub(
    dataset=dataset,
    dataset_name="my-exp-results-v1",
    metadata={
        "script_name": "run_eval.py",
        "model": "Qwen/Qwen3-8B",
        "description": "Evaluation results on Countdown task",
        "hyperparameters": {"temperature": 0.7, "max_tokens": 4096},
        "input_datasets": [],
    },
    tags=["my-experiment", "baseline"],
    column_descriptions={"model_response": "Full model output text", "correct": "Whether answer matched target"},
)

# Delete datasets matching a pattern
delete_datasets(pattern=r"^test-.*", force=True)

# Check what's tracked
manifest = get_manifest()
```

The package is installed in `.tools-venv/` by the installer. Use `.tools-venv/bin/python` for scripts that need it.

## Hard Rules

- Use `push_dataset_to_hub()` for ALL uploads — never `Dataset.push_to_hub()` directly
- Every dataset README must include: title, column table, generation parameters, sample counts
- Column docs must be specific: not "the score" but "circle packing score: sum_radii / 2.635, range [0, 1+]"
- Record every upload in experiment's `HUGGINGFACE_REPOS.md` (newest first)

## Naming

Pattern: `{experiment}-{content}-{version}` (e.g., `my-exp-results-qwen3-30b-v1`)

## HUGGINGFACE_REPOS.md Entry Format

```markdown
## <dataset-name> (YYYY-MM-DD)
- **Rows:** N
- **Purpose:** <brief description>
- **Link:** https://huggingface.co/datasets/<org>/<dataset-name>
```
