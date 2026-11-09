"""Step 6b: an independent check of the Milton Keynes result, added to data/results.json under "mk_check".

1. The bearing of Midsummer Boulevard straight from the vector tiles (no joining, no straight-run search): every
   mapped piece named Midsummer Boulevard longer than 150 m, its geodesic azimuth on the WGS84 ellipsoid (pyproj),
   the principal axis of all its vertices, and the same line's bearing on the Ordnance Survey National Grid
   (EPSG:27700), whose grid north differs from true north by the grid convergence.
2. The midsummer sunrise azimuth at the boulevard with a separate ephemeris (PyEphem, 21 June 2026, standard
   pressure refraction): upper limb on a flat horizon, centre on a flat horizon, and the sun's altitude and time when
   its azimuth equals the boulevard's bearing.
Needs network access to tiles.openfreemap.org; pip install ephem pyproj.
"""
import urllib.request
import numpy as np, ephem, mapbox_vector_tile as mvt
from pyproj import Geod, Transformer
from common import *

UA = {"User-Agent": "street-henge-study/1.0 (research; maps.tristanhotham.com)"}
URL = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers=UA)))["tiles"][0]
Z = 14; n = 2 ** Z
G = Geod(ellps="WGS84")


def txy(lon, lat):
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n


x0, y0 = txy(-0.79, 52.055); x1, y1 = txy(-0.72, 52.03)
pieces = []
for x in range(int(x0), int(x1) + 1):
    for y in range(int(y0), int(y1) + 1):
        d = mvt.decode(urllib.request.urlopen(urllib.request.Request(URL.format(z=Z, x=x, y=y), headers=UA), timeout=60).read(),
                       default_options={"y_coord_down": True})
        L = d.get("transportation_name")
        for f in (L["features"] if L else []):
            if f["properties"].get("name") != "Midsummer Boulevard":
                continue
            g = f["geometry"]
            for ln in ([g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]):
                a = np.array(ln, float) / L["extent"]
                lon = (x + a[:, 0]) / n * 360 - 180
                lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (y + a[:, 1]) / n))))
                pieces.append(np.c_[lon, lat])
az = []
for p in pieces:
    a_, _, dist = G.inv(p[0, 0], p[0, 1], p[-1, 0], p[-1, 1])
    if dist > 150:
        az.append((a_ % 180, dist))
P = np.vstack(pieces)
lat0 = P[:, 1].mean()
X = np.c_[(P[:, 0] - P[:, 0].mean()) * 111320 * math.cos(math.radians(lat0)), (P[:, 1] - lat0) * 110574]
v = np.linalg.svd(X - X.mean(0), full_matrices=False)[2][0]
pca = math.degrees(math.atan2(v[0], v[1])) % 180
t = X @ v; i, j = int(t.argmin()), int(t.argmax())
true_end, _, length = G.inv(P[i, 0], P[i, 1], P[j, 0], P[j, 1])
T = Transformer.from_crs(4326, 27700, always_xy=True)
(e1, n1), (e2, n2) = T.transform(*P[i]), T.transform(*P[j])
grid_end = math.degrees(math.atan2(e2 - e1, n2 - n1)) % 180

o = ephem.Observer(); o.lat, o.lon = str(52.04), str(-0.76); o.elevation = 90; o.pressure = 1010
s = ephem.Sun()
o.date = "2026/6/21 00:00"; r = o.next_rising(s); o.date = r; s.compute(o); limb = math.degrees(s.az); t_limb = ephem.Date(r)
o.date = "2026/6/21 00:00"; r = o.next_rising(s, use_center=True); o.date = r; s.compute(o); centre = math.degrees(s.az)
brg = jload(os.path.join(DATA, "results.json"))["midsummer_boulevard"]["bearing"]
tt = t_limb
while True:
    o.date = tt; s.compute(o)
    if math.degrees(s.az) >= brg:
        break
    tt = ephem.Date(tt + 10 * ephem.second)
alt_on = math.degrees(s.alt); mins = (tt - t_limb) * 24 * 60
R = jload(os.path.join(DATA, "results.json"))
R["mk_check"] = {"n_pieces": len(az), "piece_min": round(min(a for a, _ in az), 1), "piece_max": round(max(a for a, _ in az), 1),
                 "pca": round(pca, 1), "true_end": round(true_end % 180, 1), "grid_end": round(grid_end, 1),
                 "convergence": round(true_end % 180 - grid_end, 1), "mapped_km": round(length / 1000, 2),
                 "eph_limb": round(limb, 1), "eph_centre": round(centre, 1), "eph_alt_on_axis": round(alt_on, 1),
                 "eph_min_after_gleam": round(mins)}
jsave(R, os.path.join(DATA, "results.json"), indent=1)
print(R["mk_check"])
