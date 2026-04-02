---
description: "Update RACA to the latest version. Pulls new skills, rules, tools, and commands without touching your experiments, notes, or API keys."
allowed-tools: ["Bash", "Read"]
---

# RACA Update

Update RACA to the latest version by running the update script.

## Step 1: Find the workspace

Determine the workspace root (check `RACA_WORKSPACE` env, or walk up from cwd looking for `.raca/`). Store the absolute path.

## Step 2: Run the update

```bash
bash $WS/raca-update.sh
```

If `raca-update.sh` doesn't exist (older install), run it directly:

```bash
curl -fsSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/update.sh | bash
```

## Step 3: Report

Tell the user what happened:

> "RACA updated! Your experiments, notes, API keys, and cluster config are untouched. New skills, rules, and tools have been pulled in."

If the update script reported any warnings or errors, relay them.
