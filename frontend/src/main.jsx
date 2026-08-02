import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { track, trackOnce, trackRetention } from './utils/track';

// 保存済みテーマを復元（既定はライト）
document.body.dataset.theme = localStorage.getItem('kk_theme') || 'light';

// 起動の計測。JSを実行しないボットには発火しないため、CloudFrontのHTMLヒット数より
// 実態に近い数字になる（ヒット数は6割がボット）。
track('app_open');        // 起動回数
trackOnce('app_first');   // このブラウザでの初回起動＝新規訪問者
trackRetention();         // 初回から1日/7日/30日後に戻ってきたか

// 開いたままのタブでデプロイが走ると、遅延読み込みのチャンクが取得できなくなる
// （ファイル名にハッシュが付くため、古い名前は新しいビルドに存在しない）。
// その場合だけ一度リロードして新しいビルドを読み直す。
// リロードしても直らないケース（純粋な通信断など）で無限ループにしないよう、
// 直近1分以内に同じ理由でリロードしていたら何もしない。
const RELOADED_KEY = 'kk_chunk_reloaded_at';
window.addEventListener('vite:preloadError', (e) => {
  const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
  if (Date.now() - last < 60_000) return; // 直前にリロード済み＝別要因なので握らない
  e.preventDefault(); // Vite 既定の未処理エラーを止め、リロードで復帰させる
  sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
