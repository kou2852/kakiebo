import { Modal } from 'kakeibo-frontend';

// Modal は本来 position:fixed の全画面オーバーレイ（ビューポート中央表示）。
// プレビューカード内にタイトルまで収めて見せるため、このプレビューに限り
// .mo を in-flow 配置に上書きする（バンドルの実装そのものは不変）。
const inCard = `.mo{position:static!important;align-items:flex-start;background:var(--bg0);padding:24px}`;

// 確認ダイアログ（標準幅）
export const Confirm = () => (
  <div data-theme="light">
    <style>{inCard}</style>
    <Modal
      open
      title="口座を削除しますか？"
      onClose={() => {}}
      footer={
        <>
          <button className="btn btn-g">キャンセル</button>
          <button className="btn btn-d">削除する</button>
        </>
      }
    >
      <p style={{ color: 'var(--tx2)', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
        この口座に紐づく仕訳は削除されません。口座だけを一覧から取り除きます。よろしいですか？
      </p>
    </Modal>
  </div>
);

// 広い幅のフォーム系（wide）
export const Wide = () => (
  <div data-theme="light">
    <style>{inCard}</style>
    <Modal
      open
      wide
      title="CSVを取り込む"
      onClose={() => {}}
      footer={
        <>
          <button className="btn btn-g">キャンセル</button>
          <button className="btn btn-p">取り込む</button>
        </>
      }
    >
      <p style={{ color: 'var(--tx2)', fontSize: 13, lineHeight: 1.8, marginTop: 0 }}>
        マネーフォワード / Zaim のCSVを自動判定して取り込みます。費目・口座は科目へまとめて割り当てられます。
      </p>
      <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12, color: 'var(--tx3)', fontSize: 12 }}>
        ここにファイルをドロップ、またはクリックして選択
      </div>
    </Modal>
  </div>
);
