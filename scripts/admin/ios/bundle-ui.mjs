// 画面（scripts/admin/ui）を1枚の HTML にまとめ、ui-bundle.js（文字列を書き出すだけのモジュール）にする。
// WebView にはファイルを置けないので、CSS・JS を埋め込む。スクリプトは CSP のハッシュで許可し、それ以外は動かさない。
// 設定は config.json（{ apiBase, clientId, region }。デプロイの出力を入れる）。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ui = (f) => readFileSync(new URL('../ui/' + f, import.meta.url), 'utf8');
const cfg = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const cognito = cfg.cognitoUrl ? new URL(cfg.cognitoUrl).origin : `https://cognito-idp.${cfg.region}.amazonaws.com`;

// 保存は WebView の外（SecureStore）に任せる。window.kkStore は App.js が先に差し込む
const scripts = [
  `window.KK_ADMIN=Object.assign(${JSON.stringify(cfg)},{storage:window.kkStore});`,
  ui('transport.js'),
  ui('app.js'),
].map((s) => s.replace(/<\/script/gi, '<\\/script'));
const hash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'none'", `script-src ${scripts.map(hash).join(' ')}`, "style-src 'unsafe-inline'", "img-src data:",
  `connect-src ${new URL(cfg.apiBase).origin} ${cognito}`, "base-uri 'none'", "form-action 'none'",
].join('; ');

let html = ui('index.html')
  .replace('<link rel="stylesheet" href="/app.css">', () => `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<style>${ui('app.css')}</style>`)
  .replace(/<script src="\/transport\.js"><\/script>\s*<script src="\/app\.js"><\/script>/, () => scripts.map((s) => `<script>${s}</script>`).join('\n'));
if (html.includes('src="/') || html.includes('href="/')) throw new Error('埋め込めなかったファイルがあります');

writeFileSync(new URL('./ui-bundle.js', import.meta.url), `// bundle-ui.mjs が作る。手で直さない\nexport default ${JSON.stringify(html)};\n`);
console.log(`ui-bundle.js を作りました（${Math.round(html.length / 1024)}KB）`);
