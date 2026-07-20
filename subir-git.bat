@echo off
setlocal
cd /d "%~dp0"
title Nutricare - subir a GitHub

echo ============================================
echo  1/4  Quitando lock de git (si existe)...
echo ============================================
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo.
echo ============================================
echo  2/4  Agregando cambios (git add -A)...
echo ============================================
git add -A

echo.
echo ============================================
echo  3/4  Commit...
echo ============================================
git commit -m "Revision Contabilidad: propositos (caja chica T/A, anticipos, liquidacion anticipos, kilometraje), metodo de pago y categorias por proposito, tarifa km editable, tipo de cambio + zona/km en FO, combos con busqueda, campo reporte FO, migraciones"

echo.
echo ============================================
echo  4/4  Push a origin/main...
echo ============================================
git push origin main

echo.
echo === Listo. Revisa arriba que el push haya terminado OK. ===
pause
