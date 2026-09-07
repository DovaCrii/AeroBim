"""Convertir DWG y DGN a DXF al entrar al expediente.

## Por qué existe, y por qué en el servidor

El usuario pidió poder **subir DWG o DGN y que se conviertan solos**. La decisión de fondo está en
`docs/FORMATOS.md`: el visor lee **un solo formato 2D** —DXF— y lo que entra al expediente se
normaliza al entrar. Es el mismo patrón que ya tienen las nubes de puntos, y es lo que mantiene
simple el visor: un lector, no tres.

**No se puede hacer en el navegador.** DWG y DGN v8 son formatos cerrados y el único lector completo
es el de la Open Design Alliance. La alternativa abierta para DWG —LibreDWG— es **GPL-3 y
contagiaría la licencia del producto entero**.

## La herramienta, y que hay que instalarla a mano

**ODA File Converter** es un ejecutable gratuito de la Open Design Alliance que convierte DWG → DXF
y DGN → DXF por lotes. Se descarga de su web con un registro, y **no se distribuye con AeroBim**: es
software de terceros con su propia licencia.

Así que este módulo **funciona sin él y lo dice**. Si no está instalado, la subida no falla —el
archivo se guarda igual, que es lo que un registro documental tiene que hacer— y la revisión queda
marcada como «no convertible todavía», con el motivo. Un registro que rechaza un archivo porque le
falta una herramienta de conversión es un registro que pierde el archivo.

## Cómo se instala

1. Descargar **ODA File Converter** de `openbase.opendesign.com` e instalarlo en el servidor.
2. Apuntar `AEROBIM_ODA_CONVERTER` a su ejecutable. En Windows suele ser:
   `C:\\Program Files\\ODA\\ODAFileConverter <version>\\ODAFileConverter.exe`
3. Reiniciar el servicio. `estado_del_conversor()` dice si lo encontró.

## Cómo funciona el conversor, que no es obvio

**No toma un archivo: toma dos carpetas.** Se le da una de entrada y una de salida, y convierte todo
lo que encuentre. Así que cada conversión se hace en un directorio temporal propio — y eso además
evita que dos subidas a la vez se pisen los archivos.

Sus argumentos, en orden, son posicionales y sin nombre:

    ODAFileConverter <entrada> <salida> <version> <tipo> <recursivo> <auditar> [filtro]

Y **devuelve 0 aunque no convierta nada**, así que el código de salida no sirve para saber si
funcionó: lo que se comprueba es **que el DXF exista** en la carpeta de salida.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings

#: Lo que este módulo sabe convertir, y a qué.
CONVERTIBLES: frozenset[str] = frozenset({"dwg", "dgn"})

#: A qué versión de DXF se convierte.
#:
#: **ACAD2018 y no la última que exista.** Es el formato que lee el parser propio de AeroBim y el
#: que abre cualquier CAD de los últimos años; pedir una versión más nueva no aporta nada y
#: arriesga construcciones que el lector no conoce.
VERSION_DXF = "ACAD2018"

#: Cuánto se le deja tardar. Un plano de obra convierte en segundos; cinco minutos es un plano que
#: se atascó, y dejarlo colgado bloquearía la subida de quien está esperando.
TIEMPO_MAXIMO_S = 300


class ConversionImposible(Exception):
    """No se pudo convertir, y el motivo va dentro. **No es un fallo de la subida.**"""

    def __init__(self, mensaje: str, codigo: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo


@dataclass(frozen=True)
class EstadoDelConversor:
    """Si la herramienta está y dónde. Lo consulta la pantalla de administración."""

    disponible: bool
    ruta: str
    motivo: str


def estado_del_conversor() -> EstadoDelConversor:
    """Dice si el conversor está instalado, **sin ejecutarlo**.

    Se mira la ruta configurada y que el archivo exista. No se lanza el programa para preguntarle
    su versión: arrancarlo cuesta segundos y esto se consulta al pintar una página.
    """
    ruta = getattr(settings, "ODA_CONVERTER", "") or ""
    if not ruta:
        return EstadoDelConversor(
            disponible=False,
            ruta="",
            motivo=(
                "No hay conversor configurado. Instala ODA File Converter y apunta "
                "AEROBIM_ODA_CONVERTER a su ejecutable."
            ),
        )
    if not Path(ruta).is_file():
        return EstadoDelConversor(
            disponible=False,
            ruta=ruta,
            motivo=f"AEROBIM_ODA_CONVERTER apunta a {ruta}, y ahí no hay ningún archivo.",
        )
    return EstadoDelConversor(disponible=True, ruta=ruta, motivo="")


def se_puede_convertir(extension: str) -> bool:
    """`True` si esa extensión es de las que este módulo convierte. No mira si hay herramienta."""
    return extension.lower().lstrip(".") in CONVERTIBLES


def a_dxf(contenido: bytes, extension: str) -> bytes:
    """Convierte un DWG o un DGN a DXF y devuelve sus bytes.

    Levanta `ConversionImposible` con su código cuando no se puede, y **el motivo es para la
    persona que subió el archivo**: es lo que le dice si tiene que hacer algo o si es cosa del
    servidor.

    Los códigos son estables y no dependen del idioma —la misma razón por la que `CargaRechazada`
    los lleva—: `sin-conversor`, `extension-no-convertible`, `sin-salida`, `tardo-demasiado`.
    """
    ext = extension.lower().lstrip(".")
    if not se_puede_convertir(ext):
        raise ConversionImposible(
            f"No se convierte un .{ext}: solo DWG y DGN.", "extension-no-convertible"
        )

    estado = estado_del_conversor()
    if not estado.disponible:
        raise ConversionImposible(estado.motivo, "sin-conversor")

    # **Una carpeta temporal por conversión.** El conversor trabaja sobre directorios enteros, así
    # que dos subidas a la vez en la misma carpeta se llevarían los archivos la una a la otra.
    with tempfile.TemporaryDirectory(prefix="aerobim-conv-") as raiz:
        base = Path(raiz)
        entrada = base / "entra"
        salida = base / "sale"
        entrada.mkdir()
        salida.mkdir()

        origen = entrada / f"plano.{ext}"
        origen.write_bytes(contenido)

        try:
            subprocess.run(  # noqa: S603 — la ruta la fija el administrador, no una petición
                [
                    estado.ruta,
                    str(entrada),
                    str(salida),
                    VERSION_DXF,
                    "DXF",
                    "0",  # sin recorrer subcarpetas: solo hay un archivo
                    "1",  # auditar y reparar, que es lo que salva un DWG con la tabla tocada
                ],
                capture_output=True,
                timeout=TIEMPO_MAXIMO_S,
                check=False,
            )
        except subprocess.TimeoutExpired as agotado:
            raise ConversionImposible(
                f"La conversión pasó de {TIEMPO_MAXIMO_S // 60} minutos y se cortó.",
                "tardo-demasiado",
            ) from agotado
        except OSError as fallo:
            raise ConversionImposible(
                f"No se pudo ejecutar el conversor: {fallo}", "sin-conversor"
            ) from fallo

        # **El código de salida no sirve: devuelve 0 aunque no convierta nada.** Lo que se
        # comprueba es que el DXF esté.
        dxf = next(salida.glob("*.dxf"), None)
        if dxf is None:
            raise ConversionImposible(
                "El conversor terminó sin escribir ningún DXF. Suele ser un archivo dañado o "
                "de una versión que no reconoce.",
                "sin-salida",
            )
        return dxf.read_bytes()


def dxf_para(contenido: bytes, extension: str) -> tuple[bytes | None, str]:
    """Intenta convertir, y **no levanta**: devuelve `(bytes, "")` o `(None, motivo)`.

    Es la forma que usa la subida. Un registro documental **tiene que guardar el archivo aunque no
    se pueda convertir**: el DXF es una comodidad para poder abrirlo en el visor, y el original es
    el entregable. Perder la subida porque falta una herramienta sería confundir las dos cosas.
    """
    try:
        return a_dxf(contenido, extension), ""
    except ConversionImposible as imposible:
        return None, str(imposible)


def hay_conversor() -> bool:
    """Atajo para las plantillas: `True` si la herramienta está instalada."""
    return estado_del_conversor().disponible


def ruta_por_defecto() -> str:
    """Dónde suele estar el ejecutable, para poder sugerirlo al configurar.

    Se busca en el `PATH` primero: quien lo instale bien no tendrá que configurar nada.
    """
    encontrado = shutil.which("ODAFileConverter")
    return encontrado or ""
