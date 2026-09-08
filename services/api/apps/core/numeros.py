"""Leer numeros que vienen de fuera sin creerles nada.

**Aca vive una sola funcion y existe porque estaba escrita cuatro veces.** `camara.py`,
`marcado.py`, `vistas.py` y `punto.py` validan las cuatro «tres numeros finitos» —las coordenadas de
un punto de vista, los extremos de un segmento del marcado, el origen de un corte, el ancla de una
observacion en la nube— y cada uno se escribio por su lado con el mismo cuerpo.

Dos de las cuatro copias ya se habian separado sin que nadie lo notara: la de `marcado.py` aplicaba
el tope de distancia **dentro** de la terna y las de `camara.py` y `vistas.py` lo aplicaban fuera y
solo a una de sus dos ternas. O sea que la duplicacion ya estaba cobrando: no eran cuatro copias,
eran dos comportamientos distintos con el mismo nombre.

## Por que el tope es un parametro y no una constante

**Porque los topes de verdad son distintos y esa diferencia es correcta.** Una camara vive en el
sistema local de un IFC, donde mil kilometros del origen ya son la marca de que algo se leyo en
milimetros; un punto de un levantamiento vive en coordenadas UTM, donde el eje norte en Chile ronda
los **6,3 millones de metros** y mil kilometros rechazaria cada punto real de la obra.

Un solo tope aca obligaria a elegir entre dejar pasar una camara absurda o descartar todos los
levantamientos. Asi que el tope lo pone quien llama, con su propia constante y su propio motivo
escrito al lado — y hay una prueba en `test_punto_de_la_nube.py` que fija esa diferencia.
"""

import math


def terna(valor, *, lejos: float | None = None) -> list[float] | None:
    """Tres numeros finitos, o `None` ante cualquier otra cosa.

    `lejos` es cuan lejos del origen se admite cada componente, en las unidades de quien llama.
    `None` —el valor por defecto— no comprueba distancia: es lo que hace falta para un vector de
    direccion, que no es una posicion y ya viene acotado por medir 1.

    Devuelve `None` sin distinguir el motivo, porque **ningun llamador hace nada distinto con cada
    uno**: los cuatro descartan la pieza y guardan el hallazgo sin ella.

    Tres trampas, y las tres estaban ya cazadas en las copias salvo la ultima:

    1. **`bool` es `int` en Python**, asi que `[True, 0, 0]` pasa un `isinstance(..., int)` y no es
       un punto. Se rechaza a mano y antes de la comprobacion de tipo.
    2. **`nan` e `inf` son `float`**, asi que tambien pasan el `isinstance` y envenenan cualquier
       cuenta posterior sin dar error. `math.isfinite` los caza los tres de una vez — las copias lo
       hacian con `numero != numero` y una comparacion contra los dos infinitos, que es lo mismo
       escrito mas largo.
    3. **Un entero enorme revienta `float()`.** `json.loads` de cuatrocientos nueves devuelve un
       `int` de Python, que no tiene tope, y `float(ese int)` lanza `OverflowError`. **Las cuatro
       copias lo dejaban salir sin capturar**, o sea que un cuerpo de peticion con un numero de
       cuatrocientos digitos daba un 500 en vez de descartarse — comprobado el 2026-09-08 contra
       los cuatro lectores. Es justo lo contrario del contrato de estos modulos: son dato hostil, se
       descartan.
    """
    if not isinstance(valor, (list, tuple)) or len(valor) != 3:
        return None

    salida: list[float] = []
    for componente in valor:
        if isinstance(componente, bool) or not isinstance(componente, (int, float)):
            return None
        try:
            numero = float(componente)
        except OverflowError:
            # Ver la trampa 3 del docstring: un `int` de Python no tiene tope y `float` si.
            return None
        if not math.isfinite(numero):
            return None
        if lejos is not None and abs(numero) > lejos:
            return None
        salida.append(numero)
    return salida
