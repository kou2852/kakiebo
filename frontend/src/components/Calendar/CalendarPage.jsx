import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, ymd } from '../../utils/format';
import JournalModal from '../Journal/JournalModal';
import { useToast } from '../Common/Toast';

export default function CalendarPage() {
  const { journals, accounts, deleteJournal, loading } = useData();
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selDay, setSelDay] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newDate, setNewDate] = useState(null);

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';

  const handleDelete = async (id) => {
    if (!confirm('削除しますか？')) return;
    try { await deleteJournal(id); toast('削除しました'); }
    catch { toast('削除に失敗しました'); }
  };

  const nav = (d) => {
    let m = month + d;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
    setSelDay(null);
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelDay(t.getDate());
  };

  const dayData = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const data = {};
    journals.forEach((j) => {
      if (!j.date.startsWith(prefix)) return;
      const day = parseInt(j.date.slice(8, 10));
      if (!data[day]) data[day] = { inc: 0, exp: 0, cnt: 0 };
      j.lines.forEach((l) => {
        const a = accounts.find((x) => x.id === l.accountId);
        if (!a) return;
        if (a.type === 'income') data[day].inc += l.amount;
        if (a.type === 'expense') data[day].exp += l.amount;
      });
      data[day].cnt++;
    });
    return data;
  }, [journals, accounts, year, month]);

  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dow = first.getDay();
  const todayStr = ymd(today);

  // 選択した日の仕訳
  const dayJournals = useMemo(() => {
    if (!selDay) return [];
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(selDay).padStart(2, '0')}`;
    return journals.filter((j) => j.date === ds);
  }, [journals, year, month, selDay]);

  if (loading) return <p className="nd">読み込み中...</p>;

  const headers = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div>
      <div className="pg-header"><div className="pg-title">カレンダー</div><div className="pg-sub">日次の収入・支出を一覧します</div></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-g btn-s" onClick={() => nav(-1)}>◀ 前月</button>
        <span style={{ fontSize: 16, fontWeight: 500, minWidth: 120, textAlign: 'center' }}>{year}年{month + 1}月</span>
        <button className="btn btn-g btn-s" onClick={() => nav(1)}>次月 ▶</button>
        <button className="btn btn-p btn-s" onClick={goToday}>今日</button>
      </div>

      <div className="card">
        <div className="cal-grid">
          {headers.map((h) => <div key={h} className="cal-hdr">{h}</div>)}
          {Array.from({ length: dow }, (_, i) => <div key={`e${i}`} className="cal-cell empty" />)}
          {Array.from({ length: lastDay }, (_, i) => {
            const d = i + 1;
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = ds === todayStr;
            const dayOfWeek = (dow + d - 1) % 7;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const dd = dayData[d];
            return (
              <div key={d}
                className={`cal-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${selDay === d ? 'selected' : ''}`}
                onClick={() => setSelDay(d)}
                style={selDay === d ? { border: '2px solid var(--ac)' } : undefined}
              >
                <div className="cal-day">{d}</div>
                {dd && dd.inc > 0 && <div className="cal-inc">+{fa(dd.inc)}</div>}
                {dd && dd.exp > 0 && <div className="cal-exp">-{fa(dd.exp)}</div>}
                {dd && dd.cnt > 0 && <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{dd.cnt}件</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selDay ? `${month + 1}/${selDay} の仕訳 (${dayJournals.length}件)` : '日付を選択'}</span>
          {selDay && (
            <button className="btn btn-p btn-s" onClick={() => {
              setEditId(null);
              setNewDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(selDay).padStart(2, '0')}`);
              setModalOpen(true);
            }}>＋ この日に記帳</button>
          )}
        </div>
        {selDay && dayJournals.length > 0 ? (
          <div className="tw">
            <table>
              <thead><tr><th>摘要</th><th>借方</th><th>貸方</th><th className="text-r">金額</th><th /></tr></thead>
              <tbody>
                {dayJournals.map((j) => {
                  const dr = j.lines.filter((l) => l.side === 'dr');
                  const cr = j.lines.filter((l) => l.side === 'cr');
                  return (
                    <tr key={j.id}>
                      <td>{j.desc || ''}</td>
                      <td>{dr.map((l) => acctName(l.accountId)).join('/')}</td>
                      <td>{cr.map((l) => acctName(l.accountId)).join('/')}</td>
                      <td className="text-r mono">{fa(dr.reduce((s, l) => s + l.amount, 0))}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={() => { setEditId(j.id); setModalOpen(true); }}>編集</button>
                        <button className="btn btn-d btn-s" onClick={() => handleDelete(j.id)}>削除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : selDay ? <p className="nd">仕訳なし</p> : null}
      </div>

      <JournalModal open={modalOpen} onClose={() => setModalOpen(false)} editId={editId} defaultDate={newDate} />
    </div>
  );
}
