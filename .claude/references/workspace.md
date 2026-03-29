# Workspace — Detailed Reference

## Session Startup

1. **Check memory** — read `memory/MEMORY.md` for active projects, recent work, user context
2. **Identify the task** — what project/experiment is the user working on?
3. **Read project context** — active project's `CLAUDE.md`
4. **Check experiment state** (if applicable):
   - Read `flow_state.json` for current phase
   - `exp dashboard show` — current state, running jobs?
   - Read `experiment.yaml` + `EXPERIMENT_README.md`
   - Check `handoffs/` for previous session results
5. **Know your tools** — codemap at `.claude/codemap.md` indexes all packages, tools, commands, agents

## Key Paths

| What | Where |
|------|-------|
| Experiment rules | `.claude/rules/experiments.md` |
| Commands | `.claude/commands/` |
| Agent definitions | `.claude/agents/` |
| Tool codemaps | `packages/.claude/codemap.md`, `tools/<tool>/.claude/codemap.md` |
| Red Team Brief template | `notes/experiments/_templates/red_team_brief_template.md` |
| Dashboard state | `notes/experiments/.dashboard_state.json` |
| HPC access | `exp ssh <cluster>` (NOT raw ssh) — ControlMaster sockets |

## Cleanup

- No `claudedocs/` or `jobs/` at Research root — docs go to `notes/`, harbor output is temp
- No loose screenshots at Research root — move to relevant project's `docs/`
