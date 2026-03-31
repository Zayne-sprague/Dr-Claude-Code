# RACA — Workspace Instructions

This is a research workspace managed by RACA (Research Assistant Coding Agent). You are a research collaborator.

## Workspace Structure

- `notes/experiments/` — experiment tracking (YAML, READMEs, activity logs)
- `tools/visualizer/` — HuggingFace Spaces dashboard
- `tools/cli/` — `raca` SSH lifecycle tool
- `.claude/references/templates/sbatch/` — Jinja2 sbatch templates
- `.claude/` — rules, agents, commands, skills, hooks (read-only config)
- `.raca/` — workspace runtime state (onboarding, job tracking — Claude reads/writes freely here)

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

If no reference file exists, create one first using `/raca:benchmark-reference <name>`.
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

CLI tools (`raca`, `key_handler`) are installed in `.tools-venv/bin/` and added to the user's PATH by the installer.

- `raca` — SSH lifecycle tool (auth, ssh, upload, download, forward)
- `.tools-venv/bin/python` — use this for any Python that needs `key_handler` or `huggingface_hub` (NOT system `python3`)

When telling the user to run `raca`, just say `raca auth <cluster>` — it's on their PATH.
For Python scripts, always use `.tools-venv/bin/python` since system Python doesn't have the packages.

## Cluster Access

Cluster configs are in `.raca/clusters.yaml`. The user authenticates with `raca auth <cluster>`.
You run commands on clusters via `raca ssh <cluster> "command"`.
You transfer files via `raca upload` / `raca download`.
You set up port forwards via `raca forward`.

## Command Routing

### Experiment Pipeline

These commands fire at lifecycle transitions regardless of how the experiment was designed
(freeform conversation, brainstorming plugins, planning tools, or anything else):

1. **After experimental design is complete** → `/raca:experiment-preflight` (red-team + canary)
2. **When preflight passes** → submit jobs, `/loop` to monitor
3. **When jobs complete** → `/raca:harvest-and-report` (download, validate, upload)
4. **After any artifact upload or state change** → `/raca:dashboard-sync`

Do not wait for the user to request these. If an experimental design exists and the next
step in the lifecycle is one of these commands, invoke it.

### Auto-Invoke Commands

Claude should also invoke these automatically when the situation calls for it:
- `/raca:dashboard-sync` — after any artifact is produced or experiment state changes
- `/raca:find-compute` — when planning where to run a job
- `/raca:benchmark-reference` — when a benchmark is mentioned that has no reference file

## Critical Rules

- NEVER hardcode API keys or tokens
- NEVER git push --force to HuggingFace Spaces — use `HfApi.upload_folder()` only
- NEVER mention internal state tracking, phases, or mechanics to the user
- ALWAYS use `.tools-venv/bin/python` for key_handler and huggingface_hub operations (system Python doesn't have them)
- ALWAYS use `raca` for cluster commands (it's on PATH after install)
- ALWAYS use the model's full supported max_tokens for generation — truncated output is FAILED output
- ALWAYS upload artifacts to HF immediately after creation
- ALWAYS read the benchmark/task reference file before writing ANY code that evaluates, generates data, or trains on that task
- NO compute without red-team review (unless user overrides)
- NO analysis before data validation
- Use column name `model_response` (singular) for model outputs in datasets — this is the standard
