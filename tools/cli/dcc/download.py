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
            + f" Not connected to {cluster}. Run: dcc auth {cluster}",
            err=True,
        )
        sys.exit(1)

    click.echo(f"Downloading {cluster}:{remote_path} → {local_path}…")
    result = manager.download(cluster, remote_path, local_path)

    if result.stdout:
        click.echo(result.stdout, nl=False)
    if result.stderr:
        click.echo(result.stderr, nl=False, err=True)

    if result.ok:
        click.echo(click.style("Download complete.", fg="green") + f" ({result.duration_s:.1f}s)")
    else:
        click.echo(click.style("Download failed.", fg="red", bold=True))
        sys.exit(result.returncode)
