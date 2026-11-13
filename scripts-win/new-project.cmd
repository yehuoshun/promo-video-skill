@echo off
rem Wrapper: bypass execution policy without changing system settings.
rem Usage: scripts-win\new-project.cmd 我的宣传片
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0new-project.ps1" %*
exit /b %ERRORLEVEL%
