@echo off
setlocal
cd /d "%~dp0"
title Nutricare - App Service para compañero (entorno separado)
set LOG=azure-setup-colega.log
echo Nutricare Azure setup COLEGA - %date% %time% > "%LOG%"

REM Segundo App Service, AISLADO del tuyo. Reusa el mismo grupo y plan para ahorrar,
REM pero podes cambiarlos. NO comparte base: la BD se configura aparte (ver ENTORNO-NUEVO.md).
set RG=rg-nutricare-liquidacion
set LOCATION=centralus
set PLAN=plan-nutricare-liquidacion
set APP=nutricare-liquidacion-dev
set RUNTIME=NODE:22-lts

echo === Suscripcion activa ===
call az account show --query "{Suscripcion:name, id:id}" -o table

echo === App Service '%APP%' (Node 22) ===
call az webapp create --resource-group %RG% --plan %PLAN% --name %APP% --runtime "%RUNTIME%" >> "%LOG%" 2>&1
if errorlevel 1 goto :err

echo === Startup + basic auth + settings NO secretas ===
call az webapp config set -g %RG% -n %APP% --startup-file "npm run start:azure" >> "%LOG%" 2>&1
call az resource update -g %RG% --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --name scm --parent sites/%APP% --set properties.allow=true >> "%LOG%" 2>&1
call az webapp config appsettings set -g %RG% -n %APP% --settings ALLOW_SELF_APPROVAL=1 ALLOW_RESET=1 SCM_DO_BUILD_DURING_DEPLOYMENT=false WEBSITE_NODE_DEFAULT_VERSION=~22 >> "%LOG%" 2>&1

echo === Publish profile -> publish-profile-colega.xml ===
call az webapp deployment list-publishing-profiles -g %RG% -n %APP% --xml > publish-profile-colega.xml 2>> "%LOG%"

echo.
echo ===== LISTO. App: %APP% =====
echo URL: https://%APP%.azurewebsites.net
echo Falta: cargar la DATABASE_URL NUEVA y demas app settings secretas (ver ENTORNO-NUEVO.md).
goto :fin
:err
echo *** Fallo. Ultimas lineas del log: ***
powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 20"
:fin
echo.
pause
