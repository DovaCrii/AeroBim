#!/usr/bin/env bash
# ¿Puede AeroBim instalarse en esta máquina sin romper lo que ya hay?
#
#   sudo /opt/aerobim/services/api/deploy/comprobar-vecinos.sh
#
# ## Por qué existe
#
# `p340` no es una máquina vacía: AeroControl y AeroConvert ya viven ahí. Casi nada de AeroBim
# puede chocar con ellos —gunicorn habla por el socket `/run/aerobim.sock` y no por un puerto, y
# todo lo suyo va bajo el nombre `aerobim`— pero **hay tres cosas que son exclusivas de la máquina
# y una de ellas tumba los tres servicios a la vez**.
#
# Este guion las mira **antes** de tocar nada y **no cambia nada**: solo mira y contesta. Un
# despliegue que descubre el choque a mitad deja a los vecinos caídos mientras se investiga.
#
# ## Lo que comprueba, y por qué cada cosa
#
# 1. **`default_server` en el 443.** Solo lo puede declarar un sitio en toda la máquina. Con dos,
#    `nginx -t` falla con «a duplicate default server» y **nginx entero no arranca**, así que
#    AeroConvert se cae con AeroBim. Es el único fallo de esta lista que es mutuo.
# 2. **El nombre del certificado ya servido por otro sitio.** Dos bloques con el mismo
#    `server_name` en el mismo puerto: nginx avisa y **sirve el primero que lea**, o sea que qué
#    servicio contesta depende del orden alfabético de `sites-enabled`. Arranca sin error.
# 3. **El socket, el usuario, las rutas y las unidades de systemd.** Si algo de eso ya existe y no
#    es de AeroBim, lo que hay es otro AeroBim a medio instalar o un nombre reutilizado.
# 4. **Espacio en disco.** El respaldo guarda 14 juegos con la base **y los documentos sin
#    comprimir**; con el COPC de 124 MB dentro, eso crece rápido. `docs/OPERACION.md`, R2.
#
# Devuelve 0 si se puede instalar, 1 si hay algo que decidir primero.
set -uo pipefail

ROJO=$'\033[31m'; AMBAR=$'\033[33m'; VERDE=$'\033[32m'; FIN=$'\033[0m'
problemas=0
avisos=0

mal()   { printf '%s ✗ %s%s\n' "$ROJO" "$1" "$FIN"; problemas=$((problemas + 1)); }
ojo()   { printf '%s ! %s%s\n' "$AMBAR" "$1" "$FIN"; avisos=$((avisos + 1)); }
bien()  { printf '%s ✓ %s%s\n' "$VERDE" "$1" "$FIN"; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

titulo "1 · nginx: el servidor por defecto del 443"
# Se mira en `sites-enabled` y en `conf.d`, que son los dos sitios desde donde se incluye algo.
# **Se excluyen los archivos de AeroBim**: encontrarse a uno mismo no es un choque, y sin esto
# volver a correr el guion después de instalar daría un falso positivo.
if ! command -v nginx >/dev/null 2>&1; then
  ojo "nginx no está instalado todavía: nada que comprobar aquí"
else
  ajenos=$(grep -rlE 'listen[^;]*\bdefault_server\b' \
             /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null \
           | grep -v 'aerobim' || true)
  if [ -n "$ajenos" ]; then
    mal "ya hay un \`default_server\` y no es nuestro:"
    printf '     %s\n' $ajenos
    printf '     → NO instales \`nginx-aerobim-default.conf\`. AeroBim funciona sin él;\n'
    printf '       lo único que se pierde es cerrar el escaneo por IP, que ya cierra el otro.\n'
  else
    bien "el 443 no tiene servidor por defecto: se puede instalar el nuestro"
  fi

  titulo "2 · nginx: el nombre que vamos a servir"
  # El FQDN sale de la propia máquina para no depender de que alguien lo teclee bien.
  fqdn=""
  if command -v tailscale >/dev/null 2>&1; then
    fqdn=$(tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName" *: *"\([^"]*\)\..*/\1/p' | head -1)
  fi
  if [ -z "$fqdn" ]; then
    ojo "no se pudo leer el nombre de MagicDNS (¿tailscale sin levantar?): comprueba a mano"
  else
    repes=$(grep -rl "server_name.*$fqdn" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null \
            | grep -v 'aerobim' || true)
    if [ -n "$repes" ]; then
      mal "otro sitio ya sirve «$fqdn»: nginx arrancaría y contestaría el que lea primero"
      printf '     %s\n' $repes
    else
      bien "«$fqdn» no lo sirve nadie más"
    fi
  fi
fi

titulo "3 · lo que lleva nuestro nombre"
for ruta in /run/aerobim.sock /opt/aerobim /var/lib/aerobim /var/log/aerobim /var/backups/aerobim; do
  if [ -e "$ruta" ]; then
    duenio=$(stat -c '%U' "$ruta" 2>/dev/null || echo '?')
    if [ "$duenio" = "aerobim" ] || [ "$duenio" = "root" ]; then
      bien "$ruta existe y es de \`$duenio\` (una instalación anterior)"
    else
      mal "$ruta existe y es de \`$duenio\`: alguien más usa este nombre"
    fi
  fi
done

if id aerobim >/dev/null 2>&1; then
  bien "el usuario \`aerobim\` ya existe"
else
  bien "el usuario \`aerobim\` no existe todavía: se creará"
fi

titulo "4 · unidades de systemd"
# **Se pregunta por el nombre exacto y no por un patrón.** `aerobim*` cazaría también las de otro
# producto que empiece igual, y aquí un falso positivo hace abortar una instalación correcta.
#
# **Y el recuento es propio de esta sección y no el global.** Lo era, y la sección salía muda en
# cuanto cualquier comprobación anterior dejaba un aviso: se vio corriendo el guion en un WSL
# —secciones 1 a 3 en verde, la 4 en blanco— y leer una sección vacía es peor que no tenerla,
# porque no se sabe si no comprobó nada o si no encontró nada.
instaladas=0
for unidad in aerobim.service aerobim.socket aerobim-resumen.timer aerobim-respaldo.timer \
              aerobim-mantenimiento.timer aerobim-certificado.timer; do
  if systemctl list-unit-files "$unidad" 2>/dev/null | grep -q "^$unidad"; then
    ojo "$unidad ya está instalada: esto es una actualización, no una instalación"
    instaladas=$((instaladas + 1))
  fi
done
[ "$instaladas" -eq 0 ] && bien "ninguna unidad nuestra instalada: instalación limpia"

titulo "5 · PostgreSQL"
if command -v psql >/dev/null 2>&1; then
  if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='aerobim'" 2>/dev/null | grep -q 1; then
    ojo "el rol \`aerobim\` ya existe en PostgreSQL"
    if ! sudo -u postgres psql -tAc "select rolcreatedb from pg_roles where rolname='aerobim'" 2>/dev/null | grep -q t; then
      mal "…y le falta CREATEDB: \`respaldo.sh --verificar\` no podrá crear su base temporal"
      printf "     → sudo -u postgres psql -c 'ALTER ROLE aerobim CREATEDB;'\n"
    fi
  else
    bien "el rol \`aerobim\` no existe todavía: se creará"
  fi
else
  ojo "PostgreSQL no está instalado todavía"
fi

titulo "6 · disco"
libres=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
if [ -n "$libres" ]; then
  if [ "$libres" -lt 20 ]; then
    mal "quedan ${libres} GB en \`/\`: el respaldo guarda 14 juegos con los documentos sin comprimir"
  else
    bien "quedan ${libres} GB en \`/\` (anota este número: es la línea base)"
  fi
fi

titulo "7 · zona horaria"
zona=$(timedatectl show -p Timezone --value 2>/dev/null || echo '?')
if [ "$zona" = "America/Santiago" ]; then
  bien "$zona"
else
  mal "la zona es \`$zona\`: el resumen de las 07:30 se dispararía a otra hora"
  printf '     → sudo timedatectl set-timezone America/Santiago\n'
fi

printf '\n'
if [ "$problemas" -gt 0 ]; then
  printf '%s%s cosa(s) que decidir antes de instalar.%s\n' "$ROJO" "$problemas" "$FIN"
  exit 1
fi
printf '%sSe puede instalar.%s' "$VERDE" "$FIN"
[ "$avisos" -gt 0 ] && printf ' (%s aviso(s) arriba, ninguno bloquea.)' "$avisos"
printf '\n'
exit 0
