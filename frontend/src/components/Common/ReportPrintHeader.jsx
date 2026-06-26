import { today } from '../../utils/format';

// PDF/出力に含めるレポートの見出し（ブランド・レポート名・対象期間・出力日）。画面にも表示。
export default function ReportPrintHeader({ title, start, end }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
      marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--bd)',
    }}>
      <span style={{ fontFamily: 'inherit', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--ac)', fontSize: 15 }}>
        kurofukubo
      </span>
      <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
        {title}{start && end ? ` ｜ 対象期間 ${start}〜${end}` : ''} ｜ 出力日 {today()}
      </span>
    </div>
  );
}
