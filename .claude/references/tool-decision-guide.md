# Tool Decision Guide

<context>When to use Superpowers vs SC Commands vs Agent-Deck vs Experiment Pipeline.</context>

## Rule of Thumb

| System | Role | Think of it as... |
|--------|------|-------------------|
| **Superpowers** | Process/workflow skills | HOW you approach a task |
| **SC commands** | Execution skills | Tools to DO specific things |
| **Agent-deck** | Orchestration | Managing multiple agents/sessions |

<rule>When both could apply: Superpowers first (sets the process), then SC tools within that process.</rule>

## Decision Tree

| Task | Use | Why |
|------|-----|-----|
| Brainstorming/design | Superpowers `brainstorming` | Structured process |
| Planning implementation | Superpowers `writing-plans` | Actionable plan before coding |
| Executing a plan | Superpowers `executing-plans` | Step-by-step with validation |
| Writing code (in workflow) | `sc:implement` | Targeted coding tool |
| TDD | Superpowers `TDD` | Full red-green-refactor |
| Running tests (one-off) | `sc:test` | Quick execution |
| Debugging | Superpowers `systematic-debugging` | Hypothesis-driven |
| Code review | Superpowers `requesting/receiving-code-review` | Structured process |
| Analysis | `sc:analyze` | Comprehensive |
| Documentation | `sc:document` | Direct generation |
| Git operations | `sc:git` | Commit, branch, PR |
| Web research | `sc:research` | Search and synthesis |
| Agent management | Agent-deck CLI | Never superpowers/SC |
| Parallel tasks | Agent-deck (spawn) | Cross-agent orchestration |

<critical name="anti-patterns">
- Don't double-invoke `sc:brainstorm` AND superpowers `brainstorming` — pick superpowers
- Don't use `sc:troubleshoot` when superpowers `systematic-debugging` exists
- Don't spawn agent-deck sessions for simple single-agent tasks
- Don't use superpowers for one-shot actions (tests, docs) — SC is faster
- Don't use SC/superpowers for orchestration — agent-deck only
</critical>

## Common Workflows

<reference>
**New feature:** brainstorming → writing-plans → executing-plans (with sc:implement) → TDD → requesting-code-review

**Bug fix:** systematic-debugging → sc:implement → sc:test

**Experiment pipeline:** Design → Red Team Brief → /experiment-preflight → /experiment-pipeline → /harvest-and-report → handoff → review

**Key:** Don't wait for user to invoke commands. `experiments.md` tells you when to trigger each phase.
</reference>
