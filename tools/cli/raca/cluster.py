from __future__ import annotations

import sys
from typing import Any

import click
import yaml

from .config import (
    get_cluster,
    list_cluster_names,
    load_clusters,
    remove_cluster,
    save_cluster,
)


@click.group()
def cluster() -> None:
    """Manage cluster configurations."""


@cluster.command("list")
def cluster_list() -> None:
    """List all configured clusters."""
    names = list_cluster_names()
    if not names:
        click.echo("No clusters configured. Add one with: raca cluster add <name> --host <host> --user <user>")
        return
    clusters = load_clusters()
    click.echo(f"{'NAME':<20} {'HOST':<30} {'USER':<15} {'PORT'}")
    click.echo("-" * 70)
    for name in names:
        cfg = clusters[name]
        click.echo(
            f"{name:<20} {cfg.get('host', name):<30} "
            f"{cfg.get('user', ''):<15} {cfg.get('port', 22)}"
        )


@cluster.command("add")
@click.argument("name")
@click.option("--host", required=True, help="Hostname or IP address.")
@click.option("--user", default=None, help="SSH username.")
@click.option("--port", default=22, show_default=True, type=int, help="SSH port.")
@click.option("--identity-file", default=None, help="Path to SSH private key.")
@click.option("--vpn-required", is_flag=True, default=False, help="Flag this cluster as requiring VPN.")
@click.option("--control-persist", default="4h", show_default=True, help="ControlPersist duration.")
def cluster_add(
    name: str,
    host: str,
    user: str | None,
    port: int,
    identity_file: str | None,
    vpn_required: bool,
    control_persist: str,
) -> None:
    """Add or update a cluster configuration."""
    cfg: dict[str, Any] = {
        "host": host,
        "port": port,
        "vpn_required": vpn_required,
        "control_persist": control_persist,
    }
    if user:
        cfg["user"] = user
    if identity_file:
        cfg["identity_file"] = identity_file

    save_cluster(name, cfg)
    click.echo(click.style(f"Cluster '{name}' saved.", fg="green"))
    click.echo(f"  Host: {host}:{port}")
    if user:
        click.echo(f"  User: {user}")
    if identity_file:
        click.echo(f"  Identity: {identity_file}")
    if vpn_required:
        click.echo(click.style("  VPN required.", fg="yellow"))


@cluster.command("remove")
@click.argument("name")
@click.confirmation_option(prompt="Are you sure you want to remove this cluster?")
def cluster_remove(name: str) -> None:
    """Remove a cluster configuration."""
    try:
        remove_cluster(name)
        click.echo(click.style(f"Cluster '{name}' removed.", fg="green"))
    except KeyError as exc:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {exc}")
        sys.exit(1)


@cluster.command("show")
@click.argument("name")
def cluster_show(name: str) -> None:
    """Show full configuration for a cluster."""
    try:
        cfg = get_cluster(name)
        click.echo(f"# {name}")
        click.echo(yaml.dump(cfg, default_flow_style=False).rstrip())
    except KeyError as exc:
        click.echo(click.style("ERROR:", fg="red", bold=True) + f" {exc}")
        sys.exit(1)
