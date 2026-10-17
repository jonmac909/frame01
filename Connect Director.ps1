Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Use /login to connect your ChatGPT subscription or provider account. Keep this terminal open while using the editor.'
& npx.cmd eve dev --no-default-extensions --host 127.0.0.1 --port 4318
