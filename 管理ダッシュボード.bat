@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set AWS_PROFILE=kakeibo-prod

echo ============================================
echo   kurofukubo 管理ダッシュボード（localhost）
echo   http://localhost:8787
echo ============================================
echo.
echo ※ もし赤いエラー（AWS認証切れ）が出たら、別ウィンドウで
echo    aws sso login --profile kakeibo-prod
echo    を実行してから画面の「更新」を押してください。
echo.
echo このウィンドウを閉じるとサーバーは停止します。
echo.

aws sso login --profile kakeibo-prod


rem 2秒待ってからブラウザを開く（サーバー起動を待つ）
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:8787"

node scripts\admin\server.mjs

pause
