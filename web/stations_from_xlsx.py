"""Convert cruise station lists from an Excel workbook to the map's GeoJSON files.

The first sheet needs the columns cruise, station, lat, lon. Optional columns
arrive, departure, depth, duration and comments are copied into the station
popups. Stations keep the row order of the sheet, which is the order the
route line connects them in.

Usage (one "<cruise in sheet>=<output name>" pair per cruise):
    python web/stations_from_xlsx.py cruise_stations.xlsx "WAM 1=wam" "SUBSEA 1=subsea"
writes web/data/stations/wam.geojson and web/data/stations/subsea.geojson.

Requires openpyxl (pip install openpyxl).
"""
import json
import pathlib
import sys

import openpyxl

OPTIONAL = ["stationCode", "arrive", "departure", "duration", "comments", "depth"]
OUT_DIR = pathlib.Path(__file__).parent / "data" / "stations"


def read_rows(xlsx_path):
    sheet = openpyxl.load_workbook(xlsx_path, data_only=True).worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    return [dict(zip(header, r)) for r in rows[1:] if any(v is not None for v in r)]


def to_geojson(rows):
    features = []
    for row in rows:
        props = {"name": str(row["station"]).strip()}
        props.update({k: "" if row.get(k) is None else str(row[k]) for k in OPTIONAL})
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(row["lon"]), float(row["lat"])]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def main(xlsx_path, pairs):
    rows = read_rows(xlsx_path)
    for pair in pairs:
        cruise, _, out_name = pair.partition("=")
        selected = [r for r in rows if str(r["cruise"]).strip() == cruise.strip()]
        if not selected:
            sys.exit(f"No rows for cruise '{cruise}'. Cruises in the sheet: "
                     f"{sorted({str(r['cruise']) for r in rows})}")
        out = OUT_DIR / f"{out_name.strip()}.geojson"
        out.write_text(json.dumps(to_geojson(selected), indent=2), encoding="utf-8")
        print(f"{cruise}: {len(selected)} stations -> {out}")


if __name__ == "__main__":
    if len(sys.argv) < 3 or not all("=" in p for p in sys.argv[2:]):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
