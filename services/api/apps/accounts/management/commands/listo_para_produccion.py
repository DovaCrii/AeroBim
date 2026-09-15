"""¿Esta instalación está lista para que entre gente? **Lo contesta la base, no una casilla.**

## Por qué existe

`docs/PILOTO.md` trae un checklist de nueve casillas que alguien marca a mano antes de abrir la
puerta. Un checklist a mano tiene dos fallos, y los dos se pagan el primer día:

1. **Se marca lo que se cree, no lo que hay.** «Cada cuenta entró y vio la obra» se marca después de
   crear las cuentas, porque parece lo mismo — y no lo es: sin `Membresia`, la persona entra
   perfectamente y **todas las listas salen vacías sin un solo mensaje**.
2. **No se vuelve a mirar.** Se marca una vez, y tres semanas después alguien añadió una cuenta sin
   organización o el timer del resumen lleva diez días caído.

Esto se corre cuantas veces haga falta, **no escribe nada**, y contesta con lo que hay en la base.

## Lo que distingue, y por qué son tres niveles y no dos

- **Bloquea** — abrir la puerta con esto así hace que alguien no pueda trabajar, o que el registro
  guarde algo que no es verdad.
- **Mira esto** — no impide empezar, pero es lo que explica una llamada de la semana que viene.
- **Ya está** — dicho en voz alta a propósito: un informe que solo enumera problemas no deja saber
  si comprobó algo o si se quedó a medias.

Devuelve `1` si algo bloquea, para que un guion pueda pararse. `--estricto` hace que también
devuelva `1` con los avisos, para quien prefiera no abrir con nada pendiente.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Comprueba si esta instalación está lista para abrirle la puerta al equipo."

    def add_arguments(self, parser):
        parser.add_argument(
            "--estricto",
            action="store_true",
            help="Devuelve 1 también con avisos, no solo con bloqueantes.",
        )

    def handle(self, *args, **opciones):
        self.bloqueos: list[str] = []
        self.avisos: list[str] = []

        for revisar in (
            self._los_ajustes,
            self._los_roles,
            self._las_cuentas,
            self._la_obra,
            self._el_correo,
            self._los_trabajos,
            self._los_datos_de_ejemplo,
        ):
            revisar()

        self.stdout.write("")
        if self.bloqueos:
            self.stdout.write(self.style.ERROR(f"{len(self.bloqueos)} cosa(s) que bloquean:"))
            for uno in self.bloqueos:
                self.stdout.write(self.style.ERROR(f"  ✗ {uno}"))
        if self.avisos:
            self.stdout.write(self.style.WARNING(f"{len(self.avisos)} cosa(s) que mirar:"))
            for uno in self.avisos:
                self.stdout.write(self.style.WARNING(f"  ! {uno}"))
        if not self.bloqueos and not self.avisos:
            self.stdout.write(self.style.SUCCESS("Listo: nada pendiente."))
        elif not self.bloqueos:
            self.stdout.write(self.style.SUCCESS("Se puede abrir. Nada bloquea."))

        if self.bloqueos or (opciones["estricto"] and self.avisos):
            raise SystemExit(1)

    # --- las comprobaciones ------------------------------------------------------------

    def _titulo(self, texto):
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{texto}"))

    def _bien(self, texto):
        self.stdout.write(f"  ✓ {texto}")

    def _bloquea(self, texto):
        self.bloqueos.append(texto)
        self.stdout.write(self.style.ERROR(f"  ✗ {texto}"))

    def _mira(self, texto):
        self.avisos.append(texto)
        self.stdout.write(self.style.WARNING(f"  ! {texto}"))

    def _los_ajustes(self):
        self._titulo("Los ajustes")
        if settings.DEBUG:
            self._bloquea("DEBUG está encendido: las trazas de error saldrían en la pantalla")
        else:
            self._bien("DEBUG apagado")

        base = (getattr(settings, "SITE_BASE_URL", "") or "").strip()
        if not base:
            self._bloquea(
                "SITE_BASE_URL vacío: los enlaces del correo y los compartidos saldrían rotos"
            )
        elif "localhost" in base or "127.0.0.1" in base:
            # **Es un bloqueante y no un aviso.** Un enlace a `localhost` en el correo de otra
            # persona abre *su* máquina, así que no falla: enseña otra cosa o nada, y quien lo
            # recibe concluye que el producto no funciona.
            self._bloquea(f"SITE_BASE_URL apunta a esta máquina ({base}): los enlaces no abrirán")
        else:
            self._bien(f"SITE_BASE_URL = {base}")

        if timezone.get_current_timezone_name() != "America/Santiago":
            self._mira(
                f"la zona horaria es {timezone.get_current_timezone_name()}: "
                "el resumen de las 07:30 se dispara a otra hora"
            )
        else:
            self._bien("zona horaria America/Santiago")

    def _los_roles(self):
        from django.contrib.auth.models import Group

        from apps.accounts import roles

        self._titulo("Los roles")
        esperados = [
            roles.ADMINISTRADOR,
            roles.COORDINADOR,
            roles.PROYECTISTA,
            roles.REVISOR,
            roles.MANDANTE,
        ]
        faltan = [n for n in esperados if not Group.objects.filter(name=n).exists()]
        if faltan:
            self._bloquea(f"faltan roles ({', '.join(faltan)}): corre `manage.py bootstrap_roles`")
            return

        # **Un rol sin permisos existe y no sirve**, y es lo que deja `bootstrap_roles` si se corrió
        # antes de una migración que añadía el modelo al que se refiere.
        vacios = [
            g.name
            for g in Group.objects.filter(name__in=esperados)
            if g.name != roles.DIRECCION and not g.permissions.exists()
        ]
        if vacios:
            self._bloquea(
                f"roles sin ningún permiso ({', '.join(vacios)}): corre `bootstrap_roles` otra vez"
            )
        else:
            self._bien(f"los {len(esperados)} roles existen y tienen permisos")

    def _las_cuentas(self):
        from apps.accounts.models import ClaveProvisional
        from apps.core.models import Membresia

        self._titulo("Las cuentas")
        U = get_user_model()
        activas = U.objects.filter(is_active=True)
        normales = activas.filter(is_superuser=False)

        if not normales.exists():
            self._bloquea(
                "no hay ninguna cuenta que no sea superusuaria: probar con el superusuario "
                "**no prueba nada**, porque ve todo sin pasar por el acotado"
            )
            return
        self._bien(f"{normales.count()} cuenta(s) de trabajo")

        # **La trampa número uno de `PILOTO.md`**, y la que un checklist a mano marca mal: la cuenta
        # entra perfectamente y ve todas las listas vacías, sin un solo mensaje.
        con_membresia = set(Membresia.objects.values_list("usuario_id", flat=True))
        sueltas = [u.username for u in normales if u.pk not in con_membresia]
        if sueltas:
            self._bloquea(
                f"cuentas sin organización ({', '.join(sueltas[:6])}): entran y ven todo vacío "
                "sin ningún mensaje que lo explique"
            )
        else:
            self._bien("todas tienen organización")

        sin_rol = [u.username for u in normales if not u.groups.exists()]
        if sin_rol:
            self._bloquea(f"cuentas sin rol ({', '.join(sin_rol[:6])}): no abren ninguna pantalla")
        else:
            self._bien("todas tienen rol")

        # `notify.py` manda a `usuario.email`. Sin correo, esa persona no se entera de nada.
        sin_correo = [u.username for u in normales if not u.email.strip()]
        if sin_correo:
            self._bloquea(
                f"cuentas sin correo ({', '.join(sin_correo[:6])}): no reciben ningún aviso, "
                "y el producto no lo dice en ninguna pantalla"
            )
        else:
            self._bien("todas tienen correo")

        sin_estrenar = ClaveProvisional.objects.count()
        if sin_estrenar:
            self._mira(
                f"{sin_estrenar} cuenta(s) siguen con la clave del alta: mientras no la cambien, "
                "lo que firmen no prueba quién lo hizo"
            )

    def _la_obra(self):
        from apps.documents.models import Entregable, Idoneidad, Revision
        from apps.projects.models import Proyecto

        self._titulo("La obra")
        if not Proyecto.objects.exists():
            self._bloquea("no hay ninguna obra: no hay nada que abrir")
            return
        self._bien(f"{Proyecto.objects.count()} obra(s)")

        if not Entregable.objects.exists():
            self._bloquea("no hay ningún entregable: el registro está vacío")
            return

        publicadas = Revision.objects.filter(idoneidad__in=(Idoneidad.A, Idoneidad.B))
        if not publicadas.exists():
            self._bloquea(
                "ninguna revisión en idoneidad A o B: el mandante entra a un expediente vacío "
                "y concluye que no hay nada subido"
            )
        else:
            self._bien(f"{publicadas.count()} revisión(es) publicada(s)")

        from apps.documents import abribles

        abribles_ = [r for r in Revision.objects.all()[:200] if abribles.es_abrible(r)]
        if not abribles_:
            self._mira("ninguna revisión abre en el visor: media aplicación no se puede enseñar")
        else:
            self._bien(f"{len(abribles_)} revisión(es) se abren en el visor")

    def _el_correo(self):
        from apps.core.mail import mail_is_delivered, undelivered_reason

        self._titulo("El correo")
        if mail_is_delivered():
            self._bien("sale de la máquina")
        else:
            # **Bloquea.** Con el backend de consola la aplicación dice «enviado» y el aviso no
            # llega: es la peor combinación posible, porque nadie lo nota hasta que alguien
            # pregunta por qué no le avisaron de algo que sí se le asignó.
            self._bloquea(f"no sale de la máquina: {undelivered_reason()}")

    def _los_trabajos(self):
        from apps.core.jobs import trabajos_colgados, ultima_corrida

        self._titulo("Los trabajos programados")
        for comando, cuanto in (("enviar_resumen", 2), ("respaldo", 2)):
            ultima = ultima_corrida(comando)
            if ultima is None:
                self._mira(f"`{comando}` no ha corrido nunca: el timer puede no estar instalado")
            else:
                dias = (timezone.now() - ultima.started_at).days
                if dias > cuanto:
                    self._mira(f"`{comando}` no corre desde hace {dias} días")
                else:
                    self._bien(f"`{comando}` corrió hace {dias} día(s)")

        colgados = trabajos_colgados()
        if colgados:
            self._mira(f"{len(colgados)} trabajo(s) quedaron a medias y nadie los cerró")

    def _los_datos_de_ejemplo(self):
        from apps.projects.models import Proyecto

        self._titulo("Los datos de ejemplo")
        # **La obra sembrada del desarrollo no puede estar en producción.** `716-LCD` trae
        # observaciones de una corrida de prueba, y en una base real se confunden con hallazgos de
        # verdad — que es exactamente lo que un registro documental no puede permitirse.
        demo = Proyecto.objects.filter(codigo__in=("716-LCD", "PILOTO-AEROBIM"))
        if demo.exists():
            # Ordenados y sin repetir: en la base de desarrollo hay dos filas con el mismo código
            # —`preparar_piloto` corrido dos veces— y el mensaje salía nombrándolo dos veces, que
            # hace dudar de si el comando sabe contar.
            codigos = sorted(set(demo.values_list("codigo", flat=True)))
            self._bloquea(
                f"la base trae obras de ejemplo ({', '.join(codigos)}): "
                "sus observaciones se confunden con hallazgos reales"
            )
        else:
            self._bien("ninguna obra de ejemplo")
