#!/usr/bin/env bash
# Actualizar AeroBim en la VM, entero o nada.
#
# ## Por qué existe
#
# Los pasos de «Actualizar» de `docs/DEPLOY.md` se tecleaban a mano, y son seis. **Un despliegue que
# se puede hacer a medias se hace a medias**: se olvida `bootstrap_roles` y un permiso nuevo no llega
# a ningún rol, o se olvida `collectstatic` y el visor sirve el JavaScript de la versión anterior.
# Ninguna de las dos cosas da error.
#
# `services/api/scripts/setup.ps1` no sirve aquí: es PowerShell, `pwsh` no viene en Ubuntu, y hace
# `uv sync` a secas —que instalaría pytest, ruff y bandit en el servidor—.
#
# ## Las dos cosas que lo hacen un guion y no una lista
#
# 1. **`set -euo pipefail`**: para al primer fallo. Sin eso, `migrate` puede fallar y el guion
#    seguiría hasta `systemctl restart`, dejando un servicio arrancado contra una base a medias.
# 2. **Termina comprobando `/health/`, y falla si no dice `ok`.** `systemctl restart` vuelve sin
#    error aunque los workers hayan muerto al cargar los ajustes: es la diferencia entre
#    «reiniciado» y «reiniciado y sirviendo», y es lo único que la distingue.
#
# ## Uso
#
#   sudo -u aerobim /opt/aerobim/services/api/deploy/desplegar.sh
#
# **Antes de correrlo, un respaldo a mano.** El de las 02:00 no sirve si el despliegue es a las
# 10:00, y las migraciones no se deshacen solas: si la versión nueva trae una destructiva, la vuelta
# atrás es restaurar el volcado.
set -euo pipefail

AEROBIM_HOME="${AEROBIM_HOME:-/opt/aerobim/services/api}"
RAIZ="$(cd "$AEROBIM_HOME/../.." && pwd)"
PYTHON="${AEROBIM_PYTHON:-$AEROBIM_HOME/.venv/bin/python}"
SALUD="${AEROBIM_SALUD:-http://127.0.0.1/health/}"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

paso "1/7 · el código"
git -C "$RAIZ" pull --ff-only
git -C "$RAIZ" log --oneline -1

paso "2/7 · el visor"
# `npm ci` y no `npm install`: instala exactamente lo que dice el `package-lock.json`. Y el
# `postbuild` recorta `dist/` a la lista blanca **y comprueba que no falte nada de lo que referencia**
# — es lo que impide que un archivo de obra quede descargable sin autenticar, que ya pasó.
( cd "$RAIZ" && npm ci && npm run build )

paso "3/7 · las dependencias de Python"
# `--no-default-groups` deja fuera `dev`: pytest, ruff y bandit no pintan nada en un servidor.
( cd "$AEROBIM_HOME" && uv sync --no-default-groups --group deploy )

cd "$AEROBIM_HOME"
export DJANGO_SETTINGS_MODULE=config.settings.prod

paso "4/7 · la base de datos"
"$PYTHON" manage.py migrate --noinput
echo "migraciones aplicadas: $("$PYTHON" manage.py showmigrations --plan | grep -c '^\[X\]')"

paso "5/7 · los roles"
# **Su propio docstring dice que se corre en cada despliegue**, y faltaba en la documentación. Sin
# esto, un permiso nuevo tras un `git pull` no llega a ningún rol: alguien no puede hacer su trabajo
# y no hay ningún error que lo diga.
"$PYTHON" manage.py bootstrap_roles

paso "6/7 · los estáticos y el catálogo"
"$PYTHON" manage.py collectstatic --noinput
# Los `-i` no son adorno: sin ellos recorre el árbol entero e intenta compilar los catálogos de
# Django que viven dentro del entorno virtual.
"$PYTHON" manage.py compilemessages -i .venv -i staticfiles

paso "7/7 · reiniciar y comprobar"
sudo systemctl restart aerobim
# Un momento para que los workers levanten: `Type=notify` hace que `restart` espere, pero el socket
# puede tardar un instante más en aceptar.
for i in $(seq 1 20); do
    respuesta="$(curl -s --max-time 5 "$SALUD" || true)"
    [ -n "$respuesta" ] && break
    sleep 1
done

echo "$respuesta" | python3 -m json.tool || true

case "$respuesta" in
*'"estado": "ok"'*)
    echo
    echo "OK: desplegado y sirviendo"
    ;;
*'"estado": "degradado"'*)
    echo
    echo "AVISO: sirve, pero degradado. Lo habitual es que el visor no esté construido (paso 2)." >&2
    exit 1
    ;;
*)
    echo
    echo "ERROR: /health/ no contesta 'ok'. Mira 'journalctl -u aerobim -n 50'." >&2
    exit 1
    ;;
esac
