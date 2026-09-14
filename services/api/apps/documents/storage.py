"""Guardar un archivo que llega de fuera, tratandolo como lo que es: entrada hostil.

Portado de `AeroControl/apps/compliance/storage.py` y `security.py`, y alineado con lo
que `docs/ARCHITECTURE.md` ya exigia para AeroBim: **validar por extension, tipo MIME y
tamaño, y nunca usar el nombre de archivo del usuario en el sistema de archivos**.

Las tres reglas, y por que cada una:

- **La extension no basta**: renombrar `virus.exe` a `plano.pdf` la satisface. Se
  comprueba la **firma real** de los primeros bytes.
- **El nombre del cliente no toca el disco.** Un nombre puede traer `../../` o un
  caracter que el sistema de archivos interpreta; la clave se construye aqui, con el
  sha256 del contenido, y el nombre original se guarda **en la base de datos** para
  poder mostrarlo.
- **El sha256 hace idempotente volver a subir lo mismo**, y ademas es la prueba de que
  el archivo que alguien descarga es el que se aprobo.
"""

import hashlib
import os
import re
import shutil
from pathlib import Path

from django.conf import settings
from django.utils.translation import gettext_lazy as _


class CargaRechazada(Exception):
    """El archivo es el problema. Se le dice a quien lo sube, y se le dice qué arreglar.

    Lleva **dos cosas y no una**: el mensaje, que es para la persona y va traducido, y un
    `codigo`, que es para el código y no cambia nunca.

    La razón la dio el catálogo en español: las pruebas comprobaban el motivo buscando una
    palabra del mensaje —`match="empty"`— y se rompieron todas al traducirlo, **sin que nada
    del comportamiento hubiera cambiado**. Un motivo de rechazo es una decisión del programa y
    tiene que poder nombrarse sin depender del idioma en que se le cuente a nadie. Sirve además
    para el log, donde un mensaje traducido es un estorbo.
    """

    def __init__(self, mensaje, codigo: str = ""):
        super().__init__(mensaje)
        self.codigo = codigo


# Firma real de los formatos que este registro acepta. La lista es corta a proposito:
# lo que un control documental de obra recibe son planos, memorias y modelos.
#
# `dxf`, `ifc` y `csv` son texto y **no tienen firma**: se validan por extension y por
# que su primer bloque sea texto legible, que es todo lo que se puede afirmar de ellos.
FIRMAS: dict[str, tuple[bytes, ...]] = {
    "pdf": (b"%PDF-",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    # Los tres de Office son contenedores ZIP.
    "docx": (b"PK\x03\x04", b"PK\x05\x06"),
    "xlsx": (b"PK\x03\x04", b"PK\x05\x06"),
    "pptx": (b"PK\x03\x04", b"PK\x05\x06"),
    "zip": (b"PK\x03\x04", b"PK\x05\x06"),
    "dwg": (b"AC10", b"AC1"),
    # **DGN de Bentley, en sus dos generaciones y por eso dos firmas.**
    #
    # El v8 —lo que escribe MicroStation desde 2001— es un contenedor compuesto de Microsoft, el
    # mismo envoltorio que un `.doc` antiguo, y empieza por `D0 CF 11 E0`. El v7 es el formato
    # propio anterior y sus archivos empiezan por un elemento de tipo 9 en `08 09 FE`.
    #
    # Que las dos pasen es a proposito: **el registro guarda lo que le den**. Que el v7 se pueda
    # convertir o no lo decide el conversor, y si no puede lo dice — no es motivo para rechazar el
    # archivo al entrar.
    "dgn": (b"\xd0\xcf\x11\xe0", b"\x08\x09\xfe"),
    # **El levantamiento** — `F12.13`. LAS y LAZ empiezan los dos por `LASF`: es la firma que
    # declara la especificacion, y la lleva tanto el LAS sin comprimir como el LAZ y el COPC, que
    # son LAS 1.4 por dentro.
    #
    # Se acepta el `.las` ademas del `.laz` porque **es lo que entrega un topografo**: el visor solo
    # abre COPC, y convertirlo es un paso posterior (`apps/web/scripts/a-copc.py`). Rechazar el
    # original al entrar obligaria a convertir antes de archivar, o sea a archivar solo la copia.
    "las": (b"LASF",),
    "laz": (b"LASF",),
}

# `ids` es el requisito de informacion del proyecto (`F3.5`): XML de buildingSMART, texto, y sin
# firma propia. Va aca y no en `FIRMAS` porque comprobar `<?xml` rechazaria un IDS valido que
# empiece directo por `<ids`, y comprobar `<ids` seria una firma inventada por nosotros.
SIN_FIRMA = {"dxf", "ifc", "csv", "txt", "md", "ids"}

EXTENSIONES_ACEPTADAS = set(FIRMAS) | SIN_FIRMA

# 200 MB. Un IFC federado de obra los alcanza, y un DXF nunca. Por encima de esto el
# archivo no es un entregable: es un respaldo, y va por otro camino.
#
# **El tope se revisa con la nube de puntos (`F12.13`) y se mantiene, medido.** El levantamiento
# del CC 741 son 3,37 GB en LAS; convertido a COPC con diezmado a 3 cm son **124,7 MB**
# (130.795.022 bytes, medidos sobre `camino-agricola.copc.laz`), o sea que el
# archivo que se mira cabe con margen. El original no cabe, y eso es lo correcto: 3,37 GB no es un
# entregable que se descargue desde un navegador, y `nginx` lleva el mismo tope
# (`docs/DEPLOY.md:167`, `client_max_body_size 200M`) — subirlo aqui sin subirlo alli daria un 413
# sin explicacion.
TAMANO_MAXIMO_BYTES = 200 * 1024 * 1024


def extension_de(nombre: str) -> str:
    return Path(nombre).suffix.lower().lstrip(".")


def normalize_storage_key(clave: str) -> str:
    """Deja una clave que no puede salirse de su carpeta.

    **Rechaza en vez de limpiar.** Una ruta absoluta o con `..` no es un nombre raro que
    convenga arreglar: es un intento de escribir fuera, y arreglarlo en silencio deja el
    intento sin registrar.
    """
    if not clave or clave != clave.strip():
        raise CargaRechazada(_("The storage key is empty or padded with spaces."), "clave-vacia")
    if clave.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", clave):
        raise CargaRechazada(_("The storage key cannot be an absolute path."), "clave-absoluta")
    # **El separador se parte de uno en uno, no en grupos.** Con `[/\\]+` un `//` se
    # colapsaba en uno solo y el tramo vacio desaparecia sin que nadie lo viera: lo
    # delato su propia prueba.
    partes = re.split(r"[/\\]", clave)
    if any(p in {"", ".", ".."} for p in partes):
        raise CargaRechazada(_("The storage key cannot walk out of its folder."), "clave-fuera")
    return "/".join(partes)


def validar_tamano(tamano: int) -> None:
    """El tope, comprobado **con el numero y no con los bytes**.

    ## Por que existe aparte de `validar`

    `validar` recibe `bytes`, asi que para saber si un archivo es demasiado grande **ya habia que
    traerlo entero a memoria**. Con un tope de 200 MB y `workers = cpu*2+1`, eso significa que
    alguien podia hacer que el servidor cargara cualquier cosa que nginx dejara pasar **antes** de
    decirle que no cabia — y quien sube por error el LAS original de 3,37 GB en vez del COPC no es
    una hipotesis, es el caso que `TAMANO_MAXIMO_BYTES` existe para atajar.

    Un archivo subido sabe lo que pesa sin leerse: Django lo deja en `.size`. Preguntar primero
    cuesta nada y ahorra el caso peor entero.

    `validar` conserva su propia comprobacion a proposito: la llaman tambien caminos que ya tienen
    los bytes en la mano —la API, las pruebas— y quitarla dejaria ese tope sin vigilar segun por
    donde se entre.
    """
    if tamano > TAMANO_MAXIMO_BYTES:
        raise CargaRechazada(
            _("The file is larger than the %(mb)s MB limit.")
            % {"mb": TAMANO_MAXIMO_BYTES // (1024 * 1024)},
            "demasiado-grande",
        )


#: Cuanto se lee de una vez al recorrer un archivo por tramos.
#:
#: Un mega: bastante grande para que el coste por llamada no se note sobre 200 MB, y bastante chico
#: para que la memoria del proceso no dependa del tamano del archivo, que es todo el punto.
TROZO = 1024 * 1024

#: Cuanto se mira para decidir si un archivo es lo que dice ser.
#:
#: Las firmas viven en los primeros dieciseis bytes y el juicio de «esto es texto» quiere una
#: muestra. Cuatro kibibytes cubren los dos y caben en cualquier parte.
CABECERA = 4096


def validar_extension(nombre_original: str) -> str:
    """La extension, comprobada contra la lista de lo que se acepta."""
    extension = extension_de(nombre_original)
    if extension not in EXTENSIONES_ACEPTADAS:
        raise CargaRechazada(
            _("Files with extension «%(ext)s» are not accepted.") % {"ext": extension or "—"},
            "extension-no-aceptada",
        )
    return extension


def validar_cabecera(extension: str, cabecera: bytes) -> None:
    """Que el contenido sea lo que la extension promete.

    Vive aparte porque **lo usan los dos caminos** —el que tiene los bytes y el que recorre el
    archivo por tramos— y tener la regla escrita dos veces es como se acaba aceptando por un lado lo
    que se rechaza por el otro.
    """
    if extension in FIRMAS:
        if not any(cabecera[:16].startswith(firma) for firma in FIRMAS[extension]):
            # **Aqui se cae `virus.exe` renombrado a `plano.pdf`.**
            raise CargaRechazada(
                _("The content does not match a «%(ext)s» file.") % {"ext": extension},
                "firma-no-coincide",
            )
    elif not parece_texto(cabecera[:CABECERA]):
        raise CargaRechazada(
            _("A «%(ext)s» file has to be text.") % {"ext": extension}, "no-es-texto"
        )


def validar(nombre_original: str, contenido: bytes) -> tuple[str, str]:
    """Comprueba el archivo y devuelve `(extension, sha256)`.

    Lanza `CargaRechazada` con un motivo que se le puede mostrar a quien sube.

    **Recibe los bytes, asi que el archivo ya esta en memoria.** Para una subida use
    {@link validar_subida}, que hace las mismas comprobaciones recorriendo el archivo. Esta se queda
    para los caminos que de verdad tienen el contenido en la mano: la API, el IDS —que es un XML
    pequeño y hay que parsearlo igual— y las pruebas.
    """
    if not contenido:
        raise CargaRechazada(_("The file is empty."), "vacio")
    validar_tamano(len(contenido))
    extension = validar_extension(nombre_original)
    validar_cabecera(extension, contenido[:CABECERA])
    return extension, hashlib.sha256(contenido).hexdigest()


def validar_subida(archivo) -> tuple[str, str]:
    """Lo mismo que {@link validar}, **sin traer el archivo a memoria**.

    ## Por que

    El camino de subida hacia `contenido = subido.read()` y luego `validar(nombre, contenido)`: un
    IFC de 200 MB —el tope del registro, y los archivos de obra lo alcanzan— quedaba entero en la
    memoria del worker. Con `workers = cpu*2+1`, dos o tres subidas a la vez son el OOM killer.

    Aqui el archivo se recorre por tramos de {@link TROZO}: el `sha256` se va acumulando y la
    cabecera sale del primero. **La memoria que ocupa no depende del tamaño del archivo.**

    El `seek(0)` del final no es cortesia: quien llame va a guardar el archivo justo despues, y un
    descriptor dejado al final escribe un archivo vacio sin dar ningun error.
    """
    validar_tamano(archivo.size)
    if not archivo.size:
        raise CargaRechazada(_("The file is empty."), "vacio")
    extension = validar_extension(archivo.name)

    archivo.seek(0)
    digest = hashlib.sha256()
    cabecera = b""
    for trozo in iter(lambda: archivo.read(TROZO), b""):
        if not cabecera:
            cabecera = trozo[:CABECERA]
        digest.update(trozo)
    archivo.seek(0)

    validar_cabecera(extension, cabecera)
    return extension, digest.hexdigest()


def parece_texto(bloque: bytes) -> bool:
    """`True` si el bloque es texto y no un binario disfrazado.

    **Decodificar no sirve para decidirlo, y su propia prueba lo delato.** `latin-1`
    asigna un caracter a cada uno de los 256 bytes, o sea que **nunca falla**: un
    ejecutable renombrado a `.dxf` pasaba el filtro entero. Lo que si distingue un texto
    de un binario son dos cosas concretas: un DXF, un IFC o un CSV **no llevan bytes
    nulos**, y casi todo lo suyo es imprimible.
    """
    if b"\x00" in bloque:
        return False
    if not bloque:
        return False
    imprimibles = sum(
        1 for byte in bloque if 32 <= byte < 127 or byte in (9, 10, 13) or byte >= 160
    )
    return imprimibles / len(bloque) >= 0.9


def clave_para(*, proyecto_codigo: str, entregable_codigo: str, sha256: str, extension: str) -> str:
    """La clave con la que el archivo vive en el disco.

    **Se construye, no se recibe.** Lleva el proyecto y el entregable para que un humano
    pueda encontrar algo mirando las carpetas, y el sha256 como nombre para que subir dos
    veces lo mismo no duplique nada.
    """
    # **El punto no sobrevive en el nombre de carpeta.** Dejandolo pasar, un codigo como
    # `../../etc` salia como `..-..-etc`: no es una fuga —no hay separador— pero es un
    # nombre que parece una, y un nombre de carpeta que parece un ataque hace perder el
    # tiempo a quien audite el disco. Un codigo de proyecto no necesita puntos.
    limpiar = lambda texto: re.sub(r"[^A-Za-z0-9_-]+", "-", f"{texto}").strip("-")  # noqa: E731
    seguro = limpiar(proyecto_codigo) or "proyecto"
    seguro_e = limpiar(entregable_codigo) or "entregable"
    return normalize_storage_key(f"{seguro}/{seguro_e}/{sha256}.{extension}")


def _escribir_de_una_pieza(destino: Path, volcar) -> None:
    """Escribe con `volcar(salida)` en un temporal y lo mueve encima **de una sola vez**.

    **Un archivo a medias es peor que ninguno, y aqui es indetectable.** La clave lleva el `sha256`
    del contenido, asi que si el proceso muere escribiendo —un reinicio, el OOM killer, un disco
    lleno— queda un archivo incompleto **con el nombre del completo**. Y la comprobacion de mas
    abajo es «¿existe?», asi que la siguiente subida del mismo archivo lo da por bueno y nadie
    vuelve a escribirlo nunca: el expediente sirve un archivo truncado para siempre.

    `os.replace` sobre el mismo sistema de archivos es atomico: o esta el de antes, o esta el nuevo
    entero. El temporal va **en la misma carpeta** por eso mismo; en `/tmp` seria un movimiento
    entre sistemas de archivos y dejaria de serlo.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(f".{destino.name}.{os.getpid()}.parcial")
    try:
        with temporal.open("wb") as salida:
            volcar(salida)
        os.replace(temporal, destino)
    finally:
        temporal.unlink(missing_ok=True)


def guardar(clave: str, contenido: bytes) -> Path:
    """Escribe el archivo bajo `DOCUMENTS_DIR`, que vive **fuera del repositorio**.

    Para una subida esta {@link guardar_subida}, que no necesita el contenido en memoria.
    """
    destino = Path(settings.DOCUMENTS_DIR) / normalize_storage_key(clave)
    # Si ya existe con el mismo sha256, es el mismo archivo: no se reescribe.
    if not destino.exists():
        _escribir_de_una_pieza(destino, lambda salida: salida.write(contenido))
    return destino


def guardar_subida(clave: str, archivo) -> Path:
    """Copia el archivo subido al disco **sin pasar por una variable**.

    Es la otra mitad de {@link validar_subida}: con las dos, subir un IFC de 200 MB no ocupa 200 MB
    de memoria en ningun momento. `shutil.copyfileobj` va por tramos.
    """
    destino = Path(settings.DOCUMENTS_DIR) / normalize_storage_key(clave)
    if not destino.exists():
        archivo.seek(0)
        _escribir_de_una_pieza(destino, lambda salida: shutil.copyfileobj(archivo, salida, TROZO))
    return destino


def ruta_de(clave: str) -> Path:
    """Donde vive el archivo, para lo que necesita **una ruta y no los bytes**.

    `ifcopenshell` abre por ruta y lee el archivo por tramos; pasarle los bytes obligaria a tenerlo
    entero en memoria dos veces —una en la peticion y otra en la libreria— y un IFC federado son
    cientos de megas. Va aparte de `leer` a proposito: la clave se normaliza igual en las dos, y
    tener dos formas de componer la ruta es como se separan.
    """
    return Path(settings.DOCUMENTS_DIR) / normalize_storage_key(clave)


def leer(clave: str) -> bytes:
    """Los bytes enteros, para quien de verdad los necesita todos a la vez.

    Lo usan el calculo del `sha256` al verificar y la conversion a DXF, que trabajan sobre el
    contenido completo. **Para servir una descarga esta `abrir`**, que no lo carga.
    """
    return ruta_de(clave).read_bytes()


def abrir(clave: str):
    """El archivo abierto en binario, **para servirlo sin traerlo a memoria**.

    ## Por que existe

    La descarga hacia `FileResponse(BytesIO(storage.leer(clave)))`, o sea que **un IFC de 200 MB se
    materializaba entero en RAM para servirlo**. Con `workers = cpu*2+1` —nueve en una VM de cuatro
    nucleos— tres descargas grandes a la vez son uno o dos gigas de memoria residente, y el final de
    esa historia es el OOM killer llevandose un worker a mitad de otra cosa.

    `FileResponse` sobre un archivo abierto lo manda **por tramos**: la memoria que ocupa no depende
    del tamano del archivo.

    ## Y por que no un iterador, que fue el primer intento

    Esta escrito en la vista y se conserva aqui porque es la trampa: `FileResponse` solo llama a
    `set_headers` cuando el contenido tiene `read`, asi que con `iter([bytes])` se tragaba
    `as_attachment` y `filename` **sin avisar** — el nombre no llegaba al navegador. Un archivo
    abierto **si** tiene `read`, asi que cumple las dos cosas: nombre correcto y sin cargar nada.

    Quien recibe el archivo es responsable de cerrarlo; `FileResponse` lo hace al terminar de
    enviarlo.
    """
    return ruta_de(clave).open("rb")
