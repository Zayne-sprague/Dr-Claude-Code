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
