"""Step 5: when does the sun line up with each street?

For each end of each straight section (looking along the bearing from end 1, and back from end 2), with the terrain
horizon h in that direction: the sun's centre stands on that skyline, exactly down the street, when its declination
is d = asin(sin(lat) sin(h) + cos(lat) cos(h) cos(az)) (h the true altitude, after Bennett's refraction). If
|d| <= 23.44 degrees that happens on one or two days a year (found from the Spencer declination series, for 2026);
the event is a sunrise if the direction is east of the meridian (az < 180) and a sunset if west.
Solstice alignment: the street direction lies within 1 degree (strict) or 2 degrees (loose) of the azimuth of the
solstice sunrise or sunset over its own horizon. The same for the equinoxes (declination 0; 20 March and
23 September in 2026 are within a day).
Output: WORK/henge.pkl (one row per section end)
"""
import sys
import numpy as np, pandas as pd
from common import *

S = pd.read_pickle(os.path.join(WORK, "sections.pkl"))
H = pd.read_pickle(os.path.join(WORK, "horizon.pkl"))
S = S.merge(H, on="sid")
rows = []
for end, az, h, lon, lat in [("fwd", S.bearing.values, S.h_fwd.values, S.lon1.values, S.lat1.values),
                              ("back", (S.bearing.values + 180) % 360, S.h_back.values, S.lon2.values, S.lat2.values)]:
    rows.append(pd.DataFrame({"sid": S.sid.values, "end": end, "az": np.round(az, 3), "h": h, "lat": S.mlat.values}))
E = pd.concat(rows, ignore_index=True)
E["kind"] = np.where(E.az < 180, "rise", "set")
E["dec"] = decl_for(E.lat.values, E.az.values, E.h.values)
setting = E.kind.values == "set"
for nm, dec in [("ss", OBLIQ), ("ws", -OBLIQ), ("eq", 0.0)]:
    a = np.where(setting, az_for(E.lat.values, dec, E.h.values, True), az_for(E.lat.values, dec, E.h.values, False))
    E[f"d_{nm}"] = np.round(E.az.values - a, 3)          # street direction minus the sun's azimuth at that event
E["sol_off"] = np.minimum(np.abs(E.d_ss), np.abs(E.d_ws))
E["sol"] = np.where(np.abs(E.d_ss) <= np.abs(E.d_ws), "summer", "winter")
E["ok"] = np.abs(E.dec) <= OBLIQ
# the days: two (or one at a solstice), as day of year
D1, D2 = [], []
for dec, ok in zip(E.dec.values, E.ok.values):
    ds = days_for_decl(dec) if ok else []
    D1.append(round(ds[0], 2) if ds else np.nan)
    D2.append(round(ds[1], 2) if len(ds) > 1 else np.nan)
E["day1"], E["day2"] = D1, D2
# streets just beyond the solstice azimuth, within the strict window, are a solstice henge
near = (~E.ok) & (E.sol_off <= ALIGN[0])
E.loc[near & (E.sol == "summer"), "day1"] = 172.0
E.loc[near & (E.sol == "winter"), "day1"] = 355.0
E.to_pickle(os.path.join(WORK, "henge.pkl"))
print(len(E), "ends;", int(E.ok.sum()), "with a henge day;", "solstice within 1:", int((E.sol_off <= 1).sum()), "within 2:", int((E.sol_off <= 2).sum()), file=sys.stderr)
