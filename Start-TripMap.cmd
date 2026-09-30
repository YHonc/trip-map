@echo off
setlocal
chcp 65001 >nul
title TripMap
set "APP_DIR=%~dp0release\win-unpacked"
if not exist "%APP_DIR%\TripMap.exe" goto missing
start "" /D "%APP_DIR%" "%APP_DIR%\TripMap.exe"
if errorlevel 1 goto failed
exit /b 0

:missing
echo 未找到桌面程序：
echo "%APP_DIR%\TripMap.exe"
echo.
echo 请在项目目录执行 npm run desktop:build 后重试。
echo 构建需要先安装项目依赖；日常启动无需安装 Node.js。
pause
exit /b 1

:failed
echo TripMap 启动失败，请检查程序文件是否完整。
pause
exit /b 1
