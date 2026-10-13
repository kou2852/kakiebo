import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { MOBILE_UPDATES } from './src/config/updates.js';
import { APP_LATEST } from './src/config/release.js';

// モバイルアプリの更新情報（ホーム右上のベル）が取りに来る JSON を書き出す。
// アプリ側は mobile/src/updates.js。家計データは含まない、全員に同じ静的ファイル。
const mobileUpdates = () => ({
  name: 'mobile-updates-json',
  generateBundle() {
    // link.ios / link.android は OS ごとの行き先（アプリが自分の OS のほうを選ぶ）。platforms は出し先の OS。
    const items = MOBILE_UPDATES.slice(0, 10).map(({ id, date, title, items, link, minApp, platforms }) => (
      {
        id, date, title, items,
        ...(link ? { link: { href: link.href, ios: link.ios, android: link.android, label: link.label } } : {}),
        ...(minApp ? { minApp } : {}),
        ...(platforms ? { platforms } : {}),
      }
    ));
    this.emitFile({ type: 'asset', fileName: 'updates.json', source: JSON.stringify({ v: 1, items, latest: APP_LATEST }) });
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
