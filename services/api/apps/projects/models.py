"""El proyecto y su estructura: de que cuelga todo lo demas.

Cuatro modelos y ni uno mas. La tentacion en un control documental es modelar la
organizacion entera del cliente —contratos, centros de costo, fases, hitos— y lo que
hace falta para que un entregable tenga sitio es mucho menos: **de que proyecto es,
de que disciplina, y en que paquete de la codificacion cae**.

El cuarto es `Etiqueta`, que llego con `F10.1` y es lo transversal: lo que no se deduce
del codigo del documento y lo pone quien coordina. Tiene su propia razon de no ser un
campo de texto, escrita en la clase.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel, Organizacion, StatusFlowMixin


class Proyecto(StatusFlowMixin, BaseModel):
    """La obra. Todo entregable pertenece a uno."""

    ETAPA_ANTEPROYECTO = "anteproyecto"
    ETAPA_BASICO = "basico"
    ETAPA_DETALLE = "detalle"
    ETAPA_CONSTRUCCION = "construccion"
    ETAPA_CERRADO = "cerrado"
    STATUS_CHOICES = [
        (ETAPA_ANTEPROYECTO, _("Concept")),
        (ETAPA_BASICO, _("Scheme design")),
        (ETAPA_DETALLE, _("Detailed design")),
        (ETAPA_CONSTRUCCION, _("Construction")),
        (ETAPA_CERRADO, _("Closed")),
    ]
    # Un proyecto **si** avanza por una secuencia, asi que le toca el paso a paso.
    STATUS_FLOW = [
        ETAPA_ANTEPROYECTO,
        ETAPA_BASICO,
        ETAPA_DETALLE,
        ETAPA_CONSTRUCCION,
        ETAPA_CERRADO,
    ]

    # **La naturaleza va en un campo y no en un prefijo del codigo**, y es una decision, no un
    # detalle. `codigo` es texto libre a proposito —cada mandante impone el suyo— asi que un
    # `PRB-` acordado de palabra lo respeta quien se acuerda, y nadie puede filtrar por el ni
    # pintarlo distinto. Con un campo cerrado, una obra de prueba se distingue de un vistazo en
    # toda la aplicacion y se puede esconder de los listados sin tocar ni un codigo.
    REAL = "real"
    PRUEBA = "prueba"
    DEMO = "demo"
    NATURALEZAS = [
        (REAL, _("Live work")),
        (PRUEBA, _("Test")),
        (DEMO, _("Demo")),
    ]

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="proyectos"
    )
    codigo = models.CharField(max_length=30, verbose_name=_("code"))
    naturaleza = models.CharField(
        max_length=10, choices=NATURALEZAS, default=REAL, verbose_name=_("nature")
    )
    nombre = models.CharField(max_length=200, verbose_name=_("name"))
    cliente = models.CharField(max_length=200, blank=True, verbose_name=_("client"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ETAPA_ANTEPROYECTO)
    inicio = models.DateField(null=True, blank=True, verbose_name=_("start"))
    termino = models.DateField(null=True, blank=True, verbose_name=_("end"))

    class Meta:
        verbose_name = _("project")
        verbose_name_plural = _("projects")
        ordering = ["codigo"]
        constraints = [
            models.UniqueConstraint(
                fields=["organizacion", "codigo"], name="codigo_de_proyecto_unico_por_organizacion"
            )
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"

    @property
    def avance_fisico(self) -> float:
        """El avance del proyecto, de 0 a 1, **como suma y no como un numero teclado**.

        Sale del peso de cada entregable por el avance de su revision vigente. Es la
        diferencia entre un porcentaje que alguien escribe en una reunion y uno que se
        puede auditar entregable por entregable.
        """
        # **La precarga es parte del cálculo, no una optimización aparte.** Cada entregable
        # mira su revisión vigente, y sin esto un proyecto de doscientos entregables son
        # doscientas consultas para pintar un número. Medido: 11 consultas para 10
        # entregables antes, 2 después.
        entregables = list(self.entregables.filter(is_active=True).prefetch_related("revisiones"))
        peso_total = sum(e.peso for e in entregables)
        if peso_total == 0:
            return 0.0
        return sum(e.peso * e.avance for e in entregables) / peso_total

    @property
    def avance_pct(self) -> int:
        """El mismo avance, en la escala que se pinta: de 0 a 100.

        **Existe porque la que faltaba era esta, no la de arriba.** `avance_fisico` devuelve una
        fraccion —0,75— y las plantillas ensenan porcentajes, asi que alguien tenia que multiplicar
        por cien. Eso se hacia **a mano y en una sola vista** (la portada), y la lista de obras
        pedia `avance_pct` sin que nadie se lo pusiera: en una plantilla de Django un atributo que
        no existe no es un error, es la cadena vacia. La columna entera salia con `width: %` y un
        `%` sin numero, **en todas las filas y sin una sola senal**.

        Vive junto a `avance_fisico` para que la proxima pantalla no tenga que acordarse de nada:
        la fraccion para calcular, el entero para pintar, los dos del mismo sitio.
        """
        return round(self.avance_fisico * 100)


class Disciplina(BaseModel):
    """Arquitectura, estructura, instalaciones...

    Lleva su color porque lo usan el tablero, el listado y el informe: con una copia
    en cada sitio, la leyenda acaba diciendo un color y la tabla otro. Es la misma
    leccion que ya costo una sesion con la paleta ACI del visor.
    """

    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="disciplinas")
    codigo = models.CharField(max_length=10, verbose_name=_("code"))
    nombre = models.CharField(max_length=100, verbose_name=_("name"))
    # `#rrggbb`. Se valida en el formulario, no aqui: un color mal escrito no puede
    # impedir que se guarde el registro de un entregable.
    color = models.CharField(max_length=7, default="#5b3a9e", verbose_name=_("colour"))

    class Meta:
        verbose_name = _("discipline")
        verbose_name_plural = _("disciplines")
        ordering = ["codigo"]
        constraints = [
            models.UniqueConstraint(
                fields=["proyecto", "codigo"], name="codigo_de_disciplina_unico_por_proyecto"
            )
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"


class Etiqueta(BaseModel):
    """Una etiqueta del proyecto, y **no un campo de texto libre**. `F10.1`.

    Un texto libre se fragmenta a la tercera semana: «estructura», «Estructura», «estruct» y «EE»
    son cuatro etiquetas para una cosa, y entonces **filtrar por etiqueta deja de encontrar** lo
    que hay. Asi que el vocabulario lo define el proyecto —igual que las disciplinas, que ya
    funcionan asi— y el hallazgo elige de esa lista.

    **Y no es lo mismo que una disciplina**, aunque se parezcan. La disciplina dice de quien es el
    entregable y viene del codigo del documento; la etiqueta es transversal y la pone quien
    coordina: «obra ejecutada», «pendiente de mandante», «afecta a presupuesto». Un hallazgo tiene
    una disciplina y puede llevar tres etiquetas.

    Lo que esto desbloquea, y es la razon de que vaya antes que las tablas: **el informe se pide
    por etiqueta.** «Todo lo de instalaciones que sigue abierto» es la consulta que no se podia
    escribir — `Opciones.etiqueta` en `apps/documents/informe.py`.
    """

    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="etiquetas")
    nombre = models.CharField(max_length=60, verbose_name=_("name"))
    # `#rrggbb`, como en `Disciplina` y por la misma razon: el color se usa en la lista, en la
    # ficha y en el informe, y con una copia en cada sitio la leyenda dice un color y la tabla otro.
    color = models.CharField(max_length=7, default="#5b3a9e", verbose_name=_("colour"))

    class Meta:
        verbose_name = _("tag")
        verbose_name_plural = _("tags")
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["proyecto", "nombre"], name="nombre_de_etiqueta_unico_por_proyecto"
            )
        ]

    def __str__(self):
        return self.nombre


class PaqueteWBS(BaseModel):
    """Un nodo de la estructura de codificacion del proyecto.

    Es el WBS de MineDoc: el arbol por el que se codifica y por el que se reparten los
    permisos. **Se modela como un arbol de un solo campo padre** y no con una tabla de
    niveles fijos, porque cada oficina usa una profundidad distinta y una tabla de
    "nivel 1, nivel 2, nivel 3" obliga a inventar niveles vacios.
    """

    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="paquetes")
    padre = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="hijos"
    )
    codigo = models.CharField(max_length=40, verbose_name=_("code"))
    nombre = models.CharField(max_length=200, verbose_name=_("name"))
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paquetes_a_cargo",
        verbose_name=_("owner"),
    )

    class Meta:
        verbose_name = _("WBS package")
        verbose_name_plural = _("WBS packages")
        ordering = ["codigo"]
        constraints = [
            models.UniqueConstraint(
                fields=["proyecto", "codigo"], name="codigo_de_paquete_unico_por_proyecto"
            )
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"

    @property
    def ruta(self) -> str:
        """El camino desde la raiz, para poder leer un codigo sin abrir el arbol."""
        partes = [self.codigo]
        nodo = self.padre
        # Tope de profundidad: un `padre` mal puesto puede cerrar un ciclo, y sin tope
        # esto cuelga el servidor en vez de dar un error.
        for _vuelta in range(12):
            if nodo is None:
                break
            partes.append(nodo.codigo)
            nodo = nodo.padre
        return " / ".join(reversed(partes))


class VistaDeProyecto(BaseModel):
    """Una vista del modelo que se le puede pasar a otra persona.

    **Las vistas guardadas vivian en el navegador y ahi se quedaban.** Sobrevivian a recargar la
    pagina y no salian del equipo, asi que dos personas revisando el mismo modelo no podian mirar
    lo mismo — que es exactamente en lo que consiste coordinar. La limitacion paso de aceptable a
    molesta en cuanto la coordinacion se metio dentro del visor.

    **No es «la misma vista, pero en el servidor».** Una vista local esta escrita en el idioma de
    esa sesion: coordenadas de la escena del visor y `localId` de Fragments, que es el
    identificador del motor y cambia entre versiones del modelo. Esto esta escrito en el idioma del
    **modelo**: la camara en el sistema del IFC, lo apagado por **GUID** y los cortes tambien en el
    sistema del IFC. O sea, **es un viewpoint de BCF con nombre y con cortes**, y eso no es
    casualidad: es lo que hace falta para que sobreviva a quien la escribio.

    **Cuelga del proyecto y no de la revision**, por el mismo motivo que las observaciones del
    modelo: una vista util para coordinar cruza disciplinas, y atarla a un archivo la haria
    inservible en cuanto ese archivo tenga una version nueva.

    Las vistas locales **no desaparecen**: siguen en el navegador, sin viaje al servidor y sin
    permisos que pedir. Compartir es un acto explicito, y esa es la diferencia entre una vista de
    trabajo y una que se le enseña a alguien.
    """

    # **El campo de la organizacion va explicito, aunque el proyecto ya la tenga.** Es lo que hace
    # que `scope_queryset_to_organizacion` acote esta tabla sola: sin el, la consulta se devuelve
    # intacta —el acotador no adivina caminos— y una vista de otro cliente saldria pidiendo su id.
    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="vistas_de_proyecto"
    )
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name="vistas")
    nombre = models.CharField(max_length=120, verbose_name=_("name"))
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="vistas_compartidas",
        verbose_name=_("author"),
    )
    #: La camara en el sistema del IFC, con la forma que escribe `camaraBcfDesdeEscena`.
    camara = models.JSONField(default=dict, blank=True)
    #: Que se veia, con la forma de un `Visibility` de BCF. Vacio es «sin restriccion».
    visibilidad = models.JSONField(default=dict, blank=True)
    #: Los planos de corte, tambien en el sistema del IFC: `[{"normal": [...], "origen": [...]}]`.
    cortes = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = _("project view")
        verbose_name_plural = _("project views")
        ordering = ["nombre"]
        constraints = [
            # **Un nombre por proyecto.** Dos vistas llamadas «Encuentro del eje C» en la misma
            # lista no se distinguen, y quien las lee no puede saber cual le enseñaron.
            models.UniqueConstraint(
                fields=["proyecto", "nombre"], name="nombre_de_vista_unico_por_proyecto"
            )
        ]

    def __str__(self):
        return self.nombre


class AvisosDeObra(BaseModel):
    """Cuanto correo manda esta obra. **Lo decide el coordinador, no el sistema.**

    ## De donde sale

    Del encargo, literal: *«el correo que sea cuando el coordinador lo delimite, para no generar
    spam»*. Hasta hoy el resumen diario salia **a todos los usuarios activos, sin filtrar**, todas
    las mañanas — y un remitente que escribe todos los dias se archiva sin leer, con lo que el dia
    que trae algo importante tampoco se lee.

    ## Lo que NO gobierna, y es la mitad del diseño

    **La campana no pasa por aqui.** Los avisos dentro de la aplicacion son inmediatos y no cuestan
    nada porque no salen de la aplicacion: no pueden hacer spam. Apagar el correo de una obra **no
    deja a nadie sin enterarse** — deja de llegarle al buzon, y sigue estando en la campana cuando
    entre.

    Esa separacion es lo que permite poner el correo en `nunca` sin perder informacion, que es
    exactamente lo que una obra tranquila quiere.
    """

    NUNCA = "nunca"
    DIARIO = "diario"
    SEMANAL = "semanal"
    SOLO_VENCIDOS = "solo_vencidos"
    CADENCIAS = [
        (SOLO_VENCIDOS, _("Only when something is overdue")),
        (DIARIO, _("Every day")),
        (SEMANAL, _("Once a week")),
        (NUNCA, _("Never")),
    ]

    proyecto = models.OneToOneField(
        "projects.Proyecto", on_delete=models.CASCADE, related_name="ajustes_de_aviso"
    )
    #: **Por omision, solo si hay vencidos.** Es la opcion que no molesta cuando todo va bien y si
    #: avisa cuando deja de ir bien — o sea, la unica cuyo silencio significa algo.
    resumen = models.CharField(
        max_length=20, choices=CADENCIAS, default=SOLO_VENCIDOS, verbose_name=_("summary email")
    )
    #: Solo se mira con `semanal`. 0 = lunes, como `date.weekday()`.
    dia_de_la_semana = models.PositiveSmallIntegerField(default=0)
    #: **Este si va encendido**: es el aviso que de verdad hace falta, y sale una sola vez por
    #: asignacion, asi que no puede convertirse en ruido.
    al_asignar = models.BooleanField(default=True, verbose_name=_("email when work is assigned"))
    #: **Encendido, aunque sea el que mas correo genera.** La primera version lo dejo apagado por
    #: omision —es el que mas ruido hace y el que la campana cubre mejor— y eso estaba mal: apagar
    #: por omision un aviso que hoy funciona es cambiarle el comportamiento a quien no pidio nada.
    #:
    #: Lo que se pidio es que **el coordinador lo delimite**, no que lo decida el sistema. Asi que
    #: hasta que alguien decida, no cambia nada; y quien encuentre que un hilo activo le llena el
    #: buzon tiene el interruptor a un clic. Es tambien el que mas se agradece apagar, y por eso la
    #: pantalla lo explica.
    al_responder = models.BooleanField(
        default=True, verbose_name=_("email on every reply in a thread")
    )

    class Meta:
        verbose_name = _("notice settings")
        verbose_name_plural = _("notice settings")

    def __str__(self):
        return f"{self.proyecto.codigo} · {self.get_resumen_display()}"

    @classmethod
    def de(cls, proyecto) -> "AvisosDeObra":
        """Los ajustes de una obra, con los de fabrica si nadie los ha tocado.

        **No se crea la fila al leer.** Una obra sin ajustes no es un estado incompleto: es una obra
        con los valores por omision, y escribir una fila cada vez que alguien mira el correo del dia
        llenaria la tabla de filas identicas.
        """
        try:
            return cls.objects.get(proyecto=proyecto)
        except cls.DoesNotExist:
            return cls(proyecto=proyecto)

    def manda_resumen_hoy(self, hoy, *, hay_vencidos: bool) -> bool:
        """Si a esta obra le toca resumen hoy."""
        if self.resumen == self.NUNCA:
            return False
        if self.resumen == self.DIARIO:
            return True
        if self.resumen == self.SEMANAL:
            return hoy.weekday() == self.dia_de_la_semana
        return hay_vencidos
