"""Acotar por organizacion: la mitad del control de acceso que el permiso no cubre.

Portado de `AeroControl/apps/core/tenancy.py`. La regla, dicha una vez para no
repetirla en cada vista: **un permiso de modelo dice que se puede hacer, no sobre
que**. Las dos preguntas se contestan en sitios distintos y las dos hacen falta.
"""

from django.db.models import Q, QuerySet

from apps.core.models import Membresia

# El nombre del campo por el que un modelo cuelga de su organizacion. Uno solo, y
# siempre el mismo, para que acotar sea automatico y no una decision por modelo.
CAMPO_ORGANIZACION = "organizacion"


def organizaciones_visibles(user) -> list:
    """Los ids de las organizaciones a las que el usuario pertenece.

    Un superusuario las ve todas. **No es una excepcion comoda**: es que un
    superusuario ya puede leer la base de datos entera desde el `/admin/`, asi que
    acotarle la consulta daria una sensacion de aislamiento que no existe.
    """
    if not user.is_authenticated:
        return []
    if user.is_superuser:
        return list(Membresia.objects.values_list("organizacion_id", flat=True).distinct())
    return list(Membresia.objects.filter(usuario=user).values_list("organizacion_id", flat=True))


def organizaciones_de(user) -> QuerySet:
    """Las **organizaciones** que este usuario puede ver, como consulta.

    ## Por qué hace falta una función aparte para esto

    Porque `scope_queryset_to_organizacion(Organizacion.objects.all(), user)` **devuelve la lista
    entera**, y es de las cosas que más fácil se escriben creyendo lo contrario. El motivo es que
    `Organizacion` no tiene un campo llamado `organizacion` —**es** la organización— así que cae en
    la rama de «modelo sin el campo, se devuelve intacto» pensada para los catálogos.

    No es una suposición: se escribió así en el desplegable del alta de cuentas y en la pantalla de
    organizaciones, y en los dos sitios la prueba enseñó la empresa ajena en la lista. La trampa no
    es sutil de leer, es sutil de **ver**: no falla, no avisa, y la lista sale bien de largo.

    `Membresia` y `Organizacion` son los dos únicos modelos donde esto pasa —el resto de lo que
    pertenece a alguien sí lleva el campo— y los dos son justo los que describen la pertenencia.
    """
    from apps.core.models import Organizacion

    if user.is_superuser:
        return Organizacion.objects.all()
    ids = organizaciones_visibles(user)
    if not ids:
        return Organizacion.objects.none()
    return Organizacion.objects.filter(pk__in=ids)


def scope_queryset_to_organizacion(queryset: QuerySet, user) -> QuerySet:
    """Deja en la consulta solo lo que el usuario puede ver por su organizacion.

    Un modelo **sin** el campo se devuelve intacto: no todo lo que hay en la base
    pertenece a una organizacion —el catalogo de tipos de documento, por ejemplo— y
    obligar al campo por uniformidad crearia filas duplicadas por cada cliente.

    **Y ahi esta el filo, que ya corto dos veces.** Pasarle el modelo equivocado no da ningun
    error: devuelve todo. `Revision` y `Comentario` cuelgan de otro modelo y no llevan el campo;
    `Organizacion` y `Membresia` **son** la pertenencia, asi que tampoco. Para el primero hay
    `revisiones_visibles` y `observacion_visible` en `apps/documents/views.py`; para el segundo,
    {@link organizaciones_de} aqui arriba. Si el modelo que vas a pasar no lleva `organizacion`,
    esta funcion no es la que buscas.

    Un usuario **sin ninguna membresia no ve nada**, y eso es deliberado. La
    alternativa —"sin membresia, ve todo"— es el defecto clasico: el primer usuario
    creado sin asignar queda con acceso completo, y nadie se entera hasta que alguien
    revisa por que.
    """
    if user.is_superuser:
        return queryset
    try:
        queryset.model._meta.get_field(CAMPO_ORGANIZACION)
    except Exception:
        return queryset

    ids = organizaciones_visibles(user)
    if not ids:
        return queryset.none()
    return queryset.filter(Q(**{f"{CAMPO_ORGANIZACION}__in": ids}))
