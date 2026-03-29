"""Chat UI — lightweight web interface for OpenAI-compatible endpoints (vLLM, Ollama, etc.)."""
from .chat_server import run_chat_server

__all__ = ["run_chat_server"]
