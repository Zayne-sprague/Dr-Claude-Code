from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import get_cluster, load_clusters


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

    def _socket_path(self, cluster: str) -> Path:
        cfg = self._cluster_cfg(cluster)
        user = cfg.get("user", "")
        label = f"{user}@{cluster}" if user else cluster
        return self.SOCKET_DIR / label

    def _base_ssh_args(self, cluster: str) -> list[str]:
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host", cluster)
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
        return self._socket_path(cluster).exists()

    def health_check(self, cluster: str) -> tuple[bool, str]:
        """Returns (healthy, message).

        If ssh -O check times out the socket is considered BUSY (VPN lag),
        not dead. Socket is only removed on a confirmed non-zero exit.
        """
        socket = self._socket_path(cluster)
        if not socket.exists():
            return False, "no socket"

        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host", cluster)
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

    def connect(self, cluster: str, timeout: int = 120) -> RemoteResult:
        args = self._base_ssh_args(cluster)
        # Insert -f flag before the host (last element)
        host = args[-1]
        args = args[:-1] + ["-f", host, "while true; do sleep 30; done"]

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
            command="connect",
            duration_s=duration,
        )

    def disconnect(self, cluster: str) -> RemoteResult:
        socket = self._socket_path(cluster)
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host", cluster)
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

    # ------------------------------------------------------------------
    # Command execution & file transfer
    # ------------------------------------------------------------------

    def run(self, cluster: str, command: str, timeout: int = 300) -> RemoteResult:
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

    def upload(self, cluster: str, local_path: str, remote_path: str) -> RemoteResult:
        socket = str(self._socket_path(cluster))
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host", cluster)
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
        socket = str(self._socket_path(cluster))
        cfg = self._cluster_cfg(cluster)
        host = cfg.get("host", cluster)
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
