// 画面が読む本番リソース。Discord 定時レポートと共有する分は report/src/collect.mjs の CONFIG を使う。
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ADMIN_DIR = fileURLToPath(new URL('..', import.meta.url));
export const CACHE_DIR = join(ADMIN_DIR, '.cache-cflogs');     // CloudFront ログの手元の写し
export const PF_CACHE_DIR = join(ADMIN_DIR, '.cache-platforms'); // 端末別集計の日別キャッシュ

export const API_LOG_GROUP = '/aws/apigateway/kakeibo-saas-prod'; // API Gatewayのアクセスログ（保持90日）
// 退会理由（ACCOUNT_DELETE_REASON の行）はこのLambdaのログにだけ残る。DBには保存していない（保持90日）
export const SETTINGS_LOG_GROUP = '/aws/lambda/kakeibo-saas-prod-SettingsFunction-ruoTTMCvIWbp';
