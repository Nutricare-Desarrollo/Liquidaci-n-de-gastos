# Carga las app settings del App Service leyendo tu .env LOCAL.
# Uso (en PowerShell, dentro de la carpeta del proyecto):
#   .\azure-appsettings.ps1
# Requiere: az login hecho. El .env NO se sube al repo (esta en .gitignore).

$ErrorActionPreference = "Stop"
$RG  = "rg-nutricare-liquidacion"
$APP = "nutricare-liquidacion"
$envFile = ".env"

if (!(Test-Path $envFile)) { Write-Error "No encuentro $envFile en esta carpeta."; exit 1 }

# Claves que NO deben ir a Azure (las maneja App Service o son de dev).
$excluir = @("PORT","DEMO_MODE")

$settings = @()
foreach ($line in Get-Content $envFile) {
  $l = $line.Trim()
  if ($l -eq "" -or $l.StartsWith("#")) { continue }
  $i = $l.IndexOf("=")
  if ($i -lt 1) { continue }
  $k = $l.Substring(0, $i).Trim()
  $v = $l.Substring($i + 1).Trim()
  if ($excluir -contains $k) { continue }
  if ($v -eq "") { continue }
  $settings += "$k=$v"
}

# Endurecimiento de produccion (sobreescribe lo que venga del .env).
$settings += "ALLOW_SELF_APPROVAL=0"
$settings += "ALLOW_RESET=0"
$settings += "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
$settings += "WEBSITE_NODE_DEFAULT_VERSION=~22"

Write-Host "Cargando $($settings.Count) app settings en $APP ..." -ForegroundColor Cyan
# Mostrar solo las claves (no los valores) para verificar.
$settings | ForEach-Object { ($_ -split "=",2)[0] } | Sort-Object | ForEach-Object { Write-Host "  - $_" }

az webapp config appsettings set -g $RG -n $APP --settings $settings | Out-Null
Write-Host "Listo. App settings aplicadas." -ForegroundColor Green
