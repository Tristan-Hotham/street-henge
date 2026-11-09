"""Step 10: blog post and meta (release/blog), Zenodo files and metadata (release/zenodo).
10.5281/zenodo.24075297, https://doi.org/10.5281/zenodo.24075297 and https://blog.tristanhotham.com/2026/10/31/street-henge/ stay as placeholders for the publisher."""
import json as _json, re, shutil, zipfile, importlib.util
from PIL import Image
from common import *

spec = importlib.util.spec_from_file_location("b", os.path.join(ROOT, "code", "08_build_site.py"))
spec.loader.exec_module(importlib.util.module_from_spec(spec))          # shared fact checks (and rebuilds index.html)
R = jload(f"{DATA}/results.json")
REL = os.path.join(ROOT, "release"); NAME = "Hotham_Street_Henge"
KEEP = {"DOI", "DOI_URL", "BLOG_URL"}
# facts written in words in the blog only
assert 7 <= R["midsummer_boulevard"]["off_min"] / 0.53 < 9                         # "about eight times the width of the sun"
assert R["solstice_az"]["lat58_ms_set"] > R["solstice_az"]["lat50_ms_set"]

post = open(os.path.join(ROOT, "code", "blog_template.html"), encoding="utf-8").read()
post = re.sub(r"\{\{(?!IMG)([^}|]+)(\|(\w+))?\}\}", lambda m: m.group(0) if m.group(1) in KEEP else fmt(get(R, m.group(1)), m.group(3)), post)
used = re.findall(r"\{\{IMG\|([^|]+)\|", post)
assert 5 <= len(used) <= 8, len(used)
assert all(re.search(r"^\{\{IMG\|" + re.escape(u_), post, re.M) for u_ in used) and "wp:image" not in post
for img in used:
    assert Image.open(f"{REL}/blog/{img}").size[0] == 1800, img
for fn in os.listdir(f"{REL}/blog"):
    if fn.startswith("b_") and fn not in used:
        os.remove(f"{REL}/blog/{fn}")
assert set(re.findall(r"\{\{([^|}]+)\}\}", post)) <= KEEP, set(re.findall(r"\{\{([^|}]+)\}\}", post))
vis = re.sub(r"<!--.*?-->", "", post, flags=re.S)
for bad in ("\u2014", "\u2013", "--", "DSIT", "DCMS", "civil serv"):
    assert bad not in vis, bad
assert AI in post
open(f"{REL}/blog/post.html", "w", encoding="utf-8").write(post)
words = len(re.sub(r"<[^>]+>|\{\{IMG\|[^}]*\}\}", " ", vis).split())
meta = {"title": "Manhattanhenge for every British town",
        "slug": "street-henge",
        "excerpt": f"On which days does the sun set straight down your street? I worked it out for {R['n']['sections']:,} straight streets in {R['n']['towns']} UK towns and cities, with the hills on the skyline. {R['n']['sol1']:,} line up with a solstice, about as many as chance would give, and Midsummer Boulevard in Milton Keynes misses midsummer.",
        "seo_description": f"The days the sun sets straight down {R['n']['sections']:,} streets in {R['n']['towns']} UK towns, and why Midsummer Boulevard misses midsummer.",
        "tags": ["maps", "data visualisation", "sunset", "solstice", "Manhattanhenge", "streets", "OpenStreetMap", "Milton Keynes", "urban form"],
        "header_alt": f"Title card reading 'Manhattanhenge for every British town' on parchment beside a stylised sunset at the end of a street lined with blocks, with the line '{R['n']['sol1']:,} solstice streets, no more than chance'."}
assert len(meta["seo_description"]) < 160, len(meta["seo_description"])
jsave(meta, f"{REL}/blog/meta.json", indent=2)

Z = f"{REL}/zenodo"; os.makedirs(Z, exist_ok=True)
for fn in os.listdir(Z):
    os.remove(os.path.join(Z, fn))
shutil.copy(f"{REL}/paper/{NAME}.pdf", f"{Z}/{NAME}.pdf")
zp = f"{Z}/{SLUG}_data_and_code.zip"
OWN = ["streets.csv", "town_summary.csv", "towns.csv", "results.json"]
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for fn in sorted(os.listdir(os.path.join(ROOT, "code"))):
        if fn.endswith((".pyc", ".png")) or fn == "__pycache__":
            continue
        z.write(os.path.join(ROOT, "code", fn), f"{SLUG}/code/{fn}")
    for fn in OWN:
        z.write(os.path.join(DATA, fn), f"{SLUG}/data/{fn}")
    for fn in ("README.md", "LICENSE"):
        z.write(os.path.join(ROOT, fn), f"{SLUG}/{fn}")
    z.write(os.path.join(ROOT, "reddit", "collage.py"), f"{SLUG}/reddit/collage.py")
tex = open(f"{REL}/paper/{NAME}.tex", encoding="utf-8").read()
ab = re.search(r"\\begin\{center\}\\textbf\{Abstract\}\\end\{center\}\n(.*?)\n\n\\textbf\{Keywords", tex, re.S).group(1)
ab = ab.replace("\\%", "%").replace("\\&", "&").replace("$", "").replace("\\texttt{", "").replace("}", "").replace("\\emph{", "")
zmeta = {"title": "Manhattanhenge for Every British Town: When the Sun Rises and Sets Along the Straight Streets of UK Towns",
         "upload_type": "publication", "publication_type": "workingpaper",
         "description": f"<p>{ab}</p><p>Interactive version: <a href=\"{PAGE}\">{PAGE}</a>. Data and code: <a href=\"{REPO}\">{REPO}</a>. Blog post: {{https://blog.tristanhotham.com/2026/10/31/street-henge/}}.</p><p>Sources: OpenStreetMap contributors (ODbL) through OpenFreeMap vector tiles; Wikidata (CC0); AWS Terrain Tiles. The street table (streets.csv) is derived from OpenStreetMap and released under the Open Database Licence; other derived data and text CC BY 4.0; code MIT.</p>",
         "creators": [{"name": "Hotham, Tristan", "affiliation": "Independent researcher", "orcid": "0000-0003-4931-9349"}],
         "keywords": ["street orientation", "Manhattanhenge", "solar alignment", "solstice", "urban form", "OpenStreetMap", "terrain horizon", "Milton Keynes"],
         "license": "cc-by-4.0", "language": "eng",
         "related_identifiers": [{"identifier": REPO, "relation": "isSupplementedBy", "resource_type": "software"},
                                 {"identifier": PAGE, "relation": "isSupplementedBy", "resource_type": "other"},
                                 {"identifier": "https://www.openstreetmap.org/", "relation": "isDerivedFrom", "resource_type": "dataset"},
                                 {"identifier": "https://www.wikidata.org/", "relation": "isDerivedFrom", "resource_type": "dataset"}],
         "files": sorted(os.listdir(Z))}
sj = _json.dumps(zmeta, ensure_ascii=False) + _json.dumps(meta, ensure_ascii=False)
assert "\u2014" not in sj and "\u2013" not in sj and "--" not in sj
jsave(zmeta, f"{Z}/metadata.json", indent=2)
print("blog words", words, "figures", len(used), "; zenodo", sorted(os.listdir(Z)), os.path.getsize(zp) // 1024, "KB zip")
