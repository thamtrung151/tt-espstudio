@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
call npm.cmd run build
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:3210 in Chrome or Edge.
call npm.cmd start
