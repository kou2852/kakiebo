import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, fas, faBal } from '../../utils/format';
import { investmentSummary } from '../../utils/bookkeeping';
import InfoTip from '../Common/InfoTip';
import AccountModal from '../Accounts/AccountModal';

const MASK = '¥•••••';
const md = (s) => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// iDeCo・つみたてNISA 等の「元本からどれだけ増減したか」。
// 科目は分けず、仕訳から拠出と評価替えを振り分けて表示する。投資性の資産が無ければ何も出さない。
export default function InvestmentPanel({ masked = false }) {
  const { journals, accounts } = useData();
  const [editId, setEditId] = useState(null);

  const rows = useMemo(() => investmentSummary(journals, accounts), [journals, accounts]);
  const stale = rows.filter((r) => !r.lastValuation.startsWith(thisMonth()));
  if (!rows.length) return null;

  const total = rows.reduce((s, r) => ({
    principal: s.principal + r.principal, gain: s.gain + r.gain, value: s.value + r.value,
  }), { principal: 0, gain: 0, value: 0 });

  const m = (v) => (masked ? MASK : v);
  const gainStyle = (v) => ({ color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--grn)' : 'var(--tx3)', fontWeight: 700 });

  return (
    <div className="card mt-16">
      <div className="card-title">
        投資の元本と損益
        <InfoTip text="拠出した元本と、そこからの増減（評価損益）に分けて表示します。科目を分ける必要はありません。同じ仕訳に「評価損益」科目が入っていれば評価替え、なければ拠出として集計しています。" />
      </div>

      {stale.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--tx2)', margin: '0 0 12px', lineHeight: 1.8 }}>
          {stale.length}件の評価額が今月まだ更新されていません。運用報告書の評価額を「更新」から入れると、差額が評価損益として記帳されます。
        </p>
      )}

      <div className="tw">
        <table>
          <thead><tr>
            <th>科目</th>
            <th className="text-r">元本</th>
            <th className="text-r">評価損益</th>
            <th className="text-r">時価</th>
            <th>評価額の更新</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id}>
                <td style={{ fontWeight: 600 }}>{r.account.name}</td>
                <td className="text-r mono">{m(faBal(r.principal))}</td>
                <td className="text-r mono" style={gainStyle(r.gain)}>
                  {m(fas(r.gain))}
                  {!masked && r.principal > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 5, color: 'var(--tx3)' }}>
                      {r.rate >= 0 ? '+' : '−'}{Math.abs(r.rate * 100).toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="text-r mono" style={{ fontWeight: 700 }}>{m(faBal(r.value))}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--tx3)', marginRight: 8 }}>
                    {r.lastValuation ? `最終 ${md(r.lastValuation)}` : '未更新'}
                  </span>
                  <button className="btn btn-g btn-s" onClick={() => setEditId(r.account.id)}>更新</button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot><tr>
              <td style={{ fontWeight: 700 }}>合計</td>
              <td className="text-r mono">{m(faBal(total.principal))}</td>
              <td className="text-r mono" style={gainStyle(total.gain)}>{m(fas(total.gain))}</td>
              <td className="text-r mono" style={{ fontWeight: 700 }}>{m(faBal(total.value))}</td>
              <td />
            </tr></tfoot>
          )}
        </table>
      </div>

      <AccountModal open={editId !== null} onClose={() => setEditId(null)} editId={editId} />
    </div>
  );
}
