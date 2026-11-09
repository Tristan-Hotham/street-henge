"""Step 2: named streets from OpenFreeMap. For every zoom-14 tile touching a town's circle, the transportation_name
layer is read and each named line of a road class (trunk to minor, service, busway, and pedestrian streets; motorways,
footpaths, cycleways and tracks left out) is clipped to the tile's own square (the tiles overlap by a buffer) and kept
in lon/lat. Each tile's lines are cached in TILECACHE as a small pickle, so that a rerun does not fetch again.
Output: TILECACHE/{x}_{y}.pkl.gz
"""
import sys, time, gzip, pickle, urllib.request
import numpy as np, pandas as pd
import mapbox_vector_tile as mvt
from shapely.geometry import LineString, MultiLineString, box
from concurrent.futures import ThreadPoolExecutor
from common import *

Z = 14
n = 2 ** Z
UA = {"User-Agent": "street-henge-study/1.0 (research; maps.tristanhotham.com)"}
T = pd.read_csv(os.path.join(DATA, "towns.csv"))


def tile_xy(lon, lat):
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def town_tiles(r):
    dlat = r.r_km * 1000 / 111195
    dlon = dlat / math.cos(math.radians(r.lat))
    x0, y0 = tile_xy(r.lon - dlon, r.lat + dlat)
    x1, y1 = tile_xy(r.lon + dlon, r.lat - dlat)
    out = set()
    for x in range(int(x0), int(x1) + 1):
        for y in range(int(y0), int(y1) + 1):
            # keep tiles whose square comes within the circle
            cx, cy = (min(max(tile_xy(r.lon, r.lat)[0], x), x + 1), min(max(tile_xy(r.lon, r.lat)[1], y), y + 1))
            lon = cx / n * 360 - 180
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * cy / n))))
            if math.hypot((lon - r.lon) * 111.195 * math.cos(math.radians(r.lat)), (lat - r.lat) * 111.195) <= r.r_km:
                out.add((x, y))
    return out


if __name__ == "__main__":
    tiles = sorted(set().union(*[town_tiles(r) for r in T.itertuples()]))
    todo = [t for t in tiles if not os.path.exists(os.path.join(TILECACHE, f"{t[0]}_{t[1]}.pkl.gz"))]
    print("tiles", len(tiles), "to fetch", len(todo), file=sys.stderr)
    jsave([list(t) for t in tiles], os.path.join(WORK, "tiles.json"))
    tj = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers=UA)))
    URL = tj["tiles"][0]
    jsave({"tiles": URL}, os.path.join(WORK, "tilejson.json"))
    CLIP = box(0, 0, 4096, 4096)

    def fetch(t):
        x, y = t
        for k in range(5):
            try:
                req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers=UA)
                b = urllib.request.urlopen(req, timeout=60).read()
                d = mvt.decode(b, default_options={"y_coord_down": True})
                lay = d.get("transportation_name")
                out = []
                if lay:
                    ext = lay["extent"]
                    for f in lay["features"]:
                        p = f["properties"]
                        nm = p.get("name")
                        cl = p.get("class")
                        if not nm or not (cl in ROAD_CLASSES or (cl == "path" and p.get("subclass") == "pedestrian")):
                            continue
                        g = f["geometry"]
                        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
                        for ln in parts:
                            if len(ln) < 2:
                                continue
                            gg = LineString(np.array(ln, float) * (4096 / ext)).intersection(CLIP)
                            for seg in (gg.geoms if hasattr(gg, "geoms") else [gg]):
                                if seg.geom_type != "LineString" or seg.length < 1:
                                    continue
                                a = np.array(seg.coords)
                                lon = (x + a[:, 0] / 4096) / n * 360 - 180
                                lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (y + a[:, 1] / 4096) / n))))
                                out.append((nm, cl, p.get("ref"), np.c_[lon, lat].astype(np.float64)))
                with gzip.open(os.path.join(TILECACHE, f"{x}_{y}.pkl.gz"), "wb") as fo:
                    pickle.dump(out, fo)
                return True
            except Exception as ex:
                time.sleep(2 + 3 * k)
        print("failed", t, file=sys.stderr)
        return False

    t0 = time.time()
    with ThreadPoolExecutor(int(os.environ.get("SH_THREADS", 6))) as ex:
        for j, ok in enumerate(ex.map(fetch, todo)):
            if j % 1000 == 0:
                print(j, round(time.time() - t0), file=sys.stderr)
    print("done", round(time.time() - t0), file=sys.stderr)
