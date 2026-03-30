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

<critical>
Before writing ANY code that runs a benchmark, generates data, or evaluates a model on a task:
1. Check the table above for a reference file
2. If one exists, READ IT FIRST — it contains the correct prompt format, evaluation method, scoring, and known pitfalls
3. Follow its Setup Checklists before writing code
4. Use the EXACT prompt templates from the reference — do not improvise prompts
5. Use the EXACT evaluation method — do not substitute string matching for equation evaluation, etc.
6. Respect max_tokens requirements — truncated outputs are failed outputs

If no reference file exists, create one first using `/drcc:benchmark-reference <name>`.
</critical>

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

CLI tools (`dcc`, `key_handler`) are installed in `.tools-venv/bin/` and added to the user's PATH by the installer.

- `dcc` — SSH lifecycle tool (auth, ssh, upload, download, forward)
- `.tools-venv/bin/python` — use this for any Python that needs `key_handler` or `huggingface_hub` (NOT system `python3`)

When telling the user to run `dcc`, just say `dcc auth <cluster>` — it's on their PATH.
For Python scripts, always use `.tools-venv/bin/python` since system Python doesn't have the packages.

## Cluster Access

Cluster configs are in `.drcc/clusters.yaml`. The user authenticates with `dcc auth <cluster>`.
You run commands on clusters via `dcc ssh <cluster> "command"`.
You transfer files via `dcc upload` / `dcc download`.
You set up port forwards via `dcc forward`.

## Command Routing

Claude should invoke these commands automatically when the situation calls for it:
- `/drcc:dashboard-sync` — after any artifact is produced or experiment state changes
- `/drcc:find-compute` — when planning where to run a job
- `/drcc:benchmark-reference` — when a benchmark is mentioned that has no reference file

## Critical Rules

- NEVER hardcode API keys or tokens
- ALWAYS use the model's full supported max_tokens for generation — truncated output is FAILED output
- ALWAYS upload artifacts to HF immediately after creation
- ALWAYS read benchmark reference files before writing eval/generation code
- NO compute without red-team review (unless user overrides)
- NO analysis before data validation
- Use column name `model_response` (singular) for model outputs in datasets — this is the standard
