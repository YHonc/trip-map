@echo off
setlocal
chcp 65001 >nul
title TripMap - Local Development
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
set "RESULT=%errorlevel%"
echo.
echo 调试服务已停止。按任意键关闭窗口。
pause >nul
exit /b %RESULT%
