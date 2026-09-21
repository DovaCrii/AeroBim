"""**«El formato de informe falla al entregar.»**

Cuatro defectos distintos, y el mas probable no es de maquetacion.

## 1. El texto del usuario se corrompe en el papel, en silencio

`Paragraph` de reportlab parsea su texto como mini-XML, y el informe metia titulo, descripcion,
resolucion, comentarios y responsable **sin escapar**.

**Medido, porque lo que yo daba por hecho era falso:** no levanta ninguna excepcion. Hace algo peor.

| Lo que se escribio | Lo que sale impreso |
| --- | --- |
| `Muro de A&A Ingenieria` | `Muro de A&A; Ingenieria` |
| `Cliente <ACME> y asociados` | `Cliente  y asociados` |

Un punto y coma inventado, y **un nombre de empresa que desaparece**. El informe sale, parece
correcto, se lleva a la reunion y dice otra cosa. Un 500 se ve; esto no.

Que el propio modulo **ya escapaba en un sitio** —la etiqueta del filtro— confirma que el riesgo se
conocia y no se aplico al resto. Y entra por el importador BCF, que es justo donde mas probable es
un ampersand.

## 2. Las miniaturas se salen del papel por la derecha

La altura estaba fija en 18 mm y **el ancho se deducia de la proporcion, sin tope**. Una captura
16:9 —lo normal en un visor 3D— da 32 mm en una columna de **25 mm**, y es la ultima columna: se
come el margen derecho.

## 3. Un hilo largo tumba la descarga entera

Una fila de tabla **no se puede partir entre dos paginas**: `LongTable` corta *entre* filas, nunca
dentro de una. Un hallazgo muy discutido mete N parrafos en la misma celda, pasa el alto util del
marco, y reportlab levanta `LayoutError` — o sea, **el informe completo se cae** por culpa de uno.

## Lo que NO resulto ser un defecto, dicho

Escribi que el bloque de contacto invadia el marco de texto por ~0,8 mm —el ascendente del «jej.cl»
contra el `bottomMargin`— y **no se reproduce**: la rejilla de la tabla nunca baja del margen. La
comprobacion se queda abajo como invariante, pero no se cambio ningun margen, porque no habia nada
que cambiar. Tampoco reportlab levanta excepcion con un `&`, que es lo otro que yo daba por hecho.

## Por que la bateria anterior no vio ninguno

Porque **toda ella comprueba «esta cadena aparece en el texto extraido»**. Ningun fixture usaba `&`
ni una miniatura 16:9, y ninguna asercion medio una coordenada — asi que un objeto fuera de los
margenes, o dos superpuestos, pasan el gate con toda tranquilidad. Es el patron de los oraculos que
cuentan y no miden, otra vez.

Este modulo mide **milimetros**.
"""

import re
from io import BytesIO

import pytest

from apps.documents.informe import Opciones, pdf_de
from apps.documents.models import Comentario
from apps.documents.tests.test_informe import anotar, png

MM = 72.0 / 25.4

# El formato de la casa, de `membrete.py`.
ANCHO_CARTA = 215.9 * MM
MARGEN_DERECHO = 30.0 * MM
MARGEN_IZQUIERDO = 30.0 * MM


def _flujo(contenido: bytes) -> list[str]:
    """El flujo de contenido de cada pagina, ya descomprimido."""
    from pypdf import PdfReader

    salida = []
    for pagina in PdfReader(BytesIO(contenido)).pages:
        datos = pagina.get_contents()
        if datos is not None:
            salida.append(datos.get_data().decode("latin-1", errors="replace"))
    return salida


def _por(m, ctm):
    """`m × ctm`, que es como compone `cm` en PDF: la nueva matriz premultiplica a la actual."""
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = ctm
    return (
        a * a2 + b * c2,
        a * b2 + b * d2,
        c * a2 + d * c2,
        c * b2 + d * d2,
        e * a2 + f * c2 + e2,
        e * b2 + f * d2 + f2,
    )


def imagenes_colocadas(contenido: bytes) -> list[tuple[float, float, float, float]]:
    """Donde y de que tamano quedo cada imagen **en la pagina**: `(x, y, ancho, alto)` en puntos.

    ## Por que hay que seguir la pila de estado grafico y no basta un `grep`

    La primera version leia el `cm` que va justo antes del `Do` y se quedaba con su `(e, f)` como
    posicion. **Mentia**, y de la peor manera: daba `x = 0` para una miniatura que esta a 160 mm del
    borde, asi que la comprobacion pasaba en verde **con el defecto puesto**. Se descubrio al
    revertir el arreglo a proposito y ver que la prueba seguia pasando.

    El motivo es que reportlab coloca la celda con un `q` + `cm` de traslacion y **dentro** escala
    la imagen con otro `cm`: la posicion real es la composicion de los dos. Aqui se recorre el flujo
    manteniendo la pila `q`/`Q` y multiplicando las matrices, que es lo que hace un lector de PDF.

    **Las dos piezas del membrete quedan fuera.** El arco de esquina mide 40,7 mm y se dibuja pegado
    al borde derecho **a proposito**: es decoracion que sangra, y `membrete.py` lo tiene escrito.
    """
    from apps.documents.membrete import MEMBRETE

    del_membrete = {round(ancho_mm, 1) for _ruta, ancho_mm, _alto in MEMBRETE.values()}
    # El número tiene que llevar al menos una cifra: en un flujo de PDF hay puntos sueltos dentro
    # de nombres y cadenas, y `[\d.]+` los tomaba por números.
    simbolo = re.compile(r"(-?(?:\d+\.?\d*|\.\d+))|(/[^\s/\[\]<>]+)|\b(q|Q|cm|Do)\b")

    colocadas = []
    for pagina in _flujo(contenido):
        ctm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        pila: list[tuple] = []
        numeros: list[float] = []
        for encontrado in simbolo.finditer(pagina):
            numero, _nombre, operador = encontrado.groups()
            if numero is not None:
                numeros.append(float(numero))
                continue
            if operador == "q":
                pila.append(ctm)
            elif operador == "Q":
                ctm = pila.pop() if pila else ctm
            elif operador == "cm" and len(numeros) >= 6:
                ctm = _por(tuple(numeros[-6:]), ctm)
            elif operador == "Do":
                # El cuadrado unidad transformado por la matriz actual: `a` es el ancho en pagina,
                # `d` el alto, y `(e, f)` la esquina inferior izquierda.
                a, _b, _c, d, e, f = ctm
                if round(abs(a) / MM, 1) not in del_membrete:
                    colocadas.append((e, f, abs(a), abs(d)))
            numeros = []
    return colocadas


@pytest.fixture
def opciones():
    return Opciones()


# ── 1. El escapado: el fallo mas probable de «no entrega» ──────────────────────────────


@pytest.mark.django_db
def test_un_ampersand_sale_tal_cual_y_no_con_un_punto_y_coma(
    proyecto, proyectista, revisor, opciones
):
    """**`A&A Ingeniería` salia impreso como `A&A; Ingeniería`.**

    reportlab intenta leer `&A ` como una entidad XML, se rinde, y deja un `;` que nadie escribio.
    No falla nada: el papel simplemente miente.
    """
    from apps.documents.tests.test_informe import texto_del_pdf

    anotar(proyecto, proyectista, revisor, "Muro de A&A Ingeniería")

    texto = texto_del_pdf(pdf_de(proyecto, opciones))

    assert "A&A Ingeniería" in texto
    assert "A&A;" not in texto, "reportlab dejo un punto y coma que nadie escribio"
    assert "&amp;" not in texto, "escapar no puede acabar imprimiendo la entidad en el papel"


@pytest.mark.django_db
def test_lo_que_va_entre_angulos_no_desaparece_del_papel(proyecto, proyectista, revisor, opciones):
    """**El peor de los dos: el texto se pierde entero y sin rastro.**

    reportlab lee `<ACME>` como una etiqueta que no conoce y la descarta. En el papel queda
    «Cliente  y asociados» — con dos espacios donde estaba el nombre de la empresa.
    """
    from apps.documents.tests.test_informe import texto_del_pdf

    anotar(
        proyecto,
        proyectista,
        revisor,
        "Revisión de Cliente <ACME> y asociados",
        descripcion="Según el detalle <D-12>, la luz libre es < 2,5 m",
    )

    texto = texto_del_pdf(pdf_de(proyecto, opciones))

    assert "<ACME>" in texto, "el nombre de la empresa desaparecio del informe"
    assert "<D-12>" in texto, "la referencia al detalle desaparecio del informe"
    assert "< 2,5 m" in texto


@pytest.mark.django_db
def test_los_cuatro_campos_que_entraban_crudos(proyecto, proyectista, revisor):
    """Titulo, descripcion, resolucion y el hilo de comentarios, a la vez."""
    from apps.documents.tests.test_informe import texto_del_pdf

    una = anotar(
        proyecto,
        proyectista,
        revisor,
        "Choque en el eje C",
        descripcion="El ducto de A&A cruza la viga",
        resolucion="Se resuelve con A&B <según> plano",
    )
    Comentario.objects.create(
        observacion=una, autor=proyectista, texto="Coordinado con M&E, ver detalle <D-12>"
    )

    texto = texto_del_pdf(pdf_de(proyecto, Opciones(comentarios=True)))

    for trozo in ("A&A", "A&B", "<según>", "M&E", "<D-12>"):
        assert trozo in texto, f"«{trozo}» no llego al papel"
    assert "&amp;" not in texto and "&lt;" not in texto


# ── 2. Los milimetros ──────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_una_miniatura_16_9_no_se_sale_de_su_columna(
    proyecto, proyectista, revisor, settings, tmp_path
):
    """**La proporcion que produce el visor, que es la que no existia en ningun fixture.**

    El unico PNG de las pruebas era 8×6 —4:3 justo, el unico caso que cabia por los pelos—. A 18 mm
    de alto, un 16:9 da 32 mm de ancho en una columna de 25.
    """
    from apps.documents import storage

    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    apaisada = png(160, 90)
    extension, sha = storage.validar("captura.png", apaisada)
    clave = storage.clave_para(
        proyecto_codigo=proyecto.codigo, entregable_codigo="x", sha256=sha, extension=extension
    )
    storage.guardar(clave, apaisada)

    anotar(proyecto, proyectista, revisor, "Choque visto desde el visor", instantanea=clave)

    contenido = pdf_de(proyecto, Opciones(miniaturas=True))

    colocadas = imagenes_colocadas(contenido)
    assert colocadas, "no se coloco ninguna imagen: la prueba no esta midiendo nada"

    borde = ANCHO_CARTA - MARGEN_DERECHO
    for x, _y, ancho, _alto in colocadas:
        assert x + ancho <= borde + 0.5, (
            f"una imagen acaba en {(x + ancho) / MM:.1f} mm y el margen derecho esta en "
            f"{borde / MM:.1f} mm: se sale del papel"
        )


@pytest.mark.django_db
def test_nada_se_dibuja_encima_del_bloque_de_contacto(proyecto, proyectista, revisor):
    """**El pie es canvas absoluto y el marco es Platypus: no se hablan.**

    El ascendente del «jej.cl» llega a ~27,6 mm y el `bottomMargin` eran 26,8. Se mide sobre un
    informe de varias paginas, que es cuando la tabla llega abajo del todo.
    """
    from apps.documents.membrete import MARGEN_MM

    for n in range(40):
        anotar(
            proyecto,
            proyectista,
            revisor,
            f"Hallazgo {n}",
            descripcion="Una descripción con cuerpo suficiente para ocupar varias líneas. " * 3,
        )

    contenido = pdf_de(proyecto, Opciones())

    # La rejilla de la tabla se dibuja con `re` (rectángulos). Ninguno puede bajar del margen.
    suelo = MARGEN_MM["abajo"] * MM
    patron = re.compile(r"([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) re")
    for pagina in _flujo(contenido):
        for _x, y, _ancho, alto in patron.findall(pagina):
            y, alto = float(y), float(alto)
            abajo = min(y, y + alto)
            # El arco del membrete se dibuja como imagen, no como `re`; los rectángulos de aquí son
            # la rejilla de la tabla.
            assert abajo >= suelo - 0.5, (
                f"la rejilla baja hasta {abajo / MM:.1f} mm y el pie empieza en "
                f"{suelo / MM:.1f} mm: se cruza con el bloque de contacto"
            )


# ── 3. Que no reviente con un hilo largo ───────────────────────────────────────────────


@pytest.mark.django_db
def test_un_hilo_larguisimo_no_revienta_el_informe(proyecto, proyectista, revisor):
    """**Una fila mas alta que la pagina no se puede partir.**

    `LongTable` parte entre filas, nunca dentro. Con los comentarios pedidos, un hallazgo muy
    discutido mete N parrafos en la misma celda y pasa el alto util del marco.
    """
    una = anotar(proyecto, proyectista, revisor, "El hallazgo que se discutio media obra")
    for n in range(60):
        Comentario.objects.create(
            observacion=una,
            autor=proyectista,
            texto=f"Respuesta {n}: " + "hay que revisar la cota y el paso del ducto. " * 6,
        )

    contenido = pdf_de(proyecto, Opciones(comentarios=True))

    assert contenido.startswith(b"%PDF-")


# ── 4. El pie ──────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_el_pie_dice_de_cuantas_paginas_son(proyecto, proyectista, revisor):
    """**«Página 3» no permite saber si falta una hoja.** Un informe se fotocopia y se grapa."""
    from apps.documents.tests.test_informe import paginas_del_pdf, texto_del_pdf

    for n in range(40):
        anotar(proyecto, proyectista, revisor, f"Hallazgo {n}", descripcion="Cuerpo. " * 30)

    contenido = pdf_de(proyecto, Opciones())
    total = paginas_del_pdf(contenido)
    assert total > 1, "el informe cabe en una pagina: la prueba no mide lo que cree"

    texto = texto_del_pdf(contenido)
    assert f"Página 1 de {total}" in texto
    assert f"Página {total} de {total}" in texto
