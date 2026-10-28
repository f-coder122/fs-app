@echo off
title Fahrschul-App Server
color 0B
cd /d "%~dp0"

echo ===================================================
echo   Fahrschul-App Server
echo ===================================================
echo.
echo  PC-Adresse:     http://localhost:8000
echo  Handy-Adresse:  http://10.0.16.8:8000
echo.
echo  Bitte dieses Fenster geoeffnet lassen, solange du lernst!
echo ===================================================
echo.

start http://localhost:8000
python server.py
pause
