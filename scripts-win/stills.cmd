@echo off
rem 批量截帧：按 timing.json 截出审片用的 out/stills/（每个场景中点 + 首帧 + 末帧）
rem 用法：scripts-win\stills.cmd .            每场景一帧
rem       scripts-win\stills.cmd . -Step 0.5  每 0.5 秒一帧
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stills.ps1" %*
exit /b %ERRORLEVEL%
