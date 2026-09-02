"""Agrupar interferencias vecinas: la otra mitad de `F5.5`.

**Veinte tornillos contra la misma viga son un problema, no veinte.** Lo que se prueba aquí es la
regla completa —comparten elemento **y** están cerca—, y sobre todo los dos casos en que agrupar
sería un error: dos conflictos distintos que caen cerca, y un elemento largo que choca con cosas
repartidas por toda la planta.

Se construyen `Interferencia` a mano en vez de correr `ifcclash`: la regla es geometría y
pertenencia, no detección. Lo que el detector encuentra ya tiene su oráculo en
`test_interferencias.py`, y aquí se necesitan casos que ningún archivo de prueba trae.
"""

from apps.documents.agrupar import RADIO_POR_DEFECTO_M, agrupar
from apps.documents.interferencias import Interferencia

# GUID de IFC de verdad: 22 caracteres del alfabeto del estándar.
VIGA = "2x9ibDgrvAu8y4Yd$Ug4Qu"
OTRA_VIGA = "1KJm3fT2n9wPz$Lq7BvXcD"
MURO = "3aBcD4eFgH5iJkL6mNoP7Q"


def guid(n: int) -> str:
    """Un GUID distinto por número, con los 22 caracteres que pide el formato."""
    return f"0000000000000000000{n:03d}"[:22]


def choque(
    a: str,
    b: str,
    punto=(0.0, 0.0, 0.0),
    *,
    distancia: float = 0.01,
    nombre_a: str = "",
    nombre_b: str = "",
) -> Interferencia:
    """Una interferencia con su punto de contacto donde se diga.

    Los dos puntos van simétricos alrededor de `punto`, que es lo que hace `ifcclash`: cada extremo
    es la cara de un elemento. Así el punto medio —lo que usa el agrupador— es exactamente `punto`.
    """
    x, y, z = punto
    mitad = distancia / 2
    return Interferencia(
        guid_a=a,
        guid_b=b,
        clase_a="IfcBeam",
        clase_b="IfcMember",
        nombre_a=nombre_a,
        nombre_b=nombre_b,
        punto_a=[x - mitad, y, z],
        punto_b=[x + mitad, y, z],
        distancia=distancia,
    )


# --- La regla, con sus dos mitades ---------------------------------------------------


def test_veinte_tornillos_contra_la_misma_viga_son_un_problema():
    """El caso que motiva la fila entera."""
    tornillos = [choque(VIGA, guid(i), (i * 0.05, 0.0, 0.0)) for i in range(20)]

    cumulos = agrupar(tornillos)

    assert len(cumulos) == 1
    assert len(cumulos[0].miembros) == 20
    # Y el problema se llama por lo que hay que ir a mirar.
    assert cumulos[0].compartido == VIGA


def test_dos_conflictos_distintos_que_caen_cerca_siguen_siendo_dos():
    """**La mitad de «comparten un elemento», y sin ella la agrupación miente.**

    Un conducto que cruza un muro y, medio metro más allá, una tubería que cruza otro muro. Están
    cerca y no tienen nada que ver: los resuelven dos personas.
    """
    uno = choque(VIGA, guid(1), (0.0, 0.0, 0.0))
    otro = choque(MURO, guid(2), (0.5, 0.0, 0.0))

    assert len(agrupar([uno, otro])) == 2


def test_un_elemento_largo_con_choques_repartidos_no_es_un_problema():
    """**La mitad de «están cerca», y sin ella un muro de cuarenta metros es una fila.**

    Cada choque está en un sitio distinto de la obra y se resuelve en una visita distinta.
    """
    repartidos = [choque(MURO, guid(i), (i * 10.0, 0.0, 0.0)) for i in range(4)]

    cumulos = agrupar(repartidos)

    assert len(cumulos) == 4
    assert all(len(c.miembros) == 1 for c in cumulos)


def test_con_radio_cero_cada_interferencia_es_su_problema():
    """Es el comportamiento de antes de `F5.5`, y sirve para medir cuánto agrupa el radio."""
    tornillos = [choque(VIGA, guid(i), (i * 0.01, 0.0, 0.0)) for i in range(5)]

    assert len(agrupar(tornillos, radio_m=0.0)) == 5


def test_el_radio_se_mide_en_el_punto_medio_del_contacto():
    """**Los dos extremos son la cara de cada elemento**, así que el medio es el único que no
    depende de cuál de los dos se leyó primero."""
    # Dos contactos cuyos puntos medios están a 1,5 m: fuera del radio de un metro.
    lejos = [choque(VIGA, guid(1), (0.0, 0.0, 0.0)), choque(VIGA, guid(2), (1.5, 0.0, 0.0))]
    assert len(agrupar(lejos)) == 2

    # A 0,9 m: dentro.
    cerca = [choque(VIGA, guid(1), (0.0, 0.0, 0.0)), choque(VIGA, guid(2), (0.9, 0.0, 0.0))]
    assert len(agrupar(cerca)) == 1


def test_el_radio_es_una_esfera_y_no_una_planta():
    """Dos contactos con la misma huella y tres metros de diferencia de cota son dos problemas.

    Es la misma lección que el fixture de detección: un detector que compara plantas encuentra
    interferencias donde no las hay, y un agrupador que agrupa por planta las junta igual de mal.
    """
    apilados = [choque(VIGA, guid(1), (0.0, 0.0, 0.0)), choque(VIGA, guid(2), (0.0, 0.0, 3.0))]

    assert len(agrupar(apilados)) == 2


def test_la_misma_pareja_es_el_mismo_problema_aunque_este_lejos():
    """**La identidad manda sobre la distancia, y lo encontró el propio fixture del oráculo.**

    `ifcclash` informa el mismo conflicto dos veces cuando los dos modelos comparten GUID —A contra
    B y B contra A— y **cada informe trae una cara distinta del contacto**: sobre
    `interferencias-a-proposito.ifc`, los dos centros del mismo muro contra el mismo pilar caen a
    1,95 m uno del otro. Con la proximidad sola quedaban como dos problemas.
    """
    espejadas = [
        choque(MURO, VIGA, (0.2, -0.1, 0.675)),
        choque(VIGA, MURO, (-0.2, 0.1, 2.625)),
    ]

    cumulos = agrupar(espejadas)

    assert len(cumulos) == 1
    # Y el cúmulo sabe que es **un** conflicto, no dos: es lo que decide cómo se titula.
    assert cumulos[0].parejas == 1
    assert len(cumulos[0].miembros) == 2


def test_con_radio_cero_la_misma_pareja_sigue_siendo_un_problema():
    """Radio cero apaga la proximidad, **no la identidad**: la misma pareja informada dos veces no
    son dos problemas, y eso no depende de ningún radio."""
    espejadas = [choque(MURO, VIGA, (0.0, 0.0, 0.0)), choque(VIGA, MURO, (0.0, 0.0, 9.0))]

    assert len(agrupar(espejadas, radio_m=0.0)) == 1


# --- Lo que el cúmulo tiene que saber de sí mismo ------------------------------------


def test_la_identidad_del_cumulo_no_depende_de_la_separacion_medida():
    """**La separación es un `float` que se mueve** con la malla, con la tolerancia y con la versión
    de la librería. Un representante que baila abre una observación nueva en cada corrida."""
    juntos = [
        choque(VIGA, guid(3), (0.0, 0.0, 0.0), distancia=0.004),
        choque(VIGA, guid(1), (0.1, 0.0, 0.0), distancia=0.900),
        choque(VIGA, guid(2), (0.2, 0.0, 0.0), distancia=0.050),
    ]

    primero = agrupar(juntos)[0].principal
    # El mismo cúmulo con las separaciones cambiadas y el orden al revés da el mismo representante.
    revueltos = [
        choque(VIGA, guid(2), (0.2, 0.0, 0.0), distancia=0.001),
        choque(VIGA, guid(1), (0.1, 0.0, 0.0), distancia=0.002),
        choque(VIGA, guid(3), (0.0, 0.0, 0.0), distancia=0.700),
    ]
    segundo = agrupar(revueltos)[0].principal

    assert {primero.guid_a, primero.guid_b} == {segundo.guid_a, segundo.guid_b}


def test_el_cumulo_trae_todos_sus_elementos_sin_repetir():
    """Es lo que se aísla al abrirlo: el problema entero en pantalla y nada más."""
    juntos = [
        choque(VIGA, guid(1), (0.0, 0.0, 0.0)),
        choque(VIGA, guid(2), (0.1, 0.0, 0.0)),
        choque(VIGA, guid(1), (0.2, 0.0, 0.0)),
    ]

    elementos = agrupar(juntos)[0].elementos

    assert list(elementos) == [VIGA, guid(1), guid(2)]
    assert len(set(elementos)) == len(elementos)


def test_el_cumulo_dibuja_un_segmento_por_contacto():
    """**Dibujar uno solo afirmaría que el problema está en un punto**, y está a lo largo de la
    unión entera."""
    juntos = [choque(VIGA, guid(i), (i * 0.1, 0.0, 0.0)) for i in range(4)]

    marcado = agrupar(juntos)[0].marcado

    assert len(marcado) == 4
    assert all("inicio" in linea and "fin" in linea for linea in marcado)


def test_sin_un_unico_compartido_no_se_inventa_uno():
    """Tres elementos chocando cada uno contra los dos mismos: es un problema y no tiene un «uno»
    que lo nombre. **Salió del par real**, no de imaginarlo: cinco de los trece cúmulos son así."""
    juntos = []
    for i in (1, 2, 3):
        juntos.append(choque(guid(i), VIGA, (i * 0.1, 0.0, 0.0)))
        juntos.append(choque(guid(i), OTRA_VIGA, (i * 0.1, 0.1, 0.0)))

    cumulo = agrupar(juntos)[0]

    assert len(cumulo.miembros) == 6
    assert cumulo.compartido == ""


def test_un_solo_miembro_no_tiene_elemento_compartido():
    """Los dos lo están, y eso no dice nada."""
    assert agrupar([choque(VIGA, guid(1))])[0].compartido == ""


def test_el_nombre_sale_del_elemento_y_su_clase_cuando_no_tiene_nombre():
    juntos = [
        choque(VIGA, guid(1), (0.0, 0.0, 0.0), nombre_a="V-12", nombre_b="T-1"),
        choque(VIGA, guid(2), (0.1, 0.0, 0.0), nombre_a="V-12"),
    ]

    cumulo = agrupar(juntos)[0]

    assert cumulo.nombre(VIGA) == "V-12"
    # Sin nombre cae a la clase IFC, que al menos dice qué es.
    assert cumulo.nombre(guid(2)) == "IfcMember"
    assert cumulo.nombre("no-esta") == ""


# --- Los bordes ----------------------------------------------------------------------


def test_una_corrida_sin_interferencias_no_da_cumulos():
    assert agrupar([]) == []


def test_el_orden_de_los_cumulos_no_depende_del_orden_de_entrada():
    """**Sin esto, que no se dupliquen depende del orden de iteración de un diccionario.**"""
    unos = [choque(VIGA, guid(1), (0.0, 0.0, 0.0)), choque(MURO, guid(2), (50.0, 0.0, 0.0))]

    primero = [c.principal for c in agrupar(unos)]
    segundo = [c.principal for c in agrupar(list(reversed(unos)))]

    assert [(c.guid_a, c.guid_b) for c in primero] == [(c.guid_a, c.guid_b) for c in segundo]


def test_una_interferencia_sin_guid_no_arrastra_a_las_demas():
    """Sin GUID no hay identidad, y sobre todo **no hay pertenencia**: dos conflictos con el GUID
    vacío en un lado no son «los dos del mismo elemento»."""
    sueltas = [choque("", guid(1), (0.0, 0.0, 0.0)), choque("", guid(2), (0.1, 0.0, 0.0))]

    cumulos = agrupar(sueltas)

    assert len(cumulos) == 2
    assert all(c.identidades == () for c in cumulos)


def test_la_union_es_transitiva_y_por_eso_el_radio_no_se_sube():
    """**Es la razón medida para dejarlo en un metro.** Si A y B son vecinas y B y C también, las
    tres caen en el mismo cúmulo aunque A y C estén lejos. Sobre el par real, a 2 m el cúmulo mayor
    salta de 6 a 17 miembros y a 5 m son 22 de las 35."""
    cadena = [choque(VIGA, guid(i), (i * 0.9, 0.0, 0.0)) for i in range(5)]

    cumulos = agrupar(cadena, radio_m=RADIO_POR_DEFECTO_M)

    # Los extremos están a 3,6 m, muy fuera del radio, y aun así son un cúmulo.
    assert len(cumulos) == 1
    assert len(cumulos[0].miembros) == 5
