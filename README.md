# Manhattanhenge for every British town

The days when the sun rises or sets straight down each of 37,224 straight named streets in the 377 UK towns and cities of 25,000 people or more, with the terrain skyline at the end of each street, the streets that line up with the solstices, whether there are more of them than chance would give, and a henge calendar for every town.

Interactive page: https://maps.tristanhotham.com/street-henge/
Paper: https://doi.org/10.5281/zenodo.24075297
Blog post: https://blog.tristanhotham.com/2026/10/31/street-henge/
Code and data: https://github.com/Tristan-Hotham/street-henge

## Headline results

- 49.4% of 37,224 straight stretches of named street (15,638 km, each at least 300 m) line up with the rising or setting sun on at least one day a year.
- 1,072 lie within 1° of a solstice sunrise or sunset over their own skyline (1,849 within 2°). The longest street is Bursledon Road, Southampton (2,995 m, midwinter sunrise).
- No sign of design: 1.86% of street ends lie within 1° of a solstice, against 1.83% expected from the offsets a few degrees either side (ratio 1.01, p = 0.31). St Annes and Bournemouth have more than their share because of their grids.
- Midsummer Boulevard, Milton Keynes, runs at 55.1°; the midsummer sun rises over its skyline at about 50.1°, a miss of 4.0° to 6.7° (checked independently from the tile geometry and with PyEphem). The sun rises along it about 24 May and 20 July. On midsummer morning the sun stands on the axis 3.6° up, about 36 minutes after the first gleam, which a viewer at the low western end may see over the crest of the boulevard: close to the planners' own claim that it "nearly" lines up, not the later story of an exact astronomical alignment.
- Henge days come in pairs, one each side of the solstice: Glasgow 6 April and 7 September (sunset), Liverpool 24 February and 18 October (sunset), London 12 April and 1 September (sunrise); every town's calendar is on the map.

## Files

| File | What it is |
|---|---|
| `index.html` | The interactive page (built by `code/08_build_site.py`): the Inked World map style on MapLibre GL JS; towns to tap, each loading its straight streets coloured by the season when the sun lines up with them; a henge calendar and longest henge streets for the town; a date slider that lights the streets that catch the sun that day; solstice streets everywhere; search and popups. |
| `header.png` | Social card, 1200 x 630. |
| `data/streets.csv` | Every straight stretch (37,224 rows): town, name, road class, end points, length, bearing, straightness, skyline each way, offset from the solstice and equinox sun, road or street, declination and dates of alignment at each end. ODbL. |
| `data/town_summary.csv` | Each town: streets, km, solstice streets, grid direction and strength, grid henge dates, best henge day. |
| `data/towns.csv` | The towns used (Wikidata, CC0), with the study circle radius. |
| `data/results.json` | Every number quoted on the page, in the paper, blog, collage and post. |
| `data/towns.json`, `data/towns/*.json`, `data/solstice_streets.json` | Page data. |
| other `data/*` files, `js/`, `fonts/` | The Inked World map style, copied from the ink-map study via church-orientation. |
| `code/` | Numbered scripts, `overrides.csv` (roads that are not streets), templates, `qa.js`. |
| `release/` | Paper, blog post and figures, Zenodo files. |
| `reddit/` | Collage (`collage.py`, PNG) and post text. |

## Method in brief

- Towns: Wikidata settlements of 25,000 people or more with a town or city type; regions, conurbations and suburbs removed; nested centres merged; circle radius sqrt(pop x 400 m² / pi), 1.5 to 22 km.
- Streets: OpenFreeMap z14 `transportation_name` lines (trunk to minor, service, busway, pedestrian), clipped to their tiles, joined by name; straight stretches of 300 m or more with every vertex within 5 m of the chord; dual carriageways counted once (2,919 removed); continuing stretches joined (290). Trunk roads, bypasses, bridges, piers (3,026) flagged as roads.
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

Hotham, T. (2026) Manhattanhenge for every British town: when the sun rises and sets along the straight streets of UK towns. Zenodo. https://doi.org/10.5281/zenodo.24075297

Dr Tristan Hotham, Independent researcher. ORCID 0000-0003-4931-9349.

I wrote the text, with drafting and editing assistance from Claude (Anthropic), which also helped prepare the analysis code. I reviewed and checked all text and results.
