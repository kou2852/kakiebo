// 問い合わせ。Web 版 components/Support/InquiryPage.jsx の移植。
//
// メールアドレスは扱わない。ログイン済みのアカウントに紐づくスレッドとしてやり取りする。
// 家計データそのものは送らないので、本文に金額や口座名を書くかは利用者の判断に委ねる。
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useAuth } from '../src/store/AuthProvider';
import { useTheme } from '../src/theme';
import { Button, Card, Empty, Field, Input, Screen } from '../src/components/ui';
import * as api from '../src/api/client';

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Inquiry() {
  const t = useTheme();
  const auth = useAuth();

  // 未ログインなら通信しないので、最初から空として扱う（読み込み中を出さない）
  const [items, setItems] = useState(() => (auth.signedIn ? null : []));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api.inquiries.list()).items || []); }
    catch { setItems([]); }
  }, []);

  useEffect(() => {
    if (!auth.signedIn) return;
    let cancelled = false;
    api.inquiries.list()
      .then((r) => { if (!cancelled) setItems(r.items || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [auth.signedIn]);

  const send = async () => {
    if (!body.trim()) return Alert.alert('内容を入力してください');
    setBusy(true);
    try {
      await api.inquiries.send({ subject: subject.trim(), body: body.trim() });
      setSubject(''); setBody('');
      await load();
      Alert.alert('送信しました', '返信はこの画面に届きます。');
    } catch (e) {
      Alert.alert('送信できません', e?.message || String(e));
    } finally { setBusy(false); }
  };

  const sendReply = async (id) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.inquiries.send({ id, body: reply.trim() });
      setReply(''); setReplyTo(null);
      await load();
    } catch (e) {
      Alert.alert('送信できません', e?.message || String(e));
    } finally { setBusy(false); }
  };

  if (!auth.signedIn) {
    return (
      <Screen>
        <Card title="ログインが必要です">
          <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 20 }}>
            問い合わせはアカウントに紐づくスレッドとしてやり取りします。設定からログインしてください。
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card title="新しい問い合わせ">
        <Field label="件名（任意）">
          <Input value={subject} onChangeText={setSubject} placeholder="例: 仕訳が保存できない" />
        </Field>
        <Field label="内容">
          <Input value={body} onChangeText={setBody} multiline placeholder="できるだけ具体的にお書きください"
            style={{ height: 110, textAlignVertical: 'top' }} />
        </Field>
        <Button label={busy ? '送信中…' : '送信'} onPress={send} disabled={busy || !body.trim()} />
        <Text style={{ color: t.tx3, fontSize: 12, lineHeight: 18 }}>
          メールアドレスは不要です。返信はこの画面に届きます。
          家計の中身は運営からは見えないので、必要な情報は本文に書いてください。
        </Text>
      </Card>

      {items === null ? (
        <Card><ActivityIndicator color={t.ac} /></Card>
      ) : items.length === 0 ? (
        <Empty text="やり取りはまだありません" />
      ) : items.map((it) => (
        <Card key={it.id} title={it.subject || '(件名なし)'}>
          <Text style={{ color: t.tx3, fontSize: 12 }}>{fmt(it.createdAt)}</Text>

          {(it.messages || []).map((m, i) => (
            <View key={i} style={{
              backgroundColor: m.from === 'staff' ? t.acb : t.bg3,
              borderWidth: 1, borderColor: m.from === 'staff' ? t.ac : t.bd,
              borderRadius: 9, padding: 10, gap: 3,
            }}>
              <Text style={{ color: m.from === 'staff' ? t.ac : t.tx3, fontSize: 12, fontWeight: '700' }}>
                {m.from === 'staff' ? '運営' : 'あなた'}  {fmt(m.createdAt)}
              </Text>
              <Text style={{ color: t.tx, fontSize: 14, lineHeight: 19 }}>{m.body}</Text>
            </View>
          ))}

          {replyTo === it.id ? (
            <>
              <Input value={reply} onChangeText={setReply} multiline placeholder="返信を入力"
                style={{ height: 80, textAlignVertical: 'top' }} />
              <Button label={busy ? '送信中…' : '返信を送る'} onPress={() => sendReply(it.id)} disabled={busy || !reply.trim()} />
              <Button label="やめる" variant="ghost" onPress={() => { setReplyTo(null); setReply(''); }} />
            </>
          ) : (
            <Button label="返信する" variant="ghost" onPress={() => setReplyTo(it.id)} />
          )}
        </Card>
      ))}
    </Screen>
  );
}
