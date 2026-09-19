@echo off
title QRFlow Dynamic QR Server
cd /d "%~dp0"
cls
echo ============================================================
echo         QRFLOW DYNAMIC QR CODE SERVER STARTUP
echo ============================================================
echo.
echo Starting Python backend server & public online tunnel...
echo Please wait 5 seconds while your online links activate...
echo.
python server.py
pause
