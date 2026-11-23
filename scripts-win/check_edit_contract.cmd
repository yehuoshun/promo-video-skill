@echo off
python "%~dp0check_edit_contract.py" %*
exit /b %ERRORLEVEL%
