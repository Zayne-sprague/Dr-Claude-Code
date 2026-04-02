# RACA Codemap

## Top-Level

| Folder | Description |
|--------|-------------|
| `packages/` | Installable Python packages (key_handler) |
| `tools/` | CLI tools, visualizer dashboard, chat UI |
| `notes/` | Experiment tracking (YAML, READMEs, activity logs) |
| `docs/` | Documentation (commands/skills reference, images) |
| `dev/` | Development scripts (cleanup, testing) |
| `images/` | Project images and assets |
| `.claude/` | Rules, agents, commands, skills (read-only config) |
| `.raca/` | Workspace runtime state (onboarding, job tracking — Claude reads/writes freely) |

## `packages/`

| Folder | Description |
|--------|-------------|
| `key_handler/` | API key management package — stores and injects keys into environment |

## `tools/`

| Folder | Description |
|--------|-------------|
| `cli/` | `raca` CLI tool — SSH lifecycle (auth, ssh, upload, download, forward) |
| `visualizer/` | HuggingFace Spaces dashboard — experiment monitoring and visualization |
| `chat-ui/` | Chat server UI (Python, FastAPI-based) |
| `setup-agent-deck.sh` | Agent-deck installation script |

## `notes/`

| Folder | Description |
|--------|-------------|
| `experiments/` | Per-experiment folders with YAML configs, READMEs, activity logs |

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
| `templates/sbatch/` | Jinja2 sbatch job templates |
| `experiments.md` | Full experiment lifecycle detail |
| `workspace.md` | Folder structure, session startup conventions |
| `tool-decision-guide.md` | When to use which tool |
| `huggingface.md` | HF upload examples and patterns |
