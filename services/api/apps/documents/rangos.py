"""Servir **un tramo** de un archivo y no el archivo entero: `Range` / `206`.

## Por qué hace falta

Por la nube de puntos (`F12.13`). El COPC lleva el octree **dentro del archivo**, y el visor lo
aprovecha así: lee la cabecera —unos kilobytes—, mira qué nodos caen en pantalla, y pide **solo
esos tramos**. Sobre el levantamiento del CC 741 eso son ~130 MB en disco de los que el primer
pintado usa una fracción.

Sin `Range`, ese diseño se cae del lado del servidor: `fetch` descargaría los 130 MB completos
antes de que el visor pudiera leer el primer punto, y `FileResponse(iter([contenido]))` los tendría
además **enteros en memoria** en cada petición. Con `Range` se leen los bytes que se piden, y ni el
servidor ni el navegador cargan el resto.

Que funcione sobre `blob:` está comprobado desde antes (el navegador responde `206` a un blob
local); esto es la otra mitad, la que hace que la nube se pueda abrir **desde el expediente** y no
solo desde un archivo del disco.

## Por qué es un módulo aparte

Porque la aritmética es lo único que puede estar mal, y así se prueba sin HTTP: `tramo_pedido` es
una función pura de `(cabecera, tamaño)`. Las cuatro formas que admite el RFC 7233 —`0-499`,
`500-`, `-500`, y el fin que se pasa del final— caben en una tabla de casos, y ahí es donde se
cazan los errores de un byte, que en un octree no dan un error: dan puntos en el sitio equivocado.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.http import FileResponse, HttpResponse


class RangoFueraDeAlcance(Exception):
    """Se pidió un tramo que empieza más allá del final del archivo → `416`.

    Es su propia excepción y no un `None` más porque **la respuesta es distinta**: «no pediste
    tramo» se contesta con el archivo entero, y «pediste un tramo que no existe» con un `416` que
    dice cuál es el tamaño real. Devolver el archivo entero en el segundo caso dejaría al cliente
    creyendo que recibió lo que pidió.
    """


@dataclass(frozen=True)
class Tramo:
    """Un tramo de bytes, con el final **incluido** — como en la cabecera, no como en Python.

    El fin inclusivo es la trampa de todo esto: `Range: bytes=0-499` son 500 bytes, y en Python
    `[0:499]` son 499. Se guarda tal como viaja en la cabecera y se convierte en un solo sitio
    (`leer_tramo`), para que la conversión no se repita — repetida es donde se pierde el byte.
    """

    inicio: int
    fin: int

    @property
    def largo(self) -> int:
        return self.fin - self.inicio + 1

    def cabecera(self, tamano: int) -> str:
        return f"bytes {self.inicio}-{self.fin}/{tamano}"


def tramo_pedido(cabecera: str | None, tamano: int) -> Tramo | None:
    """Qué tramo pide esta cabecera `Range`, o `None` si no pide ninguno.

    `None` significa **«sirve el archivo entero»**, y es la respuesta correcta a todo lo que no se
    sabe atender: sin cabecera, con una unidad que no es `bytes`, con varios tramos, o mal escrita.
    El RFC lo permite explícitamente —un servidor puede ignorar `Range`— y es lo prudente: un `200`
    con todo el archivo siempre es una respuesta válida, y adivinar lo que quiso decir una cabecera
    rota no lo es.

    **Los varios tramos se ignoran a propósito**, aunque servir el primero sería fácil: eso daría un
    `206` con un `Content-Range` de un solo tramo para una petición de dos, y el cliente creería que
    tiene los dos. Los lectores de COPC piden un tramo por petición.
    """
    if not cabecera:
        return None
    valor = cabecera.strip()
    if not valor.lower().startswith("bytes="):
        return None
    especificacion = valor[len("bytes=") :].strip()
    if "," in especificacion:
        return None

    desde, separador, hasta = especificacion.partition("-")
    if not separador:
        return None

    try:
        if not desde:
            # `bytes=-500`: los ultimos 500 bytes. `500` no es una posicion, es una cantidad.
            ultimos = int(hasta)
            if ultimos <= 0:
                return None
            return Tramo(max(0, tamano - ultimos), tamano - 1)
        inicio = int(desde)
        # `bytes=500-` (sin fin) llega hasta el final. Y un fin mas alla del final **se recorta**,
        # que es lo que manda el RFC: pedir de mas no es un error, es pedir hasta donde haya.
        fin = min(int(hasta), tamano - 1) if hasta else tamano - 1
    except ValueError:
        return None

    if inicio < 0 or inicio >= tamano:
        raise RangoFueraDeAlcance(f"{inicio} no cabe en {tamano} bytes")
    if fin < inicio:
        return None
    return Tramo(inicio, fin)


def leer_tramo(ruta: Path, tramo: Tramo) -> bytes:
    """Lee **solo** esos bytes del disco: `seek` y `read`, no el archivo entero.

    Es el punto del ejercicio. Leerlo completo y cortarlo en memoria daria la misma respuesta y
    gastaria los mismos 130 MB de RAM que se querian evitar.
    """
    with ruta.open("rb") as archivo:
        archivo.seek(tramo.inicio)
        return archivo.read(tramo.largo)


def respuesta_de_archivo(ruta: Path, cabecera_range: str | None, *, tipo: str) -> HttpResponse:
    """La respuesta completa o el `206` del tramo, con las cabeceras que van en cada caso.

    `Accept-Ranges: bytes` va **en las dos**: es como el cliente sabe que puede pedir tramos, y sin
    ella un lector de COPC prudente descarga el archivo entero aunque el servidor sepa cortarlo.
    """
    tamano = ruta.stat().st_size
    try:
        tramo = tramo_pedido(cabecera_range, tamano)
    except RangoFueraDeAlcance:
        # `416` con el tamaño real: es lo que permite al cliente corregir y volver a pedir.
        fuera = HttpResponse(status=416)
        fuera["Content-Range"] = f"bytes */{tamano}"
        fuera["Accept-Ranges"] = "bytes"
        return fuera

    if tramo is None:
        respuesta: HttpResponse = FileResponse(ruta.open("rb"), content_type=tipo)
        respuesta["Content-Length"] = str(tamano)
    else:
        respuesta = HttpResponse(leer_tramo(ruta, tramo), status=206, content_type=tipo)
        respuesta["Content-Range"] = tramo.cabecera(tamano)
        respuesta["Content-Length"] = str(tramo.largo)
    respuesta["Accept-Ranges"] = "bytes"
    return respuesta
