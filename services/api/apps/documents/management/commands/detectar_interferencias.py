"""Detecta interferencias entre dos revisiones y las abre como observaciones: `F5.2` a `F5.5`.

**Por que un comando y no un boton.** Se midio: cruzar los dos modelos reales de la organizacion
—470 elementos contra 805— tarda **20 segundos**, y el mismo modelo grande contra si mismo, 15,7.
Es el primer trabajo de este repositorio que se acerca al umbral de 30 s que dejo escrito `F3.4`, y
veinte segundos dentro de una peticion no se sostienen. Deja su fila en `JobRun` como los demas
trabajos, asi que **una corrida que muere a mitad se ve** en vez de no pasar nada.

**Lo que sale no es una lista aparte: son observaciones.** Cada conflicto se abre como un tema del
registro con su viewpoint ya apuntado —`F5.4`— y eso hace que sea **navegable sin escribir una sola
pantalla nueva**:

- el **GUID** del elemento A es el ancla, y el panel de coordinacion del visor ya lo selecciona;
- la **visibilidad** aisla los dos elementos, asi que abrirla deja en pantalla el conflicto y nada
  mas — `F4.7` lo escribe como `DefaultVisibility="false"` con dos excepciones;
- el **marcado** es el segmento entre los dos puntos de contacto, que `F4.5` dibuja en el
  viewpoint;
- y **sin camara a proposito**: nadie eligio un punto de vista, asi que el visor encuadra el
  elemento —que es lo que se puede afirmar— en vez de inventar desde donde mirarlo.

**Y volver a correrlo no duplica nada.** La identidad de un conflicto es la pareja de GUID sin
orden, y antes de abrir uno se busca si ya existe. Un falso positivo que alguien dejo en
`descartada` **no se vuelve a abrir**, que es lo que `F5.5` pide y la razon de que la herramienta se
use una segunda vez.
"""

from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.core.jobs import record_job_run
from apps.documents import storage
from apps.documents.interferencias import (
    COLISION,
    INTERSECCION,
    Grupo,
    GrupoVacio,
    Interferencia,
    detectar,
    identidad,
)
from apps.documents.models import Observacion, Revision


class Command(BaseCommand):
    """Compara **dos revisiones concretas**, que es lo que hace falta para probar y para dirigir.

    **La corrida de obra completa vive en otro sitio**: `apps/documents/revisar.py`, y la usan la
    pantalla del proyecto y quien quiera cruzarlo todo. Este comando se queda con el caso dirigido
    —«estructura contra instalaciones, con esta tolerancia»— porque es el que necesita elegir los
    selectores a mano.
    """

    help = "Detecta interferencias entre dos revisiones y las abre como observaciones."

    def add_arguments(self, parser):
        parser.add_argument("revision_a", help="UUID de la revision del grupo A.")
        parser.add_argument("revision_b", help="UUID de la revision del grupo B.")
        parser.add_argument(
            "--clase-a",
            default="IfcElement",
            help="Selector de IfcOpenShell para el grupo A. Por defecto, todos los elementos.",
        )
        parser.add_argument("--clase-b", default="IfcElement", help="Selector del grupo B.")
        parser.add_argument(
            "--autor",
            required=True,
            help="Usuario que queda como autor de las observaciones que se abran.",
        )
        parser.add_argument(
            "--admitir-roce",
            action="store_true",
            help="Cuenta como conflicto dos caras que coinciden sin penetrar. Por defecto no.",
        )
        parser.add_argument(
            "--tolerancia",
            type=float,
            default=None,
            help="Penetracion minima en metros. Con esto se usa el modo interseccion.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Cuenta lo que se abriria, sin escribir nada.",
        )

    def handle(self, *args, **options):
        seco = options["dry_run"]
        autor = get_user_model().objects.filter(username=options["autor"]).first()
        if autor is None:
            raise CommandError(f"No hay ningun usuario «{options['autor']}».")

        a = self._revision(options["revision_a"])
        b = self._revision(options["revision_b"])

        with record_job_run("detectar_interferencias") as corrida:
            tolerancia = options["tolerancia"]
            try:
                encontradas = detectar(
                    Grupo(ruta=self._ruta(a), selector=options["clase_a"]),
                    Grupo(ruta=self._ruta(b), selector=options["clase_b"]),
                    modo=INTERSECCION if tolerancia is not None else COLISION,
                    admitir_roce=options["admitir_roce"],
                    **({"tolerancia_m": tolerancia} if tolerancia is not None else {}),
                )
            except GrupoVacio as vacio:
                # **Es un error de quien pide la comparacion**, no del trabajo: se dice y se acaba,
                # en vez de dejar la fila de `JobRun` en error por algo que se arregla cambiando un
                # selector.
                raise CommandError(str(vacio)) from vacio

            abiertas, repetidas, sin_identidad = 0, 0, 0
            for una in encontradas:
                clave = identidad(una)
                if clave == "":
                    # Sin GUID no se puede volver a encontrar el conflicto en la corrida siguiente,
                    # asi que abrirlo garantizaria un duplicado la proxima vez.
                    sin_identidad += 1
                    continue

                if self._ya_existe(a, una.guid_a, una.guid_b):
                    repetidas += 1
                    continue

                if not seco:
                    self._abrir(a, autor, una)
                abiertas += 1

            resumen = (
                f"{len(encontradas)} interferencias · {abiertas} nuevas · "
                f"{repetidas} ya estaban · {sin_identidad} sin GUID"
            )
            if seco:
                resumen = f"(seco) {resumen}"
            corrida.summary = resumen[:300]
            self.stdout.write(self.style.SUCCESS(resumen))

    def _revision(self, pk: str) -> Revision:
        revision = (
            Revision.objects.select_related("entregable__proyecto", "entregable__organizacion")
            .filter(pk=pk)
            .first()
        )
        if revision is None:
            raise CommandError(f"No hay ninguna revision {pk}.")
        return revision

    def _ruta(self, revision: Revision) -> Path:
        ruta = storage.ruta_de(revision.clave_archivo)
        if not ruta.is_file():
            # El archivo vive fuera del repositorio, bajo el control del operador: un montaje mal
            # puesto deja la clave apuntando a nada, y decirlo aca ahorra buscar el fallo en la
            # libreria de geometria.
            raise CommandError(f"El archivo de la revision {revision.pk} no esta en {ruta}.")
        return ruta

    def _ya_existe(self, revision: Revision, guid_a: str, guid_b: str) -> bool:
        """`True` si la pareja ya tiene observacion, **en cualquier orden y cualquier estado**.

        Que cuente tambien las cerradas y descartadas es el punto entero de `F5.5`: un falso
        positivo que alguien descarto no se vuelve a abrir en la corrida siguiente.
        """
        pareja = Q(ifc_guid=guid_a, interferencia_con=guid_b) | Q(
            ifc_guid=guid_b, interferencia_con=guid_a
        )
        return (
            Observacion.objects.filter(proyecto=revision.entregable.proyecto)
            .filter(pareja)
            .exists()
        )

    def _abrir(self, revision: Revision, autor, una: Interferencia) -> Observacion:
        entregable = revision.entregable

        return Observacion.objects.create(
            organizacion=entregable.organizacion,
            proyecto=entregable.proyecto,
            revision=revision,
            titulo=self._titulo(una),
            descripcion=(
                f"Detectada automaticamente entre {una.clase_a} y {una.clase_b}. "
                f"Separacion medida: {una.distancia:.4f} m."
            ),
            prioridad=Observacion.MEDIA,
            autor=autor,
            # **Sin responsable asignado**: queda a nombre de quien corrio la deteccion hasta que
            # alguien la tome, igual que una nota dejada desde el visor. Es cierto, y no una
            # asignacion inventada.
            responsable=autor,
            ifc_guid=una.guid_a,
            interferencia_con=una.guid_b,
            # **Se aisla la pareja**: abrirla deja en pantalla el conflicto y nada mas. `F4.7`.
            visibilidad={"porDefecto": False, "excepciones": [una.guid_a, una.guid_b]},
            # **El segmento entre los dos puntos de contacto**, que es el marcado del viewpoint.
            marcado=[{"inicio": una.punto_a, "fin": una.punto_b}],
        )

    def _titulo(self, una: Interferencia) -> str:
        """Qué choca con qué, sin abrir nada.

        Misma regla que `tituloDeInterferencia` de `bim-core`: el nombre del elemento cuando lo
        trae y su clase IFC cuando no. Treinta conflictos llamados todos «Interferencia detectada»
        no se pueden repartir ni priorizar.
        """

        def nombrar(nombre: str, clase: str) -> str:
            return (nombre or "").strip() or (clase or "").strip() or "Elemento"

        a = nombrar(una.nombre_a, una.clase_a)
        b = nombrar(una.nombre_b, una.clase_b)
        return f"{a} × {b}"[:250]
