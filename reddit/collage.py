"""Reddit collage (reddit/street_henge_collage.png, 3000 x 1900) and the social card (header.png, 1200 x 630).
Run from anywhere: python3 reddit/collage.py"""
import os, sys, gzip, pickle, importlib.util
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "code"))
import pandas as pd
from matplotlib.collections import LineCollection
from figstyle import *

R = jload(os.path.join(DATA, "results.json"))
S = pd.read_pickle(os.path.join(WORK, "sections_final.pkl"))
E = pd.read_pickle(os.path.join(WORK, "henge.pkl"))
T = pd.read_csv(os.path.join(DATA, "towns.csv"))
pick = E[E.ok].sort_values("kind", ascending=False).drop_duplicates("sid")
S = S.merge(pick[["sid", "dec"]], on="sid", how="left")
n, c, mb = R["n"], R["chance"], R["midsummer_boulevard"]
SRC = "Data: OpenStreetMap contributors (ODbL) via OpenFreeMap, Wikidata (CC0), AWS Terrain Tiles  ·  Analysis and map: Dr Tristan Hotham  ·  maps.tristanhotham.com/street-henge"


def segs(d, k, scale=1.0):
    x1, y1, x2, y2 = d.lon1.values * k, d.lat1.values, d.lon2.values * k, d.lat2.values
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    return np.stack([np.c_[mx + (x1 - mx) * scale, my + (y1 - my) * scale], np.c_[mx + (x2 - mx) * scale, my + (y2 - my) * scale]], 1)


def colours(d):
    return [DEC_CMAP(DEC_NORM(np.clip(v, -23.5, 23.5))) if v == v else (0.6, 0.57, 0.5, 0.55) for v in d.dec.values]


fig = plt.figure(figsize=(20, 12.667)); paper(fig)
fig.text(0.03, 0.955, "Manhattanhenge for every British town", fontproperties=DISP, fontsize=44, va="top")
fig.text(0.03, 0.885, f"{n['sections']:,} straight streets in {n['towns']} UK towns, and the days the sun rises or sets straight down them",
         fontproperties=SERP, fontsize=21, color=MUT, va="top")
# UK map of solstice streets
ax = fig.add_axes([0.01, 0.05, 0.36, 0.70])
k = basemap(ax, (-7.2, 1.9, 49.9, 57.75), lat0=53.8)
d = S[S.sol1]
ax.add_collection(LineCollection(segs(d, k, 9), colors=colours(d), linewidths=2.0, zorder=7, capstyle="round"))
fig.text(0.03, 0.835, f"{n['sol1']:,} solstice streets", fontproperties=DISPB, fontsize=19, va="top")
fig.text(0.03, 0.792, "within 1° of the sunrise or sunset on the\nlongest or shortest day (drawn 9 times their length)", fontsize=12, va="top")
# Milton Keynes
t = T[T.name == "Milton Keynes"].iloc[0]
spec = importlib.util.spec_from_file_location("t2", os.path.join(ROOT, "code", "02_tiles.py"))
t2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(t2)
km = math.cos(math.radians(t.lat))
ax = fig.add_axes([0.385, 0.05, 0.31, 0.68]); ax.set_facecolor("#F3EBD3")
lines = []
for tt in t2.town_tiles(t):
    p = os.path.join(TILECACHE, f"{tt[0]}_{tt[1]}.pkl.gz")
    if os.path.exists(p):
        for nm, cl, ref, a in pickle.load(gzip.open(p, "rb")):
            lines.append(np.c_[a[:, 0] * km, a[:, 1]])
ax.add_collection(LineCollection(lines, colors="#CDBF9E", linewidths=0.5))
dm = S[S.tid == t.tid]
ax.add_collection(LineCollection(segs(dm, km), colors=colours(dm), linewidths=2.6, capstyle="round"))
m = dm[dm.name == "Midsummer Boulevard"]
ax.add_collection(LineCollection(segs(m, km), colors=INK, linewidths=6, capstyle="round"))
r = m.sort_values("length").iloc[-1]
for az, col in [(mb["sun_az_ms_rise"], RED), (mb["bearing"], INK)]:
    ax.plot([r.lon1 * km, r.lon1 * km + math.sin(math.radians(az)) * 0.03], [r.lat1, r.lat1 + math.cos(math.radians(az)) * 0.03], color=col, lw=1.6, ls="--")
ax.set_xlim(-0.80 * km, -0.70 * km); ax.set_ylim(52.005, 52.07); ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
ax.set_title(f"Milton Keynes: Midsummer Boulevard misses the\nmidsummer sunrise by {mb['off_min']:.0f}° or more. The sun rises along\nit on {mb['date1']} and {mb['date2']}; at midsummer it reaches\nthe line {mb['min_after_gleam']} minutes after sunrise, {mb['alt_on_axis']:.1f}° up.", fontsize=14, loc="left")
# chance
ax = fig.add_axes([0.73, 0.50, 0.25, 0.22]); ax.set_facecolor(PAPER)
h = R["offset_hist"]; e = np.array(h["edges"]); cnt = np.array(h["counts"])
ax.bar(e[:-1] + 0.5, cnt, width=0.9, color=["#A3261B" if abs(x + 0.5) < 1 else "#C9A35C" for x in e[:-1]])
ax.axhline(c["expected_pc"] / 2 / 100 * c["ends"], color=INK, ls="--", lw=1)
ax.set_xlim(-20, 20); ax.set_yticks([]); [ax.spines[s].set_visible(False) for s in ("top", "right", "left")]
ax.set_xlabel("Degrees from the solstice sun", fontsize=12)
ax.set_title(f"No spike at the solstice:\n{c['sol1_pc']:.2f}% of street ends within 1°,\nagainst {c['expected_pc']:.2f}% by chance", fontsize=14, loc="left")
# best streets
B = R["best_solstice"][:5]
fig.text(0.73, 0.43, "Longest henge streets", fontproperties=DISPB, fontsize=19, va="top")
for i, b in enumerate(B):
    fig.text(0.73, 0.39 - i * 0.047, f"{b['name']}, {b['town']}", fontsize=13.5, va="top")
    fig.text(0.73, 0.367 - i * 0.047, f"{b['length']:,} m · {b['event']}", fontsize=11.5, color=MUT, va="top")
decbar(fig, [0.73, 0.118, 0.22, 0.011], label="Colour: the day the sun lines up with the street", fs=10)
fig.text(0.385, 0.118, "Black: Midsummer Boulevard. Red dashed: midsummer sunrise.\nGrey streets: the sun never lines up with them.\nDashed line on the chart: expected by chance.", fontsize=11.5, color=INK, va="top", linespacing=1.5)
fig.text(0.03, 0.02, SRC, fontsize=12, color=MUT)
out = os.path.join(ROOT, "reddit", "street_henge_collage.png")
fig.savefig(out, dpi=150, facecolor=PAPER); plt.close(fig)

# ---------------- header: title and the henge calendar of Glasgow
fig = plt.figure(figsize=(12, 6.3)); paper(fig)
fig.text(0.05, 0.86, "Manhattanhenge", fontproperties=DISP, fontsize=50, va="top")
fig.text(0.05, 0.69, "for every British town", fontproperties=DISP, fontsize=40, va="top", color=RED)
fig.text(0.05, 0.47, f"The days the sun sets straight down\n{n['sections']:,} streets in {n['towns']} towns", fontproperties=SERP, fontsize=19, color=INK, va="top")
fig.text(0.05, 0.25, f"{n['sol1']:,} solstice streets, no more than chance", fontproperties=DISPB, fontsize=17, va="top")
fig.text(0.05, 0.07, "maps.tristanhotham.com/street-henge", fontsize=13, color=MUT)
ax = fig.add_axes([0.6, 0.06, 0.37, 0.88]); ax.set_facecolor("#F3EBD3")
g = T[T.name == "Glasgow"].iloc[0]; kg = math.cos(math.radians(g.lat))
dg = S[S.tid == g.tid]
ax.add_collection(LineCollection(segs(dg, kg), colors=colours(dg), linewidths=1.6, capstyle="round"))
ax.set_xlim((g.lon - 0.075) * kg, (g.lon + 0.075) * kg); ax.set_ylim(g.lat - 0.06, g.lat + 0.06); ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
ax.text(0.03, 0.03, "Glasgow's straight streets", transform=ax.transAxes, fontsize=11, color=INK, bbox=dict(fc="#F3EBD3", ec="none"))
for s_ in ax.spines.values():
    s_.set_color(INK)
fig.savefig(os.path.join(ROOT, "header.png"), dpi=100, facecolor=PAPER); plt.close(fig)
from PIL import Image
print(Image.open(out).size, Image.open(os.path.join(ROOT, "header.png")).size)
