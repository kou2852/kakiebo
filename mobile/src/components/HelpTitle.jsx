// 画面名の右に「？」を置き、タップするとその画面の説明を出す。
// ヘッダーの headerTitle に渡す。説明（src/screenHelp.js）が無い画面は、画面名だけを出す。
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { SCREEN_HELP } from '../screenHelp';

export default function HelpTitle({ route, title }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const help = SCREEN_HELP[route];

  // ヘッダーの標準の見出しに合わせる（iOS 17・Android 20、太字）
  const text = (
    <Text numberOfLines={1} style={{ color: t.tx, fontWeight: '700', fontSize: Platform.OS === 'ios' ? 17 : 20, flexShrink: 1 }}>
      {title}
    </Text>
  );
  if (!help) return text;

  const close = () => setOpen(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
      {text}
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 10 }}
        accessibilityRole="button" accessibilityLabel={`${title}の使い方`} style={{ marginLeft: 6 }}>
        <Ionicons name="help-circle-outline" size={22} color={t.tx3} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          {/* 中を押しても閉じない */}
          <Pressable onPress={() => {}} style={{
            backgroundColor: t.bg1, borderRadius: 16, padding: 18, gap: 12, maxHeight: '80%', width: '100%', maxWidth: 520, alignSelf: 'center',
          }}>
            <Text style={{ color: t.tx3, fontSize: 12.5, fontWeight: '700' }}>この画面の使い方</Text>
            <Text style={{ color: t.tx, fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
              <Text style={{ color: t.tx, fontSize: 15, lineHeight: 23 }}>{help.lead}</Text>
              {help.items.map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ color: t.ac, fontSize: 15, lineHeight: 23 }}>・</Text>
                  <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 23, flex: 1 }}>{line}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={close} style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 6 }}>
              <Text style={{ color: t.ac, fontSize: 16, fontWeight: '700' }}>閉じる</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
