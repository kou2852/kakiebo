// 仕訳を削除する前の確認。標準の Alert にはチェックボックスを置けないので自前で出す。
import { useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

/** target が null のあいだは閉じている。onConfirm には「次回から確認しない」の値が渡る。 */
export default function DeleteConfirm({ target, onCancel, onConfirm }) {
  const t = useTheme();
  const [skip, setSkip] = useState(false);
  const close = () => { setSkip(false); onCancel(); };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 28 }}>
        {/* 中のタップが背景に抜けて閉じないよう、空の onPress で受ける */}
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg1, borderRadius: 16, padding: 18, gap: 14 }}>
          <Text style={{ color: t.tx, fontSize: 17, fontWeight: '700' }}>この仕訳を削除しますか？</Text>
          <Text style={{ color: t.tx2, fontSize: 15 }} numberOfLines={2}>
            {target ? `${target.date}  ${target.desc || '(摘要なし)'}` : ''}
          </Text>

          <TouchableOpacity onPress={() => setSkip(!skip)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 22, height: 22, borderRadius: 5, borderWidth: 1.5,
              borderColor: skip ? t.ac : t.bd2, backgroundColor: skip ? t.ac : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {skip ? <Text style={{ color: t.acTx, fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
            </View>
            <Text style={{ color: t.tx, fontSize: 15 }}>次回から確認しない</Text>
          </TouchableOpacity>
          {skip ? (
            <Text style={{ color: t.tx3, fontSize: 13, marginTop: -6 }}>
              設定の「仕訳の削除時に確認」からいつでも戻せます。
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={close}
              style={{ flex: 1, borderWidth: 1, borderColor: t.bd2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: t.tx2, fontSize: 16, fontWeight: '700' }}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { const s = skip; setSkip(false); onConfirm(s); }}
              style={{ flex: 1, backgroundColor: t.red, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>削除</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
