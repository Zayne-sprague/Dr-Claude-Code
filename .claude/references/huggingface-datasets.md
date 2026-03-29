# HuggingFace Datasets — Detailed Reference

## Usage Example

```python
from key_handler import KeyHandler
KeyHandler.set_env_key()

from hf_utility import push_dataset_to_hub

push_dataset_to_hub(
    dataset=dataset,
    dataset_name="descriptive-name-v1",
    metadata={
        "script_name": "run_experiment.py",
        "model": "together_ai/Qwen/Qwen3-30B-A3B",
        "description": "What this dataset contains and why",
        "hyperparameters": {"temperature": 1.0, "max_tokens": 32000},
        "input_datasets": ["$HF_ORG/source-data"],
    },
    tags=["experiment-name", "baseline"],
    column_descriptions={
        "prompt": "Full prompt sent to the model",
        "response": "Raw model response including thinking trace",
    },
    experiment_doc_link="https://github.com/<your-github-org>/research-notes/tree/main/experiments/experiment-name",
)
```

## Naming Examples

- `ifh-prompts-v1` — input prompts
- `ifh-results-qwen3-30b-v1` — results for specific model
- `ifh-compliance-scores-v1` — processed analysis

## Multi-Config Datasets

For datasets growing incrementally: use `config_name` parameter for model-specific splits,
or re-upload full dataset. Either way, update README.

## Manifest

Auto-tracked in `$HF_ORG/PROJECT-MANIFEST`.
