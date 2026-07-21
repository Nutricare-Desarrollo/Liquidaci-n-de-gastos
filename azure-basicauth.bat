@echo off
setlocal
cd /d "%~dp0"
title Nutricare - habilitar basic auth y regenerar publish profile
set RG=rg-nutricare-liquidacion
set APP=nutricare-liquidacion

echo === Habilitando SCM Basic Auth (necesario para el publish profile) ===
call az resource update --resource-group %RG% --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --name scm --parent sites/%APP% --set properties.allow=true

echo.
echo === Regenerando publish-profile.xml ===
call az webapp deployment list-publishing-profiles --resource-group %RG% --name %APP% --xml > publish-profile.xml
if errorlevel 1 goto :err

echo.
echo ================= LISTO =================
echo Se genero publish-profile.xml (NUEVO).
echo Ahora actualiza el secret en GitHub:
echo   - GitHub ^> Settings ^> Secrets and variables ^> Actions
echo   - Editar AZUREAPPSERVICE_PUBLISHPROFILE y pegar TODO el contenido de publish-profile.xml
echo Despues: Actions ^> el run fallido ^> "Re-run jobs".
goto :fin
:err
echo *** Fallo. Revisa el mensaje de arriba. ***
:fin
echo.
pause
