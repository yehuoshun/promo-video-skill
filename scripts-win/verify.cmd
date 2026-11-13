@echo off
rem 一键体检：把环境/时间轴/素材/静帧/排版/成片六道闸门串成一条命令
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify.ps1" %*
exit /b %ERRORLEVEL%
