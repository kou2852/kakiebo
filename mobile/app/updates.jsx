import { useEffect } from 'react';
import { Linking, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../src/theme';
import { Button, Card, Empty, Screen } from '../src/components/ui';
import { useUpdates } from '../src/updates';

// 更新情報の一覧。ホーム右上のベルから開く。直近5件を出す（Web 版と同じ）。
export default function Updates() {
  const t = useTheme();
  const { items, failed, markSeen } = useUpdates();

  // 記事が読み込めてから既読にする（読み込み前に開いて閉じた場合は未読のまま残す）
  useEffect(() => { if (items?.length) markSeen(); }, [items, markSeen]);

  if (!items) {
    return <Screen><Empty text={failed ? '読み込めませんでした。通信できるところで開き直してください' : '読み込み中…'} /></Screen>;
  }
  if (!items.length) return <Screen><Empty text="お知らせはまだありません" /></Screen>;

  const open = (url) => WebBrowser.openBrowserAsync(url, {
    toolbarColor: t.bg1, controlsColor: t.ac, presentationStyle: 'pageSheet',
  }).catch(() => Linking.openURL(url));

  return (
    <Screen>
      {items.slice(0, 5).map((u) => (
        <Card key={u.id}>
          <Text style={{ color: t.tx3, fontSize: 13 }}>{u.date}</Text>
          <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 8 }}>{u.title}</Text>
          <View style={{ gap: 8 }}>
            {u.items.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ color: t.tx3, fontSize: 14, lineHeight: 22 }}>・</Text>
                <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 22, flex: 1 }}>{it}</Text>
              </View>
            ))}
          </View>
          {u.link?.href ? (
            <View style={{ marginTop: 12 }}>
              <Button label={u.link.label || '詳しく見る'} variant="ghost" onPress={() => open(u.link.href)} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
