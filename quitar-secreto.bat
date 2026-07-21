@echo off
setlocal
cd /d "%~dp0"
title Quitar publish-profile del repo
if exist ".git\index.lock" del /f /q ".git\index.lock"
echo Quitando publish-profile.xml del repo (queda en tu disco, solo se saca de git)...
git rm --cached publish-profile.xml
git rm --cached azure-setup.log 2>nul
git add .gitignore
git commit -m "Seguridad: quitar publish-profile.xml del repo e ignorar archivos de despliegue"
git push origin main
echo.
echo Listo. Revisa que el push haya terminado OK.
pause
