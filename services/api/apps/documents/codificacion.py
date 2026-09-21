"""La nomenclatura de los códigos de entregable, según ISO 19650.

**Por qué existe.** Hasta hoy `Entregable.codigo` era texto libre sin una sola regla escrita: ni
validación, ni generador, ni un documento que dijera qué forma tiene. En `docs/` no había nada sobre
codificación. El resultado es el previsible — cada quien inventa el suyo, y dos personas de la misma
oficina codifican el mismo plano distinto.

**La estructura**, siete campos separados por `-`, que es la de BS EN ISO 19650-2 (Anexo Nacional)
para el nombre de un contenedor de información::

    OBRA  - ORIG - VOL - NIV - TIPO - DISC - NÚMERO
    716LCD-  JEJ -  ZZ -  XX -   M3 -   ME -   0001

- **OBRA**: el código del proyecto, sin separadores.
- **ORIG**: quién lo originó. Sale de la organización, que ya lo sabe.
- **VOL**: volumen o sistema. `ZZ` = toda la obra, que es el caso normal.
- **NIV**: nivel o ubicación. `XX` = varios niveles, `ZZ` = no aplica.
- **TIPO**: qué clase de documento es, en el vocabulario de la norma (`DR`, `M3`, `RP`…).
- **DISC**: la disciplina; sale de `Disciplina.codigo`, que ya existe.
- **NÚMERO**: el correlativo dentro de esa combinación, con cuatro cifras.

## La decisión que gobierna todo este módulo: propone, no obliga

`Revision.correlativo` lleva escrito desde su primer día el motivo, y vale igual aquí: *«cada
mandante impone el suyo, y forzar un formato rechaza documentos válidos»*. Un plano que llega de un
tercero con **su** codificación es un documento válido, y una aplicación que no lo deja registrar no
es más rigurosa: es inservible.

Entonces este módulo **compone el código que corresponde y lo ofrece hecho** —con el número ya
calculado—, y si alguien teclea otro, lo dice y lo guarda. Es exactamente la misma política que ya
rige el correlativo de revisión, y la razón por la que aquí no hay ningún `validators=[...]` colgado
del campo del modelo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from django.utils.translation import gettext_lazy as _

SEPARADOR = "-"

#: Ancho del correlativo. Cuatro cifras porque tres se agotan en una obra grande y cinco no se leen.
CIFRAS = 4

#: Cuando no se sabe el volumen o el nivel. Son los comodines de la propia norma, no invención
#: nuestra: `ZZ` es «todos / no aplica» y `XX` es «varios».
TODO = "ZZ"
VARIOS = "XX"

#: De nuestro `TipoEntregable` al vocabulario de tipos de la norma.
#:
#: **El modelo no cambia de valores.** `TipoEntregable` está en la base, en los formularios y en
#: las traducciones; reescribirlo para que diga `DR` en vez de `plano` sería una migración con
#: riesgo a cambio de nada. La traducción vive aquí, que es el único sitio que la necesita.
TIPO_ISO = {
    "plano": "DR",  # Drawing
    "modelo": "M3",  # Model, 3D
    "memoria": "RP",  # Report
    "especificacion": "SP",  # Specification
    "otro": TODO,
}

#: Lo que se dibuja en la ayuda del campo, para que el vocabulario no viva solo en el código.
TIPOS_EXPLICADOS = (
    ("DR", _("Drawing")),
    ("M3", _("3D model")),
    ("RP", _("Report")),
    ("SP", _("Specification")),
    (TODO, _("Other or not applicable")),
)

# Cada campo: letras, cifras, y nada más. El número, solo cifras.
_CAMPO = r"[A-Z0-9]+"
PATRON = re.compile(
    rf"^(?P<obra>{_CAMPO}){SEPARADOR}"
    rf"(?P<originador>{_CAMPO}){SEPARADOR}"
    rf"(?P<volumen>{_CAMPO}){SEPARADOR}"
    rf"(?P<nivel>{_CAMPO}){SEPARADOR}"
    rf"(?P<tipo>{_CAMPO}){SEPARADOR}"
    rf"(?P<disciplina>{_CAMPO}){SEPARADOR}"
    rf"(?P<numero>\d+)$"
)


@dataclass(frozen=True)
class Partes:
    """Un código ya desarmado. `None` si el código no sigue la estructura."""

    obra: str
    originador: str
    volumen: str
    nivel: str
    tipo: str
    disciplina: str
    numero: int

    def __str__(self) -> str:
        return SEPARADOR.join(
            (
                self.obra,
                self.originador,
                self.volumen,
                self.nivel,
                self.tipo,
                self.disciplina,
                f"{self.numero:0{CIFRAS}d}",
            )
        )


def normaliza(codigo: str) -> str:
    """Lo que se guarda: sin espacios en los bordes y en mayúsculas.

    **Es un identificador, no un texto.** `716LCD-JEJ-…` y `716lcd-jej-…` son el mismo documento, y
    la restricción de unicidad de la base los da por distintos. `Proyecto` y `Disciplina` ya lo
    hacían; `Entregable` era el único que no, y es el que más códigos tiene.
    """
    return (codigo or "").strip().upper()


def partes(codigo: str) -> Partes | None:
    """Desarma un código, o `None` si no sigue la estructura.

    Devuelve `None` en vez de levantar porque **lo normal es que algunos no encajen**: los
    documentos que llegan de terceros traen la codificación de quien los mandó. Un código ajeno no
    es un error que haya que capturar, es un caso previsto.
    """
    encontrado = PATRON.match(normaliza(codigo))
    if encontrado is None:
        return None
    datos = encontrado.groupdict()
    return Partes(
        obra=datos["obra"],
        originador=datos["originador"],
        volumen=datos["volumen"],
        nivel=datos["nivel"],
        tipo=datos["tipo"],
        disciplina=datos["disciplina"],
        numero=int(datos["numero"]),
    )


def sigue_la_norma(codigo: str) -> bool:
    return partes(codigo) is not None


def _limpia(texto: str, por_defecto: str = TODO) -> str:
    """Un campo del código a partir de un texto cualquiera: solo letras y cifras, en mayúsculas."""
    limpio = re.sub(r"[^A-Z0-9]", "", (texto or "").upper())
    return limpio or por_defecto


def originador_de(organizacion) -> str:
    """Quién origina el documento, sacado de la organización.

    Sale del `slug`, que ya existe y ya es único, en vez de pedir un campo nuevo que alguien tendría
    que rellenar antes de que la codificación sirviera de algo. Se corta a seis caracteres: es un
    campo de un nombre de archivo, no una razón social.
    """
    return _limpia(getattr(organizacion, "slug", "") or getattr(organizacion, "nombre", ""))[:6]


def compone(
    *,
    proyecto,
    tipo: str,
    disciplina,
    numero: int,
    volumen: str = TODO,
    nivel: str = VARIOS,
) -> str:
    """El código que le corresponde a un entregable."""
    return str(
        Partes(
            obra=_limpia(getattr(proyecto, "codigo", "")),
            originador=originador_de(getattr(proyecto, "organizacion", None)),
            volumen=_limpia(volumen),
            nivel=_limpia(nivel, VARIOS),
            tipo=TIPO_ISO.get(tipo, TODO),
            disciplina=_limpia(getattr(disciplina, "codigo", "")),
            numero=numero,
        )
    )


def siguiente_numero(proyecto, tipo: str, disciplina) -> int:
    """El correlativo que sigue para esa combinación de obra, tipo y disciplina.

    **Se calcula leyendo los códigos, no contando filas.** Contar entregables daría un número
    repetido en cuanto alguien borre uno o registre uno con codificación ajena; leer el mayor que ya
    existe da siempre uno libre.

    Los códigos que no siguen la estructura **no cuentan**, y es lo correcto: el `P-102` que mandó
    un tercero no dice nada sobre cuál es nuestro siguiente número.
    """
    if proyecto is None or disciplina is None:
        return 1

    tipo_iso = TIPO_ISO.get(tipo, TODO)
    disciplina_iso = _limpia(getattr(disciplina, "codigo", ""))

    mayor = 0
    for codigo in proyecto.entregables.values_list("codigo", flat=True):
        desarmado = partes(codigo)
        if desarmado is None:
            continue
        if desarmado.tipo == tipo_iso and desarmado.disciplina == disciplina_iso:
            mayor = max(mayor, desarmado.numero)
    return mayor + 1


def propuesta(proyecto, tipo: str, disciplina) -> str:
    """El código completo que se le ofrece hecho a quien registra un entregable."""
    return compone(
        proyecto=proyecto,
        tipo=tipo,
        disciplina=disciplina,
        numero=siguiente_numero(proyecto, tipo, disciplina),
    )
