@echo off
cd /d "%~dp0"
call npm.cmd run build:web
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:5173 and start Start-ESPStudio-Agent-Dev.cmd separately.
node node_modules\vite\bin\vite.js preview --outDir dist-web --host 127.0.0.1 --port 5173 --strictPort
