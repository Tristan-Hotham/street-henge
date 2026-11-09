"""Step 3b: join straight sections of one street that continue each other.

The straight-run search restarts wherever a street bends by more than the tolerance, so a long straight road with a
slight kink comes out as two or three sections in line. Two sections of the same street in the same town are joined
when their bearings differ by 1 degree or less, the end of one lies within 25 m of the start of the other, and all
four end points lie within 2 x TOL (10 m) of the joined chord. Repeated until nothing joins.
Output: WORK/sections.pkl (rewritten; the unjoined table is kept as sections_raw.pkl)
"""
import sys
import numpy as np, pandas as pd
from common import *

P = os.path.join(WORK, "sections.pkl")
RAW = os.path.join(WORK, "sections_raw.pkl")
if not os.path.exists(RAW):
    os.rename(P, RAW)
S = pd.read_pickle(RAW)
R = R_EARTH


def xy(lon, lat, lat0):
    return np.array([lon * math.radians(1) * R * math.cos(math.radians(lat0)), lat * math.radians(1) * R])


rows = []
joined = 0
for (tid, nm), d in S.groupby(["tid", "name"], sort=False):
    segs = [r for r in d.to_dict("records")]
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for i in range(len(segs)):
            for j in range(i + 1, len(segs)):
                a, b = segs[i], segs[j]
                if abs((a["bearing"] - b["bearing"] + 90) % 180 - 90) > 1.0:
                    continue
                lat0 = a["mlat"]
                pa = [xy(a["lon1"], a["lat1"], lat0), xy(a["lon2"], a["lat2"], lat0)]
                pb = [xy(b["lon1"], b["lat1"], lat0), xy(b["lon2"], b["lat2"], lat0)]
                gap = min(np.hypot(*(p - q)) for p in pa for q in pb)
                if gap > 25:
                    continue
                pts = pa + pb
                u = np.array([math.sin(math.radians(a["bearing"])), math.cos(math.radians(a["bearing"]))])
                t = [float(p @ u) for p in pts]
                p0, p1 = pts[int(np.argmin(t))], pts[int(np.argmax(t))]
                dvec = p1 - p0
                L = float(np.hypot(*dvec))
                off = max(abs((p - p0)[0] * dvec[1] - (p - p0)[1] * dvec[0]) / L for p in pts)
                if off > 2 * TOL:
                    continue
                k = math.cos(math.radians(lat0))
                ll = lambda p: (p[0] / (math.radians(1) * R * k), p[1] / (math.radians(1) * R))
                (lo1, la1), (lo2, la2) = ll(p0), ll(p1)
                mlat = (la1 + la2) / 2
                km = math.cos(math.radians(mlat))
                brg = math.degrees(math.atan2((lo2 - lo1) * math.radians(1) * R * km, (la2 - la1) * math.radians(1) * R)) % 360
                if brg >= 180:
                    lo1, la1, lo2, la2 = lo2, la2, lo1, la1
                    brg -= 180
                new = dict(a, lon1=lo1, lat1=la1, lon2=lo2, lat2=la2, mlon=(lo1 + lo2) / 2, mlat=mlat,
                           length=round(math.hypot((lo2 - lo1) * math.radians(1) * R * km, (la2 - la1) * math.radians(1) * R), 1),
                           bearing=round(brg, 3), max_off=round(max(a["max_off"], b["max_off"], off), 2), nverts=a["nverts"] + b["nverts"],
                           cls=a["cls"] if a["length"] >= b["length"] else b["cls"])
                segs = [s for k_, s in enumerate(segs) if k_ not in (i, j)] + [new]
                joined += 1
                changed = True
                break
            if changed:
                break
    rows += segs
S2 = pd.DataFrame(rows).reset_index(drop=True)
S2["sid"] = np.arange(len(S2))
S2.to_pickle(P)
m = jload(os.path.join(WORK, "sections_meta.json"))
m["joins"] = joined
m["after_join"] = len(S2)
jsave(m, os.path.join(WORK, "sections_meta.json"))
print("joined", joined, "sections", len(S), "->", len(S2), "longest", S2.length.max(), file=sys.stderr)
