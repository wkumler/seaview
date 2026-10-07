# Cruise support web map

Static Leaflet front end for the tiles produced by `seaview`. It is a clean rebuild of the
folium-generated page at https://cruise.bror.co/ (the generator script was never published),
with all cruise-specific settings moved into JSON so no code changes are needed per cruise.

## Run locally

```bash
python -m http.server 8000 -d web
```

Then open http://localhost:8000/. Any static web server works.

## Files

| Path | What it is | Who updates it |
| --- | --- | --- |
| `site_config.json` | Title, map center, basemaps, cruise station layers, ship tracker, colorbars | you, per cruise |
| `layer_config.json` | Satellite layers + date ranges + tile `base_url` (absolute or relative) | daily job (`sea daily`) |
| `data/stations/*.geojson` | Station lists per cruise | `stations_to_geojson.py` |
| `data/eez.geojson` | EEZ / country polygons (6 MB, loaded only when the layer is switched on) | static |
| `colorbars/*.png` | Legend images matching the tile colour ranges | `sea colorbars --env <cruise>` (and the daily job on AWS) |
| `js/seaview.js` | Map app | |
| `js/ruler.js`, `vendor/` | Ruler control, Leaflet and plugins (vendored so the map works on ship internet) | |

## Adding a cruise

1. Make a CSV with columns `name,lat,lon` (optional: `arrive,departure,depth,duration,comments`) and run
   `python web/stations_to_geojson.py stations.csv web/data/stations/<cruise>.geojson`.
2. Add `{"name": ..., "stations": ..., "color": ...}` to `cruises` in `site_config.json`.
3. Add a matching environment in `settings.toml` (bounds, zoom levels, colour ranges) and point the
   daily job at it (`CRUISE=` in `server/seaview-daily.service`). Re-centre `map.center` / `map.zoom`.

Running it on a server (nginx, HTTPS, daily tiles) is described in `server/LIGHTSAIL_GUIDE.md`.
