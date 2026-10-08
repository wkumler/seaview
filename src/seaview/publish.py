"""Daily tile generation for a self-hosted web map.

Each run handles one cruise (the active settings environment). It generates
tiles for any of the last ``days`` days that are missing from ``tile_dir``,
then rewrites that cruise's layer list and the legend in the web folder:

    <web_dir>/tiles/<cruise_name>/<product>/<date>/{z}/{x}/{y}.png   (tile_dir)
    <web_dir>/layer_config/<cruise_name>.json
    <web_dir>/colorbars/<product>.png

Colour ranges are shared by all cruises (settings [default]), so cruise tiles
that overlap on the map use the same scale and there is a single legend.
"""
import json
import pathlib
import shutil
import tempfile
import traceback

import pandas as pd

from . import colorbars, config, layer_config, tile
from .utils import DataObjectError
settings = config.settings

PRODUCTS = {"ssh": tile.ssh, "ostia": tile.ostia, "globcolour": tile.globcolour}
# Written into a date directory once all of its tiles exist. A directory
# without it was interrupted (timeout, reboot) and is redone, not published.
DONE = ".done"


def completed_dates(product):
    """Dates (directory names) of finished tile sets for one product."""
    base = pathlib.Path(settings["tile_dir"]) / product
    return sorted(d.name for d in base.glob("*") if (d / DONE).is_file())


def remove_unfinished():
    """Delete date directories left behind by an interrupted run."""
    for product in settings["updated_tiles"]:
        for d in (pathlib.Path(settings["tile_dir"]) / product).glob("*"):
            if d.is_dir() and not (d / DONE).is_file():
                print(f"{product} {d.name}: removing unfinished tiles", flush=True)
                shutil.rmtree(d, ignore_errors=True)


def process_day(dtm):
    """Generate every missing product for one day.

    Returns a list of (product, date, error) for products that failed.
    """
    date = str(pd.to_datetime(dtm).date())
    failures = []
    for product in settings["updated_tiles"]:
        out = pathlib.Path(settings["tile_dir"]) / product / date
        if (out / DONE).is_file():
            continue
        shutil.rmtree(out, ignore_errors=True)  # leftovers of an interrupted run
        print(f"{product} {date}: generating", flush=True)
        try:
            PRODUCTS[product](dtm, verbose=False, force=False)
        except DataObjectError as err:
            # Downloaded file was empty: the NRT product is still being filled in.
            shutil.rmtree(out, ignore_errors=True)
            print(f"{product} {date}: no data available yet ({err})", flush=True)
            continue
        except Exception as err:
            traceback.print_exc()
            shutil.rmtree(out, ignore_errors=True)  # never leave a partial day
            failures.append((product, date, repr(err)))
            continue
        if out.is_dir():
            (out / DONE).touch()
            print(f"{product} {date}: done", flush=True)
        else:
            print(f"{product} {date}: no data available yet", flush=True)
    return failures


def build_layer_config(output_dir):
    """Write layer_config.json for the finished tile sets in tile_dir.

    Products without any finished tiles are left out instead of advertising
    dates that do not exist.
    """
    finished = {p: completed_dates(p) for p in settings["updated_tiles"]}
    available = [p for p in settings["updated_tiles"] if finished[p]]
    layer_config.generate_file(json_file_path=output_dir)
    json_file = pathlib.Path(output_dir) / "layer_config.json"
    data = json.loads(json_file.read_text())
    data["layers"] = [l for l in data["layers"] if l["id"] in available]
    # The map stretches tiles past max_native_zoom and requests nothing outside bounds.
    data["max_native_zoom"] = max(settings["zoom_levels"])
    data["bounds"] = [[settings["lat1"], settings["lon1"]], [settings["lat2"], settings["lon2"]]]
    json_file.write_text(json.dumps(data, indent=2))
    if available:
        dates = {}
        for product in available:
            found = pd.to_datetime(finished[product])
            span = min((found.max() - found.min()).days, settings.get("max_tile_days") - 1)
            dates[product] = dict(start=found.max() - pd.Timedelta(span, "D"), end=found.max())
        layer_config.update_date_ranges(json_file=json_file, layer_dates=dates)
        # Also list the exact dates, so a day missing from the middle of the range (e.g. no
        # chlorophyll because it was all cloud) isn't offered as an empty layer.
        data = json.loads(json_file.read_text())
        for layer in data["layers"]:
            start = layer["date_range"]["start"]
            layer["dates"] = [d for d in finished[layer["id"]] if d >= start]
        json_file.write_text(json.dumps(data, indent=2))
    return json_file


def daily(web_dir=None, days=3):
    """Run the daily update for the active cruise.

    web_dir is the web server's root folder; it defaults to tile_dir.
    """
    print(f"Cruise {settings['cruise_name']}: "
          f"lat {settings['lat1']}..{settings['lat2']}, lon {settings['lon1']}..{settings['lon2']}",
          flush=True)

    remove_unfinished()

    # NRT products for a given day appear the following day, so start at yesterday.
    today = pd.Timestamp.now(tz="UTC").normalize().tz_localize(None)
    failures = []
    for n in range(1, days + 1):
        failures += process_day(today - pd.Timedelta(n, "D"))

    out = pathlib.Path(web_dir or settings["tile_dir"])
    cruise = settings["cruise_name"]
    with tempfile.TemporaryDirectory() as tmp:
        colorbars.generate(pathlib.Path(tmp) / "colorbars")
        json_file = build_layer_config(tmp)
        print(json_file.read_text(), flush=True)
        shutil.copytree(pathlib.Path(tmp) / "colorbars", out / "colorbars", dirs_exist_ok=True)
        # Write next to the target and rename, so the web server never serves a half-written file.
        target = out / "layer_config" / f"{cruise}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(json_file, target.with_suffix(".json.tmp"))
        target.with_suffix(".json.tmp").replace(target)

    for product, date, err in failures:
        print(f"FAILED {product} {date}: {err}", flush=True)
    return failures
