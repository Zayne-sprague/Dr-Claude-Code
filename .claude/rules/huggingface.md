# HuggingFace

Org is resolved automatically by `hf_utility` (in order): `HF_ORG` env var → `.raca/config.yaml` `hf_org` field → logged-in HF username.

**The canonical source for `hf_org` is `.raca/config.yaml`.** Set once during onboarding, used everywhere. When generating sbatch scripts, pass `hf_org` from config as a template variable. NEVER hardcode an org name in templates, scripts, or rules.

**`hf_org` = upload destination, not download source.** The workspace org (where results go) and the source org (where models/eval data live) are often different. `hf_org` in config is always the upload destination. When downloading from a different org, specify it explicitly in the experiment config or script args — never overload `hf_org` for both.

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

## Naming (Slug-Based)

All artifacts from one experiment share the experiment folder name as a slug prefix:

```
{experiment-slug}-{description}-{version}
```

The slug comes from the experiment folder name in `notes/experiments/`. Examples for experiment `scaling-laws`:
- `scaling-laws-canary-v1`
- `scaling-laws-results-qwen3-8b`
- `scaling-laws-eval-v2`

Pass `experiment_slug` to enforce this:
```python
push_dataset_to_hub(
    dataset=dataset,
    dataset_name="scaling-laws-results-v1",
    experiment_slug="scaling-laws",  # raises ValueError if name doesn't match
    ...
)
```

## Provenance Metadata

Every upload should include provenance metadata when experiment/job context is available:

| Key | Type | Description |
|-----|------|-------------|
| `experiment_name` | str | Experiment folder name |
| `job_id` | str | Cluster job ID (e.g., "empire:926435") |
| `cluster` | str | Which cluster it ran on |
| `artifact_status` | str | "partial" or "final" |
| `canary` | bool | Whether this is a canary run |

Pass them in the `metadata` dict — the README auto-generates a Provenance section:

```python
push_dataset_to_hub(
    dataset=dataset,
    dataset_name="scaling-laws-results-v1",
    experiment_slug="scaling-laws",
    metadata={
        "script_name": "run_eval.py",
        "model": "Qwen/Qwen3-8B",
        "description": "Evaluation results",
        "experiment_name": "scaling-laws",
        "job_id": "empire:926435",
        "cluster": "empire",
        "artifact_status": "final",
        "canary": False,
    },
    ...
)
```

## HUGGINGFACE_REPOS.md Entry Format

```markdown
## <dataset-name> (YYYY-MM-DD)
- **Rows:** N
- **Purpose:** <brief description>
- **Link:** https://huggingface.co/datasets/<org>/<dataset-name>
```
