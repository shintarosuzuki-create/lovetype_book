#!/bin/sh
# イベント招待ページ（event.html）だけを Netlify 用のフォルダ dist-event/ にまとめる。
# event.html は index.html として置くので、公開URLはサイトのトップ（https://○○.netlify.app/）になる。
set -e
cd "$(dirname "$0")/.."
OUT=dist-event
rm -rf "$OUT"
mkdir -p "$OUT/assets/css" "$OUT/assets/js"
cp event.html "$OUT/index.html"
cp assets/css/event.css "$OUT/assets/css/"
cp assets/js/event.js "$OUT/assets/js/"
cp -r assets/event "$OUT/assets/"
printf '# 招待者限定ページのため、検索エンジンには載せない\nUser-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
echo "built: $OUT"
