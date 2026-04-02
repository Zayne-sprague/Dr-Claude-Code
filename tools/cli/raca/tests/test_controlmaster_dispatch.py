from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml


@pytest.fixture
def clusters_yaml(tmp_path: Path) -> Path:
    """Create a temp clusters.yaml with both connection modes."""
    raca_dir = tmp_path / ".raca"
    raca_dir.mkdir()
    clusters_file = raca_dir / "clusters.yaml"
    clusters_file.write_text(yaml.safe_dump({
        "clusters": {
            "cm_cluster": {
                "host": "cm.example.com",
                "user": "testuser",
                "connection_mode": "controlmaster",
            },
            "pd_cluster": {
                "host": "pd.example.com",
                "user": "testuser",
                "connection_mode": "persistent",
            },
            "no_mode_cluster": {
                "host": "no.example.com",
                "user": "testuser",
            },
        }
    }))
    return clusters_file


class TestHealthCheckDispatch:

    def test_controlmaster_cluster_uses_socket_check(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()
        # No socket exists — should return False via controlmaster path
        healthy, msg = manager.health_check("cm_cluster")
        assert healthy is False
        assert "no socket" in msg.lower() or "not connected" in msg.lower()

    def test_persistent_cluster_uses_daemon_check(self, clusters_yaml, monkeypatch, tmp_path):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()
        # No daemon running — should return False via persistent path
        healthy, msg = manager.health_check("pd_cluster")
        assert healthy is False


class TestRunDispatch:

    def test_persistent_run_calls_send_command(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()

        mock_result = {"stdout": "hello\n", "stderr": "", "returncode": 0, "duration_s": 0.1}
        with patch("raca.persistent.send_command", return_value=mock_result) as mock_send, \
             patch.object(manager, "health_check", return_value=(True, "connected")):
            result = manager.run("pd_cluster", "echo hello", timeout=10)

        assert result.stdout == "hello\n"
        assert result.returncode == 0
        assert result.cluster == "pd_cluster"
        mock_send.assert_called_once()


class TestDisconnectDispatch:

    def test_persistent_disconnect_calls_stop_daemon(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()

        with patch("raca.persistent.stop_daemon", return_value=True) as mock_stop:
            result = manager.disconnect("pd_cluster")

        assert result.ok
        mock_stop.assert_called_once()


class TestUnsupportedOperations:

    def test_upload_persistent_raises(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()
        with pytest.raises(NotImplementedError, match="not supported for persistent"):
            manager.upload("pd_cluster", "/tmp/test", "/remote/test")

    def test_download_persistent_raises(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()
        with pytest.raises(NotImplementedError, match="not supported for persistent"):
            manager.download("pd_cluster", "/remote/test", "/tmp/test")

    def test_upload_controlmaster_does_not_raise(self, clusters_yaml, monkeypatch):
        monkeypatch.setenv("RACA_WORKSPACE", str(clusters_yaml.parent.parent))
        from raca.controlmaster import SSHSessionManager

        manager = SSHSessionManager()
        # Will fail on connection (no socket), but should NOT raise NotImplementedError
        result = manager.upload("cm_cluster", "/tmp/test", "/remote/test")
        # rsync will fail — that's fine, we just check it wasn't blocked
        assert isinstance(result.returncode, int)
