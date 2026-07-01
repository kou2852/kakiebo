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
