# RACA Codemap

## Top-Level

| Folder | Description |
|--------|-------------|
| `private_projects/` | Your research code — experiment implementations, training scripts, eval pipelines. Each project is its own git repo. RACA can edit and push freely. |
| `public_projects/` | Public-facing code — open-source tools, paper code. RACA can edit but **never pushes without explicit user approval**. |
| `notes/` | Experiment tracking and personal notes. The dashboard reads from `notes/experiments/`. Also a good place for ideas, lit reviews, reading notes. |
| `packages/` | Shared Python packages reused across experiments (key_handler, hf_utility) |
| `tools/` | Third-party and custom tooling (raca CLI, experiment dashboard, chat UI) |
| `docs/` | Documentation and images |
| `.claude/` | Rules, agents, commands, skills (read-only config) |
| `.raca/` | Workspace runtime state (onboarding, cluster config, job tracking — Claude reads/writes freely) |

## `private_projects/`

Your experiment code lives here. Each project gets its own folder and git repo.

## `public_projects/`

Public-facing code. RACA can edit files but will always ask before pushing to a remote.

## `packages/`

| Folder | Description |
|--------|-------------|
| `key_handler/` | API key management — stores and injects keys into environment |
| `hf_utility/` | HuggingFace dataset upload with automatic README and manifest tracking |

## `tools/`

| Folder | Description |
|--------|-------------|
| `cli/` | `raca` CLI tool — SSH lifecycle (auth, ssh, upload, download, forward) |
| `visualizer/` | Local experiments dashboard — Flask + React app for monitoring experiments and results |
| `chat-ui/` | Chat server UI (Python, FastAPI-based) |

## `notes/`

| Folder | Description |
|--------|-------------|
| `experiments/` | Per-experiment folders with YAML configs, READMEs, activity logs |
| (user-created) | Personal notes, ideas, lit reviews — RACA reads these for context |

## `.claude/`

| Folder | Description |
|--------|-------------|
| `rules/` | Always-loaded instruction files (experiments, workspace, huggingface) |
| `references/` | On-demand reference docs (experiments detail, compute setup, HF examples, benchmark/task refs, sbatch templates) |
| `commands/raca/` | Slash commands (benchmark-reference, dashboard-sync, experiment-preflight, find-compute, harvest-and-report, onboarding) |
| `skills/` | Multi-step skills (dashboard-visualizer, experiment-management, run-job, setup-cluster, setup-runpod) |
| `agents/` | Subagent definitions (data-validator, red-team-reviewer) |

## `.claude/references/`

| Folder | Description |
|--------|-------------|
| `compute/` | Setup guides per backend (slurm, runpod, local, wandb, huggingface, plugins) |
| `datasets_and_tasks/` | Benchmark reference files (countdown.md, etc.) |
| `experiments.md` | Full experiment lifecycle detail |
| `workspace.md` | Folder structure, session startup conventions |
| `tool-decision-guide.md` | When to use which tool |
| `huggingface.md` | HF upload examples and patterns |
