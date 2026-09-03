"""La lámina de un plano en PDF: `F7.5`.

**Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** Esto es lo segundo.

**El oráculo es `pypdf`, que es otra implementación** —lee la estructura del archivo, su tamaño de
página y su flujo de contenido— y no la librería con la que se escribe. Comprobar un PDF de
reportlab con reportlab solo diría que es consistente consigo mismo, que es exactamente lo que no se
quiere saber. Es la misma regla que ya usan el informe y el BCF.

Y hay una comprobación que no es de texto: **que la geometría esté de verdad**. Un PDF con el sello,
la escala y ni una línea pasaría cualquier prueba de texto y sería una hoja en blanco con membrete,
así que se cuentan los operadores de trazo del flujo de contenido.
"""

import re
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.lamina import MAXIMO_SEGMENTOS, MAXIMO_TEXTOS, Lamina, pdf_de

# Un rectángulo de 10 × 6 m con su diagonal: cinco segmentos y medidas sabidas de antemano, el
# mismo fixture con el que se comprueba el DXF en el visor.
RECTANGULO = (
    (0.0, 0.0, 10.0, 0.0),
    (10.0, 0.0, 10.0, 6.0),
    (10.0, 6.0, 0.0, 6.0),
    (0.0, 6.0, 0.0, 0.0),
    (0.0, 0.0, 10.0, 6.0),
)


def dar(user, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def leido(contenido: bytes):
    from pypdf import PdfReader

    return PdfReader(BytesIO(contenido))


def texto_del_pdf(contenido: bytes) -> str:
    return "\n".join(p.extract_text() or "" for p in leido(contenido).pages)


def trazos_del_pdf(contenido: bytes) -> int:
    """Cuántos operadores `l` —«lineTo»— hay en el flujo de contenido de la primera página.

    **Es la comprobación que no se puede hacer con texto.** Un PDF con el sello y la escala pero sin
    una línea pasaría cualquier prueba de texto y sería una hoja en blanco con membrete.

    Dos cosas que costó mirar el flujo de verdad para acertar: reportlab escribe la ruta entera
    **en una sola línea** —`n x y m x y l x y m x y l` y después `S`—, así que anclar la búsqueda a
    principio de renglón no encuentra nada; y las cadenas de texto van entre paréntesis en el mismo
    flujo, así que hay que quitarlas antes o una `l` dentro de «Planta» contaría como un trazo.
    """
    datos = leido(contenido).pages[0].get_contents().get_data()
    sin_cadenas = re.sub(rb"\([^)]*\)", b"()", datos)
    return len(re.findall(rb"(?<![A-Za-z])l(?![A-Za-z])", sin_cadenas))


# --- Que sea un PDF, con su sello y su dibujo ----------------------------------------


def test_la_lamina_es_un_pdf_en_carta_con_el_sello_de_la_casa():
    lamina = Lamina(titulo="716-LCD · Planta", segmentos=RECTANGULO, textos=())

    contenido = pdf_de(lamina, pedido_por="revisor")

    assert contenido[:5] == b"%PDF-"
    paginas = leido(contenido).pages
    assert len(paginas) == 1

    # **Carta y no A4**, que es lo que declara el formato de la casa: 215,9 × 279,4 mm.
    ancho = float(paginas[0].mediabox.width)
    alto = float(paginas[0].mediabox.height)
    assert ancho == pytest.approx(612, abs=1)
    assert alto == pytest.approx(792, abs=1)

    texto = texto_del_pdf(contenido)
    assert "716-LCD · Planta" in texto
    # El contacto va como texto y se puede copiar: es la razón de que no sea una imagen.
    assert "jej.cl" in texto
    assert "AeroBim" in texto
    assert "lo pidió revisor" in texto


def test_la_geometria_llega_al_papel():
    """**Un PDF con membrete y sin líneas es una hoja en blanco con sello.**"""
    lamina = Lamina(titulo="716-LCD · Planta", segmentos=RECTANGULO, textos=())

    trazos = trazos_del_pdf(pdf_de(lamina))

    # Cinco segmentos, cinco `lineTo`. El sello dibuja una línea más —la del azul claro— y va por
    # otro camino, así que se comprueba «al menos los cinco».
    assert trazos >= len(RECTANGULO)


def test_la_escala_se_escribe_en_el_papel():
    """**Un plano sin escala es un dibujo.** No se redondea a 1:50 ni a 1:100 —eso obligaría a
    recortar o a dejar media hoja vacía— pero la que salió se dice."""
    lamina = Lamina(titulo="716-LCD · Planta", segmentos=RECTANGULO, textos=())

    texto = texto_del_pdf(pdf_de(lamina))

    assert "Escala aproximada 1:" in texto
    assert "5 trazos" in texto


def test_los_textos_del_visor_salen_en_la_lamina():
    """El cuadro de `F10.4` y las cotas de `F7.3` llegan como textos ya situados."""
    lamina = Lamina(
        titulo="716-LCD · Planta",
        segmentos=RECTANGULO,
        textos=((0.5, 7.0, 0.4, "CUADRO DE PILARES"), (5.0, 0.5, 0.3, "10.00 m")),
    )

    texto = texto_del_pdf(pdf_de(lamina))

    assert "CUADRO DE PILARES" in texto
    assert "10.00 m" in texto


def test_el_dibujo_no_se_deforma():
    """**La misma escala en los dos ejes.** Escalar cada uno por su cuenta llenaría más la hoja y
    deformaría el plano, que es lo peor que le puede pasar a un dibujo del que alguien va a medir.

    Se comprueba con un dibujo muy alargado —40 × 1 m—: si se deformara, ocuparía la hoja entera y
    la escala escrita no serviría para medir en ninguno de los dos sentidos.
    """
    alargado = Lamina(
        titulo="716-LCD · Planta",
        segmentos=((0.0, 0.0, 40.0, 0.0), (0.0, 0.0, 0.0, 1.0)),
        textos=(),
    )

    texto = texto_del_pdf(pdf_de(alargado))
    encontrada = re.search(r"Escala aproximada 1:(\d+)", texto)

    assert encontrada is not None
    # El área útil ronda los 155 mm de ancho, así que 40 m caben a algo del orden de 1:260.
    escala = int(encontrada.group(1))
    assert 200 < escala < 350, escala


# --- Lo que llega por la API, validado -----------------------------------------------


def test_un_segmento_con_mala_forma_se_descarta_y_no_revienta():
    """**Una lámina con un segmento menos es utilizable; un 500 no.** Quien manda esto es el propio
    visor, así que un valor raro es un fallo nuestro y no una petición hostil."""
    lamina = Lamina.desde(
        {
            "segmentos": [
                [0, 0, 10, 0],
                ["a", 0, 1, 1],
                [1, 2],
                None,
                {"x": 1},
                [0, 0, 0, 6],
            ],
            "textos": [[1, 1, 0.3, "vale"], [1, 1, 0.3], ["x", 1, 1, "no"]],
        },
        titulo="t",
    )

    assert len(lamina.segmentos) == 2
    assert len(lamina.textos) == 1
    assert lamina.recortada is False


def test_pasado_el_tope_se_recorta_y_se_dice_en_el_papel():
    """**Una lámina que calla lo que dejó fuera hace creer que el plano está completo**, y de ahí
    salen decisiones sobre lo que no se ve."""
    muchos = [[0, 0, 1, 1] for _ in range(MAXIMO_SEGMENTOS + 10)]

    lamina = Lamina.desde({"segmentos": muchos}, titulo="716-LCD · Planta")

    assert len(lamina.segmentos) == MAXIMO_SEGMENTOS
    assert lamina.recortada is True
    assert "salió recortado" in texto_del_pdf(pdf_de(lamina))


def test_el_tope_de_textos_tambien_recorta():
    muchos = [[1, 1, 0.3, f"t{i}"] for i in range(MAXIMO_TEXTOS + 5)]

    lamina = Lamina.desde({"segmentos": [[0, 0, 1, 1]], "textos": muchos}, titulo="t")

    assert len(lamina.textos) == MAXIMO_TEXTOS
    assert lamina.recortada is True


def test_una_lamina_sin_nada_tiene_caja_utilizable():
    """Sin geometría la caja sería un punto y la escala una división por cero."""
    assert Lamina(titulo="t", segmentos=(), textos=()).caja == (0.0, 0.0, 1.0, 1.0)


# --- El endpoint: permisos, acotado y contrato ---------------------------------------


@pytest.mark.django_db
def test_la_lamina_pide_leer_revisiones_y_nada_mas(client, proyecto, proyectista):
    """**Dibujar un plano de lo que ya se puede ver es leer**, y no crea nada en la base."""
    ruta = reverse("documents:lamina-pdf", args=[proyecto.pk])
    cuerpo = {"nombre": "Planta", "segmentos": [[0, 0, 10, 0], [10, 0, 10, 6]]}

    client.force_login(proyectista)
    assert client.post(ruta, cuerpo, content_type="application/json").status_code == 403

    client.force_login(dar(proyectista, "documents.view_revision"))
    respuesta = client.post(ruta, cuerpo, content_type="application/json")

    assert respuesta.status_code == 200
    assert respuesta["Content-Type"] == "application/pdf"
    assert "attachment" in respuesta["Content-Disposition"]
    assert proyecto.codigo in respuesta["Content-Disposition"]


@pytest.mark.django_db
def test_una_obra_de_otra_organizacion_no_se_puede_dibujar(client, proyecto, proyectista):
    """El permiso dice «puede leer revisiones», no «puede leer **estas**»."""
    from apps.core.models import Organizacion
    from apps.projects.models import Proyecto

    ajena = Organizacion.objects.create(nombre="Otra oficina", slug="otra-oficina")
    de_otros = Proyecto.objects.create(organizacion=ajena, codigo="AJENA-01", nombre="Ajena")
    client.force_login(dar(proyectista, "documents.view_revision"))

    respuesta = client.post(
        reverse("documents:lamina-pdf", args=[de_otros.pk]),
        {"nombre": "Planta", "segmentos": [[0, 0, 1, 1]]},
        content_type="application/json",
    )

    assert respuesta.status_code == 404


@pytest.mark.django_db
def test_una_lamina_vacia_se_rechaza_con_su_motivo(client, proyecto, proyectista):
    """**Un PDF con membrete y sin dibujo no es una lámina**, y devolverlo dejaría a alguien
    preguntándose por qué el plano salió en blanco."""
    client.force_login(dar(proyectista, "documents.view_revision"))

    respuesta = client.post(
        reverse("documents:lamina-pdf", args=[proyecto.pk]),
        {"nombre": "Planta", "segmentos": []},
        content_type="application/json",
    )

    assert respuesta.status_code == 400
    assert "error" in respuesta.json()


@pytest.mark.django_db
def test_un_cuerpo_que_no_es_json_no_tumba_la_vista(client, proyecto, proyectista):
    client.force_login(dar(proyectista, "documents.view_revision"))

    respuesta = client.post(
        reverse("documents:lamina-pdf", args=[proyecto.pk]),
        "esto no es json",
        content_type="application/json",
    )

    assert respuesta.status_code == 400
