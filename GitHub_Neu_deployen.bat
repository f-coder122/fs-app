@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 goto missing_git
if not exist ".git" goto not_linked

echo Lade die aktuelle Version auf GitHub hoch (GitHub Pages baut und veroeffentlicht automatisch)...
git add -A
git commit -m "Update %date% %time%"
git push origin main
if errorlevel 1 goto failed

echo.
echo Hochgeladen. Die Seite ist in 1-2 Minuten aktualisiert (Fortschritt: Reiter "Actions" auf GitHub).
pause
exit /b 0

:missing_git
echo Git ist nicht installiert. Bitte zuerst Git fuer Windows installieren: https://git-scm.com/download/win
pause
exit /b 1

:not_linked
echo Dieser Ordner ist noch nicht mit einem GitHub-Repository verknuepft.
pause
exit /b 1

:failed
echo Upload fehlgeschlagen. Lies die Fehlermeldung oben.
pause
exit /b 1
