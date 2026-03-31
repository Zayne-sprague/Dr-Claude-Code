# Commands and Skills

RACA ships with commands and skills that Claude invokes automatically during the experiment lifecycle. You can also call them directly.

## Commands

Commands are explicit actions that fire at specific transition points in the pipeline.

| Command | Description |
|---------|-------------|
| `/raca:onboarding` | First-run setup: workspace, clusters, dashboard, first experiment |
| `/raca:experiment-preflight` | Red-team review, dry-run, adversarial check, canary job before real compute |
| `/raca:harvest-and-report` | Post-run: download results, validate data, upload to HF, sync dashboard |
| `/raca:dashboard-sync` | Push experiment state and artifacts to the live dashboard |
| `/raca:find-compute` | Check all clusters for GPU availability, queue wait, and cost |
| `/raca:benchmark-reference` | Create or update a reference doc for a dataset/task (prompt format, eval method, pitfalls) |

## Skills

Skills activate automatically when the conversation matches their purpose. You don't need to invoke them.

| Skill | Description |
|-------|-------------|
| `experiment-management` | Creates experiment folders, tracks lifecycle state, enforces the design/red-team/canary/run/harvest flow |
| `run-job` | Writes sbatch scripts, submits jobs, monitors progress, handles failures and checkpointing |
| `setup-cluster` | Walks you through connecting a new SLURM cluster to RACA |
| `setup-runpod` | Walks you through connecting RunPod as a compute provider |
| `dashboard-visualizer` | Knows the visualization website: what viewers exist, how to add new ones, how to check artifact compatibility |

## How They Fit Together

```
Talk to Claude → Design (experiment-management) → Red-Team (experiment-preflight)
  → Canary (run-job) → Validate → Full Run (run-job, find-compute)
  → Harvest (harvest-and-report) → Dashboard (dashboard-sync)
```

Skills handle the continuous parts of the conversation (designing experiments, managing state). Commands handle the discrete transitions (preflight checks, harvesting results, syncing the dashboard).
