---
title: Research Dashboard
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Research Dashboard

A unified research control pane with two main sections:

## Experiments

Track research experiments, hypotheses, runs, and artifacts:

- **Experiment tracking** - Create/manage experiments with hypothesis statements, status, and completeness scoring
- **Run history** - Record runs with conditions, models, clusters, metrics, and HF dataset links
- **Sub-experiments** - Drill into focused sub-studies with markdown reports
- **HF dataset catalog** - Link and browse all HuggingFace datasets per experiment

Data stored in `your-org/RESEARCH_DASHBOARD`. Supports programmatic import via `/api/experiments/import`.

## Visualizer

Six trace visualization tools:

- **Model Trace** - Analyze reasoning traces from model responses (think tags, backtracks, restarts)
- **Arena** - Explore multi-agent game episodes and transcripts
- **RLM** - Navigate hierarchical RLM call traces (GEPA iterations, RLM calls)
- **RLM Eval** - RLM evaluation trace viewer
- **Harbor** - View SWE-bench agent trajectories (ATIF + raw message formats)
- **AdaEvolve** - Explore AdaEvolve optimization traces

Each visualizer loads datasets from HuggingFace and supports preset configurations stored in `your-org/AGG_VIS_PRESETS`.
