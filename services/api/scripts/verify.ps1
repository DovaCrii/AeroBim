# El gate de `services/api`. Es lo mismo que corre AeroControl, y por lo mismo:
# `check --deploy` delata una configuracion insegura antes del despliegue, y
# `makemigrations --check` delata un modelo cambiado sin su migracion -- que es el
# error que se descubre cuando el servidor de produccion no arranca.
#
# **`$ErrorActionPreference` no basta.** Un ejecutable nativo que devuelve un codigo
# distinto de cero no dispara el manejo de errores de PowerShell: la primera version de
# este script imprimio "Gate en verde" con `ruff format` fallando. Un gate que miente es
# peor que no tener gate, asi que cada paso pasa por `Paso`, que mira `$LASTEXITCODE`.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Paso {
    param([string]$Nombre, [scriptblock]$Bloque)

    Write-Host "== $Nombre ==" -ForegroundColor Cyan
    & $Bloque
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FALLO en «$Nombre» (codigo $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Paso "check" { uv run python manage.py check }

Paso "check --deploy" {
    $env:DJANGO_SETTINGS_MODULE = "config.settings.prod"
    $env:SECRET_KEY = "solo-para-el-gate-nunca-en-produccion-xxxxxxxxxxxx"
    try {
        uv run python manage.py check --deploy
    } finally {
        Remove-Item Env:\DJANGO_SETTINGS_MODULE -ErrorAction SilentlyContinue
        Remove-Item Env:\SECRET_KEY -ErrorAction SilentlyContinue
    }
}

Paso "makemigrations --check" { uv run python manage.py makemigrations --check --dry-run }

# **Un `.mo` al dia tapa un `.po` roto.** `compilemessages` no recompila si el binario es mas
# nuevo que el catalogo, asi que un `.po` que msgfmt rechaza pasa desapercibido hasta el dia
# que alguien lo toca -- y eso paso: el catalogo llevaba una entrada con el `\n` inicial en el
# `msgid` y no en el `msgstr`, y el gate lo daba por bueno porque no lo compilaba nunca. Se
# borra el binario antes para que compile siempre, que es lo unico que lo comprueba.
Paso "compilemessages" {
    Get-ChildItem locale -Filter "*.mo" -Recurse | Remove-Item -Force
    uv run python manage.py compilemessages -i .venv -i staticfiles
}

Paso "pytest" { uv run pytest --cov }
Paso "ruff check" { uv run ruff check . }
Paso "ruff format" { uv run ruff format --check . }
# Las pruebas quedan fuera de bandit: `assert` es su herramienta y B101 lo marca en cada
# linea, o sea sesenta y ocho avisos de nada que enseñan a ignorar la salida entera.
Paso "bandit" { uv run bandit -q -r apps config -x "*/tests/*" }
Paso "pip-audit" { uv run pip-audit }

Write-Host "Gate en verde." -ForegroundColor Green
