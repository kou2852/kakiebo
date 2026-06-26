// Google Analytics 4 — LP (kurofukubo.com) のみ。
// アプリ(app.kurofukubo.com)には読み込まない＝製品内（家計データのある場所）はトラッカーゼロを維持。
// 測定IDはこの1ファイルだけに記載する。
// 自己除外：?selftest=1（or ?noga=1）を一度開くと localStorage に記録し、以降このブラウザではGAを読み込まない。
// 解除は ?selftest=0（or ?noga=0）。アプリ側の ?selftest=1（CloudFrontログ除外）と合言葉を統一。
(function () {
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.has('selftest') || qs.has('noga')) {
      var off = qs.get('selftest') === '0' || qs.get('noga') === '0';
      if (off) localStorage.removeItem('kk_noanalytics');
      else localStorage.setItem('kk_noanalytics', '1');
    }
    if (localStorage.getItem('kk_noanalytics') === '1') return; // 自分の利用は計測しない
  } catch (e) { /* localStorage不可環境はそのまま計測 */ }
  var ID = 'G-2SB3RMM7WM';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', ID);
})();
