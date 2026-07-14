# ============================================================
# Venture Platform — GO ONLINE  (free · no account · no card)
# Double-click (or: right-click > Run with PowerShell).
# Builds the apps, starts the unified server, opens a public HTTPS link,
# and prints ONE URL that serves the landing page + all three apps.
# Keep the window open; closing it takes the site offline.
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$node = Join-Path $root '.tools\node\node.exe'
$npm  = Join-Path $root '.tools\node\npm.cmd'
$tsx  = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
$cf   = Join-Path $root '.tools\cloudflared.exe'
$env:Path = (Join-Path $root '.tools\node') + ';' + $env:Path

Write-Host "Building apps..." -ForegroundColor Cyan
& $npm run build:apps *> (Join-Path $root '.tools\build.log')

Write-Host "Starting server..." -ForegroundColor Cyan
Get-Process node -EA SilentlyContinue | Where-Object { $_.Path -like "*$root\.tools\node\*" } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2
Start-Process $node -WindowStyle Hidden -WorkingDirectory (Join-Path $root 'packages\centcom') -ArgumentList @($tsx, 'src/server.ts')
Start-Sleep 5

if (-not (Test-Path $cf)) {
  Write-Host "First run: downloading the tunnel tool (~50MB)..." -ForegroundColor Cyan
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf -UseBasicParsing
}
$log = Join-Path $root '.tools\vp-tunnel.log'
Remove-Item $log -EA SilentlyContinue
$tunnel = Start-Process $cf -WindowStyle Hidden -PassThru -RedirectStandardError $log -ArgumentList @('tunnel','--url','http://localhost:4000')

$url = $null
for ($i = 0; $i -lt 25 -and -not $url; $i++) { Start-Sleep 2; $url = [regex]::Match((Get-Content $log -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com').Value }

Write-Host ""
if ($url) {
  Write-Host "===============================================================" -ForegroundColor Green
  Write-Host "  ONLINE — share this one link (opens the app menu):" -ForegroundColor Green
  Write-Host "  $url"
  Write-Host "===============================================================" -ForegroundColor Green
  Write-Host "  Logins:  admin youssef_hq | customers mona/khaled | workers ahmed/mahmoud/saeed"
  Write-Host "  (customer/worker password: password123)"
  Write-Host "  NOTE: link changes each run. Keep this window open to stay online."
} else { Write-Host "  Could not get a tunnel URL — check your internet and retry." -ForegroundColor Red }
Write-Host ""
Read-Host "  Press Enter to STOP and go offline"
Stop-Process -Id $tunnel.Id -Force -EA SilentlyContinue
Write-Host "  Offline."
