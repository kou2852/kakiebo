// 画面には出さない WebView。PBKDF2 を WebKit の Web Crypto に実行させるためだけに常駐する。
// アプリ起動中ずっとマウントしたままにする（解錠のたびに立ち上げると初期化待ちが乗るため）。
import { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { _attach, _detach, _mark, _receive } from './kdf.js';

// crypto.subtle は secure context にしか生えない。baseUrl に https を与えて
// この文書の origin を https にする（ネットワークアクセスは一切しない）。
const ORIGIN = 'https://kdf.local';

// ページの script が動かない場合と、postMessage 自体が届かない場合を切り分けるための一報。
const BOOT = "window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({boot:true})); true;";

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
var RN = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
var b64d = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
var b64e = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };

window.__derive = function (raw) {
  var m = JSON.parse(raw);
  var subtle = window.crypto && window.crypto.subtle;
  if (!subtle) { RN({ id: m.id, error: 'crypto.subtle が使えません (secure context ではない)' }); return; }
  subtle.importKey('raw', new TextEncoder().encode(m.passphrase), 'PBKDF2', false, ['deriveBits'])
    .then(function (k) {
      return subtle.deriveBits(
        { name: 'PBKDF2', salt: b64d(m.salt), iterations: m.iterations, hash: 'SHA-256' }, k, m.dkLen * 8);
    })
    .then(function (bits) { RN({ id: m.id, key: b64e(new Uint8Array(bits)) }); })
    .catch(function (e) { RN({ id: m.id, error: String((e && e.message) || e) }); });
};

RN({ ready: true, subtle: !!(window.crypto && window.crypto.subtle), secure: !!window.isSecureContext });
</script></body></html>`;

export default function KdfBridge() {
  const ref = useRef(null);
  _mark('mounted');

  return (
    // 0x0 だと WebView が描画されず script が走らないことがあるので、1x1 を画面外に置く。
    <View style={{ position: 'absolute', left: -10, top: -10, width: 1, height: 1 }} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html: HTML, baseUrl: ORIGIN }}
        // ここに合致しない遷移を react-native-webview は Safari に投げる。
        // '${ORIGIN}/*' と書くと末尾スラッシュ無しの初回ロードが外れ、アプリを開くたびに
        // Safari が開く（実際に踏んだ）。この文書は静的で外部を一切読まないので全許可でよい。
        originWhitelist={['*']}
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={BOOT}
        onLoadStart={() => _mark('loadStart')}
        onMessage={(e) => _receive(e.nativeEvent.data)}
        onLoadEnd={() => { _mark('loadEnd'); _attach((msg) => {
          ref.current?.injectJavaScript(`window.__derive(${JSON.stringify(msg)}); true;`);
        }); }}
        onError={(e) => { _mark('error', e.nativeEvent?.description || 'unknown'); _detach(); }}
        onHttpError={(e) => _mark('httpError', String(e.nativeEvent?.statusCode))}
      />
    </View>
  );
}
