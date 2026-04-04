# Improvements Inspired by Feynman

Patterns from [getcompanion-ai/feynman](https://github.com/getcompanion-ai/feynman) that RACA should adopt.

## Adopted

- [ ] **README: "What you type → what happens"** — concrete examples over feature lists

## Backlog

- [ ] **Provenance sidecars** — `.provenance.md` alongside every research artifact tracking sources, verification status, evidence chain
- [ ] **Slug-based naming** — all artifacts from one experiment run share a slug prefix, enforced not just convention
- [ ] **File-based subagent handoffs** — subagents write to disk and pass file paths, not content inline. Keeps parent context lean.
- [ ] **Explicit integrity commandments in agents** — "URL or it didn't happen", "Don't say verified unless you actually verified." Add to red-team-reviewer and data-validator.
- [ ] **Bootstrap sync with hash tracking** — `raca-update.sh` should track file hashes so user-modified config files aren't overwritten
- [ ] **Skills-only distribution** — let people install just the `.claude/` skills/rules/commands without the full workspace
