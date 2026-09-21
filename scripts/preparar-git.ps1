# Registra en ESTE clon lo que `.gitattributes` no puede traer consigo.
#
# `.gitattributes` se versiona; `git config` no. Asi que la regla `merge=catalogo` del catalogo
# compilado esta en el repositorio, pero **el controlador que la implementa hay que darlo de alta
# en cada copia de trabajo**. Sin esto, git ignora la regla y `django.mo` vuelve a dar conflicto
# en cada fusion que toque textos — molesto, nunca peligroso.
#
# Correr una vez tras clonar:  pwsh -NoProfile -File scripts/preparar-git.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# `true` se queda con la version de la rama de destino y sale sin error, o sea: no hay conflicto.
#
# **No recompila desde el `.po`, y eso esta medido, no supuesto**: git fusiona los archivos por
# orden alfabetico y `django.mo` va antes que `django.po`, asi que cuando el controlador corre el
# `.po` todavia no esta fusionado. Recompilar ahi daria un `.mo` que no corresponde a ninguno de
# los dos lados, en silencio — peor que el conflicto que venia a quitar.
#
# Que el `.mo` quede al dia lo garantiza la prueba, no esto:
# `apps/core/tests/test_traducciones.py::test_el_binario_esta_al_dia_con_el_catalogo_entero`.
git config merge.catalogo.name "catalogo compilado: se queda con el destino y la prueba lo comprueba"
git config merge.catalogo.driver "true"

Write-Output "Listo: `merge=catalogo` registrado en este clon."
Write-Output "Tras resolver una fusion que toque textos, recompila el catalogo:"
Write-Output "  cd services/api; uv run python manage.py compilemessages -i .venv -i staticfiles"
