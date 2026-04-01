# RACA — Workspace Instructions

This is a research workspace managed by Claude Code. You are a research collaborator.

## Workspace Structure

When locating experiments, projects, notes, share-able code, documentation, etc. be sure to 
see `.claude/codemap.md` for full folder map with descriptions.

<critical>
Maintain the .claude/codemap.md as the folder structure changes.
</critical>

## Key Rules

Detailed instructions in `.claude/rules/`:
- `experiments.md` — read anytime users are asking about experiments, artifacts / results, etc.
- `workspace.md` — read anytime you are editing, removing, or creating any files. Related: new experiments almost always result in creating a new folder.
- `huggingface-datasets.md` — HF upload standards. Read this when designing experiments, you must follow these conventions when uploading artifacts.
- `python-patterns.md` — Python style (3.10+, ruff, type hints)
- `git-safety.md` — push safety
- `security.md` — never hardcode API keys

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

- Cluster configs are in `.raca/clusters.yaml`. The user authenticates with `raca auth <cluster>`.
- You run commands on clusters via `raca ssh <cluster> "command"`.
- You transfer files via `raca upload` / `raca download`.
- You set up port forwards via `raca forward`.


## Command Routing

### Experiment Pipeline

Always read the `rules/experiments.md` file before engaging with experiments.

These commands fire at lifecycle transitions regardless of how the experiment was designed
(freeform conversation, brainstorming plugins, planning tools, or anything else):

- **When an experiment is designed, changed, added onto, etc.** → `/raca:experiment-preflight` this setups up the red-teaming agent which will review the experiment for flaws, it will also setup a canary job -- a minimal test to ensure the experiment will run when scaled up.
- **Create and Use Reference Files for Benchmarks** → When a benchmark (such as GSM8k, Countdown, TerminalBench, etc.) are being included into the experiments design, use `/raca:benchmark-reference` to either refer to the existing benchmark file or to create one if it is missing.
- **Finding Compute for an Experiment (Job)** → Always try to find the best spot for where to run a job based on the compute and time it requires by using `/raca:find-compute`. Ask the user if the compute clusters / services are okay to run on before choosing one.
- **Handling | Scheduling | Monitoring Jobs** → whether it be a canary job or a larger job, you should `/loop` to ensure you monitor the job and keep track of its status (if it fails, disappears, begins to run, is still running, pending, etc. you want to track all of this).
- **When the Job Produces Output** → A job may produce output intermittently and at the end. You should use `/raca:harvest-and-report` when you notice an artifact has been produced (publish it to huggingface, update the experiments markdown files and sync the dashboard. Notify the user as well that a new output is ready for review)
- **Remove bad data** → sometimes experiments may produce outputs that we no longer want to keep around (they are stale), you should actively remove them and stop tracking them then use `raca:dashboard-sync` to ensure that the website reflects this.
- **Anytime the experiment changes** → This means the user changed the design, or added to it, or created it, or a job started after pending, or a job produced outputs, or a job completed and we did some analysis, anytime the experiment has changed in a meaningful way (ESPECIALLY ON THE CREATION OF NEW ARTIFACTS) update the activity_log file and any other necessary files, then run `/raca:dashboard-sync` (this updates the website to be in-sync).

Do not wait for the user to request these. When working on an experiment you should be proactive. If an experimental design exists and the next step in the lifecycle is one of these commands, invoke it.

<critical>
Pay close attention to artifacts that are produced by jobs. Users will want to have access to these and to visualize them as quickly as possible.
</critical>

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
