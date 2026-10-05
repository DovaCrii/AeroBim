"""El IFC comprimido de buildingSMART (`.ifczip`), **desempaquetado al entrar**.

## Por qué existe

Por un proyecto de metro, el 2026-09-28. El tope del registro son 200 MB por archivo
(`storage.TAMANO_MAXIMO_BYTES`, y nginx lleva el mismo) y un modelo de estación o de un tramo de
túnel los pasa. Pero un IFC es texto STEP, y comprime entre cinco y diez veces: el formato
**IFC-ZIP** —un `.zip` con un solo `.ifc` dentro, con la extensión `.ifczip`— es el estándar para
mandarlo, y lo exportan Revit, Tekla, ArchiCAD y Civil 3D.

## Por qué se desempaqueta y no se guarda así

El `.ifczip` es **el sobre**, no el entregable. Todo lo que viene después —el visor, las
interferencias, el IDS, la lectura de metadatos, el informe— lee un IFC por su ruta o por sus
bytes; guardarlo comprimido obligaría a enseñarle el formato a cada uno, y el primero que se
olvidara abriría un zip como si fuera STEP. Desempaquetado al entrar, **nada de lo de después
cambia**, y el tope pasa a medirse sobre lo que viaja, que es lo que el tope protege.

## Las tres guardas

1. **Un solo `.ifc` dentro.** Dos serían dos entregables en uno, y elegir uno sería decidir por
   quien subió cuál de sus modelos es el bueno.
2. **Un tope al descomprimir**, contado sobre lo que sale y no sobre lo que el zip declara: la
   cabecera de un zip la escribe quien lo manda, y una bomba de compresión declara lo que quiera.
3. **Lo de dentro tiene que ser texto**, la misma regla que un `.ifc` suelto (`validar_cabecera`).
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.utils.translation import gettext as _

from apps.documents.storage import CABECERA, TROZO, CargaRechazada, validar_cabecera

#: Lo máximo que puede ocupar el IFC **ya descomprimido**.
#:
#: **Dos gigas**, y el número no es de estética: `web-ifc` corre en WebAssembly de 32 bits, con un
#: techo de 4 GB para todo —el texto, el modelo que construye y su geometría—, así que un IFC mucho
#: mayor que esto no lo abre ningún navegador aunque el registro lo aceptara. Se puede ajustar por
#: entorno para el día en que haya un caso medido que lo pida.
TAMANO_MAXIMO_DESCOMPRIMIDO = int(os.environ.get("AEROBIM_IFCZIP_MAXIMO_MB", "2048")) * (
    1024 * 1024
)


@dataclass
class Desempaquetado:
    """El IFC que venía dentro, ya en un temporal junto al almacén, con su huella."""

    ruta: Path
    nombre: str
    sha256: str
    tamano: int

    def descartar(self) -> None:
        """Borra el temporal. Se llama pase lo que pase: un temporal de un giga no se deja atrás."""
        self.ruta.unlink(missing_ok=True)


def nombre_del_ifc(nombre_del_zip: str) -> str:
    """El nombre con que queda archivado: **el del sobre**, con su extensión de modelo.

    El de dentro suele ser genérico —`model.ifc`, `export.ifc`— y el que eligió quien subió es el
    del zip. `Estacion-E3.ifczip` se archiva como `Estacion-E3.ifc`.
    """
    return f"{Path(nombre_del_zip).stem}.ifc"


def desempaquetar(subido) -> Desempaquetado:
    """Saca el `.ifc` de un `.ifczip` a un temporal, **por tramos y sin cargarlo en memoria**.

    El temporal va en `DOCUMENTS_DIR` y no en `/tmp`: el paso siguiente lo mueve al almacén, y en
    el mismo sistema de archivos eso es un `os.replace` y no una copia de un giga.
    """
    subido.seek(0)
    try:
        sobre = zipfile.ZipFile(subido)
    except zipfile.BadZipFile as malo:
        raise CargaRechazada(
            _("The «ifczip» file is not a valid ZIP archive."), "ifczip-roto"
        ) from malo

    with sobre:
        modelos = [
            miembro
            for miembro in sobre.infolist()
            if not miembro.is_dir()
            and miembro.filename.lower().endswith(".ifc")
            # Las carpetas que añade el Finder de macOS al comprimir no son modelos.
            and not miembro.filename.startswith("__MACOSX/")
        ]
        if len(modelos) != 1:
            raise CargaRechazada(
                _("An «ifczip» has to contain exactly one .ifc file; this one has %(n)s.")
                % {"n": len(modelos)},
                "ifczip-sin-un-modelo",
            )
        modelo = modelos[0]
        if modelo.flag_bits & 0x1:
            raise CargaRechazada(
                _("The «ifczip» is password-protected: it cannot be opened here."),
                "ifczip-cifrado",
            )

        carpeta = Path(settings.DOCUMENTS_DIR)
        carpeta.mkdir(parents=True, exist_ok=True)
        descriptor, nombre_temporal = tempfile.mkstemp(
            prefix=".ifczip-", suffix=".parcial", dir=carpeta
        )
        ruta = Path(nombre_temporal)
        try:
            digest = hashlib.sha256()
            escrito = 0
            cabecera = b""
            with os.fdopen(descriptor, "wb") as salida, sobre.open(modelo) as entrada:
                for trozo in iter(lambda: entrada.read(TROZO), b""):
                    escrito += len(trozo)
                    # **Contado al salir, no creído de la cabecera**: ver el docstring del módulo.
                    if escrito > TAMANO_MAXIMO_DESCOMPRIMIDO:
                        raise CargaRechazada(
                            _(
                                "Uncompressed, the model is larger than %(mb)s MB: too big for a "
                                "browser to open."
                            )
                            % {"mb": TAMANO_MAXIMO_DESCOMPRIMIDO // (1024 * 1024)},
                            "ifczip-demasiado-grande",
                        )
                    if not cabecera:
                        cabecera = trozo[:CABECERA]
                    digest.update(trozo)
                    salida.write(trozo)
            if not escrito:
                raise CargaRechazada(_("The .ifc inside the «ifczip» is empty."), "vacio")
            validar_cabecera("ifc", cabecera)
        except (zipfile.BadZipFile, zlib.error, EOFError) as roto:
            # **Un zip truncado se descubre leyendo, no abriéndolo**: el índice va al final y puede
            # estar bien mientras los datos no. Sin esto, la subida de un archivo cortado a medias
            # por la red era un 500 en vez de un motivo.
            ruta.unlink(missing_ok=True)
            raise CargaRechazada(
                _("The «ifczip» file is damaged: the model inside could not be read."),
                "ifczip-roto",
            ) from roto
        except BaseException:
            ruta.unlink(missing_ok=True)
            raise

    return Desempaquetado(
        ruta=ruta,
        nombre=nombre_del_ifc(getattr(subido, "name", "") or modelo.filename),
        sha256=digest.hexdigest(),
        tamano=escrito,
    )
