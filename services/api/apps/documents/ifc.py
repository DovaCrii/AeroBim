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


def _nombre_de_unidad(archivo, tipo: str) -> str:
    """`MILLIMETRE`, `KILOGRAM`... el prefijo y el nombre juntos, o vacio si no lo declara."""
    import ifcopenshell.util.unit

    unidad = ifcopenshell.util.unit.get_project_unit(archivo, tipo)
    if unidad is None:
        return ""
    prefijo = getattr(unidad, "Prefix", None) or ""
    return f"{prefijo}{getattr(unidad, 'Name', '') or ''}".strip()


def _unidades(archivo) -> dict:
    """Las unidades declaradas, y el factor de la longitud a metros.

    El factor importa mas que el nombre: es lo que dice si un numero del archivo son metros o
    milimetros, y es la diferencia entre un muro de 20 cm y uno de 200 m.

    **Y se guarda tambien la masa, que no es un adorno.** Un modelo real del usuario declara
    `MASSUNIT` como `GRAM` **sin prefijo** mientras escribe valores que son kilos: la ficha de un
    perfil de acero mostraba `UnitWeight 85,3 g`. La lectura es fiel al archivo y el dato malo es
    del exportador, asi que **no se corrige pasando por encima** —seria el mismo error de tres
    ordenes de magnitud que este proyecto se cuida de no cometer, solo al reves—. Lo que si se hace
    es **dejarlo a la vista**: con la unidad declarada en el expediente, quien recibe el modelo
    puede verla y pedir la correccion a quien lo exporto.
    """
    import ifcopenshell.util.unit

    return {
        "longitud": _nombre_de_unidad(archivo, "LENGTHUNIT"),
        "masa": _nombre_de_unidad(archivo, "MASSUNIT"),
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
                # **El giro, que faltaba y es media alineacion.** `XAxisAbscissa` y `XAxisOrdinate`
                # son las dos componentes del eje X local medidas en el sistema del mapa: de ellas
                # sale el angulo, con `atan2` para no perder el cuadrante. Sin esto se podia
                # trasladar el modelo y **no orientarlo**, y un edificio girado 20° sobre la nube no
                # se cruza con nada. Se descubrio al escribir `F2.2`.
                "abscisaEjeX": _numero(getattr(conversion, "XAxisAbscissa", None)),
                "ordenadaEjeX": _numero(getattr(conversion, "XAxisOrdinate", None)),
                # El angulo, **solo para mostrarlo**. La alineacion de verdad se calcula en el visor
                # con el seno y el coseno del vector, sin volver a pasar por grados; esto existe
                # porque "girado 30° respecto al norte" es una frase que se puede comprobar en obra
                # y `(0.866, 0.5)` no. Se calcula aca y no en la plantilla porque una plantilla no
                # tiene `atan2`.
                "giroGrados": _giro_en_grados(conversion),
                # Y en que sistema estan esas coordenadas. Un desplazamiento sin sistema de
                # referencia no dice donde esta el edificio: dice un par de numeros.
                "sistema": _nombre_de_crs(getattr(conversion, "TargetCRS", None)),
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


def _giro_en_grados(conversion):
    """El giro del eje X local respecto al este del mapa, o `None` si el archivo no lo declara.

    Con `atan2` y no dividiendo las componentes: **dividir pierde el cuadrante**, y un eje que
    apunta al suroeste daria el mismo cociente que uno al noreste. Ese error pone el edificio girado
    180°, que se ve pero solo si alguien mira.

    **El vector nulo no es cero grados.** `(0, 0)` es lo que escriben los exportadores que no saben
    la orientacion —el mismo caso que el `(0,0,0,0)` de la latitud— y devolver `0.0` lo convertiria
    en un dato medido. Se devuelve `None`, que es «no lo declara».
    """
    import math

    abscisa = _numero(getattr(conversion, "XAxisAbscissa", None))
    ordenada = _numero(getattr(conversion, "XAxisOrdinate", None))
    if abscisa is None or ordenada is None:
        return None
    if abscisa == 0 and ordenada == 0:
        return None
    return math.degrees(math.atan2(ordenada, abscisa))


def _nombre_de_crs(crs) -> str:
    """El nombre del sistema de referencia de destino, `EPSG:32719` o como lo declare el archivo.

    Se lee de `TargetCRS`, que en IFC4 es un `IfcProjectedCRS`. Se prefiere el `Name` porque es
    donde va el codigo EPSG; si viene vacio se cae al `Description`, que es donde algunos
    exportadores lo escriben en prosa. **Si no hay ninguno se devuelve vacio y no se adivina**: un
    sistema de referencia supuesto pone el edificio en otro pais, y ya tenemos el precedente de la
    isla nula.
    """
    if crs is None:
        return ""
    for campo in ("Name", "Description"):
        valor = getattr(crs, campo, None)
        if valor:
            return str(valor)
    return ""


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
