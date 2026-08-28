"""Que se estaba viendo cuando se abrio la observacion: `F4.7`, leido sin creerle nada.

**Es la mitad del punto de vista que faltaba.** `F4.1` cerro la camara —desde donde se miraba— y el
BCF seguia saliendo con `DefaultVisibility="true"` y las excepciones vacias, o sea **el modelo
entero a la vista**. Cuando el hallazgo se encontro aislando una planta o apagando la disciplina de
arquitectura, eso no es un detalle que falte: es una afirmacion falsa, y quien abre el archivo en
Solibri ve el edificio completo con el problema tapado por lo que precisamente se habia apagado.

**Y llega desde el visor, asi que es dato hostil**, exactamente igual que la camara. La regla de que
lado se escribe vive en `bim-core` —`ladoDeVisibilidad` y `visibilidadBcf`, con sus pruebas— y aca
**solo se valida**: repetir la regla daria dos implementaciones de lo mismo, que es la forma segura
de que se separen. Lo que se comprueba es la forma del dato, porque lo que se guarda sale despues en
un archivo que se manda al mandante.

**Una visibilidad mala no es un error del que avisar.** Se descarta y la observacion se guarda sin
ella: el BCF vuelve a salir con el modelo entero, que es lo que hacia antes de que esto existiera.
"""

import json

#: Tope de excepciones, **el mismo que `MAXIMO_EXCEPCIONES` de `bim-core`**.
#:
#: No es un limite del formato: BCF no pone ninguno. Es el punto a partir del cual el archivo deja
#: de ser util —cinco mil `<Component>` ya son mas de cien kilobytes de XML por observacion— y
#: ademas acota lo que puede entrar en un `JSONField` desde fuera.
MAXIMO_EXCEPCIONES = 5_000

#: Tope del JSON que se acepta, en caracteres.
#:
#: Cada GUID son 22 caracteres mas comillas y coma: veinticinco por excepcion. Con holgura para las
#: llaves y el resto de la estructura, el tope es lo que ocupa el maximo de excepciones y nada mas.
LARGO_MAXIMO = MAXIMO_EXCEPCIONES * 26 + 200

#: Largo de un GUID de IFC comprimido.
LARGO_GUID = 22

#: El alfabeto de base64 de IFC. El mismo que comprueba `ObservacionesDeRevisionAPI` para el ancla.
_EXTRA_GUID = "_$"


def _es_guid(valor) -> bool:
    """La misma forma que se le exige al ancla: 22 caracteres del alfabeto de IFC.

    **Se comprueba uno por uno y no se confia en el visor.** Un GUID mal formado no rompe nada
    visible hoy: produce un `<Component IfcGuid="...">` que el otro extremo ignora en silencio, y
    entonces el viewpoint muestra algo distinto de lo que se anoto.
    """
    return (
        isinstance(valor, str)
        and len(valor) == LARGO_GUID
        and all(caracter.isalnum() or caracter in _EXTRA_GUID for caracter in valor)
    )


def leer(crudo) -> dict:
    """La visibilidad que venga del visor, validada. `{}` si no hay o si no sirve.

    Devuelve un diccionario listo para guardar en `Observacion.visibilidad`, con las mismas claves
    que escribe `bim-core` y que lee `bcf.py`. **Un diccionario vacio significa «sin restriccion»**,
    que es un estado normal y no un fallo: el viewpoint sale con el modelo entero.

    Acepta la cadena JSON que manda el visor o el diccionario ya decodificado, porque los dos
    caminos existen —la tarjeta de nota manda JSON en el cuerpo, y una llamada interna puede pasar
    el objeto—.
    """
    if crudo is None:
        return {}

    if isinstance(crudo, str):
        if not crudo or len(crudo) > LARGO_MAXIMO:
            return {}
        try:
            datos = json.loads(crudo)
        except (ValueError, TypeError):
            return {}
    else:
        datos = crudo

    if not isinstance(datos, dict):
        return {}

    por_defecto = datos.get("porDefecto")
    # `isinstance(1, bool)` es falso pero `isinstance(True, int)` es verdadero: aca se exige el bool
    # de verdad, porque un `1` que se cuela como `True` invierte el sentido del viewpoint entero.
    if not isinstance(por_defecto, bool):
        return {}

    excepciones = datos.get("excepciones")
    if not isinstance(excepciones, list) or len(excepciones) > MAXIMO_EXCEPCIONES:
        return {}

    # Se filtran los que no son GUID y se quitan los repetidos, conservando el orden: dos modelos
    # abiertos pueden traer el mismo elemento y la lista se duplicaria sin decir nada nuevo.
    limpias = []
    vistos = set()
    for candidato in excepciones:
        if not _es_guid(candidato) or candidato in vistos:
            continue
        vistos.add(candidato)
        limpias.append(candidato)

    # **Sin excepciones utilizables no se guarda nada**, y por el lado `false` eso importa de
    # verdad: `DefaultVisibility="false"` con la lista vacia es un viewpoint que **apaga el modelo
    # entero** y se abre en negro. Antes que escribir eso, no se escribe visibilidad.
    if not limpias:
        return {}

    return {"porDefecto": por_defecto, "excepciones": limpias}
