param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$logDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$nodeExe = (Get-Command node.exe).Source
try { $editorHealth = Invoke-RestMethod 'http://127.0.0.1:4317/api/health' -TimeoutSec 3 } catch {
  Start-Process -FilePath $nodeExe -ArgumentList @('--import','tsx','src/server.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'editor.log') -RedirectStandardError (Join-Path $logDir 'editor-error.log') | Out-Null
}
try { $directorHealth = Invoke-RestMethod 'http://127.0.0.1:4318/eve/v1/health' -TimeoutSec 3 } catch {
  $eveBin = Join-Path $projectRoot 'node_modules/eve/dist/bin/eve.js'
  $packageInfo = Get-Content (Join-Path $projectRoot 'node_modules/eve/package.json') -Raw | ConvertFrom-Json
  $eveBin = Join-Path (Join-Path $projectRoot 'node_modules/eve') $packageInfo.bin.eve
  Start-Process -FilePath $nodeExe -ArgumentList @(('"' + $eveBin + '"'),'dev','--no-ui','--no-default-extensions','--host','127.0.0.1','--port','4318') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'director.log') -RedirectStandardError (Join-Path $logDir 'director-error.log') | Out-Null
}
if (-not $NoOpen) { Start-Process 'http://127.0.0.1:4317' }
