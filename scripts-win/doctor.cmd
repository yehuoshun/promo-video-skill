@echo off
rem Wrapper: bypass execution policy without changing system settings.
rem Usage: scripts-win\doctor.cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0doctor.ps1" %*
exit /b %ERRORLEVEL%
