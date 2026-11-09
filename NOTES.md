# NOTES: street-henge (batch 9, study 4)

Brief: /home/claude/work/new9/BRIEFS.md (study 4) + shared rules. Siblings: church-orientation (OFM code), sunless-valleys (horizon, sun).
Intermediates and tile cache: /home/claude/scratch/street-henge (delete at end).

## Plan
1. 01_towns.py: Wikidata settlements pop >= 25,000, town/city types, nested towns merged; circle r = sqrt(pop*400/pi).
2. 02_tiles.py: OFM z14 transportation_name lines (named, road classes), clipped to tile squares, cached per tile.
3. 03_sections.py: per town, merge lines by name, straight sections >= 300 m (vertices within 5 m of chord), dedupe dual carriageways.
4. 04_horizon.py: terrain horizon (AWS terrarium z10) along both directions of every section, from the viewer end.
5. 05_henge.py: sun declination needed for each end, henge dates, solstice/equinox alignment, town calendars -> results.json.
6. site, figures, paper, blog, release, readme, collage, QA.

## Log
- Wikidata data errors in uk_settlements: Coppice (suburb) 2.8M, Somerset 975k, metro areas: removed by type/name rules; cities that also carry "urban area" type kept (Bath).
- 377 towns after merging 30 nested centres (Salford, Gateshead, Birkenhead... into larger neighbours).
- 02 tiles: 9,077 OFM z14 tiles (~18 min), 0 failures. 03: 40,433 stretches, 2,919 dual carriageways dropped; 03b joined 290 -> 37,224.
- 04 horizon bug found and fixed (pixel offset into mosaic: all skylines identical on first run).
- Checks: every solstice-aligned stretch >= 600 m (105) read by name/town: bypasses, Kessock Bridge, South Pier (Tynemouth),
  trunk roads -> flagged road via code/overrides.csv patterns + class trunk (3,026 flagged, kept in data). No other errors seen;
  suspicious pair Fox Street / Forsyth Street, Greenock (both 959 m) look like parallel grid streets, kept.
  Wikidata settlement errors removed by type/name rules (Coppice 2.8M, Somerset, metro areas); nested centres merged (30).
- Results: 49.4% of stretches catch sun; 1,072 solstice within 1 deg (1,849 within 2); chance ratio 1.01 (end level, p=0.31);
  St Annes, Bournemouth, Basingstoke exceed after Bonferroni. Midsummer Boulevard 55.1 deg vs MS sunrise 50.1 over skyline
  (flat 48.7): misses by 4.0-6.7 deg; sun along it ~24 May / 20 Jul. Glasgow best 6 Apr; grid 9 deg -> sunsets 2 Apr / 11 Sep.
- Manhattan check: az 299 at 40.75N flat -> 26 May / 18 Jul (published Manhattanhenge ~28-30 May / 11-13 Jul, different moment definition).
- References to verify: Spencer 1971; Bennett 1982 J Navigation 35(2) 255-259; Boeing 2019 Appl Netw Sci 4, 67; Terrain Tiles registry URL (seen in sunless-valleys). Tyson naming Manhattanhenge stated without citation.
- Reviewer flag: the Midsummer Boulevard result contradicts the popular claim; worth checking the OSM geometry by eye on a real map.
- DONE: all files; QA 0 errors except blocked Google Fonts and cancelled tile requests. Scratch (tile cache) deleted at end:
  rerunning 02 refetches (~18 min); 07_figures fig_mk and collage need the tile cache.

## Independent review (2026)
- Refetched tiles and reran 03 to 06: results.json reproduced exactly (37,224; 49.4%; 1,072; ratio 1.01, p 0.313).
- Milton Keynes: new code/06b_mk_check.py measures the boulevard straight from the tiles with pyproj (8 pieces 54.8 to 56.4 deg true,
  PCA 55.2; OS grid reads 1.0 deg less) and checks the sun with PyEphem (limb 48.2, centre 48.8, on axis 3.6 deg up, 35 min after gleam).
  06_results adds flat_az_limb, alt_on_axis, min_after_gleam, h_west_end. Texts now report the planners' claim (Lock "which it nearly
  does", via Hill 2007; Mosscrop: coincidence, grid adjusted slightly, via The Parks Trust page, which also gives 20 July) and the
  viewpoint explanation (west end by the station, looking uphill: terrain 1.2 deg plus trees/buildings).
- City calendars: every best day has a near-equal twin across the solstice (Glasgow 6 Apr 4,798 m vs 7 Sep 4,689 m); peak2 added and
  texts, paper table and calendar titles give both dates.
- Wording: "exactly as many/often as chance" -> "about"; Reddit "Nobody built for the sun" removed; Manhattan check stated with its
  real 2 and 6 day gaps; LaTeX quotes removed from the Zenodo abstract; correlated street ends noted (cluster-adjusted tests agree).
- Figures: MK subtitle overflow and cut footer fixed; collage colour bar no longer overlaps the subtitle, full legend added on paper,
  map extended north to 57.75 N.
- Tile cache deleted again after the review.
