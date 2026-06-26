// 指定要素を画面の見た目どおりPDF化して即ダウンロード（印刷ダイアログなし）。
// jsPDF / html2canvas は遅延 import（初期バンドルに含めない）。日本語はブラウザ描画なのでフォント埋込不要。
export async function downloadElementPDF(el, filename) {
  if (!el) return;
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasMod.default;

  // 印刷向けに一時的にライト配色で取得（ダーク時のインク浪費・視認性低下を回避）
  const body = document.body;
  const prevTheme = body.dataset.theme;
  const needSwap = prevTheme === 'dark';
  if (needSwap) {
    body.dataset.theme = 'light';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  let canvas;
  try {
    canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  } finally {
    if (needSwap) body.dataset.theme = prevTheme;
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL('image/png');

  const usable = pageH - margin * 2;
  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(img, 'PNG', margin, position, imgW, imgH);
  heightLeft -= usable;
  while (heightLeft > 0) {
    position = margin - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(img, 'PNG', margin, position, imgW, imgH);
    heightLeft -= usable;
  }
  pdf.save(filename);
}
