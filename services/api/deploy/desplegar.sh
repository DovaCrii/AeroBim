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

#
# **¿Vamos a poder reiniciar al final? Se pregunta ahora, no dentro de tres minutos.**
#
# Medido en `p340` el 2026-09-15: el guion corre como `aerobim` —así lo manda el procedimiento—,
# hizo los seis pasos enteros, y en el séptimo contestó:
#
#     sudo: I'm sorry aerobim. I'm afraid I can't do that
#
# O sea que reconstruyó el visor, migró, recogió los estáticos y **dejó el servicio corriendo con la
# versión anterior**, después de tres minutos de trabajo y con un mensaje que no dice qué hacer.
#
# `sudo -n` no pide contraseña ni cuelga esperándola. Se avisa aquí y se decide en el paso 7: no se
# aborta, porque los seis pasos de en medio sirven igual y rehacerlos después es peor.
#
# ## Y se pregunta por **este** comando, no por «¿puedes sudo?»
#
# La primera versión probaba `sudo -n true`, que es «¿puedes ejecutar cualquier cosa como root?».
# Medido en `p340` el 2026-09-16, y el caso es el que la propia guía recomienda: se instaló el
# permiso **acotado** —solo `systemctl restart aerobim.service`, que es lo correcto y lo que decía
# el mensaje de este guion— y la comprobación **siguió diciendo que no se podía reiniciar**.
#
# O sea que la prueba castigaba justo a quien hace lo seguro, y premiaba a quien le da sudo entero
# al usuario del servicio. Un guardián que empuja hacia el permiso ancho está al revés.
#
# `sudo -l <comando>` contesta por el comando exacto —sale 0 si está permitido— y con `-n` no pide
# nada. Es la pregunta que de verdad importa.
REINICIO=(/usr/bin/systemctl restart aerobim.service)
if sudo -n -l "${REINICIO[@]}" >/dev/null 2>&1; then
    PUEDE_REINICIAR=1
else
    PUEDE_REINICIAR=0
    echo "AVISO: este usuario no puede reiniciar servicios; el paso 7 te dirá qué escribir." >&2
fi

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
#
# **Si no se puede reiniciar, se para aquí y no se comprueba la salud.**
#
# Y eso es lo importante: `/health/` contestaría `ok` —el proceso viejo está sano— así que el guion
# terminaría diciendo «OK: desplegado y sirviendo» sobre una versión que no es la que se acaba de
# construir. Un oráculo que confirma lo que no ha pasado es peor que no tenerlo.
if [ "$PUEDE_REINICIAR" = "0" ]; then
    echo
    # ══════════════════════════════════════════════════════════════════════════════════════
    # **Esto no es «falta un paso»: el sitio está roto AHORA MISMO.**
    #
    # Lo decía como si fuera un estado a medias benigno —«el código está al día, falta
    # reiniciar»— y no lo es. Django lee las plantillas **del disco en cada petición**, así que
    # los seis pasos anteriores ya pusieron las nuevas delante del proceso viejo. Una plantilla
    # que nombra una ruta que ese proceso todavía no conoce revienta con `NoReverseMatch`.
    #
    # Medido en `p340` el 2026-09-16: `usuarios_roles.html` pasó a enlazar
    # `accounts:editar-cuenta`, el servicio no se reinició, y la pantalla entera devolvió **500**
    # a quien ya estaba dentro. El guion había terminado diciendo algo que sonaba tranquilo.
    #
    # Así que el mensaje lo dice primero y con todas las letras. Quien lee esto tiene minutos,
    # no horas.
    # ══════════════════════════════════════════════════════════════════════════════════════
    echo "  ██ ATENCIÓN: AeroBim está ROTO hasta que reinicies." >&2
    echo >&2
    echo "El código nuevo está en disco y el proceso sigue con el viejo. Django lee las" >&2
    echo "plantillas en cada petición, así que las pantallas que estrena esta versión" >&2
    echo "responden 500 a quien ya está dentro. No es «falta un paso»: hay que darlo ya." >&2
    echo >&2
    echo "Este usuario no puede reiniciar. Sal de este guion y escribe:" >&2
    echo >&2
    echo "    sudo systemctl restart aerobim.service && sleep 4 && curl -s $SALUD" >&2
    echo >&2
    echo "Tiene que contestar '\"estado\": \"ok\"'." >&2
    echo >&2
    echo "Para que el guion lo haga solo, una vez y como root:" >&2
    echo "    echo 'aerobim ALL=(root) NOPASSWD: /usr/bin/systemctl restart aerobim.service' \\" >&2
    echo "      | sudo tee /etc/sudoers.d/aerobim-reinicio && sudo chmod 440 /etc/sudoers.d/aerobim-reinicio" >&2
    exit 1
fi

# **La misma línea que se comprobó arriba, carácter por carácter.** `sudo -l` autoriza por el
# comando exacto: con `sudo systemctl restart aerobim` —sin la ruta y sin el `.service`— la
# comprobación diría que sí y el reinicio pediría la contraseña igualmente.
sudo -n "${REINICIO[@]}"
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
