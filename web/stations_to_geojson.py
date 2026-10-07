"""Convert a station list (CSV) to the GeoJSON format the map reads.

Required columns: name, lat, lon
Optional columns: arrive, departure, depth, duration, comments, stationCode

Usage:
    python stations_to_geojson.py wam_stations.csv data/stations/wam.geojson
"""
import csv
import json
import sys

OPTIONAL = ["stationCode", "arrive", "departure", "duration", "comments", "depth"]


def convert(csv_path, geojson_path):
    features = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
            props = {"name": row["name"]}
            props.update({k: row.get(k, "") for k in OPTIONAL})
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point",
                             "coordinates": [float(row["lon"]), float(row["lat"])]},
                "properties": props,
            })
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, indent=2)
    print(f"Wrote {len(features)} stations to {geojson_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    convert(sys.argv[1], sys.argv[2])
