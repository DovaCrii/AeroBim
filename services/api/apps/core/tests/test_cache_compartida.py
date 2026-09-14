"""La cache que comparten los workers, y el limite que sin ella no era un limite.

## El defecto

`CACHES` no estaba escrito en ningun sitio, asi que Django usaba `LocMemCache`: **una cache por
proceso**. En desarrollo hay un proceso y no se nota. En la VM hay `workers = cpu*2+1` de gunicorn,
cada uno con la suya.

Y el contador del throttle de DRF vive en la cache. `/api-token/` acepta pares usuario/contrasena
**sin autenticar**, y su limite de `10/min` existe —esta en `config/urls.py`— para que no sea «un
oraculo de contrasenas fuera de linea». Con nueve workers ese limite son en realidad **hasta noventa
por minuto**, y ademas **no es determinista**: depende de a que worker caiga cada intento.

**El limite se escribio, se probo y no limitaba lo que decia.** Y ninguna prueba podia verlo, porque
para verlo hacen falta dos procesos.

## Que se prueba aqui

Lo que **si** se puede comprobar en un proceso: que lo que se escribe en la cache **sale del
proceso**. Con `DatabaseCache` aterriza en una tabla, y esa tabla la ve cualquier worker; con
`LocMemCache` se queda en un diccionario de este.

Es un oraculo indirecto y se dice: no demuestra el limite con nueve workers, sino **la propiedad de
la que depende**. Comprobar el limite de verdad pide levantar gunicorn con varios workers, que es lo
que se hizo a mano en el ensayo y no cabe en la suite.
"""

import pytest
from django.core.cache import cache, caches
from django.db import connection

pytestmark = pytest.mark.django_db

#: El mismo nombre que `CACHES["default"]["LOCATION"]` y que la migracion `core.0003`.
TABLA = "core_cache"


def test_la_cache_no_vive_dentro_del_proceso():
    """**`LocMemCache` es el valor por omision de Django, y es el defecto.**

    Se comprueba el backend configurado y no el contenido: un `LocMemCache` pasaria todas las
    pruebas de «guarda y devuelve» que se le pongan, porque dentro de un proceso funciona
    perfectamente. Lo que falla es lo que no se ve desde aqui.
    """
    backend = caches["default"].__class__.__module__

    assert "locmem" not in backend, (
        "la cache es por proceso: el limite de `/api-token/` seria de 10/min por worker"
    )
    assert "db" in backend


def test_lo_que_se_guarda_sale_del_proceso():
    """La propiedad que sostiene el limite: el valor aterriza donde otro worker puede verlo.

    Se mira **la tabla**, no la API de cache: `cache.get()` devolveria lo mismo con `LocMemCache`, y
    entonces esta prueba no distinguiria el caso bueno del malo.
    """
    cache.set("aerobim:prueba-de-que-sale", "hola", 60)

    with connection.cursor() as cursor:
        cursor.execute(f"SELECT count(*) FROM {TABLA}")
        cuantas = cursor.fetchone()[0]

    assert cuantas >= 1, "no llegó nada a la tabla: la cache se quedó dentro del proceso"

    cache.delete("aerobim:prueba-de-que-sale")


def test_la_tabla_existe_sin_correr_ningun_comando_aparte():
    """**La crea `core.0003`, no un paso del despliegue.**

    Un paso que hay que acordarse de correr es un paso que se olvida: `bootstrap_roles` estuvo fuera
    de `docs/DEPLOY.md` durante meses por eso, y la consecuencia era que un permiso nuevo no llegaba
    a ningun rol **sin que nada diera error**. Que esta prueba pase sin que nadie haya corrido
    `createcachetable` es justamente lo que se quiere demostrar.
    """
    with connection.cursor() as cursor:
        tablas = connection.introspection.table_names(cursor)

    assert TABLA in tablas


def test_el_limite_del_token_sigue_siendo_el_que_dice():
    """El limite no se toca al arreglar dónde se cuenta. Si alguien lo subiera «porque ahora cuenta
    bien», el endpoint volvería a ser lo que `config/urls.py` dice que no puede ser."""
    from django.conf import settings

    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["anon"] == "10/min"
