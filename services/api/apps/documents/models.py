"""El registro documental: entregables, revisiones, transmittals y observaciones.

**El vocabulario es el de ISO 19650, no uno inventado.** Un codigo de idoneidad `S3` o
`A1` significa lo mismo en la oficina del proyectista, en la del revisor y en la del
mandante; un estado llamado "en revision" significa lo que cada uno entienda. Es la
diferencia entre un registro que sirve como acuerdo contractual y una lista de tareas.

La idea de conjunto viene de MineDoc —control de documentos con transmittals, avance
fisico del documento y comentarios sobre el propio archivo— construida aqui: MIT y
local-first, y con la ventaja que ningun EDMS del mercado puede dar, que es abrir la
observacion **desde el visor** cuando el entregable es un DXF o un IFC.
"""

import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel, Organizacion, StatusFlowMixin
from apps.projects.models import Disciplina, PaqueteWBS, Proyecto


class Idoneidad(models.TextChoices):
    """Para que sirve una revision, segun el Anexo Nacional de BS EN ISO 19650-2.

    **Las `S` no son contractuales y las `A`/`B` si.** Esa es la linea que importa: una
    revision `S2` se comparte para informacion y no obliga a nadie; una `A` esta
    autorizada y aceptada para la etapa. Una `B` esta publicada **con comentarios**, o
    sea que se puede usar y **queda la obligacion de resolverlos** — y por eso una `B`
    con observaciones abiertas no es un error del sistema, es su estado normal.
    """

    S0 = "S0", _("S0 · Work in progress")
    S1 = "S1", _("S1 · Suitable for coordination")
    S2 = "S2", _("S2 · Suitable for information")
    S3 = "S3", _("S3 · Suitable for review and comment")
    S4 = "S4", _("S4 · Suitable for stage approval")
    S6 = "S6", _("S6 · Suitable for PIM authorisation")
    S7 = "S7", _("S7 · Suitable for AIM authorisation")
    A = "A", _("A · Published and authorised")
    B = "B", _("B · Published with comments")


# **El avance fisico sale de aqui y no de un porcentaje que alguien teclea.** Cada
# codigo vale lo que vale el documento cuando llega a el, que es la unica forma de que
# el avance del proyecto sea una suma auditable entregable por entregable.
AVANCE_POR_IDONEIDAD: dict[str, float] = {
    Idoneidad.S0: 0.25,
    Idoneidad.S1: 0.45,
    Idoneidad.S2: 0.55,
    Idoneidad.S3: 0.70,
    Idoneidad.S4: 0.85,
    Idoneidad.S6: 0.90,
    Idoneidad.S7: 0.95,
    # Publicado con comentarios **no es el 100 %**: queda la obligacion de resolverlos.
    Idoneidad.B: 0.95,
    Idoneidad.A: 1.0,
}

# Las que son contractuales. Un `Mandante` solo ve estas.
IDONEIDADES_PUBLICADAS = (Idoneidad.A, Idoneidad.B)


class TipoEntregable(models.TextChoices):
    PLANO = "plano", _("Drawing")
    MEMORIA = "memoria", _("Report")
    MODELO = "modelo", _("Model")
    ESPECIFICACION = "especificacion", _("Specification")
    OTRO = "otro", _("Other")


class Entregable(BaseModel):
    """Lo que hay que entregar: un plano, una memoria, un modelo.

    **El entregable no tiene archivo.** El archivo pertenece a una revision, y esa
    separacion es todo el punto: un entregable existe desde que se planifica —con su
    codigo, su responsable y su fecha— y mucho antes de que exista su primer archivo.
    Un registro que necesita un archivo para existir no puede decir que falta.
    """

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="entregables"
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="entregables")
    disciplina = models.ForeignKey(Disciplina, on_delete=models.PROTECT, related_name="entregables")
    paquete = models.ForeignKey(
        PaqueteWBS,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="entregables",
    )

    codigo = models.CharField(max_length=80, verbose_name=_("code"))
    titulo = models.CharField(max_length=250, verbose_name=_("title"))
    tipo = models.CharField(
        max_length=20, choices=TipoEntregable.choices, default=TipoEntregable.PLANO
    )
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="entregables_a_cargo",
        verbose_name=_("owner"),
    )
    fecha_planificada = models.DateField(null=True, blank=True, verbose_name=_("planned date"))
    # **El peso es lo que hace del avance una suma y no una opinion.** Un plano de
    # detalle y el modelo federado no pesan lo mismo en el proyecto.
    peso = models.PositiveIntegerField(default=1, verbose_name=_("weight"))

    class Meta:
        verbose_name = _("deliverable")
        verbose_name_plural = _("deliverables")
        ordering = ["codigo"]
        constraints = [
            models.UniqueConstraint(
                fields=["proyecto", "codigo"], name="codigo_de_entregable_unico_por_proyecto"
            )
        ]
        indexes = [
            models.Index(fields=["proyecto", "disciplina"]),
            models.Index(fields=["responsable"]),
        ]

    def __str__(self):
        return f"{self.codigo} · {self.titulo}"

    @property
    def revision_vigente(self):
        """La ultima revision emitida, o `None` si todavia no hay ninguna.

        **Se recorre `all()` y no se filtra, y la diferencia se midio.** `filter()` abre una
        consulta nueva **aunque la relacion ya venga precargada**, asi que el listado de
        entregables gastaba 71 consultas para veinte filas: una por fila para la revision
        vigente y otra por fila para el avance, que la vuelve a pedir. Recorriendo `all()`,
        con `prefetch_related("revisiones")` en la vista, las veinte filas no cuestan
        ninguna consulta extra.

        El orden del modelo es por fecha de emision descendente, asi que la primera vigente
        que aparece es la que corresponde.
        """
        for revision in self.revisiones.all():
            if revision.es_vigente:
                return revision
        return None

    @property
    def avance(self) -> float:
        """De 0 a 1, deducido del codigo de idoneidad de la revision vigente."""
        vigente = self.revision_vigente
        if vigente is None:
            return 0.0
        return AVANCE_POR_IDONEIDAD.get(vigente.idoneidad, 0.0)

    @property
    def observaciones_abiertas(self):
        """Las que todavia piden trabajo sobre este entregable.

        **Descartada tambien queda fuera**, y antes no: excluia solo `CERRADA`, asi que una
        observacion que alguien descarto seguia contando como pendiente. El resto del codigo
        —`notify.py`, la lista de observaciones y `esta_vencida`— excluye las dos, y esta era la
        unica que discrepaba. No lo delato ninguna prueba porque **la propiedad no la usaba nadie**;
        la estrena la pantalla del proyecto.
        """
        return Observacion.objects.filter(revision__entregable=self).exclude(
            estado__in=[Observacion.CERRADA, Observacion.DESCARTADA]
        )

    @property
    def esta_publicado(self) -> bool:
        vigente = self.revision_vigente
        return vigente is not None and vigente.idoneidad in IDONEIDADES_PUBLICADAS


class Revision(BaseModel):
    """Una version del entregable, con su archivo y para que sirve.

    **Nunca se sobreescribe una revision.** Se emite otra. Es lo que permite contestar
    "que decia el plano cuando se aprobo la etapa", que es justo la pregunta que llega
    seis meses despues y con un abogado detras.
    """

    entregable = models.ForeignKey(Entregable, on_delete=models.CASCADE, related_name="revisiones")
    # El correlativo del CAD o de la oficina: `P01`, `C02`, `A1`. Va como texto porque
    # cada mandante impone el suyo, y forzar un formato rechaza documentos validos.
    correlativo = models.CharField(max_length=20, verbose_name=_("revision"))
    idoneidad = models.CharField(
        max_length=2, choices=Idoneidad.choices, default=Idoneidad.S0, verbose_name=_("suitability")
    )

    # **La clave, no el nombre que venia.** El nombre del cliente nunca llega al
    # sistema de archivos: ver `apps/documents/storage.py`.
    clave_archivo = models.CharField(max_length=400, blank=True)
    nombre_original = models.CharField(max_length=250, blank=True)
    tamano_bytes = models.PositiveBigIntegerField(default=0)
    # El sha256 hace **idempotente** volver a subir lo mismo, y ademas es la prueba de
    # que el archivo que se descarga es el que se aprobo.
    sha256 = models.CharField(max_length=64, blank=True, db_index=True)

    subida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="revisiones_subidas",
    )
    emitida_en = models.DateTimeField(default=timezone.now, verbose_name=_("issued"))
    es_vigente = models.BooleanField(default=True, verbose_name=_("current"))

    # Lo que el archivo declara de si mismo, leido al subirlo: esquema, unidades, si esta
    # georreferenciado y cuantos elementos trae. Solo tiene contenido para los IFC — ver
    # `apps/documents/ifc.py` y `F3.3`.
    #
    # **Va como JSON y no como columnas** porque es un informe, no un dato del negocio: nada del
    # sistema decide nada en funcion de el, se lee. Convertirlo en ocho columnas obligaria a una
    # migracion cada vez que IFC gane un campo que valga la pena mirar.
    metadatos = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = _("revision")
        verbose_name_plural = _("revisions")
        ordering = ["-emitida_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["entregable", "correlativo"],
                name="correlativo_de_revision_unico_por_entregable",
            )
        ]
        indexes = [models.Index(fields=["entregable", "-emitida_en"])]

    def __str__(self):
        return f"{self.entregable.codigo} rev. {self.correlativo} ({self.idoneidad})"

    def save(self, *args, **kwargs):
        nueva = self._state.adding
        super().save(*args, **kwargs)
        # **Una sola vigente por entregable.** Se apagan las demas al guardar y no con
        # una restriccion de base de datos: una restriccion rechazaria la nueva revision
        # en vez de relevar a la anterior, que es lo que hay que hacer.
        if nueva and self.es_vigente:
            Revision.objects.filter(entregable=self.entregable, es_vigente=True).exclude(
                pk=self.pk
            ).update(es_vigente=False)

    @staticmethod
    def sha256_de(contenido: bytes) -> str:
        return hashlib.sha256(contenido).hexdigest()


class Transmittal(BaseModel):
    """El acto de emitir: que revisiones, a quien, cuando, y con acuse.

    **Es lo que convierte "se lo mande por correo" en un registro.** Sin transmittal, la
    pregunta "cuando recibieron la revision B de este plano" se contesta buscando en la
    bandeja de alguien.
    """

    BORRADOR = "borrador"
    EMITIDO = "emitido"
    ACUSADO = "acusado"
    ANULADO = "anulado"
    STATUS_CHOICES = [
        (BORRADOR, _("Draft")),
        (EMITIDO, _("Issued")),
        (ACUSADO, _("Acknowledged")),
        (ANULADO, _("Cancelled")),
    ]
    STATUS_FLOW = [BORRADOR, EMITIDO, ACUSADO]
    STATUS_BLOCKED = ANULADO

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="transmittals"
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="transmittals")
    folio = models.CharField(max_length=40, verbose_name=_("reference"))
    asunto = models.CharField(max_length=250, verbose_name=_("subject"))
    emisor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="transmittals_emitidos"
    )
    destinatarios = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="transmittals_recibidos", blank=True
    )
    revisiones = models.ManyToManyField(Revision, related_name="transmittals", blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=BORRADOR)
    emitido_en = models.DateTimeField(null=True, blank=True)
    acusado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("transmittal")
        verbose_name_plural = _("transmittals")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["proyecto", "folio"], name="folio_de_transmittal_unico_por_proyecto"
            )
        ]

    def __str__(self):
        return f"{self.folio} · {self.asunto}"

    def status_steps(self):
        return StatusFlowMixin.status_steps(self)

    @property
    def puede_emitirse(self) -> bool:
        """**No se emite un transmittal vacio ni sin destinatario.**

        Los dos casos existen —se arma el borrador antes de decidir a quien va— y los dos
        producen un registro que no dice nada: "se emitio" sin decir qué ni a quién.
        """
        return (
            self.status == self.BORRADOR
            and self.revisiones.exists()
            and self.destinatarios.exists()
        )

    def emitir(self):
        if not self.puede_emitirse:
            raise ValidationError(
                "Un transmittal necesita al menos una revision y un destinatario para emitirse."
            )
        self.status = self.EMITIDO
        self.emitido_en = timezone.now()
        self.save(update_fields=["status", "emitido_en", "updated_at"])

    @property
    def puede_acusarse(self) -> bool:
        """**Solo se acusa lo que se emitio.**

        Un acuse sobre un borrador diria que alguien recibio algo que no salio, y es
        justamente el dato que se viene a buscar seis meses despues.
        """
        return self.status == self.EMITIDO

    def acusar(self, quien=None):
        """Registra que llego. `quien` va al log de auditoria, no al modelo.

        No se guarda quien acuso porque un transmittal va a varios destinatarios y el
        primero que confirma no habla por los demas: lo que el registro puede afirmar es
        **que se acuso y cuando**. Quien lo hizo queda en la auditoria, que es append-only
        y admite varios.
        """
        if not self.puede_acusarse:
            raise ValidationError("Solo se puede acusar recibo de un transmittal emitido.")
        self.status = self.ACUSADO
        self.acusado_en = timezone.now()
        self.save(update_fields=["status", "acusado_en", "updated_at"])


class Observacion(BaseModel):
    """Una observacion, un error, un hallazgo: algo que alguien tiene que resolver.

    **Es el mismo ciclo de vida que necesitan los temas BCF de la Fase 4** —prioridad,
    responsable, vencimiento, estado, comentarios con historial— y por eso se diseña una
    vez, con dos anclas:

    - ancla **documento**: revision + pagina + coordenada, y se dibuja sobre el PDF;
    - ancla **modelo**: el GUID del IFC + su punto de vista, y se dibuja en la escena
      **y exporta a BCF**.

    Diseñarlo asi convierte el registro documental en la mitad ya construida de la Fase
    4, en vez de dos tablas parecidas que hay que mantener sincronizadas.
    """

    ABIERTA = "abierta"
    RESPONDIDA = "respondida"
    CERRADA = "cerrada"
    DESCARTADA = "descartada"
    STATUS_CHOICES = [
        (ABIERTA, _("Open")),
        (RESPONDIDA, _("Answered")),
        (CERRADA, _("Closed")),
        (DESCARTADA, _("Dismissed")),
    ]

    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"
    PRIORIDADES = [(ALTA, _("High")), (MEDIA, _("Medium")), (BAJA, _("Low"))]

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="observaciones"
    )
    # Una observacion sobre un documento cuelga de su revision; una sobre el modelo, no.
    revision = models.ForeignKey(
        Revision,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="observaciones",
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="observaciones")

    titulo = models.CharField(max_length=250, verbose_name=_("title"))
    descripcion = models.TextField(blank=True, verbose_name=_("description"))
    prioridad = models.CharField(max_length=10, choices=PRIORIDADES, default=MEDIA)
    estado = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ABIERTA)

    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="observaciones_abiertas"
    )
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="observaciones_a_cargo",
        verbose_name=_("owner"),
    )
    vence = models.DateField(null=True, blank=True, verbose_name=_("due"))
    cerrada_en = models.DateTimeField(null=True, blank=True)
    cerrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="observaciones_cerradas",
    )
    # Como se cerro. **Sin esto, "cerrada" no dice nada**: no se sabe si se corrigio, si
    # se acordo otra cosa o si alguien la marco para bajar el contador.
    resolucion = models.TextField(blank=True, verbose_name=_("resolution"))

    # Ancla en el documento.
    pagina = models.PositiveIntegerField(null=True, blank=True)
    ancla_x = models.FloatField(null=True, blank=True)
    ancla_y = models.FloatField(null=True, blank=True)

    # Ancla en el modelo. **El GUID de IFC es la identidad, siempre** —regla de
    # `AGENTS.md`— y es lo que viaja en un BCF.
    ifc_guid = models.CharField(max_length=22, blank=True, db_index=True)
    punto_de_vista = models.JSONField(default=dict, blank=True)
    # **Que se estaba viendo, no solo desde donde** — `F4.7`. Va en su propio campo y no dentro de
    # `punto_de_vista` porque son dos datos con vidas distintas: la camara se descarta entera si un
    # vector no es unitario, y la visibilidad se limpia excepcion por excepcion. Mezclados, una
    # camara mala se llevaria por delante la visibilidad buena.
    #
    # La forma es la de un `Visibility` de BCF: `{"porDefecto": bool, "excepciones": [guid, ...]}`.
    # Vacio significa **sin restriccion**, que es lo que el exportador escribia siempre.
    visibilidad = models.JSONField(default=dict, blank=True)
    # **El otro elemento, cuando la observacion nace de una interferencia** — `F5.4`.
    #
    # Con esto la pareja `(ifc_guid, interferencia_con)` **es la identidad del conflicto**, y eso es
    # lo que permite volver a correr la deteccion sin duplicar nada: la corrida siguiente reconoce
    # la pareja y no vuelve a abrir lo que alguien ya descarto. `F5.5` sale de aca sin una tabla
    # nueva — descartar un falso positivo es dejar su observacion en `descartada`.
    #
    # Vacio en una observacion escrita por una persona, que es el caso normal.
    interferencia_con = models.CharField(max_length=22, blank=True, db_index=True)
    # **Lo que se dibujo sobre el modelo** — `F4.5`. Segmentos de recta en el sistema del IFC,
    # `[{"inicio": [x, y, z], "fin": [...]}]`, que es lo que BCF escribe como `<Lines>` de un
    # viewpoint. Salen de las cotas que estaban a la vista al anotar: medir es poner puntos en
    # coordenadas del modelo, que es exactamente lo que el formato pide.
    marcado = models.JSONField(default=list, blank=True)
    # **La foto de lo que se estaba mirando**, como clave de almacenamiento — nunca los bytes.
    # Un `data:` de un megabyte dentro de una fila la vuelve imposible de listar, y ademas duplica
    # el archivo en cada copia de seguridad de la base. Vive donde viven los documentos, que es
    # fuera del repositorio y bajo el control del operador.
    instantanea = models.CharField(max_length=300, blank=True)

    class Meta:
        verbose_name = _("observation")
        verbose_name_plural = _("observations")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["responsable", "estado"]),
            models.Index(fields=["proyecto", "estado"]),
        ]

    def __str__(self):
        return self.titulo

    def get_absolute_url(self) -> str:
        """Donde vive esta observacion.

        **Va en el modelo y no en un ayudante de plantilla**, que es el idioma de Django y aca
        importa: la bandeja y el portal muestran observaciones y actividades **mezcladas** en la
        misma lista —para quien mira son lo mismo: algo con fecha y responsable— y sin esto la
        plantilla tendria que preguntar de que tipo es cada fila para saber a donde enlazarla. Con
        `get_absolute_url` en los dos modelos, la fila se enlaza sin saber que es.
        """
        from django.urls import reverse

        return reverse("documents:observacion", args=[self.pk])

    @property
    def ancla(self) -> str:
        """Sobre que esta puesta: `documento`, `modelo` o `proyecto`."""
        if self.ifc_guid:
            return "modelo"
        if self.revision_id is not None:
            return "documento"
        return "proyecto"

    @property
    def puede_cerrarse(self) -> bool:
        """**No se cierra sin decir como.** Es lo que distingue una observacion resuelta
        de una observacion que alguien marco para bajar el contador."""
        return bool(self.resolucion.strip())

    def cerrar(self, por, resolucion: str):
        self.resolucion = resolucion
        if not self.puede_cerrarse:
            raise ValidationError("Una observacion no se cierra sin decir como se resolvio.")
        self.estado = self.CERRADA
        self.cerrada_por = por
        self.cerrada_en = timezone.now()
        self.save(update_fields=["estado", "resolucion", "cerrada_por", "cerrada_en", "updated_at"])

    @property
    def vencida(self) -> bool:
        if self.vence is None or self.estado in {self.CERRADA, self.DESCARTADA}:
            return False
        return self.vence < timezone.localdate()


class Comentario(BaseModel):
    """Un mensaje en el hilo de una observacion. Es el historial que el BCF pide."""

    observacion = models.ForeignKey(
        Observacion, on_delete=models.CASCADE, related_name="comentarios"
    )
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="comentarios"
    )
    texto = models.TextField()

    class Meta:
        verbose_name = _("comment")
        verbose_name_plural = _("comments")
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.autor} · {self.created_at:%Y-%m-%d %H:%M}"


class Actividad(StatusFlowMixin, BaseModel):
    """Una tarea con dueño y fecha: quien tiene que hacer que, y para cuando.

    Existe aparte de `Observacion` porque no toda tarea nace de un hallazgo: "levantar
    el as-built del piso 5" es trabajo planificado, no una observacion sobre nada.
    """

    PENDIENTE = "pendiente"
    EN_CURSO = "en_curso"
    EN_REVISION = "en_revision"
    HECHA = "hecha"
    ANULADA = "anulada"
    STATUS_CHOICES = [
        (PENDIENTE, _("Pending")),
        (EN_CURSO, _("In progress")),
        (EN_REVISION, _("Under review")),
        (HECHA, _("Done")),
        (ANULADA, _("Cancelled")),
    ]
    STATUS_FLOW = [PENDIENTE, EN_CURSO, EN_REVISION, HECHA]
    STATUS_BLOCKED = ANULADA

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="actividades"
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="actividades")
    entregable = models.ForeignKey(
        Entregable,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="actividades",
    )
    observacion = models.ForeignKey(
        Observacion,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="actividades",
    )

    titulo = models.CharField(max_length=250, verbose_name=_("title"))
    descripcion = models.TextField(blank=True, verbose_name=_("description"))
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="actividades_a_cargo",
        verbose_name=_("owner"),
    )
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actividades_creadas",
    )
    vence = models.DateField(null=True, blank=True, verbose_name=_("due"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDIENTE)

    class Meta:
        verbose_name = _("activity")
        verbose_name_plural = _("activities")
        ordering = ["vence", "-created_at"]
        indexes = [
            models.Index(fields=["responsable", "status"]),
            models.Index(fields=["proyecto", "status"]),
        ]

    def __str__(self):
        return self.titulo

    def get_absolute_url(self) -> str:
        """Donde vive esta actividad. Ver {@link Observacion.get_absolute_url}.

        **Hasta hoy no vivia en ninguna parte**: habia listado y alta, y ninguna pantalla de
        detalle. Una fila que se ve vencer y no se puede abrir es una fila muerta, y la bandeja
        estaba llena de ellas.
        """
        from django.urls import reverse

        return reverse("documents:actividad", args=[self.pk])

    @property
    def vencida(self) -> bool:
        if self.vence is None or self.status in {self.HECHA, self.ANULADA}:
            return False
        return self.vence < timezone.localdate()


class RequisitoIds(BaseModel):
    """El requisito de informacion del proyecto, escrito en un IDS (`F3.5`).

    **Es del proyecto y no del entregable.** El mandante exige lo mismo a todos los modelos de la
    obra —"cada viga trae su fase", "cada muro su pset de identidad"—, y tenerlo por entregable
    obligaria a copiarlo y a mantener las copias de acuerdo.

    IDS es el estandar de buildingSMART para escribirlo, asi que **el requisito es interoperable**:
    el mismo archivo lo entiende Solibri, lo entiende BlenderBIM y lo entiende esto. Un requisito
    escrito en una tabla nuestra no lo entiende nadie mas.
    """

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="requisitos_ids"
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="requisitos_ids")
    titulo = models.CharField(max_length=250, verbose_name=_("title"))

    # El archivo, con la misma disciplina que una revision: clave por contenido y el nombre del
    # cliente solo en la base de datos.
    clave_archivo = models.CharField(max_length=400, blank=True)
    nombre_original = models.CharField(max_length=250, blank=True)
    sha256 = models.CharField(max_length=64, blank=True, db_index=True)

    subido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="requisitos_ids_subidos"
    )

    class Meta:
        verbose_name = _("information requirement")
        verbose_name_plural = _("information requirements")
        ordering = ["-created_at"]

    def __str__(self):
        return self.titulo


class ValidacionIds(BaseModel):
    """Una corrida de un requisito contra una revision: **un acto, con su fecha**.

    No es un campo de la revision, y la diferencia importa: el requisito cambia —el mandante añade
    una exigencia a mitad de proyecto— y entonces la misma revision cumple ayer y no cumple hoy.
    Guardar la corrida con su fecha y su requisito es lo que permite contestar *"cumplia cuando se
    aprobo"*, que es la unica pregunta que despues importa.
    """

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="validaciones_ids"
    )
    requisito = models.ForeignKey(
        RequisitoIds, on_delete=models.CASCADE, related_name="validaciones"
    )
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE, related_name="validaciones")
    corrida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="validaciones_ids"
    )

    # **`cumple` es un campo y no una propiedad calculada del resumen.** Es el veredicto, se
    # consulta y se filtra —"que revisiones no cumplen"— y calcularlo al leer obligaria a recorrer
    # el JSON de cada fila.
    cumple = models.BooleanField(default=False, verbose_name=_("complies"))
    # El resumen acotado: ver `apps/documents/ids.py`. El informe crudo de `ifctester` son casi un
    # mega para un modelo mediano y no se guarda.
    resumen = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = _("IDS validation")
        verbose_name_plural = _("IDS validations")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["revision", "-created_at"])]

    def __str__(self):
        return f"{self.revision} · {self.requisito.titulo}"

    @property
    def se_comprobo(self) -> bool:
        """`False` cuando **ninguna especificacion aplico al modelo**.

        Es distinto de no cumplir, y confundirlos es el error que este modulo existe para evitar: un
        IDS escrito para otra disciplina no dice nada del modelo, ni bien ni mal.
        """
        return bool(self.resumen.get("seComprobo"))
