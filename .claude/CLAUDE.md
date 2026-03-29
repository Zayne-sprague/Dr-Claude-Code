# Dr. Claude Code — Workspace Instructions

This is a research workspace managed by Claude Code. You are a research collaborator.

## Workspace Structure

- `notes/experiments/` — experiment tracking (YAML, READMEs, activity logs)
- `tools/visualizer/` — HuggingFace Spaces dashboard
- `tools/cli/` — `dcc` SSH lifecycle tool
- `templates/sbatch/` — Jinja2 sbatch templates
- `.claude/` — rules, agents, commands, skills, hooks

## Key Rules

Detailed instructions in `.claude/rules/`:
- `experiments.md` — experiment lifecycle: design → red-team → canary → validate → run → harvest → review
- `workspace.md` — folder conventions
- `python-patterns.md` — Python style (3.10+, ruff, type hints)
- `git-safety.md` — push safety
- `security.md` — never hardcode API keys
- `huggingface-datasets.md` — HF upload standards

## Benchmark & Task References

@.claude/references/datasets_and_tasks/datasets_and_tasks_map.md

Before setting up evaluation, data generation, or RL training for any benchmark/task, check the table above. If a reference file exists, read it — it contains evaluation method, prompt templates, known pitfalls, and setup checklists.

## References (on-demand)

Detailed references in `.claude/references/` (loaded when needed):
- `experiments.md` — full experiment lifecycle detail
- `workspace.md` — folder structure, session startup
- `tool-decision-guide.md` — when to use which tool
- `huggingface-datasets.md` — HF upload examples and patterns
- `datasets_and_tasks/` — benchmark reference files

## Compute Setup References

Setup guides for compute backends in `.claude/references/compute/`:
- `slurm/` — SLURM HPC cluster setup
- `runpod/` — RunPod cloud GPU setup
- `local/` — Local GPU setup
- `wandb/` — Weights & Biases setup
- `huggingface/` — HuggingFace setup

## API Keys

Use `key_handler.KeyHandler` for all API key management. Never hardcode keys.
- Keys stored in `packages/key_handler/key_handler/key_handler.py` (gitignored)
- Template at `key_handler__template.py` — copy and fill in your keys
- Call `KeyHandler.set_env_key()` at script start to inject into environment

## Cluster Access

Cluster configs are in `~/.dcc/clusters.yaml`. The user authenticates with `dcc auth <cluster>`.
You run commands on clusters via `dcc ssh <cluster> "command"`.
You transfer files via `dcc upload` / `dcc download`.
You set up port forwards via `dcc forward`.

## Critical Rules

- NEVER hardcode API keys or tokens
- ALWAYS use the model's full supported max_tokens for generation
- ALWAYS upload artifacts to HF immediately after creation
- NO compute without red-team review (unless user overrides)
- NO analysis before data validation
