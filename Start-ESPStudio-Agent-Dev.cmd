@echo off
cd /d "%~dp0"
set ESPSTUDIO_AGENT_DEV=1
rem Explicit trusted origins only; pairing is still required for each website session.
if not defined ESPSTUDIO_AGENT_ORIGINS set ESPSTUDIO_AGENT_ORIGINS=https://thamtrung151.github.io,http://127.0.0.1:5173,http://127.0.0.1:3210
call npm.cmd run agent:dev
