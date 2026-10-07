"""Command-line interface for the seaview processor.

This module provides CLI commands for generating and managing oceanographic
map tiles using the Typer framework.
"""
import typer
from typing import Annotated


import seaview

app = typer.Typer()

@app.command()
def update(
    env: Annotated[str, typer.Option(help="Environment used in settings file.")] = "DEFAULT",
    sync: Annotated[bool, typer.Option(help="Sync tiles to remote.")] = True,

):
    """Update tiles with yesterday's and today's fields."""

    if "default" not in env.lower():
        seaview.config.change_env(env)
        typer.echo(f"Using environment: {env}")
    print(seaview.settings["cruise_name"])
    seaview.today(force=False, sync=sync)
    seaview.yesterday(force=True, sync=sync)


@app.command()
def daily(
    env: Annotated[str, typer.Option(help="Environment used in settings file.",
                                     envvar="SEAVIEW_CRUISE")] = "wam",
    web_dir: Annotated[str, typer.Option(help="Web root to write layer_config.json and "
                                         "colorbars/ to (default: the tile directory).",
                                         envvar="SEAVIEW_WEB_DIR")] = None,
    days: Annotated[int, typer.Option(help="Number of past days to fill in.")] = 3,
):
    """Generate missing tiles for the last few days and update the web map's layer list."""
    from . import publish
    if "default" not in env.lower():
        seaview.config.change_env(env)
    failures = publish.daily(web_dir=web_dir, days=days)
    if failures:
        raise typer.Exit(code=1)


@app.command()
def colorbars(
    env: Annotated[str, typer.Option(help="Environment used in settings file.")] = "wam",
    output_dir: Annotated[str, typer.Option(help="Directory to write PNGs to.")] = "web/colorbars",
):
    """Render legend colorbars matching the cruise's tile settings."""
    from . import colorbars as cb
    if "default" not in env.lower():
        seaview.config.change_env(env)
    for path in cb.generate(output_dir):
        typer.echo(path)


@app.callback()
def callback():
    """A cruise support system converting geophysical fields to slippy tiles.

    Currently SST, SSH, and Chl from Copernicus are available.
    """




@app.command()
def shoot():
    """Shoot the portal gun."""
    typer.echo("Shooting portal gun")


@app.command()
def load():
    """Load the portal gun."""
    typer.echo("Loading portal gun")
