"""Lo que se dibujo sobre el modelo, leido del visor sin creerle nada: `F4.5`.

**El BCF ya lleva a donde mirar, que se veia y una foto. Lo que no llevaba es que senalaba quien
anoto.** El titulo dice «la viga del eje C choca con el ducto» y en la pantalla habia una cota de
4 cm entre las dos: ese numero es el hallazgo, y se quedaba en el navegador.

**Las cotas dibujadas son el marcado.** BCF 2.1 guarda el marcado de un viewpoint como segmentos de
recta en coordenadas del modelo —`<Lines>`— y medir consiste justamente en poner puntos ahi. La
regla de como se convierte cada medida vive en `bim-core`, con sus pruebas; aca **solo se valida la
forma**, igual que con la camara y la visibilidad.

**Y un marcado malo no impide guardar el hallazgo.** Se descarta y la observacion se guarda sin el:
el viewpoint sale con su camara y su foto, que es lo que hacia antes de que esto existiera.
"""

import json

#: Cuantos segmentos se admiten, **el mismo numero que `MAXIMO_LINEAS` de `bim-core`**.
#:
#: No es un limite del formato: es que un BCF no es un archivo de dibujo. Doscientos segmentos son
#: ya un contorno de doscientos vertices, muy por encima de lo que alguien senala a mano.
MAXIMO_LINEAS = 200

#: Tope del JSON. Cada segmento son seis numeros: unos 90 caracteres con holgura.
LARGO_MAXIMO = MAXIMO_LINEAS * 120 + 200

#: Cuan lejos del origen se admite un punto, en metros. Mismo criterio que la camara: no es un
#: limite fisico, es la marca de que algo se leyo en las unidades equivocadas.
LEJOS_M = 1_000_000.0


def _terna(valor) -> list[float] | None:
    """Tres numeros finitos, o `None`. Acepta `int` y rechaza `bool`, que en Python es `int`."""
    if not isinstance(valor, (list, tuple)) or len(valor) != 3:
        return None
    salida = []
    for componente in valor:
        if isinstance(componente, bool) or not isinstance(componente, (int, float)):
            return None
        numero = float(componente)
        # `nan` e `inf` pasan por `isinstance` y envenenan cualquier cuenta posterior.
        if numero != numero or numero in (float("inf"), float("-inf")):
            return None
        if abs(numero) > LEJOS_M:
            return None
        salida.append(numero)
    return salida


def leer(crudo) -> list[dict]:
    """Los segmentos que vengan del visor, validados. Lista vacia si no hay o si no sirven.

    Devuelve `[{"inicio": [x, y, z], "fin": [x, y, z]}, ...]`, con las mismas claves que escribe
    `bim-core` y que lee `bcf.py`. **Una lista vacia significa «sin marcado»**, que es el estado
    normal: la mayoria de las observaciones se abren sin haber medido nada.

    Acepta la cadena JSON o la lista ya decodificada, igual que las otras tres piezas del
    viewpoint: leerlas de formas distintas es como se cuela un dato sin validar.
    """
    if isinstance(crudo, str):
        if not crudo or len(crudo) > LARGO_MAXIMO:
            return []
        try:
            crudo = json.loads(crudo)
        except (ValueError, TypeError):
            return []

    if not isinstance(crudo, (list, tuple)):
        return []
    # **Pasado el tope se descarta la lista entera y no se recorta.** Recortar dejaria el contorno
    # de un area abierto, o sea una forma que nadie dibujo — que es peor que no dibujar nada.
    if len(crudo) > MAXIMO_LINEAS:
        return []

    lineas = []
    for bruto in crudo:
        if not isinstance(bruto, dict):
            continue
        inicio = _terna(bruto.get("inicio"))
        fin = _terna(bruto.get("fin"))
        if inicio is None or fin is None or inicio == fin:
            continue
        lineas.append({"inicio": inicio, "fin": fin})
    return lineas
