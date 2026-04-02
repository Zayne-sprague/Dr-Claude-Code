"""Probe command to auto-detect the best SSH connection mode for a cluster.

Tries ControlMaster first (preferred — enables session multiplexing),
falls back to persistent daemon mode if ControlMaster fails.
"""

from __future__ import annotations

import os
import re
import sys
import time

import click

from .config import check_vpn, get_cluster, save_cluster
from .persistent import PROMPT_PATTERNS as _PROMPT_PATTERNS

_PROBE_TIMEOUT = 120  # seconds
_SILENCE_THRESHOLD = 3  # seconds of silence after user input = auth done


def _build_controlmaster_cmd(cfg: dict, cluster: str) -> str:
    """Build the SSH command string for ControlMaster mode."""
    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg["user"]
    port = cfg.get("port", 22)
    keepalive = cfg.get("server_alive_interval", 15)
    keepalive_max = cfg.get("server_alive_count_max", 3)

    socket_dir = os.path.expanduser("~/.ssh/sockets")
    os.makedirs(socket_dir, exist_ok=True)

    return (
        f"ssh -tt"
        f" -p {port}"
        f" -o ControlMaster=auto"
        f" -o ControlPath={socket_dir}/{user}@{cluster}"
        f" -o ControlPersist=4h"
        f" -o ServerAliveInterval={keepalive}"
        f" -o ServerAliveCountMax={keepalive_max}"
        f" -o StrictHostKeyChecking=accept-new"
        f" {user}@{host}"
    )


def _build_persistent_cmd(cfg: dict, cluster: str) -> str:
    """Build the SSH command string for persistent (non-ControlMaster) mode."""
    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg["user"]
    port = cfg.get("port", 22)
    keepalive = cfg.get("server_alive_interval", 15)
    keepalive_max = cfg.get("server_alive_count_max", 3)

    return (
        f"ssh -tt"
        f" -p {port}"
        f" -o StrictHostKeyChecking=accept-new"
        f" -o ServerAliveInterval={keepalive}"
        f" -o ServerAliveCountMax={keepalive_max}"
        f" -o LogLevel=ERROR"
        f" -o ForwardAgent=yes"
        f" {user}@{host}"
    )


def _probe_with_pexpect(ssh_cmd: str, timeout: int = _PROBE_TIMEOUT):
    """Spawn SSH, proxy interactive auth, and detect a shell prompt.

    Returns the pexpect child process on success (caller must clean up),
    or None if auth/prompt detection failed.

    The child is returned ALIVE so the caller can run further tests
    (e.g. ControlMaster slave verification) while the session holds
    the socket open. The caller is responsible for calling
    child.terminate() when done.
    """
    import select
    import termios
    import tty

    import pexpect

    if not sys.stdin.isatty():
        click.echo(click.style("ERROR:", fg="red", bold=True) + " Cannot probe without a TTY.")
        return None

    child = pexpect.spawn(ssh_cmd, encoding=None, timeout=timeout)
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    child_fd = child.child_fd

    recent_output = b""
    user_sent_input = False
    last_output_time = time.monotonic()
    testing_message_shown = False
    in_raw_mode = False

    try:
        tty.setraw(fd)
        in_raw_mode = True
        start_time = time.monotonic()

        while (time.monotonic() - start_time) < timeout:
            try:
                rlist, _, _ = select.select([child_fd, fd], [], [], 0.5)
            except (ValueError, OSError):
                break

            now = time.monotonic()

            if (
                user_sent_input
                and not testing_message_shown
                and (now - last_output_time) >= _SILENCE_THRESHOLD
            ):
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                in_raw_mode = False
                click.echo()
                click.echo(
                    click.style("\nAuthenticated.", fg="green")
                    + " Testing connection mode -- this may take up to 2 minutes..."
                )
                testing_message_shown = True
                tty.setraw(fd)
                in_raw_mode = True

            for ready_fd in rlist:
                if ready_fd == child_fd:
                    try:
                        data = os.read(child_fd, 4096)
                    except OSError:
                        child.terminate(force=True)
                        return None
                    if not data:
                        child.terminate(force=True)
                        return None

                    os.write(sys.stdout.fileno(), data)
                    last_output_time = time.monotonic()
                    recent_output += data
                    recent_output = recent_output[-512:]

                    for pattern in _PROMPT_PATTERNS:
                        if re.search(pattern, recent_output):
                            time.sleep(0.3)
                            # Return child ALIVE — caller handles cleanup
                            return child

                elif ready_fd == fd:
                    try:
                        data = os.read(fd, 4096)
                    except OSError:
                        break
                    if data:
                        os.write(child_fd, data)
                        user_sent_input = True

        # Timeout — kill and return None
        child.terminate(force=True)
        return None
    finally:
        if in_raw_mode:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def _test_controlmaster_slave(cfg: dict, cluster: str, timeout: int = 10) -> bool:
    """Test whether a slave connection through the ControlMaster socket works.

    Runs `echo __RACA_PROBE_OK` via a slave SSH (ControlMaster=no) and checks
    if it returns within the timeout. If the cluster doesn't support multiplexing,
    this will hang until the timeout expires.
    """
    import subprocess

    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg.get("user", "")
    port = cfg.get("port", 22)
    socket_dir = os.path.expanduser("~/.ssh/sockets")
    socket_path = f"{socket_dir}/{user}@{cluster}"

    cmd = [
        "ssh",
        "-o", f"ControlPath={socket_path}",
        "-o", "ControlMaster=no",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", str(port),
    ]
    if user:
        cmd += ["-l", user]
    cmd += [host, "echo __RACA_PROBE_OK"]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode == 0 and "__RACA_PROBE_OK" in result.stdout
    except subprocess.TimeoutExpired:
        return False


def _kill_controlmaster_socket(cfg: dict, cluster: str) -> None:
    """Kill the ControlMaster socket so it doesn't interfere with persistent mode."""
    import subprocess

    host = cfg.get("host") or cfg.get("hostname") or cluster
    user = cfg.get("user", "")
    port = cfg.get("port", 22)
    socket_dir = os.path.expanduser("~/.ssh/sockets")
    socket_path = f"{socket_dir}/{user}@{cluster}"

    try:
        subprocess.run(
            ["ssh", "-o", f"ControlPath={socket_path}", "-p", str(port),
             "-O", "exit", host],
            capture_output=True, text=True, timeout=5,
        )
    except (subprocess.TimeoutExpired, OSError):
        pass

    # Force-remove the socket file if ssh -O exit didn't clean it up
    from pathlib import Path
    Path(socket_path).unlink(missing_ok=True)


@click.command("setup-cluster")
@click.argument("cluster")
def setup_cluster(cluster: str) -> None:
    """Probe which SSH connection mode works for CLUSTER.

    Tries ControlMaster first (session multiplexing). If that fails,
    falls back to persistent daemon mode. Saves the result so
    `raca auth <cluster>` uses the right mode automatically.
    """
    try:
        cfg = get_cluster(cluster)
    except KeyError as exc:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {exc}")
        raise SystemExit(1)

    # VPN check
    if cfg.get("vpn_required", False):
        if not check_vpn():
            click.echo(
                click.style("WARNING:", fg="yellow", bold=True)
                + f" Cluster '{cluster}' requires VPN but no active utun interface was detected."
            )
            click.echo("  Start your VPN, then re-run this command.")
            raise SystemExit(1)
        else:
            click.echo(click.style("VPN OK", fg="green") + " -- utun interface with inet address found.")

    # ─── Phase 1: Try ControlMaster ─────────────────────────────────────────
    click.echo(
        f"\n{click.style('Phase 1:', bold=True)} Trying ControlMaster mode for {cluster}..."
    )
    click.echo("  You may be prompted for credentials (password, 2FA, etc.).\n")

    cm_cmd = _build_controlmaster_cmd(cfg, cluster)
    cm_child = _probe_with_pexpect(cm_cmd)

    if cm_child is not None:
        # Phase 1.5: Verify slave connections work through the socket.
        # The master pexpect child is still alive, holding the ControlMaster
        # socket open. We MUST drain the PTY while testing — otherwise the
        # remote shell's output fills the PTY buffer (~4KB), SSH blocks on
        # write, and can't process the slave's ControlMaster request.
        import threading

        def _drain_pty(child_fd, stop_event):
            """Read and discard PTY output to prevent buffer deadlock."""
            import select as _sel
            while not stop_event.is_set():
                try:
                    rlist, _, _ = _sel.select([child_fd], [], [], 0.5)
                    if rlist:
                        os.read(child_fd, 4096)
                except (OSError, ValueError):
                    break

        click.echo("\nVerifying multiplexed connections work...")
        stop = threading.Event()
        drain = threading.Thread(
            target=_drain_pty, args=(cm_child.child_fd, stop), daemon=True
        )
        drain.start()
        slave_ok = _test_controlmaster_slave(cfg, cluster, timeout=10)
        stop.set()
        drain.join(timeout=2)

        if slave_ok:
            # Slave works — ControlMaster mode is fully functional.
            # Kill the probe session; ControlPersist keeps the socket alive.
            cm_child.terminate(force=True)
            cfg["connection_mode"] = "controlmaster"
            save_cluster(cluster, cfg)
            click.echo(
                click.style("SUCCESS:", fg="green", bold=True)
                + f" ControlMaster works for {cluster}."
            )
            click.echo(f"  Saved connection_mode=controlmaster to clusters.yaml.")
            click.echo(f"  From now on, use: raca auth {cluster}")
            return
        else:
            click.echo(
                click.style("WARNING:", fg="yellow", bold=True)
                + " ControlMaster authenticated but multiplexed connections hang."
            )

            # Remove the ControlMaster socket file so nothing tries to
            # multiplex through it. Do NOT send `ssh -O exit` — that would
            # kill the SSH session we want to keep.
            from pathlib import Path
            user = cfg.get("user", "")
            socket_dir = os.path.expanduser("~/.ssh/sockets")
            cm_socket = Path(f"{socket_dir}/{user}@{cluster}")
            cm_socket.unlink(missing_ok=True)

            # Repurpose the authenticated session as a persistent daemon
            # so the user doesn't have to authenticate a second time.
            click.echo(
                "  Repurposing authenticated session as persistent daemon..."
            )

            from .persistent import PersistentSSHDaemon

            daemon = PersistentSSHDaemon(cfg, cluster)
            persistent_success = daemon.adopt_session(cm_child)

            if persistent_success:
                cfg["connection_mode"] = "persistent"
                save_cluster(cluster, cfg)
                click.echo(
                    click.style("SUCCESS:", fg="green", bold=True)
                    + f" Persistent daemon mode works for {cluster}."
                )
                click.echo(f"  Saved connection_mode=persistent to clusters.yaml.")
                click.echo(f"  From now on, use: raca auth {cluster}")
                return
            else:
                # Adoption failed — kill the child, fall through to Phase 2
                cm_child.terminate(force=True)

    # ─── Phase 2: Try persistent mode (fresh auth) ─────────────────────────
    cm_reason = "timed out waiting for shell prompt" if cm_child is None else "session adoption failed"
    click.echo()
    click.echo(
        click.style("WARNING:", fg="yellow", bold=True)
        + f" ControlMaster did not work ({cm_reason})."
    )
    click.echo(
        f"\n{click.style('Phase 2:', bold=True)} Trying persistent daemon mode for {cluster}..."
    )
    click.echo("  You may be prompted for credentials again.\n")

    from .persistent import PersistentSSHDaemon

    daemon = PersistentSSHDaemon(cfg, cluster)
    persistent_success = daemon.start(timeout=_PROBE_TIMEOUT)

    if persistent_success:
        cfg["connection_mode"] = "persistent"
        save_cluster(cluster, cfg)
        click.echo()
        click.echo(
            click.style("SUCCESS:", fg="green", bold=True)
            + f" Persistent daemon mode works for {cluster}."
        )
        click.echo(f"  Saved connection_mode=persistent to clusters.yaml.")
        click.echo(f"  From now on, use: raca auth {cluster}")
        return

    # ─── Both failed ────────────────────────────────────────────────────────
    click.echo()
    click.echo(
        click.style("FAILED:", fg="red", bold=True)
        + f" Neither ControlMaster nor persistent mode worked for {cluster}."
    )
    click.echo("\n  Debug hints:")
    host_display = cfg.get('host') or cfg.get('hostname', '?')
    click.echo(f"    1. Verify you can SSH manually:  ssh {cfg.get('user', '?')}@{host_display}")
    click.echo(f"    2. Check that host/user/port are correct in clusters.yaml")
    if cfg.get("vpn_required"):
        click.echo(f"    3. Ensure your VPN is connected and routing to the cluster network")
    click.echo(f"    4. Check ~/.ssh/config for conflicting settings")
    click.echo(f"    5. Try with verbose SSH:  ssh -vvv {cfg.get('user', '?')}@{host_display}")
    raise SystemExit(1)
