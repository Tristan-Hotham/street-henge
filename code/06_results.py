"""Step 6: every number in the study, into data/results.json, and the page and download data.

Streets and roads: the headline lists of "henge streets" leave out trunk roads and anything named as a bypass, bridge,
pier, viaduct, flyover, link or relief road or interchange (they are roads, not streets), using the documented
rules in code/overrides.csv (by name pattern or by town and name). They stay in the data, flagged.
Chance: a street is "solstice aligned" when either of its ends lies within 1 degree of a solstice sunrise or sunset
over its own skyline. The share expected without design is taken from the same streets: the average share per
degree of offset between 2 and 8 degrees from the solstice line (so the shape of each town's grid and the
asymmetry of the sun's range are allowed for), times the 2-degree window.
Outputs: data/results.json, data/streets.csv, data/towns.json, data/towns/*.json, data/solstice_streets.json,
data/town_summary.csv, data/places.json
"""
import re, csv, shutil
import numpy as np, pandas as pd
from scipy.stats import binomtest
from common import *

T = pd.read_csv(os.path.join(DATA, "towns.csv"))
S = pd.read_pickle(os.path.join(WORK, "sections.pkl"))
E = pd.read_pickle(os.path.join(WORK, "henge.pkl"))
H = pd.read_pickle(os.path.join(WORK, "horizon.pkl"))
META = jload(os.path.join(WORK, "sections_meta.json"))
OV = pd.read_csv(os.path.join(ROOT, "code", "overrides.csv"), comment="#", dtype=str).fillna("")
S = S.merge(H, on="sid")
E["soff"] = np.where(np.abs(E.d_ss) <= np.abs(E.d_ws), E.d_ss, E.d_ws)

# ---- roads, not streets
S["road"] = S.cls.eq("trunk")
S["why"] = np.where(S.road, "trunk road", "")
for r in OV.itertuples():
    if r.kind == "pattern":
        m = S.name.str.contains(r.value, case=False, regex=True)
    else:
        town, nm = r.value.split("|")
        m = (S.town == town) & (S.name == nm)
    S.loc[m, "road"] = True
    S.loc[m & (S.why == ""), "why"] = r.reason
R = {}
R["n"] = {"towns": len(T), "tiles": len(jload(os.path.join(WORK, "tiles.json"))), "sections": len(S),
          "km": round(S.length.sum() / 1000), "before_dedupe": META["before_dedupe"], "dual_dropped": META["dual_dropped"],
          "joins": META.get("joins", 0), "roads": int(S.road.sum()), "streets": int((~S.road).sum()),
          "median_len": round(float(S.length.median())), "longest": round(float(S.length.max())),
          "over_1km": int((S.length >= 1000).sum()), "min_pop": MIN_POP, "min_len": int(MIN_LEN), "tol": TOL}
R["n"]["by_cls"] = S.cls.value_counts().to_dict()
# ---- per section summaries
g = E.groupby("sid")
sec = pd.DataFrame({"any": g.ok.any(), "sol_off": g.sol_off.min(), "eq_off": g.d_eq.apply(lambda x: x.abs().min()),
                    "absoff": g.soff.apply(lambda x: x.abs().min())}).reset_index()
S = S.merge(sec, on="sid")
S["sol1"] = S.sol_off <= ALIGN[0]
S["sol2"] = S.sol_off <= ALIGN[1]
S["eq1"] = (S.eq_off <= ALIGN[0]) & S["any"]
R["n"]["with_henge"] = int(S["any"].sum())
R["with_henge_pc"] = round(100 * S["any"].mean(), 1)
R["n"]["sol1"] = int(S.sol1.sum()); R["n"]["sol2"] = int(S.sol2.sum()); R["n"]["eq1"] = int(S.eq1.sum())
R["n"]["sol1_streets"] = int((S.sol1 & ~S.road).sum())
# chance, counted by street end (each end looks one way): the share of ends within 1 degree of a solstice sunrise or
# sunset, against the average share per degree of offset between 2 and 8 degrees either side, times the 2-degree window
ae = E.soff.abs()
k1 = int((ae <= ALIGN[0]).sum())
base = ((ae >= 2) & (ae < 8)).sum() / 12 / len(E) * 2
R["chance"] = {"ends": len(E), "ends_sol1": k1, "sol1_pc": round(100 * k1 / len(E), 2), "expected_pc": round(100 * base, 2),
               "ratio": round(k1 / len(E) / base, 2), "p": float(f"{binomtest(k1, len(E), base, alternative='greater').pvalue:.3g}")}
h, e = np.histogram(E.soff, bins=np.arange(-20, 20.5, 1))
R["offset_hist"] = {"edges": e.tolist(), "counts": h.tolist()}
# kind split of solstice ends
A = E[E.sol_off <= ALIGN[0]]
lab = np.where(A.sol == "summer", np.where(A.kind == "rise", "ms_rise", "ms_set"), np.where(A.kind == "rise", "mw_rise", "mw_set"))
R["sol1_by_kind"] = pd.Series(lab).value_counts().to_dict()

# ---- the best henge streets
def end_txt(sid):
    out = []
    for r in E[E.sid == sid].itertuples():
        if r.sol_off <= ALIGN[1]:
            w = ("midsummer" if r.sol == "summer" else "midwinter") + (" sunrise" if r.kind == "rise" else " sunset")
            out.append((round(r.sol_off, 2), w, round(r.az, 1), round(r.h, 2)))
    return sorted(out)


best = S[S.sol1 & ~S.road].sort_values("length", ascending=False)
R["best_solstice"] = []
for r in best.head(20).itertuples():
    t = end_txt(r.sid)
    R["best_solstice"].append({"town": r.town, "name": r.name, "cls": r.cls, "length": round(r.length), "bearing": round(r.bearing, 1),
                               "event": t[0][1], "off": t[0][0], "az": t[0][2], "h": t[0][3], "both": len([x for x in t if x[0] <= ALIGN[0]]) > 1,
                               "lon": round(r.mlon, 5), "lat": round(r.mlat, 5)})
R["best_solstice_roads"] = [{"town": r.town, "name": r.name, "length": round(r.length), "why": r.why} for r in S[S.sol1 & S.road].sort_values("length", ascending=False).head(6).itertuples()]
R["longest_any"] = [{"town": r.town, "name": r.name, "length": round(r.length), "bearing": round(r.bearing, 1)} for r in S[~S.road & S["any"]].sort_values("length", ascending=False).head(10).itertuples()]
# both solstices at once (one end each)
both = [x for x in R["best_solstice"] if x["both"]]
R["n"]["both_ends_solstice"] = int(sum(1 for sid in S[S.sol1].sid if (E[(E.sid == sid)].sol_off <= ALIGN[0]).sum() == 2))

# ---- Milton Keynes and Midsummer Boulevard
mb = S[(S.town == "Milton Keynes") & (S.name == "Midsummer Boulevard")].sort_values("length", ascending=False)
mbe = E[E.sid.isin(mb.sid)]
ms_rise = mbe[mbe.kind == "rise"]
R["midsummer_boulevard"] = {"n_sections": len(mb), "km": round(mb.length.sum() / 1000, 2), "longest": round(float(mb.length.max())),
                            "bearing": round(float(np.average(mb.bearing, weights=mb.length)), 1),
                            "sun_az_ms_rise": round(float(np.average(ms_rise.az - ms_rise.d_ss, weights=mb.set_index("sid").loc[ms_rise.sid].length)), 1),
                            "off_min": round(float(ms_rise.sol_off.min()), 1), "off_max": round(float(ms_rise.sol_off.max()), 1),
                            "h_min": round(float(ms_rise.h.min()), 1), "h_max": round(float(ms_rise.h.max()), 1),
                            "day1": round(float(ms_rise.day1.mean())), "day2": round(float(ms_rise.day2.mean()))}
mbv = R["midsummer_boulevard"]
mbv["date1"], mbv["date2"] = doy_to_date(mbv["day1"]), doy_to_date(mbv["day2"])
mbv["flat_az"] = round(float(az_for(52.04, OBLIQ, 0.0, False)), 1)
# the first gleam: the sun's upper limb (semi-diameter 0.267 degrees) on a flat horizon
SD = 0.267
mbv["flat_az_limb"] = round(float(az_for(52.04, OBLIQ, -SD, False)), 1)
# how high the midsummer sun's centre stands when it is straight down the boulevard, and how long after first gleam
from scipy.optimize import brentq
h_on = brentq(lambda h: float(az_for(52.04, OBLIQ, h, False)) - mbv["bearing"], -0.5, 10)


def _ha(h_app, lat=52.04, dec=OBLIQ):
    ht = math.radians(h_app - float(refraction(h_app)))
    p, d = math.radians(lat), math.radians(dec)
    return math.degrees(math.acos((math.sin(ht) - math.sin(p) * math.sin(d)) / (math.cos(p) * math.cos(d))))


mbv["alt_on_axis"] = round(h_on, 1)
mbv["min_after_gleam"] = round((_ha(-SD) - _ha(h_on)) * 4)
# the skyline over the land from each end of the boulevard, looking east-north-east along it
mbv["h_west_end"] = round(float(ms_rise.h.max()), 1)
mk = S[S.town == "Milton Keynes"]

# ---- towns: grid, calendar, best streets
def grid_of(d):
    a4 = np.radians((d.bearing.values % 90) * 4)
    w = d.length.values
    C_, S_ = (w * np.cos(a4)).sum(), (w * np.sin(a4)).sum()
    return math.degrees(math.atan2(S_, C_)) / 4 % 90, math.hypot(C_, S_) / w.sum()


def calendar(sids, lengths):
    """metres of street lined up with sunset / sunrise on each day (1..365)"""
    cs, cr = np.zeros(366), np.zeros(366)
    L = dict(zip(sids, lengths))
    for r in E[E.sid.isin(sids)].itertuples():
        days = [d for d in (r.day1, r.day2) if d == d]
        for d in days:
            (cs if r.kind == "set" else cr)[int(round(d)) % 366] += L[r.sid]
    sm = lambda a: np.convolve(np.r_[a[-3:], a, a[:3]], np.ones(7) / 7, "valid")
    return sm(cs), sm(cr)


towns = []
os.makedirs(os.path.join(DATA, "towns"), exist_ok=True)
for f in os.listdir(os.path.join(DATA, "towns")):
    os.remove(os.path.join(DATA, "towns", f))
for t in T.itertuples():
    d = S[S.tid == t.tid]
    if len(d) == 0:
        continue
    gdir, gstr = grid_of(d)
    cs, cr = calendar(d.sid.values, d.length.values)
    ks = int(np.argmax(cs[1:])) + 1; kr = int(np.argmax(cr[1:])) + 1
    kind, peak = ("set", ks) if cs[ks] >= cr[kr] else ("rise", kr)
    pm = cs[ks] if kind == "set" else cr[kr]
    # the best day of the same kind on the other side of the solstice (more than 40 days away)
    cc = (cs if kind == "set" else cr).copy()
    far = np.abs(((np.arange(366) - peak) + 183) % 366 - 183) > 40
    cc[~far] = 0; cc[0] = 0
    peak2 = int(np.argmax(cc)); pm2 = cc[peak2]
    # grid henge dates: the sunset and sunrise days along the four directions of the grid (skyline 0.5 degrees)
    gd = []
    for az in (gdir, gdir + 90, gdir + 180, gdir + 270):
        az %= 360
        dec = float(decl_for(t.lat, az, 0.5))
        if abs(dec) <= OBLIQ:
            ds = days_for_decl(dec)
            gd.append({"az": round(az, 1), "kind": "set" if az >= 180 else "rise", "dates": [doy_to_short(x) for x in ds]})
    sets = [x for x in gd if x["kind"] == "set"]
    if not gd:
        gtxt = f"streets run at {gdir:.0f}° and {gdir + 90:.0f}° from north (grid strength {gstr:.2f}), just beyond the reach of the sun, which never quite lines up with them"
    else:
      gtxt = (f"streets run at {gdir:.0f}° and {gdir + 90:.0f}° from north (grid strength {gstr:.2f}); " +
            "; ".join(f"the sun {'sets' if x['kind'] == 'set' else 'rises'} along them on {' and '.join(x['dates'])}" for x in (sets or gd))) if gd else ""
    b = d[~d.road & d["any"]].sort_values("length", ascending=False).head(5)
    bl = []
    for r in b.itertuples():
        es = E[(E.sid == r.sid) & E.ok]
        txt = "; ".join(f"{'sunset' if e.kind == 'set' else 'sunrise'} {' and '.join(doy_to_short(x) for x in (e.day1, e.day2) if x == x)}" for e in es.itertuples())
        bl.append([int(r.Index), r.name, int(round(r.length)), txt])
    rec = {"tid": int(t.tid), "name": t.name, "qid": t.qid, "lon": round(t.lon, 4), "lat": round(t.lat, 4), "pop": int(t.pop), "r_km": t.r_km,
           "n": len(d), "km": round(d.length.sum() / 1000, 1), "sol1": int(d.sol1.sum()), "grid": round(gdir, 1), "grid_str": round(gstr, 3),
           "grid_dates": gd, "grid_txt": gtxt, "peak_day": peak, "peak_kind": kind, "peak_m": int(round(pm)), "peak2_day": peak2, "peak2_m": int(round(pm2)),
           "peak_dec": round(float(decl_doy(peak)), 1), "file": f"{t.tid}.json"}
    # page file: one street = [lon1, lat1, lon2, lat2, name, length, bearing, h_fwd, h_back]
    dd = d.reset_index(drop=True)
    rec["best"] = [[int(dd.index[dd.sid == S.loc[x[0], "sid"]][0]), x[1], x[2], x[3]] for x in bl]
    jsave({"tid": int(t.tid), "streets": [[round(r.lon1, 5), round(r.lat1, 5), round(r.lon2, 5), round(r.lat2, 5), r.name, int(round(r.length)),
                                           round(r.bearing, 2), round(r.h_fwd, 2), round(r.h_back, 2)] for r in dd.itertuples()]},
          os.path.join(DATA, "towns", f"{t.tid}.json"))
    towns.append(rec)
TW = pd.DataFrame(towns)
# design test per town (50 or more streets): solstice share against the town's own baseline
dz = []
for t in TW.itertuples():
    d = S[S.tid == t.tid]
    if len(d) < 50:
        continue
    a = E[E.sid.isin(d.sid)].soff.abs()
    bb = (((a >= 2) & (a < 8)).sum() + 1) / 12 / len(a) * 2           # +1: never a zero baseline
    k = int((a <= ALIGN[0]).sum())
    dz.append({"town": t.name, "n": len(d), "sol1": k, "expected": round(bb * len(a), 1), "p": binomtest(k, len(a), bb, alternative="greater").pvalue})
DZ = pd.DataFrame(dz).sort_values("p")
DZ["p_bonf"] = np.minimum(1, DZ.p * len(DZ))
R["design_test"] = {"towns_tested": len(DZ), "significant_bonf": int((DZ.p_bonf < 0.05).sum()), "top": DZ.head(8).round(4).to_dict("records")}
R["towns_with_sol1"] = int((TW.sol1 > 0).sum())
# big cities: the henge calendar
BIG = ["London", "Birmingham", "Glasgow", "Manchester", "Leeds", "Liverpool", "Edinburgh", "Bristol", "Cardiff", "Belfast", "Newcastle upon Tyne", "Sheffield", "Milton Keynes"]
R["cities"] = {}
for c in BIG:
    x = TW[TW.name == c].iloc[0]
    R["cities"][c] = {"n": int(x.n), "km": float(x.km), "sol1": int(x.sol1), "grid": float(x.grid), "grid_str": float(x.grid_str),
                      "peak_date": doy_to_date(x.peak_day), "peak_kind": x.peak_kind, "peak_m": int(x.peak_m),
                      "peak2_date": doy_to_date(x.peak2_day), "peak2_m": int(x.peak2_m), "peak2_pc": round(100 * x.peak2_m / x.peak_m), "grid_txt": x.grid_txt}
R["strongest_grids"] = [{"town": r.name, "grid": r.grid, "grid_str": r.grid_str, "n": int(r.n), "grid_txt": r.grid_txt}
                        for r in TW[TW.n >= 40].sort_values("grid_str", ascending=False).head(8).itertuples()]
R["mk"] = {"grid": float(TW[TW.name == "Milton Keynes"].grid.iloc[0]), "grid_str": float(TW[TW.name == "Milton Keynes"].grid_str.iloc[0]),
           "sol1": int(mk.sol1.sum()), "n": len(mk)}
# Roman roads within the towns
rom = S[S.name.str.contains(r"Watling|Fosse|Ermine|Stane Street|Akeman|Roman Road|Roman Way", case=False, regex=True)]
R["roman"] = {"n": len(rom), "km": round(rom.length.sum() / 1000, 1), "sol1": int(rom.sol1.sum()),
              "longest": [{"town": r.town, "name": r.name, "length": round(r.length)} for r in rom.sort_values("length", ascending=False).head(5).itertuples()]}
# horizons
R["horizon"] = {"median": round(float(np.median(np.r_[S.h_fwd, S.h_back])), 2), "over2_pc": round(100 * float(np.mean(np.r_[S.h_fwd, S.h_back] > 2)), 1),
                "max": round(float(max(S.h_fwd.max(), S.h_back.max())), 1)}
hx = S.loc[S[["h_fwd", "h_back"]].max(axis=1).idxmax()]
R["horizon"]["max_where"] = f"{hx['name']}, {hx.town}"
# a flat horizon would move how many solstice streets?
R["solstice_az"] = {"lat50_ms_set": round(float(az_for(50.0, OBLIQ, 0, True)), 1), "lat58_ms_set": round(float(az_for(58.0, OBLIQ, 0, True)), 1),
                    "lat50_mw_set": round(float(az_for(50.0, -OBLIQ, 0, True)), 1), "lat58_mw_set": round(float(az_for(58.0, -OBLIQ, 0, True)), 1)}
R["align"] = list(ALIGN)

# ---- data files
out = S[["sid", "tid", "town", "name", "cls", "ref", "lon1", "lat1", "lon2", "lat2", "length", "bearing", "max_off", "h_fwd", "h_back", "sol_off", "eq_off", "road", "why"]].copy()
ends = E.pivot(index="sid", columns="end", values=["dec", "day1", "day2", "kind"])
ends.columns = [f"{a}_{b}" for a, b in ends.columns]
out = out.merge(ends.reset_index(), on="sid")
for c in ("day1_fwd", "day2_fwd", "day1_back", "day2_back"):
    out[c.replace("day", "date")] = out[c].map(lambda v: doy_to_short(v) if v == v else "")
for c in ("lon1", "lat1", "lon2", "lat2"):
    out[c] = out[c].round(5)
out["dec_fwd"] = out.dec_fwd.astype(float).round(2); out["dec_back"] = out.dec_back.astype(float).round(2)
out.drop(columns=["day1_fwd", "day2_fwd", "day1_back", "day2_back"]).to_csv(os.path.join(DATA, "streets.csv"), index=False)
TW.drop(columns=["grid_dates", "best", "file"]).to_csv(os.path.join(DATA, "town_summary.csv"), index=False)
jsave({"min_len": int(MIN_LEN), "towns": [{k: v for k, v in r.items()} for r in towns]}, os.path.join(DATA, "towns.json"))
so = S[S.sol1].sort_values("length", ascending=False)
jsave({"streets": [[round(r.lon1, 5), round(r.lat1, 5), round(r.lon2, 5), round(r.lat2, 5), r.name, int(round(r.length)), round(r.bearing, 2),
                    round(r.h_fwd, 2), round(r.h_back, 2)] for r in so.itertuples()], "town": so.town.tolist()},
      os.path.join(DATA, "solstice_streets.json"))
jsave(R, os.path.join(DATA, "results.json"), indent=1)
pd.to_pickle(S, os.path.join(WORK, "sections_final.pkl"))
print(json.dumps({k: R[k] for k in ("n", "chance", "sol1_by_kind", "midsummer_boulevard", "design_test", "roman", "horizon", "mk")}, indent=0, default=str)[:5000])
for x in R["best_solstice"][:12]:
    print(x)
for c, v in R["cities"].items():
    print(c, v["peak_date"], v["peak_kind"], v["peak_m"], v["grid"], v["grid_str"], v["sol1"], "|", v["grid_txt"])
print(R["strongest_grids"])
