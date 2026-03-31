# HuggingFace Dataset Standards

Org: `$HF_ORG` (set in `.raca/config.yaml` or environment).

## Hard Rules

- Use `push_dataset_to_hub()` for ALL uploads — never `Dataset.push_to_hub()` directly
- Every dataset README must include: title, column table, generation parameters, reproduction instructions, experiment doc link, sample counts, known limitations
- Column docs must be specific: not "the score" but "circle packing score: sum_radii / 2.635, range [0, 1+]"
- Record every upload in experiment's `HUGGINGFACE_REPOS.md` (newest first) with: dataset name, upload date, row count, purpose

## Naming

Pattern: `{experiment}-{content}-{version}` (e.g., `my-exp-results-qwen3-30b-v1`)

## Upload Template

```python
push_dataset_to_hub(
    dataset=dataset,
    dataset_name="{experiment}-{description}-{version}",
    org="$HF_ORG",
    metadata={
        "script_name": "<the script that generated this>",
        "model": "<model used>",
        "description": "<what this dataset contains>",
        "hyperparameters": {<key params>},
        "input_datasets": [<any input datasets>],
    },
    tags=["<experiment-name>", "<condition>"],
    column_descriptions={<column: description for each column>},
    experiment_doc_link="<link to experiment notes>",
)
```

## HUGGINGFACE_REPOS.md Entry Format

```markdown
## <dataset-name> (YYYY-MM-DD)
- **Rows:** N
- **Purpose:** <brief description>
- **Link:** https://huggingface.co/datasets/$HF_ORG/<dataset-name>
```
