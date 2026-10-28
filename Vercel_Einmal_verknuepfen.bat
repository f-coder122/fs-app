@echo off
setlocal
cd /d "%~dp0"

set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%CODEX_NODE%\node.exe" set "PATH=%CODEX_NODE%;%PATH%"
set "VERCEL_CMD=I:\FS-App-VercelCache\vercel-cli\vercel.cmd"
if not exist "%VERCEL_CMD%" goto missing_cli

set "NODE_USE_SYSTEM_CA=1"
echo Melde dich ueber den Vercel-Geraete-Login an und bestaetige den Zugriff im Browser.
call "%VERCEL_CMD%" login
if errorlevel 1 goto failed

echo.
echo Verknuepfe diesen Ordner mit dem bestehenden Vercel-Projekt fs-app.
echo Waehle dein Konto/Team und bestaetige das vorhandene Projekt fs-app. Lege kein neues Projekt an.
call "%VERCEL_CMD%" link --project fs-app
if errorlevel 1 goto failed

if not exist ".vercel\project.json" goto no_link

echo.
echo Verknuepfung gespeichert. Ab jetzt kannst du Vercel_Neu_deployen.bat verwenden.
pause
exit /b 0

:missing_cli
echo Aktuelle Vercel-CLI nicht gefunden unter I:\FS-App-VercelCache\vercel-cli.
echo Bitte installiere Node.js/npm und Vercel CLI, dann starte dieses Skript erneut.
pause
exit /b 1

:no_link
echo Vercel hat keine Projektverknuepfung gespeichert. Pruefe Konto und Projekt-Auswahl.
pause
exit /b 1

:failed
echo Vercel-Schritt fehlgeschlagen. Lies die Fehlermeldung oben.
pause
exit /b 1
