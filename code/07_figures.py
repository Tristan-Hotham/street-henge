"""Step 7: figures for the blog (release/blog/b_*.png, 1800 px wide), the paper (release/paper/f_*.png) and the page (img/)."""
import gzip, pickle, importlib.util
import pandas as pd
from matplotlib.collections import LineCollection
from figstyle import *

R = jload(os.path.join(DATA, "results.json"))
S = pd.read_pickle(os.path.join(WORK, "sections_final.pkl"))
E = pd.read_pickle(os.path.join(WORK, "henge.pkl"))
T = pd.read_csv(os.path.join(DATA, "towns.csv"))
BLOG = os.path.join(ROOT, "release", "blog"); PAP = os.path.join(ROOT, "release", "paper")
for d in (BLOG, PAP):
    os.makedirs(d, exist_ok=True)
SRC = "Data: OpenStreetMap contributors (ODbL) via OpenFreeMap, Wikidata (CC0), AWS Terrain Tiles. Analysis: Tristan Hotham, maps.tristanhotham.com/street-henge"
# the colour of a street: the declination of its sunset end if it has one, else its sunrise end; grey if none
pick = E[E.ok].sort_values("kind", ascending=False).drop_duplicates("sid")       # 'set' sorts after 'rise'
S = S.merge(pick[["sid", "dec"]], on="sid", how="left")


def out(fig, name, paper=True):
    dpi = 1800 / fig.get_figwidth()
    fig.savefig(os.path.join(BLOG, f"b_{name}.png"), dpi=dpi, facecolor=fig.get_facecolor())
    if paper:
        fig.savefig(os.path.join(PAP, f"f_{name}.png"), dpi=dpi, facecolor=fig.get_facecolor())
    plt.close(fig)


def head(fig, t, sub, y=0.965, size=27):
    fig.text(0.03, y, t, fontproperties=DISP, fontsize=size, va="top")
    fig.text(0.03, y - 0.075 * 6.5 / fig.get_figheight(), sub, fontproperties=SERP, fontsize=13.5, color=MUT, va="top")


def segs(d, k, scale=1.0):
    """line segments in the figure's stretched frame; scale > 1 lengthens each street about its midpoint"""
    x1, y1, x2, y2 = d.lon1.values * k, d.lat1.values, d.lon2.values * k, d.lat2.values
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    return np.stack([np.c_[mx + (x1 - mx) * scale, my + (y1 - my) * scale], np.c_[mx + (x2 - mx) * scale, my + (y2 - my) * scale]], 1)


def colours(d):
    return [DEC_CMAP(DEC_NORM(np.clip(v, -23.5, 23.5))) if v == v else (0.6, 0.57, 0.5, 0.6) for v in d.dec.values]


# ---------- 1. the map of solstice streets
def fig_map():
    fig = plt.figure(figsize=(10, 13)); paper(fig)
    ax = fig.add_axes([0.0, 0.045, 1.0, 0.84])
    k = basemap(ax, (-8.3, 2.0, 49.9, 58.9), lat0=54.5)
    d = S[S.sol1]
    tw = T[T.tid.isin(S.tid.unique())]
    ax.scatter(tw.lon * k, tw.lat, s=np.sqrt(tw["pop"]) / 30, facecolor="none", edgecolor=MUT, lw=0.5, zorder=6)
    lc = LineCollection(segs(d, k, scale=9), colors=colours(d), linewidths=1.6, zorder=7, capstyle="round")
    ax.add_collection(lc)
    fig.text(0.05, 0.965, "Streets that line up with the solstice sun", fontproperties=DISP, fontsize=28, va="top")
    fig.text(0.05, 0.928, f"{R['n']['sol1']:,} straight streets in {R['n']['towns']} UK towns and cities lie within 1° of the sunrise or sunset\non the longest or shortest day, over their own skyline (each drawn nine times its length)",
             fontproperties=SERP, fontsize=13, color=MUT, va="top")
    decbar(fig, [0.66, 0.80, 0.28, 0.013], label="The street lines up with the sun at")
    fig.text(0.66, 0.765, "Each line runs along a street;\ncircles are the towns studied,\nsized by population.", fontsize=10.5, va="top")
    fig.text(0.05, 0.006, SRC.replace(". Analysis", ".\nAnalysis"), fontsize=8.5, color=MUT)
    out(fig, "map")


# ---------- 2. chance: offsets from the solstice line
def fig_chance():
    fig = plt.figure(figsize=(13, 6.4)); paper(fig)
    c = R["chance"]
    head(fig, "Solstice streets are no commoner than chance", f"Every street end, by how far it looks from the nearest solstice sunrise or sunset ({c['ends']:,} ends)")
    ax = fig.add_axes([0.08, 0.14, 0.88, 0.62]); ax.set_facecolor(PAPER)
    h = R["offset_hist"]
    e = np.array(h["edges"]); cnt = np.array(h["counts"])
    ax.bar(e[:-1] + 0.5, cnt, width=0.9, color=["#A3261B" if abs(x + 0.5) < 1 else "#C9A35C" for x in e[:-1]])
    ax.axhline(c["expected_pc"] / 2 / 100 * c["ends"], color=INK, ls="--", lw=1)
    ax.text(-19.5, c["expected_pc"] / 2 / 100 * c["ends"] * 1.03, "expected without design", fontsize=10.5)
    ax.set_xlabel("Degrees between the street and the solstice sun (negative: on the side the sun reaches)")
    ax.set_ylabel("Street ends per degree")
    ax.set_xlim(-20, 20)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.text(0.5, 0.97, f"Within 1°: {c['ends_sol1']:,} ends ({c['sol1_pc']:.2f}%), against {c['expected_pc']:.2f}% expected", transform=ax.transAxes, ha="center", fontsize=12, va="top", color=RED)
    foot(fig, SRC)
    out(fig, "chance")


# ---------- 3. city henge calendars
def fig_calendars():
    cities = ["London", "Glasgow", "Edinburgh", "Liverpool", "Manchester", "Milton Keynes"]
    TJ = {t["name"]: t for t in jload(os.path.join(DATA, "towns.json"))["towns"]}
    fig = plt.figure(figsize=(13, 9)); paper(fig)
    head(fig, "Each city's henge calendar", "Metres of straight street that the sun sets along (up) or rises along (down), day by day through the year")
    for i, c in enumerate(cities):
        t = TJ[c]
        d = S[S.tid == t["tid"]]
        cs, cr = np.zeros(366), np.zeros(366)
        L = dict(zip(d.sid, d.length))
        for r in E[E.sid.isin(d.sid)].itertuples():
            for x in (r.day1, r.day2):
                if x == x:
                    (cs if r.kind == "set" else cr)[int(round(x)) % 366] += L[r.sid]
        sm = lambda a: np.convolve(np.r_[a[-3:], a, a[:3]], np.ones(7) / 7, "valid")
        cs, cr = sm(cs), sm(cr)
        ax = fig.add_axes([0.06 + (i % 2) * 0.48, 0.64 - (i // 2) * 0.25, 0.42, 0.18]); ax.set_facecolor("#FBF5E4")
        x = np.arange(366)
        ax.fill_between(x, 0, cs, color="#A3261B", lw=0); ax.fill_between(x, 0, -cr, color="#2F5D8C", lw=0)
        mx = max(cs.max(), cr.max()) * 1.1
        ax.set_ylim(-mx, mx); ax.set_xlim(1, 365)
        ax.set_xticks([1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]); ax.set_xticklabels(list("JFMAMJJASOND"), fontsize=9)
        ax.set_yticks([]); ax.axhline(0, color=INK, lw=0.6)
        for dd in (79, 172, 266, 355):
            ax.axvline(dd, color=MUT, lw=0.6, ls=":")
        pk = t["peak_day"]
        ax.set_title(f"{c}: best {doy_to_date(pk)} and {doy_to_date(t['peak2_day'])} ({'sunsets' if t['peak_kind'] == 'set' else 'sunrises'})", fontsize=11.5, loc="left")
    fig.text(0.06, 0.045, "Red: sunset along the street. Blue: sunrise. Dotted lines: equinoxes and solstices. Each street counts on the one or two days\nthe sun's centre stands on its skyline straight down it.", fontsize=10.5, color=INK)
    foot(fig, SRC)
    out(fig, "calendars")


# ---------- 4. grids as roses with the sun's range
def fig_grids():
    towns = ["Glasgow", "Edinburgh", "Milton Keynes", "St Annes", "Great Yarmouth", "Southend-on-Sea"]
    fig = plt.figure(figsize=(14, 7.2)); paper(fig)
    head(fig, "Street grids and the sun's range", "Length-weighted direction of each town's straight streets, with the arcs where the sun rises (top right) and sets (left)")
    for i, c in enumerate(towns):
        tid = int(T[T.name == c].tid.iloc[0]); lat = float(T[T.name == c].lat.iloc[0])
        d = S[S.tid == tid]
        ax = fig.add_axes([0.02 + i * 0.163, 0.17, 0.145, 0.56], projection="polar")
        ax.set_theta_zero_location("N"); ax.set_theta_direction(-1)
        b = np.r_[d.bearing.values, d.bearing.values + 180]
        w = np.r_[d.length.values, d.length.values]
        h, e = np.histogram(b, bins=72, range=(0, 360), weights=w)
        h = h / h.max()
        for lo, hi, col in [(az_for(lat, OBLIQ, 0.5, False), az_for(lat, -OBLIQ, 0.5, False), "#F2D49B"), (az_for(lat, -OBLIQ, 0.5, True), az_for(lat, OBLIQ, 0.5, True), "#F2C0A8")]:
            th = np.radians(np.linspace(lo, hi, 50))
            ax.fill_between(th, 0, 1.05, color=col, alpha=0.7, lw=0)
        ax.bar(np.radians((e[:-1] + e[1:]) / 2), h, width=np.radians(5) * 0.9, color=INK, alpha=0.85)
        for dec, col in [(OBLIQ, RED), (-OBLIQ, BLUE)]:
            for st in (True, False):
                a = math.radians(az_for(lat, dec, 0.5, st))
                ax.plot([a, a], [0, 1.08], color=col, lw=1.2)
        ax.set_yticks([]); ax.set_ylim(0, 1.08); ax.set_xticks(np.radians([0, 90, 180, 270])); ax.set_xticklabels(["N", "E", "S", "W"], fontsize=9.5)
        ax.set_facecolor("#FBF5E4"); ax.grid(color=RULE, lw=0.6)
        ax.set_title(f"{c}\n{len(d)} streets", fontsize=11, pad=10)
    fig.text(0.03, 0.05, "Shaded: where the sun can rise (pale gold) and set (pale red) over a 0.5° skyline. Lines: midsummer (red) and midwinter (blue) sunrise and sunset.", fontsize=10.5)
    foot(fig, SRC)
    out(fig, "grids")


# ---------- 5. Milton Keynes
def fig_mk():
    t = T[T.name == "Milton Keynes"].iloc[0]
    spec = importlib.util.spec_from_file_location("t2", os.path.join(ROOT, "code", "02_tiles.py"))
    t2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(t2)
    k = math.cos(math.radians(t.lat))
    fig = plt.figure(figsize=(12, 10.5)); paper(fig)
    mb = R["midsummer_boulevard"]
    head(fig, "Midsummer Boulevard misses midsummer", f"Milton Keynes: straight streets coloured by when the sun lines up with them. The boulevard runs at {mb['bearing']:.0f}° from north;\nthe midsummer sun rises over its skyline at {mb['sun_az_ms_rise']:.0f}°, so the sun rises straight down it about {mb['date1']} and {mb['date2']}.\nOn midsummer morning the sun reaches the boulevard's line only {mb['alt_on_axis']:.1f}° up, {mb['min_after_gleam']} minutes after sunrise.")
    ax = fig.add_axes([0.03, 0.11, 0.94, 0.71]); ax.set_facecolor("#F3EBD3")
    ext = (-0.83, -0.68, 51.995, 52.075)
    lines = []
    for tt in t2.town_tiles(t):
        p = os.path.join(TILECACHE, f"{tt[0]}_{tt[1]}.pkl.gz")
        if os.path.exists(p):
            for nm, cl, ref, a in pickle.load(gzip.open(p, "rb")):
                lines.append(np.c_[a[:, 0] * k, a[:, 1]])
    ax.add_collection(LineCollection(lines, colors="#C9BC9C", linewidths=0.5, zorder=1))
    d = S[S.tid == t.tid]
    ax.add_collection(LineCollection(segs(d, k), colors=colours(d), linewidths=2.2, zorder=3, capstyle="round"))
    m = d[d.name == "Midsummer Boulevard"]
    ax.add_collection(LineCollection(segs(m, k), colors=INK, linewidths=5.5, zorder=2, capstyle="round"))
    # the midsummer sunrise line through the boulevard's east end
    r = m.sort_values("length").iloc[-1]
    x0, y0 = r.lon1 * k, r.lat1
    for az, col, lab in [(mb["sun_az_ms_rise"], RED, "midsummer sunrise"), (mb["bearing"], INK, "Midsummer Boulevard")]:
        L = 0.03
        ax.plot([x0, x0 + math.sin(math.radians(az)) * L], [y0, y0 + math.cos(math.radians(az)) * L], color=col, lw=1.4, ls="--", zorder=4)
        ax.text(x0 + math.sin(math.radians(az)) * L, y0 + math.cos(math.radians(az)) * L, "  " + lab, color=col, fontsize=11, va="center", zorder=5,
                bbox=dict(fc="#F3EBD3", ec="none", alpha=0.85, pad=1))
    ax.set_xlim(ext[0] * k, ext[1] * k); ax.set_ylim(ext[2], ext[3]); ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color(INK)
    decbar(fig, [0.06, 0.045, 0.3, 0.012], label="The street lines up with the sun at")
    fig.text(0.97, 0.06, "Thin lines: other named streets. Thick grey:\nstraight streets the sun never lines up with.", fontsize=10, color=INK, ha="right", va="center")
    fig.text(0.5, 0.008, SRC, fontsize=7.5, color=MUT, ha="center")
    out(fig, "mk")


# ---------- 6. the best henge streets
def fig_best():
    B = R["best_solstice"][:12]
    fig = plt.figure(figsize=(13, 8)); paper(fig)
    head(fig, "Britain's best henge streets", "The longest straight streets within 1° of a solstice sunrise or sunset over their own skyline (trunk roads and bypasses left out)")
    ax = fig.add_axes([0.33, 0.14, 0.55, 0.66]); ax.set_facecolor(PAPER)
    y = np.arange(len(B))[::-1]
    for yy, b in zip(y, B):
        col = RED if "midsummer" in b["event"] else BLUE
        ax.barh(yy, b["length"], color=col, height=0.68)
        ax.text(b["length"] + 25, yy, f"{b['event']}" + (", and the opposite solstice the other way" if b["both"] else ""), va="center", fontsize=10)
    ax.set_yticks(y); ax.set_yticklabels([f"{b['name']}, {b['town']}" for b in B], fontsize=11)
    ax.set_xlabel("Straight length, metres"); ax.set_xlim(0, max(b["length"] for b in B) * 1.55)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    foot(fig, SRC)
    out(fig, "best")


# ---------- 7. the sun's range through the year
def fig_sun():
    fig = plt.figure(figsize=(13, 6.6)); paper(fig)
    head(fig, "Where the sun sets through the year", "Azimuth of sunset over a flat horizon in the far south (50°N) and far north (58°N) of the UK. Sunrise mirrors it: 360° minus this.")
    ax = fig.add_axes([0.08, 0.14, 0.86, 0.6]); ax.set_facecolor(PAPER)
    x = np.arange(1, 366)
    for lat, col in [(50, "#C4471F"), (58, BLUE)]:
        dec = decl_doy(x)
        ax.plot(x, az_for(lat, dec, 0.0, True), color=col, lw=2.2, label=f"sunset, {lat}°N")
    ax.set_xticks([1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]); ax.set_xticklabels(list("JFMAMJJASOND"))
    ax.set_ylabel("Azimuth of sunset, degrees from north"); ax.legend(frameon=False, fontsize=11, loc="lower center")
    for dd in (79, 172, 266, 355):
        ax.axvline(dd, color=MUT, lw=0.6, ls=":")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    foot(fig, SRC)
    out(fig, "sun")


for f in (fig_map, fig_chance, fig_calendars, fig_grids, fig_mk, fig_best, fig_sun):
    f(); print("fig", f.__name__)
