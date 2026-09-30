import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { MOBILE_UPDATES } from './src/config/updates.js';

// モバイルアプリの更新情報（ホーム右上のベル）が取りに来る JSON を書き出す。
// アプリ側は mobile/src/updates.js。家計データは含まない、全員に同じ静的ファイル。
const mobileUpdates = () => ({
  name: 'mobile-updates-json',
  generateBundle() {
    const items = MOBILE_UPDATES.slice(0, 10).map(({ id, date, title, items, link, minApp }) => (
      { id, date, title, items, ...(link ? { link: { href: link.href, label: link.label } } : {}), ...(minApp ? { minApp } : {}) }
    ));
    this.emitFile({ type: 'asset', fileName: 'updates.json', source: JSON.stringify({ v: 1, items }) });
  },
});

export default defineConfig({
  plugins: [react(), mobileUpdates()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
