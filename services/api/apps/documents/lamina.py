"""La lamina de un plano, en PDF imprimible y con el sello de la casa: `F7.5`.

**Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** El visor ya sacaba
el DXF —`F7.4`— y eso sirve para seguir trabajando el plano; lo que no cubre es el caso mas comun de
todos: mandarle la planta a alguien que no tiene AutoCAD.

## Por que se dibuja en el servidor y no en el navegador

**Es la decision que el usuario ya tomo para el informe**, el 2026-09-02: «el informe la meta es
desde el servidor asi buscamos que sea interno». Lo mismo vale aqui, y ademas hay dos razones
tecnicas:

1. **El membrete ya esta aqui.** `membrete.py` sabe dibujar el logotipo, el arco, el contacto y el
   pie de J.E.J. sobre una hoja Carta, medidos del formato de la oficina. Repetirlo en el navegador
   serian dos copias de la misma marca, y la segunda se queda atras en el primer cambio.
2. **reportlab ya esta instalado y medido.** La comparacion de cinco librerias esta en
   `pyproject.toml`; añadir un generador de PDF al navegador seria una dependencia mas para hacer lo
   que el servidor ya hace.

## Lo que llega y lo que no

Llega **la geometria ya proyectada**: los segmentos del dibujo en coordenadas del plano, mas los
textos que el visor haya puesto —el cuadro de `F10.4` y las cotas de `F7.3`—. Es decir, el navegador
proyecta —que es donde esta el modelo y la GPU— y el servidor compone el papel.

**No llega el modelo.** Mandarlo para proyectarlo aqui significaria convertir el IFC dos veces y
tener `web-ifc` en el servidor; y proyectar aristas necesita un renderizador, que en un servidor sin
pantalla es justo lo que no hay.

## Y hay tope, porque un plano grande son muchos segmentos

Una planta de un edificio son decenas de miles de segmentos. El tope existe para que una peticion
mal formada —o un plano de un modelo entero sin filtrar— no deje al servidor dibujando un PDF de
cien megas. **Cuando se recorta se dice en el propio papel**, que es la misma regla del informe: una
lamina que calla lo que dejo fuera hace creer que el plano esta completo.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date

from apps.documents.membrete import AZUL, GRIS, MARGEN_MM, sellar

#: Cuantos segmentos entran como maximo en una lamina.
#:
#: **Es un tope de dibujo, no de red**: reportlab traza uno por uno, y sesenta mil lineas son unos
#: pocos segundos y un PDF de un par de megas. Por encima de eso lo que se quiere es el DXF, que es
#: geometria y no papel.
MAXIMO_SEGMENTOS = 60_000

#: Y de textos. Un cuadro de cuarenta filas por siete columnas son 280; mil es holgado.
MAXIMO_TEXTOS = 1_000

#: El grosor del trazo del dibujo, en puntos.
#:
#: **Fino a proposito.** Una planta con trazo de un punto se convierte en una mancha negra en cuanto
#: hay dos muros cerca; 0,3 pt es lo que usa un CAD para la capa de proyeccion.
GROSOR_PT = 0.3


@dataclass(frozen=True)
class Lamina:
    """Lo que hace falta para dibujar una lamina. Todo en coordenadas del plano, en metros."""

    #: El codigo de la obra y el nombre de la vista: van al sello.
    titulo: str
    #: Segmentos `(x1, z1, x2, z2)` en coordenadas del dibujo.
    segmentos: tuple[tuple[float, float, float, float], ...]
    #: Textos `(x, z, alto, texto)` en coordenadas del dibujo.
    textos: tuple[tuple[float, float, float, str], ...]
    #: `True` si al armarla se dejo geometria fuera por el tope.
    recortada: bool = False

    @classmethod
    def desde(cls, datos, titulo: str) -> Lamina:
        """Una lamina a partir de lo que llegue por la API, **validado**.

        Un valor con mala forma se descarta en silencio en vez de reventar: quien manda esto es el
        propio visor, y una lamina con un segmento menos es utilizable mientras un 500 no lo es. Lo
        que **si** se dice es el recorte por tope, porque eso cambia lo que el papel afirma.
        """
        crudos = datos.get("segmentos") or []
        segmentos = tuple(
            (float(s[0]), float(s[1]), float(s[2]), float(s[3]))
            for s in crudos[:MAXIMO_SEGMENTOS]
            if _es_segmento(s)
        )
        crudos_texto = datos.get("textos") or []
        textos = tuple(
            (float(t[0]), float(t[1]), float(t[2]), str(t[3])[:200])
            for t in crudos_texto[:MAXIMO_TEXTOS]
            if _es_texto(t)
        )
        return cls(
            titulo=titulo,
            segmentos=segmentos,
            textos=textos,
            recortada=len(crudos) > MAXIMO_SEGMENTOS or len(crudos_texto) > MAXIMO_TEXTOS,
        )

    @property
    def caja(self) -> tuple[float, float, float, float]:
        """`(minX, minZ, maxX, maxZ)` de todo lo que hay, o un cuadrado unidad si no hay nada."""
        xs: list[float] = []
        zs: list[float] = []
        for x1, z1, x2, z2 in self.segmentos:
            xs.extend((x1, x2))
            zs.extend((z1, z2))
        for x, z, _alto, _texto in self.textos:
            xs.append(x)
            zs.append(z)
        if not xs:
            return (0.0, 0.0, 1.0, 1.0)
        return (min(xs), min(zs), max(xs), max(zs))


def _es_segmento(valor) -> bool:
    return isinstance(valor, (list, tuple)) and len(valor) >= 4 and _todos_numeros(valor[:4])


def _es_texto(valor) -> bool:
    return isinstance(valor, (list, tuple)) and len(valor) >= 4 and _todos_numeros(valor[:3])


def _todos_numeros(valores) -> bool:
    try:
        for valor in valores:
            float(valor)
    except (TypeError, ValueError):
        return False
    return True


def pdf_de(lamina: Lamina, *, pedido_por: str | None = None) -> bytes:
    """Los bytes de la lamina, en Carta y con el sello de la casa.

    **El dibujo se escala para caber en el area util y se centra**, y la escala se escribe en el
    papel: un plano sin escala es un dibujo. No se redondea a una escala normalizada —1:50, 1:100—
    porque eso obligaria a recortar o a dejar media hoja vacia; lo que se hace es decir la que
    salio, que es honesto y utilizable con un escalimetro digital.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as lienzo_pdf

    hoy = date.today()
    memoria = io.BytesIO()
    ancho_pagina, alto_pagina = letter
    lienzo = lienzo_pdf.Canvas(memoria, pagesize=letter)

    # El area util: dentro de los margenes del formato, y con sitio abajo para el contacto.
    izquierda = MARGEN_MM["izquierda"] * mm
    derecha = ancho_pagina - MARGEN_MM["derecha"] * mm
    abajo = MARGEN_MM["abajo"] * mm + 12 * mm
    arriba = alto_pagina - 34 * mm
    util_ancho = derecha - izquierda
    util_alto = arriba - abajo

    min_x, min_z, max_x, max_z = lamina.caja
    ancho_dibujo = max(max_x - min_x, 1e-6)
    alto_dibujo = max(max_z - min_z, 1e-6)

    # **La escala es la que quepa por los dos lados**, y con la misma en X y en Z: escalar cada eje
    # por su cuenta llenaria mas la hoja y deformaria el plano, que es lo peor que le puede pasar a
    # un dibujo del que alguien va a medir.
    escala = min(util_ancho / ancho_dibujo, util_alto / alto_dibujo)
    # Centrado en el area util.
    desplaza_x = izquierda + (util_ancho - ancho_dibujo * escala) / 2
    desplaza_z = abajo + (util_alto - alto_dibujo * escala) / 2

    def en_papel(x: float, z: float) -> tuple[float, float]:
        """De coordenadas del dibujo a puntos del papel.

        **La Z se invierte**, y es la misma convencion que el DXF: el eje vertical del dibujo crece
        hacia abajo en el papel y el de reportlab crece hacia arriba. Sin la inversion la lamina
        sale del reves — y eso ya costo media lamina en `F7.2`.
        """
        return (
            desplaza_x + (x - min_x) * escala,
            desplaza_z + (max_z - z) * escala,
        )

    lienzo.setLineWidth(GROSOR_PT)
    lienzo.setStrokeColor(colors.black)
    # Se dibuja en tandas: un `pathobject` con sesenta mil lineas de una vez es un objeto enorme en
    # memoria, y reportlab no lo necesita para escribir el mismo flujo de contenido.
    for indice, (x1, z1, x2, z2) in enumerate(lamina.segmentos):
        if indice % 2000 == 0:
            trazo = lienzo.beginPath()
        px1, py1 = en_papel(x1, z1)
        px2, py2 = en_papel(x2, z2)
        trazo.moveTo(px1, py1)
        trazo.lineTo(px2, py2)
        if indice % 2000 == 1999 or indice == len(lamina.segmentos) - 1:
            lienzo.drawPath(trazo)

    lienzo.setFillColor(colors.black)
    for x, z, alto, texto in lamina.textos:
        px, py = en_papel(x, z)
        # El alto del texto viaja en unidades del dibujo, así que se escala como todo lo demás; y
        # con un mínimo, porque por debajo de 3 pt no se lee ni impreso ni en pantalla.
        lienzo.setFont("Helvetica", max(3.0, alto * escala))
        lienzo.drawString(px, py, texto)

    # **La escala del dibujo, escrita.** Un plano sin escala es un dibujo: `escala` esta en puntos
    # por metro, y un metro de papel son 1000/25,4*72 puntos.
    puntos_por_metro_de_papel = mm * 1000
    denominador = puntos_por_metro_de_papel / escala if escala > 0 else 0
    lienzo.setFillColor(colors.HexColor(GRIS))
    lienzo.setFont("Helvetica", 7)
    lienzo.drawString(izquierda, abajo - 5 * mm, f"Escala aproximada 1:{denominador:.0f}")
    lienzo.setFillColor(colors.HexColor(AZUL))
    lienzo.setFont("Helvetica-Bold", 7)
    lienzo.drawString(
        izquierda,
        abajo - 9 * mm,
        f"{len(lamina.segmentos)} trazos · {len(lamina.textos)} textos"
        + (f" · lo pidió {pedido_por}" if pedido_por else ""),
    )
    if lamina.recortada:
        # **Cuando se recorta se dice en el propio papel.** Una lamina que calla lo que dejo fuera
        # hace creer que el plano esta completo, y de ahi salen decisiones sobre lo que no se ve.
        lienzo.setFillColor(colors.HexColor("#9c2a2a"))
        lienzo.drawString(
            izquierda,
            abajo - 13 * mm,
            "Atención: el plano es más grande que el tope de esta lámina y salió recortado. "
            "Para el plano completo, el DXF.",
        )

    sellar(
        lienzo,
        ancho_pagina=ancho_pagina,
        alto_pagina=alto_pagina,
        titulo=lamina.titulo,
        fecha=hoy,
        pagina=1,
    )

    lienzo.showPage()
    lienzo.save()
    return memoria.getvalue()
