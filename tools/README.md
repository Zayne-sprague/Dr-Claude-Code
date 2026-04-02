# Tools

Third-party and custom tooling that supports your research workflow.

- **`cli/`** — the `raca` CLI for SSH lifecycle management (auth, ssh, upload, download, port forwarding). This is how RACA talks to your clusters.
- **`visualizer/`** — your local experiments dashboard. A Flask + React app that shows experiment READMEs, timelines, artifacts, and results.
- **`chat-ui/`** — a lightweight chat server UI for interacting with hosted models.

You can add your own tools here. Anything reusable across experiments that isn't experiment-specific code belongs in `tools/`.
