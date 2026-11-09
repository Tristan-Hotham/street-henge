"""Step 8: index.html from code/page_template.html + page.css + essay.html, filled from data/results.json, with the
full-screen snippet; page images in img/; the Inked World map files copied from the church-orientation study.
10.5281/zenodo.24075297, https://doi.org/10.5281/zenodo.24075297 and https://blog.tristanhotham.com/2026/10/31/street-henge/ stay as placeholders for the publisher."""
import re, shutil
from PIL import Image
from common import *

R = jload(f"{DATA}/results.json")
KEEP = {"DOI_URL", "BLOG_URL", "DOI"}
# facts stated in words (page, blog, alt text)
c = R["chance"]
assert 0.85 < c["ratio"] < 1.15 and c["p"] > 0.05                      # "no sign of design", "exactly as often"
mb = R["midsummer_boulevard"]
assert mb["off_min"] >= 4 and mb["bearing"] > mb["sun_az_ms_rise"]     # "misses it by", "not by five"
assert R["design_test"]["top"][0]["town"] == "St Annes" and R["design_test"]["top"][1]["town"] == "Bournemouth"
assert [x["town"] for x in R["strongest_grids"][:2]] == ["Great Yarmouth", "Worthing"]
assert {"Southend-on-Sea", "Hartlepool"} <= {x["town"] for x in R["strongest_grids"]}
for x in R["strongest_grids"]:
    if x["town"] in ("Great Yarmouth", "Worthing", "Southend-on-Sea", "Hartlepool"):
        assert ("Mar" in x["grid_txt"]) and ("Sep" in x["grid_txt"] or "Oct" in x["grid_txt"]), x
assert "2 Apr" in R["cities"]["Glasgow"]["grid_txt"] and "11 Sep" in R["cities"]["Glasgow"]["grid_txt"]
assert "27 Feb" in R["cities"]["Edinburgh"]["grid_txt"] and "15 Oct" in R["cities"]["Edinburgh"]["grid_txt"]
assert R["cities"]["London"]["peak_kind"] == "rise"
assert R["best_solstice"][0]["name"] == "Bursledon Road"
css = open(os.path.join(ROOT, "code", "page.css"), encoding="utf-8").read()
essay = open(os.path.join(ROOT, "code", "essay.html"), encoding="utf-8").read()
rows = "".join(f"<tr><td>{b['name']}</td><td>{b['town']}</td><td class=\"r\">{b['length']:,} m</td><td>{b['event']}{', and the opposite solstice' if b['both'] else ''}</td></tr>" for b in R["best_solstice"])
t = open(os.path.join(ROOT, "code", "page_template.html"), encoding="utf-8").read()
t = t.replace("{{CSS}}", css).replace("{{ESSAY}}", essay).replace("{{BEST_ROWS}}", rows)
t = t.replace("{{FULLSCREEN}}", open(os.path.join(ROOT, "code", "fullscreen_snippet.html"), encoding="utf-8").read())
t = t.replace("{{REPO}}", REPO).replace("{{AI}}", AI)
t = re.sub(r"\{\{([^{}|]+)(\|(\w+))?\}\}", lambda m: m.group(0) if m.group(1) in KEEP else fmt(get(R, m.group(1)), m.group(3)), t)
left = set(re.findall(r"\{\{([^}]+)\}\}", t))
assert left <= KEEP, left
vis = re.sub(r"<script.*?</script>|<style.*?</style>|<!--.*?-->", "", t, flags=re.S)
for bad in ("—", "–", "--", "DSIT", "DCMS", "civil serv"):
    assert bad not in vis, bad
os.makedirs(os.path.join(ROOT, "img"), exist_ok=True)
for nm in ("sun", "map", "chance", "best", "mk", "calendars", "grids"):
    im = Image.open(os.path.join(ROOT, "release", "paper", f"f_{nm}.png")).convert("RGB")
    im.thumbnail((1200, 1600), Image.LANCZOS)
    im.save(os.path.join(ROOT, "img", f"{nm}.png"), optimize=True)
    t = re.sub(r'(src="img/%s\.png"[^>]*?)width="\d+" height="\d+"' % nm, r'\g<1>width="%d" height="%d"' % im.size, t)
open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(t)
SRC = "/home/claude/studies/church-orientation"
for fn in os.listdir(f"{SRC}/data"):
    if fn.endswith((".geojson", ".webp", ".png")) or fn in ("house_regions.json", "walls_boxes.json"):
        shutil.copy(f"{SRC}/data/{fn}", f"{DATA}/{fn}")
os.makedirs(f"{DATA}/grid", exist_ok=True)
shutil.copy(f"{SRC}/data/grid/index.json", f"{DATA}/grid/index.json")
print("index.html", len(t) // 1024, "KB")
