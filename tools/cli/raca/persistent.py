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

logger = logging.getLogger(__name__)

SENTINEL_PREFIX = "__RACA_"
# Seconds between shell heartbeats to prevent HPC idle-session killers.
# TACC kills shells inactive for ~3 minutes; 30s gives wide margin.
HEARTBEAT_INTERVAL = 30


# ─── Module-Level Functions ──────────────────────────────────────────────────


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
        # Move past the start marker line
        after_start = raw[start_idx + len(start_marker):]
        # Strip leading newline(s)
        after_start = after_start.lstrip("\r\n")
    else:
        after_start = raw

    # Find end marker
    end_match = end_marker_pattern.search(after_start)
    if end_match:
        stdout = after_start[:end_match.start()]
        returncode = int(end_match.group(1))
    else:
        # No end marker found — return what we have with rc=-1
        stdout = after_start
        returncode = -1

    # Clean up the output
    stdout = stdout.replace("\r\n", "\n")
    stdout = stdout.strip("\r\n")

    return stdout, returncode


# ─── Client Functions ────────────────────────────────────────────────────────


def is_daemon_running(pid_path: Path, socket_path: Path) -> bool:
    """Check if the persistent SSH daemon is running.

    Verifies both the PID file (process alive) and socket file exist.
    Cleans up stale PID/socket files if the process is dead.

    Args:
        pid_path: Path to the daemon's PID file.
        socket_path: Path to the daemon's Unix domain socket.

    Returns:
        True if the daemon process is alive and the socket exists.
    """
    if not pid_path.exists():
        return False

    try:
        pid = int(pid_path.read_text().strip())
    except (ValueError, OSError):
        # Corrupt PID file
        pid_path.unlink(missing_ok=True)
        return False

    # Check if the process is alive
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        # Process is dead — clean up stale files
        pid_path.unlink(missing_ok=True)
        socket_path.unlink(missing_ok=True)
        return False
    except PermissionError:
        # Process exists but we can't signal it (different user)
        # Still counts as "running"
        pass

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

    Args:
        socket_path: Path to the daemon's Unix domain socket.
        command: Shell command to execute (or __SHUTDOWN__ / __PING__).
        timeout: Max seconds for command execution.

    Returns:
        Dict with keys: stdout, stderr, returncode, duration_s.
        On socket errors, returns a dict with error info and returncode=-1.
    """
    request = {"command": command, "timeout": timeout}

    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(timeout + 10)  # Extra time for network overhead
        sock.connect(str(socket_path))

        sock.sendall((json.dumps(request) + "\n").encode())

        # Read response
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

    Attempts a graceful shutdown via the socket first (__SHUTDOWN__ command),
    then falls back to SIGTERM if the process is still alive.

    Args:
        pid_path: Path to the daemon's PID file.
        socket_path: Path to the daemon's Unix domain socket.

    Returns:
        True if the daemon was stopped (or was already stopped).
    """
    if not is_daemon_running(pid_path, socket_path):
        # Already stopped
        return True

    # Try graceful shutdown via socket
    if socket_path.exists():
        try:
            result = send_command(socket_path, "__SHUTDOWN__", timeout=5)
            if result.get("status") == "shutting_down":
                # Give it a moment to clean up
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
            # Wait for process to exit
            for _ in range(20):  # 2 seconds
                try:
                    os.kill(pid, 0)
                    time.sleep(0.1)
                except ProcessLookupError:
                    break
        except (ValueError, ProcessLookupError, PermissionError):
            pass

    # Clean up files
    pid_path.unlink(missing_ok=True)
    socket_path.unlink(missing_ok=True)

    return True


# ─── Internal Exception ─────────────────────────────────────────────────────


class _ShutdownRequested(Exception):
    """Internal signal that a __SHUTDOWN__ command was received."""


# ─── Daemon Class ────────────────────────────────────────────────────────────


class PersistentSSHDaemon:
    """Manages a persistent interactive SSH session as a background daemon.

    For clusters where ControlMaster is not supported, this class:
    - Spawns SSH via pexpect
    - Proxies interactive auth to the user's terminal
    - Double-forks a daemon that holds the session
    - Serves command execution requests over a Unix domain socket
    """

    # Shell prompt patterns (bytes) for detecting successful authentication
    PROMPT_PATTERNS = [
        rb'[\$%#>]\s*$',       # common prompts: $, %, #, >
        rb'\)\$\s*$',          # (env)$
        rb'\]\$\s*$',          # [user@host ~]$
        rb'\]%\s*$',           # [user@host ~]%
        rb'\]#\s*$',           # [user@host ~]# (root)
    ]

    def __init__(self, cluster_config: dict, cluster_name: str) -> None:
        self.config = cluster_config
        self.cluster_name = cluster_name
        self.host = cluster_config.get("host", "")
        self.user = cluster_config.get("user", "")
        self.port = cluster_config.get("port", 22)
        self.child = None  # pexpect spawn, set during start()
        self._daemonized = False  # True after double-fork (can't use waitpid)

    def _is_ssh_alive(self) -> bool:
        """Check if the SSH child process is still alive.

        After daemonizing (double-fork + setsid), pexpect's isalive() fails
        because os.waitpid() only works for direct child processes. The daemon
        grandchild is NOT the parent of the SSH process, so we use os.kill(pid, 0).
        """
        if self.child is None:
            return False

        if not self._daemonized:
            # Pre-fork: pexpect owns the child, use its method
            return self.child.isalive()

        # Post-fork: use os.kill signal-zero probe
        try:
            os.kill(self.child.pid, 0)
            return True
        except (ProcessLookupError, OSError):
            return False

    def start(self, timeout: int = 120) -> bool:
        """Spawn an SSH session, authenticate interactively, then daemonize.

        Args:
            timeout: Max seconds to wait for authentication to complete.

        Returns:
            True if daemon was started successfully.
        """
        import pexpect

        server_alive_interval = self.config.get("server_alive_interval", 15)
        server_alive_count_max = self.config.get("server_alive_count_max", 3)

        ssh_cmd = (
            f"ssh -tt"
            f" -o StrictHostKeyChecking=no"
            f" -o UserKnownHostsFile=/dev/null"
            f" -o LogLevel=ERROR"
            f" -o ServerAliveInterval={server_alive_interval}"
            f" -o ServerAliveCountMax={server_alive_count_max}"
            f" -o ForwardAgent=yes"
            f" -p {self.port}"
            f" {self.user}@{self.host}"
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
        """Proxy SSH's PTY to the user's terminal for interactive authentication.

        Uses raw terminal mode and select() to shuttle bytes between the SSH
        child process and stdin/stdout until a shell prompt is detected.

        Args:
            timeout: Max seconds to wait for a shell prompt.

        Returns:
            True if a shell prompt was detected (auth succeeded).
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

        # Buffer of recent output for prompt detection
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
                        # Data from SSH -> user's terminal
                        try:
                            data = os.read(child_fd, 4096)
                        except OSError:
                            return False
                        if not data:
                            return False
                        os.write(sys.stdout.fileno(), data)
                        recent_output += data
                        # Keep only last 512 bytes for prompt matching
                        recent_output = recent_output[-512:]

                        # Check for shell prompt
                        for pattern in self.PROMPT_PATTERNS:
                            if re.search(pattern, recent_output):
                                # Give the shell a moment to settle
                                time.sleep(0.3)
                                return True

                    elif ready_fd == fd:
                        # Data from user -> SSH
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

        The parent process waits up to 5 seconds for the PID file to appear,
        confirming the daemon started successfully.

        Returns:
            True (in the parent) if the daemon started.
        """
        from raca.config import get_session_paths

        socket_path, pid_path = get_session_paths(self.cluster_name)

        # Ensure socket directory exists
        socket_path.parent.mkdir(parents=True, exist_ok=True)

        # Stop any existing daemon before starting a new one.
        if is_daemon_running(pid_path, socket_path):
            logger.info("Stopping existing daemon before starting new one")
            stop_daemon(pid_path, socket_path)
        else:
            # Clean up stale files (no running daemon)
            if socket_path.exists():
                try:
                    socket_path.unlink()
                except OSError:
                    pass
            if pid_path.exists():
                try:
                    pid_path.unlink()
                except OSError:
                    pass

        # First fork
        pid = os.fork()
        if pid > 0:
            # Parent: wait for PID file to confirm daemon is running
            for _ in range(50):  # 50 * 0.1s = 5s
                if pid_path.exists():
                    logger.info("Daemon started (PID file: %s)", pid_path)
                    # Fully detach pexpect so its __del__ doesn't kill SSH
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

        # First child: create new session
        os.setsid()

        # Second fork
        pid = os.fork()
        if pid > 0:
            # First child exits immediately
            os._exit(0)

        # Grandchild: this is the daemon
        try:
            # Save the PTY master fd before redirecting stdio
            child_fd = self.child.child_fd

            # Redirect stdio to /dev/null, but protect the PTY fd
            devnull = os.open(os.devnull, os.O_RDWR)
            for target_fd in (0, 1, 2):
                if target_fd != child_fd:
                    os.dup2(devnull, target_fd)
            os.close(devnull)

            # Write PID file
            daemon_pid = os.getpid()
            pid_path.write_text(str(daemon_pid))

            self._daemonized = True

            # Set up daemon log file for post-mortem debugging
            log_path = socket_path.parent / f"{self.cluster_name}-daemon.log"
            file_handler = logging.FileHandler(str(log_path))
            file_handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(message)s")
            )
            logger.addHandler(file_handler)
            logger.setLevel(logging.INFO)
            logger.info(
                "Daemon started: pid=%d ssh_pid=%d cluster=%s heartbeat=%ds",
                daemon_pid, self.child.pid, self.cluster_name, HEARTBEAT_INTERVAL,
            )

            # Install signal handlers for cleanup
            def _cleanup(signum=None, frame=None):
                logger.info("Cleanup called: signal=%s ssh_alive=%s",
                            signum, self._is_ssh_alive())
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
        """Run a Unix domain socket server accepting command requests.

        Loops forever, accepting JSON-line requests on the socket and
        dispatching them. Exits on __SHUTDOWN__ command or SSH death.

        Args:
            socket_path: Path to bind the Unix domain socket.
        """
        self._last_heartbeat = time.monotonic()

        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            server.bind(str(socket_path))
            server.listen(5)
            server.settimeout(5.0)  # Allows periodic health checks

            logger.info("Daemon listening on %s", socket_path)

            while True:
                # Periodic SSH health check
                if not self._is_ssh_alive():
                    logger.warning("SSH child process died, shutting down daemon")
                    break

                # Shell-level heartbeat to prevent idle timeout
                self._send_heartbeat_if_due()

                try:
                    conn, _ = server.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break

                self._last_heartbeat = time.monotonic()  # client command = activity

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
        """Handle a single client connection on the daemon socket."""
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

        # Special commands
        if command == "__SHUTDOWN__":
            response = {"status": "shutting_down"}
            conn.sendall((json.dumps(response) + "\n").encode())
            raise _ShutdownRequested()

        if command == "__PING__":
            alive = self._is_ssh_alive()
            response = {"status": "alive" if alive else "dead"}
            conn.sendall((json.dumps(response) + "\n").encode())
            return

        # Regular command execution
        logger.info("Executing: %s (timeout=%ds)", command[:80], timeout)
        result = self._execute_command(command, timeout)
        logger.info("Result: rc=%s duration=%.1fs",
                     result.get("returncode"), result.get("duration_s", 0))
        conn.sendall((json.dumps(result) + "\n").encode())

    def _send_heartbeat_if_due(self) -> None:
        """Send a shell heartbeat if enough time has elapsed since the last one.

        Writes ` true\\n` to the PTY -- a no-op command that counts as shell
        activity and prevents HPC idle-session killers (e.g. TACC) from
        disconnecting.
        """
        now = time.monotonic()
        gap = now - self._last_heartbeat
        if gap >= HEARTBEAT_INTERVAL:
            try:
                os.write(self.child.child_fd, b" true\n")
                self._last_heartbeat = now
                logger.info("Heartbeat sent (%.0fs since last activity)", gap)
            except OSError as e:
                logger.warning("Heartbeat write failed: %s", e)

    def _execute_command(self, command: str, timeout: int = 300) -> dict:
        """Execute a command on the remote shell using sentinel markers.

        Uses raw fd I/O instead of pexpect's expect/sendline, because
        pexpect internally calls os.waitpid() which fails in the daemon
        (we're not the SSH process's parent after double-fork).

        Args:
            command: Shell command to execute.
            timeout: Max seconds to wait for command completion.

        Returns:
            Dict with keys: stdout, stderr, returncode, duration_s
        """
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

        # Send command wrapped in sentinels.
        sentinel_cmd = (
            f"__old_ps1=\"$PS1\"; PS1=''; stty -echo 2>/dev/null\n"
            f"printf '%s\\n' '{start_marker}'\n"
            f"{command}\n"
            f"__raca_rc=$?\n"
            f"printf '%s\\n' '{end_marker_prefix}'\"$__raca_rc\"\n"
            f"PS1=\"$__old_ps1\"; stty echo 2>/dev/null\n"
        )

        start_time = time.monotonic()

        try:
            os.write(child_fd, sentinel_cmd.encode())

            # Read output until end sentinel appears
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
                    # Check if SSH is still alive during long waits
                    if not self._is_ssh_alive():
                        logger.warning("SSH died during command (elapsed=%.0fs): %s",
                                       time.monotonic() - start_time, command[:80])
                        return {
                            "stdout": "",
                            "stderr": "SSH session died during command execution",
                            "returncode": -1,
                            "duration_s": round(time.monotonic() - start_time, 3),
                        }
                    # Send heartbeat to prevent HPC idle-session killer
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
                    # Prefer RC from the end sentinel match
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
            duration = time.monotonic() - start_time
            return {
                "stdout": "",
                "stderr": f"Command execution error: {e}",
                "returncode": -1,
                "duration_s": round(duration, 3),
            }
