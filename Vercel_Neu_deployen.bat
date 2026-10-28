@echo off
setlocal
cd /d "%~dp0"

if not exist ".vercel\project.json" goto not_linked

set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%CODEX_NODE%\node.exe" set "PATH=%CODEX_NODE%;%PATH%"
set "VERCEL_CMD=I:\FS-App-VercelCache\vercel-cli\vercel.cmd"
if not exist "%VERCEL_CMD%" goto missing_cli

set "NODE_USE_SYSTEM_CA=1"
echo Deploye die aktuelle Version des verknuepften Projekts nach Production...
call "%VERCEL_CMD%" deploy --prod
if errorlevel 1 goto failed

echo.
echo Production-Deployment abgeschlossen.
pause
exit /b 0

:not_linked
echo Dieser Ordner ist noch nicht mit Vercel verknuepft.
echo Starte zuerst Vercel_Einmal_verknuepfen.bat und waehle das bestehende Projekt fs-app.
pause
exit /b 1

:missing_cli
echo Aktuelle Vercel-CLI nicht gefunden unter I:\FS-App-VercelCache\vercel-cli.
echo Bitte installiere Node.js/npm und Vercel CLI, dann starte dieses Skript erneut.
pause
exit /b 1

:failed
echo Deployment fehlgeschlagen. Lies die Fehlermeldung oben.
pause
exit /b 1
