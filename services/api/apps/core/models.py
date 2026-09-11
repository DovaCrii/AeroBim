"""Lo que comparte todo el dominio de AeroBim.

Portado de `AeroControl/apps/core/models.py`, que es donde estas piezas se
ganaron su sitio. Los comentarios que explican **por que** una decision es asi
vienen con el codigo: son el valor de haberlo portado y no reescrito.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import DEFAULT_DB_ALIAS, IntegrityError, connections, models, router, transaction
from django.db.models import Max
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
    # **`unique=True` es lo que hace imposible el defecto y no solo improbable.** Ver `save()`:
    # sin esta restriccion, dos peticiones simultaneas escribian el mismo numero sin que nada
    # fallara, y el orden total que este campo existe para dar dejaba de existir en silencio.
    sequence = models.PositiveBigIntegerField(editable=False, default=0, unique=True)
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

    #: La llave del cerrojo con nombre de PostgreSQL. Cualquier entero sirve mientras sea **solo de
    #: esta tabla**: `pg_advisory_xact_lock` es un espacio global de la base, asi que dos codigos
    #: distintos con la misma llave se estorbarian sin ninguna relacion entre ellos. Se escribe a
    #: mano y no se calcula con `hash()`, que en Python cambia entre procesos.
    _CERROJO = 8_419_001

    #: Cuantas veces se reintenta si dos peticiones eligen el mismo numero a la vez.
    #:
    #: Con el bloqueo de mas abajo los choques son raros, y cinco son de sobra para el caso en que
    #: la tabla estaba vacia —que es el unico en que no hay fila que bloquear—. Si se agotaran, se
    #: levanta: **dejar de auditar en silencio seria peor que un error**, porque este registro
    #: existe justamente para poder contestar «quien hizo que» seis meses despues.
    INTENTOS = 5

    def save(self, *args, **kwargs):
        """Guarda con **numero de orden unico**, tambien con varios procesos escribiendo.

        ## El defecto que esto arregla, medido

        Esto era «lee el maximo y sumale uno», sin transaccion, sin bloqueo y sin unicidad. En
        desarrollo nunca fallo porque la suite corre en un solo proceso; en la VM hay
        `workers = cpu*2+1` de gunicorn, con dos hilos cada uno, y se escribe **una fila por cada
        peticion que muta**.

        Medido contra PostgreSQL con dieciseis hilos escribiendo doce filas cada uno:

        | | antes | despues |
        | --- | --- | --- |
        | filas escritas | 192 | 192 |
        | valores distintos de `sequence` | **27** | 192 |
        | duplicados | **165** | 0 |

        O sea que el campo cuyo unico motivo es dar un orden total cuando `created_at` empata
        —esta escrito arriba— dejaba de darlo justo cuando hay concurrencia, que es cuando hace
        falta. Y no fallaba nada: la auditoria quedaba mal ordenada, en silencio.

        ## Por que las tres piezas, y no una

        1. **`unique=True` en `sequence`** (migracion `0002`): convierte un duplicado silencioso en
           un error. Es la unica de las tres que hace **imposible** el defecto; las otras dos solo
           lo hacen improbable.
        2. **Un cerrojo con nombre dentro de `transaction.atomic`** (ver `_siguiente_numero`):
           serializa a los que compiten sin que se peleen, asi que el reintento casi nunca hace
           falta. En SQLite no se pide nada y no importa: alli las escrituras ya van de una en una.
        3. **El reintento**: la red de seguridad. Con el cerrojo puesto no deberia saltar; si salta,
           es un aviso de que algo escribio en esta tabla por otro camino.
        """
        if not self._state.adding:
            raise ValidationError("Los registros de auditoria son de solo agregar.")
        for intento in range(self.INTENTOS):
            try:
                with transaction.atomic():
                    self.sequence = self._siguiente_numero()
                    return super().save(*args, **kwargs)
            except IntegrityError:
                if intento == self.INTENTOS - 1:
                    raise
        return None  # pragma: no cover - inalcanzable: el bucle sale por `return` o por `raise`

    @staticmethod
    def _siguiente_numero() -> int:
        """El siguiente numero, decidido con la tabla tomada.

        **La primera version de este arreglo bloqueaba la ultima fila —`select_for_update()` sobre
        `order_by("-sequence").first()`— y no bastaba.** Se midio: con dieciseis hilos seguian
        saltando choques hasta agotar los reintentos. El motivo es de `READ COMMITTED`: la consulta
        `ORDER BY ... LIMIT 1 FOR UPDATE` elige la fila **con la instantanea de su transaccion**, y
        asi todos los hilos se ponen a esperar por *la misma* fila; cuando el primero termina e
        inserta la siguiente, los demas despiertan sobre la fila vieja y calculan otra vez el mismo
        numero. Se pelean por una fila que ya no es el maximo.

        Lo que si serializa sin pelea es un **cerrojo con nombre**: cada transaccion hace cola, y al
        entrar lee el maximo de verdad. Es lo que hace `pg_advisory_xact_lock`, que ademas se
        suelta solo al terminar la transaccion —no hay forma de olvidarse de soltarlo—.

        En SQLite no se pide nada: alli las escrituras ya van de una en una y el `Max()` dentro de
        la transaccion es correcto. Y la unicidad de la columna sigue siendo la garantia en los dos
        motores; esto solo evita que haya que reintentar.
        """
        conexion = connections[router.db_for_write(AuditEvent) or DEFAULT_DB_ALIAS]
        if conexion.vendor == "postgresql":
            with conexion.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [AuditEvent._CERROJO])
        return (AuditEvent.objects.aggregate(techo=Max("sequence"))["techo"] or 0) + 1

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
