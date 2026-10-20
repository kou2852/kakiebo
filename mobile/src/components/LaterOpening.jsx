// まだ残高を入れていない科目に、あとから残高を入れる欄。勘定科目と口座・カードの画面で使う（2026-10-15）。
// 資産は「いまの残高」（帳簿の残高との差を記帳する）、負債は「次の引き落とし予定額・借りている額」。
// 仕訳の作り方は utils/openingBalance.js。
import { Text } from 'react-native';
import { useTheme } from '../theme';
import { Card, Field, Input } from './ui';

export default function LaterOpening({ type, value, onChange }) {
  const t = useTheme();
  return (
    <Card title={type === 'asset' ? 'いまの残高（任意）' : '次の引き落とし予定額・借りている額（任意）'}>
      <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
        {type === 'asset'
          ? 'まだ残高を入れていません。いまの残高を入れると、帳簿の残高がその額になるように記帳します。'
          : 'まだ残高を入れていません。カードは次の引き落とし予定額、ローンはいま借りている額を入れてください。'}
      </Text>
      <Field label="金額">
        <Input value={String(value || '')} keyboardType="number-pad" onChangeText={onChange} placeholder="例: 100000" />
      </Field>
    </Card>
  );
}
