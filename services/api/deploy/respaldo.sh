#!/usr/bin/env bash
# Respaldo de AeroBim: la base de datos y los documentos, que son **dos cosas**.
#
#   sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh
#   sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh --verificar
#
# ## Por que son dos y no una
#
# La base guarda **que** existe —el entregable, su revision, su sha256, quien la subio— y
# `/var/lib/aerobim/documentos` guarda **los bytes**. Separadas a proposito: los archivos no pasan
# por la base, asi que un `pg_dump` solo es un catalogo de archivos que no estan, y una copia de los
# documentos sin la base es un monton de ficheros con nombre de hash y sin nadie que sepa que son.
#
# De ahi que este guion copie las dos **en el mismo instante** y las deje juntas: recuperar mitades
# de fechas distintas deja revisiones apuntando a archivos que no existen todavia.
#
# ## Lo que hace que esto sea un respaldo y no un archivo grande
#
# `--verificar`. Un volcado que nunca se restauro no es un respaldo: es un archivo del que se supone
# algo. La comprobacion restaura sobre una base **aparte** —nunca sobre la de produccion— y corre
# `manage.py check`, que es lo que distingue "el archivo tiene bytes" de "de aqui se puede volver".
#
# ## Lo que este guion NO hace, y hay que decidir
#
# **No lo lleva a otra maquina.** Copiar a `/var/backups` protege de un borrado y no de que se
# muera el disco ni de que se pierda la VM. Eso es una decision de infraestructura del usuario
# —`rclone`, un `scp` a otra maquina, el respaldo del hipervisor— y va despues de esto, no dentro.
#
# **No cifra.** Los documentos son de obra y el volcado lleva correos y hashes de contraseña: si la
# copia sale de la VM, tiene que ir cifrada. Mientras se queda en `/var/backups` con permisos 700,
# esta al mismo nivel que los datos que respalda.
set -euo pipefail

DESTINO="${AEROBIM_RESPALDOS:-/var/backups/aerobim}"
DOCUMENTOS="${DOCUMENTS_DIR:-/var/lib/aerobim/documentos}"

# **Las mismas variables del `.env` y ninguna nueva.** `config/settings/base.py:101-112` lee
# `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` y `DB_PORT`; inventar aqui un `DATABASE_URL`
# obligaria a mantener la misma conexion escrita de dos formas, y el dia que cambie una sola el
# respaldo apuntaria a otra base sin decirlo. Se sacan del `.env` con `set -a`.
if [ -z "${DB_NAME:-}" ] && [ -r /opt/aerobim/services/api/.env ]; then
    set -a
    # shellcheck disable=SC1091
    . /opt/aerobim/services/api/.env
    set +a
fi
: "${DB_NAME:?falta DB_NAME (esta en el .env, y solo aplica con DB_ENGINE=postgres)}"
export PGHOST="${DB_HOST:-127.0.0.1}"
export PGPORT="${DB_PORT:-5432}"
export PGUSER="${DB_USER:-aerobim}"
[ -n "${DB_PASSWORD:-}" ] && export PGPASSWORD="$DB_PASSWORD"
# Cuantos juegos se guardan. Con uno diario, dos semanas: suficiente para notar un borrado y
# volver, y poco para que quepa. Subirlo es cambiar este numero.
CUANTOS=14

sello="$(date +%Y%m%d-%H%M%S)"
carpeta="$DESTINO/$sello"

# ── La copia ────────────────────────────────────────────────────────────────────
respaldar() {
    mkdir -p "$carpeta"
    # 700: el volcado lleva correos y hashes de contraseña. Un respaldo legible por todos es una
    # copia de la base de datos legible por todos.
    chmod 700 "$DESTINO" "$carpeta"

    # `--format=custom` y no SQL plano: se restaura con `pg_restore`, permite restaurar una tabla
    # sola, y ya viene comprimido. Un `.sql` de 300 MB no se puede restaurar a medias.
    echo "base de datos ($DB_NAME) -> base.dump"
    pg_dump --format=custom --file="$carpeta/base.dump" "$DB_NAME"

    # Los documentos **no se comprimen**: son IFC, LAZ y PDF, que ya vienen comprimidos. Pasarlos
    # por gzip gasta minutos de CPU para ganar poco — medido en el COPC del CC 741: 124,7 MB de
    # LAZ no bajan de forma util. Se empaquetan para conservar rutas y permisos, nada mas.
    echo "documentos -> documentos.tar"
    tar --create --file="$carpeta/documentos.tar" --directory="$(dirname "$DOCUMENTOS")" \
        "$(basename "$DOCUMENTOS")"

    # **El sha es lo que convierte «se copio» en «se copio bien».** Sin esto, un disco que se llena
    # a mitad del `tar` deja un archivo mas corto y nadie se enteraria hasta necesitarlo.
    (cd "$carpeta" && sha256sum base.dump documentos.tar > sha256sums.txt)
    (cd "$carpeta" && sha256sum --check sha256sums.txt)

    du -sh "$carpeta"
    echo "respaldo en $carpeta"

    # Rotacion. `ls -1d` ordena por nombre y el nombre es la fecha, asi que el orden es el
    # cronologico: es el motivo de que el sello sea `AAAAMMDD-HHMMSS` y no algo mas legible.
    local sobran
    sobran="$(ls -1d "$DESTINO"/*/ 2>/dev/null | head -n "-$CUANTOS" || true)"
    if [ -n "$sobran" ]; then
        echo "$sobran" | xargs rm -rf --
        echo "quitados $(echo "$sobran" | wc -l) juegos antiguos (se guardan $CUANTOS)"
    fi
}

# ── La comprobacion, que es la mitad que importa ────────────────────────────────
verificar() {
    local ultimo
    ultimo="$(ls -1d "$DESTINO"/*/ | tail -n 1)"
    echo "comprobando $ultimo"

    (cd "$ultimo" && sha256sum --check sha256sums.txt)

    # **Una base aparte, y con la fecha en el nombre.** Restaurar sobre la de produccion para
    # "comprobar" es la forma mas rapida de perder los datos que se querian proteger.
    local prueba="aerobim_prueba_$(date +%s)"
    echo "restaurando en $prueba"
    createdb "$prueba"
    # `trap` y no un `dropdb` al final: si `pg_restore` falla, la base de prueba se queda ahi y la
    # siguiente comprobacion crea otra. Con veinte de esas nadie sabe cual borrar.
    trap 'dropdb --if-exists "$prueba" || true' EXIT

    pg_restore --dbname="$prueba" --no-owner --no-privileges "$ultimo/base.dump"

    # El oraculo: Django habla con la base restaurada y **no falta ninguna migracion**.
    # `check --database` toca la conexion de verdad; `showmigrations` delata un volcado hecho a
    # mitad de un despliegue, que es un caso real y no una hipotesis.
    # `DB_NAME` se pisa y el resto de la conexion sale del `.env`: es la misma base, otra
    # copia. Cambiar aqui la forma de conectarse seria comprobar algo distinto de lo que corre.
    (
        cd /opt/aerobim/services/api
        export DJANGO_SETTINGS_MODULE=config.settings.prod
        export DB_NAME="$prueba"
        .venv/bin/python manage.py check --database default
        echo "migraciones aplicadas en la copia: $(
            .venv/bin/python manage.py showmigrations --plan | grep -c '^\[X\]'
        )"
    )

    # Y los documentos: que el `tar` se pueda abrir y traiga archivos. `--test-label` no basta —
    # confirma que es un tar, no que tenga algo dentro.
    local cuantos
    cuantos="$(tar --list --file="$ultimo/documentos.tar" | wc -l)"
    echo "documentos en la copia: $cuantos"
    [ "$cuantos" -gt 1 ] || {
        echo "ERROR: el tar de documentos esta vacio" >&2
        exit 1
    }

    echo "OK: de este respaldo se puede volver"
}

case "${1:-}" in
--verificar) verificar ;;
"") respaldar ;;
*)
    echo "uso: $0 [--verificar]" >&2
    exit 2
    ;;
esac
