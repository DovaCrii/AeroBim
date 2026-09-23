"""Publicar una lámina del visor como revisión de un entregable, sin salir del visor.

## La vuelta que esto quita

Hasta hoy, sacar una planta del modelo y dejarla archivada eran **dos productos**: se generaba la
lámina en el visor, se descargaba el PDF, se volvía al portal, se buscaba el entregable, se abría el
formulario de subir y se elegía el archivo del disco. Seis pasos para mover un archivo que el
servidor acababa de fabricar.

## Y por qué el navegador no manda ningún archivo

**Manda la geometría, y el servidor fabrica el PDF** — que es exactamente lo que ya hace
`LaminaPdfView` desde `F7.5`, con el reparto ya razonado ahí: proyectar aristas necesita un
renderizador, y el membrete de la casa vive en el servidor.

Aprovecharlo tiene una consecuencia que vale más que el ahorro de código: **los bytes que se
archivan los escribe el servidor**, no llegan del navegador. No hay que validar firma, ni extensión,
ni tamaño de algo que alguien pudo cambiar por el camino, porque nadie pudo. Una subida de archivo
desde el visor habría abierto la primera superficie de carga binaria de la API —hoy no hay ninguna—
y eso es una decisión mucho más grande que la que este cambio necesitaba.

## Lo que sí se comprueba, y en qué orden

El orden importa y no es el del formulario del portal. `SubirRevisionView` guarda el archivo y
**después** llama a `revision.save()`, así que un `correlativo` repetido —hay un `UniqueConstraint`
sobre `(entregable, correlativo)`— revienta con un `IntegrityError` **con el archivo ya en disco**.
Aquí se pregunta antes: primero si el correlativo está libre, luego se fabrica el PDF, y solo
entonces se escribe. Cuesta una consulta y evita dejar basura.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.utils.translation import gettext_lazy as _

from apps.documents import storage
from apps.documents.models import Entregable, Idoneidad, Revision


def nombre_de_archivo(entregable: Entregable, correlativo: str, vista: str) -> str:
    """Cómo se llama el archivo que se archiva.

    Lleva el código del entregable y su correlativo, que es lo que alguien busca en una lista de
    descargas; el nombre de la vista va dentro del papel.

    **No decide dónde se guarda**: la clave de almacenamiento la calcula `storage.clave_para` a
    partir del sha, como toda subida. Esto es solo el `nombre_original`, o sea lo que se descarga.
    """
    limpio = "".join(c for c in vista if c.isalnum() or c in " -_").strip() or "Plano"
    return f"{entregable.codigo} {correlativo} {limpio}.pdf"[:250]


@dataclass(frozen=True)
class Rechazo:
    """Por qué no se puede publicar, con un código estable además del mensaje.

    El código es lo que el visor puede mirar sin leer castellano, igual que hace `CargaRechazada`
    con las subidas. Los mensajes cambian; `correlativo-repetido` no.
    """

    motivo: str
    codigo: str


def revisa(*, entregable: Entregable, correlativo: str, idoneidad: str) -> Rechazo | None:
    """Lo que hay que saber **antes** de fabricar nada. `None` si se puede publicar.

    Se comprueba aquí y no en la vista para poder probarlo sin una petición, y sobre todo para que
    el orden —preguntar antes de escribir— quede en un sitio y no repartido por un `try`.
    """
    if not correlativo:
        return Rechazo(str(_("A revision needs its correlative.")), "correlativo-vacio")
    if len(correlativo) > 20:
        # El campo del modelo son 20; recortarlo en silencio archivaría con otro nombre del que se
        # tecleó, y el correlativo es lo que identifica la revisión para el mandante.
        return Rechazo(
            str(_("The correlative does not fit in 20 characters.")), "correlativo-largo"
        )

    if idoneidad not in Idoneidad.values:
        return Rechazo(str(_("That suitability code does not exist.")), "idoneidad-desconocida")

    # **Antes de fabricar el PDF y antes de tocar el disco.** Es lo que la pantalla del portal hace
    # al revés, y por eso allí un correlativo repetido deja el archivo huérfano.
    if Revision.objects.filter(entregable=entregable, correlativo=correlativo).exists():
        return Rechazo(
            str(_("This deliverable already has a revision with that correlative.")),
            "correlativo-repetido",
        )
    return None


def publicar(
    *,
    entregable: Entregable,
    correlativo: str,
    idoneidad: str,
    contenido: bytes,
    vista: str,
    por,
) -> Revision:
    """Archiva el PDF como una revisión nueva del entregable.

    **No revisa nada**: quien llama ya pasó por {@link revisa}. Separarlos es lo que permite que el
    PDF se fabrique entre la comprobación y la escritura sin que este código tenga que saberlo.

    El sha y el tamaño salen de los bytes de verdad, no de lo que dijera nadie — igual que en la
    subida normal, solo que aquí no hay nadie a quien creerle.
    """
    extension, sha256 = storage.validar("lamina.pdf", contenido)
    clave = storage.clave_para(
        proyecto_codigo=entregable.proyecto.codigo,
        entregable_codigo=entregable.codigo,
        sha256=sha256,
        extension=extension,
    )
    storage.guardar(clave, contenido)

    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=idoneidad,
        subida_por=por,
        clave_archivo=clave,
        nombre_original=nombre_de_archivo(entregable, correlativo, vista),
        tamano_bytes=len(contenido),
        sha256=sha256,
    )
