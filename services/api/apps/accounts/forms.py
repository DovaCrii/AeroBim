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
