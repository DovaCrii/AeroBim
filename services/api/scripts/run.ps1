# Levanta el servicio en desarrollo.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

uv run python manage.py runserver 127.0.0.1:8000
