**Title:** [OC] Manhattanhenge for every British town: I found the days the sun sets straight down 37,224 streets in 377 UK towns. 1,072 line up with a solstice, about as many as chance would give.

**Body:**

Manhattanhenge is when the setting sun lines up with Manhattan's street grid. Every town with straight streets has its own dates, so I worked them out for every straight stretch of named street (300 m or more) in UK towns of 25,000+ people, allowing for the hills on the skyline.

- 49% of straight streets catch the rising or setting sun on at least one day a year.
- 1,072 line up within 1° with a solstice sunrise or sunset. Longest: Bursledon Road, Southampton (2,995 m).
- But there's no spike at the solstice: 1.86% of street ends vs 1.83% expected. No sign that British streets were laid out to the sun.
- Midsummer Boulevard in Milton Keynes, supposedly aligned with the midsummer sunrise, misses it by 4° or more over the land. The sun rises along it about 24 May and 20 July; on midsummer morning it only gets onto the axis about 36 minutes after sunrise, 3.6° up, which is roughly what the planners said ("which it nearly does").

Interactive map: tap your town, see its henge calendar, and slide the date to watch streets light up: https://maps.tristanhotham.com/street-henge/

**Source comment:**

Data: OpenStreetMap contributors (ODbL) via OpenFreeMap vector tiles; towns from Wikidata (CC0); skyline from AWS Terrain Tiles. Tools: Python (shapely, numpy, matplotlib), MapLibre. Straight stretch = every point within 5 m of the line between its ends. Sun: Spencer (1971) declination, Bennett (1982) refraction. Paper and code: https://github.com/Tristan-Hotham/street-henge
