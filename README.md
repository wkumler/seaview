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

Each cruise has its own satellite tile set, covering a box around its stations. Ticking a date
draws it for every cruise whose station layer is switched on, so unticking a cruise also hides its
satellite tiles. All cruises share **one colour scale** and one legend, so where boxes overlap the
colours agree:

| Cruise | Box | Settings section |
| --- | --- | --- |
| WAM I | 10°S–10°N, 62°W–15°E | `[wam]` |
| SUBSEA I | 32°S–8°S, 48°W–20°W | `[subsea]` |
| Bioreactors I | 50°S–17°S, 71°W–19°W | `[bioreactors]` |

**Colour ranges (all cruises):** SST 5–31 °C in 1 °C steps · SSH −0.5 to +0.5 m in 0.05 m steps ·
Chl 0.01–100 mg/m³ (log scale).
Tiles are made for zoom levels 0–8 (about 0.6 km per pixel, finer than the 4–14 km data). The map
can zoom to 12 and stretches the zoom-8 tiles.

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
- **Daily job:** a systemd timer runs `sea daily` in Docker once per cruise (WAM, then SUBSEA,
  then Bioreactors). For each, it fills in any of the last 3 days
  that are missing, skips days already done, and retries data that isn't published yet on the
  next run. Each finished day gets a `.done` marker; a day cut off by a reboot or time limit
  has none, so it's deleted and redone rather than shown half-finished. At zoom 0–8 a product-day
  is about 1,250 tiles; a new day should take a few minutes (not yet timed on the server).
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
| Redo one day | `sudo rm -rf /srv/cruise/tiles/WAM/ostia/2026-10-05`, then run the job |
| Redo everything (e.g. after changing colour ranges) | `sudo rm -rf /srv/cruise/tiles/*`, then run the job (it rebuilds the last 3 days) |
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

### Add a cruise (stations and satellite tiles)

1. Create its station file as above.
2. Add a section to [settings.toml](settings.toml), modelled on `[subsea]`: a `cruise_name` (used
   in the tile and layer-list paths), `remote_url = ""`, `remote_sync = false`, the box
   (`lat1/lat2/lon1/lon2`: station extent plus a 5° margin) and `zoom_levels = [0,...,8]`.
   **Don't add colour ranges**; every cruise shares the ones in `[default]`.
3. Add the section name to `CRUISES=` in [server/seaview-daily.service](server/seaview-daily.service).
4. Add it to `cruises` in [web/site_config.json](web/site_config.json):
   `{"name": "WAM II", "stations": "data/stations/wam2.geojson", "color": "#1f77b4", "layer_config": "layer_config/<cruise_name>.json"}`.
   Layers appear in the order listed. Leave out `layer_config` for a cruise with stations only.

A cruise's satellite layers appear after its first job run.

### Change colour ranges or a cruise's box

Colour ranges are in `[default.ssh]`, `[default.ostia]` and `[default.globcolour]` in
`settings.toml` and apply to every cruise. Boxes and zoom levels are in each cruise's section.
After pushing and re-running the installer, new days use the new settings. Existing tiles keep
the old colours until redone: delete them on the server (see the table) and run the job. The
legend updates by itself. Browsers may keep showing old tiles for up to a day; Ctrl+F5 refreshes.

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
| `settings.toml` | Shared colour ranges (`[default]`), each cruise's box and zoom levels (`[wam]`, `[subsea]`, `[bioreactors]`) |
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

- **Deployment:** the server has been running since 2026-10-07 (Steps 1–5 and 7 of
  `server/LIGHTSAIL_GUIDE.md` done). Whether Step 6 (certbot) and Step 8 (snapshot) were completed
  is unknown; ask before assuming HTTPS works. The multi-cruise version (commit `e64de3a`) was deployed
  on 2026-10-08 and its first run succeeded for all three cruises; the user checked the map and was
  happy with it, including the shared colour ranges. The Lightsail region wasn't recorded (Ohio/us-east-2 was suggested,
  since obviewer.com is at 18.223.94.213).
- **Branches** (`origin` = github.com/wkumler/seaview, public): `main` is deployed. The server
  clones `main` into `/opt/seaview`. `wam-upstream` is three commits on upstream `5f89447` and not
  opened as a PR.
- **Untracked in the local checkout:** `webpage/`, a "Save page as" copy of cruise.bror.co/devel
  (reference only, keep it out of git), and `.env.cmems` (Copernicus credentials, git-ignored).
  **Never read or print `.env.cmems`.** Use it only via `docker --env-file`.

## Architecture and data flow

- systemd `seaview-daily.timer` (OnCalendar 06,18:00 UTC, Persistent=true) → `seaview-daily.service`
  (oneshot, TimeoutStartSec=11h) → `docker run seaview-daily daily --env ${CRUISE} --days ${DAYS}`
  via `server/run-daily.sh`, which loops over `CRUISES="wam subsea bioreactors"` (one container per
  cruise, `docker rm -f` of a stale same-named container first; a failure doesn't stop the others but
  makes the run exit 1), `DAYS=3`, `--env-file /etc/seaview/cmems.env`, and
  `SEAVIEW_BASE_TILE_DIR=/srv/cruise/tiles`, `SEAVIEW_BASE_DATA_DIR=/var/lib/seaview/data`,
  `SEAVIEW_WEB_DIR=/srv/cruise`, `TQDM_DISABLE=1`.
- `seaview.publish.daily(web_dir, days)`: for each of yesterday back to `days` ago, and each product
  in `settings.updated_tiles` (`globcolour, ostia, ssh`), skips if `tile_dir/<product>/<date>/.done`
  exists, else deletes any leftover directory and calls `tile.<product>(dtm, force=False)`, then writes
  `.done`. At the start of each run, `remove_unfinished()` deletes every date directory without
  `.done`, and `layer_config` lists only dates with `.done`. Afterwards it regenerates `web_dir/colorbars/*.png`
  (shared by all cruises) and `web_dir/layer_config/<cruise_name>.json` (written atomically). Each layer
  in it has `date_range` and an explicit `dates` list (only finished days). The file also carries
  `max_native_zoom` (max of `zoom_levels`) and `bounds` (the region box). The map uses them for
  `maxNativeZoom` (stretch tiles beyond that zoom instead of requesting missing ones) and to avoid
  requesting tiles outside the region. It exits 1 only on real exceptions.
- `tile_dir` = `{base_tile_dir}/{cruise_name}`, e.g. `/srv/cruise/tiles/WAM`, `.../SubSea`,
  `.../Bioreactors`. The cruise envs set `remote_url = ""`, so `base_url` = `/tiles/<cruise_name>`
  (relative, same origin as the map). Colour ranges live only in `[default]`, so all cruises match.
- Web map: `web/index.html` + `web/js/seaview.js` read `site_config.json`, then each cruise's
  `layer_config` (`cruises[].layer_config`). One grouped "date" panel lists the union of products and
  dates. Each entry is an `L.layerGroup` holding the tile layers of the cruises whose station layer is
  on; `overlayadd/overlayremove` on a station layer re-syncs the groups. Missing configs are skipped.
  (re-fetched every 5 minutes and by the "Refresh layers" link). Satellite layers use a grouped
  layer control (one checkbox per date). Vendored Leaflet 1.9.3 plus plugins (realtime, grouped
  layers, mouse position, fullscreen, terminator). The graticule and ruler were extracted verbatim
  from the folium page into `web/vendor/leaflet.graticule.js` and `web/js/ruler.js`.
- nginx (`server/nginx-cruise.conf` → `/etc/nginx/sites-available/cruise`): root `/srv/cruise`, gzip
  for json/geojson/js/css, `Cache-Control` no-cache for `colorbars/` (and a legacy `/layer_config.json`
  rule), 5 minutes for `layer_config/*.json` via `location /`, 1 day for
  `tiles/`, 5 minutes for everything else; `.geojson` served as `application/geo+json`.

## install.sh contract (idempotent)

Runs apt (nginx, certbot, python3-certbot-nginx, docker.io, docker-buildx, rsync, git), adds 2 GB swap
if none, `git pull --ff-only` in `/opt/seaview`, `docker build -f server/Dockerfile -t seaview-daily`,
rsyncs `web/` → `/srv/cruise` with `--delete` but **excluding** `tiles/`, `colorbars/`,
`layer_config/`, `README.md`, `*.py`. It writes the nginx site **only if it doesn't exist**,
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

6. The first server run (2026-10-07) hit the old 4 h `TimeoutStartSec` and was killed mid-way through
   `ssh 2026-10-04`, leaving a partial day that the old "directory exists" check would skip forever.
   That led to the `.done` markers and the 11 h limit. Zoom was also cut from 0–10 to 0–8 (14x fewer
   tiles). Lightsail CPU is burstable: once burst credit runs out, runs slow down about 5x (an SSH day
   took 4 min with credit, 18–24 min without).

## Gotchas

- **Disk space:** the user's drive filled up with Docker images and build cache on 2026-10-08. Prune
  after every build (`docker image prune -f`, `docker builder prune -f`), remove helper images, and
  delete scratch files right after each test. `server/Dockerfile` installs the pixi environment from
  a stub package before copying `src/`, so code edits don't rebuild the ~3 GB layer. Ask before
  building the image locally.

- `.gitignore` ignores `site/` (MkDocs output), which is why the web map lives in `web/`.
- The `sea-update` console script points straight at a function, not the Typer app, so it ignores CLI
  flags. Use `sea update --env X` or `sea daily`.
- `pixi.toml` is linux-64 only. The Python environment exists only inside the Docker image
  (Python 3.14, image ~3.4 GB, first build ~3 min).
- Upstream tests: `tests/test_init.py` fails to import (`DateInFutureError` no longer exists),
  `tests/test_cli.py` hangs (it runs real downloads), and 24 other tests fail identically on upstream
  `5f89447` (stale mocks and signatures). Reliable tests: `tests/test_publish.py`,
  `tests/test_tilers_utils.py` (16 pass).
- Server timing at zoom 0–8 (2026-10-08): Bioreactors took 14.5 min for 9 product-days (~1.5 min each),
  so a normal run (one new day × 3 cruises × 3 products) takes ~5 min and stays within Lightsail's
  CPU burst allowance.
- Benchmarks (at zoom 0–10, before the cut to 0–8): ~30 tiles/s on 4 CPUs; real data on 2 CPUs took ~7.5 min per product-day including
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

- Station popups have no arrival/departure times; the sheet has no such columns.
- The sheet still spells "Rio de Janiero" and has no `comments` column (see "Update cruise stations").
- Optional: link cruise.obviewer.com from obviewer.com; open the upstream PR if the author reappears.

Known limitations, not fixed (told to the user on 2026-10-08):
- **No failure alerts.** A failed run only shows in `systemctl status` / the journal. Nobody is
  notified (no email/Slack hook).
- **Nothing is ever pruned.** Tiles older than the 8 listed days and the downloaded NetCDF files in
  `/var/lib/seaview/data` accumulate. Small at zoom 0–8, but unbounded.
- **Browser tile cache is 1 day** (`/tiles/` max-age=86400). After regenerating tiles at the same URLs
  (e.g. new colour ranges), viewers can see old tiles until it expires or they hard-refresh.
- **Overlapping boxes stack.** SUBSEA and Bioreactors overlap (32°S–17°S). Same colours, but two layers
  at 0.7 opacity look more opaque there.
- The layout hasn't been tried on a phone.
- The GlobColour NRT dataset version in use retires 2027-01-12 (the code doesn't pin a version).
