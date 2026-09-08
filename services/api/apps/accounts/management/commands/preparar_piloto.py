"""Deja la base lista para el piloto: organizacion, membresias y la obra de hallazgos.

## Por que existe

Hasta hoy **organizacion, membresias y etiquetas solo se creaban por `manage.py shell`**. No hay
`admin.py` en ninguna app, y las pantallas de organizaciones y de usuarios son de solo lectura.

Y hay una trampa que cuesta media hora entender: **sin `Membresia`, la cuenta entra y no ve nada.**
`scope_queryset_to_organizacion` devuelve `none()` para quien no es miembro, asi que el login
funciona, el portal carga, y todas las listas salen vacias. No hay ningun mensaje que lo explique.

Este comando existe para que preparar el piloto sea **un comando reproducible** en vez de un pegote
de `shell` que alguien tiene que recordar, y para que la trampa de la membresia no se pueda olvidar.

## Idempotente, como `bootstrap_roles`

Se puede correr en cada despliegue. Nada se duplica y nada se sobreescribe: lo que ya existe se
respeta —si alguien renombro la obra a mano, se queda con su nombre— y solo se añade lo que falta.
Eso es lo que permite correrlo sin miedo cuando no se recuerda si ya se corrio.

## Lo que NO hace, y es a proposito

**No crea usuarios ni les pone contraseña.** Las cuentas se dan de alta en `/admin/` —donde `auth`
si esta registrado— y la contraseña se entrega en persona. Un comando que crea cuentas con una
contraseña conocida deja una puerta abierta que nadie cierra despues.

**No crea la obra real** (el CC 741): esa la crea quien coordina, con su codigo, sus disciplinas y
sus fechas. Aqui solo se crea la obra donde viven los hallazgos **del propio piloto**.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Membresia, Organizacion
from apps.projects.models import Etiqueta, Proyecto

#: El codigo de la obra donde se registran los hallazgos del piloto.
#:
#: **Va en la misma organizacion que la obra real y no en una aparte.** Una organizacion es una
#: tabla de membresias: separarla obligaria a dar de alta a cada persona dos veces, y la mitad se
#: quedaria sin la segunda. El mandante la vera, y es aceptable — no puede abrir observaciones.
CODIGO_PILOTO = "PILOTO-AEROBIM"

#: El vocabulario de etiquetas del piloto.
#:
#: **Dos ejes, y el prefijo es lo que los separa**: `tipo` dice que clase de hallazgo es, y
#: `pantalla:` dice donde se vio. Un hallazgo lleva uno de cada.
#:
#: Y son etiquetas y no un campo nuevo: `Etiqueta` ya existe por proyecto, ya filtra el informe
#: (`informe.Opciones.etiqueta`) y ya tiene su formulario de casillas. Un campo «pantalla» seria
#: una migracion, una columna y un desplegable para lo que un prefijo ya resuelve.
ETIQUETAS_DEL_PILOTO: tuple[tuple[str, str], ...] = (
    # Los tres tipos. El color sale de los tokens del portal, no inventado.
    ("defecto", "#c53b4d"),  # --ab-danger: algo esta mal
    ("mejora", "#5b3a9e"),  # --ab-primary: funciona y podria ser mejor
    ("duda", "#8a5a00"),  # --ab-warn: no se entiende que hace
    # Donde se vio. Todas del mismo color: la pantalla no es una prioridad.
    ("pantalla:portal", "#626f85"),
    ("pantalla:expediente", "#626f85"),
    ("pantalla:observaciones", "#626f85"),
    ("pantalla:visor", "#626f85"),
    ("pantalla:documento", "#626f85"),
    ("pantalla:nube", "#626f85"),
    # Lo que el triage decide posponer, para que no se cuente como abierto sin mas.
    ("plan:pospuesto", "#4f5b72"),
)


class Command(BaseCommand):
    help = "Deja la base lista para el piloto: organizacion, membresias y la obra de hallazgos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--organizacion",
            required=True,
            help="Nombre de la organizacion. Se crea si no existe.",
        )
        parser.add_argument(
            "--slug",
            default="",
            help="Slug de la organizacion. Por omision, el nombre en minusculas con guiones.",
        )
        parser.add_argument(
            "--miembro",
            action="append",
            default=[],
            metavar="USUARIO",
            help=(
                "Nombre de usuario a hacer miembro. Se repite por cada persona. "
                "El usuario tiene que existir ya: las cuentas se crean en /admin/."
            ),
        )
        parser.add_argument(
            "--admin",
            action="append",
            default=[],
            metavar="USUARIO",
            help="Como --miembro, pero con rol de admin en la organizacion.",
        )
        parser.add_argument(
            "--sin-obra-piloto",
            action="store_true",
            help=f"No crear la obra «{CODIGO_PILOTO}» ni sus etiquetas.",
        )

    @transaction.atomic
    def handle(self, *args, **opciones):
        organizacion = self._organizacion(opciones)
        self._membresias(organizacion, opciones)
        if not opciones["sin_obra_piloto"]:
            self._obra_del_piloto(organizacion)

        # **Se dice como comprobarlo, porque el error tipico no da error.** Una cuenta sin
        # membresia entra y ve todas las listas vacias, sin un solo mensaje que lo explique.
        self.stdout.write("")
        self.stdout.write(
            "Comprueba que cada persona entra Y VE la obra: una cuenta sin membresia "
            "entra igual y ve todo vacio, sin ningun aviso."
        )

    def _organizacion(self, opciones) -> Organizacion:
        nombre = opciones["organizacion"]
        slug = opciones["slug"] or nombre.strip().lower().replace(" ", "-")[:80]

        organizacion, creada = Organizacion.objects.get_or_create(
            slug=slug, defaults={"nombre": nombre}
        )
        if creada:
            self.stdout.write(f"organizacion creada: {organizacion.nombre} ({organizacion.slug})")
        else:
            # **No se renombra lo que ya existe.** Si alguien la ajusto a mano, correr esto otra
            # vez no deberia deshacerlo — es lo que hace que el comando se pueda repetir sin miedo.
            self.stdout.write(f"organizacion ya existia: {organizacion.nombre} ({slug})")
        return organizacion

    def _membresias(self, organizacion: Organizacion, opciones) -> None:
        U = get_user_model()
        pedidos = [(u, "miembro") for u in opciones["miembro"]]
        pedidos += [(u, "admin") for u in opciones["admin"]]
        if not pedidos:
            self.stdout.write("sin miembros que añadir (ningun --miembro ni --admin)")
            return

        # **Se comprueban todos antes de crear ninguno.** Con un nombre mal escrito a la mitad, la
        # transaccion revierte y no queda media organizacion preparada: se arregla el nombre y se
        # vuelve a correr, en vez de tener que averiguar cuales entraron.
        faltan = [u for u, _rol in pedidos if not U.objects.filter(username=u).exists()]
        if faltan:
            raise CommandError(
                f"Estas cuentas no existen: {', '.join(sorted(set(faltan)))}. "
                "Creala en /admin/ (auth si esta registrado) y vuelve a correr esto. "
                "Este comando no crea usuarios a proposito: no deja contraseñas conocidas."
            )

        for usuario, rol in pedidos:
            persona = U.objects.get(username=usuario)
            membresia, creada = Membresia.objects.get_or_create(
                organizacion=organizacion, usuario=persona, defaults={"rol": rol}
            )
            if creada:
                self.stdout.write(f"  miembro: {usuario} ({rol})")
            elif membresia.rol != rol:
                membresia.rol = rol
                membresia.save(update_fields=["rol"])
                self.stdout.write(f"  miembro: {usuario} — rol cambiado a {rol}")
            else:
                self.stdout.write(f"  miembro: {usuario} — ya lo era")

    def _obra_del_piloto(self, organizacion: Organizacion) -> None:
        obra, creada = Proyecto.objects.get_or_create(
            organizacion=organizacion,
            codigo=CODIGO_PILOTO,
            defaults={
                "nombre": "Piloto de AeroBim",
                "cliente": "Uso interno",
            },
        )
        self.stdout.write(f"obra del piloto {'creada' if creada else 'ya existia'}: {obra.codigo}")

        puestas = 0
        for nombre, color in ETIQUETAS_DEL_PILOTO:
            _etiqueta, nueva = Etiqueta.objects.get_or_create(
                proyecto=obra, nombre=nombre, defaults={"color": color}
            )
            puestas += 1 if nueva else 0
        self.stdout.write(
            f"  etiquetas: {puestas} nuevas de {len(ETIQUETAS_DEL_PILOTO)} declaradas"
        )
