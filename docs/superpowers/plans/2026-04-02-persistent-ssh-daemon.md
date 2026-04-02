# Persistent SSH Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent SSH daemon support to RACA CLI so clusters that don't support ControlMaster (like TACC Vista) can be used via `raca auth`/`raca ssh`.

**Architecture:** Dual-dispatch in SSHSessionManager — reads `connection_mode` from cluster config and routes to either ControlMaster (subprocess + socket) or persistent daemon (pexpect + Unix domain socket). A new `raca setup-cluster` command probes which mode works by trying ControlMaster first with a 2-min timeout, falling back to persistent if it hangs.

**Tech Stack:** Python 3.10+, Click, PyYAML, pexpect, Unix domain sockets, double-fork daemonization.

**Spec:** `docs/superpowers/specs/2026-04-02-persistent-ssh-daemon-design.md`

**Reference impl:** `/Users/rs2020/Research/tools/experiment-runner/experiment_runner/ssh/persistent.py`

**Codebase:** All work in `/Users/rs2020/Blog/Dr-Claude-Code/tools/cli/`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `raca/persistent.py` | **Create** | PersistentSSHDaemon class + client functions (send_command, is_daemon_running, stop_daemon) |
| `raca/setup_cluster.py` | **Create** | `raca setup-cluster` Click command — probe + auto-detect connection mode |
| `raca/controlmaster.py` | **Modify** | Dual dispatch in SSHSessionManager (health_check, connect, run, disconnect) |
| `raca/config.py` | **Modify** | Add `get_connection_mode()` helper |
| `raca/auth.py` | **Modify** | Support persistent mode in `raca auth`, gate unset mode |
| `raca/disconnect.py` | **Modify** | Support persistent mode disconnect |
| `raca/upload.py` | **Modify** | Error guard for persistent clusters |
| `raca/download.py` | **Modify** | Error guard for persistent clusters |
| `raca/forward.py` | **Modify** | Error guard for persistent clusters |
| `raca/cli.py` | **Modify** | Register `setup-cluster` command |
| `pyproject.toml` | **Modify** | Add pexpect dependency |
| `raca/tests/__init__.py` | **Create** | Test package |
| `raca/tests/test_config.py` | **Create** | Tests for connection_mode config helper |
| `raca/tests/test_persistent_parsing.py` | **Create** | Tests for sentinel parsing + client functions |
| `raca/tests/test_controlmaster_dispatch.py` | **Create** | Tests for dual dispatch logic |
| `raca/tests/test_cli_guards.py` | **Create** | Tests for upload/download/forward error guards |

---

### Task 1: Add `pexpect` dependency and test infrastructure

**Files:**
- Modify: `pyproject.toml`
- Create: `raca/tests/__init__.py`

- [ ] **Step 1: Add pexpect to pyproject.toml**

In `pyproject.toml`, add pexpect and pytest:

```toml
[build-system]
requires = ["setuptools>=64"]
build-backend = "setuptools.build_meta"

[project]
name = "raca"
version = "0.1.0"
description = "RACA — SSH lifecycle for research clusters"
requires-python = ">=3.10"
license = "MIT"
dependencies = [
    "click>=8.0",
    "pyyaml>=6.0",
    "pexpect>=4.8",
]

[project.optional-dependencies]
dev = ["pytest>=7.0"]

[project.scripts]
raca = "raca.cli:main"
```

- [ ] **Step 2: Create test package**

Create `raca/tests/__init__.py` (empty file).

- [ ] **Step 3: Install updated package**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && pip install -e ".[dev]"
```

Expected: pexpect and pytest installed successfully.

- [ ] **Step 4: Verify pexpect import**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -c "import pexpect; print(pexpect.__version__)"
```

Expected: prints version like `4.9.0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/pyproject.toml tools/cli/raca/tests/__init__.py
git commit -m "chore: add pexpect dependency and test infrastructure"
```

---

### Task 2: Add `get_connection_mode()` to config

**Files:**
- Create: `raca/tests/test_config.py`
- Modify: `raca/config.py`

- [ ] **Step 1: Write failing tests for get_connection_mode**

Create `raca/tests/test_config.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_config.py -v
```

Expected: FAIL — `get_connection_mode` and `get_session_paths` not defined.

- [ ] **Step 3: Implement config helpers**

Add these functions to the end of `raca/config.py` (after the existing `list_cluster_names` function):

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_config.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/config.py tools/cli/raca/tests/test_config.py
git commit -m "feat: add get_connection_mode and get_session_paths config helpers"
```

---

### Task 3: Create `persistent.py` — sentinel parsing and client functions

This task builds the testable, non-daemon parts of `persistent.py`: sentinel output parsing and the client functions that talk to the daemon over Unix sockets.

**Files:**
- Create: `raca/persistent.py`
- Create: `raca/tests/test_persistent_parsing.py`

- [ ] **Step 1: Write failing tests for sentinel parsing**

Create `raca/tests/test_persistent_parsing.py`:

```python
from __future__ import annotations

import json
import os
import socket
import threading
import time
from pathlib import Path

import pytest


class TestParseSentinelOutput:
    """Test the sentinel output parser — pure string logic."""

    def test_clean_output(self):
        from raca.persistent import parse_sentinel_output

        uid = "abc123"
        raw = (
            "__RACA_START_abc123\n"
            "hello world\n"
            "__RACA_END_abc123_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == "hello world"
        assert rc == 0

    def test_nonzero_return_code(self):
        from raca.persistent import parse_sentinel_output

        uid = "def456"
        raw = (
            "__RACA_START_def456\n"
            "some error\n"
            "__RACA_END_def456_RC_1\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == "some error"
        assert rc == 1

    def test_multiline_output(self):
        from raca.persistent import parse_sentinel_output

        uid = "ghi789"
        raw = (
            "__RACA_START_ghi789\n"
            "line 1\n"
            "line 2\n"
            "line 3\n"
            "__RACA_END_ghi789_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == "line 1\nline 2\nline 3"
        assert rc == 0

    def test_echoed_start_marker_uses_last(self):
        from raca.persistent import parse_sentinel_output

        uid = "jkl012"
        raw = (
            "echo __RACA_START_jkl012\n"  # echoed command (first occurrence)
            "__RACA_START_jkl012\n"         # actual output (last occurrence)
            "real output\n"
            "__RACA_END_jkl012_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == "real output"
        assert rc == 0

    def test_carriage_return_stripped(self):
        from raca.persistent import parse_sentinel_output

        uid = "mno345"
        raw = (
            "__RACA_START_mno345\r\n"
            "output with cr\r\n"
            "__RACA_END_mno345_RC_0\r\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == "output with cr"
        assert rc == 0

    def test_no_end_marker_returns_minus_one(self):
        from raca.persistent import parse_sentinel_output

        uid = "pqr678"
        raw = "__RACA_START_pqr678\npartial output\n"
        stdout, rc = parse_sentinel_output(raw, uid)
        assert "partial output" in stdout
        assert rc == -1

    def test_empty_output(self):
        from raca.persistent import parse_sentinel_output

        uid = "stu901"
        raw = (
            "__RACA_START_stu901\n"
            "__RACA_END_stu901_RC_0\n"
        )
        stdout, rc = parse_sentinel_output(raw, uid)
        assert stdout == ""
        assert rc == 0


class TestIsDaemonRunning:
    """Test daemon liveness checks — uses real PID/file checks."""

    def test_no_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        sock_path = tmp_path / "test.sock"
        assert is_daemon_running(pid_path, sock_path) is False

    def test_stale_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        sock_path = tmp_path / "test.sock"
        pid_path.write_text("999999999")  # PID that doesn't exist
        sock_path.touch()
        assert is_daemon_running(pid_path, sock_path) is False
        # Stale files should be cleaned up
        assert not pid_path.exists()
        assert not sock_path.exists()

    def test_corrupt_pid_file(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        sock_path = tmp_path / "test.sock"
        pid_path.write_text("not-a-number")
        assert is_daemon_running(pid_path, sock_path) is False
        assert not pid_path.exists()

    def test_alive_pid_but_no_socket(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        sock_path = tmp_path / "test.sock"
        pid_path.write_text(str(os.getpid()))  # our own PID — always alive
        # No socket file
        assert is_daemon_running(pid_path, sock_path) is False

    def test_alive_pid_with_socket(self, tmp_path):
        from raca.persistent import is_daemon_running

        pid_path = tmp_path / "test.pid"
        sock_path = tmp_path / "test.sock"
        pid_path.write_text(str(os.getpid()))
        sock_path.touch()
        assert is_daemon_running(pid_path, sock_path) is True


class TestSendCommand:
    """Test the client send_command function against a mock socket server."""

    def _run_mock_server(self, sock_path: Path, response: dict) -> threading.Event:
        """Start a mock Unix socket server that returns a canned response."""
        done = threading.Event()

        def serve():
            server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server.bind(str(sock_path))
            server.listen(1)
            server.settimeout(5.0)
            try:
                conn, _ = server.accept()
                # Read request
                data = b""
                while b"\n" not in data:
                    data += conn.recv(4096)
                # Send response
                conn.sendall((json.dumps(response) + "\n").encode())
                conn.close()
            except socket.timeout:
                pass
            finally:
                server.close()
                done.set()

        t = threading.Thread(target=serve, daemon=True)
        t.start()
        time.sleep(0.1)  # give server time to bind
        return done

    def test_send_command_success(self, tmp_path):
        from raca.persistent import send_command

        sock_path = tmp_path / "test.sock"
        response = {"stdout": "hello\n", "stderr": "", "returncode": 0, "duration_s": 0.1}
        self._run_mock_server(sock_path, response)

        result = send_command(sock_path, "echo hello", timeout=5)
        assert result["stdout"] == "hello\n"
        assert result["returncode"] == 0

    def test_send_command_ping(self, tmp_path):
        from raca.persistent import send_command

        sock_path = tmp_path / "test.sock"
        response = {"status": "alive"}
        self._run_mock_server(sock_path, response)

        result = send_command(sock_path, "__PING__", timeout=5)
        assert result["status"] == "alive"

    def test_send_command_no_socket(self, tmp_path):
        from raca.persistent import send_command

        sock_path = tmp_path / "nonexistent.sock"
        result = send_command(sock_path, "echo hello", timeout=5)
        assert result["returncode"] == -1
        assert "Socket error" in result["stderr"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_persistent_parsing.py -v
```

Expected: FAIL — `raca.persistent` module doesn't exist.

- [ ] **Step 3: Implement persistent.py — parsing and client functions**

Create `raca/persistent.py`:

```python
"""Persistent SSH session daemon for clusters without ControlMaster support.

Some HPC systems (e.g. TACC Vista) don't support SSH ControlMaster session
multiplexing. For these clusters, we keep an interactive SSH subprocess alive
in a background daemon and send commands over a Unix domain socket.

Architecture:
    1. `start()` spawns an SSH session via pexpect and hands off terminal I/O
       to the user for interactive auth (password, 2FA, etc.).
    2. Once a shell prompt is detected, `_fork_daemon()` double-forks a daemon
       process that holds the SSH session and listens on a Unix domain socket.
    3. Clients send JSON-line requests to the socket via `send_command()`.
    4. The daemon executes commands using sentinel markers around the output
       so it can reliably parse stdout and return codes from the interactive
       shell session.
"""

from __future__ import annotations

import json
import logging
import os
import re
import signal
import socket
import sys
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SENTINEL_PREFIX = "__RACA_"
HEARTBEAT_INTERVAL = 30  # seconds between shell heartbeats


# ─── Sentinel Parsing ───────────────────────────────────────────────────────


def parse_sentinel_output(raw: str, uid: str) -> tuple[str, int]:
    """Parse command output from between sentinel markers.

    Uses rfind for the start marker because the interactive shell echoes
    the command (producing the marker once in the echo), and then printf
    outputs it again. We want the LAST (actual output) occurrence.

    Args:
        raw: Raw text captured from the PTY.
        uid: Unique ID used in the sentinel markers.

    Returns:
        Tuple of (stdout_content, return_code).
        Returns rc=-1 if end sentinel is missing.
    """
    start_marker = f"{SENTINEL_PREFIX}START_{uid}"
    end_marker_pattern = re.compile(
        re.escape(f"{SENTINEL_PREFIX}END_{uid}_RC_") + r"(\d+)"
    )

    # Find LAST start marker (shell echoes the command, producing it twice)
    start_idx = raw.rfind(start_marker)
    if start_idx != -1:
        after_start = raw[start_idx + len(start_marker):]
        after_start = after_start.lstrip("\r\n")
    else:
        after_start = raw

    end_match = end_marker_pattern.search(after_start)
    if end_match:
        stdout = after_start[:end_match.start()]
        returncode = int(end_match.group(1))
    else:
        stdout = after_start
        returncode = -1

    stdout = stdout.replace("\r\n", "\n")
    stdout = stdout.strip("\r\n")

    return stdout, returncode


# ─── Client Functions ────────────────────────────────────────────────────────


def is_daemon_running(pid_path: Path, socket_path: Path) -> bool:
    """Check if the persistent SSH daemon is running.

    Verifies both the PID file (process alive) and socket file exist.
    Cleans up stale PID/socket files if the process is dead.
    """
    if not pid_path.exists():
        return False

    try:
        pid = int(pid_path.read_text().strip())
    except (ValueError, OSError):
        pid_path.unlink(missing_ok=True)
        return False

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        pid_path.unlink(missing_ok=True)
        socket_path.unlink(missing_ok=True)
        return False
    except PermissionError:
        pass  # process exists but different user — still "running"

    if not socket_path.exists():
        return False

    return True


def send_command(
    socket_path: Path,
    command: str,
    timeout: int = 300,
) -> dict:
    """Send a command to the persistent SSH daemon and get the result.

    Connects to the daemon's Unix domain socket, sends a JSON-line request,
    and reads back a JSON-line response.

    Returns:
        Dict with keys: stdout, stderr, returncode, duration_s.
        On socket errors, returns a dict with error info and returncode=-1.
    """
    request = {"command": command, "timeout": timeout}

    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(timeout + 10)
        sock.connect(str(socket_path))

        sock.sendall((json.dumps(request) + "\n").encode())

        data = b""
        while b"\n" not in data:
            chunk = sock.recv(65536)
            if not chunk:
                break
            data += chunk

        sock.close()

        if not data:
            return {
                "stdout": "",
                "stderr": "Empty response from daemon",
                "returncode": -1,
                "duration_s": 0.0,
            }

        return json.loads(data.decode().strip())

    except (socket.error, OSError) as e:
        return {
            "stdout": "",
            "stderr": f"Socket error: {e}",
            "returncode": -1,
            "duration_s": 0.0,
        }
    except json.JSONDecodeError as e:
        return {
            "stdout": "",
            "stderr": f"Invalid response from daemon: {e}",
            "returncode": -1,
            "duration_s": 0.0,
        }


def stop_daemon(pid_path: Path, socket_path: Path) -> bool:
    """Stop the persistent SSH daemon.

    Attempts graceful shutdown via socket first (__SHUTDOWN__),
    then falls back to SIGTERM.
    """
    if not is_daemon_running(pid_path, socket_path):
        return True

    # Try graceful shutdown via socket
    if socket_path.exists():
        try:
            result = send_command(socket_path, "__SHUTDOWN__", timeout=5)
            if result.get("status") == "shutting_down":
                time.sleep(0.5)
                if not is_daemon_running(pid_path, socket_path):
                    return True
        except Exception:
            pass

    # Fall back to SIGTERM
    if pid_path.exists():
        try:
            pid = int(pid_path.read_text().strip())
            os.kill(pid, signal.SIGTERM)
            for _ in range(20):  # 2 seconds
                try:
                    os.kill(pid, 0)
                    time.sleep(0.1)
                except ProcessLookupError:
                    break
        except (ValueError, ProcessLookupError, PermissionError):
            pass

    pid_path.unlink(missing_ok=True)
    socket_path.unlink(missing_ok=True)

    return True


# ─── Daemon Class ────────────────────────────────────────────────────────────


class _ShutdownRequested(Exception):
    """Internal signal that a __SHUTDOWN__ command was received."""


class PersistentSSHDaemon:
    """Manages a persistent interactive SSH session as a background daemon.

    For clusters where ControlMaster is not supported, this class:
    - Spawns SSH via pexpect
    - Proxies interactive auth to the user's terminal
    - Double-forks a daemon that holds the session
    - Serves command execution requests over a Unix domain socket
    """

    PROMPT_PATTERNS = [
        rb'[\$%#>]\s*$',
        rb'\)\$\s*$',
        rb'\]\$\s*$',
        rb'\]%\s*$',
        rb'\]#\s*$',
    ]

    def __init__(self, cluster_config: dict[str, Any], cluster_name: str) -> None:
        self.config = cluster_config
        self.name = cluster_name
        self.child = None  # pexpect spawn
        self._daemonized = False

    def _socket_dir(self) -> Path:
        d = Path.home() / ".ssh" / "sockets"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def session_socket_path(self) -> Path:
        return self._socket_dir() / f"{self.name}-session.sock"

    @property
    def session_pid_path(self) -> Path:
        return self._socket_dir() / f"{self.name}-session.pid"

    def _is_ssh_alive(self) -> bool:
        if self.child is None:
            return False
        if not self._daemonized:
            return self.child.isalive()
        try:
            os.kill(self.child.pid, 0)
            return True
        except (ProcessLookupError, OSError):
            return False

    def start(self, timeout: int = 120) -> bool:
        """Spawn SSH, authenticate interactively, then daemonize.

        Returns True if daemon was started successfully.
        """
        import pexpect

        host = self.config.get("host") or self.config.get("hostname") or self.name
        user = self.config.get("user", "")
        port = self.config.get("port", 22)
        keepalive = self.config.get("server_alive_interval", 30)
        keepalive_max = self.config.get("server_alive_count_max", 6)

        target = f"{user}@{host}" if user else host

        ssh_cmd = (
            f"ssh -tt"
            f" -p {port}"
            f" -o StrictHostKeyChecking=accept-new"
            f" -o ServerAliveInterval={keepalive}"
            f" -o ServerAliveCountMax={keepalive_max}"
            f" -o LogLevel=ERROR"
            f" -o ForwardAgent=yes"
            f" {target}"
        )

        logger.info("Spawning SSH: %s", ssh_cmd)
        self.child = pexpect.spawn(ssh_cmd, encoding=None, timeout=timeout)

        if not self._interactive_auth(timeout):
            logger.error("Interactive auth failed or timed out")
            if self.child and self.child.isalive():
                self.child.terminate(force=True)
            return False

        return self._fork_daemon()

    def _interactive_auth(self, timeout: int) -> bool:
        """Proxy SSH's PTY to the user's terminal for interactive auth.

        Uses raw terminal mode and select() to shuttle bytes between
        the SSH child and stdin/stdout until a shell prompt is detected.
        """
        import select
        import termios
        import tty

        if not sys.stdin.isatty():
            logger.error("Cannot do interactive auth without a TTY")
            return False

        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        child_fd = self.child.child_fd

        recent_output = b""

        try:
            tty.setraw(fd)
            start_time = time.monotonic()

            while (time.monotonic() - start_time) < timeout:
                try:
                    rlist, _, _ = select.select([child_fd, fd], [], [], 1.0)
                except (ValueError, OSError):
                    break

                for ready_fd in rlist:
                    if ready_fd == child_fd:
                        try:
                            data = os.read(child_fd, 4096)
                        except OSError:
                            return False
                        if not data:
                            return False
                        os.write(sys.stdout.fileno(), data)
                        recent_output += data
                        recent_output = recent_output[-512:]

                        for pattern in self.PROMPT_PATTERNS:
                            if re.search(pattern, recent_output):
                                time.sleep(0.3)
                                return True

                    elif ready_fd == fd:
                        try:
                            data = os.read(fd, 4096)
                        except OSError:
                            break
                        if data:
                            os.write(child_fd, data)

            logger.warning("Auth timed out after %ds", timeout)
            return False
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

    def _fork_daemon(self) -> bool:
        """Double-fork to daemonize, holding the SSH session in the grandchild.

        The parent waits up to 5s for the PID file to appear.
        """
        socket_path = self.session_socket_path
        pid_path = self.session_pid_path

        socket_path.parent.mkdir(parents=True, exist_ok=True)

        # Stop existing daemon before starting new one
        if is_daemon_running(pid_path, socket_path):
            logger.info("Stopping existing daemon before starting new one")
            stop_daemon(pid_path, socket_path)
        else:
            socket_path.unlink(missing_ok=True)
            pid_path.unlink(missing_ok=True)

        # First fork
        pid = os.fork()
        if pid > 0:
            # Parent: wait for PID file
            for _ in range(50):  # 5s
                if pid_path.exists():
                    logger.info("Daemon started (PID file: %s)", pid_path)
                    # Detach pexpect so GC doesn't kill SSH
                    if self.child is not None:
                        pty_fd = self.child.child_fd
                        fileobj = getattr(self.child, "fileobj", None)
                        if fileobj is not None:
                            try:
                                fileobj.close()
                            except OSError:
                                pass
                        if pty_fd >= 0:
                            try:
                                os.close(pty_fd)
                            except OSError:
                                pass
                        self.child.child_fd = -1
                        self.child.terminated = True
                        ptyproc = getattr(self.child, "ptyproc", None)
                        if ptyproc is not None:
                            ptyproc.fd = -1
                            ptyproc.closed = True
                        self.child = None
                    return True
                time.sleep(0.1)
            logger.error("Daemon PID file did not appear within 5s")
            return False

        # First child: new session
        os.setsid()

        # Second fork
        pid = os.fork()
        if pid > 0:
            os._exit(0)

        # Grandchild: the daemon
        try:
            child_fd = self.child.child_fd

            devnull = os.open(os.devnull, os.O_RDWR)
            for target_fd in (0, 1, 2):
                if target_fd != child_fd:
                    os.dup2(devnull, target_fd)
            os.close(devnull)

            daemon_pid = os.getpid()
            pid_path.write_text(str(daemon_pid))

            self._daemonized = True

            log_path = socket_path.parent / f"{self.name}-daemon.log"
            file_handler = logging.FileHandler(str(log_path))
            file_handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(message)s")
            )
            logger.addHandler(file_handler)
            logger.setLevel(logging.INFO)
            logger.info(
                "Daemon started: pid=%d ssh_pid=%d cluster=%s heartbeat=%ds",
                daemon_pid, self.child.pid, self.name, HEARTBEAT_INTERVAL,
            )

            def _cleanup(signum=None, frame=None):
                logger.info("Cleanup: signal=%s ssh_alive=%s", signum, self._is_ssh_alive())
                try:
                    if self._is_ssh_alive():
                        os.kill(self.child.pid, signal.SIGHUP)
                        time.sleep(0.1)
                        if self._is_ssh_alive():
                            os.kill(self.child.pid, signal.SIGKILL)
                except Exception:
                    pass
                try:
                    socket_path.unlink(missing_ok=True)
                except Exception:
                    pass
                try:
                    pid_path.unlink(missing_ok=True)
                except Exception:
                    pass
                os._exit(0)

            signal.signal(signal.SIGTERM, _cleanup)
            signal.signal(signal.SIGHUP, _cleanup)

            self._run_socket_server(socket_path)
        except Exception:
            logger.exception("Daemon crashed")
        finally:
            try:
                _cleanup()
            except Exception:
                os._exit(1)

        os._exit(0)

    def _run_socket_server(self, socket_path: Path) -> None:
        """Run Unix domain socket server accepting command requests."""
        self._last_heartbeat = time.monotonic()

        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            server.bind(str(socket_path))
            server.listen(5)
            server.settimeout(5.0)

            logger.info("Daemon listening on %s", socket_path)

            while True:
                if not self._is_ssh_alive():
                    logger.warning("SSH child died, shutting down")
                    break

                self._send_heartbeat_if_due()

                try:
                    conn, _ = server.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break

                self._last_heartbeat = time.monotonic()

                try:
                    self._handle_connection(conn)
                except _ShutdownRequested:
                    conn.close()
                    break
                except Exception:
                    logger.exception("Error handling connection")
                finally:
                    try:
                        conn.close()
                    except OSError:
                        pass
        finally:
            server.close()

    def _handle_connection(self, conn: socket.socket) -> None:
        """Handle a single client connection."""
        data = b""
        conn.settimeout(10.0)
        try:
            while b"\n" not in data:
                chunk = conn.recv(4096)
                if not chunk:
                    return
                data += chunk
        except socket.timeout:
            response = {"error": "Timeout reading request"}
            conn.sendall((json.dumps(response) + "\n").encode())
            return

        try:
            request = json.loads(data.decode().strip())
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            response = {"error": f"Invalid request: {e}"}
            conn.sendall((json.dumps(response) + "\n").encode())
            return

        command = request.get("command", "")
        timeout = request.get("timeout", 300)

        if command == "__SHUTDOWN__":
            response = {"status": "shutting_down"}
            conn.sendall((json.dumps(response) + "\n").encode())
            raise _ShutdownRequested()

        if command == "__PING__":
            alive = self._is_ssh_alive()
            response = {"status": "alive" if alive else "dead"}
            conn.sendall((json.dumps(response) + "\n").encode())
            return

        logger.info("Executing: %s (timeout=%ds)", command[:80], timeout)
        result = self._execute_command(command, timeout)
        logger.info("Result: rc=%s duration=%.1fs",
                     result.get("returncode"), result.get("duration_s", 0))
        conn.sendall((json.dumps(result) + "\n").encode())

    def _send_heartbeat_if_due(self) -> None:
        """Send heartbeat to prevent HPC idle-session killers."""
        now = time.monotonic()
        if now - self._last_heartbeat >= HEARTBEAT_INTERVAL:
            try:
                os.write(self.child.child_fd, b" true\n")
                self._last_heartbeat = now
                logger.info("Heartbeat sent (%.0fs since last)", now - self._last_heartbeat)
            except OSError as e:
                logger.warning("Heartbeat failed: %s", e)

    def _execute_command(self, command: str, timeout: int = 300) -> dict:
        """Execute a command on the remote shell using sentinel markers."""
        import select

        if not self._is_ssh_alive():
            return {
                "stdout": "",
                "stderr": "SSH session is not alive",
                "returncode": -1,
                "duration_s": 0.0,
            }

        child_fd = self.child.child_fd
        uid = uuid.uuid4().hex[:12]
        start_marker = f"{SENTINEL_PREFIX}START_{uid}"
        end_marker_prefix = f"{SENTINEL_PREFIX}END_{uid}_RC_"

        sentinel_cmd = (
            f"__old_ps1=\"$PS1\"; PS1=''; stty -echo 2>/dev/null\n"
            f"printf '%s\\n' '{start_marker}'\n"
            f"{command}\n"
            f"__exp_rc=$?\n"
            f"printf '%s\\n' '{end_marker_prefix}'\"$__exp_rc\"\n"
            f"PS1=\"$__old_ps1\"; stty echo 2>/dev/null\n"
        )

        start_time = time.monotonic()

        try:
            os.write(child_fd, sentinel_cmd.encode())

            buf = b""
            end_pattern = re.compile(
                re.escape(f"{SENTINEL_PREFIX}END_{uid}_RC_") + r"(\d+)"
            )

            while True:
                elapsed = time.monotonic() - start_time
                remaining = timeout - elapsed
                if remaining <= 0:
                    return {
                        "stdout": "",
                        "stderr": f"Command timed out after {timeout}s",
                        "returncode": -1,
                        "duration_s": round(elapsed, 3),
                    }

                ready, _, _ = select.select([child_fd], [], [], min(remaining, 5.0))
                if not ready:
                    if not self._is_ssh_alive():
                        return {
                            "stdout": "",
                            "stderr": "SSH session died during command execution",
                            "returncode": -1,
                            "duration_s": round(time.monotonic() - start_time, 3),
                        }
                    self._send_heartbeat_if_due()
                    continue

                try:
                    data = os.read(child_fd, 65536)
                except OSError:
                    return {
                        "stdout": "",
                        "stderr": "SSH session ended unexpectedly (EOF)",
                        "returncode": -1,
                        "duration_s": round(time.monotonic() - start_time, 3),
                    }

                if not data:
                    return {
                        "stdout": "",
                        "stderr": "SSH session ended unexpectedly (EOF)",
                        "returncode": -1,
                        "duration_s": round(time.monotonic() - start_time, 3),
                    }

                buf += data
                decoded = buf.decode("utf-8", errors="replace")
                match = end_pattern.search(decoded)
                if match:
                    duration = time.monotonic() - start_time
                    stdout, returncode = parse_sentinel_output(decoded, uid)
                    try:
                        returncode = int(match.group(1))
                    except (IndexError, ValueError):
                        pass
                    return {
                        "stdout": stdout,
                        "stderr": "",
                        "returncode": returncode,
                        "duration_s": round(duration, 3),
                    }

        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Command execution error: {e}",
                "returncode": -1,
                "duration_s": round(time.monotonic() - start_time, 3),
            }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_persistent_parsing.py -v
```

Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/persistent.py tools/cli/raca/tests/test_persistent_parsing.py
git commit -m "feat: add persistent SSH daemon with sentinel parsing and client functions"
```

---

### Task 4: Add dual dispatch to SSHSessionManager

**Files:**
- Modify: `raca/controlmaster.py`
- Create: `raca/tests/test_controlmaster_dispatch.py`

- [ ] **Step 1: Write failing tests for dispatch logic**

Create `raca/tests/test_controlmaster_dispatch.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_controlmaster_dispatch.py -v
```

Expected: FAIL — SSHSessionManager doesn't dispatch on connection_mode yet.

- [ ] **Step 3: Implement dual dispatch in SSHSessionManager**

Replace the full content of `raca/controlmaster.py` with:

```python
from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import get_cluster, get_connection_mode, get_session_paths, load_clusters


@dataclass
class RemoteResult:
    stdout: str
    stderr: str
    returncode: int
    cluster: str
    command: str
    duration_s: float

    @property
    def ok(self) -> bool:
        return self.returncode == 0


class SSHSessionManager:
    SOCKET_DIR = Path.home() / ".ssh" / "sockets"

    def __init__(self) -> None:
        self.SOCKET_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _cluster_cfg(self, cluster: str) -> dict[str, Any]:
        return get_cluster(cluster)

    def _is_persistent(self, cluster: str) -> bool:
        return get_connection_mode(cluster) == "persistent"

    def _socket_path(self, cluster: str) -> Path:
        cfg = self._cluster_cfg(cluster)
        user = cfg.get("user", "")
        label = f"{user}@{cluster}" if user else cluster
        return self.SOCKET_DIR / label

    def _base_ssh_args(self, cluster: str) -> list[str]:
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host") or cfg.get("hostname") or cluster
        user = cfg.get("user")
        port = cfg.get("port", 22)
        socket = str(self._socket_path(cluster))
        keepalive_interval = cfg.get("server_alive_interval", 30)
        keepalive_count = cfg.get("server_alive_count_max", 6)
        control_persist = cfg.get("control_persist", "4h")

        args = [
            "ssh",
            "-o", f"ControlMaster=auto",
            "-o", f"ControlPath={socket}",
            "-o", f"ControlPersist={control_persist}",
            "-o", f"ServerAliveInterval={keepalive_interval}",
            "-o", f"ServerAliveCountMax={keepalive_count}",
            "-o", "StrictHostKeyChecking=accept-new",
            "-p", str(port),
        ]
        if user:
            args += ["-l", user]

        identity = cfg.get("identity_file")
        if identity:
            args += ["-i", str(Path(identity).expanduser())]

        args.append(host)
        return args

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    def is_connected(self, cluster: str) -> bool:
        healthy, _ = self.health_check(cluster)
        return healthy

    def health_check(self, cluster: str) -> tuple[bool, str]:
        if self._is_persistent(cluster):
            return self._health_check_persistent(cluster)
        return self._health_check_controlmaster(cluster)

    def _health_check_controlmaster(self, cluster: str) -> tuple[bool, str]:
        socket = self._socket_path(cluster)
        if not socket.exists():
            return False, "no socket"

        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host") or cfg.get("hostname") or cluster
        user = cfg.get("user")
        port = cfg.get("port", 22)

        cmd = [
            "ssh",
            "-o", f"ControlPath={socket}",
            "-o", "StrictHostKeyChecking=accept-new",
            "-p", str(port),
        ]
        if user:
            cmd += ["-l", user]
        cmd += ["-O", "check", host]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return True, "healthy"
            try:
                socket.unlink(missing_ok=True)
            except OSError:
                pass
            return False, result.stderr.strip() or "check failed"
        except subprocess.TimeoutExpired:
            return True, "busy (timeout on check — VPN lag suspected)"

    def _health_check_persistent(self, cluster: str) -> tuple[bool, str]:
        from .persistent import is_daemon_running, send_command, stop_daemon

        socket_path, pid_path = get_session_paths(cluster)

        if not is_daemon_running(pid_path, socket_path):
            return False, "not connected"

        try:
            result = send_command(socket_path, "__PING__", timeout=5)
            if result.get("status") == "alive":
                return True, "connected (persistent session)"
            if result.get("status") == "dead":
                stop_daemon(pid_path, socket_path)
                return False, "SSH session died"
            return True, "connected (persistent session, busy)"
        except Exception:
            return True, "connected (persistent session, busy)"

    def connect(self, cluster: str, timeout: int = 120) -> RemoteResult:
        if self._is_persistent(cluster):
            return self._connect_persistent(cluster, timeout)
        return self._connect_controlmaster(cluster, timeout)

    def _connect_controlmaster(self, cluster: str, timeout: int) -> RemoteResult:
        cfg = self._cluster_cfg(cluster)
        uses_2fa = cfg.get("uses_2fa", False) or cfg.get("two_factor", False)
        args = self._base_ssh_args(cluster)
        host = args[-1]

        start = time.monotonic()

        if uses_2fa:
            interactive_args = args[:-1] + [host, "echo 'Auth OK'"]
            result = subprocess.run(
                interactive_args,
                timeout=timeout,
            )
        else:
            args = args[:-1] + ["-f", host, "while true; do sleep 30; done"]
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=timeout,
            )

        duration = time.monotonic() - start

        return RemoteResult(
            stdout=getattr(result, 'stdout', '') or '',
            stderr=getattr(result, 'stderr', '') or '',
            returncode=result.returncode,
            cluster=cluster,
            command="connect",
            duration_s=duration,
        )

    def _connect_persistent(self, cluster: str, timeout: int) -> RemoteResult:
        from .persistent import PersistentSSHDaemon

        cfg = self._cluster_cfg(cluster)
        daemon = PersistentSSHDaemon(cfg, cluster)

        start = time.monotonic()
        success = daemon.start(timeout=timeout)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout="Persistent session started\n" if success else "",
            stderr="" if success else "Failed to start persistent session",
            returncode=0 if success else 1,
            cluster=cluster,
            command="connect",
            duration_s=duration,
        )

    def disconnect(self, cluster: str) -> RemoteResult:
        if self._is_persistent(cluster):
            return self._disconnect_persistent(cluster)
        return self._disconnect_controlmaster(cluster)

    def _disconnect_controlmaster(self, cluster: str) -> RemoteResult:
        socket = self._socket_path(cluster)
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host") or cfg.get("hostname") or cluster
        user = cfg.get("user")
        port = cfg.get("port", 22)

        cmd = [
            "ssh",
            "-o", f"ControlPath={socket}",
            "-p", str(port),
        ]
        if user:
            cmd += ["-l", user]
        cmd += ["-O", "exit", host]

        start = time.monotonic()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        duration = time.monotonic() - start

        socket.unlink(missing_ok=True)

        return RemoteResult(
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
            cluster=cluster,
            command="disconnect",
            duration_s=duration,
        )

    def _disconnect_persistent(self, cluster: str) -> RemoteResult:
        from .persistent import stop_daemon

        socket_path, pid_path = get_session_paths(cluster)

        start = time.monotonic()
        success = stop_daemon(pid_path, socket_path)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout="Disconnected\n" if success else "",
            stderr="" if success else "Failed to stop daemon",
            returncode=0 if success else 1,
            cluster=cluster,
            command="disconnect",
            duration_s=duration,
        )

    # ------------------------------------------------------------------
    # Command execution & file transfer
    # ------------------------------------------------------------------

    def run(self, cluster: str, command: str, timeout: int = 300) -> RemoteResult:
        if self._is_persistent(cluster):
            return self._run_persistent(cluster, command, timeout)
        return self._run_controlmaster(cluster, command, timeout)

    def _run_controlmaster(self, cluster: str, command: str, timeout: int) -> RemoteResult:
        args = self._base_ssh_args(cluster)
        args = [
            a if a != "ControlMaster=auto" else "ControlMaster=no"
            for a in args
        ]
        args.append(command)

        start = time.monotonic()
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        duration = time.monotonic() - start

        return RemoteResult(
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
            cluster=cluster,
            command=command,
            duration_s=duration,
        )

    def _run_persistent(self, cluster: str, command: str, timeout: int) -> RemoteResult:
        from .persistent import send_command

        socket_path, _ = get_session_paths(cluster)

        start = time.monotonic()
        result = send_command(socket_path, command, timeout=timeout)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout=result.get("stdout", ""),
            stderr=result.get("stderr", ""),
            returncode=result.get("returncode", -1),
            cluster=cluster,
            command=command,
            duration_s=result.get("duration_s", round(duration, 2)),
        )

    def upload(self, cluster: str, local_path: str, remote_path: str) -> RemoteResult:
        if self._is_persistent(cluster):
            raise NotImplementedError(
                f"Upload not supported for persistent-mode clusters. "
                f"Use: raca ssh {cluster} 'scp ...' instead"
            )

        socket = str(self._socket_path(cluster))
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host") or cfg.get("hostname") or cluster
        user = cfg.get("user")
        port = cfg.get("port", 22)

        dest = f"{user}@{host}:{remote_path}" if user else f"{host}:{remote_path}"
        ssh_cmd = f"ssh -S {socket} -p {port}"

        cmd = [
            "rsync",
            "-avz",
            "--progress",
            "-e", ssh_cmd,
            local_path,
            dest,
        ]

        start = time.monotonic()
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
            cluster=cluster,
            command=f"upload {local_path} -> {remote_path}",
            duration_s=duration,
        )

    def download(self, cluster: str, remote_path: str, local_path: str) -> RemoteResult:
        if self._is_persistent(cluster):
            raise NotImplementedError(
                f"Download not supported for persistent-mode clusters. "
                f"Use: raca ssh {cluster} 'scp ...' instead"
            )

        socket = str(self._socket_path(cluster))
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host") or cfg.get("hostname") or cluster
        user = cfg.get("user")
        port = cfg.get("port", 22)

        src = f"{user}@{host}:{remote_path}" if user else f"{host}:{remote_path}"
        ssh_cmd = f"ssh -S {socket} -p {port}"

        cmd = [
            "rsync",
            "-avz",
            "--progress",
            "-e", ssh_cmd,
            src,
            local_path,
        ]

        start = time.monotonic()
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
            cluster=cluster,
            command=f"download {remote_path} -> {local_path}",
            duration_s=duration,
        )

    # ------------------------------------------------------------------
    # Bulk status
    # ------------------------------------------------------------------

    def status_all(self) -> dict[str, bool]:
        clusters = load_clusters()
        return {name: self.is_connected(name) for name in clusters}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_controlmaster_dispatch.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/controlmaster.py tools/cli/raca/tests/test_controlmaster_dispatch.py
git commit -m "feat: add dual dispatch in SSHSessionManager for controlmaster and persistent modes"
```

---

### Task 5: Create `setup_cluster.py` — the probe command

**Files:**
- Create: `raca/setup_cluster.py`

- [ ] **Step 1: Create the setup-cluster command**

Create `raca/setup_cluster.py`:

```python
from __future__ import annotations

import os
import re
import sys
import time

import click

from .config import get_cluster, save_cluster, load_clusters, get_raca_dir


# Shell prompt patterns (bytes) — same as PersistentSSHDaemon
_PROMPT_PATTERNS = [
    rb'[\$%#>]\s*$',
    rb'\)\$\s*$',
    rb'\]\$\s*$',
    rb'\]%\s*$',
    rb'\]#\s*$',
]

_PROBE_TIMEOUT = 120  # 2 minutes


def _check_vpn() -> bool:
    """Return True if any utun interface has an inet address (VPN active)."""
    import subprocess

    try:
        result = subprocess.run(
            ["ifconfig"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        lines = result.stdout.splitlines()
        current_utun = False
        for line in lines:
            if line.startswith("utun"):
                current_utun = True
            elif line.startswith("\t") and current_utun:
                if "inet " in line:
                    return True
            else:
                if not line.startswith("\t"):
                    current_utun = False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def _build_controlmaster_ssh_cmd(cfg: dict, cluster: str) -> str:
    """Build SSH command string WITH ControlMaster options for probing."""
    from pathlib import Path

    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg.get("user", "")
    port = cfg.get("port", 22)
    keepalive = cfg.get("server_alive_interval", 30)
    keepalive_max = cfg.get("server_alive_count_max", 6)

    socket_dir = Path.home() / ".ssh" / "sockets"
    socket_dir.mkdir(parents=True, exist_ok=True)
    socket_label = f"{user}@{cluster}" if user else cluster
    socket_path = socket_dir / socket_label

    target = f"{user}@{host}" if user else host

    return (
        f"ssh -tt"
        f" -p {port}"
        f" -o ControlMaster=auto"
        f" -o ControlPath={socket_path}"
        f" -o ControlPersist=4h"
        f" -o ServerAliveInterval={keepalive}"
        f" -o ServerAliveCountMax={keepalive_max}"
        f" -o StrictHostKeyChecking=accept-new"
        f" {target}"
    )


def _build_persistent_ssh_cmd(cfg: dict, cluster: str) -> str:
    """Build SSH command string WITHOUT ControlMaster options."""
    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg.get("user", "")
    port = cfg.get("port", 22)
    keepalive = cfg.get("server_alive_interval", 30)
    keepalive_max = cfg.get("server_alive_count_max", 6)

    target = f"{user}@{host}" if user else host

    return (
        f"ssh -tt"
        f" -p {port}"
        f" -o StrictHostKeyChecking=accept-new"
        f" -o ServerAliveInterval={keepalive}"
        f" -o ServerAliveCountMax={keepalive_max}"
        f" -o LogLevel=ERROR"
        f" -o ForwardAgent=yes"
        f" {target}"
    )


def _probe_with_pexpect(ssh_cmd: str, timeout: int) -> bool:
    """Spawn SSH via pexpect, proxy auth, wait for shell prompt.

    Returns True if a shell prompt was detected within timeout.
    Leaves the pexpect child alive (caller must handle cleanup).
    """
    import select
    import termios
    import tty
    import pexpect

    if not sys.stdin.isatty():
        click.echo(click.style("ERROR:", fg="red", bold=True) + " setup-cluster requires a TTY.")
        return False

    child = pexpect.spawn(ssh_cmd, encoding=None, timeout=timeout)

    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    child_fd = child.child_fd

    recent_output = b""
    user_sent_input = False
    last_output_time = time.monotonic()
    testing_message_shown = False

    try:
        tty.setraw(fd)
        start_time = time.monotonic()

        while (time.monotonic() - start_time) < timeout:
            try:
                rlist, _, _ = select.select([child_fd, fd], [], [], 1.0)
            except (ValueError, OSError):
                break

            if not rlist:
                # No activity — check if auth is done (3s silence after user input)
                if (
                    user_sent_input
                    and not testing_message_shown
                    and (time.monotonic() - last_output_time) >= 3.0
                ):
                    # Restore terminal to print message
                    termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                    click.echo(
                        "\n" + click.style(
                            "Authenticated. Testing connection mode "
                            "-- this may take up to 2 minutes...",
                            fg="yellow",
                        )
                    )
                    tty.setraw(fd)
                    testing_message_shown = True
                continue

            for ready_fd in rlist:
                if ready_fd == child_fd:
                    try:
                        data = os.read(child_fd, 4096)
                    except OSError:
                        child.terminate(force=True)
                        return False
                    if not data:
                        child.terminate(force=True)
                        return False
                    os.write(sys.stdout.fileno(), data)
                    recent_output += data
                    recent_output = recent_output[-512:]
                    last_output_time = time.monotonic()

                    for pattern in _PROMPT_PATTERNS:
                        if re.search(pattern, recent_output):
                            time.sleep(0.3)
                            # Prompt detected — SSH session works
                            child.terminate(force=True)
                            return True

                elif ready_fd == fd:
                    try:
                        data = os.read(fd, 4096)
                    except OSError:
                        break
                    if data:
                        os.write(child_fd, data)
                        user_sent_input = True

        # Timeout
        child.terminate(force=True)
        return False
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


@click.command("setup-cluster")
@click.argument("cluster")
def setup_cluster(cluster: str) -> None:
    """Probe and configure connection mode for CLUSTER.

    This is a one-time setup command. It tries ControlMaster first
    (the preferred mode). If the cluster doesn't support it, it
    automatically falls back to persistent daemon mode.

    After setup, use 'raca auth <cluster>' to reconnect.
    """
    # Validate cluster exists
    try:
        cfg = get_cluster(cluster)
    except KeyError as e:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {e}")
        raise SystemExit(1)

    # VPN check
    if cfg.get("vpn_required", False):
        if not _check_vpn():
            click.echo(
                click.style("WARNING:", fg="yellow", bold=True)
                + f" Cluster '{cluster}' requires VPN but no active utun interface was detected."
            )
            click.echo("  Start your VPN, then re-run this command.")
            raise SystemExit(1)
        else:
            click.echo(click.style("VPN OK", fg="green") + " — utun interface found.")

    # Check if already configured
    existing_mode = cfg.get("connection_mode")
    if existing_mode:
        click.echo(
            f"Cluster '{cluster}' already configured as "
            + click.style(existing_mode, fg="cyan", bold=True)
            + ". Re-probing..."
        )

    # ── Phase 1: Try ControlMaster ──────────────────────────────────
    click.echo(
        f"\n{click.style('Phase 1:', bold=True)} Testing ControlMaster mode for {cluster}..."
    )
    click.echo("You will be prompted to authenticate.\n")

    cm_cmd = _build_controlmaster_ssh_cmd(cfg, cluster)
    cm_success = _probe_with_pexpect(cm_cmd, timeout=_PROBE_TIMEOUT)

    if cm_success:
        # ControlMaster works — save and done
        cfg["connection_mode"] = "controlmaster"
        save_cluster(cluster, cfg)

        click.echo("")
        click.echo(click.style("Connection mode: controlmaster", fg="green", bold=True)
                    + " (session multiplexing supported)")
        click.echo(f"\nRun '{click.style(f'raca auth {cluster}', bold=True)}' from now on to reconnect.")
        return

    # ── Phase 2: Fall back to persistent ────────────────────────────
    click.echo("")
    click.echo(
        click.style(
            "This cluster doesn't support session multiplexing. "
            "Switching to persistent mode -- please authenticate again.",
            fg="yellow",
        )
    )
    click.echo(
        f"\n{click.style('Phase 2:', bold=True)} Testing persistent daemon mode..."
    )
    click.echo("You will be prompted to authenticate again.\n")

    # For persistent mode, we need to go through the full daemon startup
    from .persistent import PersistentSSHDaemon

    daemon = PersistentSSHDaemon(cfg, cluster)
    pd_success = daemon.start(timeout=_PROBE_TIMEOUT)

    if pd_success:
        cfg["connection_mode"] = "persistent"
        save_cluster(cluster, cfg)

        click.echo("")
        click.echo(click.style("Connection mode: persistent", fg="green", bold=True)
                    + " (daemon session)")
        click.echo(f"\nRun '{click.style(f'raca auth {cluster}', bold=True)}' from now on to reconnect.")
        return

    # Both failed
    click.echo("")
    click.echo(click.style("ERROR:", fg="red", bold=True)
               + f" Could not connect to {cluster} with either mode.")
    click.echo("Debug hints:")
    click.echo(f"  1. Check hostname: {cfg.get('host', '?')}")
    click.echo(f"  2. Check username: {cfg.get('user', '?')}")
    click.echo(f"  3. Check VPN (if required): vpn_required={cfg.get('vpn_required', False)}")
    click.echo(f"  4. Try manually: ssh {cfg.get('user', '')}@{cfg.get('host', '')}")
    raise SystemExit(1)
```

- [ ] **Step 2: Verify syntax**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -c "from raca.setup_cluster import setup_cluster; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/setup_cluster.py
git commit -m "feat: add raca setup-cluster probe command for auto-detecting connection mode"
```

---

### Task 6: Update `auth.py` for persistent mode

**Files:**
- Modify: `raca/auth.py`

- [ ] **Step 1: Update auth command to support persistent mode**

Replace the full content of `raca/auth.py`:

```python
from __future__ import annotations

import subprocess
import threading
import time

import click

from .config import get_cluster, get_connection_mode, get_session_paths, list_cluster_names
from .controlmaster import SSHSessionManager


def _check_vpn() -> bool:
    """Return True if any utun interface has an inet address (VPN active)."""
    try:
        result = subprocess.run(
            ["ifconfig"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        lines = result.stdout.splitlines()
        current_utun = False
        for line in lines:
            if line.startswith("utun"):
                current_utun = True
            elif line.startswith("\t") and current_utun:
                if "inet " in line:
                    return True
            else:
                if not line.startswith("\t"):
                    current_utun = False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def _vpn_required(cluster: str) -> bool:
    try:
        cfg = get_cluster(cluster)
        return bool(cfg.get("vpn_required", False))
    except KeyError:
        return False


def _keepalive_daemon(cluster: str, manager: SSHSessionManager, stop_event: threading.Event) -> None:
    while not stop_event.wait(30):
        healthy, msg = manager.health_check(cluster)
        if not healthy:
            click.echo(f"[raca daemon] {cluster}: socket unhealthy ({msg}), reconnecting…")
            try:
                result = manager.connect(cluster)
                if result.ok:
                    click.echo(f"[raca daemon] {cluster}: reconnected")
                else:
                    click.echo(f"[raca daemon] {cluster}: reconnect failed — {result.stderr.strip()}")
            except Exception as exc:
                click.echo(f"[raca daemon] {cluster}: reconnect error — {exc}")


@click.command()
@click.argument("cluster", required=False)
@click.option("--daemon", is_flag=True, default=False, help="Keep a background thread watching the socket.")
@click.option("--status", is_flag=True, default=False, help="Show connection status for all clusters.")
def auth(cluster: str | None, daemon: bool, status: bool) -> None:
    """Authenticate and open a session to CLUSTER.

    Use --status to show all cluster connection states without connecting.
    Use --daemon to keep a background keepalive thread running (controlmaster only).
    """
    manager = SSHSessionManager()

    if status:
        names = list_cluster_names()
        if not names:
            click.echo("No clusters configured. Add one with: raca cluster add <name> --host <host> --user <user>")
            return
        click.echo(f"{'CLUSTER':<20} {'STATUS':<12} {'MODE':<16} {'DETAIL'}")
        click.echo("-" * 70)
        for name in names:
            mode = get_connection_mode(name) or "not set"
            healthy, msg = manager.health_check(name)
            indicator = click.style("connected", fg="green") if healthy else click.style("disconnected", fg="red")
            click.echo(f"{name:<20} {indicator:<20} {mode:<16} {msg}")
        return

    if not cluster:
        raise click.UsageError("Provide a cluster name or use --status.")

    # Check connection_mode is set
    mode = get_connection_mode(cluster)
    if mode is None:
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Cluster '{cluster}' hasn't been set up yet."
        )
        click.echo(f"  Run: raca setup-cluster {cluster}")
        raise SystemExit(1)

    # VPN check
    if _vpn_required(cluster):
        vpn_up = _check_vpn()
        if not vpn_up:
            click.echo(
                click.style("WARNING:", fg="yellow", bold=True)
                + f" Cluster '{cluster}' requires VPN but no active utun interface was detected."
            )
            click.echo("  Start your VPN, then re-run this command.")
            raise SystemExit(1)
        else:
            click.echo(click.style("VPN OK", fg="green") + " — utun interface with inet address found.")

    # Health check — maybe already connected
    healthy, msg = manager.health_check(cluster)
    if healthy:
        click.echo(click.style(f"Already connected to {cluster}", fg="green") + f" ({msg})")
    else:
        click.echo(f"Connecting to {cluster} ({mode} mode)…")
        try:
            result = manager.connect(cluster)
        except Exception as exc:
            click.echo(click.style("ERROR:", fg="red", bold=True) + f" {exc}")
            raise SystemExit(1)

        if result.ok:
            click.echo(click.style(f"Connected to {cluster}", fg="green") + f" (took {result.duration_s:.1f}s)")
        else:
            click.echo(click.style("Connection failed:", fg="red", bold=True))
            if result.stderr:
                click.echo(f"  {result.stderr.strip()}")
            raise SystemExit(result.returncode)

    # Daemon keepalive (controlmaster only — persistent has its own heartbeat)
    if daemon:
        if mode == "persistent":
            click.echo(
                click.style("NOTE:", fg="yellow")
                + " --daemon is not needed for persistent mode (built-in heartbeat)."
            )
            return

        click.echo(f"Starting keepalive daemon for {cluster}… (Ctrl-C to stop)")
        stop_event = threading.Event()
        t = threading.Thread(
            target=_keepalive_daemon,
            args=(cluster, manager, stop_event),
            daemon=True,
        )
        t.start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            click.echo(f"\nStopping daemon for {cluster}.")
            stop_event.set()
            t.join(timeout=5)
```

- [ ] **Step 2: Verify syntax**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -c "from raca.auth import auth; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/auth.py
git commit -m "feat: update raca auth to support persistent mode and gate unset connection_mode"
```

---

### Task 7: Update `disconnect.py` for persistent mode

**Files:**
- Modify: `raca/disconnect.py`

- [ ] **Step 1: Update disconnect command**

Replace the full content of `raca/disconnect.py`:

```python
from __future__ import annotations

import sys

import click

from .controlmaster import SSHSessionManager


@click.command()
@click.argument("cluster")
def disconnect(cluster: str) -> None:
    """Close the SSH session for CLUSTER (ControlMaster or persistent daemon)."""
    manager = SSHSessionManager()

    if not manager.is_connected(cluster):
        click.echo(f"Not connected to {cluster}.")
        return

    result = manager.disconnect(cluster)
    if result.ok:
        click.echo(click.style(f"Disconnected from {cluster}.", fg="green"))
    else:
        click.echo(
            click.style("Disconnect failed:", fg="yellow", bold=True)
            + f" {result.stderr.strip() or 'unknown error'}"
        )
        sys.exit(result.returncode)
```

- [ ] **Step 2: Verify syntax**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -c "from raca.disconnect import disconnect; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/disconnect.py
git commit -m "feat: update disconnect to handle both controlmaster and persistent modes"
```

---

### Task 8: Add error guards to `upload.py`, `download.py`, `forward.py`

**Files:**
- Modify: `raca/upload.py`
- Modify: `raca/download.py`
- Modify: `raca/forward.py`
- Create: `raca/tests/test_cli_guards.py`

- [ ] **Step 1: Write failing tests for upload/download guards**

Create `raca/tests/test_cli_guards.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_cli_guards.py -v
```

Expected: FAIL — upload/download don't catch the NotImplementedError yet.

- [ ] **Step 3: Update upload.py to catch NotImplementedError**

Replace the full content of `raca/upload.py`:

```python
from __future__ import annotations

import sys

import click

from .controlmaster import SSHSessionManager


@click.command()
@click.argument("cluster")
@click.argument("local_path")
@click.argument("remote_path")
def upload(cluster: str, local_path: str, remote_path: str) -> None:
    """Upload LOCAL_PATH to REMOTE_PATH on CLUSTER via rsync."""
    manager = SSHSessionManager()

    healthy, msg = manager.health_check(cluster)
    if not healthy:
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Not connected to {cluster}. Run: raca auth {cluster}",
            err=True,
        )
        sys.exit(1)

    try:
        click.echo(f"Uploading {local_path} → {cluster}:{remote_path}…")
        result = manager.upload(cluster, local_path, remote_path)
    except NotImplementedError as e:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {e}")
        sys.exit(1)

    if result.stdout:
        click.echo(result.stdout, nl=False)
    if result.stderr:
        click.echo(result.stderr, nl=False, err=True)

    if result.ok:
        click.echo(click.style("Upload complete.", fg="green") + f" ({result.duration_s:.1f}s)")
    else:
        click.echo(click.style("Upload failed.", fg="red", bold=True))
        sys.exit(result.returncode)
```

- [ ] **Step 4: Update download.py to catch NotImplementedError**

Replace the full content of `raca/download.py`:

```python
from __future__ import annotations

import sys

import click

from .controlmaster import SSHSessionManager


@click.command()
@click.argument("cluster")
@click.argument("remote_path")
@click.argument("local_path")
def download(cluster: str, remote_path: str, local_path: str) -> None:
    """Download REMOTE_PATH from CLUSTER to LOCAL_PATH via rsync."""
    manager = SSHSessionManager()

    healthy, msg = manager.health_check(cluster)
    if not healthy:
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Not connected to {cluster}. Run: raca auth {cluster}",
            err=True,
        )
        sys.exit(1)

    try:
        click.echo(f"Downloading {cluster}:{remote_path} → {local_path}…")
        result = manager.download(cluster, remote_path, local_path)
    except NotImplementedError as e:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {e}")
        sys.exit(1)

    if result.stdout:
        click.echo(result.stdout, nl=False)
    if result.stderr:
        click.echo(result.stderr, nl=False, err=True)

    if result.ok:
        click.echo(click.style("Download complete.", fg="green") + f" ({result.duration_s:.1f}s)")
    else:
        click.echo(click.style("Download failed.", fg="red", bold=True))
        sys.exit(result.returncode)
```

- [ ] **Step 5: Update forward.py to guard persistent clusters**

In `raca/forward.py`, add a persistent-mode guard at the start of the forward function body, right after the `--list` and `--kill` handling and the argument validation, before the SSH forward logic. Add this block after line 107 (`cfg = get_cluster(cluster)`):

```python
    # Check connection mode — port forwarding requires ControlMaster
    from .config import get_connection_mode
    mode = get_connection_mode(cluster)
    if mode == "persistent":
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Port forwarding not supported for persistent-mode clusters."
            + f" Use: raca ssh {cluster} 'ssh -L {local_port}:{remote} localhost' instead"
        )
        sys.exit(1)
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/test_cli_guards.py -v
```

Expected: all 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/upload.py tools/cli/raca/download.py tools/cli/raca/forward.py tools/cli/raca/tests/test_cli_guards.py
git commit -m "feat: add persistent-mode error guards to upload, download, and forward commands"
```

---

### Task 9: Register `setup-cluster` in CLI and bump version

**Files:**
- Modify: `raca/cli.py`
- Modify: `raca/__init__.py`

- [ ] **Step 1: Register setup-cluster command in cli.py**

Replace the full content of `raca/cli.py`:

```python
from __future__ import annotations

import click

from . import __version__


@click.group()
@click.version_option(__version__, prog_name="raca")
def main() -> None:
    """RACA — SSH lifecycle for research clusters."""


# Register subcommands
from .auth import auth  # noqa: E402
from .ssh import ssh  # noqa: E402
from .disconnect import disconnect  # noqa: E402
from .upload import upload  # noqa: E402
from .download import download  # noqa: E402
from .forward import forward  # noqa: E402
from .cluster import cluster  # noqa: E402
from .setup_cluster import setup_cluster  # noqa: E402

main.add_command(auth)
main.add_command(ssh)
main.add_command(disconnect)
main.add_command(upload)
main.add_command(download)
main.add_command(forward)
main.add_command(cluster)
main.add_command(setup_cluster)
```

- [ ] **Step 2: Bump version**

In `raca/__init__.py`:

```python
"""RACA — SSH lifecycle for research clusters."""
__version__ = "0.2.0"
```

- [ ] **Step 3: Verify CLI registration**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m raca.cli --help
```

Expected: output includes `setup-cluster` in the commands list.

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m raca.cli setup-cluster --help
```

Expected: shows help for setup-cluster command.

- [ ] **Step 4: Commit**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add tools/cli/raca/cli.py tools/cli/raca/__init__.py
git commit -m "feat: register setup-cluster command and bump to v0.2.0"
```

---

### Task 10: Run full test suite and verify

**Files:** (no new files)

- [ ] **Step 1: Run all tests**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m pytest raca/tests/ -v
```

Expected: all tests PASS (config tests, parsing tests, dispatch tests, CLI guard tests).

- [ ] **Step 2: Verify CLI end-to-end (no cluster needed)**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -m raca.cli --version
python -m raca.cli --help
python -m raca.cli setup-cluster --help
python -m raca.cli auth --help
```

Expected: all print correct help/version text, `setup-cluster` appears in help.

- [ ] **Step 3: Verify import chain has no circular imports**

Run:
```bash
cd /Users/rs2020/Blog/Dr-Claude-Code/tools/cli && python -c "
from raca.cli import main
from raca.controlmaster import SSHSessionManager
from raca.persistent import PersistentSSHDaemon, send_command, is_daemon_running, stop_daemon
from raca.setup_cluster import setup_cluster
from raca.config import get_connection_mode, get_session_paths
print('All imports OK')
"
```

Expected: `All imports OK`

- [ ] **Step 4: Final commit with all tests passing**

```bash
cd /Users/rs2020/Blog/Dr-Claude-Code && git add -A && git status
```

If there are any unstaged changes, add and commit:
```bash
git commit -m "chore: verify full test suite passes for persistent SSH daemon support"
```
