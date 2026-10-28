// Lambda の配布物を api/dist に作る。lib/・report/src/・api/src/ を同じ並びで写すだけ（SDK はランタイム同梱を使うので入れない）。
import { rmSync, cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ADMIN = fileURLToPath(new URL('..', import.meta.url));
const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
rmSync(DIST, { recursive: true, force: true });
for (const d of ['lib', 'report/src', 'api/src']) {
  mkdirSync(DIST + d, { recursive: true });
  cpSync(ADMIN + d, DIST + d, { recursive: true });
}
console.log('built', DIST);
