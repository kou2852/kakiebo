// 軽量イベント計測ビーコン。アプリ自身のCloudFront上の番兵パス /_e/<event> をGETで叩くだけ。
// 集計は CloudFront アクセスログ（uri=/_e/...）を既存スクリプトで数える＝外部事業者には何も渡さず、自前リソース内で完結する。
// 送るのは「イベント名」のみ（時刻・IPはログ側で付与）。金額・科目名・摘要・残高など家計データは一切送らない。
// 自己除外: localStorage の kk_noanalytics='1' があれば送らない（解析側でも自宅IPは除外している）。
export function track(event) {
  try {
    if (localStorage.getItem('kk_noanalytics') === '1') return;
    // keepalive: 画面遷移・離脱中でも送信を完了させる。失敗は黙殺し、機能に影響させない。
    fetch('/_e/' + event, { method: 'GET', keepalive: true, cache: 'no-store' }).catch(() => {});
  } catch { /* localStorage 不可など計測不能環境は何もしない */ }
}

// このブラウザで一度だけ送る。回数ではなく「何人が到達したか」を数えるためのもの。
export function trackOnce(event) {
  try {
    const key = 'kk_ev_' + event;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    track(event);
  } catch { /* 同上 */ }
}

const FIRST_SEEN_KEY = 'kk_first_seen';

// 継続（リテンション）の計測。初回利用日をこの端末に持つだけで、サーバーへは
// 「初回から1日/7日/30日以上たって戻ってきた」という事実しか送らない。
// 個人を追跡できる識別子は一切送信しない。各段階は一度きり。
// 10日目に戻った人は d1 と d7 の両方を満たすため、段階が絞り込みになる（d1 ≥ d7 ≥ d30）。
export function trackRetention() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const first = localStorage.getItem(FIRST_SEEN_KEY);
    if (!first) { localStorage.setItem(FIRST_SEEN_KEY, today); return; }
    const days = Math.floor((Date.parse(today) - Date.parse(first)) / 86400000);
    if (days >= 1) trackOnce('retain_d1');
    if (days >= 7) trackOnce('retain_d7');
    if (days >= 30) trackOnce('retain_d30');
  } catch { /* 同上 */ }
}
