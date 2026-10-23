@echo off
rem Startet nur das kleine Uebungsspiel. Vorher einmal start.bat ausfuehren.
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Bitte zuerst start.bat ausfuehren.
  pause
  exit /b 1
)
start "" ".venv\Scripts\pythonw.exe" -m memscope.demo
