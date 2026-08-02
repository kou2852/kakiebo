import Modal from '../Common/Modal';

// 借方・貸方が「増える」側の対応表（複式簿記の基本ルール）
const RULES = [
  { type: '資産', badge: 'bdg-a', up: '借方', down: '貸方', ex: '現金・預金・証券が増える → 借方' },
  { type: '負債', badge: 'bdg-l', up: '貸方', down: '借方', ex: '借入・カード未払が増える → 貸方' },
  { type: '純資産', badge: 'bdg-q', up: '貸方', down: '借方', ex: '元入金・繰越利益が増える → 貸方' },
  { type: '収益', badge: 'bdg-i', up: '貸方', down: '借方', ex: '給与・副収入が入る → 貸方' },
  { type: '費用', badge: 'bdg-e', up: '借方', down: '貸方', ex: '食費・光熱費など支出 → 借方' },
];

// よくある取引パターン（借方科目 / 貸方科目）
const EXAMPLES = [
  { desc: '現金で買い物', dr: '費用科目（食費など）', cr: '現金' },
  { desc: 'カードで買い物', dr: '費用科目（食費など）', cr: 'クレジットカード' },
  { desc: '給与が振り込まれた', dr: '普通預金', cr: '給与収入' },
  { desc: 'カードの引き落とし', dr: 'クレジットカード', cr: '普通預金' },
  { desc: '現金を口座から引き出した', dr: '現金', cr: '普通預金' },
  { desc: '家賃・光熱費の支払い', dr: '費用科目（住居費など）', cr: '普通預金' },
];

export default function CheatSheetModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="📖 複式簿記チートシート" wide
      footer={<button className="btn btn-p" onClick={onClose}>閉じる</button>}>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        <p style={{ color: 'var(--tx2)', marginBottom: 12 }}>
          迷ったら「その科目が増えるのはどちら側か」だけ見れば決まります。
        </p>

        <table className="tw" style={{ width: '100%', marginBottom: 18, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bd)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>区分</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>増える側</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>減る側</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>例</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.type} style={{ borderBottom: '1px solid var(--bd)' }}>
                <td style={{ padding: '6px 8px' }}><span className={`bdg ${r.badge}`}>{r.type}</span></td>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.up}</td>
                <td style={{ padding: '6px 8px', color: 'var(--tx3)' }}>{r.down}</td>
                <td style={{ padding: '6px 8px', color: 'var(--tx2)', fontSize: 12 }}>{r.ex}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontWeight: 600, marginBottom: 8 }}>よくある取引パターン</div>
        <table className="tw" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bd)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>取引</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>借方</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>貸方</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((e) => (
              <tr key={e.desc} style={{ borderBottom: '1px solid var(--bd)' }}>
                <td style={{ padding: '6px 8px' }}>{e.desc}</td>
                <td style={{ padding: '6px 8px', color: 'var(--tx2)' }}>{e.dr}</td>
                <td style={{ padding: '6px 8px', color: 'var(--tx2)' }}>{e.cr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
