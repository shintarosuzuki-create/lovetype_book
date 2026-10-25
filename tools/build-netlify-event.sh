#!/bin/sh
# イベント招待ページ（event.html）だけを Netlify 用のフォルダ dist-event/ にまとめる。
# event.html は index.html として置くので、公開URLはサイトのトップ（https://○○.netlify.app/）になる。
set -e
cd "$(dirname "$0")/.."
OUT=dist-event
rm -rf "$OUT"
mkdir -p "$OUT/assets/css" "$OUT/assets/js" "$OUT/assets/event"
cp event.html "$OUT/index.html"
cp assets/css/event.css "$OUT/assets/css/"
cp assets/css/popup-embed.css "$OUT/assets/css/"
cp assets/js/event.js "$OUT/assets/js/"
cp assets/js/popup-embed.js "$OUT/assets/js/"
# event.html が実際に使う event アセットだけを配信する（ヒーロー画像とog:image）。
# cafe-pr.mp4 / cafe-pr-poster.* / special-guide.jpg はページから参照されないため含めない。
cp assets/event/poster.webp assets/event/poster.jpg "$OUT/assets/event/"
cp -r assets/popup "$OUT/assets/"
printf '# 招待者限定ページのため、検索エンジンには載せない\nUser-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
echo "built: $OUT"
