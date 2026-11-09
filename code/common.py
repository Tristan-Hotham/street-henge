"""Shared paths, constants and helpers for the street-henge study ("Manhattanhenge for every British town").

Raw inputs (read in place, never modified):
  SETT   /home/claude/newdata/raw_new8/uk_settlements.tsv
         Wikidata (CC0): UK settlements with coordinates, population and type (columns ?p ?pl ?coord ?pop ?typel).
  OFM    OpenFreeMap vector tiles (https://tiles.openfreemap.org, OpenMapTiles schema, OpenStreetMap data, ODbL),
         zoom 14, layer transportation_name (named road centrelines). Read tile by tile; only the named lines are
         cached, in TILECACHE (deleted when the study is finished).
  TILES  /home/claude/newdata/raw_new8/terrain/tiles/10/{x}/{y}.png
         AWS Terrain Tiles (terrarium: height = R*256 + G + B/256 - 32768 m), zoom 10, Britain and Ireland, for the
         horizon at the end of each street. https://registry.opendata.aws/terrain-tiles/
  GEO    /home/claude/newdata/raw/geo (Natural Earth, ONS boundaries) for the figures.
"""
import json, gzip, os, re, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETT = os.environ.get("SH_SETT", "/home/claude/newdata/raw_new8/uk_settlements.tsv")
TILES = os.environ.get("SH_TILES", "/home/claude/newdata/raw_new8/terrain/tiles/10")
GEO = "/home/claude/newdata/raw/geo"
FONTS = "/home/claude/ref/fonts"
DATA = os.path.join(ROOT, "data")
WORK = os.environ.get("SH_WORK", "/home/claude/scratch/street-henge")
TILECACHE = os.path.join(WORK, "tiles")
for d in (DATA, WORK, TILECACHE):
    os.makedirs(d, exist_ok=True)

SLUG = "street-henge"
PAGE = f"https://maps.tristanhotham.com/{SLUG}/"
REPO = f"https://github.com/Tristan-Hotham/{SLUG}"
AI = ("I wrote the text, with drafting and editing assistance from Claude (Anthropic), which also helped "
      "prepare the analysis code. I reviewed and checked all text and results.")
BYLINE = "Dr Tristan Hotham · Independent researcher · 2026"

MIN_POP = 25000          # towns and cities included
MIN_LEN = 300.0          # metres, straight section of a named street
TOL = 5.0                # metres: every vertex of a straight section within this of its chord
ALIGN = (1.0, 2.0)       # degrees: aligned with the solstice sun within 1 (strict) or 2 (loose)
OBS_H = 1.7              # observer eye height above the street, metres
K_REFR = 0.13            # terrestrial refraction coefficient for the terrain horizon
R_EARTH = 6371008.8
OBLIQ = 23.44            # degrees, obliquity of the ecliptic (solstice declination)
YEAR = 2026

ROAD_CLASSES = {"trunk", "primary", "secondary", "tertiary", "minor", "service", "busway"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
MON3 = [m[:3] for m in MONTHS]


# ---------------- the sun
def decl_doy(doy):
    """solar declination (degrees) on day of year doy (1 = 1 January, noon UT, non-leap year), from the NOAA/Spencer
    Fourier series (Spencer 1971)"""
    import numpy as np
    g = 2 * np.pi * (np.asarray(doy, float) - 1 + 0.5) / 365.0
    return np.degrees(0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g)
                      + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g))


def refraction(h_app):
    """refraction (degrees) at apparent altitude h_app, Bennett (1982)"""
    import numpy as np
    h = np.maximum(np.asarray(h_app, float), -1.0)
    return 1.0 / np.tan(np.radians(h + 7.31 / (h + 4.4))) / 60.0


def decl_for(lat, az, h_app):
    """declination (degrees) the sun must have for its centre to stand at azimuth az (from north, clockwise) and
    apparent altitude h_app at latitude lat: sin d = sin(lat) sin(h) + cos(lat) cos(h) cos(az), h the true altitude"""
    import numpy as np
    h = np.radians(np.asarray(h_app, float) - refraction(h_app))
    p = np.radians(lat)
    return np.degrees(np.arcsin(np.clip(np.sin(p) * np.sin(h) + np.cos(p) * np.cos(h) * np.cos(np.radians(az)), -1, 1)))


def az_for(lat, dec, h_app, setting=True):
    """azimuth of the sun's centre at apparent altitude h_app for declination dec (rising if not setting)"""
    import numpy as np
    h = np.radians(np.asarray(h_app, float) - refraction(h_app))
    p, d = np.radians(lat), np.radians(dec)
    c = (np.sin(d) - np.sin(p) * np.sin(h)) / (np.cos(p) * np.cos(h))
    a = np.degrees(np.arccos(np.clip(c, -1, 1)))
    return 360 - a if setting else a


_DOY = None


def days_for_decl(dec):
    """the days of the year (1..365, fractional) when the noon declination equals dec: 0, 1 or 2 days"""
    import numpy as np
    global _DOY
    if _DOY is None:
        x = np.arange(1, 366.001, 0.02)
        _DOY = (x, decl_doy(x))
    x, y = _DOY
    s = y - dec
    i = np.where(np.sign(s[:-1]) != np.sign(s[1:]))[0]
    out = []
    for j in i:
        t = s[j] / (s[j] - s[j + 1])
        out.append(float(x[j] + t * (x[j + 1] - x[j])))
    return out


def doy_to_date(doy):
    import datetime
    d = datetime.date(YEAR, 1, 1) + datetime.timedelta(days=int(round(doy)) - 1)
    return f"{d.day} {MONTHS[d.month - 1]}"


def doy_to_short(doy):
    import datetime
    d = datetime.date(YEAR, 1, 1) + datetime.timedelta(days=int(round(doy)) - 1)
    return f"{d.day} {MON3[d.month - 1]}"


# ---------------- io and formatting
def jsave(obj, path, indent=None):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "wt", encoding="utf-8") as f:
        json.dump(nonan(obj), f, ensure_ascii=False, allow_nan=False, indent=indent, separators=None if indent else (",", ":"))


def jload(path):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def nonan(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, dict):
        return {k: nonan(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [nonan(x) for x in v]
    if hasattr(v, "item"):
        return nonan(v.item())
    return v


def get(R, path):
    v = R
    for k in path.split("."):
        v = v[int(k)] if isinstance(v, list) else v[k]
    return v


def fmt(v, f=None):
    if f is None or f == "raw": return str(v)
    if f == "int": return f"{round(float(v)):,}"
    if f == "pc": return f"{round(float(v))}%"
    if f == "pc1": return f"{float(v):.1f}%"
    if f == "f1": return f"{float(v):.1f}"
    if f == "f2": return f"{float(v):.2f}"
    if f == "deg": return f"{float(v):.1f}°"
    if f == "deg0": return f"{round(float(v))}°"
    if f == "km": return f"{float(v) / 1000:.1f} km"
    if f == "date": return doy_to_date(v)
    raise ValueError(f)
