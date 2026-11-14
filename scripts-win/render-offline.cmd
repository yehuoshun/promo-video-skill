@echo off
rem 离线渲染通道：外部渲染器（manim/blender…）→ public/offline/<name>/frame_0000.png + meta.json
rem 用法：scripts-win\render-offline.cmd . demo -Frames 60 -Width 1820 -Height 1000 -Renderer "C:\tools\manim.exe" -Args "--format=png-sequence,-t,scene.py,Scene" -Source "场景说明" -License "自研"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0render-offline.ps1" %*
exit /b %ERRORLEVEL%
