@echo off
rem 编码规整：.ps1 补 BOM + CRLF，.cmd 用 CRLF，其余统一 LF
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-encoding.ps1" %*
exit /b %ERRORLEVEL%
