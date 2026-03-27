# Python Patterns

<rules name="conventions">
<rule>Python 3.10+ (use modern syntax: `X | Y` unions, `match` statements where appropriate)</rule>
<rule>`ruff` for linting and formatting</rule>
<rule>Type hints on public APIs</rule>
<rule>`__all__` exports in `__init__.py`</rule>
<rule>Tests inside package at `<pkg>/<pkg>/tests/` using pytest</rule>
<rule>setuptools >= 77.0.1, MIT license</rule>
</rules>

<rules name="api-keys">
<rule>NEVER hardcode API keys or tokens — always load from environment variables or a key manager</rule>
<rule>Use `os.environ` or a dedicated `KeyHandler` class for all credential access</rule>
</rules>

<rules name="inference">
<rule>Use a shared `InferenceEngine` wrapper for all LLM calls — supports caching, rate limiting, batching</rule>
<rule>ALWAYS set `max_tokens` to the model's full supported maximum for generation tasks</rule>
</rules>

<rules name="environment">
<rule>Each project gets its own `.venv/` (never share venvs across projects)</rule>
<rule>Use `uv` for fast installs where available, fall back to `pip`</rule>
<rule>Local packages installed as editable: `pip install -e <path>`</rule>
</rules>
