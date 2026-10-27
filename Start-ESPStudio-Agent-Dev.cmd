@echo off
cd /d "%~dp0"
set ESPSTUDIO_AGENT_DEV=1
rem Explicit origins only. Add the deployed HTTPS origin to this list after publication.
if not defined ESPSTUDIO_AGENT_ORIGINS set ESPSTUDIO_AGENT_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:3210
call npm.cmd run agent:dev
