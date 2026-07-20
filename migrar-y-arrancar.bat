@echo off
setlocal
cd /d "%~dp0"
title Nutricare - migrar y arrancar backend

echo ============================================
echo  1/4  Deteniendo backend (puerto 8080)...
echo ============================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do (
  echo    Matando PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ============================================
echo  2/4  Aplicando migraciones (prisma migrate deploy)...
echo ============================================
call npx prisma migrate deploy
if errorlevel 1 goto :error

echo.
echo ============================================
echo  3/4  Regenerando cliente (prisma generate)...
echo ============================================
call npx prisma generate
if errorlevel 1 goto :error

echo.
echo ============================================
echo  4/4  Arrancando backend (npm run real:watch)...
echo ============================================
echo   (dejar esta ventana abierta; Ctrl+C para detener)
call npm run real:watch
goto :eof

:error
echo.
echo *** Ocurrio un error en la migracion/generate. Revisa el mensaje de arriba. ***
pause
