"""Step 11: README.md, LICENSE and the Reddit post text (reddit/post.md), filled from data/results.json."""
from common import *

R = jload(f"{DATA}/results.json")
n, c, mb, B = R["n"], R["chance"], R["midsummer_boulevard"], R["best_solstice"]
readme = f"""# Manhattanhenge for every British town

The days when the sun rises or sets straight down each of {n['sections']:,} straight named streets in the {n['towns']} UK towns and cities of {n['min_pop']:,} people or more, with the terrain skyline at the end of each street, the streets that line up with the solstices, whether there are more of them than chance would give, and a henge calendar for every town.

Interactive page: {PAGE}
Paper: {{https://doi.org/10.5281/zenodo.24075297}}
Blog post: {{https://blog.tristanhotham.com/2026/10/31/street-henge/}}
Code and data: {REPO}

## Headline results

- {R['with_henge_pc']:.1f}% of {n['sections']:,} straight stretches of named street ({n['km']:,} km, each at least {n['min_len']} m) line up with the rising or setting sun on at least one day a year.
- {n['sol1']:,} lie within 1° of a solstice sunrise or sunset over their own skyline ({n['sol2']:,} within 2°). The longest street is {B[0]['name']}, {B[0]['town']} ({B[0]['length']:,} m, {B[0]['event']}).
- No sign of design: {c['sol1_pc']:.2f}% of street ends lie within 1° of a solstice, against {c['expected_pc']:.2f}% expected from the offsets a few degrees either side (ratio {c['ratio']:.2f}, p = {c['p']:.2f}). St Annes and Bournemouth have more than their share because of their grids.
- Midsummer Boulevard, Milton Keynes, runs at {mb['bearing']:.1f}°; the midsummer sun rises over its skyline at about {mb['sun_az_ms_rise']:.1f}°, a miss of {mb['off_min']:.1f}° to {mb['off_max']:.1f}° (checked independently from the tile geometry and with PyEphem). The sun rises along it about {mb['date1']} and {mb['date2']}. On midsummer morning the sun stands on the axis {mb['alt_on_axis']:.1f}° up, about {mb['min_after_gleam']} minutes after the first gleam, which a viewer at the low western end may see over the crest of the boulevard: close to the planners' own claim that it "nearly" lines up, not the later story of an exact astronomical alignment.
- Henge days come in pairs, one each side of the solstice: Glasgow {R['cities']['Glasgow']['peak_date']} and {R['cities']['Glasgow']['peak2_date']} (sunset), Liverpool {R['cities']['Liverpool']['peak_date']} and {R['cities']['Liverpool']['peak2_date']} (sunset), London {R['cities']['London']['peak_date']} and {R['cities']['London']['peak2_date']} (sunrise); every town's calendar is on the map.

## Files

| File | What it is |
|---|---|
| `index.html` | The interactive page (built by `code/08_build_site.py`): the Inked World map style on MapLibre GL JS; towns to tap, each loading its straight streets coloured by the season when the sun lines up with them; a henge calendar and longest henge streets for the town; a date slider that lights the streets that catch the sun that day; solstice streets everywhere; search and popups. |
| `header.png` | Social card, 1200 x 630. |
| `data/streets.csv` | Every straight stretch ({n['sections']:,} rows): town, name, road class, end points, length, bearing, straightness, skyline each way, offset from the solstice and equinox sun, road or street, declination and dates of alignment at each end. ODbL. |
| `data/town_summary.csv` | Each town: streets, km, solstice streets, grid direction and strength, grid henge dates, best henge day. |
| `data/towns.csv` | The towns used (Wikidata, CC0), with the study circle radius. |
| `data/results.json` | Every number quoted on the page, in the paper, blog, collage and post. |
| `data/towns.json`, `data/towns/*.json`, `data/solstice_streets.json` | Page data. |
| other `data/*` files, `js/`, `fonts/` | The Inked World map style, copied from the ink-map study via church-orientation. |
| `code/` | Numbered scripts, `overrides.csv` (roads that are not streets), templates, `qa.js`. |
| `release/` | Paper, blog post and figures, Zenodo files. |
| `reddit/` | Collage (`collage.py`, PNG) and post text. |

## Method in brief

- Towns: Wikidata settlements of {n['min_pop']:,} people or more with a town or city type; regions, conurbations and suburbs removed; nested centres merged; circle radius sqrt(pop x 400 m² / pi), 1.5 to 22 km.
- Streets: OpenFreeMap z14 `transportation_name` lines (trunk to minor, service, busway, pedestrian), clipped to their tiles, joined by name; straight stretches of {n['min_len']} m or more with every vertex within {n['tol']:.0f} m of the chord; dual carriageways counted once ({n['dual_dropped']:,} removed); continuing stretches joined ({n['joins']}). Trunk roads, bypasses, bridges, piers ({n['roads']:,}) flagged as roads.
- Skyline: AWS Terrain Tiles z10, from each end along the street, 100 m to 40 km, eye 1.7 m, curvature and refraction (k = 0.13), 3 x 3 median against spikes.
- Sun: declination needed for the sun's centre to stand on the skyline down the street, sin d = sin(lat) sin(h) + cos(lat) cos(h) cos(A), with Bennett (1982) refraction; days from the Spencer (1971) series for 2026. Solstice aligned: within 1° (or 2°) of the solstice azimuth over the same skyline.
- Chance: share of street ends within 1° of a solstice against the mean share per degree at 2° to 8° either side.
- Caveats: buildings and trees are not in the skyline; the moment is the sun's centre on the skyline (the upper limb's first gleam is about 0.5° further north at midsummer); dates move by a day between years; the 5 m tolerance allows about 1° on the shortest stretches.

## How to rerun

Needs Python 3 with pandas, numpy, scipy, shapely, matplotlib, Pillow, fontTools and mapbox-vector-tile; xelatex and pdfinfo; node with Playwright for `code/qa.js`. Raw inputs are listed in `code/common.py`; intermediates and the tile cache go to `SH_WORK`. Step 02 reads OpenFreeMap tiles over the network.

```
python3 code/01_towns.py       # towns and circles
python3 code/02_tiles.py       # named streets from OpenFreeMap (network, cached)
python3 code/03_sections.py    # straight stretches
python3 code/03b_join.py       # join stretches that continue each other
python3 code/04_horizon.py     # skylines
python3 code/05_henge.py       # declinations and days
python3 code/06_results.py     # results.json and data files
python3 code/06b_mk_check.py   # independent Milton Keynes check (network; pip install ephem pyproj)
python3 code/07_figures.py     # figures
python3 code/08_build_site.py  # index.html
python3 code/09_paper.py       # paper PDF (DOI=10.5281/zenodo.N to fill the DOI)
python3 reddit/collage.py      # collage and header
python3 code/11_readme.py      # README, LICENSE, Reddit post
python3 code/10_release.py     # blog post, Zenodo files
```

## Sources and licences

- OpenStreetMap (https://www.openstreetmap.org/), © OpenStreetMap contributors, Open Database Licence, through OpenFreeMap vector tiles (OpenMapTiles schema). `data/streets.csv`, `data/towns/*.json` and `data/solstice_streets.json` are derived databases under the ODbL.
- Wikidata (https://www.wikidata.org/), CC0: towns and populations.
- AWS Terrain Tiles (https://registry.opendata.aws/terrain-tiles/), Tilezen; open data with attribution (SRTM and other sources).
- Midsummer Boulevard: David Lock as quoted from Hill, M. (ed.) (2007) The Story of the Original Central Milton Keynes, Living Archive Milton Keynes; Stuart Mosscrop as quoted by The Parks Trust, Mysticism in the park (https://theparkstrust.com/our-work/heritage/campbell-park-trail/mysticism-in-the-park).
- Sun: Spencer, J. W. (1971) Fourier series representation of the position of the sun, Search 2(5), 172; Bennett, G. G. (1982) The calculation of astronomical refraction in marine navigation, Journal of Navigation 35(2), 255 to 259. Street grids: Boeing, G. (2019) Urban spatial order, Applied Network Science 4, 67.
- Map style: the Inked World (ink-map study, MIT code), with Natural Earth, RESOLVE Ecoregions 2017 (CC BY 4.0) and Wikidata (CC0).
- Fonts: MedievalSharp and IM Fell (SIL Open Font License); Fraunces, Source Serif 4, IBM Plex Mono (SIL Open Font License).

## Citation

Hotham, T. (2026) Manhattanhenge for every British town: when the sun rises and sets along the straight streets of UK towns. Zenodo. {{https://doi.org/10.5281/zenodo.24075297}}

Dr Tristan Hotham, Independent researcher. ORCID 0000-0003-4931-9349.

{AI}
"""
for bad in ("—", "–", "--", "DSIT", "DCMS"):
    assert bad not in "\n".join(l for l in readme.replace("```", "").splitlines() if not l.startswith("|---")), bad
open(os.path.join(ROOT, "README.md"), "w", encoding="utf-8").write(readme)
lic = open("/home/claude/studies/church-orientation/LICENSE", encoding="utf-8").read().split("Church data")[0]
lic += """Street data (data/streets.csv, data/towns/*.json, data/solstice_streets.json): derived from OpenStreetMap, © OpenStreetMap contributors, Open Database Licence 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).
Towns: Wikidata, CC0. Terrain: AWS Terrain Tiles (Tilezen), attribution as in README.
Map style files in js/, fonts/ and the basemap data in data/ come from the ink-map study (code MIT; data credits in its README: OpenStreetMap ODbL, RESOLVE Ecoregions CC BY 4.0, Wikidata CC0, Natural Earth). Fonts under the SIL Open Font License (see fonts/ttf).
"""
open(os.path.join(ROOT, "LICENSE"), "w", encoding="utf-8").write(lic)
post = f"""**Title:** [OC] Manhattanhenge for every British town: I found the days the sun sets straight down {n['sections']:,} streets in {n['towns']} UK towns. {n['sol1']:,} line up with a solstice, about as many as chance would give.

**Body:**

Manhattanhenge is when the setting sun lines up with Manhattan's street grid. Every town with straight streets has its own dates, so I worked them out for every straight stretch of named street (300 m or more) in UK towns of {n['min_pop']:,}+ people, allowing for the hills on the skyline.

- {R['with_henge_pc']:.0f}% of straight streets catch the rising or setting sun on at least one day a year.
- {n['sol1']:,} line up within 1° with a solstice sunrise or sunset. Longest: {B[0]['name']}, {B[0]['town']} ({B[0]['length']:,} m).
- But there's no spike at the solstice: {c['sol1_pc']:.2f}% of street ends vs {c['expected_pc']:.2f}% expected. No sign that British streets were laid out to the sun.
- Midsummer Boulevard in Milton Keynes, supposedly aligned with the midsummer sunrise, misses it by {mb['off_min']:.0f}° or more over the land. The sun rises along it about {mb['date1']} and {mb['date2']}; on midsummer morning it only gets onto the axis about {mb['min_after_gleam']} minutes after sunrise, {mb['alt_on_axis']:.1f}° up, which is roughly what the planners said ("which it nearly does").

Interactive map: tap your town, see its henge calendar, and slide the date to watch streets light up: {PAGE}

**Source comment:**

Data: OpenStreetMap contributors (ODbL) via OpenFreeMap vector tiles; towns from Wikidata (CC0); skyline from AWS Terrain Tiles. Tools: Python (shapely, numpy, matplotlib), MapLibre. Straight stretch = every point within 5 m of the line between its ends. Sun: Spencer (1971) declination, Bennett (1982) refraction. Paper and code: {REPO}
"""
for bad in ("—", "–", "--"):
    assert bad not in post, bad
os.makedirs(os.path.join(ROOT, "reddit"), exist_ok=True)
open(os.path.join(ROOT, "reddit", "post.md"), "w", encoding="utf-8").write(post)
print("README, LICENSE, post written")
