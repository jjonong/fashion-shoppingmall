@echo off
chcp 65001 > nul
cd /d "%~dp0tools\design-doc"
if not exist node_modules (
  echo npm install ...
  call npm install
)
node edit-server.js
pause
