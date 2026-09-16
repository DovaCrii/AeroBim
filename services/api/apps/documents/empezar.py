"""**Subir un archivo al registro sin haber montado antes el andamio.**

## El problema, dicho por quien lo tiene

«No tengo aún para poder subir y dejar guardado nube o modelos para que lo vea el resto del equipo
en el servidor.»

Y es verdad, aunque todas las piezas existan. El camino era: crear la obra → abrirla → añadir una
disciplina → volver a Entregables → Nuevo entregable → rellenar siete campos → entrar al expediente
→ Subir revisión. **Ocho pantallas** para poner un archivo en el servidor, y las cinco primeras son
andamio: cosas que el registro necesita y que quien tiene una nube en el escritorio no sabe que
tiene que crear.

## Lo que NO se hace, y es lo que hace que esto sea honesto

**No se crea un almacén paralelo.** Sigue habiendo un entregable, con su obra, su disciplina, su
responsable y su código; sigue habiendo una revisión con su emisor, su fecha y su idoneidad. Eso es
lo que separa un registro documental de una carpeta compartida, y quitarlo sería quitar el
producto.

Lo que cambia es **cuándo se rellena**: en una pantalla en vez de en cinco, y creando por el camino
lo que falte. Un entregable que nace en el momento de su primera emisión sigue siendo un entregable
— ISO 19650 pide que exista y esté identificado, no que se planifique con semanas de antelación.

## Y no se copia el guardado

Esta pantalla **no guarda el archivo**. Crea lo que falta y manda a `SubirRevisionView`, que es
donde está la parte delicada: la clave por `sha256`, el guardado por tramos con `os.replace`, los
metadatos del IFC y la conversión de DWG a DXF. Duplicar eso serían sesenta líneas que se separan
de su original en el primer arreglo — y el primer arreglo ya ocurrió una vez, cuando la subida
dejó de leer el archivo entero en memoria.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from apps.core.personas import PersonasConNombre
from apps.documents.models import Entregable, TipoEntregable
from apps.projects.models import Disciplina, Proyecto


class EmpezarASubirForm(PersonasConNombre, forms.Form):
    """La obra, la disciplina y el entregable, en un paso. Devuelve el entregable creado."""

    proyecto = forms.ModelChoiceField(
        label=_("Work"),
        queryset=Proyecto.objects.none(),
        help_text=_("Which work this file belongs to."),
    )
    #: La disciplina existente, **o** una nueva escrita a mano. Ver `clean`.
    disciplina = forms.ModelChoiceField(
        label=_("Discipline"),
        queryset=Disciplina.objects.none(),
        required=False,
        help_text=_("Leave it empty and write a new one below if the one you need is not there."),
    )
    disciplina_nueva = forms.CharField(
        label=_("New discipline"),
        max_length=100,
        required=False,
        help_text=_("For example: Structure, Architecture, Services."),
    )
    codigo = forms.CharField(
        label=_("Deliverable code"),
        max_length=60,
        help_text=_("How this deliverable is named in the register. For example: 716-EST-MOD-01."),
    )
    titulo = forms.CharField(label=_("Title"), max_length=200)
    tipo = forms.ChoiceField(label=_("Type"), choices=TipoEntregable.choices)

    def __init__(self, *args, autor=None, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.core.tenancy import scope_queryset_to_organizacion

        self.autor = autor
        if autor is None:
            # **Sin autor, vacío y no abierto.** Es la lección de `EntregableForm`: un acotado que
            # depende de que quien llame se acuerde de pasar el argumento deja el desplegable con
            # todas las obras de todas las empresas — y aquí se **escribe** dentro de la que se
            # elija.
            return

        proyectos = scope_queryset_to_organizacion(Proyecto.objects.all(), autor).filter(
            is_active=True
        )
        self.fields["proyecto"].queryset = proyectos.order_by("codigo")
        self.fields["disciplina"].queryset = (
            Disciplina.objects.filter(proyecto__in=proyectos, is_active=True)
            .select_related("proyecto")
            .order_by("proyecto__codigo", "codigo")
        )
        self.fields["disciplina"].label_from_instance = lambda d: (
            f"{d.proyecto.codigo} · {d.codigo} — {d.nombre}"
        )

        # **Con una sola obra, se elige sola.** Es el caso del piloto y de casi cualquier oficina
        # pequeña: preguntar entre uno es preguntar por preguntar.
        if not self.is_bound and proyectos.count() == 1:
            self.initial.setdefault("proyecto", proyectos.first().pk)

    def clean(self):
        datos = super().clean()
        proyecto = datos.get("proyecto")
        disciplina = datos.get("disciplina")
        nueva = (datos.get("disciplina_nueva") or "").strip()

        if disciplina is None and not nueva:
            raise forms.ValidationError(
                _("Pick a discipline or write a new one: a deliverable hangs off one.")
            )

        # **Las dos a la vez no es una preferencia ambigua: es una pregunta sin respuesta.** Si se
        # eligiera la existente se perdería lo escrito sin decirlo, y al revés se crearía una
        # duplicada. Se pregunta.
        if disciplina is not None and nueva:
            raise forms.ValidationError(
                _("Pick one or write one, not both: it is not clear which you mean.")
            )

        # **La disciplina elegida tiene que ser de la obra elegida.** El desplegable ya está
        # acotado a las obras de quien mira, pero nada impide enviar a mano una disciplina de otra
        # obra suya — y el entregable acabaría colgando de una obra y de la disciplina de otra.
        cruzada = (
            disciplina is not None
            and proyecto is not None
            and disciplina.proyecto_id != proyecto.pk
        )
        if cruzada:
            self.add_error("disciplina", _("That discipline belongs to another work."))

        if (
            proyecto is not None
            and Entregable.objects.filter(
                proyecto=proyecto, codigo=datos.get("codigo", "").strip()
            ).exists()
        ):
            self.add_error("codigo", _("That code is already used in this work."))
        return datos

    def crear(self, autor) -> Entregable:
        """Crea la disciplina si hacía falta, y el entregable. Devuelve el entregable."""
        from django.db import transaction

        proyecto = self.cleaned_data["proyecto"]
        with transaction.atomic():
            disciplina = self.cleaned_data.get("disciplina")
            if disciplina is None:
                nombre = self.cleaned_data["disciplina_nueva"].strip()
                # El código sale del nombre: tres letras en mayúscula es la convención del registro
                # y pedirlo aparte sería un campo más en la pantalla que existe para tener menos.
                disciplina = Disciplina.objects.create(
                    proyecto=proyecto, codigo=nombre[:3].upper(), nombre=nombre
                )

            return Entregable.objects.create(
                organizacion=proyecto.organizacion,
                proyecto=proyecto,
                disciplina=disciplina,
                codigo=self.cleaned_data["codigo"].strip(),
                titulo=self.cleaned_data["titulo"].strip(),
                tipo=self.cleaned_data["tipo"],
                # **Quien sube es el responsable, y se puede cambiar después.** Pedirlo aquí sería
                # un campo más para contestar «yo» el noventa por ciento de las veces.
                responsable=autor,
            )
