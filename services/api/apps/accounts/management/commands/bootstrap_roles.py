"""Crea los roles y les asigna sus permisos, de forma idempotente.

Se corre en cada despliegue: es lo que hace que un permiso nuevo llegue a los roles
que le corresponden sin que nadie tenga que acordarse de tocar el `/admin/`.

**Un nombre de permiso mal escrito para el comando en vez de dejar un rol vacio.**
Es la diferencia entre enterarse al desplegar y enterarse cuando alguien no puede
hacer su trabajo y nadie sabe por que.
"""

from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.roles import (
    ADMINISTRADOR,
    GRUPOS_DE_NOTIFICACION,
    PERMISOS_POR_ROL,
)


class Command(BaseCommand):
    help = "Crea los roles de AeroBim y les asigna sus permisos."

    @transaction.atomic
    def handle(self, *args, **options):
        existentes = {
            f"{p.content_type.app_label}.{p.codename}": p
            for p in Permission.objects.select_related("content_type")
        }

        # El administrador se lleva todo lo que exista. Enumerarlo seria una lista que
        # se queda atras en cuanto se añade un modelo.
        admin, _ = Group.objects.get_or_create(name=ADMINISTRADOR)
        admin.permissions.set(Permission.objects.all())
        self.stdout.write(f"{ADMINISTRADOR}: {admin.permissions.count()} permisos (todos)")

        for rol, nombres in PERMISOS_POR_ROL.items():
            faltan = [n for n in nombres if n not in existentes]
            if faltan:
                raise CommandError(
                    f"El rol «{rol}» declara permisos que no existen: {', '.join(faltan)}. "
                    "Revisa `apps/accounts/roles.py`: o esta mal escrito, o falta la "
                    "migracion del modelo al que se refiere."
                )
            grupo, _creado = Group.objects.get_or_create(name=rol)
            grupo.permissions.set([existentes[n] for n in nombres])
            self.stdout.write(f"{rol}: {len(nombres)} permisos")

        for nombre in GRUPOS_DE_NOTIFICACION:
            grupo, _creado = Group.objects.get_or_create(name=nombre)
            # **Cero permisos, y a proposito.** Estar en una lista de correo no da
            # acceso a nada; si algun dia este grupo apareciera con permisos, seria
            # porque alguien los añadio a mano y hay que quitarlos.
            grupo.permissions.clear()
            self.stdout.write(f"{nombre}: grupo de notificacion, sin permisos")

        self.stdout.write(self.style.SUCCESS("Roles al dia."))
