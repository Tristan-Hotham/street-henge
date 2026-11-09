"""Step 3: the straight sections of every named street in every town.

For each town, the cached lines of all tiles touching its circle are grouped by street name, joined end to end
(shapely unary_union + linemerge) in a local metric frame about the town centre, and searched for straight sections:
a run of vertices is straight when every vertex lies within TOL (5 m) of the chord joining its two ends. Runs are
grown greedily from each start vertex; a run of MIN_LEN (300 m) or more is kept and the search restarts at its end.
Two carriageways of one road (same name, bearing within 2 degrees, less than 40 m apart side by side, overlapping
along their length) are one street; the longer is kept. Each section belongs to the town with the nearest centre,
among those whose circle holds its midpoint.
The bearing of a section is that of its chord, measured in a local frame at its own midpoint; end 1 is the end
from which the chord bearing lies between 0 and 180 degrees (so end 1 is the western end).
Output: WORK/sections.pkl
"""
import sys, gzip, pickle, importlib.util
import numpy as np, pandas as pd
from shapely.geometry import LineString, MultiLineString
from shapely.ops import unary_union, linemerge
from common import *

spec = importlib.util.spec_from_file_location("t2", os.path.join(ROOT, "code", "02_tiles.py"))
t2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(t2)
T = pd.read_csv(os.path.join(DATA, "towns.csv"))
kx = np.cos(np.radians(T.lat.values))
R = R_EARTH


def load_tile(t):
    p = os.path.join(TILECACHE, f"{t[0]}_{t[1]}.pkl.gz")
    if not os.path.exists(p):
        return None
    with gzip.open(p, "rb") as f:
        return pickle.load(f)


def runs(P):
    """maximal straight runs (index pairs) of a polyline P (n x 2 metres)"""
    out, i, n = [], 0, len(P)
    while i < n - 1:
        j = i + 1
        while j + 1 < n:
            a, b = P[i], P[j + 1]
            d = b - a
            L = math.hypot(*d)
            if L < 1e-6:
                break
            mid = P[i + 1:j + 1]
            off = np.abs((mid[:, 0] - a[0]) * d[1] - (mid[:, 1] - a[1]) * d[0]) / L
            if off.max() > TOL:
                break
            j += 1
        if math.hypot(*(P[j] - P[i])) >= MIN_LEN:
            out.append((i, j))
            i = j
        else:
            i += 1
    return out


def nearest_town(lon, lat):
    d = np.hypot((lon - T.lon.values) * 111.195 * math.cos(math.radians(lat)), (lat - T.lat.values) * 111.195)
    inside = d <= T.r_km.values
    if not inside.any():
        return -1
    d = np.where(inside, d, 1e9)
    return int(np.argmin(d))


rows = []
missing = 0
for r in T.itertuples():
    ts = t2.town_tiles(r)
    by = {}
    for t in ts:
        L = load_tile(t)
        if L is None:
            missing += 1
            continue
        for nm, cl, ref, a in L:
            by.setdefault(nm, []).append((cl, ref, a))
    k = math.cos(math.radians(r.lat))
    to_xy = lambda a: np.c_[(a[:, 0] - r.lon) * math.radians(1) * R * k, (a[:, 1] - r.lat) * math.radians(1) * R]
    to_ll = lambda p: (r.lon + p[0] / (math.radians(1) * R * k), r.lat + p[1] / (math.radians(1) * R))
    for nm, parts in by.items():
        cls = pd.Series([p[0] for p in parts]).mode()[0]
        ref = next((p[1] for p in parts if p[1]), None)
        lines = [LineString(to_xy(a)) for _, _, a in parts if len(a) >= 2]
        if sum(l.length for l in lines) < MIN_LEN:
            continue
        u = unary_union(lines)
        g = linemerge(u) if u.geom_type == "MultiLineString" else u
        for ln in (g.geoms if hasattr(g, "geoms") else [g]):
            if ln.length < MIN_LEN:
                continue
            P = np.array(ln.coords)
            for i, j in runs(P):
                a, b = P[i], P[j]
                lon1, lat1 = to_ll(a); lon2, lat2 = to_ll(b)
                mlon, mlat = (lon1 + lon2) / 2, (lat1 + lat2) / 2
                if nearest_town(mlon, mlat) != r.tid:
                    continue
                km = math.cos(math.radians(mlat))
                dx = (lon2 - lon1) * math.radians(1) * R * km
                dy = (lat2 - lat1) * math.radians(1) * R
                brg = math.degrees(math.atan2(dx, dy)) % 360
                if brg >= 180:
                    lon1, lat1, lon2, lat2 = lon2, lat2, lon1, lat1
                    brg -= 180
                # how straight: largest offset of the true line from the chord (m)
                mid = P[i:j + 1]
                d = b - a
                off = np.abs((mid[:, 0] - a[0]) * d[1] - (mid[:, 1] - a[1]) * d[0]) / max(math.hypot(*d), 1e-6)
                rows.append(dict(tid=r.tid, town=r.name, name=nm, cls=cls, ref=ref, lon1=lon1, lat1=lat1, lon2=lon2, lat2=lat2,
                                 mlon=mlon, mlat=mlat, length=round(math.hypot(dx, dy), 1), bearing=round(brg, 3),
                                 max_off=round(float(off.max()), 2), nverts=j - i + 1))
    if r.tid % 25 == 0:
        print(r.tid, r.name, len(rows), file=sys.stderr)
S = pd.DataFrame(rows)
print("sections before dedupe", len(S), "missing tiles", missing, file=sys.stderr)

# dual carriageways and the same street found twice
drop = set()
for (tid, nm), d in S.groupby(["tid", "name"]):
    if len(d) < 2:
        continue
    idx = d.sort_values("length", ascending=False).index.tolist()
    for a_ in range(len(idx)):
        i = idx[a_]
        if i in drop:
            continue
        for j in idx[a_ + 1:]:
            if j in drop:
                continue
            db = abs((S.bearing[i] - S.bearing[j] + 90) % 180 - 90)
            if db > 2:
                continue
            km = math.cos(math.radians(S.mlat[i]))
            u = np.array([math.sin(math.radians(S.bearing[i])), math.cos(math.radians(S.bearing[i]))])
            v = np.array([(S.mlon[j] - S.mlon[i]) * 111195 * km, (S.mlat[j] - S.mlat[i]) * 111195])
            along, across = float(v @ u), abs(float(v[0] * u[1] - v[1] * u[0]))
            if across < 40 and abs(along) < (S.length[i] + S.length[j]) / 2:
                drop.add(j)
S = S.drop(index=list(drop)).reset_index(drop=True)
S["sid"] = np.arange(len(S))
S.to_pickle(os.path.join(WORK, "sections.pkl"))
jsave({"before_dedupe": int(len(S) + len(drop)), "dual_dropped": len(drop), "missing_tiles": missing}, os.path.join(WORK, "sections_meta.json"))
print("sections", len(S), "dropped as duplicates", len(drop), file=sys.stderr)
