#!/usr/bin/env python3
"""
Build a Press-ready bundle: the same dashboard, split so every file is under
Press's 20 KB inline limit.

  index.html   markup + <link>/<script> tags
  style.css    the stylesheet
  d0..dN.js    the dataset, carried as JSON string chunks (safe to cut anywhere)
  a0..aN.js    the app, cut ONLY at top-level statement boundaries so each
               chunk parses on its own as a classic script

Classic scripts share one global scope, so splitting the app across several
<script> tags behaves exactly like one file as long as the cuts land between
top-level statements — which is what split_points() guarantees.
"""
import hashlib, json, pathlib, re, subprocess, sys

LIMIT = 18_000          # leave headroom under Press's 20 KB
ROOT  = pathlib.Path(__file__).resolve().parent
OUT   = ROOT / "press"


def split_points(js: str):
    """Byte offsets where a top-level statement ends — safe places to cut."""
    pts, depth, i, n, mode = [], 0, 0, len(js), None
    while i < n:
        c = js[i]
        if mode is None:
            if   c == "'": mode = 'sq'
            elif c == '"': mode = 'dq'
            elif c == '`': mode = 'tpl'
            elif c == '/' and i + 1 < n and js[i+1] == '/': mode = 'line'; i += 1
            elif c == '/' and i + 1 < n and js[i+1] == '*': mode = 'block'; i += 1
            elif c == '/':
                j = i - 1
                while j >= 0 and js[j] in ' \t\n': j -= 1
                prev = js[j] if j >= 0 else ''
                if prev in '=(,:[!&|?{};+-*%~^<>' or prev == '' or js[max(0, j-5):j+1].endswith('return'):
                    mode = 're'
            elif c in '{([': depth += 1
            elif c in '})]':
                depth -= 1
                if depth == 0 and c == '}': pts.append(i + 1)
            elif c == ';' and depth == 0: pts.append(i + 1)
        elif mode == 'sq':
            if c == '\\': i += 1
            elif c == "'": mode = None
        elif mode == 'dq':
            if c == '\\': i += 1
            elif c == '"': mode = None
        elif mode == 'tpl':
            if c == '\\': i += 1
            elif c == '`': mode = None
        elif mode == 'line':
            if c == '\n': mode = None
        elif mode == 'block':
            if c == '*' and i + 1 < n and js[i+1] == '/': mode = None; i += 1
        elif mode == 're':
            if c == '\\': i += 1
            elif c == '/': mode = None
        i += 1
    return pts


def chunk_js(js: str):
    pts, out, start = split_points(js), [], 0
    while start < len(js):
        if len(js[start:].encode()) <= LIMIT:
            out.append(js[start:]); break
        cut = None
        for p in pts:
            if p <= start: continue
            if len(js[start:p].encode()) > LIMIT: break
            cut = p
        if cut is None:
            sys.exit(f"no safe cut point after offset {start}")
        out.append(js[start:cut]); start = cut
    return out


def main():
    html = (ROOT / "manager-dashboard.html").read_text(encoding="utf-8")
    # the page has two <style> blocks: the shell reset in <head> and the real
    # stylesheet in the body content. Pick the real one by its @import.
    css  = next(b for b in re.findall(r'<style>(.*?)</style>', html, re.S) if '@import' in b)
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    data_js = next(s for s in scripts if s.strip().startswith('const DATA'))
    app_js  = next(s for s in scripts if not s.strip().startswith('const DATA'))
    body    = re.search(r'(<div id="root".*?<div id="tip"></div>)', html, re.S).group(1)
    title   = re.search(r'<title>(.*?)</title>', html, re.S).group(1)

    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*"): f.unlink()
    files = {"style.css": css}

    # dataset -> JSON string chunks, reassembled at load time
    raw = json.loads(data_js.strip().removeprefix("const DATA = ").removesuffix(";"))
    blob = json.dumps(raw, ensure_ascii=False, separators=(",", ":"))
    step = LIMIT // 2                      # escaping can inflate a chunk
    parts = [blob[i:i+step] for i in range(0, len(blob), step)]
    dnames = []
    for i, part in enumerate(parts):
        nm = f"d{i}.js"; dnames.append(nm)
        files[nm] = (f"window.__D={json.dumps(part, ensure_ascii=False)};" if i == 0
                     else f"window.__D+={json.dumps(part, ensure_ascii=False)};")
    files[f"d{len(parts)}.js"] = "const DATA=JSON.parse(window.__D);delete window.__D;"
    dnames.append(f"d{len(parts)}.js")

    anames = []
    for i, part in enumerate(chunk_js(app_js)):
        nm = f"a{i}.js"; anames.append(nm); files[nm] = part

    tags = "".join(f'<script src="{n}"></script>\n' for n in dnames + anames)
    files["index.html"] = (
        '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        f'<title>{title}</title>\n<link rel="stylesheet" href="style.css">\n'
        '<style>:root{color-scheme:light}*{box-sizing:border-box}'
        'body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:#f1ebdd}'
        'img{max-width:100%}[hidden]{display:none!important}</style>\n'
        f'</head>\n<body>\n{body}\n{tags}</body>\n</html>\n')

    manifest, over = [], []
    for path, content in files.items():
        (OUT / path).write_text(content, encoding="utf-8")
        data = content.encode()
        if len(data) >= 20_000: over.append((path, len(data)))
        manifest.append({"path": path, "sha256": hashlib.sha256(data).hexdigest(),
                         "bytes": len(data), "content": content, "encoding": "utf8"})

    # every JS chunk must parse standalone
    bad = [m["path"] for m in manifest if m["path"].endswith(".js")
           and subprocess.run(["node", "--check", str(OUT / m["path"])],
                              capture_output=True).returncode != 0]
    (ROOT / "press_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    print(f"files: {len(manifest)}   total: {sum(m['bytes'] for m in manifest)//1024} KB")
    print("over 20KB :", over or "none")
    print("parse fail:", bad or "none")
    print("largest   :", sorted(((m['bytes'], m['path']) for m in manifest), reverse=True)[:3])


if __name__ == "__main__":
    main()
