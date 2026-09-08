"""El punto del levantamiento al que se ancla una observacion. `F12.14`.

**Por que hace falta un ancla que no sea un GUID.** Hasta ahora una observacion se colgaba de un
elemento del IFC —`ifc_guid`, la identidad estable entre versiones y entre herramientas— o de una
pagina de un PDF. Pero **en obra el levantamiento llega antes que el modelo**: se vuela y se mide lo
construido semanas antes de que exista el IFC de esa etapa, y hasta que exista no hay ningun
elemento del que colgar la nota. Sin esto, la coordinacion sobre la nube no empieza hasta que
aparece el modelo, que es justo al revés de como se trabaja.

**Las coordenadas son las del propio archivo, no las de la escena del visor.** Es la misma decision
que ya lleva escrita `pickPointCloud` en el visor: el sistema del renderizador es un detalle de
implementacion —si manana cambia la convencion de ejes, un punto guardado en coordenadas de escena
empieza a mentir— mientras que las del archivo son el dato del topografo. Un punto de un
levantamiento del CC 741 se guarda en UTM 19S porque es lo que declara el COPC, y eso significa algo
para cualquiera que reciba el archivo.

**Y por eso el tope no es el de la camara.** `camara.LEJOS_M` son mil kilometros, que sobra para una
camara puesta en el sistema local del IFC y **rechazaria todos los puntos reales de esta obra**: una
coordenada norte de UTM en Chile ronda los 6,3 millones de metros. El tope de aqui es de escala
terrestre.

**Un punto mal escrito se descarta y la observacion se guarda sin el.** Igual que la camara: llega
por una peticion, o sea que lo escribe cualquiera, y quien abrio la nota no tiene por que ver un
error sobre un parametro que no escribio. Lo que hay que conservar es el hallazgo.
"""

import json

from apps.core.numeros import terna

#: Cuan lejos del origen se admite un punto, en metros.
#:
#: Veinte millones: el eje norte de UTM llega a diez millones en el ecuador de su hemisferio, y las
#: coordenadas geocentricas de un punto en la superficie rondan los seis. No es un limite fisico —es
#: la marca de que algo se leyo en las unidades equivocadas, que es el mismo fallo que caza el tope
#: de la camara con otro numero.
LEJOS_M = 20_000_000.0

#: Tope del JSON que se acepta. Tres numeros son unos 60 caracteres; 300 deja aire y cierra la
#: puerta a que alguien meta un megabyte en tres columnas.
LARGO_MAXIMO = 300


def leer(valor) -> list[float] | None:
    """Tres coordenadas finitas y dentro de escala, o `None`.

    Acepta la lista ya decodificada o el JSON en texto, que es como viaja en una peticion. Devuelve
    `None` ante cualquier cosa que no sea exactamente tres numeros usables — sin distinguir el
    motivo, porque quien llama no hace nada distinto con cada uno.

    **Lo propio de este modulo es el tope y el texto**; la validacion de la forma es la de
    `apps.core.numeros.terna`, compartida con la camara, el marcado y los cortes.
    """
    if valor is None:
        return None

    if isinstance(valor, str):
        texto = valor.strip()
        if not texto or len(texto) > LARGO_MAXIMO:
            return None
        try:
            valor = json.loads(texto)
        except (ValueError, TypeError):
            return None

    return terna(valor, lejos=LEJOS_M)


def como_texto(punto: list[float] | tuple[float, float, float] | None) -> str:
    """El punto escrito para leerlo: `E 345.678,90 · N 6.298.123,45 · Z 412,30`.

    **Existe porque el numero tiene que sobrevivir al BCF.** Un BCF sabe decir una camara y una
    foto, y no sabe decir «este punto de esta nube»: no hay elemento al que apuntar. Asi que la
    coordenada se escribe tambien **en el texto de la observacion**, y entonces viaja a Solibri, a
    Navisworks y a un PDF sin depender de ningun campo nuestro. Es el dato que el topografo puede
    volver a replantear en el suelo.

    Con el separador decimal en español y el de miles tambien, que es como se lee un replanteo aca.
    """
    if punto is None:
        return ""
    este, norte, altura = (float(c) for c in punto)
    return " · ".join(
        (
            f"E {_numero(este)}",
            f"N {_numero(norte)}",
            f"Z {_numero(altura)}",
        )
    )


def _numero(valor: float) -> str:
    """Dos decimales -el centimetro, que es la tolerancia de un levantamiento- y coma decimal.

    El intercambio va por un caracter intermedio y no en dos pasos: la coma a punto y despues el
    punto a coma deja los dos separadores iguales, porque el segundo reemplazo pisa lo que hizo el
    primero.
    """
    return f"{valor:,.2f}".replace(",", "\u0000").replace(".", ",").replace("\u0000", ".")
