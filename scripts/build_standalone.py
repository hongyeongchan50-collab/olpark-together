#!/usr/bin/env python3
"""Offline, single-file demonstration. Inlining avoids file:// resource path restrictions."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="assets/style.css">','<style>\n'+(ROOT/'assets/style.css').read_text(encoding='utf-8')+'\n</style>')
for filename in ('data/snapshot.js','assets/app.js'):
    html=html.replace('<script defer src="'+filename+'"></script>','<script>\n'+(ROOT/filename).read_text(encoding='utf-8').replace('</script>','<\\/script>')+'\n</script>')
path=ROOT.parent/'올팍동행_v2_바로실행.html'
path.write_text(html,encoding='utf-8')
print(path, path.stat().st_size)
