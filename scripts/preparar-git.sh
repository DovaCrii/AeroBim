#!/usr/bin/env bash
# El mismo alta que `preparar-git.ps1`, para Linux y macOS. Ver alli el porque completo.
#
# Correr una vez tras clonar:  bash scripts/preparar-git.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# `true` se queda con la version de la rama de destino y sale sin error: no hay conflicto.
#
# **No recompila desde el `.po`, y esta medido**: git fusiona por orden alfabetico y `django.mo`
# va antes que `django.po`, asi que ahi el `.po` todavia no esta fusionado. Que el `.mo` quede al
# dia lo garantiza `test_el_binario_esta_al_dia_con_el_catalogo_entero`, no este controlador.
git config merge.catalogo.name "catalogo compilado: se queda con el destino y la prueba lo comprueba"
git config merge.catalogo.driver "true"

echo "Listo: merge=catalogo registrado en este clon."
echo "Tras resolver una fusion que toque textos, recompila el catalogo:"
echo "  cd services/api && uv run python manage.py compilemessages -i .venv -i staticfiles"
