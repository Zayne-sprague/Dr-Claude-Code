# Workspace

## Folder Structure

```
notes/experiments/       — experiment tracking (YAML, READMEs, activity logs)
tools/visualizer/        — HuggingFace Spaces dashboard
tools/cli/               — dcc SSH lifecycle tool
templates/sbatch/        — Jinja2 sbatch templates
.claude/                 — rules, agents, commands, skills, hooks
```

## Hard Rules

- Read `CLAUDE.md` files in any project you work on
- Before asking the user something, check memory and handoff files first
- Ignore `**/old/` folders unless explicitly told
- After adding or removing projects/tools/packages: update the codemap if one exists

## Conventions

- Experiment notes live in `notes/experiments/<experiment-name>/`
- Each experiment has: `experiment.yaml`, `EXPERIMENT_README.md`, `red_team_brief.md`, `flow_state.json`
- Activity logs are JSONL: `notes/experiments/<experiment-name>/activity_log.jsonl`
- Handoff files: `notes/experiments/<experiment-name>/handoffs/YYYY-MM-DD-HH-MM-<status>.md`
- HF upload tracking: `notes/experiments/<experiment-name>/HUGGINGFACE_REPOS.md`
