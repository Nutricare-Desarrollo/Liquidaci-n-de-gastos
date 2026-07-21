@echo off
setlocal
cd /d "%~dp0"
title Inicializar base de datos (migraciones + catalogos)

echo Este script inicializa la base que este configurada en .env (DATABASE_URL).
echo Asegurate de que .env apunte a la BASE NUEVA antes de continuar.
echo.
pause

echo === 1) Migraciones (crea el esquema) ===
call npx prisma migrate deploy
if errorlevel 1 goto :err

echo === 2) Generar cliente Prisma ===
call npx prisma generate
if errorlevel 1 goto :err

echo === 3) Catalogos (empleados, categorias, anticipo, centros de costo, reglas) ===
call npx tsx --env-file=.env scripts/importEmpleados.ts
call npx tsx --env-file=.env scripts/importCategorias.ts
call npx tsx --env-file=.env scripts/seedCategoriaAnticipo.ts
call npx tsx --env-file=.env scripts/importCentrosCosto.ts
call npx tsx --env-file=.env scripts/importReglas.ts

echo.
echo ===== LISTO. Base inicializada con esquema + catalogos. =====
goto :fin
:err
echo *** Fallo un paso. Revisa el mensaje de arriba. ***
:fin
echo.
pause
