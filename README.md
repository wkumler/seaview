# OBVI cruise support

Daily satellite maps for research cruises, published at **https://cruise.obviewer.com**.

Each day a job downloads near-real-time ocean data from the Copernicus Marine Service,
turns it into map tiles, and adds them to a web map. The map also shows the planned
cruise stations and the live position of R/V *Falkor (too)*. The site is public (no login)
and built to work over a ship's satellite connection.

This repo is a fork of [brorfred/seaview](https://github.com/brorfred/seaview), the tile
generator behind the original site at cruise.bror.co. The original author stopped responding,
so this fork adds the web map (the original was never published), the WAM cruise and a
self-contained server setup. The original README, with the Python API reference, is in
[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

---

## What's on the map

| Layer | Source | Updated |
| --- | --- | --- |
| **SSH**: sea level anomaly | Copernicus DUACS L4 NRT, 0.125° | daily |
| **SST**: sea surface temperature | OSTIA L4 NRT, 0.05° (~5 km) | daily |
| **Chl**: chlorophyll-a | GlobColour L3 NRT, 4 km (gaps where cloudy) | daily |
| Station plans | Bioreactors I, SUBSEA I, WAM I | when edited |
| R/V Falkor (too) position + track | Schmidt Ocean Institute feed | every 30 s |
| Legend (on by default), EEZ boundaries, day/night, lat/lon grid, nautical-mile ruler | static | n/a |

Satellite layers are listed by date (the last 8 days available). Data for a day is normally
published by Copernicus the following day, sometimes later for chlorophyll.

**WAM region:** 10°S–10°N, 62°W–15°E, zoom levels 0–10.
**Colour ranges:** SSH −0.25 to +0.25 m · SST 20–31 °C · Chl 0.01–100 mg/m³ (log scale).

---

## How it works

```
                    AWS Lightsail server (Ubuntu 24.04)
 Copernicus  ─────► seaview-daily job (Docker, 06:00 + 18:00 UTC)
 Marine             │ writes tiles, legend, layer list
                    ▼
                    /srv/cruise  ◄── nginx (HTTPS) ◄── cruise.obviewer.com ◄── browsers
                    ▲                                      (DNS at Hover)
 this repo ─────────┘ install.sh copies web/ here
```

- **Server:** AWS Lightsail instance `cruise`, $24/month plan (2 vCPU, 4 GB RAM, 80 GB disk),
  with a static IP. Firewall open for SSH (22), HTTP (80) and HTTPS (443).
- **Domain:** an `A` record `cruise` → the static IP, in Hover's DNS for obviewer.com.
  obviewer.com itself runs elsewhere, behind Basecamp login, and is unaffected.
- **HTTPS:** a free Let's Encrypt certificate (certbot) that renews automatically.
- **Daily job:** a systemd timer runs `sea daily` in Docker. It fills in any of the last 3 days
  that are missing, skips days already done, and retries data that isn't published yet on the
  next run. A new day takes ~20–25 minutes for all three products (about 17,000 tiles and
  55 MB per product per day).
- **Cost:** about $24/month for the server. Copernicus data is free.

---

## Everyday tasks

Server commands run in the Lightsail browser terminal: Lightsail console → `cruise` →
**Connect using SSH**. To paste there, use **Ctrl+Shift+V**.

| Task | How |
| --- | --- |
| Apply any change from GitHub (stations, map, settings, code) | `sudo bash /opt/seaview/server/install.sh` |
| See when the job runs next | `systemctl list-timers seaview-daily` |
| Check the last run succeeded | `systemctl status seaview-daily --no-pager` (look for `status=0/SUCCESS`) |
| Read the last run's log | `sudo journalctl -u seaview-daily -n 100 --no-pager` |
| Show only failures | `sudo journalctl -u seaview-daily --no-pager \| grep FAILED` |
| Run the job now | `sudo systemctl start --no-block seaview-daily` |
| Watch a run live (Ctrl+C stops watching, not the job) | `sudo journalctl -u seaview-daily -f` |
| Redo one day (e.g. after changing colours) | `sudo rm -rf /srv/cruise/tiles/WAM/ostia/2026-10-05`, then run the job |
| Change the Copernicus password | `sudo rm /etc/seaview/cmems.env`, then re-run the installer |
| Check free disk space | `df -h /` (80 GB holds well over a year of tiles) |
| Pause / resume the daily job | `sudo systemctl disable --now seaview-daily.timer` / `sudo systemctl enable --now seaview-daily.timer` |
| Check the HTTPS certificate renews | `sudo certbot renew --dry-run` |

"no data available yet" in the log is normal: Copernicus hasn't published that day, and the
next run tries again. The job only reports **FAILED** for real errors.

The installer is safe to re-run at any time, even while the job is running. It keeps the
tiles, the Copernicus login and the HTTPS setup. Browsers may show the old page for up to
5 minutes after an update; press **Ctrl+F5** to force a refresh.

---

## Making changes

Make the change in this repo on your computer, commit and push to GitHub, then run the
installer on the server (first row of the table above).

### Update cruise stations

Station lists come from an Excel sheet with the columns `cruise, station, lat, lon` (optional:
`arrive, departure, depth, duration, comments`, which show up in the station popup). Ours lives in
`C:\Users\Will\Documents\OBVI\obviewer\data\cruise_stations.xlsx`.

```bash
pip install openpyxl
python web/stations_from_xlsx.py "C:\Users\Will\Documents\OBVI\obviewer\data\cruise_stations.xlsx" "WAM 1=wam" "SUBSEA 1=subsea" "Bioreactors 1=bioreactors"
```

Each `"<cruise in the sheet>=<file name>"` pair writes `web/data/stations/<file name>.geojson`.
Stations are connected in sheet order. Two things to know before re-running it on the current
sheet: the sheet spells "Rio de Janiero" (the map currently shows the corrected "Rio de Janeiro"),
and the sheet has no `comments` column, so the port descriptions such as "Tema, Ghana (start)"
would be dropped. Fix the spelling and add a `comments` column to the sheet first.

### Add a cruise to the map

1. Create its station file as above.
2. Add it to `cruises` in [web/site_config.json](web/site_config.json):
   `{"name": "WAM II", "stations": "data/stations/wam2.geojson", "color": "#1f77b4"}`.
   Layers appear in the order listed.

### Change colour ranges or the region

Edit the `[wam]` section of [settings.toml](settings.toml) (`lat1/lat2/lon1/lon2`, `zoom_levels`,
and `vmin/vmax/cmap` under `[wam.ssh]`, `[wam.ostia]`). After pushing and re-running the
installer, new days use the new settings. To redo existing days, delete their folders on the
server (see the table) and run the job. The legend updates by itself.

### Switch the daily job to a different cruise

1. Add a section for it in `settings.toml`, modelled on `[wam]`. Keep `remote_url = ""` and
   `remote_sync = false`.
2. Change `CRUISE=wam` in [server/seaview-daily.service](server/seaview-daily.service).
3. Change `base_url` in the placeholder `web/layer_config.json` and the map centre in
   `web/site_config.json`.

### Other settings in `web/site_config.json`

Page title, map centre and zoom, base map, ship name and data feed URLs, how fast the boat icon
turns green (`moving_knots`), and the legend images.

---

## Working on your own computer

Requires Docker Desktop. Run the commands in **PowerShell** from the repo folder.

| Task | Command |
| --- | --- |
| Preview the map (no satellite layers) | `python -m http.server 8000 -d web`, then open http://localhost:8000 |
| Build the job image | `docker build -f server/Dockerfile -t seaview-daily .` |
| Run tests | `docker run --rm -v "${PWD}\tests:/app/tests" --entrypoint pixi seaview-daily run --frozen python -m pytest tests/test_publish.py tests/test_tilers_utils.py -q` |
| Re-render the legend images | `docker run --rm -v "${PWD}\web\colorbars:/out" seaview-daily colorbars --env wam --output-dir /out` |

To make real tiles and see them on the map locally, put your Copernicus login in a file
`.env.cmems` in the repo folder (it is git-ignored):
```
SEAVIEW_CMEMS_LOGIN=your_username
SEAVIEW_CMEMS_PASSWORD=your_password
```
then:
```powershell
mkdir preview; Copy-Item -Recurse web\* preview\
docker run --rm --env-file .env.cmems -e SEAVIEW_BASE_TILE_DIR=/srv/cruise/tiles -e SEAVIEW_WEB_DIR=/srv/cruise -v "${PWD}\preview:/srv/cruise" seaview-daily daily --env wam --days 1
python -m http.server 8000 -d preview
```

---

## Setting up a new server

Follow [server/LIGHTSAIL_GUIDE.md](server/LIGHTSAIL_GUIDE.md). It's a click-by-click guide with a
check after every step: create the Lightsail instance, attach a static IP, open port 443, add the
Hover DNS record, run the installer, turn on HTTPS, first tile run, snapshot. It also covers
shutting everything down after the cruise. **Delete the static IP as well**, because an
unattached one is billed.

---

## Repo layout

| Path | What it is |
| --- | --- |
| `web/` | The web map (Leaflet, plain HTML/JS, no build step). See [web/README.md](web/README.md) |
| `web/site_config.json` | Page title, map centre, cruises shown, ship feed, legend |
| `web/data/stations/*.geojson` | Station lists |
| `server/` | Install script, nginx config, systemd timer, Dockerfile, setup guide |
| `settings.toml` | Cruise regions, zoom levels, colour ranges (`[wam]` is the active one) |
| `src/seaview/` | Python package: data download (`data_sources/`), tiling (`tilers/`, `tile.py`), daily job (`publish.py`), legends (`colorbars.py`), CLI (`cli.py`) |
| `docs/` | Upstream documentation, the original README, and the backup PR text |

## Relationship to the original project

- The upstream repo contains only the tile generator. The page at cruise.bror.co was generated
  by an unpublished script; `web/` is a rebuild of it from the saved page.
- Branch **`wam-upstream`** holds a minimal PR for upstream, in case the author returns: the
  colormap fix, a missing import, and the WAM settings and stations. The PR text is in
  [docs/wam-upstream-PR.md](docs/wam-upstream-PR.md). It hasn't been opened.

---
---

# Handoff notes for an AI assistant

Context for continuing this work in a new session. Written 2026-10-07. Facts about the live
server reflect what the user reported at that time. Verify anything time-sensitive before relying
on it.

## Current state

- **Deployment:** the user was following `server/LIGHTSAIL_GUIDE.md` and had reached Step 7 (first
  tile run) on 2026-10-07. Steps 1–5 were done (instance, static IP, firewall, Hover DNS,
  install). Whether Step 6 (certbot) and Step 8 (snapshot) were completed is unknown. Ask before
  assuming HTTPS works. The Lightsail region wasn't recorded (Ohio/us-east-2 was suggested,
  since obviewer.com is at 18.223.94.213).
- **Branches** (`origin` = github.com/wkumler/seaview, public): `main` is deployed. The server
  clones `main` into `/opt/seaview`. `wam-upstream` is three commits on upstream `5f89447` and not
  opened as a PR.
- **Untracked in the local checkout:** `webpage/`, a "Save page as" copy of cruise.bror.co/devel
  (reference only, keep it out of git), and `.env.cmems` (Copernicus credentials, git-ignored).
  **Never read or print `.env.cmems`.** Use it only via `docker --env-file`.

## Architecture and data flow

- systemd `seaview-daily.timer` (OnCalendar 06,18:00 UTC, Persistent=true) → `seaview-daily.service`
  (oneshot, TimeoutStartSec=4h) → `docker run seaview-daily daily --env ${CRUISE} --days ${DAYS}`
  with `CRUISE=wam DAYS=3`, `--env-file /etc/seaview/cmems.env`, and
  `SEAVIEW_BASE_TILE_DIR=/srv/cruise/tiles`, `SEAVIEW_BASE_DATA_DIR=/var/lib/seaview/data`,
  `SEAVIEW_WEB_DIR=/srv/cruise`, `TQDM_DISABLE=1`.
- `seaview.publish.daily(web_dir, days)`: for each of yesterday back to `days` ago, and each product
  in `settings.updated_tiles` (`globcolour, ostia, ssh`), skips if `tile_dir/<product>/<date>/` exists,
  else calls `tile.<product>(dtm, force=False)`. Afterwards it regenerates `colorbars/*.png` and
  `layer_config.json` (written atomically) into `web_dir`. It exits 1 only on real exceptions.
- `tile_dir` = `{base_tile_dir}/{cruise_name}` = `/srv/cruise/tiles/WAM`. Dynaconf env `[wam]` sets
  `remote_url = ""`, so `layer_config.base_url` = `/tiles/WAM` (relative, same origin as the map).
- Web map: `web/index.html` + `web/js/seaview.js` read `site_config.json`, then `layer_config.json`
  (re-fetched every 5 minutes and by the "Refresh layers" link). Satellite layers use a grouped
  layer control (one checkbox per date). Vendored Leaflet 1.9.3 plus plugins (realtime, grouped
  layers, mouse position, fullscreen, terminator). The graticule and ruler were extracted verbatim
  from the folium page into `web/vendor/leaflet.graticule.js` and `web/js/ruler.js`.
- nginx (`server/nginx-cruise.conf` → `/etc/nginx/sites-available/cruise`): root `/srv/cruise`, gzip
  for json/geojson/js/css, `Cache-Control` no-cache for `layer_config.json` and `colorbars/`, 1 day for
  `tiles/`, 5 minutes for everything else; `.geojson` served as `application/geo+json`.

## install.sh contract (idempotent)

Runs apt (nginx, certbot, python3-certbot-nginx, docker.io, docker-buildx, rsync, git), adds 2 GB swap
if none, `git pull --ff-only` in `/opt/seaview`, `docker build -f server/Dockerfile -t seaview-daily`,
rsyncs `web/` → `/srv/cruise` with `--delete` but **excluding** `tiles/`, `colorbars/`,
`layer_config.json`, `README.md`, `*.py`. It writes the nginx site **only if it doesn't exist**,
because certbot edits it, so nginx template changes must be applied by hand on the server. It
prompts for Copernicus credentials only if `/etc/seaview/cmems.env` is missing, then installs and
enables the timer. It never restarts a running job.

## Decisions (and why)

- **Static site, not Shiny / Posit Connect Cloud:** no persistent websocket over flaky ship internet,
  no cold starts, cheap. Connect Cloud also can't store ~50k new tiles per day or run the tile job.
- **Single Lightsail server, not serverless AWS:** an S3 + CloudFront + ECS Fargate + EventBridge
  CloudFormation design was built, then dropped (never committed) because the user preferred
  something they can SSH into and understand. Domain via Hover subdomain of obviewer.com.
- **Public, no auth.** obviewer.com uses nginx `auth_request` with an R plumber API and Basecamp
  OAuth. Reusing it was rejected: per-tile auth subrequests would load the plumber API, logging in
  at sea is fragile, and the crew lack Basecamp accounts.
- **GEBCO base map removed** (its tiles lived on a UNH server and only covered the Bioreactors
  region). Esri Ocean is the only base map, and the base map picker hides itself when there's one.
- **WAM 2** in the station sheet is intentionally not on the map.

## Bugs found and fixed (watch for regressions)

1. **Blank SSH tiles:** upstream switched to `cmap.Colormap(name)`, which can't resolve
   `matplotlib:RdBu_r`. `_generate_single_tile` catches every exception and saves a transparent
   tile, so failures are silent. Fixed with `tilers/utils.get_cmap()` (matplotlib first, then the
   cmap package). If tiles are ever blank, suspect the colormap or anything inside that try block.
2. `seaview.utils.DataObjectError` subclasses **BaseException**, so `except Exception` misses it.
   An empty Copernicus download (common for yesterday's GlobColour) raises it. `publish` treats it as
   "not available yet", not a failure.
3. `layer_config.find_first_last_tile_dates` crashes on a product with no tiles. `publish.build_layer_config`
   computes the dates itself and drops empty products.
4. `tile.bathy()` used `cmr` without importing cmasher. Globcolour range/cmap was hard-coded; it now
   reads settings. Layer attributions were fixed strings; they're now built from settings.
5. Web: after zooming, the graticule redraws on top and its lines took clicks. The equator passes
   through WAM S02–S18 and the 0° meridian through Tema. Route polylines also covered marker centres.
   Fixed with panes (`graticule` z350, `eez` z360, below `overlayPane` z400) and `interactive: false`
   on the grid and route lines.

## Gotchas

- `.gitignore` ignores `site/` (MkDocs output), which is why the web map lives in `web/`.
- The `sea-update` console script points straight at a function, not the Typer app, so it ignores CLI
  flags. Use `sea update --env X` or `sea daily`.
- `pixi.toml` is linux-64 only. The Python environment exists only inside the Docker image
  (Python 3.14, image ~3.4 GB, first build ~3 min).
- Upstream tests: `tests/test_init.py` fails to import (`DateInFutureError` no longer exists),
  `tests/test_cli.py` hangs (it runs real downloads), and 24 other tests fail identically on upstream
  `5f89447` (stale mocks and signatures). Reliable tests: `tests/test_publish.py`,
  `tests/test_tilers_utils.py` (16 pass).
- Benchmarks: ~30 tiles/s on 4 CPUs; real data on 2 CPUs takes ~7.5 min per product-day including
  download. Worker processes peak at ~220 MB each.
- The EEZ file (`web/data/eez.geojson`, 5.8 MB, 258 features, properties `Country`, `ISO_A3`) is
  fetched only when its layer is first switched on. It's ~2.5 MB gzipped.
- The SOI ship feed (`soi-vessel-geojson-292717291655.us-central1.run.app/{track,latest}.geojson`)
  is third-party. Speed is multiplied by 0.539957 (km/h to knots).

## Development environment (user's machine)

- Windows 11; Git Bash and PowerShell 5.1; Docker Desktop; Python 3.12 (openpyxl installed). No
  `gh` CLI and no AWS CLI.
- Git Bash mangles paths in `docker -v`: use `MSYS_NO_PATHCONV=1` and `$(pwd -W)`, or use PowerShell.
- Files are committed with LF line endings (autocrlf converts the working copy). Check scripts with
  `git show HEAD:<file> | tr -cd '\r' | wc -c` → must be 0.
- Browser testing without the Chrome extension: headless Edge,
  `msedge.exe --headless=new --disable-gpu --user-data-dir=<tmp> --window-size=1400,900 --virtual-time-budget=30000 --screenshot=<png> <url>`
  (or `--dump-dom` with a test script that writes JSON to a `data-result` attribute on `<body>`).
  Serve `web/` with `python -m http.server`. To test the real nginx config, run `nginx:stable` with
  the conf mounted.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Open items

- SSH range: nearly all of the WAM region came out positive with ±0.25 m. −0.1 to +0.3 m was
  suggested, but the user hasn't decided.
- Station popups have no arrival/departure times; the sheet has no such columns.
- The sheet still spells "Rio de Janiero" and has no `comments` column (see "Update cruise stations").
- Optional: link cruise.obviewer.com from obviewer.com; open the upstream PR if the author reappears.
