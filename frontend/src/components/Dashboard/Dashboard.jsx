import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { fa, fas, faBal, PIE_COLORS } from '../../utils/format';
import { calcBalances, accountBalance, balancesAsOf, filterByPeriod, getPeriodRange, monthlyTrend, netWorthTrend } from '../../utils/bookkeeping';
import { pendingCounts, generateRecurring } from '../../utils/autoGen';
import { useToast } from '../Common/Toast';
import PeriodBar from './PeriodBar';
import PieChart from './PieChart';
import TrendChart from './TrendChart';
import NetWorthChart from './NetWorthChart';
import CCSettleModal from '../Credit/CCSettleModal';
import BudgetPanel from './BudgetPanel';
import InvestmentPanel from './InvestmentPanel';
import TagAllocationPanel from './TagAllocationPanel';
import Ad from '../Common/Ad';
import { RegisterCard } from '../Common/Guest';
import SetupChecklist from '../Onboarding/SetupChecklist';
import { AD_CONFIG } from '../../config/tiers';

// 期間開始日の前日。ここまでの残高と期間末の残高の差が「期間中の増減」になる
const prevDay = (d) => {
  const t = new Date(`${d}T00:00:00`);
  t.setDate(t.getDate() - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export default function Dashboard() {
  const { accounts, journals, wallets, budgets, recurring, addJournal, saveRecurring, loading } = useData();
  const { guestMode, tier } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [genBusy, setGenBusy] = useState(false);
  const [ccModalOpen, setCcModalOpen] = useState(false);
  // 金額の表示/非表示（プライバシー）。非表示時は半角「¥****」
  const [vis, setVis] = useState({ net: true, assets: true, liab: true, brk: true });
  const mask = (s, on) => (on ? s : '¥****');
  const allShown = vis.net && vis.assets && vis.liab && vis.brk;
  const toggleAll = () => setVis({ net: !allShown, assets: !allShown, liab: !allShown, brk: !allShown });

  const pending = useMemo(() => pendingCounts(recurring, accounts, journals), [recurring, accounts, journals]);
  const runGenerate = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const n = await generateRecurring({ recurring, journals, addJournal, saveRecurring }); // 定期は即記帳
      if (pending.ccTotal > 0) {
        if (n) toast(`定期取引 ${n}件を記帳しました`);
        setCcModalOpen(true); // クレカは確認モーダルで対象を選択
      } else {
        toast(n ? `定期取引 ${n}件を記帳しました` : '記帳対象はありません');
      }
    } catch { toast('記帳に失敗しました'); } finally { setGenBusy(false); }
  };

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  // 資産・負債・純資産はストック（一時点の残高）なので「期間末時点」で見る。
  // 全期間の残高を出したまま見出しだけ期間名にすると、「先月」を選んでも
  // 今日の純資産が「純資産 — 先月」として出てしまい、表示が嘘になる。
  const allBal = useMemo(() => balancesAsOf(journals, accounts, end), [journals, accounts, end]);
  // 期間が始まる前日時点の残高。期間中にいくら増減したかを出すために使う
  const beforeBal = useMemo(() => balancesAsOf(journals, accounts, prevDay(start)), [journals, accounts, start]);

  // 期間内残高 (収益・費用)
  const periodJournals = useMemo(() => filterByPeriod(journals, start, end), [journals, start, end]);
  const periodBal = useMemo(() => calcBalances(periodJournals, accounts), [periodJournals, accounts]);

  // KPI
  const totalAsset = useMemo(
    () => accounts.filter((a) => a.type === 'asset').reduce((s, a) => s + accountBalance(a.id, accounts, allBal), 0),
    [accounts, allBal]
  );
  const totalLiability = useMemo(
    () => accounts.filter((a) => a.type === 'liability').reduce((s, a) => s + accountBalance(a.id, accounts, allBal), 0),
    [accounts, allBal]
  );
  const netWorth = totalAsset - totalLiability;
  const totalIncome = useMemo(
    () => accounts.filter((a) => a.type === 'income').reduce((s, a) => s + accountBalance(a.id, accounts, periodBal), 0),
    [accounts, periodBal]
  );
  const totalExpense = useMemo(
    () => accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + accountBalance(a.id, accounts, periodBal), 0),
    [accounts, periodBal]
  );
  const netProfit = totalIncome - totalExpense;

  // 円グラフデータ
  const assetPieData = useMemo(
    () => accounts
      .filter((a) => a.type === 'asset')
      .map((a, i) => ({ label: a.name, value: Math.max(0, accountBalance(a.id, accounts, allBal)), color: PIE_COLORS[i % 14] }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value),
    [accounts, allBal]
  );
  const incomePieData = useMemo(
    () => accounts
      .filter((a) => a.type === 'income')
      .map((a, i) => ({ label: a.name, value: Math.max(0, accountBalance(a.id, accounts, periodBal)), color: PIE_COLORS[i % 14] }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value),
    [accounts, periodBal]
  );
  const expensePieData = useMemo(
    () => accounts
      .filter((a) => a.type === 'expense')
      .map((a, i) => ({ label: a.name, value: Math.max(0, accountBalance(a.id, accounts, periodBal)), color: PIE_COLORS[i % 14] }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value),
    [accounts, periodBal]
  );

  // 月次推移・純資産推移
  const trend = useMemo(() => monthlyTrend(journals, accounts), [journals, accounts]);
  const nwTrend = useMemo(() => netWorthTrend(journals, accounts), [journals, accounts]);
  // 期間中に純資産がいくら動いたか。期間末の残高 − 期間開始前日の残高。
  // 「前月末比」を出していたが、期間を先月にしても今月比のままでちぐはぐだった。
  const beforeNet = useMemo(() => (
    accounts.filter((a) => a.type === 'asset').reduce((s, a) => s + accountBalance(a.id, accounts, beforeBal), 0)
    - accounts.filter((a) => a.type === 'liability').reduce((s, a) => s + accountBalance(a.id, accounts, beforeBal), 0)
  ), [accounts, beforeBal]);
  const nwDelta = netWorth - beforeNet;
  const periodNote = period === 'all' ? '全期間'
    : period === 'year' ? `${start.slice(0, 4)}年`
    : period === 'custom' ? '指定期間'
    : `${start.slice(0, 4)}年${parseInt(start.slice(5, 7), 10)}月`;
  // ストックは「いつ時点か」を示す。過去の期間を選んだときに今日の数字だと誤解させない
  const today = new Date().toISOString().slice(0, 10);
  const asOfNote = (period === 'all' || end >= today) ? '現在'
    : `${parseInt(end.slice(5, 7), 10)}/${parseInt(end.slice(8, 10), 10)}時点`;

  if (loading) return <p className="nd">読み込み中...</p>;

  const glass = { background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 14, padding: '13px 16px', minWidth: 110, flex: '1 1 110px' };
  const glassLabel = { fontSize: 11.5, color: 'rgba(255,255,255,.82)' };
  const glassVal = { fontSize: 20, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' };
  const statCard = { background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 16, padding: '18px 22px', boxShadow: 'var(--csh)' };
  const donutHead = (name, n) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)' }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{n}科目</div>
    </div>
  );

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div className="pg-title">ダッシュボード</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="tg-all" onClick={toggleAll}>{allShown ? '全体非表示' : '全体表示'}</button>
          <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} inline />
        </div>
      </div>

      <SetupChecklist />

      {pending.total > 0 && (
        <div className="card" style={{ borderColor: 'var(--ac)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>未記帳の自動取引が {pending.total} 件あります</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
              定期取引 {pending.recurring} 件 ／ クレカ返済 {pending.ccDue} 件（引落日到来分）
            </div>
          </div>
          <button className="btn btn-p" disabled={genBusy} onClick={runGenerate}>{genBusy ? '記帳中…' : 'まとめて記帳'}</button>
        </div>
      )}

      {/* 純資産ヒーロー */}
      <div className="nw-hero" data-tour="networth">
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.78)', fontWeight: 600, letterSpacing: '.04em' }}>純資産 — {periodNote}</div>
            <button className="tg-hero" onClick={() => setVis((v) => ({ ...v, net: !v.net }))}>{vis.net ? '非表示' : '表示'}</button>
          </div>
          <div style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginTop: 8, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all' }}>{mask(faBal(netWorth), vis.net)}</div>
          <div style={{ fontSize: 12.5, color: '#c8f5e9', marginTop: 6, fontWeight: 700 }}>
            {period === 'all' ? '累計' : '期間中の増減'}　{mask(fas(nwDelta), vis.net)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '2 1 300px' }}>
          <div style={glass}><div style={glassLabel}>収入</div><div style={{ ...glassVal, color: '#fff' }}>{mask(fas(totalIncome), vis.net)}</div></div>
          <div style={glass}><div style={glassLabel}>支出</div><div style={{ ...glassVal, color: '#ffe1e6' }}>{mask(fa(totalExpense), vis.net)}</div></div>
          <div style={glass}><div style={glassLabel}>収支</div><div style={{ ...glassVal, color: '#fff' }}>{mask(fas(netProfit), vis.net)}</div></div>
        </div>
      </div>

      {/* 総資産 / 負債 */}
      <div className="g2 mt-16">
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--tx2)', fontWeight: 600 }}>総資産</div>
            <button className="tg-pill" onClick={() => setVis((v) => ({ ...v, assets: !v.assets }))}>{vis.assets ? '非表示' : '表示'}</button>
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: 'var(--tx)', marginTop: 7, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{mask(faBal(totalAsset), vis.assets)}</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{asOfNote}の資産合計</div>
        </div>
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--tx2)', fontWeight: 600 }}>負債</div>
            <button className="tg-pill" onClick={() => setVis((v) => ({ ...v, liab: !v.liab }))}>{vis.liab ? '非表示' : '表示'}</button>
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: 'var(--red)', marginTop: 7, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{mask(faBal(totalLiability), vis.liab)}</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{asOfNote}の借入金・カード</div>
        </div>
      </div>

      {guestMode && <RegisterCard />}
      {AD_CONFIG[tier]?.dashboard && <Ad />}

      {/* 内訳 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 -2px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)', letterSpacing: '.01em' }}>資産・収支の内訳</div>
        <button className="tg-pill" onClick={() => setVis((v) => ({ ...v, brk: !v.brk }))}>{vis.brk ? '非表示' : '表示'}</button>
      </div>
      <div className="g3 mt-10">
        <div className="card">{donutHead('資産構成', assetPieData.length)}<PieChart items={assetPieData} masked={!vis.brk} /></div>
        <div className="card">{donutHead('収入内訳', incomePieData.length)}<PieChart items={incomePieData} masked={!vis.brk} /></div>
        <div className="card">{donutHead('支出内訳', expensePieData.length)}<PieChart items={expensePieData} masked={!vis.brk} /></div>
      </div>

      {/* 資産のタグ別内訳（タグを使っている人だけに出る）。資産構成ドーナツの直下＝その口座の中身として読ませる */}
      <TagAllocationPanel masked={!vis.brk} />

      {/* 投資の元本と損益（投資性の資産がある人だけに出る） */}
      <InvestmentPanel masked={!vis.brk} />

      {/* 今月の予算 */}
      <BudgetPanel period={period} start={start} end={end} />

      {/* 純資産の推移 */}
      <div className="card mt-16" data-tour="nw-trend">
        <div className="card-title">純資産の推移（直近6ヶ月末）</div>
        <NetWorthChart data={nwTrend} />
      </div>

      {/* 月次推移 */}
      <div className="card mt-16">
        <div className="card-title">月次推移（直近6ヶ月）</div>
        <TrendChart data={trend} />
      </div>

      <CCSettleModal open={ccModalOpen} onClose={() => setCcModalOpen(false)} />
    </div>
  );
}
