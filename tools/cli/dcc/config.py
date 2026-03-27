from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

DCC_DIR = Path.home() / ".dcc"
CLUSTERS_FILE = DCC_DIR / "clusters.yaml"


def _ensure_dir() -> None:
    DCC_DIR.mkdir(parents=True, exist_ok=True)


def _read_raw() -> dict[str, Any]:
    _ensure_dir()
    if not CLUSTERS_FILE.exists():
        return {}
    with CLUSTERS_FILE.open() as f:
        data = yaml.safe_load(f) or {}
    return data


def _write_raw(data: dict[str, Any]) -> None:
    _ensure_dir()
    with CLUSTERS_FILE.open("w") as f:
        yaml.safe_dump(data, f, default_flow_style=False, sort_keys=True)


def load_clusters() -> dict[str, dict[str, Any]]:
    return _read_raw()


def get_cluster(name: str) -> dict[str, Any]:
    clusters = load_clusters()
    if name not in clusters:
        available = ", ".join(sorted(clusters)) or "(none configured)"
        raise KeyError(
            f"Cluster '{name}' not found. "
            f"Available clusters: {available}. "
            f"Add one with: dcc cluster add {name} --host <host> --user <user>"
        )
    return clusters[name]


def save_cluster(name: str, config: dict[str, Any]) -> None:
    data = _read_raw()
    data[name] = config
    _write_raw(data)


def remove_cluster(name: str) -> None:
    data = _read_raw()
    if name not in data:
        available = ", ".join(sorted(data)) or "(none configured)"
        raise KeyError(
            f"Cluster '{name}' not found. Available: {available}"
        )
    del data[name]
    _write_raw(data)


def list_cluster_names() -> list[str]:
    return sorted(_read_raw().keys())
