// Android版のテスター募集のポップアップ（LP トップ専用）。
// 一度閉じたら、同じブラウザでは7日間出さない（localStorage。読み書きは try/catch で守る）。
(function () {
  var KEY = 'kk_recruit_android_closed_at';
  var DAYS = 7;

  try {
    var last = Number(localStorage.getItem(KEY) || 0);
    if (last && Date.now() - last < DAYS * 24 * 60 * 60 * 1000) return;
  } catch (e) { /* 保存できない環境では毎回出す */ }

  var style = document.createElement('style');
  style.textContent = [
    '.rc-wrap{position:fixed;inset:0;background:rgba(20,32,31,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}',
    '.rc-box{background:#fff;color:#14201f;max-width:460px;width:100%;border-radius:12px;padding:24px 24px 20px;box-shadow:0 12px 40px rgba(0,0,0,.2);font-family:"Noto Sans JP",sans-serif;line-height:1.8;max-height:90vh;overflow:auto}',
    '.rc-box h2{font-size:18px;margin:0 0 10px;color:#0d9488}',
    '.rc-box p,.rc-box li{font-size:14px;color:#3c4a49;margin:0 0 8px}',
    '.rc-box ul{margin:0 0 12px 1.2em;padding:0}',
    '.rc-note{font-size:12px;color:#5d6b6a}',
    '.rc-btns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}',
    '.rc-btn{flex:1;min-width:140px;text-align:center;padding:11px 12px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid #0d9488;color:#0d9488;background:#fff;cursor:pointer}',
    '.rc-btn.primary{background:#0d9488;color:#fff}',
    '.rc-close{position:absolute;right:12px;top:8px;background:none;border:0;font-size:22px;color:#93a09e;cursor:pointer;line-height:1}',
    '.rc-box{position:relative}'
  ].join('');
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'rc-wrap';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'rc-title');
  wrap.innerHTML = [
    '<div class="rc-box">',
    '  <button class="rc-close" type="button" aria-label="閉じる">×</button>',
    '  <h2 id="rc-title">Android版のテスターを募集しています</h2>',
    '  <p>kurofukubo（複式簿記の家計簿）のAndroid版を、毎日使ってくださるテスターを探しています。iOS版と同じ機能を、Google Play の「クローズドテスト」で先行してご使用いただけます。</p>',
    '  <ul>',
    '    <li>必要なもの: Google アカウント（Gmail）と Android 端末</li>',
    '    <li>参加後は14日間、毎日の家計管理にアプリを使っていただきます（毎日記帳いただかずに、使うだけで問題ございません）</li>',
    '    <li>不具合や使いにくい点を教えていただくと、正式版の改善に使わせていただきます</li>',
    '  </ul>',
    '  <p class="rc-note">テスター開始は、アプリの審査通過後に順次ご案内します。テスト版のため、動作が不安定な場合があります。募集は10月9日（金）までです。</p>',
    '  <p class="rc-note"><strong>申込方法</strong>: お問い合わせフォーム、または machinakalog@gmail.com へメール、または X の DM（@pakupaku_x_x_x 宛て）</p>',
    '  <div class="rc-btns">',
    '    <a class="rc-btn primary" href="/contact.html?topic=android-tester">フォームで申し込む</a>',
    '    <a class="rc-btn" href="mailto:machinakalog@gmail.com?subject=' + encodeURIComponent('Android版テスター申込') + '">メールで申し込む</a>',
    '  </div>',
    '</div>'
  ].join('');
  document.body.appendChild(wrap);

  function close() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* noop */ }
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  wrap.querySelector('.rc-close').addEventListener('click', close);
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  wrap.querySelectorAll('a.rc-btn').forEach(function (a) { a.addEventListener('click', close); });
  document.addEventListener('keydown', onKey);
}());
