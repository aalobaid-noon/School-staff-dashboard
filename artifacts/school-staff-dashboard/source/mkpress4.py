#!/usr/bin/env python3
"""Regenerate press4/ (the 4-file Press bundle) from manager-dashboard.html."""
import hashlib, json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent; OUT = ROOT/'press4'
html = (ROOT/'manager-dashboard.html').read_text(encoding='utf-8')
css   = next(b for b in re.findall(r'<style>(.*?)</style>', html, re.S) if '@import' in b)
scr   = re.findall(r'<script>(.*?)</script>', html, re.S)
data  = next(s for s in scr if s.strip().startswith('const DATA'))
app   = next(s for s in scr if not s.strip().startswith('const DATA'))
body  = re.search(r'(<div id="root".*?<div id="tip"></div>)', html, re.S).group(1)
title = re.search(r'<title>(.*?)</title>', html, re.S).group(1)
OUT.mkdir(exist_ok=True)
for f in OUT.glob('*'): f.unlink()
assets = {'style.css': css, 'data.js': data.strip(), 'app.js': app.strip()}
# Press serves the same filenames on every deploy, so a browser will happily keep
# yesterday's data.js. Version each URL by its content hash: changed files bust the
# cache, unchanged ones stay cached.
ver = {k: hashlib.sha256(v.encode()).hexdigest()[:8] for k, v in assets.items()}
files = {**assets,
 'index.html': ('<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n'
   '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
   f'<title>{title}</title>\n<link rel="stylesheet" href="style.css?v={ver["style.css"]}">\n'
   '<style>:root{color-scheme:light}*{box-sizing:border-box}'
   'body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;background:#f1ebdd}'
   'img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
   f'{body}\n<script src="data.js?v={ver["data.js"]}"></script>\n'
   f'<script src="app.js?v={ver["app.js"]}"></script>\n</body>\n</html>\n')}
man=[]
for p,c in files.items():
    (OUT/p).write_text(c, encoding='utf-8'); b=c.encode()
    man.append({'path':p,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
print(json.dumps(man))
