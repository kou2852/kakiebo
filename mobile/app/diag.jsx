// 実機での動作確認。特に PBKDF2 600,000 回の所要時間は Hermes 上でしか分からず、
// ここが遅すぎる場合は暗号実装を純JSからネイティブ（development build 必須）へ切り替える判断材料になる。
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../src/theme';
import { Button, Card, Screen } from '../src/components/ui';
import { open, randomBytes, seal, unlock, PARAMS } from '../src/crypto';
import { kdfStatus, whenReady } from '../src/crypto/kdf.js';
import vector from '../src/crypto/webcrypto-vector.json';
import { BUILD_STAMP } from '../src/buildStamp';
import * as Updates from 'expo-updates';

export default function Diag() {
  const t = useTheme();
  const [current, setCurrent] = useState(null); // 実行中のステップ名
  const [results, setResults] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // 鍵導出は数秒かかる。止まって見えないよう経過秒を出す（KDF が定期的に制御を返すので更新される）。
  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [current]);

  const run = async () => {
    setResults([]);
    let dek = null;

    const step = async (name, fn) => {
      startedAt.current = Date.now();
      setElapsed(0);
      setCurrent(name);
      await new Promise((r) => setTimeout(r, 50)); // 先に画面を描かせる
      const t0 = Date.now();
      let row;
      try {
        row = { name, ok: true, detail: await fn(), ms: Date.now() - t0 };
      } catch (e) {
        row = { name, ok: false, detail: e?.message || String(e), ms: Date.now() - t0 };
      }
      setResults((r) => [...r, row]);
      return row;
    };

    await step('乱数', () => {
      const a = randomBytes(32);
      if (a.length !== 32 || a.every((x) => x === 0)) throw new Error('乱数が取得できない');
      return 'expo-crypto から32バイト取得';
    });

    await step('WebView 橋渡しの状態', async () => {
      let env;
      try {
        env = await whenReady();
      } catch (e) {
        // 沈黙した場合はどこで止まったかを出す（mounted すらなければ WebView 自体が無い）。
        const s = kdfStatus();
        throw new Error(`${e.message} / mounted:${s.mounted} loadStart:${s.loadStart} loadEnd:${s.loadEnd} boot:${s.boot} msg:${s.messages} err:${s.error} http:${s.httpError}`);
      }
      if (!env.subtle) throw new Error('crypto.subtle が無い (secure context: ' + env.secure + ')');
      return `crypto.subtle 利用可 / secure context: ${env.secure}`;
    });

    await step(`鍵導出 PBKDF2 ${PARAMS.PBKDF2_ITERATIONS.toLocaleString()}回`, async () => {
      dek = await unlock(vector.passphrase, vector.bundle);
      if (dek.length !== PARAMS.KEY_LEN) throw new Error(`鍵長が ${dek.length}`);
      return 'Web版で作った鍵バンドルを解錠できた';
    });

    await step('Web版の暗号文を復号', () => {
      const p = open(dek, vector.ct);
      if (JSON.stringify(p) !== JSON.stringify(vector.expectedPlaintext)) throw new Error('平文が一致しない');
      return `摘要「${p.journals[0].desc}」金額 ${p.journals[0].lines[0].amount}`;
    });

    await step('AES-GCM 暗号化/復号 (200往復)', () => {
      const t0 = Date.now();
      for (let i = 0; i < 200; i++) open(dek, seal(dek, { i }));
      return `1往復あたり ${((Date.now() - t0) / 200).toFixed(2)}ms`;
    });

    setCurrent(null);
  };

  const kdf = results.find((r) => r.name.startsWith('鍵導出'));

  // 「配信したのに反映されない」を推測で切り分けないための表示。
  // どのバンドルが動いているか、更新が落ちてきているかを端末側で確定させる。
  const [upd, setUpd] = useState(null);
  const checkUpdate = async () => {
    setUpd({ busy: true });
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) { setUpd({ found: false }); return; }
      await Updates.fetchUpdateAsync();
      setUpd({ found: true });
    } catch (e) {
      setUpd({ error: e?.message || String(e) });
    }
  };

  return (
    <Screen>
      <Card title="これは何">
        <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
          Web版（kurofukubo.com）で暗号化した実データを、このアプリが同じ鍵で復号できるかを実機で確認します。
          あわせて鍵導出の所要時間を測ります。数秒〜数十秒かかることがあります。
        </Text>
      </Card>

      <Button label={current ? '実行中…' : '診断を実行'} onPress={run} disabled={!!current} />

      {current ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={t.ac} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600' }}>{current}</Text>
              <Text style={{ color: t.ac, fontSize: 22, fontWeight: '800' }}>{(elapsed / 1000).toFixed(1)} 秒</Text>
            </View>
          </View>
          <Text style={{ color: t.tx3, fontSize: 13 }}>この数字が動いていれば処理は進んでいます</Text>
        </Card>
      ) : null}

      {results.map((r) => (
        <Card key={r.name}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600', flex: 1 }}>
              {r.ok ? '✅' : '❌'} {r.name}
            </Text>
            <Text style={{ color: t.tx3, fontSize: 14 }}>{(r.ms / 1000).toFixed(2)}s</Text>
          </View>
          <Text style={{ color: r.ok ? t.tx2 : t.red, fontSize: 14 }}>{r.detail}</Text>
        </Card>
      ))}

      {kdf?.ok ? (
        <Card title="判定">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            解錠にかかる時間は <Text style={{ color: t.tx, fontWeight: '700' }}>{(kdf.ms / 1000).toFixed(1)}秒</Text>。
            {kdf.ms < 2500
              ? ' 実用に足ります（純JSでは 138秒でした）。'
              : ' まだ待たされます。解錠した鍵を Keychain に保持し、Face ID で開く設計にします。'}
          </Text>
        </Card>
      ) : null}
      <Card title="更新の状態">
        <Row2 label="いまの JS" value={BUILD_STAMP} />
        <Row2 label="配信元" value={Updates.isEmbeddedLaunch ? 'アプリ内蔵（未更新）' : 'OTA 更新'} />
        <Row2 label="チャンネル" value={Updates.channel || '(なし)'} />
        <Row2 label="ランタイム" value={(Updates.runtimeVersion || '').slice(0, 12) || '(なし)'} />
        <Row2 label="更新ID" value={(Updates.updateId || '').slice(0, 8) || '(なし)'} />
        <Row2 label="作成日時" value={Updates.createdAt ? new Date(Updates.createdAt).toLocaleString('ja-JP') : '—'} />

        <Button label="いま更新を確認して取得" onPress={checkUpdate} disabled={upd?.busy} />
        {upd?.busy ? <Text style={{ color: t.tx2, fontSize: 14 }}>確認中…</Text> : null}
        {upd?.found === true ? (
          <>
            <Text style={{ color: t.grn, fontSize: 14 }}>新しい更新を取得しました。</Text>
            <Button label="いますぐ適用して再起動" onPress={() => Updates.reloadAsync()} />
          </>
        ) : null}
        {upd?.found === false ? (
          <Text style={{ color: t.tx2, fontSize: 14 }}>新しい更新はありません（すでに最新）。</Text>
        ) : null}
        {upd?.error ? <Text style={{ color: t.red, fontSize: 14 }}>{upd.error}</Text> : null}
      </Card>
    </Screen>
  );
}

function Row2({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ color: t.tx2, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' }}
        numberOfLines={1}>{value}</Text>
    </View>
  );
}
