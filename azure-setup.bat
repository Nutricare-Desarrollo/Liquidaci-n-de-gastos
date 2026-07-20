@echo off
setlocal
cd /d "%~dp0"
title Nutricare - crear infra en Azure (az CLI)
set LOG=azure-setup.log
echo Nutricare Azure setup - %date% %time% > "%LOG%"

REM =====================================================================
REM  Requisitos: Azure CLI + 'az login' hecho.
REM  Todo el detalle queda en azure-setup.log (por si la ventana se cierra).
REM  Ajusta las variables. NO pongas secretos aqui.
REM =====================================================================

set RG=rg-nutricare-liquidacion
set LOCATION=centralus
set PLAN=plan-nutricare-liquidacion
set APP=nutricare-liquidacion
set RUNTIME=NODE:22-lts
set REPO=Nutricare-Desarrollo/Liquidaci-n-de-gastos

echo === Suscripcion activa ===
call az account show --query "{Suscripcion:name, id:id}" -o table

echo === 1/5  Grupo de recursos ===
call az group create --name %RG% --location %LOCATION% >> "%LOG%" 2>&1
if errorlevel 1 goto :err

echo === 2/5  Plan (Linux, B1) ===
call az appservice plan create --name %PLAN% --resource-group %RG% --location %LOCATION% --is-linux --sku B1 >> "%LOG%" 2>&1
if errorlevel 1 goto :err

echo === 3/5  Web App (Node 20) ===
call az webapp create --resource-group %RG% --plan %PLAN% --name %APP% --runtime "%RUNTIME%" >> "%LOG%" 2>&1
if errorlevel 1 goto :err

echo === 4/5  Startup command + app settings NO secretas ===
call az webapp config set --resource-group %RG% --name %APP% --startup-file "npm run start:azure" >> "%LOG%" 2>&1
call az webapp config appsettings set --resource-group %RG% --name %APP% --settings ALLOW_SELF_APPROVAL=0 ALLOW_RESET=0 SCM_DO_BUILD_DURING_DEPLOYMENT=false WEBSITE_NODE_DEFAULT_VERSION=~20 >> "%LOG%" 2>&1
if errorlevel 1 goto :err

echo === 5/5  Publish profile -> publish-profile.xml ===
call az webapp deployment list-publishing-profiles --resource-group %RG% --name %APP% --xml > publish-profile.xml 2>> "%LOG%"
if errorlevel 1 goto :err

echo.
echo ===== LISTO. Infra creada. App: %APP% =====
echo Falta cargar las app settings SECRETAS y los secrets de GitHub (ver AZURE.md).
echo Detalle completo en: %LOG%
goto :fin

:err
echo.
echo *** FALLO un comando. Ultimas lineas del log: ***
powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 25"
echo (log completo en %LOG%)

:fin
echo.
pause
