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

Medido: **20 s** cruzando los dos modelos reales de la organizacion. **La peticion espera**, y es
decision del usuario del 2026-09-02: veinte segundos caben de sobra en los 120 del servidor, y una
cola traeria una forma nueva de fallar callada —un trabajo encolado que nadie procesa no da error—
que no hace falta pagar todavia.

**Pero ese razonamiento vale por par, y la peticion hace todos.** Este mismo parrafo decia «con
cuatro modelos son seis pares, o sea unos dos minutos» y a continuacion justificaba con los veinte
segundos de **uno**. Las dos frases estaban a tres lineas de distancia y se contradicen: seis pares
por veinte segundos son **120 s exactos**, que es justo el `timeout` de gunicorn
(`config/gunicorn.conf.py`). El worker se lleva un `SIGKILL` **al borde**, y lo que queda no es un
error limpio: las observaciones de los primeros pares **ya estan escritas**, asi que la pantalla da
un 502 y aun asi aparecen hallazgos nuevos. Es la peor combinacion posible.

Asi que la corrida ahora **se mide antes de empezar** —ver {@link cabe_en_una_peticion}— y si no
cabe, no arranca: se dice cuantos pares son, cuanto se estima y que el camino es el comando de
gestion, que no tiene `timeout` porque no es una peticion. Negarse antes es mejor que morir a mitad.

**Y esto reabre `F3.4` con el numero en la mano.** `MASTER_PLAN.md` dejo escrito que el umbral para
sacar el trabajo de la peticion son **30 s sobre un archivo real**; seis pares son 120. El dia que
una obra tenga cuatro modelos vigentes de verdad, la respuesta ya no es subir el tope.

Cada corrida deja su fila en `JobRun`: un trabajo que muere a mitad **no da error**, y la fila es la
unica forma de notarlo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from itertools import combinations

from django.db.models import Q
from django.utils.translation import gettext, ngettext

from apps.core.jobs import record_job_run
from apps.documents import storage
from apps.documents.agrupar import RADIO_POR_DEFECTO_M, Cumulo, agrupar
from apps.documents.interferencias import COLISION, INTERSECCION, Grupo, detectar
from apps.documents.models import Observacion, Revision

#: Lo que entra en una comparacion. Ver el docstring del modulo: cada exclusion evita un falso
#: positivo concreto, y las tres estan medidas sobre los modelos reales.
SELECTOR_POR_DEFECTO = "IfcElement, ! IfcFurnishingElement, ! IfcOpeningElement, ! IfcAnnotation"

#: Lo que tarda cruzar **un** par de modelos, medido sobre los dos reales de la organizacion.
#:
#: Es una estimacion y se usa como tal: un par de modelos federados grandes tardara mas y uno de dos
#: plantas pequenas menos. Sirve para lo unico que hace falta —decidir si la corrida **cabe** en una
#: peticion— y para eso un numero medido, aunque sea aproximado, es infinitamente mejor que el que
#: habia, que era ninguno.
SEGUNDOS_POR_PAR = 20

#: Cuanto se deja correr dentro de una peticion, en segundos.
#:
#: **Sale del `timeout` de gunicorn y no de un numero suelto**, para que los dos no se separen: si
#: alguien sube el tope del servidor, esto sube con el. Y se queda en **la mitad** a proposito,
#: porque la corrida no es lo unico que pasa en la peticion —abrir los archivos, escribir las
#: observaciones, componer la respuesta— y porque una estimacion de veinte segundos por par que se
#: quede corta no puede convertirse en un `SIGKILL`.
PRESUPUESTO_S = int(os.environ.get("GUNICORN_TIMEOUT", "120")) // 2


def segundos_estimados(pares: int) -> int:
    """Lo que se estima que tarda cruzar `pares` pares de modelos."""
    return pares * SEGUNDOS_POR_PAR


def cuantos_pares(cuantos_modelos: int) -> int:
    """Cuantas comparaciones salen de `n` modelos: todas contra todas, o sea `n·(n-1)/2`.

    Crece al cuadrado, y **ese es el problema**: dos modelos son un par, tres son tres, cuatro son
    **seis**. La sensacion de «he anadido un modelo mas» no se parece en nada al trabajo que anade.
    """
    return cuantos_modelos * (cuantos_modelos - 1) // 2


def cabe_en_una_peticion(pares: int) -> bool:
    """Si una corrida de `pares` pares se puede hacer dentro de una peticion HTTP.

    **Antes no se preguntaba, y por eso el worker moria al borde del `timeout`** dejando a medias
    una corrida cuyas primeras observaciones ya estaban escritas. Ver el docstring del modulo.

    Quien diga que no tiene una salida que si funciona y no tiene tope: el comando de gestion
    `detectar_interferencias`, que corre fuera de la peticion.
    """
    return segundos_estimados(pares) <= PRESUPUESTO_S


@dataclass
class Resultado:
    """Lo que dejo una corrida, con las cifras que hacen falta para decidir si sirvio."""

    pares: int = 0
    #: Modelos que se dejaron fuera porque su archivo no esta en el disco.
    sin_archivo: list[str] = field(default_factory=list)
    encontradas: int = 0
    #: En cuantos **problemas** se juntaron esas interferencias. `F5.5`.
    #:
    #: Va aparte de `encontradas` a proposito, y las dos se ensenan juntas: «35 interferencias en 13
    #: problemas» dice cuanto hay que triar *y* que el numero crudo no era el trabajo real.
    cumulos: int = 0
    abiertas: int = 0
    #: Ya tenian su observacion, en cualquier estado. **Incluye las descartadas**, que es el punto.
    repetidas: int = 0
    #: Sin GUID en ningun miembro: no se pueden volver a encontrar, asi que no se abren.
    sin_identidad: int = 0
    nuevas: list[Observacion] = field(default_factory=list)

    @property
    def resumen(self) -> str:
        """Las cifras de la corrida, en una linea que se lee.

        **Con `ngettext` y no con un `f-string`**, por la misma leccion que dejo el resumen de la
        importacion de BCF: «1 pares · 1 problemas · 1 nuevos» esta mal concordado, y es lo que ve
        quien pulsa el boton. La forma de plural la decide el idioma, no nosotros.

        **Las interferencias y los problemas van en la misma frase** a proposito: «35 interferencias
        en 13 problemas» dice cuanto hay que triar *y* que el numero crudo no era el trabajo real.
        Separados, el 35 se lee como la carga.

        Y esa frase se arma con **dos plurales y un marco**, no con un plural solo: `ngettext`
        concuerda con **un** numero, asi que un unico mensaje para los dos daba «2 interferencias en
        1 problemas». Cada cifra lleva su propio plural y el marco dice como se juntan.
        """
        interferencias = ngettext("%(n)d interference", "%(n)d interferences", self.encontradas) % {
            "n": self.encontradas
        }
        problemas = ngettext("%(n)d problem", "%(n)d problems", self.cumulos) % {"n": self.cumulos}

        partes = [
            ngettext("%(n)d pair", "%(n)d pairs", self.pares) % {"n": self.pares},
            gettext("%(interferencias)s in %(problemas)s")
            % {"interferencias": interferencias, "problemas": problemas},
            ngettext("%(n)d new", "%(n)d new", self.abiertas) % {"n": self.abiertas},
        ]
        # **El cero solo se calla donde no dice nada.** «0 nuevos» es la respuesta a «¿pasó algo?»
        # y va siempre; «0 ya estaban» en la primera corrida es ruido.
        if self.repetidas:
            partes.append(
                ngettext("%(n)d already there", "%(n)d already there", self.repetidas)
                % {"n": self.repetidas}
            )
        if self.sin_identidad:
            partes.append(
                ngettext("%(n)d without GUID", "%(n)d without GUID", self.sin_identidad)
                % {"n": self.sin_identidad}
            )
        if self.sin_archivo:
            partes.append(
                ngettext(
                    "%(n)d model with no file",
                    "%(n)d models with no file",
                    len(self.sin_archivo),
                )
                % {"n": len(self.sin_archivo)}
            )
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


def _titulo_de_cumulo(cumulo: Cumulo) -> str:
    """El titulo de un problema, que **dice cuantas interferencias trae**. `F5.5`.

    Tres formas, y cada una contesta lo que se puede contestar:

    - **Un solo conflicto**: lo de siempre, «A × B».
    - **Varios con un elemento compartido** —la viga de los veinte tornillos—: se titula por ese
      elemento y se dice contra cuantos choca. Es lo que hay que ir a mirar.
    - **Varios sin un unico compartido**: se titula por el conflicto representante y se dice cuantos
      mas hay. Pasa cuando tres elementos chocan cada uno contra los dos mismos, que es un problema
      y no tiene un «uno» que lo nombre.

    **Se cuentan parejas y no miembros**, que no es lo mismo: la deteccion informa el mismo
    conflicto dos veces cuando los dos modelos comparten GUID, y titularlo «A × B y 1 mas» contaria
    dos veces lo mismo delante de quien lo tiene que resolver.
    """
    cuantos = cumulo.parejas
    if cuantos == 1:
        return _titulo(cumulo.principal)

    compartido = cumulo.compartido
    if compartido:
        nombre = cumulo.nombre(compartido) or "Elemento"
        return f"{nombre} × {cuantos} elementos"[:250]

    return f"{_titulo(cumulo.principal)} y {cuantos - 1} más"[:250]


def _abrir(revision: Revision, autor, cumulo: Cumulo, otra: Revision) -> Observacion:
    """La observacion que nace de un problema, con su viewpoint ya apuntado. `F5.4` y `F5.5`.

    **Es lo que hace que el resultado sea navegable sin escribir una pantalla**: el visor ya sabe
    abrir una observacion desde `F4.8`, aislar lo que dice su visibilidad y dibujar su marcado.

    **Y lo que abre es un cumulo, no una interferencia.** La identidad la presta la pareja
    representante —ver `agrupar.py`— pero lo que se aisla y lo que se dibuja es el problema entero:
    todos sus elementos y un segmento por cada contacto. Abrir un cumulo de veinte y ensenar solo
    dos elementos afirmaria que el problema esta entre esos dos.
    """
    entregable = revision.entregable
    una = cumulo.principal
    cuantas = cumulo.parejas

    # **La separacion menor y no el promedio**: es la que decide si hay que tocar algo, y el
    # promedio de veinte contactos no describe ninguno de ellos.
    peor = min(otro.distancia for otro in cumulo.miembros)

    # **Un cero no se ensena como una medida.** En modo `collision` la libreria devuelve distancia
    # cero para todo lo que se cruza, asi que «Separacion menor: 0.0000 m» tiene el aspecto de una
    # medicion y no lo es: no dice cuanto se cruzan, dice que se cruzan. Y quien lo lee decide si va
    # a mirarlo por esa cifra.
    medida = f"Separación medida: {peor:.4f} m." if peor > 0 else "Los volúmenes se cruzan."
    if cuantas == 1:
        detalle = medida
    else:
        detalle = f"{cuantas} interferencias vecinas, agrupadas como un problema. {medida}"

    return Observacion.objects.create(
        organizacion=entregable.organizacion,
        proyecto=entregable.proyecto,
        revision=revision,
        titulo=_titulo_de_cumulo(cumulo),
        # **Con acentos, que esto lo lee una persona.** Los docstrings de este repositorio van sin
        # ellos por costumbre; el texto que sale a la pantalla, no.
        descripcion=(
            f"Detectada automáticamente entre {una.clase_a} de {entregable.codigo} y "
            f"{una.clase_b} de {otra.entregable.codigo}. {detalle}"
        ),
        prioridad=Observacion.MEDIA,
        autor=autor,
        # **Queda a nombre de quien la mando revisar** hasta que alguien la tome, igual que una nota
        # dejada desde el visor. Es cierto, y no una asignacion inventada.
        responsable=autor,
        ifc_guid=una.guid_a,
        interferencia_con=una.guid_b,
        # **Se aisla el problema entero**: abrirla deja en pantalla el cumulo y nada mas. `F4.7`.
        visibilidad={"porDefecto": False, "excepciones": list(cumulo.elementos)},
        # **Un segmento por contacto**, que es el marcado del viewpoint. `F4.5`.
        marcado=cumulo.marcado,
    )


def revisar_proyecto(
    proyecto,
    autor,
    *,
    admitir_roce: bool = False,
    tolerancia_m: float | None = None,
    seco: bool = False,
    selector: str = SELECTOR_POR_DEFECTO,
    radio_m: float = RADIO_POR_DEFECTO_M,
) -> Resultado:
    """Cruza todos los modelos vigentes de la obra y abre lo que encuentre.

    Con menos de dos modelos devuelve un resultado en blanco y **no es un fallo**: una obra con un
    solo modelo no tiene nada contra lo que compararlo.

    `radio_m` es cuan cerca tienen que estar dos contactos para contarse como el mismo problema; con
    **cero** se abre una observacion por interferencia, que es como se comportaba antes de `F5.5`.
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

            # **Se agrupa antes de abrir nada**, que es todo el punto: veinte tornillos contra la
            # misma viga tienen que llegar a la lista como una fila. Agrupar despues obligaria a
            # cerrar diecinueve observaciones que nunca debieron abrirse.
            cumulos = agrupar(encontradas, radio_m=radio_m)
            resultado.cumulos += len(cumulos)

            for cumulo in cumulos:
                identidades = cumulo.identidades
                if not identidades:
                    # Ningun miembro tiene pareja de GUID utilizable: no se puede reconocer en la
                    # corrida siguiente, asi que tampoco se puede descartar.
                    resultado.sin_identidad += 1
                    continue
                # **Basta con que una de sus parejas ya se conozca.** El cumulo es el mismo problema
                # aunque haya ganado o perdido un miembro entre corridas; exigir que coincidan todas
                # abriria una observacion nueva cada vez que alguien mueve un tornillo.
                if any(_ya_existe(proyecto, *pareja.split("·", 1)) for pareja in identidades):
                    resultado.repetidas += 1
                    continue
                resultado.abiertas += 1
                if not seco:
                    resultado.nuevas.append(_abrir(a, autor, cumulo, b))

        corrida.summary = (("(seco) " if seco else "") + resultado.resumen)[:300]

    return resultado
