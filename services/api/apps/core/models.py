"""Lo que comparte todo el dominio de AeroBim.

Portado de `AeroControl/apps/core/models.py`, que es donde estas piezas se
ganaron su sitio. Los comentarios que explican **por que** una decision es asi
vienen con el codigo: son el valor de haberlo portado y no reescrito.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _


class BaseModel(models.Model):
    """UUID como clave, marcas de tiempo, y **archivar en vez de borrar**.

    `is_active` no es un adorno: en un registro documental, borrar un entregable
    de la base de datos se lleva con el su historial de revisiones y con el la
    respuesta a "quien aprobo esto y cuando". Se archiva.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, verbose_name=_("active"))
    notes = models.TextField(blank=True, verbose_name=_("notes"))

    class Meta:
        abstract = True


def status_steps_for(*, choices, flow, current, blocked=None, reached=None):
    """El avance de un registro como pasos: `[{code, label, state}]`.

    **Se deriva del propio modelo y nunca se escribe a mano en una plantilla.**
    Una lista de pasos teclada al lado de los estados reales se separa de ellos en
    el primer cambio, y entonces la pantalla afirma un avance que la base de datos
    no tiene.

    Un `current` que no esta en el flujo deja todos los pasos pendientes, que es
    exactamente lo correcto para un flujo que aun no ha empezado.

    `blocked` acepta uno o varios codigos terminales -- rechazado, anulado -- que
    no son un paso hacia ningun sitio sino donde el flujo se detiene. `reached`
    dice hasta donde llego de verdad, para no pintar en gris todo el recorrido de
    un registro que si avanzo antes de detenerse.
    """
    labels = dict(choices)
    blocked_codes = {blocked} if isinstance(blocked, str) else set(blocked or ())
    if current in blocked_codes:
        stopped_at = flow.index(reached) if reached in flow else 0
        steps = [
            {"code": code, "label": labels[code], "state": "done"}
            for code in flow[: stopped_at + 1]
        ]
        steps.append({"code": current, "label": labels.get(current, current), "state": "blocked"})
        return steps

    hasta = flow.index(current) if current in flow else -1
    steps = []
    for index, code in enumerate(flow):
        if index < hasta:
            state = "done"
        elif index == hasta:
            state = "current"
        else:
            state = "pending"
        steps.append({"code": code, "label": labels[code], "state": state})
    return steps


class StatusFlowMixin(models.Model):
    """El avance de un registro, para los que de verdad avanzan.

    Un modelo se apunta declarando, al lado de sus `STATUS_CHOICES`:

    - `STATUS_FLOW`: los codigos en el orden en que avanzan.
    - `STATUS_BLOCKED`: opcional, el o los estados terminales donde se detiene.

    **Solo para lo que progresa.** Una revision de un entregable avanza de "en
    curso" a "publicada"; el estado de un modelo IFC —cargado, con errores— no es
    una progresion, y dibujarlo como tal afirmaria un avance que no existe.

    No añade campos, asi que adoptarlo no cuesta una migracion.
    """

    STATUS_FLOW: list[str] = []
    STATUS_BLOCKED = None

    class Meta:
        abstract = True

    def status_steps(self):
        return status_steps_for(
            choices=self.STATUS_CHOICES,
            flow=self.STATUS_FLOW,
            current=self.status,
            blocked=self.STATUS_BLOCKED,
        )


class Organizacion(BaseModel):
    """A quien pertenecen los datos.

    Todo modelo con datos de proyecto apunta aqui, y **toda consulta se acota por
    ella**. Es lo que cierra el hueco de pedir a mano `/entregable/<id-de-otra>/`:
    comprobar el permiso de modelo no alcanza, porque el permiso dice "puede ver
    entregables", no "puede ver **estos** entregables".
    """

    nombre = models.CharField(max_length=150, verbose_name=_("name"))
    slug = models.SlugField(max_length=80, unique=True)
    miembros = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="Membresia",
        related_name="organizaciones",
    )

    class Meta:
        verbose_name = _("organisation")
        verbose_name_plural = _("organisations")
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Membresia(BaseModel):
    ROLES = [("miembro", _("Member")), ("admin", _("Admin"))]

    organizacion = models.ForeignKey(Organizacion, on_delete=models.CASCADE)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rol = models.CharField(max_length=20, choices=ROLES, default="miembro")

    class Meta:
        verbose_name = _("membership")
        verbose_name_plural = _("memberships")
        constraints = [
            models.UniqueConstraint(
                fields=["organizacion", "usuario"], name="unica_membresia_por_organizacion"
            )
        ]

    def __str__(self):
        return f"{self.usuario} · {self.organizacion} · {self.rol}"


class AppendOnlyAuditQuerySet(models.QuerySet):
    """Impide que el codigo de la aplicacion modifique o borre la auditoria."""

    def update(self, **kwargs):
        raise ValidationError("Los registros de auditoria son de solo agregar.")

    def delete(self):
        raise ValidationError("Los registros de auditoria son de solo agregar.")

    def bulk_update(self, objs, fields, batch_size=None):
        raise ValidationError("Los registros de auditoria son de solo agregar.")


class AuditEventManager(models.Manager.from_queryset(AppendOnlyAuditQuerySet)):
    pass


class AuditEvent(models.Model):
    """Registro **de solo agregar** de cada accion autenticada que muta algo."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # **`created_at` no basta para ordenar dos filas creadas en el mismo instante**:
    # `timezone.now()` devuelve el valor identico en llamadas sucesivas rapidas, y
    # SQL no garantiza ningun orden para empates en una columna no unica. `sequence`
    # se calcula al guardar como "el ultimo mas uno".
    sequence = models.PositiveBigIntegerField(editable=False, default=0)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=32)
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500)
    status_code = models.PositiveSmallIntegerField()
    model_label = models.CharField(max_length=100, blank=True)
    object_id = models.CharField(max_length=100, blank=True)
    request_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    objects = AuditEventManager()

    class Meta:
        verbose_name = _("audit event")
        verbose_name_plural = _("audit events")
        ordering = ["-sequence"]
        indexes = [
            models.Index(fields=["-sequence"]),
            models.Index(fields=["actor", "-sequence"]),
            models.Index(fields=["model_label", "object_id"]),
        ]

    def __str__(self):
        return f"{self.sequence} · {self.action} · {self.path}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Los registros de auditoria son de solo agregar.")
        ultimo = AuditEvent.objects.order_by("-sequence").first()
        self.sequence = (ultimo.sequence if ultimo else 0) + 1
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Los registros de auditoria son de solo agregar.")


class JobRun(BaseModel):
    """Que paso la ultima vez que corrio un trabajo programado.

    Lo escriben los propios comandos, para que el operador pueda saber si el
    trabajo de la noche corrio de verdad.
    """

    RESULT_RUNNING = "running"
    RESULT_OK = "ok"
    RESULT_ERROR = "error"
    RESULTS = [
        (RESULT_RUNNING, _("Running")),
        (RESULT_OK, _("Completed")),
        (RESULT_ERROR, _("Failed")),
    ]

    command = models.CharField(max_length=100)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    # **"running" hasta que el comando termina.** La fila se creaba antes con
    # `result="ok"`, asi que un proceso muerto a mitad —matado por el planificador,
    # corte de luz, sin memoria— dejaba un exito permanente: exactamente el punto
    # ciego que un aviso de trabajo colgado tendria que leer. Una fila atascada en
    # "running" con un `started_at` viejo si es un trabajo muerto detectable.
    result = models.CharField(max_length=10, choices=RESULTS, default=RESULT_RUNNING)
    summary = models.CharField(max_length=300, blank=True)

    class Meta:
        verbose_name = _("job run")
        verbose_name_plural = _("job runs")
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["command", "-started_at"])]

    def __str__(self):
        return f"{self.command} · {self.started_at:%Y-%m-%d %H:%M} · {self.result}"

    @property
    def duration_seconds(self):
        if self.finished_at is None:
            return None
        return round((self.finished_at - self.started_at).total_seconds(), 2)
