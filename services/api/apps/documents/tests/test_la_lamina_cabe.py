"""**«El generador de planos funciona en DXF y no en PDF.»**

## Por qué el DXF sí y el PDF no

Porque el DXF **no viaja**: se escribe en el navegador con la librería de That Open y se descarga.
El PDF manda la geometría al servidor —el navegador proyecta, el servidor compone el papel, que es
la decisión de `F7.5`— y ahí es donde se cae.

## El defecto

`lamina.py` recorta a `MAXIMO_SEGMENTOS`… **después de recibir el cuerpo entero**. Y Django rechaza
una petición que pasa de `DATA_UPLOAD_MAX_MEMORY_SIZE` (8 MB) **antes de que la vista corra**, así
que el recorte no llegaba a ejecutarse nunca en el caso que lo motivó: la planta de un edificio
real pasa holgadamente de los 60 000 segmentos, y cada uno son unos 32 bytes de JSON.

Y el error que se ve no explica nada —«El servidor respondió 400»— porque el rechazo de Django no
es JSON y el cliente no lo puede leer.

## Por qué el tope está escrito dos veces, a propósito

- **En el navegador**, porque el recorte tiene que ocurrir **antes de mandar**.
- **En el servidor**, porque el cuerpo lo puede escribir cualquiera y una vista no se fía del
  cliente.

Dos idiomas no comparten una constante. Lo que impide que se separen es esta prueba, que lee **el
archivo TypeScript** — el mismo camino que ya sujeta el nombre de la cookie en `csrf.ts`.

## Lo que esto NO arregla

Que el plano salga bien dibujado. Eso pide `EdgeProjector`, que lee la escena **dibujada**: en un
navegador que no compone fotogramas la proyección no avanza, y por eso no se pudo reproducir el
fallo del usuario en el entorno de trabajo. Lo que esta prueba sujeta es que **la lámina quepa**,
que es la única mitad que se puede medir sin una pantalla.
"""

import re
from pathlib import Path

from django.conf import settings

from apps.documents.lamina import MAXIMO_SEGMENTOS, MAXIMO_TEXTOS

RAIZ = Path(settings.BASE_DIR).parents[1]
DRAWINGS = RAIZ / "packages" / "viewer" / "src" / "drawings.ts"


def _tope(nombre: str) -> int:
    """El tope que el navegador aplica, leído de su propio archivo."""
    fuente = DRAWINGS.read_text(encoding="utf-8")
    encontrado = re.search(rf"readonly {nombre} = ([\d_]+);", fuente)
    assert encontrado, f"{nombre} ya no está en drawings.ts: el recorte del navegador se perdió"
    return int(encontrado.group(1).replace("_", ""))


def test_el_navegador_recorta_con_el_mismo_tope_que_el_servidor():
    """**Si se separan, vuelve el fallo y en silencio.**

    Con el tope del navegador más alto que el del servidor, la petición se pasa otra vez del límite
    de Django y el PDF deja de salir — con el mismo error que no explica nada. Con el del navegador
    más bajo, el papel sale recortado sin motivo.
    """
    assert _tope("MAXIMO_SEGMENTOS") == MAXIMO_SEGMENTOS
    assert _tope("MAXIMO_TEXTOS") == MAXIMO_TEXTOS


def test_una_lamina_al_tope_cabe_en_el_limite_de_django():
    """**La comprobación que faltaba, y es aritmética, no una opinión.**

    Un segmento son cuatro números con decimales: `[12.345678,-3.14159,12.9,-3.2]` ≈ 32 bytes de
    JSON. Al tope, eso son unos 2 MB — holgado bajo los 8 MB de `DATA_UPLOAD_MAX_MEMORY_SIZE`.

    Se mide con un margen de seguridad grande a propósito: los números de un modelo real traen más
    decimales que este ejemplo, y lo que se quiere saber no es el byte exacto sino que **no estamos
    cerca del borde**. El día que alguien suba `MAXIMO_SEGMENTOS` sin mirar el límite de Django,
    esto se pone en rojo.
    """
    import json

    # El peor caso realista: coordenadas con siete decimales, que es lo que escribe un `Float32`
    # convertido a texto sin redondear.
    segmento = [12.3456789, -3.1415927, 1234.5678901, -987.6543211]
    bytes_por_segmento = len(json.dumps(segmento))

    al_tope = bytes_por_segmento * MAXIMO_SEGMENTOS
    limite = settings.DATA_UPLOAD_MAX_MEMORY_SIZE

    assert al_tope < limite * 0.75, (
        f"una lámina al tope pesa {al_tope // 1024} KB y el límite de Django es "
        f"{limite // 1024} KB: sin margen, el PDF vuelve a fallar con un 400 que no se entiende"
    )


def test_el_servidor_sigue_recortando_aunque_el_navegador_lo_haga():
    """**No es redundancia: el cuerpo lo puede escribir cualquiera.**

    El recorte del navegador existe para que la petición quepa. El del servidor existe porque una
    vista no se fía de su cliente — y sin él, un cuerpo de 7,9 MB pasaría el límite de Django y
    pondría a `reportlab` a dibujar doscientos mil segmentos en una hoja Carta.
    """
    from apps.documents.lamina import Lamina

    lamina = Lamina.desde(
        {"segmentos": [[0, 0, 1, 1]] * (MAXIMO_SEGMENTOS + 10), "textos": []},
        titulo="prueba",
    )

    assert len(lamina.segmentos) == MAXIMO_SEGMENTOS
    assert lamina.recortada is True, "recortó y no lo dice: el papel saldría incompleto en silencio"
