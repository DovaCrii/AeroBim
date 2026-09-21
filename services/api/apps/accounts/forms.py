"""El formulario del alta. **Lo que decide es a qué obra entra y con qué puede trabajar.**"""

from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils.translation import gettext_lazy as _

from apps.accounts import altas, roles
from apps.core.models import Organizacion

#: Los roles que se pueden asignar desde la pantalla.
#:
#: **`Administrador` no está, y es deliberado.** Ese rol se lleva *todos* los permisos que existan,
#: incluida esta misma pantalla: quien lo reciba puede crear más administradores, y una escalada de
#: privilegios a un clic de distancia no es una funcionalidad del piloto. Se da desde el `/admin/`
#: técnico, que es donde vive lo que requiere pensárselo.
#:
#: `Direccion` tampoco: no es un rol sino la lista de quién recibe el resumen, y ofrecerlo aquí
#: junto a los roles haría creer que da acceso a algo. Se asigna aparte.
ASIGNABLES = (roles.COORDINADOR, roles.PROYECTISTA, roles.REVISOR, roles.MANDANTE)


class NuevaOrganizacionForm(forms.Form):
    """Crear la empresa a la que pertenecen las obras. **Era el único paso sin pantalla.**

    ## El callejón sin salida que esto cierra

    Medido en `p340` el 2026-09-15, con la instalación recién hecha: se abre «Cuenta nueva», se
    escribe la persona, y el desplegable de organización **está vacío y no ofrece nada**. No se
    puede crear la cuenta; la pantalla de Organizaciones era una tabla de solo leer; y el `/admin/`
    técnico —que era por donde se hacía— dejó de publicarse el mismo día. O sea: **el producto
    recién instalado no se podía empezar a usar por ninguna vía.**

    Es el mismo patrón que ya costó una vez: una pantalla que exige algo que existe pero que no
    dice **dónde** se consigue. La diferencia es que aquí no existía en ninguna parte.

    ## Dos decisiones

    **El slug se calcula, no se pide.** Es una cadena para la URL y no un dato del negocio; pedirlo
    obliga a explicar qué es a quien solo quiere escribir «JEJ Ingeniería». Se deriva del nombre y
    se le añade un número si ya está cogido — nunca falla por colisión, que es el otro modo de
    dejar a alguien encallado.

    **Quien la crea entra dentro.** Sin membresía, `organizaciones_de` devuelve `none()` y la
    organización recién creada **desaparece de la lista en cuanto se recarga** para todo el que no
    sea superusuario: se habría creado algo invisible. Es la trampa nº 1 de `PILOTO.md` otra vez,
    un piso más arriba.
    """

    nombre = forms.CharField(
        label=_("Name of the organisation"),
        max_length=150,
        help_text=_(
            "The company the works belong to. If the whole team works at the same one, "
            "this is the only organisation you need."
        ),
    )

    def clean_nombre(self):
        nombre = self.cleaned_data["nombre"].strip()
        if Organizacion.objects.filter(nombre__iexact=nombre).exists():
            raise forms.ValidationError(_("There is already an organisation with that name."))
        return nombre

    def crear(self, autor):
        """Crea la organización **y mete dentro a quien la crea**. Devuelve la organización."""
        from django.db import transaction
        from django.utils.text import slugify

        from apps.core.models import Membresia

        nombre = self.cleaned_data["nombre"]
        with transaction.atomic():
            organizacion = Organizacion.objects.create(
                nombre=nombre, slug=self._slug_libre(slugify(nombre) or "organizacion")
            )
            # Sin esto la acabaría de crear y no la vería. Ver el docstring de la clase.
            Membresia.objects.create(organizacion=organizacion, usuario=autor, rol="admin")
        return organizacion

    @staticmethod
    def _slug_libre(base: str) -> str:
        """`jej`, `jej-2`, `jej-3`… **El nombre es único, pero el slug se deriva y puede chocar**:
        «JEJ Ingeniería» y «JEJ ingenieria» dan el mismo, y una violación de `unique` al guardar
        sería un error 500 delante de quien está empezando."""
        base = base[:76] or "organizacion"
        if not Organizacion.objects.filter(slug=base).exists():
            return base
        n = 2
        while Organizacion.objects.filter(slug=f"{base}-{n}").exists():
            n += 1
        return f"{base}-{n}"


class NuevaCuentaForm(forms.Form):
    """Crea la persona, su rol y su membresía **en un solo paso**, porque las tres son una.

    Separarlas fue la primera versión y estaba mal: una cuenta sin membresía entra perfectamente y
    ve **todas las listas vacías sin un solo mensaje** —`scope_queryset_to_organizacion` devuelve
    `none()`—, así que la persona llama diciendo que «no funciona» y no hay nada en los registros.
    `docs/PILOTO.md` lo tiene como la trampa número uno. Si las tres cosas van juntas, ese estado
    no se puede alcanzar sin querer.
    """

    nombre = forms.CharField(label=_("First name"), max_length=150)
    apellido = forms.CharField(label=_("Last name"), max_length=150)
    correo = forms.EmailField(
        label=_("Email"),
        help_text=_("Where the notifications go. A real address, or they will never arrive."),
    )
    organizacion = forms.ModelChoiceField(
        label=_("Organisation"),
        queryset=Organizacion.objects.none(),
        help_text=_("What this person will be able to see. Nothing outside it."),
    )
    rol = forms.ChoiceField(label=_("Role"), choices=[])

    def __init__(self, *args, autor=None, **kwargs):
        """`autor` acota las organizaciones ofrecidas a las suyas.

        **El desplegable es también un control de acceso.** Sin esto, quien puede crear cuentas
        puede meter a alguien en la obra de otra empresa eligiéndola en la lista — y de paso la
        lista le enseña qué otras empresas hay en el sistema, que ya es una fuga por sí sola.
        """
        super().__init__(*args, **kwargs)
        from apps.core.tenancy import organizaciones_de

        # **`organizaciones_de` y no `scope_queryset_to_organizacion`.** El segundo devuelve la
        # lista **entera** para este modelo, porque `Organizacion` no tiene un campo llamado
        # `organizacion` — es ella misma — y cae en la rama de los catálogos. Escrito así la
        # primera vez, y la prueba enseñó la empresa ajena en el desplegable.
        self.fields["organizacion"].queryset = organizaciones_de(autor)
        self.fields["rol"].choices = [
            (nombre, f"{nombre} — {roles.DESCRIPCIONES[nombre]}") for nombre in ASIGNABLES
        ]

    def clean_correo(self):
        """Dos cuentas con el mismo correo rompen los avisos **sin dar ningún error**.

        Ver también `EditarCuentaForm.clean_correo`, que hace lo mismo excluyéndose a sí misma.

        `notify.py` manda a `usuario.email`; con el correo repetido, la misma persona recibe los
        avisos de dos cuentas y no sabe cuál es la suya. Django no lo impide por su cuenta: el campo
        `email` del usuario **no es único**.
        """
        correo = self.cleaned_data["correo"].strip().lower()
        if get_user_model().objects.filter(email__iexact=correo).exists():
            raise forms.ValidationError(_("There is already an account with that email."))
        return correo

    def crear(self, autor):
        """Crea la cuenta y devuelve `(usuario, clave_inicial)`. **La clave no se guarda.**

        Va entera dentro de una transacción: una cuenta a medias —creada pero sin membresía— es
        exactamente el estado que este formulario existe para impedir.
        """
        from django.db import transaction

        from apps.accounts.models import ClaveProvisional
        from apps.core.models import Membresia

        U = get_user_model()
        with transaction.atomic():
            usuario = U.objects.create_user(
                username=altas.nombre_de_usuario(
                    self.cleaned_data["nombre"],
                    self.cleaned_data["apellido"],
                    set(U.objects.values_list("username", flat=True)),
                ),
                email=self.cleaned_data["correo"],
                first_name=self.cleaned_data["nombre"].strip(),
                last_name=self.cleaned_data["apellido"].strip(),
                password=(clave := altas.generar_clave()),
            )
            usuario.groups.add(Group.objects.get(name=self.cleaned_data["rol"]))
            Membresia.objects.create(
                organizacion=self.cleaned_data["organizacion"], usuario=usuario
            )
            ClaveProvisional.objects.create(usuario=usuario, creada_por=autor)
        return usuario, clave


class EditarCuentaForm(forms.Form):
    """Corregir una cuenta. **Un apellido mal escrito no se arreglaba por ninguna vía.**

    ## Por qué hacía falta

    Se podía crear una cuenta y generarle otra clave, y nada más. Un nombre con una letra de menos,
    un correo mal tecleado —que es **el que decide si le llegan los avisos**— o un rol equivocado se
    quedaban así para siempre. El único camino era el `/admin/` técnico, que dejó de publicarse el
    2026-09-15 porque AeroBim pasó a estar en internet.

    Y el correo mal escrito es el peor de los tres, porque **no falla**: la aplicación dice
    «enviado», el mensaje se va a una dirección que no existe, y la persona no se entera de nada.

    ## Lo que se puede cambiar, y lo que no

    Nombre, apellido, correo, rol y organización. **El nombre de usuario no**: es lo que esa persona
    escribe para entrar y lo que aparece en la auditoría al lado de cada cosa que hizo. Cambiarlo
    deja a alguien fuera de su propia cuenta y convierte el registro en una lista de nombres que ya
    no existen.
    """

    nombre = forms.CharField(label=_("First name"), max_length=150)
    apellido = forms.CharField(label=_("Last name"), max_length=150)
    correo = forms.EmailField(
        label=_("Email"),
        help_text=_("Where the notifications go. A real address, or they will never arrive."),
    )
    # **De seleccion multiple, y la clave `organizacion` se queda en singular a proposito.** El
    # modelo siempre permitio varias —`Membresia` tiene unicidad **del par** (organizacion,
    # usuario)— y era esta pantalla la que no sabia representarlo. Conservar el nombre del campo es
    # lo que deja que un envio con un solo valor siga siendo valido: Django lo lee como lista de uno.
    organizacion = forms.ModelMultipleChoiceField(
        label=_("Organisations"),
        queryset=Organizacion.objects.none(),
        help_text=_("What this person will be able to see. Nothing outside them."),
        widget=forms.CheckboxSelectMultiple,
    )
    rol = forms.ChoiceField(label=_("Role"), choices=[])

    def __init__(self, *args, cuenta, autor=None, **kwargs):
        """`cuenta` es la que se edita; `autor` acota las organizaciones ofrecidas a las suyas."""
        self.cuenta = cuenta
        super().__init__(*args, **kwargs)
        from apps.core.tenancy import organizaciones_de

        # **El mismo acotado que el alta, y por el mismo motivo**: sin él, quien edita puede mover a
        # alguien a la empresa de otro eligiéndola en la lista — y la lista misma le enseña qué
        # otras empresas hay.
        self.fields["organizacion"].queryset = organizaciones_de(autor)
        self.fields["rol"].choices = [
            (nombre, f"{nombre} — {roles.DESCRIPCIONES[nombre]}") for nombre in ASIGNABLES
        ]
        # Los valores de partida son los que tiene hoy: un formulario de editar que sale vacío
        # obliga a reescribir lo que estaba bien, y es como se pierde un dato al corregir otro.
        if not self.is_bound:
            self.initial.setdefault("nombre", cuenta.first_name)
            self.initial.setdefault("apellido", cuenta.last_name)
            self.initial.setdefault("correo", cuenta.email)
            # **Solo las que quien edita alcanza.** Las demas no se ofrecen ni se marcan: si se
            # marcaran, el diferencial creeria que las esta gestionando, y guardar sin tocar nada
            # las dejaria intactas por casualidad y no por decision.
            self.initial.setdefault(
                "organizacion",
                list(
                    cuenta.organizaciones.filter(
                        pk__in=self.fields["organizacion"].queryset.values("pk")
                    ).values_list("pk", flat=True)
                ),
            )
            grupo = cuenta.groups.filter(name__in=ASIGNABLES).first()
            if grupo is not None:
                self.initial.setdefault("rol", grupo.name)

    def clean_correo(self):
        """Lo mismo que en el alta, **excluyéndose a sí misma**.

        Sin el `exclude`, guardar la cuenta sin tocar el correo se rechazaría por chocar consigo
        misma: «ya hay una cuenta con ese correo», que es la suya. Es el error clásico de copiar una
        validación de unicidad de un formulario de crear a uno de editar.
        """
        correo = self.cleaned_data["correo"].strip().lower()
        otras = get_user_model().objects.filter(email__iexact=correo).exclude(pk=self.cuenta.pk)
        if otras.exists():
            raise forms.ValidationError(_("There is already an account with that email."))
        return correo

    def guardar(self):
        """Aplica los cambios. Devuelve **qué cambió**, para el registro y para el mensaje."""
        from django.db import transaction

        from apps.core.models import Membresia

        cuenta = self.cuenta
        cambios: list[str] = []
        with transaction.atomic():
            for campo, atributo, etiqueta in (
                ("nombre", "first_name", _("first name")),
                ("apellido", "last_name", _("last name")),
                ("correo", "email", _("email")),
            ):
                nuevo = self.cleaned_data[campo].strip()
                if getattr(cuenta, atributo) != nuevo:
                    setattr(cuenta, atributo, nuevo)
                    cambios.append(str(etiqueta))
            cuenta.save(update_fields=["first_name", "last_name", "email"])

            rol = self.cleaned_data["rol"]
            if not cuenta.groups.filter(name=rol).exists():
                # **Se quitan solo los roles asignables.** `cuenta.groups.clear()` se llevaría por
                # delante `Direccion` —que no es un rol sino la lista de quién recibe el resumen— y
                # alguien dejaría de recibirlo por haberle corregido un apellido.
                cuenta.groups.remove(*Group.objects.filter(name__in=ASIGNABLES))
                cuenta.groups.add(Group.objects.get(name=rol))
                cambios.append(str(_("role")))

            # ══════════════════════════════════════════════════════════════════════════════
            # **Un diferencial acotado, no un borrar y crear.**
            #
            # Esto era `Membresia.objects.filter(usuario=cuenta).delete()` y una sola alta. El
            # `filter` **no llevaba `organizacion`**, así que se llevaba todas — incluidas las de
            # empresas que quien edita ni ve, porque el desplegable va acotado a las suyas.
            #
            # Y lo que quedaba no se parecía a un error: la persona entra, pasa el login, pasa los
            # permisos, y **ve todas las listas vacías sin un solo mensaje**. La trampa nº 1 de
            # `docs/PILOTO.md`, provocada desde la pantalla que corrige un apellido.
            #
            # Se gestiona **solo lo que quien edita alcanza**. Lo de fuera no se toca: no se puede
            # decidir sobre lo que no se puede ver.
            # ══════════════════════════════════════════════════════════════════════════════
            alcance = set(self.fields["organizacion"].queryset.values_list("pk", flat=True))
            elegidas = {organizacion.pk for organizacion in self.cleaned_data["organizacion"]}
            actuales = set(
                cuenta.organizaciones.filter(pk__in=alcance).values_list("pk", flat=True)
            )

            sobran = actuales - elegidas
            faltan = elegidas - actuales
            if sobran:
                Membresia.objects.filter(usuario=cuenta, organizacion__in=sobran).delete()
            for pk in faltan:
                Membresia.objects.create(organizacion_id=pk, usuario=cuenta)
            if sobran or faltan:
                cambios.append(str(_("organisation")))
        return cambios
