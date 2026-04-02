from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import yaml


def _find_raca_dir() -> Path:
    """Find .raca/ by walking up from cwd, like git finds .git/.

    Also checks RACA_WORKSPACE env var for when running outside the workspace.
    """
    # 1. Explicit env var
    env_ws = os.environ.get("RACA_WORKSPACE")
    if env_ws:
        candidate = Path(env_ws) / ".raca"
        if candidate.is_dir():
            return candidate

    # 2. Walk up from cwd
    current = Path.cwd()
    while current != current.parent:
        candidate = current / ".raca"
        if candidate.is_dir():
            return candidate
        current = current.parent

    # 3. Check if raca is installed as editable — find workspace from package path
    try:
        pkg_dir = Path(__file__).resolve().parent  # tools/cli/raca/
        workspace = pkg_dir.parent.parent.parent    # workspace root
        candidate = workspace / ".raca"
        if candidate.is_dir():
            return candidate
    except Exception:
        pass

    # 4. Nothing found — give a helpful error instead of silently using cwd
    print(
        f"[raca] Could not find .raca/ directory.\n"
        f"  Searched from: {Path.cwd()}\n"
        f"  Fix: cd into your RACA workspace, or set RACA_WORKSPACE=/path/to/workspace",
        file=sys.stderr,
    )
    # Return cwd/.raca so downstream code gets a clear "file not found" rather than
    # silently reading from an unrelated directory
    return Path.cwd() / ".raca"


def get_raca_dir() -> Path:
    """Get the .raca/ directory path. Re-resolves each time (not cached at import)."""
    return _find_raca_dir()


def _clusters_file() -> Path:
    return get_raca_dir() / "clusters.yaml"


def _config_file() -> Path:
    return get_raca_dir() / "config.yaml"


def _ensure_dir() -> None:
    get_raca_dir().mkdir(parents=True, exist_ok=True)


def _read_raw() -> dict[str, Any]:
    _ensure_dir()
    cf = _clusters_file()
    if not cf.exists():
        return {}
    with cf.open() as f:
        data = yaml.safe_load(f) or {}
    return data


def _write_raw(data: dict[str, Any]) -> None:
    _ensure_dir()
    with _clusters_file().open("w") as f:
        yaml.safe_dump(data, f, default_flow_style=False, sort_keys=True)


def load_clusters() -> dict[str, dict[str, Any]]:
    data = _read_raw()
    # YAML may have a top-level "clusters:" wrapper or be flat
    if "clusters" in data and isinstance(data["clusters"], dict):
        return data["clusters"]
    return data


def get_cluster(name: str) -> dict[str, Any]:
    clusters = load_clusters()
    if name not in clusters:
        available = ", ".join(sorted(clusters)) or "(none configured)"
        raca_dir = get_raca_dir()
        raise KeyError(
            f"Cluster '{name}' not found. "
            f"Available clusters: {available}. "
            f"Config: {raca_dir / 'clusters.yaml'}\n"
            f"Add one with: raca cluster add {name} --host <host> --user <user>"
        )
    return clusters[name]


def save_cluster(name: str, config: dict[str, Any]) -> None:
    data = _read_raw()
    if "clusters" in data and isinstance(data["clusters"], dict):
        data["clusters"][name] = config
    else:
        data[name] = config
    _write_raw(data)


def remove_cluster(name: str) -> None:
    clusters = load_clusters()
    if name not in clusters:
        available = ", ".join(sorted(clusters)) or "(none configured)"
        raise KeyError(
            f"Cluster '{name}' not found. Available: {available}"
        )
    data = _read_raw()
    if "clusters" in data and isinstance(data["clusters"], dict):
        del data["clusters"][name]
    else:
        del data[name]
    _write_raw(data)


def list_cluster_names() -> list[str]:
    return sorted(load_clusters().keys())


def get_connection_mode(name: str) -> str | None:
    """Get the connection mode for a cluster.

    Returns 'controlmaster', 'persistent', or None if not yet probed.
    Raises KeyError if cluster doesn't exist.
    """
    cluster = get_cluster(name)  # raises KeyError if missing
    return cluster.get("connection_mode")


def get_session_paths(name: str) -> tuple[Path, Path]:
    """Get the persistent daemon socket and PID file paths for a cluster.

    Returns (socket_path, pid_path).
    """
    socket_dir = Path.home() / ".ssh" / "sockets"
    socket_path = socket_dir / f"{name}-session.sock"
    pid_path = socket_dir / f"{name}-session.pid"
    return socket_path, pid_path
