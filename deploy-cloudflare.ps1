# ============================================================
#  Deploy → Cloudflare Pages (Wrangler CLI)  |  Gadget Villa Delivery
# ============================================================
#  ใช้ครั้งเดียว/ทุกครั้งที่อยากอัปเว็บขึ้น Cloudflare
#
#  เตรียมก่อนรัน (ครั้งแรกครั้งเดียว):
#   1) สร้าง Cloudflare API Token:  dash.cloudflare.com → My Profile → API Tokens
#      → Create Token → Custom token → Permission: Account · Cloudflare Pages · Edit
#   2) หา Account ID: dash.cloudflare.com → Workers & Pages (เลขในหน้า/URL)
#
#  วิธีรัน (PowerShell) — วาง token ของคุณแทน xxxx (อย่า commit ไฟล์ที่มี token):
#     $env:CLOUDFLARE_API_TOKEN  = "xxxxxxxx"
#     $env:CLOUDFLARE_ACCOUNT_ID = "xxxxxxxx"
#     ./deploy-cloudflare.ps1
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not $env:CLOUDFLARE_API_TOKEN) { Write-Error "ยังไม่ได้ตั้ง `$env:CLOUDFLARE_API_TOKEN"; exit 1 }

Write-Host "Deploying dispatch-center -> Cloudflare Pages project 'gadgetvilla-delivery' ..." -ForegroundColor Green

# --project-name จะสร้าง project ให้อัตโนมัติถ้ายังไม่มี
npx --yes wrangler@latest pages deploy . `
  --project-name=gadgetvilla-delivery `
  --branch=main `
  --commit-dirty=true

Write-Host "`nเสร็จแล้ว — เปิด URL *.pages.dev ที่ Wrangler แสดง แล้วต่อท้ายด้วย:" -ForegroundColor Green
Write-Host '  /?api=https://script.google.com/macros/s/AKfycbwwUY8D8aKdoSJSZwBirfevlE4UoM9nj-JsyC_5eQo573qhpMDRlDN1pdsuHp4bDjIe/exec' -ForegroundColor Yellow
