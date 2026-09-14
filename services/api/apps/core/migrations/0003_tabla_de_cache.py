"""La tabla de la cache compartida.

**Va en una migracion y no en un paso del despliegue a proposito.** `createcachetable` es un comando
de gestion, y anadir un comando al procedimiento es anadir algo que hay que acordarse de correr:
`bootstrap_roles` estuvo fuera de `docs/DEPLOY.md` durante meses por eso mismo, con la consecuencia
de que un permiso nuevo no llegaba a ningun rol y nada daba error. Dentro de `migrate`, la tabla
existe siempre que exista el resto del esquema.

**Y por que hace falta la cache**, que es lo que esta tabla sostiene: sin `CACHES`, Django usa una
cache **por proceso**, y el contador del throttle de DRF vive ahi. Con `workers = cpu*2+1`, el limite
de `10/min` de `/api-token/` —el unico endpoint que acepta pares usuario/contrasena sin autenticar—
se convierte en hasta noventa por minuto, y de forma no determinista. Ver `config/settings/base.py`.

`createcachetable` es idempotente: si la tabla esta, no hace nada. Por eso se puede correr en cada
despliegue sin comprobar antes.
"""

from django.core.management import call_command
from django.db import migrations

#: El mismo nombre que `CACHES["default"]["LOCATION"]`. Si uno cambia, el otro tambien.
TABLA = "core_cache"


def crear(apps, schema_editor):
    # `database=` para que respete la conexion de la migracion: con una sola base da igual, y el dia
    # que haya dos, `createcachetable` sin esto la crearia en la que no es.
    call_command("createcachetable", TABLA, database=schema_editor.connection.alias, verbosity=0)


def borrar(apps, schema_editor):
    """Deshacer la migracion se lleva la tabla: no guarda nada que haga falta conservar.

    Lo que hay dentro son contadores de throttle y sesiones de cache con su propia caducidad. Perder
    eso al volver atras significa que los limites empiezan de cero, que es exactamente lo que pasa al
    reiniciar de todas formas.
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f"DROP TABLE IF EXISTS {schema_editor.connection.ops.quote_name(TABLA)}")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_sequence_unica"),
    ]

    operations = [
        migrations.RunPython(crear, borrar),
    ]
