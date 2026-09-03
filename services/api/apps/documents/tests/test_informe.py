"""El informe de coordinación imprimible: `F10.3`.

**Es la primera salida en papel del producto.** Hasta ahora lo único que salía era el BCF, y un BCF
no se lleva a una reunión de obra: se abre en otro software.

Lo que se prueba: que el PDF **sea un PDF de verdad** y no bytes con buena intención, que lo que se
elige imprimir se respete, que las cifras del encabezado cuenten **lo que hay en el informe** y no
lo que hay en la obra, y el contrato de permisos: un informe es leer.

**El oráculo del PDF es `pypdf`, que es otra implementación** —lee la estructura del archivo y
extrae el texto— y no la librería con la que se escribe. Comprobar un PDF de reportlab con reportlab
solo diría que es consistente consigo mismo, que es exactamente lo que no se quiere saber. Es la
misma regla que ya usa el BCF con `bcf-client`.
"""

import zlib
from datetime import timedelta
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.core.models import Organizacion
from apps.documents.informe import MAXIMO_FILAS, Opciones, csv_de, hallazgos, pdf_de
from apps.documents.models import Comentario, Observacion
from apps.projects.models import Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def png(ancho: int = 8, alto: int = 6) -> bytes:
    """Un PNG válido escrito a mano, mismo criterio que el resto de las pruebas."""

    def trozo(etiqueta: bytes, datos: bytes) -> bytes:
        cuerpo = etiqueta + datos
        return len(datos).to_bytes(4, "big") + cuerpo + zlib.crc32(cuerpo).to_bytes(4, "big")

    cabecera = ancho.to_bytes(4, "big") + alto.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    crudo = b"".join(b"\x00" + b"\x9b\x5d\xe5" * ancho for _ in range(alto))
    return (
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", cabecera)
        + trozo(b"IDAT", zlib.compress(crudo))
        + trozo(b"IEND", b"")
    )


def anotar(proyecto, autor, responsable, titulo, **extra):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        prioridad=extra.pop("prioridad", Observacion.MEDIA),
        ifc_guid=extra.pop("ifc_guid", GUID),
        **extra,
    )


def texto_del_pdf(contenido: bytes) -> str:
    """El texto del PDF, leído con `pypdf`. Ver el docstring del módulo: el oráculo va aparte."""
    from pypdf import PdfReader

    lector = PdfReader(BytesIO(contenido))
    return "\n".join(pagina.extract_text() or "" for pagina in lector.pages)


def paginas_del_pdf(contenido: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(BytesIO(contenido)).pages)


# --- Que sea un PDF, y que lo lea otra implementación --------------------------------


@pytest.mark.django_db
def test_el_pdf_es_un_pdf_y_trae_la_obra_y_el_hallazgo(proyecto, revisor, proyectista):
    anotar(proyecto, revisor, proyectista, "El pilar choca con el conducto")

    contenido = pdf_de(proyecto, Opciones(), pedido_por="revisor")

    assert contenido[:5] == b"%PDF-"
    assert paginas_del_pdf(contenido) >= 1
    texto = texto_del_pdf(contenido)
    assert proyecto.codigo in texto
    assert "El pilar choca con el conducto" in texto
    # El pie dice de qué obra es: una hoja suelta se fotocopia y se queda en una carpeta.
    assert "AeroBim" in texto


@pytest.mark.django_db
def test_una_lista_larga_salta_de_pagina_con_su_cabecera(proyecto, revisor, proyectista):
    """**Es lo que permite leer la página siete sin volver a la primera.**"""
    for i in range(60):
        anotar(proyecto, revisor, proyectista, f"Hallazgo número {i} de la corrida")

    contenido = pdf_de(proyecto, Opciones())

    assert paginas_del_pdf(contenido) > 1
    from pypdf import PdfReader

    paginas = [p.extract_text() or "" for p in PdfReader(BytesIO(contenido)).pages]
    # La cabecera de la tabla se repite: aparece en la primera y en la última.
    assert "Responsable" in paginas[0]
    assert "Responsable" in paginas[-1]


# --- Que se respete lo que se eligió imprimir ---------------------------------------


@pytest.mark.django_db
def test_por_defecto_solo_lo_abierto(proyecto, revisor, proyectista):
    anotar(proyecto, revisor, proyectista, "Sigue abierta")
    cerrada = anotar(proyecto, revisor, proyectista, "Ya se resolvio")
    cerrada.cerrar(revisor, "Se corrigio el trazado.")

    texto = texto_del_pdf(pdf_de(proyecto, Opciones()))

    assert "Sigue abierta" in texto
    assert "Ya se resolvio" not in texto


@pytest.mark.django_db
def test_con_todo_entran_las_cerradas_y_su_resolucion(proyecto, revisor, proyectista):
    """El informe de cierre de una etapa necesita lo cerrado **y cómo se cerró**."""
    cerrada = anotar(proyecto, revisor, proyectista, "Ya se resolvio")
    cerrada.cerrar(revisor, "Se bajo la cota del conducto.")

    texto = texto_del_pdf(pdf_de(proyecto, Opciones(estado="todo")))

    assert "Ya se resolvio" in texto
    assert "Se bajo la cota del conducto" in texto


@pytest.mark.django_db
def test_los_comentarios_solo_entran_si_se_piden(proyecto, revisor, proyectista):
    """**Es la respuesta del usuario a «qué es una nota»**: los comentarios ya son eso, y lo que
    faltaba era elegir si van al papel. Triplican el informe, así que se eligen."""
    una = anotar(proyecto, revisor, proyectista, "Un hallazgo")
    Comentario.objects.create(observacion=una, autor=proyectista, texto="Lo miro el jueves.")

    sin = texto_del_pdf(pdf_de(proyecto, Opciones(comentarios=False)))
    con = texto_del_pdf(pdf_de(proyecto, Opciones(comentarios=True)))

    assert "Lo miro el jueves" not in sin
    assert "Lo miro el jueves" in con


@pytest.mark.django_db
def test_solo_lo_mio_es_lo_que_me_toca_o_lo_que_abri(proyecto, revisor, proyectista):
    anotar(proyecto, revisor, proyectista, "Me toca a mi")
    anotar(proyecto, proyectista, revisor, "La abri yo")
    anotar(proyecto, revisor, revisor, "Ni mia ni de nadie mio")

    filas = hallazgos(proyecto, Opciones(solo_de=proyectista))

    titulos = {una.titulo for una in filas}
    assert titulos == {"Me toca a mi", "La abri yo"}


@pytest.mark.django_db
def test_el_orden_es_estable_entre_dos_informes_del_mismo_dia(proyecto, revisor, proyectista):
    """**Sin un segundo criterio de orden, dos informes del mismo día no coinciden**, y eso es lo
    que hace que nadie se fíe de un papel."""
    for i in range(12):
        anotar(proyecto, revisor, proyectista, f"Mismo peso {i}", prioridad=Observacion.MEDIA)

    primero = [una.pk for una in hallazgos(proyecto, Opciones())]
    segundo = [una.pk for una in hallazgos(proyecto, Opciones())]

    assert primero == segundo


@pytest.mark.django_db
def test_ordenar_por_responsable_agrupa_a_cada_uno(proyecto, revisor, proyectista):
    anotar(proyecto, revisor, proyectista, "De proyectista A")
    anotar(proyecto, revisor, revisor, "De revisor")
    anotar(proyecto, revisor, proyectista, "De proyectista B")

    nombres = [str(una.responsable) for una in hallazgos(proyecto, Opciones(orden="responsable"))]

    # Los del mismo responsable quedan juntos, que es lo que sirve para repartir.
    assert nombres == sorted(nombres)


# --- Las cifras cuentan el informe, no la obra --------------------------------------


@pytest.mark.django_db
def test_el_encabezado_dice_de_que_informe_habla(proyecto, revisor, proyectista):
    """**Un informe filtrado que presume de ser el total es peor que no tener informe.**"""
    anotar(
        proyecto,
        revisor,
        proyectista,
        "Alta y vencida",
        prioridad=Observacion.ALTA,
        vence=timezone.localdate() - timedelta(days=3),
    )
    anotar(proyecto, revisor, proyectista, "Media normal")
    cerrada = anotar(proyecto, revisor, proyectista, "Cerrada")
    cerrada.cerrar(revisor, "Listo.")

    texto = texto_del_pdf(pdf_de(proyecto, Opciones()))

    # Dos abiertas, no tres: la cerrada no está en este informe y por eso no se cuenta.
    assert "2 hallazgos abiertos" in texto
    assert "1 de prioridad alta" in texto
    assert "1 vencidos" in texto


@pytest.mark.django_db
def test_un_informe_vacio_se_emite_y_lo_dice(proyecto):
    """Una descarga que falla no es una respuesta; «no hay nada con este filtro» sí."""
    contenido = pdf_de(proyecto, Opciones())

    assert contenido[:5] == b"%PDF-"
    assert "No hay ning" in texto_del_pdf(contenido)


@pytest.mark.django_db
def test_el_tope_se_dice_en_el_papel(proyecto, revisor, proyectista, settings):
    """**Un informe que calla lo que dejó fuera hace creer que la obra está más limpia.**"""
    import apps.documents.informe as modulo

    monkeypatched = 3
    original = modulo.MAXIMO_FILAS
    modulo.MAXIMO_FILAS = monkeypatched
    try:
        for i in range(6):
            anotar(proyecto, revisor, proyectista, f"Hallazgo {i}")
        texto = texto_del_pdf(pdf_de(proyecto, Opciones()))
    finally:
        modulo.MAXIMO_FILAS = original

    assert "y hay m" in texto  # «…y hay más»
    assert "CSV" in texto


# --- La foto, que no puede tumbar el informe ----------------------------------------


@pytest.mark.django_db
def test_la_miniatura_entra_y_una_clave_rota_no_revienta(
    proyecto, revisor, proyectista, settings, tmp_path
):
    """La imagen vive en el disco del operador y la fila solo guarda su clave: un montaje mal
    puesto la deja apuntando a nada, y el hallazgo tiene que salir igual."""
    from apps.documents import storage

    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    extension, sha = storage.validar("captura.png", png())
    clave = storage.clave_para(
        proyecto_codigo=proyecto.codigo, entregable_codigo="x", sha256=sha, extension=extension
    )
    storage.guardar(clave, png())

    anotar(proyecto, revisor, proyectista, "Con foto", instantanea=clave)
    anotar(proyecto, revisor, proyectista, "Con la foto perdida", instantanea="no/existe.png")

    contenido = pdf_de(proyecto, Opciones(miniaturas=True))

    texto = texto_del_pdf(contenido)
    assert "Con foto" in texto
    assert "Con la foto perdida" in texto


# --- El CSV, que es la mitad editable ------------------------------------------------


@pytest.mark.django_db
def test_el_csv_abre_en_una_hoja_de_calculo_castellana(proyecto, revisor, proyectista):
    """**Es lo que resuelve «que sea editable» sin poner LibreOffice en el servidor.**

    Con `;` porque es lo que espera un Excel en configuración regional castellana, y con BOM porque
    sin él las tildes salen partidas al abrirlo con doble clic.
    """
    anotar(proyecto, revisor, proyectista, "Sección con tildes y ñ")

    salida = csv_de(proyecto, Opciones())

    assert salida.startswith("﻿")
    assert "Prioridad;Estado;Sobre;Título" in salida
    assert "Sección con tildes y ñ" in salida


# --- El contrato de permisos y el alcance -------------------------------------------


@pytest.mark.django_db
def test_el_informe_pide_ver_observaciones(client, proyecto, proyectista, revisor):
    """**Un informe es leer**: se lleva lo que quien lo pide ya puede ver, ni un hallazgo más."""
    anotar(proyecto, revisor, proyectista, "Un hallazgo")
    ruta = reverse("documents:informe-coordinacion", args=[proyecto.pk])

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_observacion"))
    respuesta = client.get(ruta)
    assert respuesta.status_code == 200
    assert respuesta["Content-Type"] == "application/pdf"
    assert proyecto.codigo in respuesta["Content-Disposition"]


@pytest.mark.django_db
def test_el_csv_sale_por_la_misma_puerta(client, proyecto, proyectista, revisor):
    anotar(proyecto, revisor, proyectista, "Un hallazgo")
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(
        reverse("documents:informe-coordinacion", args=[proyecto.pk]), {"formato": "csv"}
    )

    assert respuesta.status_code == 200
    assert respuesta["Content-Type"].startswith("text/csv")
    assert respuesta["Content-Disposition"].endswith('.csv"')


@pytest.mark.django_db
def test_no_se_saca_el_informe_de_la_obra_de_otra_organizacion(client, proyectista):
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    suyo = Proyecto.objects.create(organizacion=ajena, codigo="999-XXX", nombre="Obra de otro")

    client.force_login(dar(proyectista, "documents.view_observacion"))

    assert client.get(reverse("documents:informe-coordinacion", args=[suyo.pk])).status_code == 404


@pytest.mark.django_db
def test_un_parametro_con_mala_forma_cae_al_de_por_defecto(client, proyecto, proyectista, revisor):
    """Quien pide el informe no escribió ese parámetro a mano: un 400 en una descarga no dice nada
    útil, así que se cae al valor de siempre en silencio."""
    anotar(proyecto, revisor, proyectista, "Un hallazgo")
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(
        reverse("documents:informe-coordinacion", args=[proyecto.pk]),
        {"estado": "loquesea", "orden": "por-color"},
    )

    assert respuesta.status_code == 200
    assert Opciones.desde({"estado": "loquesea", "orden": "por-color"}).estado == "abiertas"
    assert Opciones.desde({}).orden == "prioridad"


# --- El membrete de la casa ----------------------------------------------------------


@pytest.mark.django_db
def test_el_informe_sale_en_carta_y_no_en_a4(proyecto, revisor, proyectista):
    """**Lo dice el formato de la casa**: `Formato Carta 2023 Nuevo Logo.docx` declara
    215,9 × 279,4 mm. El informe estaba en A4, que es 210 × 297: más estrecho y más alto."""
    from pypdf import PdfReader

    anotar(proyecto, revisor, proyectista, "Un hallazgo")

    caja = PdfReader(BytesIO(pdf_de(proyecto, Opciones()))).pages[0].mediabox
    ancho_mm = float(caja.width) / 72 * 25.4
    alto_mm = float(caja.height) / 72 * 25.4

    assert round(ancho_mm, 1) == 215.9
    assert round(alto_mm, 1) == 279.4


@pytest.mark.django_db
def test_el_membrete_va_en_todas_las_paginas(proyecto, revisor, proyectista):
    """Una hoja suelta de la página siete también tiene que decir de quién es."""
    from pypdf import PdfReader

    for i in range(60):
        anotar(proyecto, revisor, proyectista, f"Hallazgo {i} de la corrida de hoy")

    lector = PdfReader(BytesIO(pdf_de(proyecto, Opciones())))

    assert len(lector.pages) > 1
    for numero, pagina in enumerate(lector.pages, start=1):
        texto = pagina.extract_text() or ""
        assert proyecto.codigo in texto, f"la página {numero} no dice de qué obra es"
        assert "jej.cl" in texto, f"la página {numero} va sin el pie de la casa"
        # El logotipo y el arco son imágenes, y van en cada página.
        assert len(pagina.images) >= 2


@pytest.mark.django_db
def test_el_contacto_va_como_texto_y_se_puede_copiar(proyecto, revisor, proyectista):
    """**Va compuesto y no pegado como imagen**, por tres razones: sale nítido a cualquier
    resolución, se puede seleccionar del PDF —que es lo que hace quien quiere el teléfono— y el EMF
    original venía recortado por la derecha, así que «jej.cl» perdía la última letra."""
    anotar(proyecto, revisor, proyectista, "Un hallazgo")

    texto = texto_del_pdf(pdf_de(proyecto, Opciones()))

    assert "jej.cl" in texto
    assert "jej@jej.cl" in texto
    assert "+56 2 2722 5000" in texto
    assert "Avda. Apoquindo 2930" in texto


def test_las_piezas_del_membrete_estan_donde_se_las_busca():
    """**Se buscan con el buscador de estáticos**, que es lo que hace que funcione igual en
    desarrollo y con `collectstatic` hecho."""
    from django.contrib.staticfiles import finders

    # Las piezas viven en `membrete.py` desde que la lámina de un plano —`F7.5`— necesitó el mismo
    # membrete: con una copia en cada salida, la segunda se queda atrás en el primer cambio.
    from apps.documents.membrete import MEMBRETE

    for clave, (ruta, ancho, alto) in MEMBRETE.items():
        assert finders.find(ruta), f"falta la pieza «{clave}» del membrete: {ruta}"
        assert ancho > 0 and alto > 0


@pytest.mark.django_db
def test_un_membrete_que_falta_no_tumba_el_informe(proyecto, revisor, proyectista, monkeypatch):
    """**Un informe sin logo es utilizable; una descarga que falla no.**"""
    # **Se parchea `membrete.pieza` y no la de `informe`**: el dibujo del membrete se mudó a su
    # propio módulo, y parchear donde ya no está dejaría la prueba pasando sin comprobar nada.
    import apps.documents.membrete as modulo

    anotar(proyecto, revisor, proyectista, "Un hallazgo")
    monkeypatch.setattr(modulo, "pieza", lambda _clave: None)

    contenido = pdf_de(proyecto, Opciones())

    assert contenido[:5] == b"%PDF-"
    texto = texto_del_pdf(contenido)
    # Sin las imágenes, pero con lo que está compuesto: la obra, el pie y el hallazgo.
    assert proyecto.codigo in texto
    assert "jej.cl" in texto
    assert "Un hallazgo" in texto


def test_el_azul_de_la_casa_se_lee_impreso():
    """El azul del logotipo da **9,45:1** sobre papel blanco y el claro del arco **2,19:1**.

    Por eso el primero titula y el segundo solo dibuja la línea: un texto en el azul claro no se
    lee, y menos fotocopiado.
    """
    from apps.documents.membrete import AZUL, AZUL_CLARO, GRIS

    def ratio(hex_color: str) -> float:
        def canal(v: float) -> float:
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

        n = hex_color.lstrip("#")
        r, g, b = (int(n[i : i + 2], 16) / 255 for i in (0, 2, 4))
        luz = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
        return (1.05) / (luz + 0.05)

    assert ratio(AZUL) > 4.5
    assert ratio(GRIS) > 4.5
    # **El claro no pasa**, y está bien que no pase: por eso no se usa para texto.
    assert ratio(AZUL_CLARO) < 3.0


def test_el_tope_no_es_una_cifra_suelta():
    """Cuatrocientos folios no los lee nadie: el tope existe para que el informe siga siéndolo."""
    assert MAXIMO_FILAS == 400
