# Deja el servicio listo para correr: dependencias, migraciones y roles.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== dependencias ==" -ForegroundColor Cyan
uv sync

Write-Host "== migraciones ==" -ForegroundColor Cyan
uv run python manage.py migrate

Write-Host "== roles ==" -ForegroundColor Cyan
uv run python manage.py bootstrap_roles

Write-Host ""
Write-Host "Listo. **No hay auto-registro**: el primer usuario se crea a mano." -ForegroundColor Green
Write-Host "  uv run python manage.py createsuperuser"
Write-Host "  pwsh ./scripts/run.ps1"
