**Title:** Add WAM cruise (equatorial Atlantic) and fix blank SSH tiles

## Summary

Adds a `wam` environment for the upcoming WAM cruise on R/V Falkor (too), which runs along the
equator from Tema to Fortaleza. Also fixes two bugs found while setting it up.

### 1. Fix colormap lookup that left SSH tiles blank
Since the move to the `cmap` package, `cmap.Colormap("matplotlib:RdBu_r")` raises
`ValueError: Colormap 'matplotlib:RdBu' not found`. `_generate_single_tile` catches the
exception and saves a transparent tile, so **every SSH tile is empty** with no error printed.
Some other names resolve to a different colormap than before (`gist_rainbow_r` →
`yorick:rainbow`).

A new `tilers.utils.get_cmap()` uses matplotlib's colormap when the name exists there (with or
without the `matplotlib:` prefix, `_r` included) and falls back to `cmap` otherwise, so
`tol:rainbow_WhBr` still works. Tests added.

### 2. Missing `cmasher` import in `tile.py`
`tile.bathy()` uses `cmr.ocean` without importing cmasher, so GEBCO tiling fails with a
`NameError`.

### 3. WAM settings and stations
- `[wam]` in `settings.toml`: 10°S–10°N, 62°W–15°E, zoom levels 0–10. SST 20–31 °C (the
  SubSea 15–30 °C range leaves most of the scale unused at the equator); SSH ±0.25 m as for SubSea.
- `stations/wam_stations.geojson`: the 30 WAM stations, in the same format as
  `/subsea_stations.geojson`.

## Tested
- Ran `tile.ssh`, `tile.ostia` and `tile.globcolour` for 2026-10-05/06 with the `wam`
  environment: about 17k tiles per product per day, about 15 min for all three on 4 cores. SSH tiles
  render correctly with the fix.
- `pytest tests/test_tilers_utils.py`: 11 passed. (The rest of the suite has 24 failures on
  `main` that this PR doesn't change.)

## Web page steps (outside this repo)
The page generator for cruise.bror.co isn't in the repo, so these steps are needed on the
server side:
1. Copy `stations/wam_stations.geojson` to the web root next to `subsea_stations.geojson`.
2. Add a "WAM" station overlay like SubSEA (`fetch('/wam_stations.geojson')`), and centre the
   map around `[1, -17]`, zoom 4.
3. Run the tile job with the `wam` environment (`sea update --env wam`). For depth tiles over
   the new region, run `tile.bathy()` under `wam` as well. The current GEBCO tiles only cover
   the BioReactors area.

The ship tracker already follows the Falkor (too), so it needs no change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
