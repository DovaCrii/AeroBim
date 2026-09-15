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
# 5. **El cortafuegos.** `docs/DEPLOY.md` manda `ufw default deny incoming` + `ufw enable`, y en una
#    máquina compartida **ese es el comando más peligroso de todo el procedimiento**: puede cortar
#    a los vecinos y, si tu SSH no entra por `tailscale0`, **te deja fuera de la VM en el acto**.
# 6. **La versión de Node.** El procedimiento instala NodeSource 22, que **sustituye el `nodejs` de
#    toda la máquina**. Si AeroConvert depende del que hay, se lo cambiamos sin avisar.
# 7. **Quién más escucha, y qué hay en `sites-enabled`.** No para decidir nada: para que quien
#    despliega vea a sus vecinos antes de tocar, que es lo que evita la mitad de los accidentes.
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

titulo "7 · el cortafuegos (lo más peligroso del procedimiento)"
# **`ufw enable` con `default deny incoming` corta todo lo que no venga por `tailscale0`.**
#
# Dos consecuencias, y la segunda te deja sin poder arreglar la primera:
#
# 1. Si AeroControl o AeroConvert se alcanzan por otra interfaz, dejan de alcanzarse.
# 2. **Si tu propio SSH no entra por `tailscale0`, pierdes la sesión en el acto** y con ufw ya
#    activo no hay por dónde volver salvo la consola del hipervisor.
if ! command -v ufw >/dev/null 2>&1; then
  ojo "ufw no está instalado: el paso del cortafuegos de \`DEPLOY.md\` no aplica tal cual"
else
  estado=$(ufw status 2>/dev/null | head -1)
  printf '   %s\n' "$estado"
  # Por dónde entra esta misma sesión de SSH. `SSH_CONNECTION` trae la IP del servidor que se usó.
  mia=$(printf '%s' "${SSH_CONNECTION:-}" | awk '{print $3}')
  if [ -z "$mia" ]; then
    ojo "no se pudo leer SSH_CONNECTION (¿sudo sin -E, o no es una sesión SSH?): comprueba a mano"
  else
    iface=$(ip -o route get "$mia" 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p')
    if [ "$iface" = "tailscale0" ]; then
      bien "tu SSH entra por \`tailscale0\` ($mia): \`ufw allow in on tailscale0\` no te echa"
    else
      mal "tu SSH entra por \`${iface:-?}\` ($mia), NO por tailscale0"
      printf '     → \`ufw enable\` con la regla de DEPLOY.md **te deja fuera de la VM**.\n'
      printf '     → Antes: sudo ufw allow in on %s to any port 22 proto tcp\n' "${iface:-eth0}"
    fi
  fi
  if printf '%s' "$estado" | grep -qi inactive; then
    ojo "ufw está inactivo: activarlo cambia el acceso de TODA la máquina, no solo el de AeroBim"
    printf '     → Con vecinos, lo prudente es **no activarlo** y dejar el cortafuegos como está.\n'
    printf '       AeroBim no lo necesita para funcionar: nginx solo sirve su \`server_name\`.\n'
  fi
fi

titulo "8 · Node, que el procedimiento cambia para toda la máquina"
# NodeSource **sustituye el paquete `nodejs` del sistema**. Si un vecino depende del que hay, se lo
# cambiamos sin avisarle. Y AeroBim no necesita Node en la VM: el visor se puede construir aquí y
# copiar `apps/web/dist`, que es lo único que se sirve.
if ! command -v node >/dev/null 2>&1; then
  bien "no hay Node instalado: NodeSource no le quita nada a nadie"
else
  version=$(node -v)
  mayor=$(printf '%s' "$version" | sed 's/^v\([0-9]*\).*/\1/')
  duenio=$(dpkg -S "$(command -v node)" 2>/dev/null | cut -d: -f1 || echo '?')
  if [ "${mayor:-0}" -ge 22 ]; then
    bien "Node $version (paquete: $duenio): sirve para construir el visor, no hay que tocarlo"
  else
    mal "Node $version (paquete: $duenio) y el visor necesita 22+"
    printf '     → NodeSource **sustituiría el Node de toda la máquina**. Si AeroConvert usa este,\n'
    printf '       pregúntale antes. La alternativa sin riesgo: construir el visor fuera y copiar\n'
    printf '       \`apps/web/dist\` a la VM — Node no hace falta para servirlo.\n'
  fi
fi

titulo "9 · los vecinos, para verlos antes de tocar"
# No decide nada: es para que quien despliega sepa con quién comparte la máquina. La mitad de los
# accidentes de un despliegue compartido son por no haber mirado esto.
if command -v ss >/dev/null 2>&1; then
  printf '   Escuchando:\n'
  ss -tlnp 2>/dev/null | awk 'NR>1 {printf "     %-24s %s\n", $4, $6}' | sort -u | head -20
fi
if [ -d /etc/nginx/sites-enabled ]; then
  printf '   Sitios de nginx habilitados:\n'
  for sitio in /etc/nginx/sites-enabled/*; do
    [ -e "$sitio" ] || continue
    nombres=$(grep -hE '^\s*server_name' "$sitio" 2>/dev/null | tr -s ' ' | paste -sd' ' -)
    printf '     %-28s %s\n' "$(basename "$sitio")" "${nombres:-（sin server_name）}"
  done
  # **`DEPLOY.md` manda borrar `sites-enabled/default`, y en una máquina compartida eso hay que
  # mirarlo antes**: si un vecino metió su configuración dentro de ese archivo en vez de crear el
  # suyo, borrarlo lo deja sin servir.
  if [ -e /etc/nginx/sites-enabled/default ]; then
    lineas=$(grep -cvE '^\s*(#|$)' /etc/nginx/sites-enabled/default 2>/dev/null || echo 0)
    if [ "$lineas" -gt 25 ]; then
      mal "\`sites-enabled/default\` tiene $lineas líneas con contenido: NO lo borres sin mirarlo"
      printf '     → \`DEPLOY.md\` manda \`rm -f\`. Si alguien puso ahí su sitio, lo dejas sin servir.\n'
    else
      bien "\`sites-enabled/default\` parece el de fábrica ($lineas líneas): borrarlo no quita nada"
    fi
  fi
fi

titulo "10 · zona horaria"
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
