"""Revisar las interferencias de una obra entera y abrirlas como observaciones: `F5.1` a `F5.5`.

**Existe porque «comparar dos revisiones» no es como se coordina una obra.** Un coordinador no
elige dos UUID: pregunta «¿choca algo?». Asi que esto toma **la revision vigente de cada entregable
que trae un modelo** y las cruza todas contra todas.

Vive aparte del comando de gestion a proposito: lo usan **los dos** —la terminal y la pantalla— y
tener la logica en el comando obligaria a la vista a invocarse a si misma por la linea de comandos,
que es como se acaba con dos comportamientos distintos para lo mismo.

## Lo que entra en una comparacion, y lo que no

El selector por defecto es `IfcElement` **menos tres clases**, y cada exclusion evita un tipo
concreto de falso positivo:

- **`IfcOpeningElement`** — un hueco **choca con todo por definicion**: es el volumen que se resta
  del muro. Dejarlo dentro llena la lista de conflictos que son la propia construccion del modelo.
- **`IfcFurnishingElement`** — una silla que atraviesa un tabique no es un problema de obra. En
  `Piso 5.ifc` son 59 de 548 elementos, o sea un diez por ciento de ruido de entrada.
- **`IfcAnnotation`** — no es geometria construida.

## Que tarda, y por que se espera

Medido: **20 s** cruzando los dos modelos reales de la organizacion. Con cuatro modelos son seis
pares, o sea unos dos minutos. **La peticion espera**, y es una decision del usuario del
2026-09-02: veinte segundos caben de sobra en los 120 del servidor, y una cola traeria una forma
nueva de fallar callada —un trabajo encolado que nadie procesa no da error— que no hace falta pagar
todavia. Si un par federado se pasa del minuto, ahi se monta con el numero en la mano.

Cada corrida deja su fila en `JobRun`: un trabajo que muere a mitad **no da error**, y la fila es la
unica forma de notarlo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

from django.db.models import Q

from apps.core.jobs import record_job_run
from apps.documents import storage
from apps.documents.interferencias import COLISION, INTERSECCION, Grupo, detectar, identidad
from apps.documents.models import Observacion, Revision

#: Lo que entra en una comparacion. Ver el docstring del modulo: cada exclusion evita un falso
#: positivo concreto, y las tres estan medidas sobre los modelos reales.
SELECTOR_POR_DEFECTO = "IfcElement, ! IfcFurnishingElement, ! IfcOpeningElement, ! IfcAnnotation"


@dataclass
class Resultado:
    """Lo que dejo una corrida, con las cifras que hacen falta para decidir si sirvio."""

    pares: int = 0
    #: Modelos que se dejaron fuera porque su archivo no esta en el disco.
    sin_archivo: list[str] = field(default_factory=list)
    encontradas: int = 0
    abiertas: int = 0
    #: Ya tenian su observacion, en cualquier estado. **Incluye las descartadas**, que es el punto.
    repetidas: int = 0
    #: Sin GUID en algun lado: no se pueden volver a encontrar, asi que no se abren.
    sin_identidad: int = 0
    nuevas: list[Observacion] = field(default_factory=list)

    @property
    def resumen(self) -> str:
        partes = [
            f"{self.pares} pares",
            f"{self.encontradas} interferencias",
            f"{self.abiertas} nuevas",
            f"{self.repetidas} ya estaban",
        ]
        if self.sin_identidad:
            partes.append(f"{self.sin_identidad} sin GUID")
        if self.sin_archivo:
            partes.append(f"{len(self.sin_archivo)} modelos sin archivo")
        return " · ".join(partes)


def modelos_vigentes(proyecto) -> list[Revision]:
    """La revision vigente de cada entregable de la obra que trae un modelo IFC.

    **Solo la vigente**, y es lo que se quiere: revisar contra una revision superada seria abrir
    conflictos de un modelo que ya nadie usa.
    """
    return list(
        Revision.objects.filter(
            entregable__proyecto=proyecto,
            es_vigente=True,
            is_active=True,
            nombre_original__iendswith=".ifc",
        )
        .select_related("entregable__proyecto", "entregable__organizacion")
        .order_by("entregable__codigo")
    )


def _ya_existe(proyecto, guid_a: str, guid_b: str) -> bool:
    """`True` si la pareja ya tiene observacion, **en cualquier orden y cualquier estado**.

    Que cuente tambien las descartadas es el punto entero de `F5.5`: un falso positivo que alguien
    descarto no se vuelve a abrir en la corrida siguiente. Si volviera, nadie abriria la
    herramienta una segunda vez.
    """
    pareja = Q(ifc_guid=guid_a, interferencia_con=guid_b) | Q(
        ifc_guid=guid_b, interferencia_con=guid_a
    )
    return Observacion.objects.filter(proyecto=proyecto).filter(pareja).exists()


def _titulo(una) -> str:
    """Que choca con que, sin abrir nada.

    Misma regla que `tituloDeInterferencia` de `bim-core`: el nombre del elemento cuando lo trae y
    su clase IFC cuando no. Treinta conflictos llamados todos «Interferencia detectada» no se
    pueden repartir ni priorizar.
    """

    def nombrar(nombre: str, clase: str) -> str:
        return (nombre or "").strip() or (clase or "").strip() or "Elemento"

    a = nombrar(una.nombre_a, una.clase_a)
    b = nombrar(una.nombre_b, una.clase_b)
    return f"{a} × {b}"[:250]


def _abrir(revision: Revision, autor, una, otra: Revision) -> Observacion:
    """La observacion que nace de un conflicto, con su viewpoint ya apuntado. `F5.4`.

    **Es lo que hace que el resultado sea navegable sin escribir una pantalla**: el visor ya sabe
    abrir una observacion desde `F4.8`, aislar lo que dice su visibilidad y dibujar su marcado.
    """
    entregable = revision.entregable
    return Observacion.objects.create(
        organizacion=entregable.organizacion,
        proyecto=entregable.proyecto,
        revision=revision,
        titulo=_titulo(una),
        descripcion=(
            f"Detectada automaticamente entre {una.clase_a} de {entregable.codigo} y "
            f"{una.clase_b} de {otra.entregable.codigo}. "
            f"Separacion medida: {una.distancia:.4f} m."
        ),
        prioridad=Observacion.MEDIA,
        autor=autor,
        # **Queda a nombre de quien la mando revisar** hasta que alguien la tome, igual que una nota
        # dejada desde el visor. Es cierto, y no una asignacion inventada.
        responsable=autor,
        ifc_guid=una.guid_a,
        interferencia_con=una.guid_b,
        # **Se aisla la pareja**: abrirla deja en pantalla el conflicto y nada mas. `F4.7`.
        visibilidad={"porDefecto": False, "excepciones": [una.guid_a, una.guid_b]},
        # **El segmento entre los dos puntos de contacto**, que es el marcado del viewpoint. `F4.5`.
        marcado=[{"inicio": una.punto_a, "fin": una.punto_b}],
    )


def revisar_proyecto(
    proyecto,
    autor,
    *,
    admitir_roce: bool = False,
    tolerancia_m: float | None = None,
    seco: bool = False,
    selector: str = SELECTOR_POR_DEFECTO,
) -> Resultado:
    """Cruza todos los modelos vigentes de la obra y abre lo que encuentre.

    Con menos de dos modelos devuelve un resultado en blanco y **no es un fallo**: una obra con un
    solo modelo no tiene nada contra lo que compararlo.
    """
    resultado = Resultado()
    revisiones = modelos_vigentes(proyecto)

    utiles: list[Revision] = []
    for revision in revisiones:
        if storage.ruta_de(revision.clave_archivo).is_file():
            utiles.append(revision)
        else:
            # El archivo vive fuera del repositorio: un montaje mal puesto deja la clave apuntando
            # a nada. Se dice cual y se sigue con los demas, en vez de tumbar la corrida entera.
            resultado.sin_archivo.append(revision.entregable.codigo)

    with record_job_run("revisar_interferencias") as corrida:
        for a, b in combinations(utiles, 2):
            resultado.pares += 1
            encontradas = detectar(
                Grupo(ruta=storage.ruta_de(a.clave_archivo), selector=selector),
                Grupo(ruta=storage.ruta_de(b.clave_archivo), selector=selector),
                modo=INTERSECCION if tolerancia_m is not None else COLISION,
                admitir_roce=admitir_roce,
                **({"tolerancia_m": tolerancia_m} if tolerancia_m is not None else {}),
            )
            resultado.encontradas += len(encontradas)

            for una in encontradas:
                if identidad(una) == "":
                    resultado.sin_identidad += 1
                    continue
                if _ya_existe(proyecto, una.guid_a, una.guid_b):
                    resultado.repetidas += 1
                    continue
                resultado.abiertas += 1
                if not seco:
                    resultado.nuevas.append(_abrir(a, autor, una, b))

        corrida.summary = (("(seco) " if seco else "") + resultado.resumen)[:300]

    return resultado
