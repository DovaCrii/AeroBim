"""Las cifras del piloto, **de solo lectura**, sobre lo que la base ya guarda.

## Por que un comando y no una pantalla

Porque estas cifras se leen una vez por semana, en el triage, y una pantalla mas seria una pantalla
mas que mantener, traducir y probar para eso. Y porque el resultado se pega en la bitacora de
`docs/PILOTO.md`: sale como texto ancho fijo a proposito.

## De solo lectura, y no es un detalle

**No escribe nada, no crea una fila de `JobRun`, y no manda correo.** Se puede correr en produccion
a mitad de una sesion sin cambiar lo que se esta midiendo — que es el punto de una metrica—. Dos
pruebas lo fijan: una cuenta las filas de cada tabla que toca antes y despues, y la otra comprueba
que no queda una fila de `JobRun` (a diferencia de `enviar_resumen`: **medir no es un trabajo
programado**, y una fila por cada consulta llenaria el historial y taparia lo que hay que ver).

## Lo que NO puede contestar, dicho aqui para que nadie lo busque

- **El tiempo de expediente a modelo.** Sale del `Δ` entre `GET /documentos/entregables/<pk>/` y
  `GET /api/revisiones/<pk>/contenido/` en `aerobim.log`, y **el «hasta verse» nadie lo registra**:
  eso es cronometro en la sesion. La base no lo sabe.
- **Los errores 4xx y 5xx.** Estan en el log por `status_code`, no en una tabla.
- **Si alguien abandono una tarea.** Se ve mirando, no contando.

O sea que esto es **la mitad automatica** de las metricas del piloto. La otra mitad se anota a mano
en la bitacora, y la primera semana es la linea base: **no se fijan metas antes de tenerla**.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q
from django.utils import timezone

from apps.documents.models import Comentario, Observacion
from apps.projects.models import Proyecto

#: Cuantos dias se miran por omision. Dos semanas: una es la linea base y la otra es con lo que se
#: compara, que es lo minimo para que una diferencia signifique algo.
DIAS_POR_OMISION = 14


def _dia(texto: str, cual: str) -> dt.date:
    try:
        return dt.date.fromisoformat(texto)
    except ValueError as error:
        raise CommandError(f"--{cual} tiene que ser una fecha AAAA-MM-DD, no «{texto}»") from error


class Command(BaseCommand):
    help = "Las cifras del piloto sobre lo que la base ya guarda. No escribe nada."

    def add_arguments(self, parser):
        parser.add_argument("--desde", default="", metavar="AAAA-MM-DD")
        parser.add_argument("--hasta", default="", metavar="AAAA-MM-DD")
        parser.add_argument(
            "--obra",
            default="",
            metavar="CODIGO",
            help="Codigo de la obra. Por omision, todas las que haya.",
        )

    def handle(self, *args, **opciones):
        hasta = _dia(opciones["hasta"], "hasta") if opciones["hasta"] else timezone.localdate()
        desde = (
            _dia(opciones["desde"], "desde")
            if opciones["desde"]
            else hasta - dt.timedelta(days=DIAS_POR_OMISION)
        )
        if desde > hasta:
            raise CommandError(f"--desde ({desde}) es posterior a --hasta ({hasta}).")

        observaciones = Observacion.objects.all()
        if opciones["obra"]:
            obra = Proyecto.objects.filter(codigo=opciones["obra"]).first()
            if obra is None:
                raise CommandError(f"No hay ninguna obra con codigo «{opciones['obra']}».")
            observaciones = observaciones.filter(proyecto=obra)

        # **El rango se cierra por el final del dia y no por el dia.** `created_at` es un instante:
        # con `created_at__lte=hasta` una observacion abierta a las 10 de la mañana del ultimo dia
        # se queda fuera, porque `hasta` vale como su medianoche. Ese error deja un dia entero sin
        # contar justo en el borde que se esta mirando.
        fin = timezone.make_aware(dt.datetime.combine(hasta, dt.time.max))
        inicio = timezone.make_aware(dt.datetime.combine(desde, dt.time.min))

        self.stdout.write(f"Metricas del piloto · {desde} a {hasta}")
        if opciones["obra"]:
            self.stdout.write(f"Obra: {opciones['obra']}")
        self.stdout.write("")

        self._movimiento(observaciones, inicio, fin)
        self._ciclo(observaciones, inicio, fin)
        self._contexto(observaciones, inicio, fin)
        self._etiquetas(observaciones, inicio, fin)
        self._conversacion(observaciones, inicio, fin)
        self._pendiente(observaciones)

        self.stdout.write("")
        self.stdout.write(
            "Esto es la mitad automatica. El tiempo de expediente a modelo y los 4xx/5xx "
            "salen del log, y el «hasta verse» del cronometro de la sesion."
        )

    # --- Cuantas entran y cuantas salen -----------------------------------------------

    def _movimiento(self, consulta, inicio, fin) -> None:
        creadas = consulta.filter(created_at__range=(inicio, fin)).count()
        # **Se cuenta por `cerrada_en` y no por `estado`.** Contar las que hoy estan cerradas diria
        # cuantas hay cerradas, no cuantas se cerraron en el rango: son dos preguntas distintas y la
        # segunda es la que dice si el equipo avanza.
        cerradas = consulta.filter(cerrada_en__range=(inicio, fin), estado=Observacion.CERRADA)
        descartadas = consulta.filter(
            cerrada_en__range=(inicio, fin), estado=Observacion.DESCARTADA
        )

        self.stdout.write("HALLAZGOS")
        self.stdout.write(f"  abiertos en el rango     {creadas}")
        self.stdout.write(f"  cerrados en el rango     {cerradas.count()}")
        self.stdout.write(f"  descartados en el rango  {descartadas.count()}")
        # **Descartado no es cerrado.** Sumarlos haria que descartar bajara el contador igual que
        # arreglar, que es precisamente el atajo que esta cifra tiene que delatar.
        if descartadas.count() and creadas:
            parte = 100 * descartadas.count() / (cerradas.count() + descartadas.count())
            self.stdout.write(f"  de lo resuelto, descartado: {parte:.0f} %")

        # **Lo que esta cerrado y no dice cuando: se declara en vez de descartarse en silencio.**
        #
        # Contar por `cerrada_en` es lo correcto —ver arriba—, pero deja fuera cualquier fila que
        # este cerrada sin fecha, y esas filas existen: en la base de desarrollo hay una, anterior
        # a que `Observacion.cerrar()` pusiera el campo. Hoy los dos caminos que cierran lo ponen
        # siempre (`models.py:559` y `:585`), asi que esta linea deberia salir en cero — y si sale
        # en otra cosa, es un camino nuevo que se olvido del campo, no un dato raro. Sin decirlo,
        # el numero de cerradas seria plausible y corto.
        sin_fecha = consulta.filter(
            estado__in=(Observacion.CERRADA, Observacion.DESCARTADA), cerrada_en__isnull=True
        ).count()
        if sin_fecha:
            self.stdout.write(
                f"  ojo: {sin_fecha} resueltas sin fecha de cierre, fuera de las cifras de arriba"
            )

    # --- Cuanto tardan --------------------------------------------------------------

    def _ciclo(self, consulta, inicio, fin) -> None:
        cerradas = consulta.filter(
            cerrada_en__range=(inicio, fin), estado=Observacion.CERRADA
        ).values_list("created_at", "cerrada_en")
        if not cerradas:
            self.stdout.write("")
            self.stdout.write("TIEMPO DE CICLO: ninguna cerrada en el rango")
            return

        dias = sorted((cierre - alta).total_seconds() / 86400 for alta, cierre in cerradas)
        # **Mediana ademas de media, y por lo mismo que en la desviacion de la nube**: una sola
        # observacion que se cerro tres semanas tarde mueve la media y no la mediana.
        mitad = len(dias) // 2
        mediana = dias[mitad] if len(dias) % 2 else (dias[mitad - 1] + dias[mitad]) / 2

        self.stdout.write("")
        self.stdout.write(f"TIEMPO DE CICLO (n={len(dias)}, dias)")
        self.stdout.write(f"  mediana  {mediana:.1f}")
        self.stdout.write(f"  media    {sum(dias) / len(dias):.1f}")
        self.stdout.write(f"  maximo   {dias[-1]:.1f}")

    # --- Con que contexto se abren --------------------------------------------------

    def _contexto(self, consulta, inicio, fin) -> None:
        """Con camara, con foto, ancladas al modelo o al documento.

        **Es la cifra que dice si el visor sirve para lo que se hizo.** Un hallazgo sin camara no se
        puede volver a mirar: hay que buscar el elemento a mano, y quien lo recibe no ve lo mismo
        que quien lo abrio. Si sube, el gesto de anotar desde la escena esta funcionando.
        """
        en_rango = consulta.filter(created_at__range=(inicio, fin))
        total = en_rango.count()
        if not total:
            return

        cifras = en_rango.aggregate(
            con_camara=Count("pk", filter=~Q(punto_de_vista={})),
            con_foto=Count("pk", filter=~Q(instantanea="")),
            en_modelo=Count("pk", filter=~Q(ifc_guid="")),
            en_documento=Count("pk", filter=Q(pagina__isnull=False)),
            con_marcado=Count("pk", filter=~Q(marcado=[])),
            de_interferencia=Count("pk", filter=~Q(interferencia_con="")),
        )

        self.stdout.write("")
        self.stdout.write(f"CONTEXTO DE LOS {total} ABIERTOS")
        for etiqueta, clave in (
            ("con punto de vista", "con_camara"),
            ("con instantanea", "con_foto"),
            ("anclados al modelo", "en_modelo"),
            ("anclados a documento", "en_documento"),
            ("con marcado dibujado", "con_marcado"),
            ("de interferencia", "de_interferencia"),
        ):
            cuantos = cifras[clave]
            self.stdout.write(f"  {etiqueta:<22} {cuantos:>4}  ({100 * cuantos / total:.0f} %)")

    # --- Por pantalla y por tipo ----------------------------------------------------

    def _etiquetas(self, consulta, inicio, fin) -> None:
        """De donde salen los hallazgos, leyendo las etiquetas de `preparar_piloto`.

        **Los dos ejes se separan por el prefijo**, que es lo que decidio que fueran etiquetas y no
        un campo nuevo: `pantalla:` dice donde se vio y el resto que clase de hallazgo es.
        """
        pares = consulta.filter(created_at__range=(inicio, fin)).values_list(
            "etiquetas__nombre", flat=True
        )
        pantallas: Counter[str] = Counter()
        tipos: Counter[str] = Counter()
        for nombre in pares:
            if nombre is None:
                continue
            if nombre.startswith("pantalla:"):
                pantallas[nombre.removeprefix("pantalla:")] += 1
            elif not nombre.startswith("plan:"):
                tipos[nombre] += 1

        if pantallas:
            self.stdout.write("")
            self.stdout.write("POR PANTALLA")
            for nombre, cuantos in pantallas.most_common():
                self.stdout.write(f"  {nombre:<22} {cuantos:>4}")
        if tipos:
            self.stdout.write("")
            self.stdout.write("POR TIPO")
            for nombre, cuantos in tipos.most_common():
                self.stdout.write(f"  {nombre:<22} {cuantos:>4}")

    # --- Si se conversa o solo se apunta --------------------------------------------

    def _conversacion(self, consulta, inicio, fin) -> None:
        """Cuantos hallazgos tienen respuesta.

        **Un hilo vacio es un hallazgo que nadie contesto**, y eso no se ve en el estado: sigue
        «abierta» igual que uno en discusion.
        """
        en_rango = consulta.filter(created_at__range=(inicio, fin))
        total = en_rango.count()
        if not total:
            return
        con_hilo = (
            Comentario.objects.filter(observacion__in=en_rango)
            .values("observacion")
            .distinct()
            .count()
        )
        self.stdout.write("")
        self.stdout.write(
            f"CON AL MENOS UNA RESPUESTA  {con_hilo} de {total} ({100 * con_hilo / total:.0f} %)"
        )

    # --- Lo que esta abierto ahora --------------------------------------------------

    def _pendiente(self, consulta) -> None:
        """Fuera del rango a proposito: **«que hay abierto» es hoy, no el periodo.**

        Y con las vencidas aparte, porque es el criterio de cierre de cada etapa: ninguna etapa
        cierra con un hallazgo `alta` abierto.
        """
        abiertas = consulta.exclude(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
        hoy = timezone.localdate()

        self.stdout.write("")
        self.stdout.write(f"ABIERTO AHORA ({hoy})")
        for prioridad, _titulo in Observacion.PRIORIDADES:
            self.stdout.write(
                f"  {prioridad:<22} {abiertas.filter(prioridad=prioridad).count():>4}"
            )
        self.stdout.write(f"  vencidas               {abiertas.filter(vence__lt=hoy).count():>4}")
        self.stdout.write(
            f"  sin fecha              {abiertas.filter(vence__isnull=True).count():>4}"
        )
