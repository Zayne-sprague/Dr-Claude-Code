from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import click

from .config import get_cluster, get_raca_dir


def _forwards_file() -> Path:
    return get_raca_dir() / "forwards.json"


def _load_forwards() -> dict[str, Any]:
    ff = _forwards_file()
    if not ff.exists():
        return {}
    with ff.open() as f:
        return json.load(f)


def _save_forwards(data: dict[str, Any]) -> None:
    raca_dir = get_raca_dir()
    raca_dir.mkdir(parents=True, exist_ok=True)
    with _forwards_file().open("w") as f:
        json.dump(data, f, indent=2)


def _forward_key(cluster: str, local_port: int, remote: str) -> str:
    return f"{cluster}:{local_port}:{remote}"


def _is_pid_alive(pid: int) -> bool:
    try:
        import os
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


@click.command()
@click.argument("cluster", required=False)
@click.argument("local_port", type=int, required=False)
@click.argument("remote", required=False)
@click.option("--list", "list_forwards", is_flag=True, default=False, help="List active port forwards.")
@click.option("--kill", "kill_key", default=None, metavar="KEY", help="Kill a forward by its key (cluster:port:remote).")
def forward(
    cluster: str | None,
    local_port: int | None,
    remote: str | None,
    list_forwards: bool,
    kill_key: str | None,
) -> None:
    """Manage SSH port forwards.

    \b
    Examples:
      raca forward torch 8888 localhost:8888    # Jupyter tunnel
      raca forward torch 6006 localhost:6006    # TensorBoard tunnel
      raca forward --list                       # Show all active forwards
      raca forward --kill torch:8888:localhost:8888
    """
    if list_forwards:
        data = _load_forwards()
        if not data:
            click.echo("No active port forwards.")
            return
        click.echo(f"{'KEY':<40} {'PID':<8} {'ALIVE'}")
        click.echo("-" * 60)
        for key, info in sorted(data.items()):
            pid = info.get("pid")
            alive = _is_pid_alive(pid) if pid else False
            alive_str = click.style("yes", fg="green") if alive else click.style("no", fg="red")
            click.echo(f"{key:<40} {str(pid or '?'):<8} {alive_str}")
        return

    if kill_key:
        data = _load_forwards()
        if kill_key not in data:
            click.echo(f"No forward found with key: {kill_key}", err=True)
            sys.exit(1)
        info = data.pop(kill_key)
        pid = info.get("pid")
        if pid and _is_pid_alive(pid):
            try:
                import os
                os.kill(pid, 15)  # SIGTERM
                click.echo(click.style(f"Killed forward {kill_key}", fg="green") + f" (pid {pid})")
            except ProcessLookupError:
                click.echo(f"Process {pid} already gone.")
        else:
            click.echo(f"Forward {kill_key} was not running (pid {pid}).")
        _save_forwards(data)
        return

    if not cluster or local_port is None or not remote:
        raise click.UsageError(
            "Provide CLUSTER LOCAL_PORT HOST:PORT, or use --list / --kill."
        )

    cfg = get_cluster(cluster)

    # Check connection mode — port forwarding requires ControlMaster
    from .config import get_connection_mode
    mode = get_connection_mode(cluster)
    if mode == "persistent":
        click.echo(
            click.style("ERROR:", fg="red", bold=True)
            + f" Port forwarding not supported for persistent-mode clusters."
            + f" Use: raca ssh {cluster} 'ssh -L {local_port}:{remote} localhost' instead"
        )
        sys.exit(1)

    host = cfg.get("host") or cfg.get("hostname", cluster)
    user = cfg.get("user")
    port = cfg.get("port", 22)
    socket_dir = Path.home() / ".ssh" / "sockets"
    socket_label = f"{user}@{cluster}" if user else cluster
    socket = str(socket_dir / socket_label)

    cmd = [
        "ssh",
        "-N", "-f",
        "-o", f"ControlPath={socket}",
        "-o", "ControlMaster=no",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", str(port),
        "-L", f"{local_port}:{remote}",
    ]
    if user:
        cmd += ["-l", user]
    cmd.append(host)

    click.echo(f"Opening forward: localhost:{local_port} → {cluster}:{remote}…")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        click.echo(click.style("Forward failed:", fg="red", bold=True))
        click.echo(result.stderr.strip())
        sys.exit(result.returncode)

    # Find the ssh pid via pgrep (best-effort)
    pid: int | None = None
    try:
        pgrep = subprocess.run(
            ["pgrep", "-n", "-f", f"ssh.*-L.*{local_port}:{remote}"],
            capture_output=True,
            text=True,
        )
        if pgrep.returncode == 0:
            pid = int(pgrep.stdout.strip())
    except (ValueError, FileNotFoundError):
        pass

    key = _forward_key(cluster, local_port, remote)
    data = _load_forwards()
    data[key] = {
        "cluster": cluster,
        "local_port": local_port,
        "remote": remote,
        "pid": pid,
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _save_forwards(data)

    click.echo(
        click.style("Forward active:", fg="green")
        + f" localhost:{local_port} → {cluster}:{remote}"
        + (f" (pid {pid})" if pid else "")
    )
    click.echo(f"  Key: {key}")
    click.echo(f"  Kill with: raca forward --kill {key}")
