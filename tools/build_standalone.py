"""Build a single self-contained HTML file of the web app (double-click to open, works offline).

Usage:  python tools/build_standalone.py  ->  dist/IchAnTool.html

ES modules cannot be loaded from file:// URLs, so the modules are concatenated (in dependency
order, with import/export statements removed) into one inline <script type="module">, and the
example image is embedded as a data URI.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
ORDER = ["core.js", "imageproc.js", "learn.js", "i18n.js", "app.js"]
EXAMPLE = ROOT / "examples" / "data" / "idealized_core_0-500cm.jpg"
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

    example_uri = "data:image/jpeg;base64," + base64.b64encode(EXAMPLE.read_bytes()).decode()
    bundle = bundle.replace("const EXAMPLE_URLS = [", f"const EXAMPLE_URLS = ['{example_uri}', ", 1)

    html = (APP / "index.html").read_text(encoding="utf-8")
    tag = '<script type="module" src="js/app.js"></script>'
    if tag not in html:
        raise SystemExit("script tag not found in app/index.html")
    html = html.replace(tag, "<script type=\"module\">\n" + bundle.replace("</script", "<\\/script") + "\n</script>")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


if __name__ == "__main__":
    p = build()
    print(f"{p}  ({p.stat().st_size / 1e6:.2f} MB)")
