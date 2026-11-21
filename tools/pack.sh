#!/bin/sh
# Copy the game into public/ and pre-compress the big JSON files so they download fast.
# usage: sh tools/pack.sh /path/to/game/folder
set -e
SRC=${1:-../cs3d}
mkdir -p public
cp "$SRC"/index.html "$SRC"/*.json public/ 2>/dev/null || true
[ -f "$SRC/story2.js" ] && cp "$SRC/story2.js" public/
for f in public/*.json public/index.html; do gzip -9 -k -f "$f"; done
echo "packed $(ls public | wc -l) files into public/"
