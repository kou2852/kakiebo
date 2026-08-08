import { useState, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, faBal } from '../../utils/format';
import { tagAllocation } from '../../utils/bookkeeping';
import InfoTip from '../Common/InfoTip';

const MASK = '¥•••••';

// 口座ごとの「そのお金が何のためのものか」。タグを1つも使っていない人には出さない。
// バーの中には文字を書かず、ホバーでツールチップ。スマホにはホバーが無いので、
// ▶ で内訳を一覧にできるようにしてある（タッチ環境ではこちらが唯一の手段）。
export default function TagAllocationPanel({ masked = false }) {
  const { journals, accounts, tags, allocs, wallets } = useData();
  const [openIds, setOpenIds] = useState(() => new Set());
  const [tip, setTip] = useState(null); // { name, color, amount, sub, x, y }
  const tipRef = useRef(null);

  const rows = useMemo(
    () => tagAllocation(journals, accounts, tags, allocs, wallets),
    [journals, accounts, tags, allocs, wallets]
  );

  const total = rows.reduce((s, r) => s + r.bal, 0);

  // 凡例は実際に描いた区画から作る。未配分の呼び名と色は口座ごとに変えられる
  // （口座一覧の「デフォルトタグ」）ので、口座をまたいで異なる分だけ並べる。
  const used = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      r.items.forEach((i) => m.set(i.tagId, { name: i.name, color: i.color }));
      if (r.free > 0) m.set(`free:${r.defaultTag}:${r.defaultColor}`, { name: r.defaultTag, color: r.defaultColor });
    });
    return [...m.entries()].map(([key, v]) => ({ key, ...v }));
  }, [rows]);

  // タグを使っていない、または配分が1件も無いなら出す意味がない
  if (!tags.length || !used.length) return null;

  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const showTip = (e, seg) => {
    const el = tipRef.current;
    const w = el?.offsetWidth || 170;
    const h = el?.offsetHeight || 70;
    let x = e.clientX + 14;
    let y = e.clientY - h - 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 14;
    setTip({ ...seg, x, y });
  };

  const m = (v) => (masked ? MASK : v);

  return (
    <div className="card mt-16">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          資産の使いみち
          <InfoTip text="各口座の残高を、タグごとの内訳で表示します。カード払いのようにまだ口座から引き落とされていない分は、タグ・配分ページの「登録タグ」残高からは引かれますが、ここには反映されません（引落時に反映されます）。" />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
          資産合計
          <span className="mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)', marginLeft: 7 }}>{m(faBal(total))}</span>
        </div>
      </div>

      {/* 凡例はここに1回だけ。バーの中には書かない */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 15px', padding: '11px 0 8px', marginBottom: 4, borderBottom: '1px solid var(--bd)' }}>
        {used.map((t) => (
          <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flex: 'none' }} />{t.name}
          </span>
        ))}
      </div>

      {rows.map((r) => {
        const open = openIds.has(r.account.id);
        // 積み上げバーにマイナスは描けないので、正の配分と未配分だけで幅を出す
        const segs = [
          ...r.items.filter((i) => i.amount > 0).map((i) => ({ ...i, key: i.tagId })),
          // 未配分の呼び名と色は口座一覧の「デフォルトタグ」に従う（未設定なら (未配分)/#888）
          ...(r.free > 0 ? [{ key: '__free', name: r.defaultTag, color: r.defaultColor, amount: r.free }] : []),
        ];
        const segTotal = segs.reduce((s, x) => s + x.amount, 0);
        const negatives = r.items.filter((i) => i.amount < 0);
        const pct = (v) => (r.bal ? `${(v / r.bal * 100).toFixed(1)}%` : '—');

        return (
          <div key={r.account.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
            <button type="button" aria-expanded={open} onClick={() => toggle(r.account.id)}
              style={{
                width: '100%', display: 'grid', gridTemplateColumns: '16px 1fr auto', alignItems: 'center', gap: 10,
                background: 'none', border: 0, padding: '5px 4px', marginBottom: 3, borderRadius: 6,
                font: 'inherit', color: 'var(--tx)', textAlign: 'left', cursor: 'pointer',
              }}>
              <span style={{ fontSize: 9, color: open ? 'var(--ac)' : 'var(--tx3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .16s' }}>▶</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.account.name}</span>
              <span className="mono" style={{ fontSize: 13, color: r.bal < 0 ? 'var(--red)' : 'var(--tx2)' }}>{m(faBal(r.bal))}</span>
            </button>

            <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: 'var(--bg4)', marginLeft: 26 }}>
              {segs.map((s) => (
                <div key={s.key}
                  style={{ background: s.color, width: `${s.amount / segTotal * 100}%`, cursor: 'default' }}
                  onMouseEnter={(e) => showTip(e, { name: s.name, color: s.color, amount: s.amount, sub: `${r.account.name}の ${pct(s.amount)}` })}
                  onMouseMove={(e) => showTip(e, { name: s.name, color: s.color, amount: s.amount, sub: `${r.account.name}の ${pct(s.amount)}` })}
                  onMouseLeave={() => setTip(null)} />
              ))}
            </div>

            {/* バーに描けないもの。ここを出さないと数字が合わない */}
            {(negatives.length > 0 || r.free < 0) && (
              <div style={{ fontSize: 11.5, color: 'var(--red)', margin: '5px 0 0 26px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {negatives.map((i) => <span key={i.tagId}>{i.name} {m(faBal(i.amount))}（使いすぎ）</span>)}
                {r.free < 0 && <span>配分超過 {m(faBal(r.free))}</span>}
              </div>
            )}

            {open && (
              <div style={{ margin: '6px 0 4px 26px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 8, padding: '9px 12px' }}>
                {r.items.map((i) => (
                  <div key={i.tagId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 12, fontSize: 12.5, padding: '3px 0' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.color, flex: 'none' }} />{i.name}
                    </span>
                    <span className="mono" style={{ fontWeight: 600, minWidth: 74, textAlign: 'right', color: i.amount < 0 ? 'var(--red)' : undefined }}>{m(faBal(i.amount))}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)', minWidth: 46, textAlign: 'right' }}>{pct(i.amount)}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 12, fontSize: 12.5, padding: '3px 0', color: r.free < 0 ? 'var(--red)' : 'var(--tx3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.defaultColor, flex: 'none' }} />
                    {r.free < 0 ? '配分超過' : r.defaultTag}
                  </span>
                  <span className="mono" style={{ minWidth: 74, textAlign: 'right' }}>{m(faBal(r.free))}</span>
                  <span className="mono" style={{ fontSize: 11, minWidth: 46, textAlign: 'right' }}>{pct(r.free)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* バー内に文字を置かない代わりのツールチップ */}
      <div ref={tipRef} role="tooltip" aria-hidden={!tip}
        style={{
          position: 'fixed', left: tip?.x ?? -9999, top: tip?.y ?? -9999, zIndex: 50,
          pointerEvents: 'none', opacity: tip ? 1 : 0, transition: 'opacity .1s',
          background: 'var(--bg1)', border: '1px solid var(--bd2)', borderRadius: 9,
          padding: '9px 12px', boxShadow: '0 10px 30px -10px rgba(0,0,0,.55)', minWidth: 150,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tip?.color, flex: 'none' }} />{tip?.name}
        </div>
        <div className="mono" style={{ fontSize: 16, fontWeight: 800, margin: '3px 0 1px' }}>{tip ? m(fa(tip.amount)) : ''}</div>
        <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{tip?.sub}</div>
      </div>
    </div>
  );
}
