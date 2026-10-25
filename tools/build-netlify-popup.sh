#!/bin/sh
# 一般向けLP（popup.html）だけを Netlify 用のフォルダ dist-popup/ にまとめる。
# popup.html は index.html として置くので、公開URLはサイトのトップ（https://○○.netlify.app/）になる。
set -e
cd "$(dirname "$0")/.."
OUT=dist-popup
rm -rf "$OUT"
mkdir -p "$OUT/assets/css" "$OUT/assets/js" "$OUT/assets/event"
cp popup.html "$OUT/index.html"
cp assets/css/popup.css "$OUT/assets/css/"
cp assets/js/popup.js "$OUT/assets/js/"
cp -r assets/popup "$OUT/assets/"
cp assets/event/poster.jpg assets/event/poster.webp "$OUT/assets/event/"
echo "built: $OUT"
