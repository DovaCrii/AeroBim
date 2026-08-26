"""Lo que un IFC declara de si mismo, leido en el servidor: `F3.3`.

**Por que en el servidor si el visor ya lee las unidades.** El visor las lee para poder poner el
simbolo al lado de un numero, y las olvida al cerrar la pestaña. El registro documental necesita
otra cosa: **poder contestar sin abrir nada**. "Este modelo declara milimetros y no esta
georreferenciado" es un dato del entregable, se consulta, se compara entre revisiones y se ve en una
lista — y hace falta antes de que alguien decida montar el modelo sobre el terreno.

**Y hay un dato que solo se puede dar aca**: si el archivo esta georreferenciado. Fragments aplica
el factor de unidad a la geometria y **descarta la declaracion**, asi que despues de convertir ya
no se puede preguntar. Se lee del archivo o no se lee.

`ifcopenshell` es **LGPL-3.0** y se usa **como libreria**, que es exactamente lo que `AGENTS.md`
permite: "IfcOpenShell/ifcclash/bcf-client (LGPL) como libreria o proceso aparte, nunca copiado".
"""

import logging
from collections import Counter
from pathlib import Path

logger = logging.getLogger("aerobim.jobs")

#: Cuantos tipos de elemento se guardan en el conteo.
#:
#: Un IFC federado tiene decenas de clases con un elemento cada una, y guardarlas todas hace un
#: `JSONField` largo que nadie lee. Las veinte mas numerosas describen el modelo; el total va
#: aparte, asi que no se pierde la cuenta.
TIPOS_EN_EL_CONTEO = 20


def extraer(ruta: Path) -> dict:
    """Lo que el archivo declara: esquema, proyecto, unidades, georreferenciacion y conteo.

    **Nunca levanta.** Un IFC que `ifcopenshell` no puede abrir sigue siendo un entregable valido
    —se descarga, se emite en un transmittal, se comenta— y rechazar la subida por no poder leerle
    los metadatos seria confundir dos cosas. Se devuelve `{"error": ...}` y el registro dice que no
    se pudieron leer, que es la verdad.
    """
    try:
        import ifcopenshell
        import ifcopenshell.util.unit
    except ImportError as falta:  # pragma: no cover - solo si alguien quita la dependencia
        return {"error": f"ifcopenshell no esta instalado: {falta}"}

    try:
        archivo = ifcopenshell.open(str(ruta))
    except Exception as fallo:
        logger.warning("ifc_no_se_pudo_abrir", extra={"recipient": str(ruta), "item_count": 0})
        return {"error": f"no se pudo abrir el IFC: {fallo}"}

    try:
        return {
            "esquema": archivo.schema_identifier,
            "proyecto": _primer_nombre(archivo, "IfcProject"),
            "unidades": _unidades(archivo),
            "georreferencia": _georreferencia(archivo),
            **_conteo(archivo),
        }
    except Exception as fallo:  # pragma: no cover - red de seguridad, no un caso esperado
        logger.warning("ifc_no_se_pudo_leer", extra={"recipient": str(ruta), "item_count": 0})
        return {"esquema": archivo.schema_identifier, "error": f"no se pudo leer: {fallo}"}


def _del_tipo(archivo, clase: str) -> list:
    """Las entidades de una clase, o **una lista vacia si el esquema no la conoce**.

    `by_type` con una clase que no existe en el esquema del archivo **levanta**, no devuelve vacio,
    y eso convierte "este IFC2X3 no tiene conversion de mapa" —que es lo normal— en "no se pudieron
    leer los metadatos". Los esquemas de IFC no son un superconjunto uno de otro: hay clases de IFC4
    que en IFC2X3 no existen, y al reves.
    """
    try:
        return list(archivo.by_type(clase))
    except Exception:
        return []


def _primer_nombre(archivo, clase: str) -> str:
    for entidad in _del_tipo(archivo, clase):
        if entidad.Name:
            return str(entidad.Name)
    return ""


def _unidades(archivo) -> dict:
    """La unidad de longitud declarada y su factor a metros.

    El factor importa mas que el nombre: es lo que dice si un numero del archivo son metros o
    milimetros, y es la diferencia entre un muro de 20 cm y uno de 200 m.
    """
    import ifcopenshell.util.unit

    unidad = ifcopenshell.util.unit.get_project_unit(archivo, "LENGTHUNIT")
    nombre = ""
    if unidad is not None:
        prefijo = getattr(unidad, "Prefix", None) or ""
        nombre = f"{prefijo}{getattr(unidad, 'Name', '') or ''}".strip()

    return {
        "longitud": nombre,
        "metrosPorUnidad": float(ifcopenshell.util.unit.calculate_unit_scale(archivo)),
    }


def _georreferencia(archivo) -> dict:
    """Si el archivo dice **donde esta**, y por que via.

    Son dos vias y no una, y la diferencia es real:

    - `IfcMapConversion` (IFC4) es la buena: da el desplazamiento y el giro contra un sistema de
      coordenadas con nombre, que es lo que permite montar el modelo sobre el terreno sin adivinar.
    - `IfcSite.RefLatitude/RefLongitude` es un par de coordenadas geograficas en grados, minutos y
      segundos. Situa el proyecto en el mundo pero **no orienta ni escala**: sirve para saber en que
      ciudad esta, no para superponerlo a una ortofoto.

    **Y "no" es una respuesta que hace falta poder dar.** La mayoria de los IFC de obra no traen
    ninguna de las dos, y saberlo antes de prometer una vista geoespacial (Fase 6) ahorra el rato de
    descubrirlo con el modelo ya cargado en el sitio equivocado.
    """
    conversiones = []
    # `IfcMapConversion` **no existe en IFC2X3**, y pedirlo alli no devuelve una lista vacia:
    # levanta. Se descubrio en la primera prueba, y es el defecto que se habria escapado —el
    # archivo de muestra en IFC4 funcionaba y los dos en IFC2X3 no—. La mayoria de los IFC de obra
    # siguen siendo IFC2X3.
    for conversion in _del_tipo(archivo, "IfcMapConversion"):
        conversiones.append(
            {
                "este": _numero(getattr(conversion, "Eastings", None)),
                "norte": _numero(getattr(conversion, "Northings", None)),
                "altura": _numero(getattr(conversion, "OrthogonalHeight", None)),
                "escala": _numero(getattr(conversion, "Scale", None)),
            }
        )

    sitios = []
    for sitio in _del_tipo(archivo, "IfcSite"):
        latitud = getattr(sitio, "RefLatitude", None)
        longitud = getattr(sitio, "RefLongitude", None)
        sitios.append(
            {
                "nombre": str(sitio.Name or ""),
                "latitud": _grados(latitud),
                "longitud": _grados(longitud),
                "elevacion": _numero(getattr(sitio, "RefElevation", None)),
            }
        )

    tiene = bool(conversiones) or any(_situa(s) for s in sitios)
    return {
        "georreferenciado": tiene,
        # La via se nombra porque no son equivalentes: ver el docstring.
        "via": "IfcMapConversion" if conversiones else ("IfcSite" if tiene else ""),
        "conversiones": conversiones,
        "sitios": sitios,
    }


def _situa(sitio: dict) -> bool:
    """Si las coordenadas de un sitio **dicen algo**.

    **Latitud y longitud exactamente cero no son una ubicacion: son el marcador de posicion.** Revit
    y otros escriben `(0, 0, 0, 0)` cuando nadie fijo el emplazamiento, y darlo por georreferenciado
    manda a buscar el edificio a la isla nula, en el golfo de Guinea. Se vio en `Piso 5.ifc`, que
    declara justamente eso.

    El riesgo de descartar un proyecto que este de verdad en 0°/0° es despreciable —es mar
    abierto— y el de creerse el marcador no lo es.
    """
    latitud, longitud = sitio["latitud"], sitio["longitud"]
    if latitud is None or longitud is None:
        return False
    return not (latitud == 0 and longitud == 0)


def _conteo(archivo) -> dict:
    """Cuantos elementos hay, y de que tipos.

    Se cuentan los `IfcProduct`, que es lo que tiene sitio en el espacio: contar entidades del
    archivo daria cientos de miles de puntos y direcciones, un numero grande que no dice nada.
    """
    cuenta = Counter(producto.is_a() for producto in _del_tipo(archivo, "IfcProduct"))
    return {
        "elementos": sum(cuenta.values()),
        "tiposDistintos": len(cuenta),
        "porTipo": dict(cuenta.most_common(TIPOS_EN_EL_CONTEO)),
    }


def _numero(valor) -> float | None:
    try:
        return None if valor is None else float(valor)
    except (TypeError, ValueError):
        return None


def _grados(compuesto) -> float | None:
    """Convierte el grados/minutos/segundos de IFC a grados decimales.

    IFC guarda una latitud como una tupla de dos a cuatro enteros —grados, minutos, segundos y
    millonesimas—, y **el signo va solo en el primero**: `(-33, 26, 15)` es 33° 26' 15" **sur**, no
    -33 grados menos 26 minutos. Sumar los terminos con su signo daria una coordenada en otro
    hemisferio, y por eso se toma el valor absoluto de cada uno y el signo aparte.
    """
    if not compuesto:
        return None
    try:
        partes = [int(p) for p in compuesto]
    except (TypeError, ValueError):
        return None
    if not partes:
        return None

    signo = -1 if partes[0] < 0 else 1
    grados = abs(partes[0])
    minutos = abs(partes[1]) if len(partes) > 1 else 0
    segundos = abs(partes[2]) if len(partes) > 2 else 0
    millonesimas = abs(partes[3]) if len(partes) > 3 else 0
    return signo * (grados + minutos / 60 + (segundos + millonesimas / 1_000_000) / 3600)
