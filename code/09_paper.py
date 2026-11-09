"""Step 9: the paper. Fills code/paper_template.tex from data/results.json, adds tables, compiles with xelatex.
Output: release/paper/Hotham_Street_Henge.pdf and .tex beside the f_*.png figures. The DOI stays a placeholder
unless the publisher reruns with DOI=10.5281/zenodo.N in the environment."""
import re, subprocess
from common import *

R = jload(f"{DATA}/results.json")
OUT = os.path.join(ROOT, "release", "paper"); NAME = "Hotham_Street_Henge"
tex = lambda s: str(s).replace("\\", "").replace("&", "\\&").replace("%", "\\%").replace("_", "\\_").replace("#", "\\#").replace("$", "\\$")


def tfmt(v, f):
    if f == "int": return f"{int(round(float(v))):,}"
    if f == "pc": return f"{round(float(v))}\\%"
    if f == "f1": return f"{float(v):.1f}"
    if f == "f2": return f"{float(v):.2f}"
    return tex(str(v))


def pv(p):
    return "$<$0.001" if p < 0.001 else f"{p:.3f}"


rows = ""
for b in R["best_solstice"][:15]:
    rows += f"{tex(b['name'])} & {tex(b['town'])} & {b['length']:,} & {b['bearing']:.1f} & {tex(b['event'])}{' (both)' if b['both'] else ''} & {b['off']:.2f} & {b['h']:.2f}\\\\\n"
TB = ("\\begin{table}[tbp]\\centering\\footnotesize\\caption{The longest straight streets within 1° of a solstice sunrise or sunset over their own skyline (trunk roads and bypasses excluded): length (m), bearing of the stretch (degrees from north, 0 to 180), the event, the offset from the solstice azimuth and the skyline angle (degrees) at the aligned end.}\\label{tab:best}"
      "\\begin{tabular}{llrrlrr}\\toprule Street & Town & Length & Bearing & Aligned with & Offset & Skyline\\\\\\midrule\n" + rows + "\\bottomrule\\end{tabular}\\end{table}")
rows = ""
for c, v in R["cities"].items():
    rows += f"{tex(c)} & {v['n']:,} & {v['km']:.0f} & {v['sol1']} & {v['grid']:.1f} & {v['grid_str']:.2f} & {v['peak_date']}, {v['peak2_date']} ({'sunset' if v['peak_kind'] == 'set' else 'sunrise'})\\\\\n"
TC = ("\\begin{table}[tbp]\\centering\\small\\caption{The largest cities: straight stretches, their length (km), solstice-aligned stretches, grid direction (degrees, modulo 90) and strength, and the best henge day with its near-equal twin on the other side of the solstice.}\\label{tab:cities}"
      "\\begin{tabular}{lrrrrrl}\\toprule City & Stretches & km & Solstice & Grid & Strength & Best days\\\\\\midrule\n" + rows + "\\bottomrule\\end{tabular}\\end{table}")
t = open(os.path.join(ROOT, "code", "paper_template.tex"), encoding="utf-8").read()
t = t.replace("{{AI}}", AI).replace("{{TABLE_BEST}}", TB).replace("{{TABLE_CITIES}}", TC).replace("{{PAGE}}", PAGE).replace("{{REPO}}", REPO)
t = re.sub(r"\{\{(?!TABLE_|DOI)([^}|]+)(\|(\w+))?\}\}", lambda m: tfmt(get(R, m.group(1)), m.group(3) or "raw"), t)
DOI = os.environ.get("DOI")
t = t.replace("https://doi.org/10.5281/zenodo.24075297", f"\\url{{https://doi.org/{DOI}}}" if DOI else "\\{\\{DOI\\_URL\\}\\}")
assert "{{" not in t and "--" not in t and "—" not in t and "–" not in t
for bad in ("DSIT", "DCMS"):
    assert bad not in t
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, NAME + ".tex"), "w", encoding="utf-8").write(t)
for _ in range(2):
    r = subprocess.run(["xelatex", "-interaction=nonstopmode", NAME + ".tex"], cwd=OUT, capture_output=True, text=True)
log = open(os.path.join(OUT, NAME + ".log"), encoding="utf-8", errors="ignore").read()
print([l for l in log.splitlines() if "Missing character" in l or "undefined" in l.lower() or "Overfull" in l][:12])
for ext in (".aux", ".log", ".out", ".bbl", ".blg"):
    q = os.path.join(OUT, NAME + ext)
    if os.path.exists(q): os.remove(q)
txt = subprocess.run(["pdftotext", os.path.join(OUT, NAME + ".pdf"), "-"], capture_output=True, text=True).stdout
pages = subprocess.run(["pdfinfo", os.path.join(OUT, NAME + ".pdf")], capture_output=True, text=True).stdout
print("paper", r.returncode, len(txt.split()), "words;", [l for l in pages.splitlines() if l.startswith("Pages")], "DOI_URL shown:", "https://doi.org/10.5281/zenodo.24075297" in txt)
