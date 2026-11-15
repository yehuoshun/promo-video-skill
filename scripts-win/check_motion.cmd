@echo off
rem 段尾静止体检：相邻帧平均像素差，尾段/运动段 median 比 < 阈值判 ERROR
rem 审图旁路工具，**不**接进 verify.ps1（闸门数量与文档口径别动）
rem 判定：段覆盖率（漏段 ERROR，--allow-partial 放行）、段内帧不足/缺帧 ERROR、
rem       尾段/运动段 median 比 < --tail-ratio(0.3) ERROR、比值算不出来且尾段几乎没动 ERROR、
rem       目录混了别的帧（主序列之外）ERROR；「静止帧对 N/M」只打印不判定。
rem 用法：scripts-win\check_motion.cmd template\out\fix-tail --segments "Lottie=540-629,Morph=630-719" --region 700,280,1220,800
rem       scripts-win\check_motion.cmd out\stills --tail-ratio 0.3
rem       scripts-win\check_motion.cmd template\out\fix-tail --seg-frames 90
rem       scripts-win\check_motion.cmd template\out\fix-tail --segments "Lottie=540-629" --allow-partial
rem 注意：这里不用 ( ... ) 代码块包 exit /b %ERRORLEVEL% —— 块里的 %ERRORLEVEL%
rem       会在解析时展开，exit code 永远是 0（踩过）。用 label 分开写。
rem 注意：调 python 一定要带 call —— 若 python 被包成 .cmd 壳（conda/stub 都可能是），
rem       不带 call 调 .cmd 会把控制权交出去、本脚本的 exit /b 拿不到真实退出码（静默 EXIT=0）。
rem       探测行（python -c / py -3 -c）同理：不带 call 时壳一退出整个批处理就结束，三态退出码全丢。
setlocal
rem 先确认 python 真能跑（Windows 应用商店的 python.exe 占位 stub 会 exit 9009）
call python -c "import sys" >nul 2>nul
if errorlevel 1 goto :try_py
call python "%~dp0check_motion.py" %*
exit /b %ERRORLEVEL%

:try_py
call py -3 -c "import sys" >nul 2>nul
if errorlevel 1 goto :no_python
call py -3 "%~dp0check_motion.py" %*
exit /b %ERRORLEVEL%

:no_python
echo [ERROR] 找不到可用的 Python 3：先装 Python 并把 python.exe 放进 PATH（或用 py 启动器）。
echo         需要 numpy + Pillow：pip install numpy pillow
exit /b 2
