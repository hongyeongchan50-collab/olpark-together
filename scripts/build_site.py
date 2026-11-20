#!/usr/bin/env python3
"""Only static client assets are published; no source config or tests become public Pages artifacts."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
if DEST.exists():
    shutil.rmtree(DEST)
DEST.mkdir()
for source in ['index.html', 'assets/style.css', 'assets/app.js', 'data/snapshot.js']:
    target = DEST / source
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT/source, target)
(DEST/'.nojekyll').touch()
print('static site: ', len(list(DEST.rglob('*'))), 'entries')
