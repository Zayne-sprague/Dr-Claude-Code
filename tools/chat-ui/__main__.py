"""Run: python -m chat_ui --url http://localhost:8000 --model Qwen/Qwen2.5-7B-Instruct"""
from __future__ import annotations

import argparse

from .chat_server import run_chat_server


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat UI for OpenAI-compatible endpoints")
    parser.add_argument("--url", required=True, help="Base URL of the model server (e.g., http://localhost:8000 or http://localhost:11434)")
    parser.add_argument("--model", default="", help="Model name (shown in UI, sent to server)")
    parser.add_argument("--port", type=int, default=5000, help="Local port for chat UI (default: 5000)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    args = parser.parse_args()

    run_chat_server(
        vllm_base_url=args.url,
        model_name=args.model,
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
