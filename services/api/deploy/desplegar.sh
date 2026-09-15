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
# **A dónde se le pregunta a la aplicación si está viva.**
#
# El puerto es de cada instalación: el `nginx-aerobim.conf` versionado escucha en 443, y en `p340`
# no puede —AeroControl lo tiene— así que ahí es 8002. Por eso es una variable y no una constante.
SALUD="${AEROBIM_SALUD:-http://127.0.0.1:8002/health/}"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

paso "0/7 · los vecinos"
# **AeroBim no es el único inquilino de `p340`.** Casi nada suyo puede chocar —habla por un socket,
# no por un puerto, y todo lleva su nombre—, pero un `default_server` duplicado en nginx tumba a
# los tres servicios a la vez. Se mira antes de tocar nada, y **no aborta**: en una actualización
# los avisos son normales, y el guion de comprobación distingue lo que bloquea de lo que no.
#
# **El guardián iba detrás de un `[ -x ]`, y eso lo apagaba en silencio.** Medido en `p340` el
# 2026-09-15: los dos guiones estaban en el repositorio con modo `100644` —sin el bit de ejecución,
# que git sí guardaba para `respaldo.sh`— así que `-x` daba falso y **esta comprobación no se corrió
# ni una sola vez**. La que protege a AeroControl y a AeroConvert, desactivada por un bit, sin decir
# nada. Se arregla el modo en el repositorio *y* se deja de depender de él: `-f` y `bash` explícito,
# porque un permiso perdido no puede volver a apagar una comprobación de seguridad.
if [ -f "$AEROBIM_HOME/deploy/comprobar-vecinos.sh" ]; then
  bash "$AEROBIM_HOME/deploy/comprobar-vecinos.sh" \
    || echo "  (sigue adelante: esto es una actualización)"
else
  echo "AVISO: no está comprobar-vecinos.sh; se despliega sin mirar a los otros servicios" >&2
fi

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
#
# **La cabecera no es adorno: sin ella la comprobación no puede pasar nunca.**
#
# `prod.py` sirve `SECURE_SSL_REDIRECT=True`, así que a una petición que llega en claro Django le
# contesta **301 a https** — y un `curl -s` de un 301 imprime una respuesta **vacía**. O sea que el
# guion terminaba con el mensaje genérico de «`/health/` no contesta ok» sobre un servicio que
# estaba perfectamente sano, y mandaba a mirar el `journalctl` por nada. Visto en `p340` el
# 2026-09-15: `curl -s http://127.0.0.1:8002/health/` no imprimió ni una letra.
#
# `X-Forwarded-Proto: https` es exactamente lo que pone nginx delante, y lo que
# `SECURE_PROXY_SSL_HEADER` lee. O sea: se pregunta igual que se pregunta de verdad.
#
# `-L` no sirve como alternativa: el redirect apunta a `https://127.0.0.1`, que no tiene
# certificado para ese nombre.
for i in $(seq 1 20); do
    respuesta="$(curl -s --max-time 5 -H 'X-Forwarded-Proto: https' "$SALUD" || true)"
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
"")
    # **Vacío no es lo mismo que enfermo, y decirlo igual manda a buscar donde no es.** Si nadie
    # contesta en `$SALUD`, lo primero que falla es la dirección: el puerto de nginx es de cada
    # instalación. Se nombra la variable, que es lo accionable.
    echo
    echo "ERROR: nadie contesta en $SALUD." >&2
    echo "  Si nginx escucha en otro puerto, dilo:" >&2
    echo "    sudo -u aerobim env AEROBIM_SALUD=http://127.0.0.1:PUERTO/health/ $0" >&2
    echo "  Y si la dirección es la buena, mira 'journalctl -u aerobim -n 50'." >&2
    exit 1
    ;;
*)
    echo
    echo "ERROR: /health/ contesta, pero no dice 'ok'. Mira 'journalctl -u aerobim -n 50'." >&2
    exit 1
    ;;
esac
