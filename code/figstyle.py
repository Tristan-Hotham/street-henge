"""House style for the static figures: parchment paper, iron-gall ink, vermilion lettering (as church-orientation).
Maps from Natural Earth 1:10m / 1:50m in a plate carree stretched for the latitude of each panel."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Polygon as MPoly
from matplotlib.collections import PatchCollection, LineCollection
from matplotlib.colors import LinearSegmentedColormap, Normalize, PowerNorm
import numpy as np
from common import *

FD = os.path.join(WORK, "fonts"); os.makedirs(FD, exist_ok=True)
if not os.path.exists(f"{FD}/Fraunces-Black.ttf"):
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    for w, nm in ((900, "Black"), (700, "Bold")):
        instancer.instantiateVariableFont(TTFont(f"{FONTS}/FrauncesVar.ttf"), {"wght": w, "opsz": 144, "SOFT": 0, "WONK": 0}).save(f"{FD}/Fraunces-{nm}.ttf")
INKFONTS = os.path.join(ROOT, "fonts", "ttf")
DISP = fm.FontProperties(fname=f"{FD}/Fraunces-Black.ttf")
DISPB = fm.FontProperties(fname=f"{FD}/Fraunces-Bold.ttf")
HAND = fm.FontProperties(fname=f"{INKFONTS}/MedievalSharp.ttf")
FELL = fm.FontProperties(fname=f"{INKFONTS}/IMFeENrm28P.ttf")
FELLI = fm.FontProperties(fname=f"{INKFONTS}/IMFeGPit28P.ttf")
SERP = fm.FontProperties(fname=f"{FONTS}/SourceSerif4-Regular.ttf")
SERPI = fm.FontProperties(fname=f"{FONTS}/SourceSerif4-It.ttf")
for f in ("IBMPlexMono-Regular.ttf", "IBMPlexMono-Medium.ttf"):
    fm.fontManager.addfont(f"{FONTS}/{f}")
MONO = "IBM Plex Mono"
plt.rcParams.update({"font.family": MONO, "font.size": 12, "axes.edgecolor": "#6E604E", "axes.labelcolor": "#2B2119",
                     "xtick.color": "#6E604E", "ytick.color": "#6E604E", "text.color": "#2B2119"})
PAPER, PAPER2, INK, MUT, RED, RULE, BLUE = "#F6EED8", "#F3E5BF", "#2B2119", "#6E604E", "#A3261B", "#E2D3AE", "#2F5D8C"
LANDC, SEAC = "#ECD9AC", "#DFE6E1"
# turn from north to south (0 = on the meridian, 90 = east to west): vermilion on the meridian fading to slate blue
NS_STOPS = [(0, "#9E1F14"), (90, "#4F6F9A")]
NS_CMAP = LinearSegmentedColormap.from_list("nsd", [(a / 90, c) for a, c in NS_STOPS])
NS_NORM = Normalize(0, 90)
SPORTC = {"cricket": "#A3261B", "tennis": "#C7861C", "netball": "#7A8F3A", "football": "#2F5D8C", "rugby": "#5B4B8A",
          "hockey": "#3F8C84", "basketball": "#8C5A3C", "gaelic": "#6F7F96"}

NE10 = jload(f"{GEO}/ne_10m_admin_0_countries.geojson")


def rings(geom):
    cs = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in cs:
        yield np.array(poly[0])


def basemap(ax, ext, lat0=None, lw=0.5, ripple=True):
    lat0 = (ext[2] + ext[3]) / 2 if lat0 is None else lat0
    k = math.cos(math.radians(lat0))
    ax.set_facecolor(SEAC)
    polys = []
    for f in NE10["features"]:
        for r in rings(f["geometry"]):
            if r[:, 0].max() < ext[0] - 3 or r[:, 0].min() > ext[1] + 3 or r[:, 1].max() < ext[2] - 3 or r[:, 1].min() > ext[3] + 3:
                continue
            polys.append(MPoly(np.c_[r[:, 0] * k, r[:, 1]], closed=True))
    if ripple:
        for w, a in ((5, 0.16), (2.8, 0.28)):
            ax.add_collection(PatchCollection(polys, facecolor="none", edgecolor="#6C9FD6", lw=w, alpha=a, zorder=1))
    ax.add_collection(PatchCollection(polys, facecolor=LANDC, edgecolor="none", zorder=2))
    ax.add_collection(PatchCollection(polys, facecolor="none", edgecolor=INK, lw=lw, zorder=5))
    ax.set_xlim(ext[0] * k, ext[1] * k); ax.set_ylim(ext[2], ext[3])
    ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color(INK); s.set_linewidth(0.8)
    return k


def ticks(ax, lon, lat, bearing, k, L=0.05, lw=0.6, alpha=0.9, z=6):
    """Each pitch as a short line along its axis, coloured by its turn from north to south."""
    x, y = np.asarray(lon) * k, np.asarray(lat)
    b = np.radians(bearing)
    dx, dy = np.sin(b) * L, np.cos(b) * L
    segs = np.stack([np.c_[x - dx, y - dy], np.c_[x + dx, y + dy]], axis=1)
    dev = ns_dev(bearing)
    o = np.argsort(-dev)
    ax.add_collection(LineCollection(segs[o], colors=NS_CMAP(NS_NORM(dev[o])), linewidths=lw, alpha=alpha, zorder=z, capstyle="round"))


def rose(ax, bearings, colour, title=None, nbin=36, sub=None, mod90=False):
    if mod90:
        b = np.concatenate([np.asarray(bearings) % 90, np.asarray(bearings) % 90 + 90])
    else:
        b = np.asarray(bearings) % 180
    h, e = np.histogram(b, bins=nbin, range=(0, 180))
    h = h / max(h.max(), 1)
    th = np.radians((e[:-1] + e[1:]) / 2)
    w = np.radians(180 / nbin) * 0.92
    ax.set_theta_zero_location("N"); ax.set_theta_direction(-1)
    ax.bar(th, h, width=w, color=colour, edgecolor="none", alpha=0.92)
    ax.bar(th + math.pi, h, width=w, color=colour, edgecolor="none", alpha=0.92)
    ax.set_yticks([]); ax.set_xticks(np.radians([0, 90, 180, 270])); ax.set_xticklabels(["N", "E", "S", "W"], fontsize=10.5)
    ax.set_facecolor("#FBF5E4"); ax.spines["polar"].set_color(MUT)
    ax.grid(color=RULE, lw=0.7)
    if title:
        ax.set_title(title + (f"\n{sub}" if sub else ""), fontsize=11, pad=10)


def paper(fig):
    fig.patch.set_facecolor(PAPER)


def foot(fig, s, y=0.015, x=0.03):
    fig.text(x, y, s, fontsize=9, color=MUT, va="bottom")


def nsbar(fig, rect, label="Turn from the north to south line (90° = east to west)"):
    ax = fig.add_axes(rect)
    g = np.linspace(0, 90, 361)[None, :]
    ax.imshow(g, aspect="auto", cmap=NS_CMAP, norm=NS_NORM, extent=(0, 90, 0, 1))
    ax.set_yticks([]); ax.set_xticks([0, 20, 45, 70, 90]); ax.set_xticklabels(["0°", "20°", "45°", "70°", "90°"], fontsize=9)
    for s in ax.spines.values():
        s.set_color(INK); s.set_linewidth(0.8)
    ax.set_title(label, fontsize=9.5, color=MUT, pad=4)
    return ax

# street henge: colour by the declination at which the sun lines up (midwinter blue, equinox ochre, midsummer vermilion)
DSTOPS = [(-23.5, "#2F4F8C"), (-12, "#5E86B5"), (0, "#C9A35C"), (12, "#DE8A2E"), (23.5, "#A3261B")]
DEC_CMAP = LinearSegmentedColormap.from_list("dec", [((d + 23.5) / 47, c) for d, c in DSTOPS])
DEC_NORM = Normalize(-23.5, 23.5)


def decbar(fig, rect, label="When the sun lines up with the street", fs=9):
    ax = fig.add_axes(rect)
    g = np.linspace(-23.5, 23.5, 300)[None, :]
    ax.imshow(g, aspect="auto", cmap=DEC_CMAP, norm=DEC_NORM, extent=(-23.5, 23.5, 0, 1))
    ax.set_yticks([]); ax.set_xticks([-23.44, 0, 23.44]); ax.set_xticklabels(["midwinter", "equinoxes", "midsummer"], fontsize=fs)
    for s in ax.spines.values():
        s.set_color(INK); s.set_linewidth(0.8)
    ax.set_title(label, fontsize=fs + 0.5, color=MUT, pad=4)
    return ax
