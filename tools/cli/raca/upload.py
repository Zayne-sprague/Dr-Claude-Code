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

    click.echo(f"Uploading {local_path} → {cluster}:{remote_path}…")
    result = manager.upload(cluster, local_path, remote_path)

    if result.stdout:
        click.echo(result.stdout, nl=False)
    if result.stderr:
        click.echo(result.stderr, nl=False, err=True)

    if result.ok:
        click.echo(click.style("Upload complete.", fg="green") + f" ({result.duration_s:.1f}s)")
    else:
        click.echo(click.style("Upload failed.", fg="red", bold=True))
        sys.exit(result.returncode)
