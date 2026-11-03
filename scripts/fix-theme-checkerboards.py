#!/usr/bin/env python3
"""Remove painted grey/white checkerboards from built-in theme art.

Checker pixels = near-neutral (R~G~B) pixels whose luma sits in the checker's
band. Components (8-connected) are removed when they touch the image border or
are large (>= MIN_INTERIOR px, i.e. checker showing through gaps in the scene).
A 1px half-alpha feather is left on the surviving edge.
Usage: python3 scripts/fix-theme-checkerboards.py <png> [<png> ...]
Originals are NOT backed up here; copy them first.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# (luma_lo, luma_hi, max_chroma, min_interior_component)
BANDS = {
    "bg_mid.png": (168, 255, 10, 100),
    "sky.png": (235, 255, 8, 20000),
    "mountains.png": (235, 255, 8, 20000),
    "bg_near.png": (52, 106, 8, 1500),
}
ALL8 = np.ones((3, 3))

def fix(path):
    lo, hi, chroma, min_int = BANDS[os.path.basename(path)]
    a = np.array(Image.open(path).convert("RGBA"))
    rgb = a[..., :3].astype(int)
    luma = rgb.mean(2)
    m = ((rgb.max(2) - rgb.min(2)) <= chroma) & (luma >= lo) & (luma <= hi)
    m = ndi.binary_closing(m, structure=ALL8, iterations=1) & (m | ((rgb.max(2) - rgb.min(2)) <= chroma))
    lab, n = ndi.label(m, structure=ALL8)
    sizes = np.bincount(lab.ravel())
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    keep = [i for i in range(1, n + 1) if i in border or sizes[i] >= min_int]
    bg = np.isin(lab, keep)
    edge = ndi.binary_dilation(bg) & ~bg
    a[bg, 3] = 0
    a[edge, 3] = 128
    Image.fromarray(a).save(path)
    print(path, "removed %.1f%%" % (100 * bg.mean()))

if __name__ == "__main__":
    for p in sys.argv[1:]:
        fix(p)
