# Dr. Claude Code

Automated research experiments with Claude Code.

![Dashboard](docs/images/hero.png)

## Install

```bash
curl -sSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
```

## Set Up Compute

> Help me set up my compute cluster

Claude walks you through it, writes the config, then tells you to run:

```bash
dcc auth <your-cluster>
```

That's the last CLI command you'll ever need. From here, just talk to Claude.

## Serve a Model

> Spin up Qwen3-8B on my cluster and give me the chat UI

## Run an Experiment

> I want to test whether Qwen3-8B follows complex instructions better
> than Llama-3.1-8B. Design an experiment and run a canary.

## Install Frameworks in Parallel

> Set up verl and llama_factory on my cluster at the same time

## What You Get

- **Claude as research collaborator** — rules and agents that enforce rigor
  (red-team review before compute, data validation after every artifact)
- **SSH to any cluster** — SLURM, RunPod, or local GPUs
- **Live experiment dashboard** — HuggingFace Space with your experiments and results
- **Autonomous harvest** — jobs finish → Claude collects, validates, uploads, syncs dashboard
- **Parallel workflows** — multiple installs and experiments across sessions simultaneously

## The Pipeline

```
Ideate → Design → Red-Team Review → Canary → Validate → Full Run → Harvest → Dashboard
```

No compute without review. No results without validation.

## Docs

- [Architecture](docs/architecture.md)
- [Experiment Lifecycle](docs/experiment-lifecycle.md)
- [Adding a Cluster](docs/adding-a-cluster.md)
- [Adding a Visualizer](docs/adding-a-visualizer.md)
- [FAQ](docs/faq.md)

## License

MIT
