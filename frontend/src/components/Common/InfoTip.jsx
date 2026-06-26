// 専門用語へのやさしい補足。? アイコンにホバー/フォーカスで吹き出し表示。
export default function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text}>
      ?
      <span className="infotip-bubble">{text}</span>
    </span>
  );
}
