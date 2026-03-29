# Recommended Claude Code Plugins

## Superpowers

Workflow skills for research: brainstorming, TDD, planning, code review, debugging.

**Install (inside Claude Code):**
```
/plugins add superpowers@claude-plugins-official
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

**Install:**
```bash
npm install -g agent-deck
```

**Start Agent Deck:**
```bash
agent-deck
```

This opens a session manager. Create sessions, each runs its own Claude Code instance.

**Usage within Agent Deck:**
- `Ctrl+N` — new session
- `Ctrl+Tab` — switch sessions
- Sessions persist if you disconnect

**Note:** You need to exit your current Claude Code session first, then launch `agent-deck` which manages Claude sessions for you.
