@echo off
cd /d "%~dp0"
echo Kululu: http://localhost:8095
start "" http://localhost:8095
python -m http.server 8095
