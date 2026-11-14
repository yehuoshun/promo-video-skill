@echo off
rem 一键体检：目录/环境/时间轴/素材/离线素材/配乐/同步/静帧/排版/成片/编码 十一道闸门串成一条命令
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify.ps1" %*
exit /b %ERRORLEVEL%
