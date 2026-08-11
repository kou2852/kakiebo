import { useState, useMemo, Fragment } from 'react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { fa, PIE_COLORS } from '../../utils/format';
import { calcBalances, accountBalance, getPeriodRange } from '../../utils/bookkeeping';
import { isCreditCard, creditCardCycles, creditUsageByCategory, todayYmd } from '../../utils/creditCard';
import { pendingCC } from '../../utils/autoGen';
import PieChart from '../Dashboard/PieChart';
import PeriodBar from '../Dashboard/PeriodBar';
import CycleBars from './CycleBars';
import InfoTip from '../Common/InfoTip';
import EmptyState from '../Common/EmptyState';
import CCSettleModal from './CCSettleModal';

const STATUS = {
  open: { label: '利用中（締め前）', color: 'var(--tx3)' },
  settled: { label: '引落済 ✓', color: 'var(--grn)' },
  unsettled: { label: '未引落', color: 'var(--red)' },
  none: { label: '—', color: 'var(--tx3)' },
};
const md = (s) => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };

export default function CreditPage() {
  const { accounts, journals, loading } = useData();
  const { navigate } = useUI();
  const [expanded, setExpanded] = useState({});
  const [period, setPeriod] = useState('year');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [settleCardId, setSettleCardId] = useState(null);

  const cards = useMemo(() => accounts.filter(isCreditCard), [accounts]);
  const pending = useMemo(() => pendingCC(accounts, journals), [accounts, journals]);
  const allBal = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';
  const today = todayYmd();
  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);
  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const ccStat = { background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 12, padding: '14px 16px' };
  const ccStatL = { fontSize: 11, color: 'var(--tx2)', fontWeight: 600 };
  const ccStatV = { fontSize: 19, fontWeight: 800, color: 'var(--tx)', marginTop: 6, fontVariantNumeric: 'tabular-nums' };

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      {/* 期間切り替えはヘッダー内に入れて一緒に画面上部へ貼り付ける。
          カード未登録のときは期間を変える意味がないので出さない（ヘッダーも固定されない）。 */}
      <div className="pg-header">
        <div className="pg-title">
          クレジット
          <InfoTip text="カード利用は発生月に費用計上され、引き落としは締め日後の引落日に口座から出ます。この画面では締め期間（利用）ごとに、引落予定日・金額・引落済みかどうかを1画面でまとめて確認できます。" />
        </div>
        <div className="pg-sub">利用と次回の引き落としをまとめて管理します</div>
        {cards.length > 0 && (
          <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} inline />
        )}
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="💳"
            title="クレジットカードが未設定です"
            desc="「勘定科目・口座」の負債タブでカードを作成し、引き落とし設定（締め日・引落日・引落口座）を入力すると、利用と引落のサイクルがここにまとまります。"
            action={<button className="btn btn-p" onClick={() => navigate('accounts')}>勘定科目・口座へ</button>}
          />
        </div>
      ) : (
        <>
        {cards.map((c) => {
          const allCycles = creditCardCycles(c, journals, accounts);
          const cycles = allCycles.filter((cy) => cy.settleDate >= start && cy.settleDate <= end);
          const outstanding = Math.max(0, accountBalance(c.id, accounts, allBal));
          const upcoming = allCycles
            .filter((cy) => cy.status === 'unsettled' && cy.settleDate >= today)
            .sort((a, b) => a.settleDate.localeCompare(b.settleDate))[0];
          const rangeStart = cycles.length ? cycles[cycles.length - 1].periodStart : start;
          const rangeEnd = cycles.length ? cycles[0].periodEnd : end;
          const catItems = creditUsageByCategory(c, journals, accounts, rangeStart, rangeEnd)
            .map((x, i) => ({ label: x.name, value: x.value, color: PIE_COLORS[i % 14] }));

          return (
            <div key={c.id} className="card" style={{ marginBottom: 20 }}>
              <div className="cc-top" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
                {/* カードビジュアル */}
                <div style={{ background: 'linear-gradient(135deg,#1f2a44 0%,#2b3a5e 100%)', borderRadius: 16, padding: '20px 22px', color: '#fff', boxShadow: '0 16px 34px -20px rgba(20,30,60,.7)' }}>
                  <div>
                    <div title={c.name} style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>締{c.ccClose} → {(c.ccDelay || 1) > 1 ? '翌々月' : '翌月'}{c.ccDay}日引落</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)' }}>未払残高</div>
                      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fa(outstanding)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)' }}>引落口座</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>{acctName(c.ccFrom)}</div>
                    </div>
                  </div>
                </div>
                {/* 集計カード */}
                <div className="cc-stats">
                  <div style={ccStat}><div style={ccStatL}>今サイクル利用</div><div style={ccStatV}>{fa(allCycles.find((cy) => cy.status === 'open')?.usage || 0)}</div></div>
                  <div style={ccStat}><div style={ccStatL}>未払残高</div><div style={ccStatV}>{fa(outstanding)}</div></div>
                  <div style={ccStat}><div style={ccStatL}>次回引落（{upcoming ? md(upcoming.settleDate) : '—'}）</div><div style={{ ...ccStatV, color: upcoming ? 'var(--red)' : 'var(--tx)' }}>{upcoming ? fa(upcoming.usage) : '—'}</div></div>
                </div>
              </div>

              {(() => {
                const cardPending = pending.filter((x) => x.card.id === c.id);
                const dueCount = cardPending.filter((x) => x.due).length;
                return (
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className={`btn btn-s ${cardPending.length ? 'btn-p' : 'btn-g'}`}
                      disabled={!cardPending.length}
                      title={cardPending.length ? undefined : '記帳対象の締め済みサイクルはありません'}
                      onClick={() => setSettleCardId(c.id)}>
                      {cardPending.length
                        ? `このカードの返済を記帳${dueCount ? `（引落日到来 ${dueCount}件）` : `（予定 ${cardPending.length}件）`}`
                        : 'このカードの返済を記帳（対象なし）'}
                    </button>
                  </div>
                );
              })()}

              <div style={{ marginTop: 14, paddingTop: 16, borderTop: '1px solid var(--bd)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  <div>
                    <div className="card-title">サイクル別 利用額（締め月）</div>
                    <CycleBars cycles={cycles} />
                  </div>
                  <div>
                    <div className="card-title">科目別 利用内訳（{cycles.length}サイクル）</div>
                    <PieChart items={catItems} />
                  </div>
                </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bd)' }}>
                {cycles.length === 0 ? (
                  <p className="nd" style={{ textAlign: 'center', padding: '20px 0' }}>
                    この期間に引き落とされるサイクルはありません。期間を変更してください。
                  </p>
                ) : (
                <div className="tw">
                  <table>
                    <thead><tr>
                      <th style={{ width: 24 }} />
                      <th>利用期間</th>
                      <th className="text-r">件数</th>
                      <th className="text-r">利用額</th>
                      <th>引落予定日</th>
                      <th>状態</th>
                    </tr></thead>
                    <tbody>
                      {cycles.map((cy) => {
                        const key = `${c.id}:${cy.periodEnd}`;
                        const st = STATUS[cy.status];
                        const overdue = cy.status === 'unsettled' && cy.settleDate < today;
                        const isOpen = expanded[key];
                        return (
                          <Fragment key={key}>
                            <tr onClick={() => cy.items.length && toggle(key)} style={{ cursor: cy.items.length ? 'pointer' : 'default' }}>
                              <td style={{ textAlign: 'center', color: 'var(--tx3)' }}>{cy.items.length ? (isOpen ? '▾' : '▸') : ''}</td>
                              <td>{md(cy.periodStart)}〜{md(cy.periodEnd)}</td>
                              <td className="text-r mono">{cy.items.length}</td>
                              <td className="text-r mono">{fa(cy.usage)}</td>
                              <td className="text-m" style={{ whiteSpace: 'nowrap' }}>{cy.settleDate}</td>
                              <td style={{ color: st.color, fontSize: 12, whiteSpace: 'nowrap' }}>
                                {st.label}{overdue ? '（要記帳）' : ''}
                              </td>
                            </tr>
                            {isOpen && cy.items.length > 0 && (
                              <tr>
                                <td />
                                <td colSpan={5} style={{ background: 'var(--bg0)', padding: '4px 8px' }}>
                                  <table style={{ width: '100%' }}>
                                    <tbody>
                                      {cy.items.map((it, i) => (
                                        <tr key={i}>
                                          <td className="mono text-m" style={{ whiteSpace: 'nowrap', width: 110 }}>{it.date}</td>
                                          <td className="text-m">{it.desc || '（摘要なし）'}</td>
                                          <td className="text-r mono" style={{ width: 120 }}>{fa(it.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
                <p style={{ fontSize: 11, color: 'var(--tx3)', margin: '8px 4px 0' }}>
                  ※ 行をタップすると、その締め期間の利用明細を表示します。引落仕訳は上の「このカードの返済を記帳」、または「勘定科目・口座」画面からまとめて記帳できます。
                </p>
              </div>
            </div>
          );
        })}
        </>
      )}
      <CCSettleModal open={!!settleCardId} onClose={() => setSettleCardId(null)} cardId={settleCardId} />
    </div>
  );
}
