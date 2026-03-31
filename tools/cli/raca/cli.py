from __future__ import annotations

import click

from . import __version__


@click.group()
@click.version_option(__version__, prog_name="raca")
def main() -> None:
    """RACA — SSH lifecycle for research clusters."""


# Register subcommands
from .auth import auth  # noqa: E402
from .ssh import ssh  # noqa: E402
from .disconnect import disconnect  # noqa: E402
from .upload import upload  # noqa: E402
from .download import download  # noqa: E402
from .forward import forward  # noqa: E402
from .cluster import cluster  # noqa: E402

main.add_command(auth)
main.add_command(ssh)
main.add_command(disconnect)
main.add_command(upload)
main.add_command(download)
main.add_command(forward)
main.add_command(cluster)
