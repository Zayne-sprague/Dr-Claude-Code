from __future__ import annotations

import sys

import click

from .controlmaster import SSHSessionManager


@click.command()
@click.argument("cluster")
@click.argument("command")
@click.option("--timeout", default=300, show_default=True, help="Command timeout in seconds.")
def ssh(cluster: str, command: str, timeout: int) -> None:
    """Run COMMAND on CLUSTER via ControlMaster.

    Intended for Claude Code integration: always exits with the remote
    return code, and prints stdout/stderr verbatim.
    """
    manager = SSHSessionManager()

    healthy, msg = manager.health_check(cluster)
    if not healthy:
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Not connected to {cluster}. Run: dcc auth {cluster}",
            err=True,
        )
        sys.exit(1)

    result = manager.run(cluster, command, timeout=timeout)

    if result.stdout:
        click.echo(result.stdout, nl=False)
    if result.stderr:
        click.echo(result.stderr, nl=False, err=True)

    sys.exit(result.returncode)
