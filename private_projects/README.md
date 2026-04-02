# Private Projects

This is where your research code lives — the actual implementations, training scripts, evaluation pipelines, and analysis code for your experiments.

Each project gets its own folder with its own git repo:

```
private_projects/
  my-rl-training/      ← git repo
  eval-pipeline/       ← git repo
  data-processing/     ← git repo
```

RACA can create, edit, and push code in these projects freely. When an experiment needs custom code, it goes here — not in `notes/experiments/`.

**Typical workflow:**
1. You describe what you want to build
2. RACA writes the code here
3. RACA runs it on your cluster via `raca ssh`
4. Results get uploaded to HuggingFace and tracked in `notes/experiments/`
