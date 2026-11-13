@echo off
rem Wrapper: bypass execution policy without changing system settings.
rem Usage: scripts-win\grab.cmd "https://..." out\shot.png -UserData tmp\yuque-profile -Height 2600
rem Login: scripts-win\grab.cmd "https://www.yuque.com/dashboard" -UserData tmp\yuque-profile -Login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0grab.ps1" %*
exit /b %ERRORLEVEL%
