# Packages

Shared Python packages used across multiple experiments.

- **`key_handler/`** — API key management. Stores your keys (OpenAI, HuggingFace, WandB, etc.) in one place and injects them into the environment. Never hardcode keys in scripts — use `KeyHandler` instead.
- **`hf_utility/`** — HuggingFace dataset upload with automatic README generation and manifest tracking. Every artifact upload goes through this.

Add your own shared packages here. If you find yourself copying the same utility code between experiments, it belongs in a package.

Each package has its own `pyproject.toml` and is installed as editable (`pip install -e packages/<name>`).
