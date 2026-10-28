// 管理ダッシュボードの iOS アプリ。画面は scripts/admin/ui を1枚にまとめたもの（ui-bundle.js）を WebView に出すだけ。
// 数字は Lambda から取り、ログインは Cognito（画面側の transport.js が行う）。ここが受け持つのは更新トークンの保存だけ。
import { useRef } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import html from './ui-bundle';

// Origin を固定する（API の CORS はこの Origin だけを許可している）
const BASE = 'https://admin.kurofukubo.invalid/';
const KEY_OK = /^[A-Za-z0-9._-]+$/; // SecureStore のキーに使える文字

// 画面の読み込み前に差し込む。保存の依頼を postMessage で外に出し、返事を待つ
const BRIDGE = `(function(){
  var n = 0, wait = {};
  function call(op, k, v){ return new Promise(function(res){ var id = ++n; wait[id] = res;
    window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, op: op, k: k, v: v })); }); }
  window.__kkReply = function(id, v){ var r = wait[id]; delete wait[id]; if(r) r(v); };
  window.kkStore = { get: function(k){ return call('get', k); }, set: function(k, v){ return call('set', k, v); }, del: function(k){ return call('del', k); } };
})(); true;`;

export default function App() {
  const ref = useRef(null);
  async function onMessage(e) {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!KEY_OK.test(String(m.k))) return;
    let v = null;
    try {
      if (m.op === 'get') v = await SecureStore.getItemAsync(m.k);
      else if (m.op === 'set') await SecureStore.setItemAsync(m.k, String(m.v), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      else if (m.op === 'del') await SecureStore.deleteItemAsync(m.k);
    } catch { v = null; }
    ref.current?.injectJavaScript(`window.__kkReply(${Number(m.id)}, ${JSON.stringify(v)}); true;`);
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
        <WebView
          ref={ref}
          source={{ html, baseUrl: BASE }}
          originWhitelist={[BASE + '*']}
          injectedJavaScriptBeforeContentLoaded={BRIDGE}
          onMessage={onMessage}
          // 画面の外へは移動しない。https のリンクだけ Safari で開く
          onShouldStartLoadWithRequest={(req) => {
            if (req.url.startsWith(BASE) || req.url === 'about:blank') return true;
            if (req.url.startsWith('https://')) Linking.openURL(req.url);
            return false;
          }}
          javaScriptCanOpenWindowsAutomatically={false}
          allowsBackForwardNavigationGestures={false}
          incognito={false}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
