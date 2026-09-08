"""Los cortes de una vista compartida, leidos sin creerles nada.

La camara y la visibilidad ya tienen su lector —`apps.documents.camara` y
`apps.documents.visibilidad`, con sus pruebas— y **se reutilizan tal cual**: una vista compartida es
un viewpoint de BCF con nombre y con cortes, asi que dos de sus tres piezas ya estaban validadas.
Lo unico propio son los cortes.

**Y son dato hostil como el resto.** Un plano de corte con una normal de ceros no corta nada; uno
con un origen a mil kilometros deja la pantalla en negro sin decir por que. Nada de eso rompe hoy y
todo se descubre el dia que alguien abre la vista que le pasaron.
"""

import json

from apps.core.numeros import terna

#: Cuantos cortes se admiten. El visor pone tres ejes; **el mismo numero que `MAXIMO_CORTES` de
#: `bim-core`**, y mas de una docena es un dato escrito a mano.
MAXIMO_CORTES = 12

#: Cuan lejos del origen puede estar un plano, en metros. Mismo criterio que la camara: no es un
#: limite fisico, es la marca de que algo se leyo en las unidades equivocadas.
LEJOS_M = 1_000_000.0

#: Bajo esto una normal es cero y **no define ningun plano**.
EPSILON = 1e-9


#: Tope del JSON que se acepta. Doce cortes son unos ochocientos caracteres; mil deja aire.
LARGO_MAXIMO = 4_000


def leer_cortes(valor) -> list[dict]:
    """Los cortes que vengan del visor, validados. Lista vacia si no hay o si no sirven.

    Acepta la cadena JSON o la lista ya decodificada, **igual que `camara.leer` y
    `visibilidad.leer`**: las tres piezas de una vista llegan por el mismo cuerpo y leerlas de tres
    formas distintas es como se cuela un dato sin validar el dia que alguien cambia el cliente.

    **Se descarta corte a corte y no la lista entera**, al reves que la camara: los cortes son
    independientes entre si, y perder una vista completa porque uno venia mal seria peor que
    aplicarla con los que si valen. La camara no admite eso porque media camara no se dibuja.
    """
    if isinstance(valor, str):
        if not valor or len(valor) > LARGO_MAXIMO:
            return []
        try:
            valor = json.loads(valor)
        except (ValueError, TypeError):
            return []

    if not isinstance(valor, (list, tuple)):
        return []

    cortes = []
    for bruto in valor[:MAXIMO_CORTES]:
        if not isinstance(bruto, dict):
            continue
        # **El tope va solo en el origen**, que es la posicion del plano. La normal es una
        # direccion: acotarla no querria decir nada, y aca ni siquiera se exige que mida 1 —solo
        # que no sea cero—, asi que se lee sin tope. Antes el tope del origen iba en un `any()`
        # dos lineas mas abajo; es la misma comprobacion, con el mismo `continue` si falla.
        normal = terna(bruto.get("normal"))
        origen = terna(bruto.get("origen"), lejos=LEJOS_M)
        if normal is None or origen is None:
            continue
        # Una normal de ceros no define un plano: el corte no cortaria nada y el visor lo aplicaria
        # igual, dejando una vista que no es la que se guardo.
        if sum(componente * componente for componente in normal) < EPSILON:
            continue
        cortes.append({"normal": normal, "origen": origen})
    return cortes
