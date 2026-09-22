"""Lo que el visor necesita del registro: qué revisiones puede abrir, y sus bytes.

**Es la costura entre las dos mitades del producto.** Hasta ahora el visor abría archivos
del disco de quien lo usaba y no sabía nada de proyectos, y el registro guardaba revisiones
—DXF e IFC incluidos— y no podía mostrarlas. O sea que «subir y visualizar todo junto» no
estaba: se podían las dos cosas, pero no con el mismo archivo.

**Dos peticiones y no una, a propósito.** Primero los metadatos y después los bytes: así el
visor puede decir *qué* está abriendo —el código del entregable, su revisión, su código de
idoneidad— antes de descargar veinte megas, y no hay que inventar cabeceras para meter el
nombre del archivo dentro de la respuesta binaria.

Las tres reglas de acceso son las mismas que en las pantallas, y se escriben una vez:

- **`view_revision` explícito**, vía `ViewModelPermissions`, que es el `DjangoModelPermissions`
  de DRF con la lectura guardada — el de DRF deja `GET` sin exigir nada.
- **Acotado por organización**, y aquí hay que hacerlo a mano: una `Revision` no lleva el
  campo `organizacion`, cuelga de su entregable. `scope_queryset_to_organizacion` devuelve
  intacto un modelo sin el campo, así que confiar en él dejaría el hueco abierto.
- **Solo lo publicado para quien no escribe**: un mandante no ve una `S0` en curso, y eso no
  lo puede decir un permiso.
"""

from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.views import APIView

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    ChangeModelPermissions,
    PersonalStatePermissions,
    ViewModelPermissions,
)
from apps.documents import abribles, rangos, storage
from apps.documents.abribles import VISOR_MODELO, abre_en, visor_de
from apps.documents.models import MarcaDeCoordinacion, Observacion, Revision
from apps.documents.views import revisiones_visibles


def como_json(revision: Revision, user) -> dict:
    entregable = revision.entregable
    return {
        "id": str(revision.pk),
        "correlativo": revision.correlativo,
        "idoneidad": revision.idoneidad,
        "idoneidadTexto": revision.get_idoneidad_display(),
        "nombre": revision.nombre_original,
        # **Con qué nombre abrirlo, que no es siempre con el que se subió.** Un DWG se sirve por su
        # DXF convertido, y el visor elige el lector por la extensión: ver `nombre_para_el_visor`.
        "nombreParaElVisor": abribles.nombre_para_el_visor(revision),
        "extension": storage.extension_de(revision.nombre_original),
        # Con qué visor se abre, decidido en un solo sitio. Así la página del documento puede
        # decir "esto no es un PDF" en vez de pasarle un IFC a PDFium y mostrar un error suyo.
        "visor": visor_de(revision),
        "tamanoBytes": revision.tamano_bytes,
        "sha256": revision.sha256,
        "emitidaEn": revision.emitida_en.isoformat(),
        "esVigente": revision.es_vigente,
        "entregable": {
            "id": str(entregable.pk),
            "codigo": entregable.codigo,
            "titulo": entregable.titulo,
            "disciplina": entregable.disciplina.codigo,
        },
        "proyecto": {
            # **El id, y no solo el código.** Sin él el visor no puede enlazar de vuelta a la obra:
            # es lo que lo saca de ser un callejón sin salida —se entraba y la única salida era el
            # botón de atrás del navegador—.
            "id": str(entregable.proyecto.pk),
            "codigo": entregable.proyecto.codigo,
            "nombre": entregable.proyecto.nombre,
        },
        # **Si este usuario puede abrir una observación sobre esta revisión** (`F4.1`). Lo contesta
        # el servidor porque es el único que puede, y viaja acá —en los metadatos que el visor ya
        # pide— para no gastar una petición más en una pregunta de un solo bit.
        #
        # Con esto el visor decide si dibuja el botón «Observar» en la ficha del elemento. Un botón
        # que termina en 403 es peor que no ofrecerlo: enseña a probar puertas.
        "puedeObservar": user.has_perm("documents.add_observacion"),
        "contenido": f"/api/revisiones/{revision.pk}/contenido/",
    }


class RevisionesAbriblesAPI(ListAPIView):
    """Las revisiones que **el visor de modelos** puede abrir: su propio selector.

    Existe para que el visor no dependa de que alguien llegue con un enlace. Es la lista
    que contesta «qué hay en este proyecto que yo pueda mirar».

    **Filtra por el visor concreto y no por «es abrible».** Desde `F8.6` un PDF también se abre
    —en otra pantalla—, y con el predicado general los PDFs entraban en esta lista: el visor 3D
    los habría intentado cargar como geometría y habría quedado en blanco.

    **Y viene agrupada por obra.** Devolvía doscientas revisiones de todas las organizaciones
    visibles en una sola lista plana: con un proyecto real de cientos de entregables eso es una
    lista inservible, y el tope de doscientas cortaba **en silencio** — un modelo que no aparece
    se lee como que no existe, no como que no cupo. Ahora el tope es por proyecto y la respuesta
    dice cuándo recortó.
    """

    #: Cuántas revisiones se devuelven por proyecto. Es un selector, no un inventario: si alguien
    #: necesita ver las trescientas de una obra, la pantalla del proyecto es donde están.
    TOPE_POR_PROYECTO = 60

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        consulta = revisiones_visibles(request.user).filter(es_vigente=True)
        # El orden manda dentro de cada grupo, así que se pide acá y no se reordena en el visor.
        consulta = consulta.order_by("entregable__proyecto__codigo", "entregable__codigo")

        por_proyecto: dict[str, dict] = {}
        recortados = 0
        for revision in consulta:
            if not abre_en(revision, VISOR_MODELO):
                continue
            proyecto = revision.entregable.proyecto
            grupo = por_proyecto.setdefault(
                str(proyecto.pk),
                {
                    "id": str(proyecto.pk),
                    "codigo": proyecto.codigo,
                    "nombre": proyecto.nombre,
                    "revisiones": [],
                },
            )
            if len(grupo["revisiones"]) >= self.TOPE_POR_PROYECTO:
                recortados += 1
                continue
            grupo["revisiones"].append(como_json(revision, request.user))

        return Response(
            {
                "proyectos": sorted(por_proyecto.values(), key=lambda p: p["codigo"]),
                # **Se dice cuántas quedaron fuera.** Un recorte silencioso hace que alguien
                # concluya que su modelo no está subido.
                "recortados": recortados,
                # La lista plana se mantiene, y **no por compatibilidad**: hasta hoy este endpoint
                # no lo consumía nadie —el selector que describe su docstring nunca se cableó en el
                # visor— así que no hay contrato antiguo que respetar. Se queda porque es la
                # respuesta a «qué puedo abrir» sin importar de qué obra, que es lo que necesita el
                # aviso de «no hay nada que abrir».
                "revisiones": [r for g in por_proyecto.values() for r in g["revisiones"]],
            }
        )


class RevisionAPI(RetrieveAPIView):
    """Los metadatos de una revisión: qué es, antes de descargarla."""

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404
        return Response(como_json(revision, request.user))


class ObservacionesDeRevisionAPI(APIView):
    """Las observaciones ancladas en un documento: **página y coordenada**, para dibujarlas.

    Es la mitad que faltaba de `F8.6`. El modelo guardaba `pagina`, `ancla_x` y `ancla_y` desde
    el primer día y **no había quien las dibujara**: una observación sobre la página 7 se leía
    como texto en una lista, y quien la recibía tenía que buscar a mano de qué hablaba.

    **Pide `view_observacion`, no `view_revision`.** Son dos permisos porque son dos cosas: un
    rol puede ver los planos publicados y no tener nada que ver con los hallazgos internos. Y
    la revisión se busca por `revisiones_visibles`, así que sobre un documento que el usuario
    no puede ver no hay observaciones que listar, ni siquiera para decir cuántas hay.

    **Y acepta `POST`**, que es lo que permite dejar una nota sin salir del visor: ver abajo.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Observacion.objects.none()

    def post(self, request, *args, **kwargs):
        """Deja una nota sobre un elemento **sin salir del visor**. `F4.9`.

        **El formulario de página completa era el problema, no una molestia.** Pulsar «Observar»
        abría otra pantalla y, con las palabras del usuario, «al salir de lo que veo pierdo visión
        de lo que estoy haciendo»: se anota mirando el modelo, y si hay que dejar de mirarlo para
        escribir, se anota peor o no se anota.

        **El responsable es opcional y por defecto es quien la abre.** Eso es lo que permite el
        «luego en otra etapa pasarlo» que pidió: se deja la nota ahora, mirando, y se reparte
        después desde la pantalla de observaciones. `Observacion.responsable` no acepta vacío —cada
        observación tiene dueño, que es una regla del producto— así que el dueño es el autor hasta
        que alguien la asigne, y eso **es cierto**: es suya mientras nadie más la tome.

        Pide `add_observacion` —lo hace `ViewModelPermissions`, que mapea `POST` a `add_*`— y se
        acota por organización a través de la revisión.
        """
        from rest_framework.response import Response

        from apps.documents.camara import leer as leer_camara
        from apps.documents.marcado import leer as leer_marcado
        from apps.documents.notify import avisar_asignacion
        from apps.documents.punto import leer as leer_punto
        from apps.documents.visibilidad import leer as leer_visibilidad

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404

        titulo = str(request.data.get("titulo") or "").strip()[:250]
        if not titulo:
            return Response({"error": _("The note needs a title.")}, status=400)

        guid = str(request.data.get("guid") or "").strip()
        # Misma comprobación de forma que el formulario: 22 caracteres del alfabeto de IFC. Guardar
        # cualquier cosa dejaría un ancla que no apunta a nada.
        if guid and not (len(guid) == 22 and all(c.isalnum() or c in "_$" for c in guid)):
            return Response({"error": _("That is not a valid IFC GUID.")}, status=400)

        # **El punto del levantamiento, para las notas que no tienen elemento.** `F12.14`. En obra
        # la nube llega antes que el modelo, así que hasta hoy una nota sobre lo construido no tenía
        # de dónde colgar: sin GUID, la cámara y la visibilidad se descartaban —ver las guardas de
        # más abajo— y la observación quedaba sobre la revisión sin decir dónde.
        punto = leer_punto(request.data.get("punto"))
        # **Lo que decide si esta nota tiene sitio en la escena.** Da igual cuál de los dos: una
        # nota con GUID y una nota con punto son las dos notas *sobre algo que se está mirando*, y
        # la cámara, la visibilidad y las cotas que la acompañan valen para las dos.
        en_la_escena = bool(guid) or punto is not None

        prioridad = request.data.get("prioridad")
        if prioridad not in dict(Observacion.PRIORIDADES):
            prioridad = Observacion.MEDIA

        entregable = revision.entregable
        observacion = Observacion(
            organizacion=entregable.organizacion,
            proyecto=entregable.proyecto,
            revision=revision,
            titulo=titulo,
            descripcion=str(request.data.get("descripcion") or "")[:4000],
            prioridad=prioridad,
            autor=request.user,
            responsable=self._responsable(request, entregable),
            ifc_guid=guid,
            # Las tres coordenadas van juntas o no van: media coordenada no señala nada.
            ancla_nube_x=punto[0] if punto is not None else None,
            ancla_nube_y=punto[1] if punto is not None else None,
            ancla_nube_z=punto[2] if punto is not None else None,
            # La cámara llega ya en el sistema del IFC —la convierte el visor— y se valida igual
            # que en el formulario. Una cámara mala se descarta y la nota se guarda sin ella.
            punto_de_vista=leer_camara(request.data.get("camara")) if en_la_escena else {},
            # **Y qué se estaba viendo**, no solo desde dónde — `F4.7`. Sin esto, una observación
            # encontrada aislando una planta salía en el BCF con el modelo entero a la vista, o sea
            # con el problema tapado por lo que precisamente se había apagado.
            visibilidad=leer_visibilidad(request.data.get("visibilidad")) if en_la_escena else {},
            # **Y qué señalaba** — `F4.5`. Las cotas que estaban a la vista, como segmentos en el
            # sistema del IFC. Sin esto el título decía «choca con el ducto» y la cota de 4 cm que
            # lo demostraba se quedaba en el navegador de quien anotó.
            marcado=leer_marcado(request.data.get("marcado")) if en_la_escena else [],
        )
        observacion.save()
        # **La foto se guarda después de la observación y su fallo no la arrastra.** Lo que hay que
        # conservar es el hallazgo: una imagen que no se pudo escribir —disco lleno, montaje de
        # solo lectura— deja el tema sin miniatura, que es lo que salía antes de que las hubiera.
        clave = self._guardar_instantanea(request, observacion, revision)
        if clave:
            observacion.instantanea = clave
            observacion.save(update_fields=["instantanea", "updated_at"])
        set_audit_context(request, observacion, action="abrir_observacion")

        # **Se avisa solo si tiene otro dueño.** Un correo diciéndote que te asignaste algo a ti
        # mismo hace que la gente filtre el remitente, y entonces el aviso que importa tampoco se
        # lee. Ver `mail.py`, que existe por esta misma lección.
        avisada = False
        if observacion.responsable_id != request.user.pk:
            avisada = avisar_asignacion(observacion)

        return Response(
            {
                "id": str(observacion.pk),
                "titulo": observacion.titulo,
                "url": observacion.get_absolute_url(),
                "responsable": str(observacion.responsable),
                # **Se dice si quedó a tu nombre**, para que la tarjeta pueda recordar que falta
                # repartirla.
                "esMia": observacion.responsable_id == request.user.pk,
                "avisada": avisada,
            },
            status=201,
        )

    def _guardar_instantanea(self, request, observacion, revision) -> str:
        """Escribe la foto del visor y devuelve su clave, o `""` si no hay o no se pudo.

        **Va al mismo almacén que los documentos**, con la misma clave construida —proyecto,
        entregable y sha256— y nunca con un nombre que venga de fuera. El sha256 hace además que dos
        observaciones tomadas desde la misma pantalla no dupliquen el archivo.
        """
        import logging

        from apps.documents import instantanea as lector_instantanea

        datos = lector_instantanea.leer(request.data.get("instantanea"))
        if datos is None:
            return ""

        try:
            extension, sha = storage.validar("captura.png", datos)
            clave = storage.clave_para(
                proyecto_codigo=revision.entregable.proyecto.codigo,
                entregable_codigo=revision.entregable.codigo,
                sha256=sha,
                extension=extension,
            )
            storage.guardar(clave, datos)
        except (storage.CargaRechazada, OSError):
            logging.getLogger("aerobim.jobs").warning(
                "no se pudo guardar la instantánea de la observación %s", observacion.pk
            )
            return ""
        return clave

    def _responsable(self, request, entregable):
        """A quién le toca: el que pidan, si puede; el autor si no dicen nada.

        **El id que llegue se comprueba contra la gente de la organización**, no se confía. Sin eso
        se puede asignar una observación a un usuario de otro cliente escribiendo su id, y entonces
        le llega un correo con el enlace a una obra que no es suya.
        """
        pedido = request.data.get("responsable")
        if not pedido:
            return request.user

        from django.contrib.auth import get_user_model

        from apps.core.models import Membresia

        candidato = (
            get_user_model()
            .objects.filter(
                pk__in=Membresia.objects.filter(organizacion=entregable.organizacion).values_list(
                    "usuario_id", flat=True
                )
            )
            .filter(pk=pedido)
            .first()
        )
        return candidato or request.user

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404

        observaciones = (
            Observacion.objects.filter(revision=revision)
            .exclude(pagina=None)
            .select_related("responsable", "autor")
            .order_by("pagina", "created_at")
        )
        return Response(
            {
                # **Si puede abrir una, y por eso viene en la respuesta.** El visor decide con
                # esto si el clic sobre la página hace algo: ofrecer un cursor que promete abrir
                # una observación y termina en 403 es la misma trampa que ofrecer un botón que
                # termina en 403, y peor, porque en una página entera no se ve dónde estaba.
                "puedeObservar": request.user.has_perm("documents.add_observacion"),
                "observaciones": [
                    {
                        "id": str(o.pk),
                        "titulo": o.titulo,
                        "estado": o.estado,
                        "estadoTexto": o.get_estado_display(),
                        "prioridad": o.prioridad,
                        "responsable": str(o.responsable),
                        "pagina": o.pagina,
                        # Fracciones de la página, no píxeles: el PDF se dibuja a la escala que
                        # quepa y a la densidad de la pantalla, así que un píxel guardado hoy
                        # apunta a otro sitio mañana.
                        "x": o.ancla_x,
                        "y": o.ancla_y,
                        "url": f"/documentos/observaciones/{o.pk}/",
                    }
                    for o in observaciones
                    if o.ancla_x is not None and o.ancla_y is not None
                ],
            }
        )


class ObservacionesDelModeloAPI(APIView):
    """Las observaciones **ancladas al modelo** de un proyecto, para verlas en el visor. `F4.1`.

    Es la contraparte de {@link ObservacionesDeRevisionAPI}, que a propósito solo devuelve las
    ancladas a un documento —hace `exclude(pagina=None)`— porque las dibuja sobre una página de PDF.
    Estas se dibujan en la escena: llevan **el GUID del elemento y la cámara**.

    **Cierra la mitad que faltaba del ciclo.** La observación se creaba desde el visor y para verla
    había que salir a otra pantalla, así que quien coordinaba tenía el hallazgo en un sitio y el
    modelo en otro.

    Pide `view_observacion` y se acota por organización, igual que el resto. Y va **por proyecto y
    no por revisión**: un hallazgo sobre una viga de la estructura importa mirando el modelo de
    arquitectura, que es de lo que trata coordinar.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Observacion.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        # **Solo las que tienen GUID.** Una observación sobre un PDF no tiene elemento que
        # seleccionar, y mandarla acá pondría en la lista del visor filas que no llevan a ninguna
        # parte. Se ven en su pantalla, que es donde se resuelven.
        # **Por `nulos_al_final`**: SQLite pone los `NULL` primero en ascendente y PostgreSQL al
        # final, así que un hallazgo sin fecha sale arriba de la lista del visor en desarrollo y
        # abajo en producción, sin que nada falle.
        from apps.documents.orden import nulos_al_final

        observaciones = nulos_al_final(
            Observacion.objects.filter(proyecto=proyecto)
            .exclude(ifc_guid="")
            .exclude(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
            .select_related("responsable", "autor"),
            ("prioridad", "vence", "created_at"),
        )

        # **Hasta cuándo ha mirado esta persona esta obra.** Se crea sola la primera vez y no se
        # mueve al leer: ver el docstring de `MarcaDeCoordinacion`, donde están las dos razones.
        marca, _nueva = MarcaDeCoordinacion.objects.get_or_create(
            proyecto=proyecto,
            usuario=request.user,
            defaults={"organizacion": proyecto.organizacion},
        )

        return Response(
            {
                "proyecto": {"codigo": proyecto.codigo, "nombre": proyecto.nombre},
                # **Desde cuándo se cuenta lo nuevo**, para poder decirlo en la pantalla en vez de
                # que el usuario adivine qué significa la marca.
                "vistoEn": marca.visto_en.isoformat(),
                "puedeObservar": request.user.has_perm("documents.add_observacion"),
                # **Descartar es lo que hace que una corrida de interferencias sirva dos veces**, y
                # tiene su propio permiso: cambiar una observación, no abrirla.
                "puedeDescartar": request.user.has_perm("documents.change_observacion"),
                "observaciones": [
                    {
                        "id": str(o.pk),
                        "titulo": o.titulo,
                        "guid": o.ifc_guid,
                        # **Si es un conflicto detectado o una nota que escribió alguien**, y no es
                        # un detalle: una corrida abre treinta y cinco de las primeras y las mezcla
                        # con las tres que puso una persona. Se distinguen por el otro elemento de
                        # la pareja, que solo tienen las automáticas.
                        "esInterferencia": bool(o.interferencia_con),
                        "contra": o.interferencia_con or None,
                        # **Y si es mía**, que es lo primero que se filtra en una lista larga.
                        "esMia": o.responsable_id == request.user.pk,
                        # **Si apareció desde la última vez que esta persona miró.** Es la pregunta
                        # que ningún otro filtro contesta: con treinta y cinco filas abiertas, «qué
                        # cambió» no se responde releyendo la lista entera.
                        # El empate va a **nueva** y no a vista: `>=` y no `>`. Lo destapó una
                        # prueba que falló una vez de veinte —crear la marca y la observación
                        # dentro del mismo tic del reloj del sistema— y el fallo intermitente era
                        # el síntoma de un hueco real: el reloj de Windows no siempre distingue
                        # dos instantes separados por milisegundos, así que con `>` un hallazgo
                        # escrito justo cuando alguien pulsa «ya lo vi» nacería ya visto. De los
                        # dos errores posibles, mostrar de más se corrige mirando y perder un
                        # hallazgo no se corrige nunca.
                        "esNueva": o.created_at >= marca.visto_en,
                        "prioridad": o.prioridad,
                        "prioridadTexto": o.get_prioridad_display(),
                        "estado": o.estado,
                        "estadoTexto": o.get_estado_display(),
                        "responsable": str(o.responsable),
                        "vence": o.vence.isoformat() if o.vence else None,
                        "vencida": o.vencida,
                        # **La cámara viaja tal como se guardó: en el sistema del IFC.** La vuelta
                        # al de la escena la hace `ifcAEscena` en el visor, que es la inversa exacta
                        # —con su prueba— de la que la escribió. Convertir acá pondría la misma
                        # regla en dos sitios, que es como se separan.
                        "camara": o.punto_de_vista or None,
                        # **Y qué se veía** — `F4.7`. Es lo que permite que abrir la observación
                        # deje la pantalla como la tenía quien la escribió, y no solo la cámara: un
                        # hallazgo encontrado aislando una planta no se entiende con el edificio
                        # entero encima, aunque se mire desde el mismo sitio.
                        "visibilidad": o.visibilidad or None,
                        "url": o.get_absolute_url(),
                    }
                    for o in observaciones
                ],
            }
        )


class MarcarCoordinacionVistaAPI(APIView):
    """«Ya miré esto»: mueve la marca de esta persona a ahora. `F5.5`.

    **El gesto es explícito a propósito.** La marca no se mueve al leer la lista: si se moviera,
    abrir el panel marcaría como visto justo lo que se acaba de descubrir, y nada sería nuevo nunca.
    Así que quien tría decide cuándo ha terminado de mirar.

    **Pide `view_observacion` y no `change_observacion`**, y no es un descuido: esto no cambia una
    observación, cambia **mi** marca. Exigir permiso de escritura sobre las observaciones dejaría
    sin poder ordenar su propia lista a un rol de solo lectura, que es justamente quien más
    necesita saber qué cambió. Y no se puede marcar como visto lo que no se puede ver: la consulta
    va acotada por organización igual que la lectura.

    De ahí `PersonalStatePermissions`: el mapa de fábrica de DRF hace que un `POST` pida `add_*`, y
    **lo descubrió la prueba de 403 de este mismo endpoint**. Es la tercera vez que el mapa por
    defecto acierta el verbo y falla el permiso.
    """

    permission_classes = [PersonalStatePermissions]
    queryset = Observacion.objects.none()

    def post(self, request, *args, **kwargs):
        from rest_framework.response import Response

        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        ahora = timezone.now()
        MarcaDeCoordinacion.objects.update_or_create(
            proyecto=proyecto,
            usuario=request.user,
            defaults={"organizacion": proyecto.organizacion, "visto_en": ahora},
        )
        return Response({"vistoEn": ahora.isoformat(), "nuevas": 0})


class DescartarObservacionAPI(APIView):
    """Descarta una observación **sin salir del visor**. `F5.5`.

    **Es lo que decide si la detección de interferencias se usa una segunda vez.** Una corrida sobre
    dos disciplinas reales devuelve decenas de conflictos y buena parte es la propia construcción
    del modelo; si triarlos exige abrir la ficha de cada uno en otra pestaña, nadie lo hace, y a la
    corrida siguiente vuelven todos.

    El gesto que hace falta es corto: se abre el conflicto —el visor aísla los dos elementos—, se
    mira, y se dice «esto no es un problema» **con el motivo**. Y la decisión es permanente: la
    pareja de GUID hace que la corrida siguiente no lo vuelva a abrir, así que el motivo es lo único
    que le queda a quien pregunte dentro de seis meses.

    Pide `change_observacion`, que es lo que hace. **No sirve para cerrar**: cerrada es «se
    corrigió» y eso pasa por su pantalla, con su resolución y su historial de comentarios.

    Y usa `ChangeModelPermissions` y no `ViewModelPermissions`: el de DRF asume que un `POST` crea,
    y este cambia algo que ya existe. Con el mapa por defecto pediría `add_observacion`, o sea el
    permiso equivocado **y en la dirección mala** — lo descubrió su prueba de 403.
    """

    permission_classes = [ChangeModelPermissions]
    queryset = Observacion.objects.none()

    def post(self, request, *args, **kwargs):
        from django.core.exceptions import ValidationError
        from rest_framework.response import Response

        observacion = (
            scope_queryset_to_organizacion(Observacion.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if observacion is None:
            raise Http404

        if observacion.estado in (Observacion.CERRADA, Observacion.DESCARTADA):
            # No es un error: alguien la descartó desde otra pestaña. Se contesta el estado real en
            # vez de un 400, para que la lista se ponga al día sola.
            return Response({"estado": observacion.estado, "yaEstaba": True})

        try:
            observacion.descartar(request.user, str(request.data.get("motivo") or ""))
        except ValidationError:
            return Response(
                {"error": _("An observation is not dismissed without saying why.")}, status=400
            )

        set_audit_context(request, observacion, action="descartar_observacion")
        return Response({"estado": observacion.estado, "yaEstaba": False})


class RevisionContenidoAPI(APIView):
    """Los bytes, **en línea y no como descarga**.

    `DescargarRevisionView` los manda como adjunto, que es lo correcto para una persona que
    hace clic. El visor necesita lo contrario: leerlos con `fetch` y pasárselos al lector sin
    que el navegador ofrezca guardarlos.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None or not revision.clave_archivo:
            raise Http404

        # **De un DWG o un DGN se sirve su DXF convertido**, que es lo único que el visor sabe
        # leer. El original sigue descargándose entero desde el expediente: son dos cosas, el
        # entregable y la copia con la que se mira. Ver `docs/FORMATOS.md`.
        clave = abribles.clave_para_el_visor(revision)
        convertido = clave != revision.clave_archivo

        # **Por tramos si el cliente los pide** (`F12.13`). Lo necesita la nube de puntos: el visor
        # lee la cabecera del COPC, decide qué nodos caen en pantalla y pide solo esos: sin `Range`
        # tendría que descargar los ~130 MB del levantamiento para ver el primer punto, y el
        # servidor los tendría enteros en memoria. Ver `rangos.py`.
        #
        # No es solo para la nube: un IFC federado se sirve igual, y el navegador puede reanudar.
        try:
            ruta = storage.ruta_de(clave)
            respuesta = rangos.respuesta_de_archivo(
                ruta, request.headers.get("Range"), tipo="application/octet-stream"
            )
        except (OSError, storage.CargaRechazada) as error:
            # El registro dice que hay archivo y el disco dice que no. Es un 404 honesto: lo
            # que no está no está, y el motivo va al log, no a la respuesta.
            raise Http404 from error
        # Que el sha viaje permite al visor comprobar que abrió lo que el registro dice.
        #
        # **Y de un convertido se manda el del original**, no el del DXF: el sha es la prueba de
        # qué entregable se está mirando, y el del DXF cambiaría con la versión del conversor
        # aunque el DWG fuera el mismo. La cabecera de al lado dice que es una conversión.
        respuesta["X-Aerobim-Sha256"] = revision.sha256
        if convertido:
            respuesta["X-Aerobim-Convertido"] = "dxf"
        return respuesta
