"""Step 4: the terrain horizon at both ends of every straight section.

Looking along a street from one end towards the other, the sun can only line up with it where it clears the skyline
beyond. For each section and each of its two directions, the viewer stands at the near end, 1.7 m above the ground,
and the horizon angle is the highest elevation angle to the terrain along that bearing, from 100 m to 40 km, allowing
for the Earth's curvature and standard refraction (k = 0.13). Heights come from the AWS Terrain Tiles at zoom 10
(about 95 m cells in Britain), read with bilinear interpolation; to ignore the single-cell spikes these tiles carry,
each sample takes the median of the nine cells around it. Buildings and trees are not in the terrain, so the
horizon is the land's skyline, not the street's.
Output: WORK/horizon.pkl (sid, h_fwd: looking along the bearing from end 1, h_back: looking back from end 2)
"""
import sys
import numpy as np, pandas as pd
from PIL import Image
from common import *

Z = 10
S = pd.read_pickle(os.path.join(WORK, "sections.pkl"))
n = 256 * 2 ** Z


def ll2px(lon, lat):
    lat = np.radians(np.asarray(lat, float))
    return (np.asarray(lon, float) + 180.0) / 360.0 * n, (1 - np.log(np.tan(lat) + 1 / np.cos(lat)) / np.pi) / 2 * n


xs = sorted(int(d) for d in os.listdir(TILES))
X0, X1 = xs[0], xs[-1]
ys = sorted(int(f[:-4]) for f in os.listdir(os.path.join(TILES, str(X0))))
Y0, Y1 = min(ys), max(ys)
for x in xs:
    yy = [int(f[:-4]) for f in os.listdir(os.path.join(TILES, str(x)))]
    Y0, Y1 = min(Y0, min(yy)), max(Y1, max(yy))
NX, NY = (X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256
dem = np.zeros((NY, NX), np.float32)
for tx in range(X0, X1 + 1):
    for ty in range(Y0, Y1 + 1):
        p = f"{TILES}/{tx}/{ty}.png"
        if os.path.exists(p):
            a = np.asarray(Image.open(p).convert("RGB"), np.float32)
            dem[(ty - Y0) * 256:(ty - Y0 + 1) * 256, (tx - X0) * 256:(tx - X0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
dem = np.maximum(dem, -5)          # sea and estuaries: sea level
print("dem", dem.shape, file=sys.stderr)
reff2 = 2 * R_EARTH / (1 - K_REFR)
PIX0 = 2 * math.pi * 6378137.0 / n


def sample(px, py):
    """median of the 3 x 3 cells around each fractional pixel, bilinear in the middle"""
    x0 = np.clip(np.floor(px).astype(int), 1, NX - 3); y0 = np.clip(np.floor(py).astype(int), 1, NY - 3)
    fx, fy = px - x0, py - y0
    bil = (dem[y0, x0] * (1 - fx) + dem[y0, x0 + 1] * fx) * (1 - fy) + (dem[y0 + 1, x0] * (1 - fx) + dem[y0 + 1, x0 + 1] * fx) * fy
    st = np.stack([dem[y0 + dy, x0 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)], 0)
    med = np.median(st, 0)
    # keep the interpolated value unless it stands far off its neighbourhood (a spike)
    return np.where(np.abs(bil - med) > 40, med, bil)


D = []
d = 100.0
while d <= 40000:
    D.append(d); d += max(50.0, 0.03 * d)
D = np.array(D)


def horizon(lon, lat, az):
    px, py = ll2px(lon, lat)
    px, py = px - X0 * 256, py - Y0 * 256          # into the mosaic
    scale = PIX0 * np.cos(np.radians(lat))
    h0 = sample(px, py) + OBS_H
    h0 = np.maximum(h0, OBS_H)
    sa, ca = np.sin(np.radians(az)), np.cos(np.radians(az))
    best = np.full(len(lon), -1e9)
    for dd in D:
        p = dd / scale
        hs = sample(px + sa * p, py - ca * p)
        t = (hs - h0 - dd * dd / reff2) / dd
        best = np.maximum(best, t)
    return np.degrees(np.arctan(best)), h0 - OBS_H


hf, g1 = horizon(S.lon1.values, S.lat1.values, S.bearing.values)
hb, g2 = horizon(S.lon2.values, S.lat2.values, (S.bearing.values + 180) % 360)
H = pd.DataFrame({"sid": S.sid, "h_fwd": np.round(hf, 3), "h_back": np.round(hb, 3), "ground1": np.round(g1, 1), "ground2": np.round(g2, 1)})
H.to_pickle(os.path.join(WORK, "horizon.pkl"))
print(H.describe().round(2).to_string(), file=sys.stderr)
