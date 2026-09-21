"""El membrete de la casa, en una sola copia.

**Lo dibujaban el informe y ahora tambien la lamina**, y ese es todo el motivo de que exista este
modulo: el membrete de J.E.J. es lo que hace que una hoja suelta se reconozca, y con una copia en
cada salida la segunda se queda atras en el primer cambio —el logotipo nuevo, otro telefono, otro
azul— y el producto empieza a mandar dos papeles distintos con el mismo nombre.

Todo lo que hay aqui **se leyo de `Formato Carta 2023 Nuevo Logo.docx`**, el formato de carta de la
oficina, y no se estimo. La tabla completa con lo que dice cada pieza esta en el docstring de
`informe.py`, que es donde se midio: pagina Carta y no A4, Helvetica, el azul del logotipo a 9,45:1
sobre papel blanco, el azul claro del arco a 2,19:1 —decoracion y **nunca** texto— y el gris del
contacto a 7,21:1.

**Y el membrete que falta no tumba la salida.** Las piezas se buscan con el buscador de estaticos de
Django —asi funciona igual en desarrollo y con `collectstatic` hecho— y si no aparecen, la hoja sale
sin ellas. Una hoja sin logo es utilizable; una descarga que falla no.
"""

from __future__ import annotations

AZUL = "#1F428D"  # 9,45:1 — sirve para texto
AZUL_CLARO = "#68B8E5"  # 2,19:1 — decoracion, nunca texto
GRIS = "#585756"  # 7,21:1

#: La pagina, tal como la declara el formato: **Carta y no A4**, con sus margenes.
#:
#: Los laterales y el de abajo son los de la carta. **El de arriba es 38 y no los 52,4 del
#: formato**, y es una diferencia deliberada: en una carta ese margen tan alto deja sitio al
#: destinatario y a la referencia, que aqui no hay — el membrete acaba en la linea de los 28 mm.
MARGEN_MM = {"izquierda": 30.0, "derecha": 30.0, "arriba": 38.0, "abajo": 26.8}

#: Cada pieza del membrete con **el tamaño al que Word la coloca**, en milimetros.
MEMBRETE = {
    "logo": ("img/membrete/jej-logo.png", 34.0, 16.3),
    "arco": ("img/membrete/jej-arco.png", 40.7, 41.9),
}

#: El bloque de contacto del pie, **como texto y no como imagen**.
#:
#: Tres razones y no una: sale **nitido a cualquier resolucion** —una imagen a 300 ppp impresa a
#: 600 se ve blanda—, **se puede seleccionar y copiar** del PDF, que es lo que hace alguien que
#: quiere el telefono, y ademas **el EMF venia recortado por la derecha**: al convertirlo,
#: «jej.cl» y «jej@jej.cl» perdian la ultima letra, porque el marco del metarchivo es mas estrecho
#: que su contenido. Con texto ese problema no existe.
#: **Va tal como lo escribe el formato de la casa, y en su orden.** Se dibuja de abajo hacia arriba,
#: asi que la ultima linea de la tupla es la que queda mas abajo en el papel y la primera —«jej.cl»—
#: es la que va destacada en azul.
CONTACTO = (
    "jej.cl",
    "E-mail: jej@jej.cl",
    "Fono: +56 2 2722 5000",
    "Avda. Apoquindo 2930, Piso 11",
    "Las Condes, Santiago de Chile.",
)


def pieza(clave: str):
    """La ruta de una pieza del membrete, o `None` si no esta.

    **Con el buscador de estaticos de Django y no con una ruta a mano**: asi funciona igual en
    desarrollo y con `collectstatic` hecho, que son dos sitios distintos en disco.
    """
    from django.contrib.staticfiles import finders

    ruta, _ancho, _alto = MEMBRETE[clave]
    encontrada = finders.find(ruta)
    return encontrada if encontrada else None


def sellar(
    lienzo, *, ancho_pagina, alto_pagina, titulo: str, fecha, pagina: int, total: int | None = None
) -> None:
    """Dibuja el membrete y el pie en la pagina que el lienzo tenga abierta.

    `titulo` es la franja de la derecha, debajo del logo: es **lo que convierte la carta en el
    documento que sea** —«716-LCD · Informe de coordinación», «716-LCD · Planta»— y por eso lo pone
    quien llama y no este modulo.

    **Una hoja suelta tiene que decir de donde salio.** Un plano se fotocopia, se reparte y se queda
    en una carpeta seis meses; una pagina sin obra ni fecha es una pagina que alguien va a leer
    creyendo que es la de hoy.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader

    lienzo.saveState()

    # El arco de esquina, abajo a la derecha y **por debajo de todo**: es decoracion, y va primero
    # para que ni el texto del pie ni el numero de pagina queden tapados.
    arco = pieza("arco")
    if arco:
        _ruta, ancho_mm, alto_mm = MEMBRETE["arco"]
        lienzo.drawImage(
            ImageReader(arco),
            ancho_pagina - ancho_mm * mm,
            0,
            width=ancho_mm * mm,
            height=alto_mm * mm,
            mask="auto",
        )

    logo = pieza("logo")
    if logo:
        _ruta, ancho_mm, alto_mm = MEMBRETE["logo"]
        lienzo.drawImage(
            ImageReader(logo),
            MARGEN_MM["izquierda"] * mm,
            alto_pagina - 14 * mm - alto_mm * mm,
            width=ancho_mm * mm,
            height=alto_mm * mm,
            mask="auto",
        )

    # El bloque de contacto, compuesto y no pegado. De abajo hacia arriba, con la ultima linea a
    # 12 mm del borde, que es donde la pone la carta.
    for indice, linea in enumerate(reversed(CONTACTO)):
        alto = (12 + indice * 3.4) * mm
        if indice == len(CONTACTO) - 1:
            lienzo.setFont("Helvetica-Bold", 8)
            lienzo.setFillColor(colors.HexColor(AZUL))
        else:
            lienzo.setFont("Helvetica", 7)
            lienzo.setFillColor(colors.HexColor(GRIS))
        lienzo.drawString(MARGEN_MM["izquierda"] * mm, alto, linea)

    # La franja del documento, justo debajo del logo.
    lienzo.setFillColor(colors.HexColor(AZUL))
    lienzo.setFont("Helvetica-Bold", 8)
    lienzo.drawRightString(ancho_pagina - MARGEN_MM["derecha"] * mm, alto_pagina - 20 * mm, titulo)
    lienzo.setFillColor(colors.HexColor(GRIS))
    lienzo.setFont("Helvetica", 7)
    lienzo.drawRightString(
        ancho_pagina - MARGEN_MM["derecha"] * mm, alto_pagina - 24 * mm, fecha.isoformat()
    )
    lienzo.setLineWidth(0.6)
    lienzo.setStrokeColor(colors.HexColor(AZUL_CLARO))
    lienzo.line(
        MARGEN_MM["izquierda"] * mm,
        alto_pagina - 28 * mm,
        ancho_pagina - MARGEN_MM["derecha"] * mm,
        alto_pagina - 28 * mm,
    )

    # **El numero de pagina termina antes del arco**, no en el margen derecho: el arco ocupa los
    # 40,7 mm de la esquina, y alineado al margen el texto se metia diez milimetros debajo del azul.
    # Se vio en la primera prueba impresa.
    # **«Página 3» no permite saber si falta una hoja**, y un informe se fotocopia y se grapa. Con
    # el total, una hoja suelta se delata sola. `total` es opcional porque la lamina de un plano es
    # de una sola pagina y ahi «de 1» es ruido.
    _r, ancho_arco, _a = MEMBRETE["arco"]
    cuantas = f"Página {pagina} de {total}" if total else f"Página {pagina}"
    lienzo.setFillColor(colors.HexColor(GRIS))
    lienzo.setFont("Helvetica", 7)
    lienzo.drawRightString(
        ancho_pagina - (ancho_arco + 4) * mm,
        14 * mm,
        f"{cuantas} · sacado de AeroBim el {fecha.isoformat()}",
    )
    lienzo.restoreState()
