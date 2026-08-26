"""El proyecto y su estructura: de que cuelga todo lo demas.

Tres modelos y ni uno mas. La tentacion en un control documental es modelar la
organizacion entera del cliente —contratos, centros de costo, fases, hitos— y lo que
hace falta para que un entregable tenga sitio es mucho menos: **de que proyecto es,
de que disciplina, y en que paquete de la codificacion cae**.
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

    organizacion = models.ForeignKey(
        Organizacion, on_delete=models.PROTECT, related_name="proyectos"
    )
    codigo = models.CharField(max_length=30, verbose_name=_("code"))
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
        entregables = list(self.entregables.filter(is_active=True))
        peso_total = sum(e.peso for e in entregables)
        if peso_total == 0:
            return 0.0
        return sum(e.peso * e.avance for e in entregables) / peso_total


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
