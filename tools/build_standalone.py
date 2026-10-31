"""Build a single self-contained HTML file of the web app (double-click to open, works offline).

Usage:  python tools/build_standalone.py  ->  dist/IchAnTool.html

ES modules cannot be loaded from file:// URLs, so the modules are concatenated (in dependency
order, with import/export statements removed) into one inline <script type="module">, and the
example image is embedded as a data URI.
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
ORDER = ["core.js", "imageproc.js", "learn.js", "log.js", "storage.js", "i18n.js", "geo.js", "app.js"]
EXAMPLES = ROOT / "examples"
# Files the app loads with fetchAsset(path); embedded so the single file works offline.
ASSETS = ["data/idealized_core_0-500cm.jpg"] + [f"U1385I-1H/web/397-U1385I-1H-{i}-A_50pxcm.jpg" for i in range(1, 7)] + [
    "U1385I-1H/records/397-U1385I-1H_RSC_color.csv", "U1385I-1H/records/397-U1385I-1H_MS.csv",
    "data/land-50m.json", "geochem_demo/demo_long.csv", "geochem_demo/intervals.csv"] + [f"tesis_casanova/{f}" for f in (
    "ODP977A_pangaea.csv", "ODP976_pangaea.csv", "catalogue.csv", "intervals_age.csv", "intervals_depth.csv", "LC10_age_model.txt")]
MIME = {".jpg": "image/jpeg", ".csv": "text/csv", ".json": "application/json", ".txt": "text/plain"}
TOP_DECL = re.compile(r"^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)", re.M)


def strip_module(src: str) -> str:
    src = re.sub(r"^import\s[^;]*;\s*$", "", src, flags=re.M)
    return re.sub(r"^export\s+", "", src, flags=re.M)


def build(out: Path = ROOT / "dist" / "IchAnTool.html") -> Path:
    seen: dict[str, str] = {}
    parts = []
    for name in ORDER:
        code = (APP / "js" / name).read_text(encoding="utf-8")
        for ident in TOP_DECL.findall(code):
            if ident in seen:
                raise SystemExit(f"Name clash: {ident!r} defined in {seen[ident]} and {name}")
            seen[ident] = name
        parts.append(f"// ---- {name} ----\n{strip_module(code)}")
    bundle = "\n".join(parts)

    # Private thesis data (git-ignored) is bundled only when present on this machine.
    private = sorted(str(p.relative_to(EXAMPLES)).replace("\\", "/") for p in (EXAMPLES / "tesis_casanova" / "privado").glob("*") if p.suffix in MIME)
    assets = {a: f"data:{MIME[Path(a).suffix]};base64," + base64.b64encode((EXAMPLES / a).read_bytes()).decode() for a in ASSETS + private}
    assets_js = "window.ICHANTOOL_ASSETS = " + json.dumps(assets) + ";"

    html = (APP / "index.html").read_text(encoding="utf-8")
    tag = '<script type="module" src="js/app.js"></script>'
    if tag not in html:
        raise SystemExit("script tag not found in app/index.html")
    html = html.replace(tag, "<script>" + assets_js + "</script>\n<script type=\"module\">\n" + bundle.replace("</script", "<\\/script") + "\n</script>")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


if __name__ == "__main__":
    p = build()
    print(f"{p}  ({p.stat().st_size / 1e6:.2f} MB)")
