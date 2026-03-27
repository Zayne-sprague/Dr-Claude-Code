# Git Safety

<critical>
- NEVER push to `upstream` remotes on forked repos — only push to `origin`
- NEVER force push without explicit user confirmation
- All repos should remain at their configured visibility — never change it without asking
</critical>

<rules name="after-modifications">
<rule>After modifying a project → commit and push to its mapped GitHub repo</rule>
<rule>Keep commits focused and descriptive</rule>
</rules>

<rules name="forked-repos">
<rule>`upstream` = original repo, `origin` = our fork</rule>
<rule>Never push to `upstream`</rule>
<rule>Pull from `upstream` to sync, push to `origin`</rule>
</rules>

<protocol name="new-projects">
1. `git init` in project folder
2. Add `.gitignore` (exclude `.venv/`, `__pycache__/`, `.DS_Store`, `*.egg-info/`)
3. Create GitHub repo: `gh repo create <your-github-org>/<name> --private`
4. Add remote, push to origin
</protocol>
