"""Tests for the seaview.publish module (daily tile job)."""

import json

import pandas as pd
import pytest

from seaview import publish
from seaview.utils import DataObjectError


@pytest.fixture
def tile_dir(temp_dir, monkeypatch):
    tiles = temp_dir / "tiles" / "WAM"
    monkeypatch.setitem(publish.settings, "tile_dir", str(tiles))
    monkeypatch.setitem(publish.settings, "updated_tiles", ["ssh", "ostia", "globcolour"])
    monkeypatch.setitem(publish.settings, "max_tile_days", 8)
    monkeypatch.setitem(publish.settings, "cruise_name", "WAM")
    monkeypatch.setitem(publish.settings, "remote_url", "")
    return tiles


def make_product(tile_dir, product, calls):
    def run(dtm, verbose, force):
        calls.append(product)
        (tile_dir / product / str(pd.to_datetime(dtm).date()) / "0").mkdir(parents=True)
    return run


class TestProcessDay:

    def test_skips_existing_days(self, tile_dir, monkeypatch):
        (tile_dir / "ssh" / "2026-10-05").mkdir(parents=True)
        calls = []
        monkeypatch.setattr(publish, "PRODUCTS",
                            {p: make_product(tile_dir, p, calls) for p in ["ssh", "ostia", "globcolour"]})
        assert publish.process_day("2026-10-05") == []
        assert calls == ["ostia", "globcolour"]

    def test_failure_removes_partial_output_and_continues(self, tile_dir, monkeypatch):
        def broken(dtm, verbose, force):
            (tile_dir / "ssh" / "2026-10-05" / "0").mkdir(parents=True)
            raise RuntimeError("tiling crashed")

        def no_data(dtm, verbose, force):
            pass  # e.g. CoordinatesOutOfDatasetBounds handled inside tile.*

        monkeypatch.setattr(publish, "PRODUCTS", {"ssh": broken, "ostia": no_data, "globcolour": no_data})
        failures = publish.process_day("2026-10-05")
        assert [f[:2] for f in failures] == [("ssh", "2026-10-05")]
        assert not (tile_dir / "ssh" / "2026-10-05").exists()

    def test_empty_download_is_not_a_failure(self, tile_dir, monkeypatch):
        def empty(dtm, verbose, force):
            raise DataObjectError("The CHL data variable is empty")

        monkeypatch.setattr(publish, "PRODUCTS", {"ssh": empty, "ostia": empty, "globcolour": empty})
        assert publish.process_day("2026-10-05") == []
        assert not (tile_dir / "ssh" / "2026-10-05").exists()


class TestBuildLayerConfig:

    def test_drops_products_without_tiles_and_sets_dates(self, tile_dir, temp_dir):
        for d in pd.date_range("2026-09-20", "2026-10-05"):
            (tile_dir / "ssh" / str(d.date())).mkdir(parents=True)
        (tile_dir / "ostia" / "2026-10-04").mkdir(parents=True)
        out = temp_dir / "out"
        out.mkdir()
        data = json.loads(publish.build_layer_config(out).read_text())
        assert data["base_url"] == "/tiles/WAM"
        layers = {l["id"]: l["date_range"] for l in data["layers"]}
        assert layers == {"ssh": {"start": "2026-09-28", "end": "2026-10-05"},
                          "ostia": {"start": "2026-10-04", "end": "2026-10-04"}}


class TestDaily:

    def test_writes_layer_config_and_colorbars_to_web_dir(self, tile_dir, temp_dir, monkeypatch):
        calls = []
        monkeypatch.setattr(publish, "PRODUCTS",
                            {p: make_product(tile_dir, p, calls) for p in ["ssh", "ostia", "globcolour"]})
        monkeypatch.setattr(publish.colorbars, "generate",
                            lambda d: d.mkdir(parents=True) or (d / "ssh.png").write_bytes(b"png"))
        assert publish.daily(web_dir=temp_dir, days=2) == []
        assert len(calls) == 6
        data = json.loads((temp_dir / "layer_config.json").read_text())
        assert {l["id"] for l in data["layers"]} == {"ssh", "ostia", "globcolour"}
        assert (temp_dir / "colorbars" / "ssh.png").is_file()
        assert not (temp_dir / "layer_config.json.tmp").exists()
