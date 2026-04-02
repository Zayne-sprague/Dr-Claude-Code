from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from click.testing import CliRunner


@pytest.fixture
def persistent_cluster_env(tmp_path: Path, monkeypatch):
    """Set up env with a persistent-mode cluster."""
    raca_dir = tmp_path / ".raca"
    raca_dir.mkdir()
    clusters_file = raca_dir / "clusters.yaml"
    clusters_file.write_text(yaml.safe_dump({
        "clusters": {
            "pd_cluster": {
                "host": "pd.example.com",
                "user": "testuser",
                "connection_mode": "persistent",
            },
        }
    }))
    monkeypatch.setenv("RACA_WORKSPACE", str(tmp_path))
    return tmp_path


def test_upload_persistent_shows_error(persistent_cluster_env):
    from raca.upload import upload

    runner = CliRunner()

    with patch("raca.controlmaster.SSHSessionManager.health_check", return_value=(True, "ok")):
        result = runner.invoke(upload, ["pd_cluster", "/tmp/test", "/remote/test"])

    assert result.exit_code != 0
    assert "not supported for persistent" in result.output.lower()


def test_download_persistent_shows_error(persistent_cluster_env):
    from raca.download import download

    runner = CliRunner()

    with patch("raca.controlmaster.SSHSessionManager.health_check", return_value=(True, "ok")):
        result = runner.invoke(download, ["pd_cluster", "/remote/test", "/tmp/test"])

    assert result.exit_code != 0
    assert "not supported for persistent" in result.output.lower()


def test_forward_persistent_shows_error(persistent_cluster_env):
    from raca.forward import forward

    runner = CliRunner()

    result = runner.invoke(forward, ["pd_cluster", "8888", "localhost:8888"])

    assert result.exit_code != 0
    assert "not supported for persistent" in result.output.lower()
