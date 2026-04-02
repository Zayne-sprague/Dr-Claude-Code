from __future__ import annotations

import pytest
import yaml
from pathlib import Path


@pytest.fixture
def clusters_yaml(tmp_path: Path) -> Path:
    """Create a temporary clusters.yaml with test data."""
    raca_dir = tmp_path / ".raca"
    raca_dir.mkdir()
    clusters_file = raca_dir / "clusters.yaml"
    clusters_file.write_text(yaml.safe_dump({
        "clusters": {
            "torch": {
                "host": "login.torch.hpc.nyu.edu",
                "user": "testuser",
                "connection_mode": "controlmaster",
            },
            "vista": {
                "host": "login1.vista.tacc.utexas.edu",
                "user": "testuser",
                "connection_mode": "persistent",
            },
            "newcluster": {
                "host": "new.example.com",
                "user": "testuser",
                # no connection_mode
            },
        }
    }))
    return clusters_file


def test_get_connection_mode_controlmaster(clusters_yaml, monkeypatch):
    from raca.config import get_connection_mode

    monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
    assert get_connection_mode("torch") == "controlmaster"


def test_get_connection_mode_persistent(clusters_yaml, monkeypatch):
    from raca.config import get_connection_mode

    monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
    assert get_connection_mode("vista") == "persistent"


def test_get_connection_mode_not_set(clusters_yaml, monkeypatch):
    from raca.config import get_connection_mode

    monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
    assert get_connection_mode("newcluster") is None


def test_get_connection_mode_unknown_cluster(clusters_yaml, monkeypatch):
    from raca.config import get_connection_mode

    monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
    with pytest.raises(KeyError):
        get_connection_mode("nonexistent")


def test_get_session_paths(clusters_yaml, monkeypatch):
    from raca.config import get_session_paths

    monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
    socket_path, pid_path = get_session_paths("vista")
    assert socket_path.name == "vista-session.sock"
    assert pid_path.name == "vista-session.pid"
    assert socket_path.parent == pid_path.parent
