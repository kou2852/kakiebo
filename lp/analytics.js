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

// LP→アプリ(app.kurofukubo.com)のCTAクリックを計測する。
// GA4の拡張計測「外部リンクのクリック」は同一ルートドメイン宛には発火しないため、
// kurofukubo.com → app.kurofukubo.com の遷移は自動では一切記録されない。ここで自前で送る。
// ※ GA4管理画面で cta_app_start を「キーイベント」に指定して初めてCVとして数えられる。
// ※ cta_location / cta_text はカスタム定義に登録しないとレポートに出ない（link_urlは組込ディメンション）。
// ※ 送信はgtag.jsがページ離脱時に navigator.sendBeacon を使うため、遷移で欠落しない。
(function () {
  if (!window.gtag) return; // 自己除外(kk_noanalytics)でGAを読んでいない場合は何もしない
  // index.htmlのCTAは同じclass・同じURLで区別がつかないので、文書順の番号で位置を表す。
  // ただし番号は「その時点の文書順」なので、セクションを挿入すると意味がずれる。
  //   〜2026-09-08: 1=ナビ, 2=ヒーロー, 3=本文下, 4=追従バー
  //   2026-09-09〜: 1=ナビ, 2=ヒーロー, 3=iOSセクション, 4=本文下, 5=追従バー（iOS告知の追加でずれた）
  // この日付をまたいで cta_location を比較しないこと。区別が要るときは cta_text を使う。
  // ガイド記事は本文中CTAを utm_content の -mid で判別できる。
  function ctaList() {
    return [].filter.call(document.querySelectorAll('a[href]'), function (x) {
      return x.hostname === 'app.kurofukubo.com';
    });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var a = t && t.closest && t.closest('a[href]');
    if (!a) return;
    // App Store は別ドメイン。GA4の「外部リンクのクリック」には入るが、どのCTAから
    // 出たかが残らないので、cta_app_start と同じ粒度で自前で送る。
    // ※ cta_appstore も管理画面でキーイベントに指定して初めてCVとして数えられる。
    if (a.hostname === 'apps.apple.com') {
      var ios = [].filter.call(document.querySelectorAll('a[href]'), function (x) {
        return x.hostname === 'apps.apple.com';
      });
      window.gtag('event', 'cta_appstore', {
        link_url: a.href,
        cta_location: 'ios' + (ios.indexOf(a) + 1),
        // バッジは画像リンクで textContent が空になるため alt で補う
        cta_text: ((a.textContent || '').trim() || ((a.querySelector('img') || {}).alt || '')).replace(/\s+/g, ' ').slice(0, 60)
      });
      return;
    }
    if (a.hostname !== 'app.kurofukubo.com') return;
    window.gtag('event', 'cta_app_start', {
      link_url: a.href,
      cta_location: 'cta' + (ctaList().indexOf(a) + 1),
      cta_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    });
  });
})();
