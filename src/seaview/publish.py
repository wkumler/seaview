"""Daily tile generation for a self-hosted web map.

Each run generates tiles for any of the last ``days`` days that are missing
from ``tile_dir``, then rewrites the legend colorbars and
``layer_config.json``. With ``web_dir`` set (the folder the web server
serves), those two go in its root, next to ``index.html``. Tiles themselves
are written to ``tile_dir``, which on the server lives inside the web folder
at ``<web_dir>/tiles/<cruise_name>``.
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


def process_day(dtm):
    """Generate every missing product for one day.

    Returns a list of (product, date, error) for products that failed.
    """
    date = str(pd.to_datetime(dtm).date())
    failures = []
    for product in settings["updated_tiles"]:
        out = pathlib.Path(settings["tile_dir"]) / product / date
        if out.is_dir():
            continue
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
            print(f"{product} {date}: done", flush=True)
        else:
            print(f"{product} {date}: no data available yet", flush=True)
    return failures


def build_layer_config(output_dir):
    """Write layer_config.json for the tiles present in tile_dir.

    Products without any tiles are left out instead of advertising dates
    that do not exist.
    """
    tile_dir = pathlib.Path(settings["tile_dir"])
    available = [p for p in settings["updated_tiles"]
                 if any((tile_dir / p).glob("*"))]
    layer_config.generate_file(json_file_path=output_dir)
    json_file = pathlib.Path(output_dir) / "layer_config.json"
    data = json.loads(json_file.read_text())
    data["layers"] = [l for l in data["layers"] if l["id"] in available]
    json_file.write_text(json.dumps(data, indent=2))
    if available:
        dates = {}
        for product in available:
            found = pd.to_datetime([d.name for d in (tile_dir / product).glob("*")])
            span = min((found.max() - found.min()).days, settings.get("max_tile_days") - 1)
            dates[product] = dict(start=found.max() - pd.Timedelta(span, "D"), end=found.max())
        layer_config.update_date_ranges(json_file=json_file, layer_dates=dates)
    return json_file


def daily(web_dir=None, days=3):
    """Run the daily update.

    web_dir is where colorbars/ and layer_config.json are written; it
    defaults to tile_dir.
    """
    print(f"Cruise {settings['cruise_name']}: "
          f"lat {settings['lat1']}..{settings['lat2']}, lon {settings['lon1']}..{settings['lon2']}",
          flush=True)

    # NRT products for a given day appear the following day, so start at yesterday.
    today = pd.Timestamp.now(tz="UTC").normalize().tz_localize(None)
    failures = []
    for n in range(1, days + 1):
        failures += process_day(today - pd.Timedelta(n, "D"))

    out = pathlib.Path(web_dir or settings["tile_dir"])
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        colorbars.generate(pathlib.Path(tmp) / "colorbars")
        json_file = build_layer_config(tmp)
        print(json_file.read_text(), flush=True)
        shutil.copytree(pathlib.Path(tmp) / "colorbars", out / "colorbars", dirs_exist_ok=True)
        # Write next to the target and rename, so the web server never serves a half-written file.
        shutil.copy(json_file, out / "layer_config.json.tmp")
        (out / "layer_config.json.tmp").replace(out / "layer_config.json")

    for product, date, err in failures:
        print(f"FAILED {product} {date}: {err}", flush=True)
    return failures
