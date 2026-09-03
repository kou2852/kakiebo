// 下に引っ張って同期する。
//
// 自動同期は入っているが、送れたのか確かめたい場面は残る（電波の悪い場所、
// 別の端末で入れた分を取りに行きたいとき）。そのための明示的な手段。
//
// 自動同期と違って失敗を黙らせない。ユーザーが自分で引いた以上、
// 何も起きなかったように見えるのが一番困る。
//
// ⚠ control はここで組み立てて渡す。ScrollView / FlatList の refreshControl は
// RefreshControl の要素そのものでなければならない。自作の部品で包むと、
// ScrollView が要素を clone して内部の props を渡す前提が崩れ、
// **中身ごと何も描画されなくなる**（実際にそうなり、原因の特定に手間取った）。
import { useCallback, useState } from 'react';
import { Alert, RefreshControl } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from './AuthProvider';
import { useData } from './DataProvider';

export function useSyncRefresh() {
  const t = useTheme();
  const { signedIn } = useAuth();
  const { sync } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!signedIn) {
      Alert.alert('同期先がありません',
        'アカウントに接続すると、帳簿がサーバーにも保存され、他の端末から見られるようになります。');
      return;
    }
    setRefreshing(true);
    try {
      await sync();
    } catch (e) {
      Alert.alert('同期できません', e?.message || String(e));
    } finally {
      setRefreshing(false);
    }
  }, [signedIn, sync]);

  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.ac}
      colors={[t.ac]}
      progressBackgroundColor={t.bg1}
    />
  );

  return { refreshing, onRefresh, control };
}
