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


def _probe_with_pexpect(ssh_cmd: str, timeout: int = _PROBE_TIMEOUT) -> bool:
    """Spawn SSH, proxy interactive auth, and detect a shell prompt.

    Flow:
    1. Spawn pexpect child with the SSH command.
    2. Enter raw terminal mode.
    3. Shuttle bytes between SSH child and stdin/stdout (select loop).
    4. Track whether the user has sent input and when the last output arrived.
    5. After 3s of silence following user input, print the "testing" message.
    6. Check prompt patterns on each output chunk.
    7. Return True if prompt found within timeout, False otherwise.
    8. Always terminate the child and restore terminal settings.

    Args:
        ssh_cmd: Full SSH command string to spawn.
        timeout: Max seconds to wait for a shell prompt.

    Returns:
        True if a shell prompt was detected (connection works).
    """
    import select
    import termios
    import tty

    import pexpect

    if not sys.stdin.isatty():
        click.echo(click.style("ERROR:", fg="red", bold=True) + " Cannot probe without a TTY.")
        return False

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

            # Check if we should show the "testing" message:
            # user has sent input, 3s of silence, and we haven't shown it yet
            if (
                user_sent_input
                and not testing_message_shown
                and (now - last_output_time) >= _SILENCE_THRESHOLD
            ):
                # Restore terminal to print the message cleanly
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                in_raw_mode = False
                click.echo()  # newline after any auth prompts
                click.echo(
                    click.style("\nAuthenticated.", fg="green")
                    + " Testing connection mode -- this may take up to 2 minutes..."
                )
                testing_message_shown = True
                # Re-enter raw mode
                tty.setraw(fd)
                in_raw_mode = True

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
                    last_output_time = time.monotonic()
                    recent_output += data
                    # Keep only last 512 bytes for prompt matching
                    recent_output = recent_output[-512:]

                    # Check for shell prompt
                    for pattern in _PROMPT_PATTERNS:
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
                        user_sent_input = True

        return False
    finally:
        # Always restore terminal and clean up the child process
        if in_raw_mode:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        if child.isalive():
            child.terminate(force=True)


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
    cm_success = _probe_with_pexpect(cm_cmd)

    if cm_success:
        cfg["connection_mode"] = "controlmaster"
        save_cluster(cluster, cfg)
        click.echo()
        click.echo(
            click.style("SUCCESS:", fg="green", bold=True)
            + f" ControlMaster works for {cluster}."
        )
        click.echo(f"  Saved connection_mode=controlmaster to clusters.yaml.")
        click.echo(f"  From now on, use: raca auth {cluster}")
        return

    # ─── Phase 2: Try persistent mode ───────────────────────────────────────
    click.echo()
    click.echo(
        click.style("WARNING:", fg="yellow", bold=True)
        + " ControlMaster did not work (timed out waiting for shell prompt)."
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
