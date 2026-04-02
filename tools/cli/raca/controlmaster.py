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
        """Check if a cluster uses persistent daemon mode."""
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
        if self._is_persistent(cluster):
            from . import persistent
            socket_path, pid_path = get_session_paths(cluster)
            return persistent.is_daemon_running(pid_path, socket_path)
        return self._socket_path(cluster).exists()

    def health_check(self, cluster: str) -> tuple[bool, str]:
        """Returns (healthy, message). Dispatches to the appropriate backend."""
        if self._is_persistent(cluster):
            return self._health_check_persistent(cluster)
        return self._health_check_controlmaster(cluster)

    def _health_check_controlmaster(self, cluster: str) -> tuple[bool, str]:
        """ControlMaster health check via ssh -O check.

        If ssh -O check times out the socket is considered BUSY (VPN lag),
        not dead. Socket is only removed on a confirmed non-zero exit.
        """
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
            # Confirmed dead — clean up socket
            try:
                socket.unlink(missing_ok=True)
            except OSError:
                pass
            return False, result.stderr.strip() or "check failed"
        except subprocess.TimeoutExpired:
            # Timeout means the socket exists but ssh is blocked (VPN lag).
            # Do NOT delete the socket.
            return True, "busy (timeout on check — VPN lag suspected)"

    def _health_check_persistent(self, cluster: str) -> tuple[bool, str]:
        """Persistent daemon health check via is_daemon_running + __PING__."""
        from . import persistent

        socket_path, pid_path = get_session_paths(cluster)

        if not persistent.is_daemon_running(pid_path, socket_path):
            return False, "daemon not running"

        # Daemon process is alive — verify the SSH session with a ping
        result = persistent.send_command(socket_path, "__PING__", timeout=10)
        status = result.get("status", "")
        if status == "alive":
            return True, "healthy (persistent daemon)"
        return False, f"daemon running but SSH not responsive: {status}"

    def connect(self, cluster: str, timeout: int = 120) -> RemoteResult:
        """Connect to a cluster. Dispatches to the appropriate backend."""
        if self._is_persistent(cluster):
            return self._connect_persistent(cluster, timeout)
        return self._connect_controlmaster(cluster, timeout)

    def _connect_controlmaster(self, cluster: str, timeout: int = 120) -> RemoteResult:
        """Establish a ControlMaster SSH connection."""
        cfg = self._cluster_cfg(cluster)
        uses_2fa = cfg.get("uses_2fa", False) or cfg.get("two_factor", False)
        args = self._base_ssh_args(cluster)
        host = args[-1]

        start = time.monotonic()

        if uses_2fa:
            # 2FA needs an interactive terminal — run foreground SSH that
            # establishes the ControlMaster, then exits cleanly.
            # The ControlPersist setting keeps the socket alive after this exits.
            interactive_args = args[:-1] + [host, "echo 'Auth OK'"]
            result = subprocess.run(
                interactive_args,
                timeout=timeout,
            )
        else:
            # No 2FA — background immediately with -f
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

    def _connect_persistent(self, cluster: str, timeout: int = 120) -> RemoteResult:
        """Start a persistent SSH daemon for the cluster."""
        from .persistent import PersistentSSHDaemon

        cfg = self._cluster_cfg(cluster)
        start = time.monotonic()

        daemon = PersistentSSHDaemon(cfg, cluster)
        success = daemon.start(timeout=timeout)
        duration = time.monotonic() - start

        if success:
            return RemoteResult(
                stdout="Persistent SSH daemon started",
                stderr="",
                returncode=0,
                cluster=cluster,
                command="connect (persistent)",
                duration_s=duration,
            )
        return RemoteResult(
            stdout="",
            stderr="Failed to start persistent SSH daemon",
            returncode=1,
            cluster=cluster,
            command="connect (persistent)",
            duration_s=duration,
        )

    def disconnect(self, cluster: str) -> RemoteResult:
        """Disconnect from a cluster. Dispatches to the appropriate backend."""
        if self._is_persistent(cluster):
            return self._disconnect_persistent(cluster)
        return self._disconnect_controlmaster(cluster)

    def _disconnect_controlmaster(self, cluster: str) -> RemoteResult:
        """Tear down a ControlMaster SSH connection."""
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
        """Stop the persistent SSH daemon for the cluster."""
        from . import persistent

        socket_path, pid_path = get_session_paths(cluster)
        start = time.monotonic()

        success = persistent.stop_daemon(pid_path, socket_path)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout="Daemon stopped" if success else "",
            stderr="" if success else "Failed to stop daemon",
            returncode=0 if success else 1,
            cluster=cluster,
            command="disconnect (persistent)",
            duration_s=duration,
        )

    # ------------------------------------------------------------------
    # Command execution & file transfer
    # ------------------------------------------------------------------

    def run(self, cluster: str, command: str, timeout: int = 300) -> RemoteResult:
        """Run a command on a cluster. Dispatches to the appropriate backend."""
        if self._is_persistent(cluster):
            return self._run_persistent(cluster, command, timeout)
        return self._run_controlmaster(cluster, command, timeout)

    def _run_controlmaster(self, cluster: str, command: str, timeout: int = 300) -> RemoteResult:
        """Run a command via ControlMaster SSH."""
        args = self._base_ssh_args(cluster)
        # Replace ControlMaster=auto with ControlMaster=no for slave sessions
        # so we reuse the master without spawning a new one
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

    def _run_persistent(self, cluster: str, command: str, timeout: int = 300) -> RemoteResult:
        """Run a command via the persistent SSH daemon."""
        from . import persistent

        # Verify daemon is healthy before sending command
        healthy, msg = self.health_check(cluster)
        if not healthy:
            return RemoteResult(
                stdout="",
                stderr=f"Persistent session not connected: {msg}",
                returncode=-1,
                cluster=cluster,
                command=command,
                duration_s=0.0,
            )

        socket_path, _ = get_session_paths(cluster)
        start = time.monotonic()
        result = persistent.send_command(socket_path, command, timeout=timeout)
        duration = time.monotonic() - start

        return RemoteResult(
            stdout=result.get("stdout", ""),
            stderr=result.get("stderr", ""),
            returncode=result.get("returncode", -1),
            cluster=cluster,
            command=command,
            duration_s=result.get("duration_s", duration),
        )

    def upload(self, cluster: str, local_path: str, remote_path: str) -> RemoteResult:
        """Upload a file/directory via rsync. Not supported for persistent clusters."""
        if self._is_persistent(cluster):
            raise NotImplementedError(
                f"File transfer is not supported for persistent SSH sessions. "
                f"Cluster '{cluster}' uses connection_mode=persistent."
            )
        return self._upload_controlmaster(cluster, local_path, remote_path)

    def _upload_controlmaster(self, cluster: str, local_path: str, remote_path: str) -> RemoteResult:
        """Upload via rsync over a ControlMaster socket."""
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
        """Download a file/directory via rsync. Not supported for persistent clusters."""
        if self._is_persistent(cluster):
            raise NotImplementedError(
                f"File transfer is not supported for persistent SSH sessions. "
                f"Cluster '{cluster}' uses connection_mode=persistent."
            )
        return self._download_controlmaster(cluster, remote_path, local_path)

    def _download_controlmaster(self, cluster: str, remote_path: str, local_path: str) -> RemoteResult:
        """Download via rsync over a ControlMaster socket."""
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
