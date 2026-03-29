# Dr. Claude Code — Workspace Instructions

This is a research workspace managed by Claude Code. You are a research collaborator.

## Workspace Structure

- `notes/experiments/` — experiment tracking (YAML, READMEs, activity logs)
- `tools/visualizer/` — HuggingFace Spaces dashboard
- `tools/cli/` — `dcc` SSH lifecycle tool
- `.claude/references/templates/sbatch/` — Jinja2 sbatch templates
- `.claude/` — rules, agents, commands, skills, hooks (read-only config)
- `.drcc/` — workspace runtime state (onboarding, job tracking — Claude reads/writes freely here)

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

## Tools Venv

All CLI tools (`dcc`, `key_handler`) are installed in `.tools-venv/`. Always use the full path:
- `.tools-venv/bin/dcc` — not bare `dcc` (it may not be on the user's PATH)
- `.tools-venv/bin/python` — for any Python that needs `key_handler` or `huggingface_hub`

When telling the user to run `dcc` in their terminal, remind them:
```
.tools-venv/bin/dcc auth <cluster>
```
Or tell them to add it to PATH: `export PATH="$(pwd)/.tools-venv/bin:$PATH"`

## Cluster Access

Cluster configs are in `~/.dcc/clusters.yaml`. The user authenticates with `.tools-venv/bin/dcc auth <cluster>`.
You run commands on clusters via `.tools-venv/bin/dcc ssh <cluster> "command"`.
You transfer files via `.tools-venv/bin/dcc upload` / `.tools-venv/bin/dcc download`.
You set up port forwards via `.tools-venv/bin/dcc forward`.

## Critical Rules

- NEVER hardcode API keys or tokens
- ALWAYS use the model's full supported max_tokens for generation
- ALWAYS upload artifacts to HF immediately after creation
- NO compute without red-team review (unless user overrides)
- NO analysis before data validation
