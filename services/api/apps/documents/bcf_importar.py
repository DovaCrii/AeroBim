"""Importar un **BCF 2.1** que llega de otra oficina: `F4.6`.

**Es la vuelta del ciclo, y sin ella la coordinacion es un altavoz.** `F4.4` cerro la ida: las
observaciones salen en un ZIP que Solibri y Navisworks abren. Pero coordinar es de ida y vuelta: el
mandante revisa, contesta y **manda otro BCF**. Sin importar, esa respuesta se lee en un correo y se
teclea a mano en la pantalla, o —lo que pasa de verdad— no se teclea.

## Lo que se leyo del formato real, y no del XSD

El lector se escribio contra un BCF producido por `bcf-client`, que es una implementacion
independiente. Tres cosas que un lector ingenuo se come, y las tres estan probadas:

1. **El viewpoint no se llama `viewpoint.bcfv`.** Ese es el nombre que escribimos nosotros;
   `bcf-client` lo llama `<guid-del-viewpoint>.bcfv`. El nombre **se lee del markup**
   —`<Viewpoints><Viewpoint>`—, que es donde el estandar dice que esta. Darlo por supuesto no
   revienta: deja en silencio cada camara y cada GUID de elemento fuera, que es justo lo que se
   venia a buscar.
2. **`TopicStatus` y `TopicType` pueden llegar vacios**, no solo ausentes. Un `""` que no se traduce
   deja la observacion con un estado que no esta en `STATUS_CHOICES`.
3. **`Visibility` puede no traer `Exceptions`**, y las fechas pueden llegar **sin zona horaria**.
   Una fecha ingenua guardada con `USE_TZ` es un aviso de Django y una hora movida.

## Lo que este modulo decide, y por que

- **`Closed` vuelve como `cerrada` y nunca como `descartada`.** La ida colapsa las dos en `Closed`
  porque para quien abre el archivo son lo mismo, asi que la vuelta no puede distinguirlas.
  Elegir `descartada` seria la afirmacion mas fuerte: silencia el conflicto **para siempre** en las
  corridas de interferencias. Ante la duda se elige lo reversible.
- **Un tema que ya existe no se sobreescribe: se le suma.** Lo que trae la vuelta es la respuesta
  —comentarios y un estado nuevo—, no una version mejor del hallazgo. Reescribir titulo,
  descripcion y prioridad con lo que diga un archivo de fuera borraria el trabajo local sin
  preguntar, y lo haria en silencio.
- **El GUID del tema es la identidad.** La ida escribe el `pk` de la observacion como `Topic Guid`,
  asi que nuestro propio BCF vuelve a casa y **actualiza en vez de duplicar**. Un tema con un GUID
  que no conocemos es de otra herramienta y se crea.

## Y es dato hostil, de verdad

Un BCF llega por correo desde otra oficina: es exactamente el XML no confiable del que avisa
bandit en `bcf.py`. Por eso **se parsea con `defusedxml`** —billion laughs y entidades externas— y
el ZIP se lee con topes: numero de miembros, tamaño de cada uno y tamaño total descomprimido. Un
ZIP de 40 KB puede descomprimir a diez gigas.
"""

import logging
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from io import BytesIO

from defusedxml.ElementTree import ParseError, fromstring
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone as tz
from django.utils.translation import gettext, gettext_lazy, ngettext

from apps.documents import camara as lector_camara
from apps.documents import storage
from apps.documents import visibilidad as lector_visibilidad
from apps.documents.instantanea import BYTES_MAXIMOS as INSTANTANEA_MAXIMA

logger = logging.getLogger("aerobim.jobs")

#: Version que se lee. La 3.0 existe y **cambia la estructura del ZIP**: se rechaza con un motivo
#: en vez de leerla a medias y dejar la mitad de los temas fuera sin avisar.
VERSION = "2.1"

#: Topes del ZIP. Un BCF con fotos de veinte temas ronda los cinco megas.
BYTES_MAXIMOS_ARCHIVO = 80 * 1024 * 1024
BYTES_MAXIMOS_DESCOMPRIMIDO = 400 * 1024 * 1024
MAXIMO_MIEMBROS = 5_000

#: Tope de un XML de dentro del ZIP. Un markup con cincuenta comentarios no llega a 100 KB.
BYTES_MAXIMOS_XML = 4 * 1024 * 1024

#: Tope de temas que se procesan en una importacion.
MAXIMO_TEMAS = 2_000

#: El vocabulario de BCF traido al nuestro.
#:
#: **Las claves van en minusculas** porque el valor no lo fija el estandar —vive en
#: `extensions.xml`— y cada herramienta escribe el suyo con su propia capitalizacion.
ESTADOS = {
    "open": "abierta",
    "active": "abierta",
    "new": "abierta",
    "reopened": "abierta",
    "in progress": "abierta",
    "resolved": "respondida",
    "answered": "respondida",
    "closed": "cerrada",
}

PRIORIDADES = {
    "critical": "alta",
    "high": "alta",
    "major": "alta",
    "normal": "media",
    "medium": "media",
    "minor": "baja",
    "low": "baja",
}


class BcfInvalido(Exception):
    """Lo que llego no es un BCF que se pueda leer, **con un motivo que se le puede ensenar**.

    El mensaje va a la pantalla, asi que dice que le pasa al archivo y nunca una ruta ni una traza.
    """


@dataclass(frozen=True)
class ComentarioLeido:
    guid: str
    autor: str
    texto: str
    fecha: datetime | None


@dataclass
class TemaLeido:
    """Un tema del BCF, ya traducido a nuestro vocabulario y sin tocar la base de datos."""

    guid: str
    titulo: str
    descripcion: str = ""
    estado: str = "abierta"
    prioridad: str = "media"
    autor: str = ""
    asignado: str = ""
    creado_en: datetime | None = None
    vence: date | None = None
    ifc_guid: str = ""
    camara: dict = field(default_factory=dict)
    visibilidad: dict = field(default_factory=dict)
    comentarios: list[ComentarioLeido] = field(default_factory=list)
    instantanea: bytes | None = None


@dataclass
class Resultado:
    """Que hizo la importacion. **Se cuenta todo**, incluido lo que no cambio."""

    creadas: int = 0
    actualizadas: int = 0
    comentarios: int = 0
    sin_cambios: int = 0
    #: Lo que se salto y por que. Va a la pantalla: un tema perdido en silencio es peor que el
    #: aviso de que se perdio.
    avisos: list[str] = field(default_factory=list)

    @property
    def temas(self) -> int:
        return self.creadas + self.actualizadas + self.sin_cambios

    @property
    def resumen(self) -> str:
        """Lo que pasó, en una frase que se pueda leer.

        **Se cuenta con `ngettext` y se callan los ceros**, y las dos cosas salieron de mirar el
        mensaje de verdad en la pantalla. Un `f-string` daba «1 temas: 1 nuevos, 0 actualizados, 0
        sin cambios. 0 comentarios nuevos.»: mal concordado y contando cuatro nadas. Quien importa
        quiere saber qué entró, no qué no entró.
        """
        partes = []
        if self.creadas:
            partes.append(
                ngettext("%(n)d new topic", "%(n)d new topics", self.creadas) % {"n": self.creadas}
            )
        if self.actualizadas:
            partes.append(
                ngettext("%(n)d updated", "%(n)d updated", self.actualizadas)
                % {"n": self.actualizadas}
            )
        if self.sin_cambios:
            partes.append(
                ngettext("%(n)d already up to date", "%(n)d already up to date", self.sin_cambios)
                % {"n": self.sin_cambios}
            )
        if self.comentarios:
            partes.append(
                ngettext("%(n)d new comment", "%(n)d new comments", self.comentarios)
                % {"n": self.comentarios}
            )

        if not partes:
            # **Un archivo que no trajo nada tiene que decirlo.** Un mensaje de exito vacio deja
            # creer que entro algo, y el hallazgo que se esperaba se busca donde no esta.
            return gettext("That BCF brought nothing in.")
        return gettext("Imported: %(que)s.") % {"que": ", ".join(partes)}


# --- Leer el archivo, sin base de datos -------------------------------------------------


def _texto(nodo, etiqueta: str, *, por_defecto: str = "") -> str:
    hijo = nodo.find(etiqueta) if nodo is not None else None
    if hijo is None or hijo.text is None:
        return por_defecto
    return hijo.text.strip()


def _fecha_hora(crudo: str) -> datetime | None:
    """Una fecha ISO de BCF, **siempre con zona**.

    Las fechas de BCF llegan con zona o sin ella: `bcf-client` escribe
    `2026-09-02T12:02:09.580527`, sin `Z` ni desplazamiento. Guardar una fecha ingenua con `USE_TZ`
    activo es un aviso de Django y una hora corrida; se le pone UTC, que es lo que el estandar
    supone cuando no se dice otra cosa.
    """
    if not crudo:
        return None
    try:
        leida = datetime.fromisoformat(crudo.replace("Z", "+00:00"))
    except ValueError:
        return None
    if leida.tzinfo is None:
        return leida.replace(tzinfo=UTC)
    return leida


def _fecha(crudo: str) -> date | None:
    momento = _fecha_hora(crudo)
    return momento.date() if momento is not None else None


def _punto(nodo) -> list[float] | None:
    """Un `<X><Y><Z>` de BCF como terna. `None` si falta alguno o no son numeros."""
    if nodo is None:
        return None
    salida = []
    for eje in "XYZ":
        crudo = _texto(nodo, eje)
        try:
            salida.append(float(crudo))
        except (TypeError, ValueError):
            return None
    return salida


def _camara_de(raiz) -> dict:
    """La camara del viewpoint, pasada por **el mismo validador que la del visor**.

    No se valida aca a mano: `camara.leer` ya comprueba que los vectores sean unitarios, que
    «arriba» sea perpendicular a la direccion y que la posicion no este a mil kilometros. Escribir
    esas reglas otra vez daria dos implementaciones de lo mismo, que es la forma segura de que se
    separen.
    """
    import json

    for etiqueta, tipo in (("PerspectiveCamera", "perspectiva"), ("OrthogonalCamera", "ortogonal")):
        nodo = raiz.find(etiqueta)
        if nodo is None:
            continue
        datos = {
            "tipo": tipo,
            "punto": _punto(nodo.find("CameraViewPoint")),
            "direccion": _punto(nodo.find("CameraDirection")),
            "arriba": _punto(nodo.find("CameraUpVector")),
        }
        if tipo == "perspectiva":
            try:
                datos["campoVisual"] = float(_texto(nodo, "FieldOfView"))
            except (TypeError, ValueError):
                pass
        else:
            try:
                datos["escala"] = float(_texto(nodo, "ViewToWorldScale"))
            except (TypeError, ValueError):
                return {}
        leida = lector_camara.leer(json.dumps(datos))
        if leida:
            return leida
    return {}


def _visibilidad_de(componentes) -> dict:
    """Que se veia, por el mismo validador que la del visor.

    **`DefaultVisibility` ausente es `true`** por el XSD, y `Exceptions` puede no venir: eso es
    «se veia todo», que `visibilidad.leer` devuelve como `{}` —sin restriccion— y es lo correcto.
    """
    if componentes is None:
        return {}
    nodo = componentes.find("Visibility")
    if nodo is None:
        return {}
    por_defecto = (nodo.get("DefaultVisibility") or "true").strip().lower() != "false"
    excepciones = [
        (hijo.get("IfcGuid") or "").strip()
        for hijo in nodo.findall("./Exceptions/Component")
        if (hijo.get("IfcGuid") or "").strip()
    ]
    return lector_visibilidad.leer({"porDefecto": por_defecto, "excepciones": excepciones})


def _seleccion_de(componentes) -> str:
    """El primer elemento seleccionado, que es a lo que se ancla la observacion.

    **Uno y no todos**, porque `Observacion.ifc_guid` es uno: nuestro modelo ancla el hallazgo a un
    elemento y la pareja del choque va en `interferencia_con`. Los demas no se pierden de vista —el
    viewpoint completo se conserva en la visibilidad— pero el ancla es el primero.
    """
    if componentes is None:
        return ""
    for hijo in componentes.findall("./Selection/Component"):
        guid = (hijo.get("IfcGuid") or "").strip()
        if guid:
            return guid
    return ""


#: Como se llama cada XML de dentro del ZIP en un mensaje de error.
#:
#: **Traducidos aparte y no interpolados en crudo**: el mensaje dice «el <esto> del archivo no es
#: XML valido», y quien lo lee necesita saber *cual* de los tres archivos del ZIP esta mal para
#: poder pedir el que falta.
PARTES = {
    "tema": gettext_lazy("topic"),
    "vista": gettext_lazy("viewpoint"),
    "version": gettext_lazy("version number"),
}


def _leer_xml(crudo: bytes, que: str):
    """El arbol de un XML de dentro del ZIP, con `defusedxml`.

    Ver el docstring del modulo: esto viene de otra oficina.
    """
    que = PARTES.get(que, que)
    if len(crudo) > BYTES_MAXIMOS_XML:
        raise BcfInvalido(
            gettext("The %(que)s in that file is too big to be a BCF.") % {"que": que}
        )
    try:
        return fromstring(crudo)
    except (ParseError, ValueError) as error:
        raise BcfInvalido(
            gettext("The %(que)s in that file is not valid XML.") % {"que": que}
        ) from error


def _comprobar_zip(zip_bcf: zipfile.ZipFile) -> None:
    """Los topes del ZIP, **antes de descomprimir nada**.

    Un ZIP de cuarenta kilobytes puede descomprimir a diez gigas, y `zipfile` lo hace sin quejarse.
    Los tamaños declarados en la cabecera pueden mentir, pero mentir a la baja obliga a que el
    miembro real sea mas pequeño: el tope de cada lectura vuelve a comprobarse al leerla.
    """
    miembros = zip_bcf.infolist()
    if len(miembros) > MAXIMO_MIEMBROS:
        raise BcfInvalido(gettext("That file holds too many entries to be a BCF."))
    total = sum(info.file_size for info in miembros)
    if total > BYTES_MAXIMOS_DESCOMPRIMIDO:
        raise BcfInvalido(gettext("Uncompressed, that file is too big."))


def _comprobar_version(zip_bcf: zipfile.ZipFile) -> None:
    """Que sea 2.1, dicho con su motivo.

    **Sin `bcf.version` no se rechaza.** Hay herramientas que no lo escriben, y el resto del
    archivo se lee igual; lo que no se hace es leer una 3.0 a medias, porque cambia la estructura.
    """
    nombres = {nombre.lower() for nombre in zip_bcf.namelist()}
    if "bcf.version" not in nombres:
        return
    raiz = _leer_xml(zip_bcf.read("bcf.version"), "version")
    declarada = (raiz.get("VersionId") or "").strip()
    if declarada and not declarada.startswith("2."):
        raise BcfInvalido(
            gettext(
                "That file says it is BCF %(cual)s and only 2.1 is read here. Ask for it as "
                "2.1, which is what the whole market reads."
            )
            % {"cual": declarada}
        )


def _instantanea_de(zip_bcf: zipfile.ZipFile, carpeta: str, markup) -> bytes | None:
    """La foto del tema, si la trae y si es un PNG de verdad.

    El nombre **se lee del markup** —igual que el del viewpoint— y solo si no viene se prueba con
    `snapshot.png`, que es lo que usa casi todo el mundo. Y se comprueba la firma, no la extension:
    esto llega de fuera y acaba escrito en nuestro disco.
    """
    declarado = _texto(markup, "./Viewpoints/Snapshot")
    for nombre in (declarado, "snapshot.png"):
        if not nombre:
            continue
        clave = f"{carpeta}/{nombre}"
        try:
            datos = zip_bcf.read(clave)
        except KeyError:
            continue
        if not datos or len(datos) > INSTANTANEA_MAXIMA:
            return None
        if not any(datos.startswith(firma) for firma in storage.FIRMAS["png"]):
            return None
        return datos
    return None


def _viewpoint_de(zip_bcf: zipfile.ZipFile, carpeta: str, markup):
    """El arbol del viewpoint, buscandolo **por el nombre que declara el markup**.

    Es el hallazgo que motivo la mitad de este modulo: nosotros escribimos `viewpoint.bcfv` y
    `bcf-client` escribe `<guid>.bcfv`. El estandar dice que el nombre va en
    `<Viewpoints><Viewpoint>`, asi que de ahi se lee; `viewpoint.bcfv` queda como ultimo recurso
    para un markup que no lo declare.
    """
    candidatos = [_texto(markup, "./Viewpoints/Viewpoint"), "viewpoint.bcfv"]
    for nombre in candidatos:
        if not nombre:
            continue
        try:
            crudo = zip_bcf.read(f"{carpeta}/{nombre}")
        except KeyError:
            continue
        return _leer_xml(crudo, "vista")
    return None


def _comentarios_de(markup) -> list[ComentarioLeido]:
    salida = []
    for nodo in markup.findall("Comment"):
        texto = _texto(nodo, "Comment")
        if not texto:
            continue
        salida.append(
            ComentarioLeido(
                guid=(nodo.get("Guid") or "").strip(),
                autor=_texto(nodo, "Author"),
                texto=texto,
                fecha=_fecha_hora(_texto(nodo, "Date")),
            )
        )
    return salida


def leer(contenido: bytes) -> list[TemaLeido]:
    """Los temas de un BCF 2.1, **sin tocar la base de datos**.

    Separado a proposito de `aplicar`: asi el formato se prueba contra un archivo de otra
    herramienta sin montar un proyecto, y lo que decide que se guarda se prueba sin escribir XML.
    """
    if not contenido:
        # Se reutiliza **el mismo texto que ya usa la subida de documentos**: dos frases distintas
        # para el mismo problema hacen dudar de si son el mismo problema.
        raise BcfInvalido(gettext("The file is empty."))
    if len(contenido) > BYTES_MAXIMOS_ARCHIVO:
        raise BcfInvalido(gettext("That file is too big to be a BCF."))

    try:
        zip_bcf = zipfile.ZipFile(BytesIO(contenido))
    except zipfile.BadZipFile as error:
        raise BcfInvalido(
            gettext(
                "That is not a BCF: a BCF is a ZIP. If what you have is a loose XML or a "
                "renamed file, ask for the whole thing."
            )
        ) from error

    with zip_bcf:
        _comprobar_zip(zip_bcf)
        _comprobar_version(zip_bcf)

        # **Los miembros de carpeta se saltan.** `bcf-client` escribe una entrada `<guid>/` de cero
        # bytes, y tratarla como un tema deja un aviso por cada tema del archivo.
        markups = sorted(
            nombre
            for nombre in zip_bcf.namelist()
            if nombre.lower().endswith("/markup.bcf") and not nombre.endswith("/")
        )
        if not markups:
            raise BcfInvalido(
                gettext(
                    "That ZIP has no `markup.bcf` in it, so it is not a BCF with topics inside."
                )
            )
        if len(markups) > MAXIMO_TEMAS:
            raise BcfInvalido(gettext("That file holds too many topics to import in one go."))

        temas = []
        for nombre in markups:
            carpeta = nombre.rsplit("/", 1)[0]
            markup = _leer_xml(zip_bcf.read(nombre), "tema")
            topic = markup.find("Topic")
            if topic is None:
                continue

            titulo = _texto(topic, "Title")
            if not titulo:
                # Sin titulo no hay observacion que ensenar en una lista. Se salta con aviso, que lo
                # da `aplicar`: aca solo se lee.
                titulo = ""

            estado = ESTADOS.get((topic.get("TopicStatus") or "").strip().lower(), "abierta")
            prioridad = PRIORIDADES.get(_texto(topic, "Priority").lower(), "media")

            vista = _viewpoint_de(zip_bcf, carpeta, markup)
            componentes = vista.find("Components") if vista is not None else None

            temas.append(
                TemaLeido(
                    guid=(topic.get("Guid") or carpeta).strip(),
                    titulo=titulo,
                    descripcion=_texto(topic, "Description"),
                    estado=estado,
                    prioridad=prioridad,
                    autor=_texto(topic, "CreationAuthor"),
                    asignado=_texto(topic, "AssignedTo"),
                    creado_en=_fecha_hora(_texto(topic, "CreationDate")),
                    vence=_fecha(_texto(topic, "DueDate")),
                    ifc_guid=_seleccion_de(componentes),
                    camara=_camara_de(vista) if vista is not None else {},
                    visibilidad=_visibilidad_de(componentes),
                    comentarios=_comentarios_de(markup),
                    instantanea=_instantanea_de(zip_bcf, carpeta, markup),
                )
            )

    return temas


# --- Guardarlos, que es donde estan las decisiones -------------------------------------


def _quien(correo: str, gente: dict, por):
    """El usuario que corresponde a un correo de BCF, o quien importa.

    **Se busca solo entre la gente de la organizacion.** Un correo que llega en un archivo de fuera
    no autoriza a atribuir nada a un usuario de otro cliente: sin acotar, quien manda el BCF elige
    a nombre de quien queda una observacion en una obra que no es suya.
    """
    limpio = (correo or "").strip().lower()
    return gente.get(limpio) or por


def _guardar_instantanea(proyecto, datos: bytes) -> str:
    """La foto en el almacen, con la clave construida como todas. `""` si no se pudo.

    **Su fallo no arrastra al tema**, igual que al abrir una observacion desde el visor: lo que hay
    que conservar es el hallazgo.
    """
    try:
        extension, sha = storage.validar("snapshot.png", datos)
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo="bcf",
            sha256=sha,
            extension=extension,
        )
        storage.guardar(clave, datos)
    except (storage.CargaRechazada, OSError):
        logger.warning("bcf: no se pudo guardar la instantánea importada de %s", proyecto.codigo)
        return ""
    return clave


def _sumar_comentarios(observacion, tema: TemaLeido, gente: dict, por) -> int:
    """Los comentarios que no estaban, y **solo esos**.

    **El GUID del comentario de BCF se usa como nuestra clave.** Nuestro `pk` es un UUID y la ida
    escribe `str(comentario.pk)` como `Comment Guid`, asi que el mismo archivo importado dos veces
    no duplica el hilo: la fila ya existe. Para un GUID que no es un UUID —otra herramienta puede
    escribir lo que quiera— se cae a comparar autor y texto, que es lo unico que queda.
    """
    from apps.documents.models import Comentario

    existentes = set(observacion.comentarios.values_list("pk", flat=True))
    textos = set(observacion.comentarios.values_list("texto", flat=True))
    nuevos = 0

    for entrada in tema.comentarios:
        try:
            clave = uuid.UUID(entrada.guid)
        except (ValueError, AttributeError, TypeError):
            clave = None

        if clave is not None and clave in existentes:
            continue
        if clave is None and entrada.texto in textos:
            continue

        comentario = Comentario.objects.create(
            **({"pk": clave} if clave is not None else {}),
            observacion=observacion,
            autor=_quien(entrada.autor, gente, por),
            texto=entrada.texto,
        )
        existentes.add(comentario.pk)
        textos.add(comentario.texto)
        nuevos += 1

        # **La fecha real, y hay que forzarla.** `created_at` es `auto_now_add`, asi que un
        # comentario escrito hace tres semanas entraria fechado hoy y el hilo contaria la historia
        # en el orden equivocado. La fecha es la mitad del valor de una respuesta.
        if entrada.fecha is not None:
            Comentario.objects.filter(pk=comentario.pk).update(created_at=entrada.fecha)

    return nuevos


@dataclass
class Vistazo:
    """Un tema del BCF **antes de entrar**, con lo que hace falta para decidir. `F4.11`.

    **Importar era a ciegas**: se subia el archivo y se escribia. Para un ZIP que llega por correo
    desde otra oficina eso es exactamente lo contrario de una decision: no se sabe cuantos temas
    trae, cuales son nuevos, cuales tocan algo que ya esta, ni si el que se esperaba viene con foto.
    """

    tema: TemaLeido
    #: `True` si su GUID ya tiene observacion en esta obra: entonces **se le suma**, no se duplica.
    conocido: bool
    #: `True` si no se puede archivar: sin titulo no hay nada que ensenar en una lista.
    se_salta: bool
    #: La foto reducida como `data:`, o `""`. Ver `miniatura_de`.
    miniatura: str


def miniatura_de(datos: bytes | None, ancho: int = 160) -> str:
    """La instantanea del tema reducida a un `data:`, para verla sin haberla guardado todavia.

    **Reducida y no tal cual**, y la cifra importa: una captura de visor ronda el megabyte, y veinte
    temas incrustados en el HTML son veinte megas de pagina. A 160 px de ancho cada una baja a unos
    pocos kilobytes y sigue diciendo de que va el hallazgo, que es para lo que esta.

    Devuelve `""` ante cualquier problema: **una miniatura que no sale no puede impedir revisar el
    archivo**, que es justo lo que se venia a hacer.
    """
    if not datos:
        return ""
    try:
        import base64
        from io import BytesIO

        from PIL import Image

        imagen = Image.open(BytesIO(datos))
        imagen.thumbnail((ancho, ancho))
        salida = BytesIO()
        imagen.convert("RGB").save(salida, format="JPEG", quality=72)
        return "data:image/jpeg;base64," + base64.b64encode(salida.getvalue()).decode()
    except Exception:  # noqa: BLE001 — ver el docstring: esto no puede tumbar la revision.
        return ""


def vistazo(proyecto, temas: list[TemaLeido], *, con_miniaturas: bool = True) -> list[Vistazo]:
    """Que haria cada tema si se importara, **sin escribir nada**.

    Se apoya en la misma regla que `aplicar` —el GUID del tema es la identidad— asi que lo que
    ensena la pantalla y lo que despues ocurre no pueden discrepar: si discreparan, la revision
    previa seria peor que no tenerla.
    """
    from apps.documents.models import Observacion

    claves = []
    for tema in temas:
        try:
            claves.append(uuid.UUID(tema.guid))
        except (ValueError, AttributeError, TypeError):
            continue

    conocidas = set(
        Observacion.objects.filter(proyecto=proyecto, pk__in=claves).values_list("pk", flat=True)
    )

    salida = []
    for tema in temas:
        try:
            clave = uuid.UUID(tema.guid)
        except (ValueError, AttributeError, TypeError):
            clave = None
        salida.append(
            Vistazo(
                tema=tema,
                conocido=clave is not None and clave in conocidas,
                se_salta=not tema.titulo,
                miniatura=miniatura_de(tema.instantanea) if con_miniaturas else "",
            )
        )
    return salida


@transaction.atomic
def aplicar(proyecto, temas: list[TemaLeido], por) -> Resultado:
    """Guarda los temas leidos en el proyecto. **Todo o nada.**

    Es atomico a proposito: media importacion es peor que ninguna, porque nadie sabe que mitad
    entro y volver a intentarlo duplicaria lo que si paso.
    """
    from apps.documents.models import Observacion

    resultado = Resultado()

    # La gente de la organizacion, una sola consulta, para resolver los correos del archivo.
    gente = {
        (usuario.email or "").strip().lower(): usuario
        for usuario in get_user_model()
        .objects.filter(organizaciones=proyecto.organizacion)
        .exclude(email="")
    }

    # Las observaciones que ya existen, por su `pk`: es el GUID que escribio nuestra propia ida.
    claves = []
    for tema in temas:
        try:
            claves.append(uuid.UUID(tema.guid))
        except (ValueError, AttributeError, TypeError):
            continue
    conocidas = {
        observacion.pk: observacion
        for observacion in Observacion.objects.filter(proyecto=proyecto, pk__in=claves)
    }

    for tema in temas:
        if not tema.titulo:
            resultado.avisos.append(
                gettext("A topic (%(cual)s…) arrived with no title and was skipped.")
                % {"cual": tema.guid[:8]}
            )
            continue

        try:
            clave = uuid.UUID(tema.guid)
        except (ValueError, AttributeError, TypeError):
            clave = None

        existente = conocidas.get(clave) if clave is not None else None

        if existente is not None:
            cambio = False
            # **Solo el estado, y solo hacia adelante en el sentido de que lo dice el otro lado.**
            # Ver el docstring del modulo: la vuelta trae la respuesta, no una version mejor del
            # hallazgo. Reescribir titulo y prioridad borraria el trabajo local en silencio.
            if tema.estado != existente.estado:
                existente.estado = tema.estado
                if tema.estado == Observacion.CERRADA and existente.cerrada_en is None:
                    existente.cerrada_en = tz.now()
                    existente.cerrada_por = _quien(tema.autor, gente, por)
                existente.save(update_fields=["estado", "cerrada_en", "cerrada_por", "updated_at"])
                cambio = True

            nuevos = _sumar_comentarios(existente, tema, gente, por)
            resultado.comentarios += nuevos
            if cambio or nuevos:
                resultado.actualizadas += 1
            else:
                resultado.sin_cambios += 1
            continue

        autor = _quien(tema.autor, gente, por)
        observacion = Observacion(
            organizacion=proyecto.organizacion,
            proyecto=proyecto,
            titulo=tema.titulo[:250],
            descripcion=tema.descripcion,
            prioridad=tema.prioridad,
            estado=tema.estado,
            autor=autor,
            responsable=_quien(tema.asignado, gente, por),
            vence=tema.vence,
            ifc_guid=tema.ifc_guid[:22],
            punto_de_vista=tema.camara,
            visibilidad=tema.visibilidad,
        )
        # **El `pk` es el GUID del tema cuando se puede**, y eso es lo que cierra el ciclo: el BCF
        # que el mandante devuelva mañana con otro comentario encuentra esta misma fila en vez de
        # crear una segunda copia del mismo hallazgo.
        if clave is not None:
            observacion.pk = clave
        if tema.estado == Observacion.CERRADA:
            observacion.cerrada_en = tz.now()
            observacion.cerrada_por = autor
        observacion.save()

        if tema.instantanea is not None:
            clave_foto = _guardar_instantanea(proyecto, tema.instantanea)
            if clave_foto:
                observacion.instantanea = clave_foto
                observacion.save(update_fields=["instantanea", "updated_at"])

        resultado.comentarios += _sumar_comentarios(observacion, tema, gente, por)
        resultado.creadas += 1

    return resultado


def importar(proyecto, contenido: bytes, por) -> Resultado:
    """Leer y guardar, que es lo que llama la pantalla."""
    return aplicar(proyecto, leer(contenido), por)
