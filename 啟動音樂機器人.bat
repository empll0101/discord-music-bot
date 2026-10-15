@echo off
chcp 65001 >nul
title Discord Music Bot
powershell -Command "$reg = 'HKCU:\Console'; Set-ItemProperty -Path $reg -Name 'QuickEdit' -Value 0" >nul 2>&1
set PATH=%USERPROFILE%\.deno\bin;%PATH%

echo ========================================================
echo   Discord 音樂機器人正在啟動中...
echo ========================================================

cd /d "%~dp0"
npx tsx src/index.ts
pause
