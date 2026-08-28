"""La foto de lo que se estaba mirando, leida del visor sin creerle nada.

**Un tema de BCF sin imagen es media observacion.** Todo visor del mercado —Solibri, Navisworks,
BCF Manager— dibuja la lista de temas con su miniatura al lado, y es lo que hace que quien la recibe
sepa de que se le habla antes de cargar el modelo. Los nuestros salian sin ninguna: el mandante
abria una lista de titulos.

**Llega como `data:` en el cuerpo de la peticion, asi que es dato hostil**, igual que la camara y la
visibilidad. Y este ademas **se escribe en el disco**, que sube la apuesta: lo que se guarda acaba
dentro de un ZIP que se le manda a otra oficina.

Tres cosas se comprueban, y las tres tienen su motivo:

1. **Que sea PNG de verdad**, por su firma y no por lo que diga la cabecera del `data:` — que la
   escribe quien manda. Es la misma regla de `storage.validar`, y de hecho se reutiliza.
2. **Que no sea enorme.** El tope esta por debajo del limite de Django para el cuerpo de una
   peticion, a proposito: pasarse daria un 400 del framework, sin decir cual de los campos sobra.
3. **Que el visor no mande un rectangulo liso.** Eso lo comprueba `bim-core` antes de mandarlo
   —`pareceEnBlanco`, con sus pruebas—, porque ahi estan los pixeles; aca solo se guarda lo que
   llegue. Una miniatura en blanco dentro de un BCF afirma «asi se ve el problema» sobre nada.

**Y una instantanea mala no impide guardar el hallazgo.** Se descarta y la observacion se guarda sin
ella: el BCF sale con su viewpoint y sin foto, que es lo que hacia antes de que esto existiera.
"""

import base64
import binascii

from apps.documents import storage

#: Prefijo que escribe `canvas.toDataURL("image/png")`.
PREFIJO = "data:image/png;base64,"

#: Tope de la cadena `data:` que se acepta, en caracteres.
#:
#: **Por debajo del limite de Django para el cuerpo de una peticion**
#: (`DATA_UPLOAD_MAX_MEMORY_SIZE`, 2,5 MB por defecto): asi el campo que sobra se rechaza aca, con
#: un motivo, en vez de que el framework devuelva un 400 sin decir cual era.
LARGO_MAXIMO = 1_800_000

#: Tope de la imagen ya decodificada. Base64 crece un tercio: va acompasado con el de arriba.
BYTES_MAXIMOS = 1_300_000


def leer(crudo) -> bytes | None:
    """Los bytes del PNG que venga en el `data:`, o `None` si no hay o no sirve.

    **`None` significa «sin instantanea»**, que es un estado normal: una observacion que no viene
    del visor no tiene pantalla que fotografiar.
    """
    if not isinstance(crudo, str) or not crudo:
        return None
    if len(crudo) > LARGO_MAXIMO:
        return None
    if not crudo.startswith(PREFIJO):
        # **Solo PNG y solo de un lienzo.** Aceptar cualquier `data:` abriria la puerta a guardar
        # un SVG —que lleva scripts— o un archivo cualquiera con la cabecera cambiada.
        return None

    try:
        datos = base64.b64decode(crudo[len(PREFIJO) :], validate=True)
    except (binascii.Error, ValueError):
        return None

    if not datos or len(datos) > BYTES_MAXIMOS:
        return None

    # **La firma manda, no la cabecera del `data:`.** La cabecera la escribe quien manda; los
    # primeros bytes son el archivo. Es la misma comprobacion con la que se cae `virus.exe`
    # renombrado a `plano.pdf`, y se reutiliza en vez de escribirla otra vez.
    if not any(datos.startswith(firma) for firma in storage.FIRMAS["png"]):
        return None

    return datos
