"""Colorbar legend images for the web map.

Renders one vertical colorbar PNG per tiled product using the same
colormap, range and contour levels as the tiles, so the legend always
matches the active cruise settings.
"""
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from . import config
from .tilers.utils import get_cmap
settings = config.settings

LABELS = {
    "ssh": "Sea Surface Height (m)",
    "ostia": "Sea Surface Temperature (°C)",
    "globcolour": "Chlorophyll (mg/m3)",
}
# Chlorophyll tiles are ln(Chl); label the colorbar in mg/m3.
CHL_TICKS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100]


def render(product, output_dir):
    """Write ``<product>.png`` to output_dir and return its path."""
    prod = settings[product]
    vmin, vmax = prod["vmin"], prod["vmax"]
    levels = np.linspace(vmin, vmax, prod.get("levels", 20))
    cmap = get_cmap(prod["cmap"])
    norm = matplotlib.colors.BoundaryNorm(levels, cmap.N, extend="both")

    fig = plt.figure(figsize=(0.94, 3.12), dpi=100)
    ax = fig.add_axes([0.12, 0.05, 0.2, 0.9])
    cb = fig.colorbar(matplotlib.cm.ScalarMappable(norm=norm, cmap=cmap),
                      cax=ax, extend="both", extendfrac=0.03)
    if product == "globcolour":
        ticks = [t for t in CHL_TICKS if vmin <= np.log(t) <= vmax]
        cb.set_ticks(np.log(ticks), labels=[f"{t:g}" for t in ticks])
    else:
        ticks = matplotlib.ticker.MaxNLocator(nbins=6).tick_values(vmin, vmax)
        cb.set_ticks([t for t in ticks if vmin <= t <= vmax])
    cb.ax.tick_params(labelsize=7)
    cb.set_label(LABELS[product], fontsize=8, rotation=270, labelpad=10)

    path = pathlib.Path(output_dir) / f"{product}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, transparent=True)
    plt.close(fig)
    return path


def generate(output_dir):
    """Render colorbars for all products listed in ``updated_tiles``."""
    return [render(product, output_dir) for product in settings["updated_tiles"]]
