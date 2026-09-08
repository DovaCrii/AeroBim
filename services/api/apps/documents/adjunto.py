"""La imagen que acompaña a un comentario, leida de un formulario sin creerle nada. `F12.11`.

**Una queja del portal no llevaba imagen.** El caso que lo pide es el del piloto: alguien de la obra
encuentra que una pantalla no hace lo que espera, abre una observacion y tiene que **contarla con
palabras**. Una captura la explica en un segundo y ademas prueba lo que se vio, que es la mitad del
valor de un hallazgo — el otro camino era el que dejo escrito el plan: un entregable
`PILOTO-CAPTURAS` con los PNG sueltos y el correlativo citado a mano en el texto.

## En que se parece a `instantanea.py` y en que no

Se parece en el criterio: **la firma manda, no la extension ni el tipo que declara el navegador**,
porque los dos los escribe quien manda. Se reutiliza `storage.validar`, que es donde vive esa regla.

Se diferencia en tres cosas, y las tres tienen motivo:

1. **Llega como archivo de un formulario, no como `data:` de un lienzo.** Ahi no hay base64 que
   decodificar ni prefijo que comprobar; hay un `UploadedFile` y hay que leerlo con cuidado.
2. **Acepta JPEG ademas de PNG.** Una captura de pantalla es PNG y **una foto de obra es JPEG**, y
   este adjunto sirve para las dos: «la grieta esta asi» es una foto tomada con el telefono.
3. **Tiene su propio tope, mucho mas bajo que el de un entregable.** Los 200 MB de `storage` son
   para un IFC federado; una foto de telefono ronda los 4 MB y ocho sobran. Un adjunto de 200 MB en
   un hilo de comentarios no es evidencia, es un problema de disco.

## Y un adjunto malo **si** se dice

Al contrario que la camara o la instantanea del visor, que se descartan en silencio porque quien
anota no escribio esos parametros. Aqui **la persona eligio el archivo a mano**: si se descarta y no
se dice, vuelve a intentarlo con el mismo archivo y concluye que el producto no acepta imagenes.
Asi que este modulo lanza {@link AdjuntoRechazado} con un motivo que se puede enseñar.
"""

from django.utils.translation import gettext_lazy as _

from apps.documents import storage

#: Lo que se acepta adjuntar a un comentario.
#:
#: Solo imagenes, y solo estas dos. **No se acepta PDF ni SVG**: un SVG lleva scripts y se serviria
#: desde nuestro dominio, y un PDF adjunto a un comentario es un documento — o sea un entregable,
#: que tiene su propio camino con su codigo y su revision. Confundir los dos es como se pierde la
#: trazabilidad de un documento de obra.
EXTENSIONES = ("png", "jpg", "jpeg")

#: Tope del adjunto, en bytes. Ocho megas: una foto de telefono ronda los cuatro.
BYTES_MAXIMOS = 8 * 1024 * 1024


class AdjuntoRechazado(Exception):
    """El adjunto no sirve, con un motivo que se le puede enseñar a quien lo eligio."""

    def __init__(self, mensaje, codigo: str):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


def leer(archivo) -> tuple[bytes, str, str]:
    """Los bytes, la extension y el sha256 del adjunto, o lanza {@link AdjuntoRechazado}.

    Devuelve el sha256 **que ya calculo `storage.validar`** en vez de dejar que quien llama vuelva a
    validar: dos validaciones del mismo archivo es como acaban discrepando.

    Comprueba el tamaño **antes de leer el archivo entero a memoria**, con el tamaño que declara el
    `UploadedFile`: leer ocho megas para descubrir que sobran es gratis, pero leer doscientos para
    lo mismo es como se tumba un servidor con una peticion.
    """
    if archivo is None:
        raise AdjuntoRechazado(_("No file was chosen."), "sin-archivo")

    tamano = getattr(archivo, "size", None)
    if tamano is not None and tamano > BYTES_MAXIMOS:
        raise AdjuntoRechazado(
            _("The image is larger than the %(mb)s MB limit.")
            % {"mb": BYTES_MAXIMOS // (1024 * 1024)},
            "demasiado-grande",
        )

    nombre = getattr(archivo, "name", "") or ""
    extension = storage.extension_de(nombre)
    if extension not in EXTENSIONES:
        raise AdjuntoRechazado(
            _("Only PNG and JPEG images can be attached."),
            "extension-no-aceptada",
        )

    contenido = archivo.read()
    # El tamaño declarado puede faltar o mentir; lo leido no.
    if len(contenido) > BYTES_MAXIMOS:
        raise AdjuntoRechazado(
            _("The image is larger than the %(mb)s MB limit.")
            % {"mb": BYTES_MAXIMOS // (1024 * 1024)},
            "demasiado-grande",
        )

    # **La firma manda.** Es la misma comprobacion con la que se cae `virus.exe` renombrado a
    # `plano.pdf`, y se reutiliza en vez de escribirla otra vez. `validar` devuelve la extension
    # normalizada y el sha256, que es con lo que se construye la clave.
    try:
        extension, sha = storage.validar(nombre, contenido)
    except storage.CargaRechazada as rechazo:
        raise AdjuntoRechazado(rechazo.args[0], rechazo.codigo or "rechazado") from rechazo

    if extension not in EXTENSIONES:
        raise AdjuntoRechazado(_("Only PNG and JPEG images can be attached."), "no-es-imagen")

    return contenido, extension, sha
