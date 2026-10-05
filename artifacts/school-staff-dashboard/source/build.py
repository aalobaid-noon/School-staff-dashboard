#!/usr/bin/env python3
"""
Build the noon School Manager Dashboard.

Reads  : src/app.html    (markup + CSS + JS, with a /*__DATA__*/ marker)
         data/real.json  (live extract from the Noon data lake)
Writes : manager-dashboard.html  standalone, double-clickable
         dist/artifact.html      body-only, for publishing as an Artifact
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src" / "app.html"
DATA = ROOT / "data" / "real.json"

HEAD = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:#f1ebdd}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
"""
TAIL = "\n</body>\n</html>\n"


def main():
    body = SRC.read_text(encoding="utf-8")
    if "/*__DATA__*/" not in body:
        sys.exit("src/app.html is missing the /*__DATA__*/ marker")

    data = json.loads(DATA.read_text(encoding="utf-8"))
    payload = "const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
    payload = payload.replace("</", "<\\/")  # never close the script tag early
    filled = body.replace("/*__DATA__*/", payload)

    title = re.search(r"<title>(.*?)</title>", filled, re.S)
    head = HEAD + (f"<title>{title.group(1)}</title>\n" if title else "") + "</head>\n<body>\n"
    (ROOT / "manager-dashboard.html").write_text(head + filled + TAIL, encoding="utf-8")

    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "artifact.html").write_text(filled, encoding="utf-8")

    print(f"managers      : {len(data['managers'])}")
    print(f"campuses      : {len(data['campuses'])}")
    print(f"facilitators  : {len(data['facilitators'])} (facilitator x campus rows)")
    print(f"students       : {sum(c['enr'] for c in data['campuses']):,}")
    print(f"window         : {data['meta']['window_start']} -> {data['meta']['window_end']}")
    for p in ("manager-dashboard.html", "dist/artifact.html"):
        print(f"-> {p}  ({(ROOT / p).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
