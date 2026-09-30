#!/usr/bin/env bash
# promo/*.html を画像にして out/ に書き出す。1・2枚目は横長で描いて半分に切る。
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
HERE="$(pwd -W 2>/dev/null || pwd)"
mkdir -p out
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$2,2868" --virtual-time-budget=8000 --screenshot="$HERE/out/$3" "file:///$HERE/$1" >/dev/null 2>&1; }
shot 01-02.html 2640 _pair.png
for n in 03 04 05 06; do shot "$n.html" 1320 "iphone-$n.png"; done
python - <<'PY'
from PIL import Image
im = Image.open('out/_pair.png')
im.crop((0, 0, 1320, 2868)).save('out/iphone-01.png')
im.crop((1320, 0, 2640, 2868)).save('out/iphone-02.png')
# ストアの並びを模した一覧（確認用。提出には使わない）
imgs = [Image.open(f'out/iphone-0{i}.png').convert('RGB').resize((330, 717)) for i in range(1, 7)]
sheet = Image.new('RGB', (330 * 6 + 24 * 5, 717), 'white')
for i, a in enumerate(imgs): sheet.paste(a, (i * 354, 0))
sheet.save('out/sheet.png')  # _sheet.png は画像ビューアで開いていると書けないことがあったため名前を変えた
for i in range(1, 7): assert Image.open(f'out/iphone-0{i}.png').size == (1320, 2868)
print('ok: iphone-01..06 (1320x2868)')
PY
rm -f out/_pair.png
