from __future__ import annotations

import subprocess
import threading
import time

import click

from .config import get_cluster, list_cluster_names
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
    """Authenticate and open a ControlMaster session to CLUSTER.

    Use --status to show all cluster connection states without connecting.
    Use --daemon to keep a background keepalive thread running.
    """
    manager = SSHSessionManager()

    if status:
        names = list_cluster_names()
        if not names:
            click.echo("No clusters configured. Add one with: raca cluster add <name> --host <host> --user <user>")
            return
        click.echo(f"{'CLUSTER':<20} {'STATUS':<12} {'DETAIL'}")
        click.echo("-" * 50)
        for name in names:
            healthy, msg = manager.health_check(name)
            indicator = click.style("connected", fg="green") if healthy else click.style("disconnected", fg="red")
            click.echo(f"{name:<20} {indicator:<20} {msg}")
        return

    if not cluster:
        raise click.UsageError("Provide a cluster name or use --status.")

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
        click.echo(f"Connecting to {cluster}…")
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

    if daemon:
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
