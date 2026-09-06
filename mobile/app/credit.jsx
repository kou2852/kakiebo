// クレジットの単独ルート。ダッシュボードの警告やディープリンクから直接開く用。
// 中身はレポートの「カード」タブと同じものを共有している。
import { View } from 'react-native';
import { Screen } from '../src/components/ui';
import CreditBody from '../src/screens/CreditBody';
import { useTourTarget } from '../src/store/TourProvider';

export default function Credit() {
  const cycleRef = useTourTarget('credit-cycle');
  return (
    <Screen>
      <View ref={cycleRef} collapsable={false}>
        <CreditBody />
      </View>
    </Screen>
  );
}
