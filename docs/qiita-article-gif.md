---
title: "ffmpegが無くても大丈夫。Playwright + gifenc でアプリ操作GIFを自動生成する"
tags:
  - Playwright
  - Node.js
  - JavaScript
  - 個人開発
  - GIF
private: false
updated_at: ""
id: null
organization_url_name: null
slide: false
ignorePublish: false
---

## やりたかったこと

個人開発のWebアプリを、記事（Qiita / Zenn / note）やSNSで紹介するとき、**操作の様子を“動いて”見せたい**。スクショ3枚より、5秒のGIFが1本ある方が圧倒的に伝わります。

> なお、作っているのは家計簿アプリ **[kurofukubo](https://kurofukubo.com/?utm_source=qiita&utm_medium=article)** です（このGIFもその紹介用。詳しくは末尾に）。

ところが、いざやろうとすると地味に詰まります。

- 画面録画 → **webm** で出てくるが、**Zenn / note はwebmを直接埋め込めない**
- **X** はGIFを貼ると自動でループ動画化してくれる＝**GIFが3媒体で一番使い回せる**
- でも手元の環境に **ffmpeg が無い**（CIや最小環境だと特に）。`webm → gif` 変換ができない

結論：**Playwright でフレームを撮り、純JS（gifenc + pngjs）でGIFにエンコードする**と、ffmpeg無しで完結します。実際にやってみたら 14フレーム / 約430KB の操作GIFが数秒で作れました。本記事はその手順です。

## 全体像

1. **Playwright** でアプリをゲスト操作しながら、要所で `page.screenshot()` してPNGフレームを集める
2. **pngjs** でPNGを生RGBAにデコード
3. **gifenc** でRGBA→パレット量子化→アニメGIFにエンコード

```bash
npm i -D playwright gifenc pngjs
```

## コード

```js
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
// ⚠️ gifenc は CommonJS。名前付きimportは失敗するのでdefault経由で取り出す
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';

const BASE = 'http://localhost:4173/'; // 自分のアプリ（preview等）

const browser = await chromium.launch({ headless: true });
// 動画用途なので少し小さめのビューポート＝GIF容量が小さくなる
const ctx = await browser.newContext({ viewport: { width: 1040, height: 600 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

// ── フレーム収集 ──
const frames = [];
const snap = async (delay = 100) => {
  frames.push({ buf: await page.screenshot({ type: 'png' }), delay }); // delay=表示時間(ms)
};

// 例: 入力フォームに1行打ちながら数フレーム撮る
await snap(800);
const input = page.getByPlaceholder(/食費 1200/);
await input.click();
const text = '食費 1200 現金 / コンビニ';
for (let i = 0; i < text.length; i += 2) {
  await input.fill(text.slice(0, i + 2));
  await snap(95);              // タイピング風
}
await snap(1200);              // 入力完了を“見せる”ために長めに保持
await page.getByRole('button', { name: '記帳', exact: true }).click();
await snap(1000);

await browser.close();

// ── GIFエンコード ──
const enc = GIFEncoder();
for (const f of frames) {
  const { data, width, height } = PNG.sync.read(f.buf); // data = RGBA(Uint8)
  const palette = quantize(data, 128, { format: 'rgb565' }); // 色数を絞ると軽い
  const index = applyPalette(data, palette, 'rgb565');
  enc.writeFrame(index, width, height, { palette, delay: f.delay });
}
enc.finish();
writeFileSync('op.gif', enc.bytes());
```

ポイントは **`writeFrame` ごとに `delay`（ms）を変えられる**こと。タイピング中は短く、結果を見せたい瞬間は長く、と緩急をつけると“操作が分かるGIF”になります。

## 容量を小さく保つコツ

GIFは各フレームを基本フルで持つので、油断するとすぐ数MBになります。次の3つで効きました。

- **ビューポートを小さめに**（例 1040×600）。等倍 `deviceScaleFactor: 1`
- **色数を絞る**（`quantize(data, 128)` など。UIはフラットな色が多いのでパレットがよく効く）
- **フレーム数を抑える**（1〜2文字ずつ＋要所だけ保持。秒間大量に撮らない）

これで実画面のUIでも **14フレーム / 約430KB** に収まりました。

## ハマりどころ

- **`gifenc` は CommonJS**。`import { GIFEncoder } from 'gifenc'` は `SyntaxError: Named export 'GIFEncoder' not found` になります。`import gifenc from 'gifenc'; const { ... } = gifenc;` でOK。
- **ゲスト帯やオンボーディングが写り込む** → 撮影前に `page.evaluate()` でテキスト一致の要素を `display:none` に。
- **`page.screenshot` は並行不可**。タイピング中に別ループで撮る、はできないので「少し操作→撮る」を交互に。

## 媒体別の貼り方

| 媒体 | GIFの扱い |
|---|---|
| Qiita / Zenn / note | 画像としてそのまま貼れば**アニメ再生** |
| X | GIFを添付すると**自動でループ動画化** |

webmを各サービス用に変換する手間が消えて、1ファイルで回せます。

## おまけ：作ったもの kurofukubo（黒福簿）

このGIF生成は、自作の家計簿アプリ **kurofukubo** の紹介用に作りました（このGIFがまさにその出力です）。「一行入力すると裏で複式簿記の仕訳になる」操作を見せたかった、というのが発端です。

![一行入力→自動で複式仕訳→純資産に反映](https://kurofukubo.com/op.gif)

- 預金・証券・NISA/iDeCo・ローンまで含めた **純資産** を1画面で把握
- 「食費 1200 現金」と一行打つだけ → 裏で **複式簿記** の仕訳に自動変換
- **銀行連携なし**／**運営者にも中身が読めないE2E暗号化**に対応
- **完全無料・登録不要**（ゲストでそのまま試せる）

👉 登録なしで試す： https://app.kurofukubo.com/?guest&utm_source=qiita&utm_medium=article

（GIF生成スクリプトはそのまま流用できます。`delay` の緩急と色数・フレーム数だけ自分のアプリに合わせて調整してください）
