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

# **Donde vive la aplicacion, y por que es una variable y no una ruta escrita a mano.**
#
# Estaba escrita tres veces —el `.env` que se lee, el `cd` de la comprobacion y el interprete del
# entorno virtual—, y eso hacia que este guion **solo se pudiera correr en la VM**. Consecuencia:
# `--verificar` no se podia ensayar en ningun sitio, y `docs/DEPLOY.md` dice que hasta que pase una
# vez el piloto no arranca. O sea que el primer `--verificar` de la historia iba a ser el de
# produccion, que es exactamente lo que no se quiere de un guion de respaldo.
#
# Con la variable, el mismo guion corre en un WSL con Ubuntu 24.04 —la misma distribucion que la
# VM— y llega a produccion habiendo pasado ya.
AEROBIM_HOME="${AEROBIM_HOME:-/opt/aerobim/services/api}"
PYTHON="${AEROBIM_PYTHON:-$AEROBIM_HOME/.venv/bin/python}"

# **Las mismas variables del `.env` y ninguna nueva.** `config/settings/base.py:101-112` lee
# `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` y `DB_PORT`; inventar aqui un `DATABASE_URL`
# obligaria a mantener la misma conexion escrita de dos formas, y el dia que cambie una sola el
# respaldo apuntaria a otra base sin decirlo. Se sacan del `.env` con `set -a`.
if [ -z "${DB_NAME:-}" ] && [ -r "$AEROBIM_HOME/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$AEROBIM_HOME/.env"
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

# **El nombre de la base de prueba vive fuera de la funcion, y eso no es estilo: es el arreglo.**
#
# Estaba como `local` dentro de `verificar`, y el `trap EXIT` que la borra **no la veia**. Medido el
# 2026-09-09 con un guion minimo: bash deshace el alcance de la funcion antes de correr el trap de
# salida, asi que la variable llega vacia **por los dos caminos** -al terminar bien y al fallar-.
# El `dropdb --if-exists ""` que salia de ahi no borra nada y el `|| true` se tragaba la queja.
#
# La consecuencia era grave para un guion que existe para dar tranquilidad: cada comprobacion
# dejaba una `aerobim_prueba_<epoch>` para siempre. Con la comprobacion diaria que este guion
# propone, son trescientas sesenta y cinco copias enteras al año en el mismo disco que protege --y
# cada una lleva los correos y los hashes de contraseña que el guion se cuida de no dejar legibles.
PRUEBA=""

verificar() {
    local ultimo
    # Sin juegos guardados no hay nada que comprobar, y conviene decirlo asi en vez de dejar que
    # `ls` falle: un guion que muere con «no such file» hace pensar que se rompio.
    ultimo="$(ls -1d "$DESTINO"/*/ 2>/dev/null | tail -n 1 || true)"
    if [ -z "$ultimo" ]; then
        echo "no hay ningun respaldo en $DESTINO todavia: corre el guion sin --verificar" >&2
        exit 1
    fi
    echo "comprobando $ultimo"

    (cd "$ultimo" && sha256sum --check sha256sums.txt)

    # **Una base aparte, y con la fecha en el nombre.** Restaurar sobre la de produccion para
    # "comprobar" es la forma mas rapida de perder los datos que se querian proteger.
    PRUEBA="aerobim_prueba_$(date +%s)"
    echo "restaurando en $PRUEBA"
    createdb "$PRUEBA"
    # `trap` y no un `dropdb` al final: si `pg_restore` falla, la base de prueba se queda ahi y la
    # siguiente comprobacion crea otra. Con veinte de esas nadie sabe cual borrar.
    trap 'if [ -n "${PRUEBA:-}" ]; then dropdb --if-exists "$PRUEBA" || true; fi' EXIT

    pg_restore --dbname="$PRUEBA" --no-owner --no-privileges "$ultimo/base.dump"

    # El oraculo: Django habla con la base restaurada y **no falta ninguna migracion**.
    # `check --database` toca la conexion de verdad; `showmigrations` delata un volcado hecho a
    # mitad de un despliegue, que es un caso real y no una hipotesis.
    # `DB_NAME` se pisa y el resto de la conexion sale del `.env`: es la misma base, otra
    # copia. Cambiar aqui la forma de conectarse seria comprobar algo distinto de lo que corre.
    (
        cd "$AEROBIM_HOME"
        export DJANGO_SETTINGS_MODULE=config.settings.prod
        export DB_NAME="$PRUEBA"
        "$PYTHON" manage.py check --database default
        echo "migraciones aplicadas en la copia: $(
            "$PYTHON" manage.py showmigrations --plan | grep -c '^\[X\]'
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
