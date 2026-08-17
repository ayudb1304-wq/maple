# Rebuild and restart the production preview on a clean port.
#
# Restarting matters more than it looks: `next start` serves from .next, so
# rebuilding underneath a running server leaves it handing out HTML that points
# at chunk hashes which no longer exist. The page then never hydrates and the
# failure looks like a bug in the app rather than a stale process.

param([int]$Port = 3100, [switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

if (-not $SkipBuild) {
  npm run build | Select-Object -Last 3
}

# npx is a shell script on Windows, not an exe, so it must be launched through
# cmd rather than passed to Start-Process directly.
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx next start -p $Port" -WindowStyle Hidden `
  -RedirectStandardOutput "$env:TEMP\skytonight-preview.log" `
  -RedirectStandardError "$env:TEMP\skytonight-preview.err"

for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$Port" -TimeoutSec 2 -UseBasicParsing | Out-Null
    Write-Output "preview ready on http://localhost:$Port"
    exit 0
  } catch { Start-Sleep -Seconds 1 }
}

Write-Error "preview failed to start; see $env:TEMP\skytonight-preview.err"
exit 1
