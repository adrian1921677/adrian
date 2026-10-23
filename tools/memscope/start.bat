@echo off
rem MemScope starten. Beim ersten Mal wird alles Noetige automatisch installiert.
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\pythonw.exe" goto run

echo Erster Start: MemScope wird eingerichtet. Das dauert ein bis zwei Minuten ...
set "PY=python"
where py >nul 2>nul && set "PY=py -3"
%PY% -m venv .venv
if errorlevel 1 goto nopython
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed

:run
start "" ".venv\Scripts\pythonw.exe" -m memscope
exit /b 0

:nopython
echo.
echo Python wurde nicht gefunden.
echo Installiere Python 3.10 oder neuer von https://www.python.org/downloads/
echo und setze bei der Installation den Haken bei "Add python.exe to PATH".
pause
exit /b 1

:failed
echo.
echo Die Installation hat nicht geklappt. Pruefe deine Internetverbindung und starte erneut.
rmdir /s /q .venv
pause
exit /b 1
