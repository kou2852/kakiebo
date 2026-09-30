#!/usr/bin/env bash
# build.mjs で gen/*.html を作り、iPhone と iPad の画像を out/ に書き出す。
# 1・2枚目は横長（2枚分）で描いて半分に切る。
set -euo pipefail
cd "$(dirname "$0")"
node build.mjs
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
HERE="$(pwd -W 2>/dev/null || pwd)"
mkdir -p out
shot() { # html 幅 高さ 出力
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$2,$3" --virtual-time-budget=8000 --screenshot="$HERE/out/$4" "file:///$HERE/gen/$1" >/dev/null 2>&1
}
for dev in iphone ipad; do
  if [ $dev = iphone ]; then W=1320; H=2868; else W=2064; H=2752; fi
  shot "$dev-01-02.html" $((W * 2)) $H "_$dev-pair.png"
  for n in 03 04 05 06; do shot "$dev-$n.html" $W $H "$dev-$n.png"; done
done
python - <<'PY'
from PIL import Image
for dev, (W, H) in {'iphone': (1320, 2868), 'ipad': (2064, 2752)}.items():
    im = Image.open(f'out/_{dev}-pair.png')
    im.crop((0, 0, W, H)).save(f'out/{dev}-01.png')
    im.crop((W, 0, W * 2, H)).save(f'out/{dev}-02.png')
    for i in range(1, 7):
        assert Image.open(f'out/{dev}-0{i}.png').size == (W, H), (dev, i)
    # ストアの並びを模した一覧（確認用。提出には使わない）
    th = 717; tw = round(W * th / H)
    imgs = [Image.open(f'out/{dev}-0{i}.png').convert('RGB').resize((tw, th)) for i in range(1, 7)]
    sheet = Image.new('RGB', (tw * 6 + 24 * 5, th), 'white')
    for i, a in enumerate(imgs): sheet.paste(a, (i * (tw + 24), 0))
    sheet.save(f'out/sheet-{dev}.png')
    print(f'ok: {dev}-01..06 ({W}x{H})')
PY
rm -f out/_*-pair.png
