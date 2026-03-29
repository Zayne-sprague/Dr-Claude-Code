---
description: "Complete Dr. Claude Code setup — deploy dashboard, connect cluster, first experiment. Run automatically after install.sh."
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "WebFetch"]
---

# Dr. Claude Code — Onboarding

You were just launched by the installer. The workspace is set up, `dcc` CLI is installed, and keys may be partially configured. Your job is to finish setup conversationally.

Read `~/.dcc/config.yaml` for install state (workspace path, HF token status, HF user).

## Phase 1: Welcome

Greet the user briefly:

> "Welcome to Dr. Claude Code! I'm going to finish setting up your research workspace. This should take about 5 minutes."

Read `~/.dcc/config.yaml` to check what the installer already did.

## Phase 2: HuggingFace & Dashboard

Check if an HF token is configured:

```bash
cat ~/.dcc/config.yaml
```

**If `hf_token_set: true`:**

1. Ask: "What HuggingFace org or username should I use for your dashboard? (e.g., your HF username)"
2. Build the visualizer frontend:
   ```bash
   cd tools/visualizer/frontend && npm install --silent && npm run build
   ```
3. Deploy to HF Space:
   - Write the README with YAML frontmatter (sdk: docker, app_port: 7860)
   - Fix `.gitignore` and `.dockerignore` to include `frontend/dist/`
   - Fresh `git init`, add everything, push to `https://huggingface.co/spaces/{org}/dr-claude-dashboard`
   - Use the HF token from key_handler: `from key_handler import KeyHandler; KeyHandler.set_env_key()`
   - Read `HF_TOKEN` from environment after `set_env_key()`
4. Tell the user: "Dashboard deploying — it takes 3-5 minutes for HF to build the Docker image. I'll check on it later."
5. Save the dashboard URL to `~/.dcc/config.yaml`

**If `hf_token_set: false`:**

Ask: "Do you have a HuggingFace token? You'll need one for the dashboard and dataset uploads."
- If yes: walk them through getting it, save to `packages/key_handler/key_handler/key_handler.py`, then deploy
- If no: "No problem — we'll skip the dashboard for now. You can set it up later by telling me: 'deploy my dashboard'"

## Phase 3: Compute Cluster

Ask: "Do you have a compute cluster you'd like to connect? (SLURM HPC, RunPod, or local GPU)"

- If yes: invoke the `cluster-setup` skill
- If no / later: "No problem. When you're ready, just say 'help me set up my cluster'."

## Phase 4: Dashboard Check

If a dashboard was deployed in Phase 2, check if it's live:

```bash
curl -so /dev/null -w "%{http_code}" "https://{org}-dr-claude-dashboard.hf.space/" 2>/dev/null
```

- If 200: "Your dashboard is live! [URL]" — open it in browser if possible
- If not yet: "Dashboard is still building. Check it in a few minutes at [URL]"

## Phase 5: What's Next

Give the user a quick orientation:

> "You're all set! Here's what you can do now:
>
> **Run inference:**
> > Spin up Qwen3-8B on my cluster and give me the chat UI
>
> **Design an experiment:**
> > I want to test whether Qwen3-8B follows complex instructions better than Llama-3.1-8B
>
> **Install ML frameworks:**
> > Set up verl and llama_factory on my cluster
>
> **Add a benchmark reference:**
> > /drcc:handle_benchmark_reference GSM8K
>
> Your experiment dashboard will show everything at [dashboard URL].
> All your API keys live in `packages/key_handler/` — add WandB, OpenAI, etc. there.
>
> What would you like to do first?"

## Important Rules

- Be conversational, not robotic. This is the user's first impression.
- Don't dump walls of text. One thing at a time.
- If something fails, explain clearly and offer to fix it or skip it.
- The user just ran an installer — they're ready to go, not ready to debug.
- Use `dcc ssh` for cluster commands, `dcc auth` for connecting.
- Read key_handler for tokens: `from key_handler import KeyHandler; KeyHandler.set_env_key()`
- The tools venv should already be on PATH (installer added it).
