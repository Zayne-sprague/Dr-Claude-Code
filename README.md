# RACA: Research Assistant Coding Agents

> Talk to Claude Code through experimental design, Slurm management, and visualization (the AI Ph.D. students experiments life-cycle)

Turn your experimental pipeline into a conversation. RACA connects Claude Code with your compute (SLURM, RunPod, local GPUs) and a visualization dashboard (HuggingFace Spaces) so you can design, run, and review experiments without writing sbatch scripts or doing devops.

![Intro](images/intro.jpeg)

## Install

```bash
curl -sSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
```

The script sets up your workspace, installs the tools, then launches Claude Code automatically. Claude walks you through the rest: connecting your clusters, deploying the dashboard, and running your first experiment. If you ever need to re-run the setup, use `/raca:onboarding`.

## What You Get

![Finding Compute](images/find-compute.jpeg)
*Claude connects to your clusters over SSH, finds available GPUs, installs dependencies, and schedules jobs. You authenticate once with `raca auth <cluster>` and talk to Claude from there.*

![Dashboard](images/dashboard.png)
*The Research Dashboard tracks all your experiments, artifacts, and findings in one place. Claude uploads results to HuggingFace and builds custom visualizations for each experiment.*

## Commands

Commands Claude invokes automatically at the right points in the experiment lifecycle. You can also call them directly.

| Command | Description |
|---------|-------------|
| `/raca:onboarding` | First-run setup: workspace, clusters, dashboard, first experiment |
| `/raca:experiment-preflight` | Red-team review, dry-run, adversarial check, canary job before real compute |
| `/raca:harvest-and-report` | Post-run: download results, validate data, upload to HF, sync dashboard |
| `/raca:dashboard-sync` | Push experiment state and artifacts to the live dashboard |
| `/raca:find-compute` | Check all clusters for GPU availability, queue wait, and cost |
| `/raca:benchmark-reference` | Create or update a reference doc for a dataset/task (prompt format, eval method, pitfalls) |

## Skills

Skills activate automatically when the conversation matches their purpose.

| Skill | Description |
|-------|-------------|
| `experiment-management` | Creates experiment folders, tracks lifecycle state, enforces the design/red-team/canary/run/harvest flow |
| `run-job` | Writes sbatch scripts, submits jobs, monitors progress, handles failures and checkpointing |
| `setup-cluster` | Walks you through connecting a new SLURM cluster to RACA |
| `setup-runpod` | Walks you through connecting RunPod as a compute provider |
| `dashboard-visualizer` | Knows the visualization website: what viewers exist, how to add new ones, how to check artifact compatibility |

## The Pipeline

```
Talk to Claude → Design → Red-Team → Canary → Run → Harvest → Dashboard
```

No compute without review. No results without validation. Short resumable jobs with frequent artifact uploads. Claude drives the pipeline; you review results and ask questions.

## Optional Tools

RACA works on its own, but these make it better:

- **[Superpowers](https://github.com/anthropics/claude-code-plugins)**: Makes Claude more proactive during design (asks clarifying questions, structured planning)
- **[Agent-Deck](https://github.com/anthropics/claude-code-plugins)**: Run multiple Claude sessions in parallel with a conductor that monitors them all

## Read More

[Blog Post: How Claude Code Changed the Way I Think About Research](RACA_v7_cc.md)

## License

MIT
