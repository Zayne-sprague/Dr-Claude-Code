# Architecture: How the Pieces Connect

Dr. Claude Code is a set of conventions, tools, and automation layers that turn Claude Code into a research collaborator. Here's how each piece fits.

## Components

### dcc CLI

The `dcc` CLI manages SSH session lifecycle. You run one command manually:

```bash
dcc auth <cluster>
```

After that, Claude uses `dcc ssh`, `dcc upload`, `dcc download`, and `dcc forward` internally — you never touch the CLI again. The CLI handles SSH ControlMaster sockets, VPN detection, 2FA prompts, and reconnection.

### Skills

Skills teach Claude what to do with a cluster. Each skill is a focused instruction set for a specific task:

- **cluster-setup** — provision a new cluster config, test connectivity, install base dependencies
- **serve-model** — launch a vLLM server, expose the chat UI via port forward
- **install-package** — install a framework (verl, llama_factory, etc.) into a conda env
- **parallel-install** — coordinate multiple installs across agent sessions simultaneously

### Rules

Rules enforce experimental discipline. They are always active and cannot be bypassed without explicit user override:

- **Red-team before compute** — the red-team-reviewer agent must sign off on any experiment design before a single job is submitted
- **Validate after artifacts** — every result that lands (canary, partial, final) triggers the data-validator agent before analysis continues
- **No silent parameter changes** — any change to model, max_tokens, batch size, or sample count requires user approval

### Agents

Two agents run at key gates in the experiment flow:

- **red-team-reviewer** — pre-flight. Reviews the experiment design for methodological flaws, wasted compute, and missing baselines. Cannot be skipped.
- **data-validator** — post-run. Inspects every artifact for truncation, missing rows, score anomalies, and format errors. Runs on every artifact, every time.

### Visualizer

A HuggingFace Space that acts as the live control plane for your experiments. It shows:

- Experiment READMEs and current phase
- Activity timeline (every step logged)
- Artifact viewer — tables, plots, images, YAML
- Dataset links and row counts

Every state change is synced to the dashboard. If you can't see it there, it didn't happen.

### Sbatch Templates

Reference SLURM job scripts live in `templates/sbatch/`. They include:

- Correct module loads and conda activation
- Lifecycle hooks that push job events (started, completed, failed) to the event channel
- GPU dummy load to satisfy cluster keepalive policies
- Resumable checkpoint logic

Copy and adapt them for new jobs rather than writing from scratch.

### Cluster Config (`~/.dcc/clusters.yaml`)

Single source of truth for all cluster details: hostnames, partitions, GPU specs, SLURM accounts, scratch paths, conda locations. Claude reads this file when generating job scripts and SSH commands. See [Adding a Cluster](adding-a-cluster.md) for the full schema.

## System Diagram

```
User ──→ Claude Code ──→ Skills ──→ dcc CLI ──→ SSH ──→ Cluster
              │                                           │
              ├── Rules (experiment discipline)            │
              ├── Agents (red-team, data-validator)        │
              │                                           │
              └── /sync-dashboard ──→ HF Space ←── Results
```

## Data Flow

1. User describes a goal in plain language
2. Claude selects the relevant skill and reads the cluster config
3. Skills generate job scripts from sbatch templates, upload via `dcc upload`, submit via `dcc ssh`
4. Jobs push lifecycle events (started/completed/failed) to the HPC event channel
5. Claude receives events, triggers harvest, runs data-validator, uploads to HuggingFace
6. `/sync-dashboard` syncs the HF Space so results are visible immediately
