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
| `layer_config/<cruise>.json` | One per cruise: satellite layers, dates, tile `base_url`, max zoom, box (not in the repo) | daily job (`sea daily`) |
| `data/stations/*.geojson` | Station lists per cruise | `stations_to_geojson.py` |
| `data/eez.geojson` | EEZ / country polygons (6 MB, loaded only when the layer is switched on) | static |
| `colorbars/*.png` | Legend images, shared by all cruises (not in the repo) | daily job (`sea daily`) |
| `js/seaview.js` | Map app | |
| `js/ruler.js`, `vendor/` | Ruler control, Leaflet and plugins (vendored so the map works on ship internet) | |

## Adding a cruise

1. Make a CSV with columns `name,lat,lon` (optional: `arrive,departure,depth,duration,comments`) and run
   `python web/stations_to_geojson.py stations.csv web/data/stations/<cruise>.geojson`.
2. Add `{"name": ..., "stations": ..., "color": ...}` to `cruises` in `site_config.json`.
3. For satellite tiles: add a section in `settings.toml` (box and zoom levels only; colour ranges are
   shared), add it to `CRUISES=` in `server/seaview-daily.service`, and give the cruise a
   `"layer_config": "layer_config/<cruise_name>.json"` entry in `site_config.json`. See the top-level
   README for details.

Running it on a server (nginx, HTTPS, daily tiles) is described in `server/LIGHTSAIL_GUIDE.md`.
