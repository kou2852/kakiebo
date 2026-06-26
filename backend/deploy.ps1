# ============================================
# kakeibo-saas デプロイスクリプト (PowerShell)
# 使い方: cd backend; .\deploy.ps1
# ============================================
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  複式家計簿 SaaS — バックエンドデプロイ"     -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 前提チェック
Write-Host "[1/5] 前提条件チェック..." -ForegroundColor Yellow
try { $null = Get-Command aws   -ErrorAction Stop } catch { Write-Host "AWS CLI が見つかりません" -ForegroundColor Red; exit 1 }
try { $null = Get-Command sam   -ErrorAction Stop } catch { Write-Host "SAM CLI が見つかりません" -ForegroundColor Red; exit 1 }
try { $null = Get-Command node  -ErrorAction Stop } catch { Write-Host "Node.js が見つかりません" -ForegroundColor Red; exit 1 }

$acct = aws sts get-caller-identity --query Account --output text 2>$null
if (-not $acct) { Write-Host "AWS CLI が未設定です。aws configure を実行してください" -ForegroundColor Red; exit 1 }
Write-Host "  OK AWS CLI: アカウント $acct" -ForegroundColor Green
Write-Host "  OK SAM CLI: $(sam --version)" -ForegroundColor Green
Write-Host "  OK Node.js: $(node --version)" -ForegroundColor Green
Write-Host ""

# 2. npm install
Write-Host "[2/5] 依存パッケージをインストール..." -ForegroundColor Yellow
npm install --omit=dev
Write-Host "  OK npm install 完了" -ForegroundColor Green
Write-Host ""

# 3. sam build
Write-Host "[3/5] SAM ビルド..." -ForegroundColor Yellow
sam build
Write-Host "  OK ビルド完了" -ForegroundColor Green
Write-Host ""

# 4. sam deploy
Write-Host "[4/5] SAM デプロイ..." -ForegroundColor Yellow
Write-Host "  初回は対話形式で設定します" -ForegroundColor Gray
Write-Host "  推奨設定:" -ForegroundColor Gray
Write-Host "    Stack Name:       kakeibo-saas"
Write-Host "    Region:           ap-northeast-1"
Write-Host "    Confirm changes:  Y"
Write-Host "    Allow IAM:        Y"
Write-Host "    Save to config:   Y"
Write-Host ""

sam deploy --guided

Write-Host ""
Write-Host "[5/5] デプロイ完了！" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  次のステップ" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "上に表示された Outputs の3つの値をコピーして、"
Write-Host "frontend\.env.local に以下の形式で保存してください："
Write-Host ""
Write-Host '  VITE_API_URL=https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod' -ForegroundColor White
Write-Host '  VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX' -ForegroundColor White
Write-Host '  VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx' -ForegroundColor White
Write-Host '  VITE_COGNITO_REGION=ap-northeast-1' -ForegroundColor White
Write-Host ""
Write-Host "その後："
Write-Host "  cd ..\frontend"
Write-Host "  npm install"
Write-Host "  npm run dev"
Write-Host ""
