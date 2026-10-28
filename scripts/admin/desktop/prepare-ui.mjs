// 画面（scripts/admin/ui）をアプリに写し、設定（config.js）を transport.js より先に読むようにする。
import { rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../ui/', import.meta.url), OUT = new URL('./ui/', import.meta.url);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of ['app.css', 'app.js', 'transport.js']) copyFileSync(new URL(f, SRC), new URL(f, OUT));
const html = readFileSync(new URL('index.html', SRC), 'utf8');
const tag = '<script src="/transport.js"></script>';
if (!html.includes(tag)) throw new Error('index.html に transport.js の読み込みが見つかりません');
writeFileSync(new URL('index.html', OUT), html.replace(tag, '<script src="/config.js"></script>\n' + tag));
console.log('ui を写しました');
