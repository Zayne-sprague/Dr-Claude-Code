"""Tests for raca.persistent — sentinel parsing and client functions."""

from __future__ import annotations

import json
import os
import socket
import tempfile
import threading
from pathlib import Path

import pytest


# ─── TestParseSentinelOutput ─────────────────────────────────────────────────


class TestParseSentinelOutput:
    """Tests for parse_sentinel_output() module-level function."""

    def test_clean_output(self):
        from raca.persistent import parse_sentinel_output

        raw = "__RACA_START_abc123\nhello world\n__RACA_END_abc123_RC_0\n"
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert stdout == "hello world"
        assert rc == 0

    def test_nonzero_return_code(self):
        from raca.persistent import parse_sentinel_output

        raw = "__RACA_START_abc123\nfail\n__RACA_END_abc123_RC_1\n"
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert stdout == "fail"
        assert rc == 1

    def test_multiline_output(self):
        from raca.persistent import parse_sentinel_output

        raw = (
            "__RACA_START_abc123\n"
            "line one\n"
            "line two\n"
            "line three\n"
            "__RACA_END_abc123_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert stdout == "line one\nline two\nline three"
        assert rc == 0

    def test_echoed_start_marker_uses_last(self):
        """When the shell echoes the command, the start marker appears twice.
        parse_sentinel_output should use rfind to pick the LAST one."""
        from raca.persistent import parse_sentinel_output

        raw = (
            "printf '%s\\n' '__RACA_START_abc123'\n"
            "__RACA_START_abc123\n"
            "real output\n"
            "__RACA_END_abc123_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert stdout == "real output"
        assert rc == 0

    def test_carriage_return_stripped(self):
        from raca.persistent import parse_sentinel_output

        raw = "__RACA_START_abc123\r\nhello\r\n__RACA_END_abc123_RC_0\r\n"
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert "\r" not in stdout
        assert stdout == "hello"
        assert rc == 0

    def test_no_end_marker_returns_minus_one(self):
        from raca.persistent import parse_sentinel_output

        raw = "__RACA_START_abc123\npartial output\n"
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert "partial output" in stdout
        assert rc == -1

    def test_empty_output(self):
        from raca.persistent import parse_sentinel_output

        raw = "__RACA_START_abc123\n__RACA_END_abc123_RC_0\n"
        stdout, rc = parse_sentinel_output(raw, "abc123")
        assert stdout == ""
        assert rc == 0


# ─── TestIsDaemonRunning ─────────────────────────────────────────────────────


class TestIsDaemonRunning:
    """Tests for is_daemon_running() client function."""

    def test_no_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        socket_path = tmp_path / "test.sock"
        assert is_daemon_running(pid_path, socket_path) is False

    def test_stale_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        socket_path = tmp_path / "test.sock"
        # PID that almost certainly does not exist
        pid_path.write_text("999999999")
        socket_path.touch()

        assert is_daemon_running(pid_path, socket_path) is False
        # Stale files should be cleaned up
        assert not pid_path.exists()
        assert not socket_path.exists()

    def test_corrupt_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        socket_path = tmp_path / "test.sock"
        pid_path.write_text("not-a-number")

        assert is_daemon_running(pid_path, socket_path) is False
        assert not pid_path.exists()

    def test_alive_pid_but_no_socket(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        socket_path = tmp_path / "test.sock"
        # Use our own PID — guaranteed to be alive
        pid_path.write_text(str(os.getpid()))

        assert is_daemon_running(pid_path, socket_path) is False

    def test_alive_pid_with_socket(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        socket_path = tmp_path / "test.sock"
        pid_path.write_text(str(os.getpid()))
        socket_path.touch()

        assert is_daemon_running(pid_path, socket_path) is True


# ─── TestSendCommand ─────────────────────────────────────────────────────────


def _mock_socket_server(socket_path: Path, response: dict, ready_event: threading.Event):
    """Spawn a minimal Unix socket server that sends a canned JSON response.

    Accepts exactly one connection, reads the request, sends the response, and exits.
    """
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(socket_path))
    server.listen(1)
    server.settimeout(5.0)
    ready_event.set()  # Signal that the server is listening
    try:
        conn, _ = server.accept()
        # Read the request (consume until newline)
        data = b""
        while b"\n" not in data:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data += chunk
        # Send the canned response
        conn.sendall((json.dumps(response) + "\n").encode())
        conn.close()
    except socket.timeout:
        pass
    finally:
        server.close()


class TestSendCommand:
    """Tests for send_command() client function using a mock Unix socket server."""

    @pytest.fixture
    def short_tmp(self):
        """Create a short temp dir for Unix sockets (macOS has a 104-byte path limit)."""
        d = tempfile.mkdtemp(prefix="raca_", dir="/tmp")
        yield Path(d)
        import shutil
        shutil.rmtree(d, ignore_errors=True)

    def test_send_command_success(self, short_tmp):
        from raca.persistent import send_command

        socket_path = short_tmp / "t.sock"
        canned = {
            "stdout": "hello\n",
            "stderr": "",
            "returncode": 0,
            "duration_s": 0.1,
        }
        ready = threading.Event()
        t = threading.Thread(
            target=_mock_socket_server,
            args=(socket_path, canned, ready),
            daemon=True,
        )
        t.start()
        ready.wait(timeout=3)

        result = send_command(socket_path, "echo hello")
        assert result["stdout"] == "hello\n"
        assert result["returncode"] == 0
        t.join(timeout=3)

    def test_send_command_ping(self, short_tmp):
        from raca.persistent import send_command

        socket_path = short_tmp / "t.sock"
        canned = {"status": "alive"}
        ready = threading.Event()
        t = threading.Thread(
            target=_mock_socket_server,
            args=(socket_path, canned, ready),
            daemon=True,
        )
        t.start()
        ready.wait(timeout=3)

        result = send_command(socket_path, "__PING__")
        assert result["status"] == "alive"
        t.join(timeout=3)

    def test_send_command_no_socket(self, tmp_path):
        from raca.persistent import send_command

        socket_path = tmp_path / "nonexistent.sock"
        result = send_command(socket_path, "echo hello")
        assert result["returncode"] == -1
        assert "Socket error" in result["stderr"]
