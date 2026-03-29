# Recommended Claude Code Plugins

## Superpowers

Workflow skills for research: brainstorming, TDD, planning, code review, debugging.

**Install (inside Claude Code):**
```
/plugin install superpowers@claude-plugins-official
```

No restart needed. Skills are immediately available.

**Key skills:**
- Brainstorming — turn ideas into designs through dialogue
- Writing Plans — comprehensive implementation plans
- Subagent-Driven Development — fresh agent per task with review
- TDD — test-driven development workflow
- Debugging — systematic bug investigation

## Agent Deck

Run multiple Claude Code sessions in parallel. Essential for:
- Installing packages on multiple clusters simultaneously
- Running experiments while doing other work
- Managing long-running jobs in background sessions

**Install (inside Claude Code):**
```
/plugin marketplace add asheshgoplani/agent-deck
/plugin install agent-deck@agent-deck
```

**Start Agent Deck:**
```bash
agent-deck
```

This opens a session manager. Create sessions, each runs its own Claude Code instance.

**Essential keybindings:**
- `Ctrl+Q` — back to main window (session keeps running)
- `q` / `Ctrl+C` — exit Agent Deck to terminal
- `Enter` / arrow keys — select and enter a session
- `n` — create new session
- `?` — show all keybindings

**Note:** Exit your current Claude Code session first, then launch `agent-deck` which manages Claude sessions for you.

Full docs: https://github.com/asheshgoplani/agent-deck
