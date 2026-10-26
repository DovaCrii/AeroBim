# Que falta subir a la VM p340 y los comandos JUSTOS. (Adaptado de AeroControl.)
#   pwsh .claude/skills/terminar-bloques/scripts/deploy_plan.ps1 -From <hash que corre la VM>
# Compara lo que corre la VM con origin/main, clasifica los archivos y dicta los dos comandos de
# docs/DEPLOY.md (respaldo.sh y desplegar.sh). El guion de despliegue ya hace migrate, roles, estaticos,
# build del visor y la comprobacion de /health/: aqui solo se AVISA de lo que lleva y de lo que NO toca.
param(
    [Parameter(Mandatory)][string]$From,
    [string]$To = "origin/main"
)
$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel)
git fetch origin | Out-Null
git cat-file -e "$From^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw "El hash '$From' no existe aqui: pedir a la VM 'git log --oneline -1' de nuevo." }
$target = (git rev-parse --short $To).Trim()
if ((git rev-parse $From) -eq (git rev-parse $To)) { "La VM ya corre ${target}: no hay nada que subir."; exit 0 }
if ((git merge-base $From $To).Trim() -ne (git rev-parse $From).Trim()) {
    throw "La VM ($From) NO es ancestro de ${To}: no es un avance directo. Parar y revisar."
}

$files = @(git diff --name-only "$From..$To")
$hit = { param($p) @($files | Where-Object { $_ -match $p }) }
$migrations = & $hit '^services/api/apps/[^/]+/migrations/.+\.py$'
$visor = & $hit '^(apps/web/|packages/)'
$deps = & $hit '^(services/api/(pyproject\.toml|uv\.lock)|package(-lock)?\.json)$'
$nginx = & $hit '^services/api/deploy/nginx'
$unidades = & $hit '^services/api/deploy/.*\.(service|timer|socket)$'
$entorno = & $hit '^(services/api/config/settings/|docs/DEPLOY\.md)'

"=== QUE FALTA SUBIR: $From -> $target ($($files.Count) archivos)"
git log --oneline "$From..$To"
""
"Lleva:  migraciones=$($migrations.Count)  visor=$($visor.Count)  dependencias=$($deps.Count)"
$migrations | ForEach-Object { "   migracion: $_" }
if ($nginx.Count -gt 0) { "   AVISO: cambio de nginx -> desplegar.sh NO toca /etc/nginx: llevarlo a mano (docs/DEPLOY.md, 'Lo que el guion no toca')." }
if ($unidades.Count -gt 0) { "   AVISO: cambian unidades o timers de systemd -> volver a instalarlas a mano (docs/DEPLOY.md)." }
if ($entorno.Count -gt 0) { "   AVISO: cambian ajustes o docs/DEPLOY.md -> mirar si hay variables nuevas en el .env de la VM (la CLAVE solo alli, nunca en el chat)." }
""
"=== COMANDOS (en la VM; sudo pide la contrasena del usuario; pegar la salida final)"
""
"--- 1. Respaldo (siempre; 'respaldo en /var/backups/aerobim/...' y 'OK' en los dos)"
'sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh'
""
"--- 2. Despliegue (debe terminar en  OK: desplegado y sirviendo  y en el hash $target)"
'sudo -u aerobim /opt/aerobim/services/api/deploy/desplegar.sh'
""
"Despues: Ctrl+F5 en el navegador. Solo cuenta como llegado el hash $target en la linea de git del guion."
