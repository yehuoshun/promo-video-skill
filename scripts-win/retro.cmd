@echo off
rem 交付后复盘：把能数出来的事实（片长/成片/场景/素材/verify 历史/提交）自动填进 复盘.md，
rem 人只回答三个问题；再往工具仓库 docs\错误清单.md 追加一行（append-only，跨片可查）。
rem 用法：scripts-win\retro.cmd -Project .                     在片子工程里跑，写 .\复盘.md
rem       scripts-win\retro.cmd -Project ..\my-video           指定工程
rem       scripts-win\retro.cmd -Project . --stdout            只看结果、不落盘
rem       scripts-win\retro.cmd -Project . --no-ledger         不动账本
rem 注意：调 python 一定要带 call —— 若 python 被包成 .cmd 壳（conda/stub 都可能是），
rem       不带 call 会把控制权交出去，本脚本的 exit /b 拿不到真实退出码（静默 EXIT=0）。
rem 注意：不用 ( ... ) 代码块包 exit /b %ERRORLEVEL% —— 块里的 %ERRORLEVEL% 会在解析时
rem       展开，退出码永远是 0（check_motion.cmd 里踩过），这里用 label 分开写。
setlocal
call python -c "import sys" >nul 2>nul
if errorlevel 1 goto :try_py
call python "%~dp0retro.py" %*
exit /b %ERRORLEVEL%

:try_py
call py -3 -c "import sys" >nul 2>nul
if errorlevel 1 goto :no_python
call py -3 "%~dp0retro.py" %*
exit /b %ERRORLEVEL%

:no_python
echo [ERROR] 找不到可用的 Python 3：先装 Python 并把 python.exe 放进 PATH（或用 py 启动器）。
exit /b 2
