@echo off
setlocal
if exist "%~dp0.tools\node-v24.22.2-win-x64\node.exe" set "PATH=%~dp0.tools\node-v24.22.2-win-x64;%PATH%"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS and reopen your terminal. 1>&2
  exit /b 1
)
call npm.cmd %*
exit /b %errorlevel%
