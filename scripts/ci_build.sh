#!/usr/bin/env bash
set -euo pipefail

export FAQ_CSV_FILE="${FAQ_CSV_FILE:-data/source/faq.csv}"
python scripts/update_data.py
python -m unittest discover -s tests -v

git config user.name 'olpark-data-bot'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add data/snapshot.js
if ! git diff --cached --quiet; then
  git commit -m 'chore(data): verified public snapshot [skip ci]'
  git push origin HEAD:main
else
  echo 'No data changes'
fi

python scripts/build_site.py
