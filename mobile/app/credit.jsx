// クレジットの単独ルート。ダッシュボードの警告やディープリンクから直接開く用。
// 中身はレポートの「カード」タブと同じものを共有している。
import { Screen } from '../src/components/ui';
import CreditBody from '../src/screens/CreditBody';

export default function Credit() {
  return <Screen><CreditBody /></Screen>;
}
