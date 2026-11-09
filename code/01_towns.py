"""Step 1: the towns. Wikidata UK settlements of MIN_POP people or more, one row per item, types limited to towns and
cities (metropolitan areas, conurbations, built-up areas, city regions, counties, suburbs and areas of London are left
out, since their populations belong to something larger or their points are not a town centre). Each town gets a
study circle of radius r = sqrt(pop x 400 m2 / pi) (about 400 m2 of town per person), at least 1.5 km and at most
22 km (London). A street belongs to the town whose centre is nearest, among the towns whose circle holds it.
Output: data/towns.csv
"""
import csv, re
import numpy as np, pandas as pd
from common import *

KEEP = {"town", "market town", "city", "big city", "county town", "new town (UK)", "seaside resort", "town of the United Kingdom",
        "city of United Kingdom", "college town", "largest city", "national capital", "planned community", "cathedral city",
        "port city", "port", "spa town", "city status in the United Kingdom", "metropolis", "global city", "megacity",
        "financial center", "post town", "resort town", "university town", "mining community", "industrial city",
        "former city", "village", "Village", "civil parish", "community", "human settlement", "town in Scotland",
        "town in Wales", "burgh", "royal burgh", "large burgh", "ancient borough", "county borough", "unparished area"}
DROP_NAME = re.compile(r"metropolitan|urban area|built-up|conurbation|city region|county|shire$|^somerset$|^greater ", re.I)
rows = {}
with open(SETT, encoding="utf-8") as f:
    rd = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
    next(rd)
    for x in rd:
        q = x[0].strip("<>").split("/")[-1]
        name = x[1].split('"@')[0].strip('"')
        m = re.match(r"POINT\(([-\d.]+) ([-\d.]+)\)", x[2])
        if not m:
            continue
        try:
            pop = float(x[3].split("^^")[0].strip('"'))
        except ValueError:
            continue
        typ = x[4].split('"@')[0].strip('"')
        r = rows.setdefault(q, dict(qid=q, name=name, lon=float(m.group(1)), lat=float(m.group(2)), pop=pop, types=set()))
        r["types"].add(typ)
        r["pop"] = max(r["pop"], pop)
T = pd.DataFrame(rows.values())
T["ok_type"] = T.types.map(lambda s: bool(s & KEEP) and not (s & {"area of London", "suburb", "inner suburb", "neighborhood"}))
T = T[(T["pop"] >= MIN_POP) & T.ok_type & ~T.name.str.contains(DROP_NAME)]
T = T[(T.lon > -8.7) & (T.lon < 1.9) & (T.lat > 49.85) & (T.lat < 60.9)]
# implausible populations for the type (Wikidata errors): a "town" over 1.2 million other than London
T = T[(T["pop"] < 1.2e6) | (T.name == "London")]
# one item per name and place (several items can describe the same town)
T = T.sort_values("pop", ascending=False).drop_duplicates(subset=["name"], keep="first")
T["r_km"] = np.clip(np.sqrt(T["pop"] * 400 / math.pi) / 1000, 1.5, 22.0).round(2)
# a town whose centre lies inside the circle of a larger town is part of it (Kingstanding in Birmingham)
T = T.reset_index(drop=True)
kx = np.cos(np.radians(T.lat.values))
keep = np.ones(len(T), bool)
for i in range(len(T)):
    for j in range(i):
        if keep[j]:
            d = math.hypot((T.lon[i] - T.lon[j]) * 111.195 * kx[i], (T.lat[i] - T.lat[j]) * 111.195)
            if d < 0.75 * T.r_km[j]:
                keep[i] = False
                break
print("merged into a larger town:", ", ".join(T.name[~keep].tolist()))
T = T[keep].copy()
T["types"] = T.types.map(lambda s: "; ".join(sorted(s)))
T = T.drop(columns="ok_type").reset_index(drop=True)
T["tid"] = np.arange(len(T))
T.to_csv(os.path.join(DATA, "towns.csv"), index=False)
print(len(T), "towns;", T.head(25)[["name", "pop", "r_km"]].to_string())
