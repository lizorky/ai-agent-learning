@echo off
setlocal
cd /d "%~dp0"
set "PUNCH_URL=http://127.0.0.1:4174/prototypes/punch-test/index.html"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto open_page

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process '%PUNCH_URL%'"
title White Monkey Punch Test Server
echo The punch test is running. Keep this window open while playing.
node serve.mjs
exit /b

:open_page
start "" "%PUNCH_URL%"
endlocal
