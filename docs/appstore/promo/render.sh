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
  rm -f out/$dev-0*.png
  for f in gen/$dev-0[3-9].html; do n=$(basename "$f" .html); shot "$n.html" $W $H "$n.png"; done
done
shot header.html 3840 1646 header.png
python - <<'PY'
import glob
from PIL import Image
for dev, (W, H) in {'iphone': (1320, 2868), 'ipad': (2064, 2752)}.items():
    im = Image.open(f'out/_{dev}-pair.png')
    im.crop((0, 0, W, H)).save(f'out/{dev}-01.png')
    im.crop((W, 0, W * 2, H)).save(f'out/{dev}-02.png')
    files = sorted(glob.glob(f'out/{dev}-0[1-9].png'))
    for f in files:
        assert Image.open(f).size == (W, H), f
    # ストアの並びを模した一覧（確認用。提出には使わない）
    th = 717; tw = round(W * th / H)
    imgs = [Image.open(f).convert('RGB').resize((tw, th)) for f in files]
    sheet = Image.new('RGB', (tw * len(imgs) + 24 * (len(imgs) - 1), th), 'white')
    for i, a in enumerate(imgs): sheet.paste(a, (i * (tw + 24), 0))
    try: sheet.save(f'out/sheet-{dev}.png')
    except OSError: print('  (一覧は画像ビューアで開いていて書けなかった)')
    print(f'ok: {dev} {len(files)}枚 ({W}x{H})')
# ヘッダは透過を持てない（ASC が受け付けない）ので RGB で保存し直す
hd = Image.open('out/header.png').convert('RGB')
assert hd.size == (3840, 1646), hd.size
hd.save('out/header.png')
print('ok: header (3840x1646)')
PY
rm -f out/_*-pair.png
