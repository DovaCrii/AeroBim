"""La camara de una observacion: leerla de fuera sin creerle nada. `F4.1`.

**Llega por la URL, asi que es dato hostil.** El visor la arma —`camaraBcfDesdeEscena` en
`bim-core`, ya convertida al sistema del IFC— y la manda como JSON en un parametro. Pero un
parametro de una URL lo escribe cualquiera, y lo que se guarda aca **sale despues en un archivo BCF
que se manda al mandante**: un numero absurdo no rompe nada visible hoy y produce un viewpoint que
abre mirando al infinito.

**Por que el visor convierte y aca solo se valida.** La transformacion de coordenadas —la escena del
visor tiene el eje Y hacia arriba, el IFC tiene Z— vive en `bim-core`, donde se prueba sin navegador
y donde ya esta comprobada contra los ejes de replanteo del modelo. Repetirla aca daria dos
implementaciones de la misma regla, que es la forma segura de que se separen. Lo que se guarda esta
en el sistema del IFC: el del modelo, el que entiende cualquiera que reciba el archivo.

**Y una camara mala no es un error del que avisar.** Se descarta y la observacion se guarda sin
ella: el BCF sale con el elemento seleccionado, que es lo que hacia antes de que esto existiera.
Quien abrio la observacion no escribio ese parametro y no tiene por que ver un error sobre el.
"""

import json

from apps.core.numeros import terna

#: Los dos tipos que distingue BCF. Ver `bcf.py`.
PERSPECTIVA = "perspectiva"
ORTOGONAL = "ortogonal"
TIPOS = (PERSPECTIVA, ORTOGONAL)

#: Cuan lejos del origen se admite una camara, en metros.
#:
#: Mil kilometros. No es un limite fisico: es la marca de que algo se leyo en las unidades
#: equivocadas. Un modelo en milimetros interpretado como metros pone la camara a mil veces su
#: distancia, y ese es el fallo que este tope caza.
LEJOS_M = 1_000_000.0

#: Tope del alto de vista de una camara ortogonal, en metros. Mismo motivo.
ALTO_MAXIMO_M = 100_000.0

#: Cuanto puede desviarse un vector de ser unitario. El visor los manda redondeados a seis
#: decimales, asi que el margen cubre el redondeo y nada mas.
TOLERANCIA_UNITARIA = 1e-3

#: Tope del JSON que se acepta. Una camara son unos 200 caracteres; mil deja aire de sobra y
#: cierra la puerta a que alguien meta un megabyte en un `JSONField`.
LARGO_MAXIMO = 1_000


def _unitario(valor) -> list[float] | None:
    """Una terna que ademas mide 1. Un vector de direccion que no lo sea no es una direccion.

    **Sin tope de distancia**, y no es un olvido: un vector que mide 1 no puede estar lejos de
    ningun sitio, porque no es una posicion.

    La variable local **no puede llamarse `terna`**: en Python, asignar a un nombre lo vuelve local
    en todo el cuerpo de la funcion, asi que `terna = terna(valor)` intentaria llamar a la local
    antes de que exista y daria `UnboundLocalError`. Se llama `tres`.
    """
    tres = terna(valor)
    if tres is None:
        return None
    largo = sum(componente * componente for componente in tres) ** 0.5
    if abs(largo - 1.0) > TOLERANCIA_UNITARIA:
        return None
    return tres


def leer(crudo: str | None) -> dict:
    """La camara que venga en la URL, validada. `{}` si no hay o si no sirve.

    Devuelve un diccionario listo para guardar en `Observacion.punto_de_vista`, con las mismas
    claves que escribe el visor y que lee `bcf.py`. **Un diccionario vacio significa «sin camara»**,
    que es un estado normal y no un fallo.
    """
    if not crudo or len(crudo) > LARGO_MAXIMO:
        return {}

    try:
        datos = json.loads(crudo)
    except (ValueError, TypeError):
        return {}
    if not isinstance(datos, dict):
        return {}

    tipo = datos.get("tipo")
    if tipo not in TIPOS:
        return {}

    # **El tope va solo en el punto**, que es la posicion; la direccion y el arriba miden 1 y no
    # pueden estar lejos de nada. Antes iba en un `any()` de esta funcion y ahora lo pone la propia
    # lectura: son la misma comprobacion, y con el mismo resultado —`{}`— si falla.
    punto = terna(datos.get("punto"), lejos=LEJOS_M)
    direccion = _unitario(datos.get("direccion"))
    arriba = _unitario(datos.get("arriba"))
    if punto is None or direccion is None or arriba is None:
        return {}

    # **El arriba tiene que ser perpendicular a la direccion**, y no es una formalidad: el XSD de
    # BCF lo pide, y un lector estricto rechaza el viewpoint entero. El visor ya lo ortogonaliza;
    # esto caza una camara escrita a mano.
    producto = sum(a * b for a, b in zip(direccion, arriba, strict=True))
    if abs(producto) > TOLERANCIA_UNITARIA:
        return {}

    camara = {"tipo": tipo, "punto": punto, "direccion": direccion, "arriba": arriba}

    if tipo == ORTOGONAL:
        escala = datos.get("escala")
        if isinstance(escala, bool) or not isinstance(escala, (int, float)):
            return {}
        escala = float(escala)
        # Una ortogonal sin alto de vista no se puede reproducir: la posicion dice desde donde se
        # mira y nada dice cuanto se ve.
        if not (0 < escala <= ALTO_MAXIMO_M):
            return {}
        camara["escala"] = escala
        return camara

    campo = datos.get("campoVisual")
    # El campo visual es opcional a proposito: sin el, quien lo lea usa el suyo, que es un encuadre
    # razonable. Uno imposible se omite en vez de tirar la camara entera.
    if not isinstance(campo, bool) and isinstance(campo, (int, float)) and 0 < float(campo) < 180:
        camara["campoVisual"] = float(campo)
    return camara
