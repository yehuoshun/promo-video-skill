@echo off
rem Wrapper: bypass execution policy without changing system settings.
rem Usage: scripts-win\shot.cmd examples\card.html out\frame.png
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shot.ps1" %*
exit /b %ERRORLEVEL%
