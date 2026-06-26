import { lazy, Suspense } from 'react';

// 広告本体は遅延ロード（登録ユーザー=広告なしのティアには一切バンドルされない）。
const AdBanner = lazy(() => import('./AdBanner'));

export default function Ad() {
  return (
    <Suspense fallback={null}>
      <AdBanner />
    </Suspense>
  );
}
