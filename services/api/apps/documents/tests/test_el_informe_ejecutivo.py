"""**«Crear uno en Claude que sea con la base JEJ pero ejecutivo.»**

El informe de coordinacion contesta *«que hay»*: una tabla con cada hallazgo, su hilo y su foto, y
con una obra de verdad son seis o siete folios. Este contesta la otra pregunta, la de quien no va a
esa reunion: **«¿como va la obra y que decido esta semana?»**.

## Lo que estas pruebas sujetan

**Que cabe en una hoja.** No es una aspiracion, es el contrato: un ejecutivo que se desborda a una
segunda pagina vuelve a ser un listado. Y es lo que obliga a que el modulo **decida que deja
fuera**, en vez de escupirlo todo.

**Que lo que deja fuera lo dice.** Un resumen que calla hace creer que la obra esta mas limpia de lo
que esta — que es justo lo que este papel no puede hacer.

**Que lo vencido sale por antiguedad.** Un atraso de tres meses y uno de ayer no piden lo mismo.

El oraculo vuelve a ser `pypdf`, otra implementacion distinta de la que escribe, y para los
milimetros se reutiliza el recorrido del flujo de `test_el_informe_cabe_en_el_papel.py`.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.documents import ejecutivo
from apps.documents.models import Observacion
from apps.documents.tests.test_el_informe_cabe_en_el_papel import MM
from apps.documents.tests.test_informe import anotar, paginas_del_pdf, texto_del_pdf


def vencida(proyecto, autor, responsable, titulo, dias):
    """Un hallazgo que vencio hace `dias`."""
    return anotar(
        proyecto,
        autor,
        responsable,
        titulo,
        vence=timezone.localdate() - timedelta(days=dias),
    )


def alturas_del_contenido(contenido: bytes) -> list[float]:
    """La `y` de cada trozo de texto **del resumen**, en puntos. El membrete no cuenta.

    ## Por que contar paginas no sirve aqui

    Esto se dibuja con `canvas` y una sola llamada a `showPage`, asi que el PDF tiene una pagina
    **pase lo que pase**: si el contenido se pasa de largo no aparece una segunda hoja — se dibuja
    por debajo del papel y **desaparece sin avisar**. Una asercion `paginas == 1` sobre un canvas no
    puede fallar nunca, o sea que no prueba nada. Lo que si se mide es donde acaba el texto.

    ## Por que el membrete se descuenta

    **El pie de la casa vive por debajo del `bottomMargin` a proposito.** Medido: el bloque de
    contacto ocupa de 12 a 25,6 mm y el numero de pagina va a 14 — y el margen inferior son 26,8.
    Eso no es un desbordamiento, es donde `membrete.py` los pone. El margen acota **el contenido**,
    no el membrete, asi que contarlos haria fallar la prueba siempre y con el papel perfecto.

    Se descuentan por su texto, que es enumerable, y no por su posicion: filtrar «lo que esta abajo»
    seria dar por bueno justo lo que se quiere detectar.
    """
    from io import BytesIO

    from pypdf import PdfReader

    from apps.documents.membrete import CONTACTO

    del_membrete = {linea.strip() for linea in CONTACTO}
    alturas: list[float] = []

    def mirar(texto, _cm, tm, _fuente, _tamano):
        limpio = (texto or "").strip()
        if not limpio or limpio in del_membrete or limpio.startswith("Página "):
            return
        # La franja del documento y su fecha, arriba a la derecha: también son del membrete.
        if "Resumen ejecutivo" in limpio or _parece_una_fecha(limpio):
            return
        alturas.append(tm[5])

    for pagina in PdfReader(BytesIO(contenido)).pages:
        pagina.extract_text(visitor_text=mirar)
    return alturas


def _parece_una_fecha(texto: str) -> bool:
    import re as _re

    return bool(_re.fullmatch(r"\d{4}-\d{2}-\d{2}", texto))


@pytest.mark.django_db
def test_es_un_pdf_y_cabe_en_una_hoja(proyecto, proyectista, revisor):
    """**El contrato del modulo**, con obra vacia: el caso mas facil de romper por descuido."""
    contenido = ejecutivo.pdf_de(proyecto)

    assert contenido.startswith(b"%PDF-")
    assert paginas_del_pdf(contenido) == 1


@pytest.mark.django_db
def test_sigue_cabiendo_en_una_hoja_con_una_obra_cargada(
    proyecto, proyectista, revisor, disciplina
):
    """**Cuarenta vencidos, veinte disciplinas y quince personas: una sola hoja.**

    Es la prueba que obliga a que existan los topes. Sin ellos esto son tres paginas, y entonces el
    papel deja de ser lo que dice ser.
    """
    from django.contrib.auth import get_user_model

    from apps.core.models import Membresia
    from apps.documents.models import Entregable
    from apps.projects.models import Disciplina

    for n in range(20):
        otra = Disciplina.objects.create(
            proyecto=proyecto, codigo=f"D{n:02d}", nombre=f"Disciplina {n}"
        )
        Entregable.objects.create(
            organizacion=proyecto.organizacion,
            proyecto=proyecto,
            disciplina=otra,
            codigo=f"E-{n:03d}",
            titulo=f"Entregable {n}",
            responsable=proyectista,
        )

    gente = []
    for n in range(15):
        persona = get_user_model().objects.create_user(
            username=f"persona{n}", password="x" * 14, first_name=f"Nombre{n}", last_name="Apellido"
        )
        Membresia.objects.create(organizacion=proyecto.organizacion, usuario=persona)
        gente.append(persona)

    for n in range(40):
        vencida(
            proyecto,
            proyectista,
            gente[n % len(gente)],
            f"Hallazgo atrasado numero {n} con un titulo bastante largo para forzar el recorte",
            dias=n + 1,
        )

    contenido = ejecutivo.pdf_de(proyecto, pedido_por="cmunoz")

    assert paginas_del_pdf(contenido) == 1

    # **Y esta es la que de verdad puede fallar.** Sin los topes, el contenido sigue bajando y se
    # dibuja por debajo del papel: el PDF sigue teniendo una pagina y la informacion desaparece.
    from apps.documents.membrete import MARGEN_MM

    suelo = MARGEN_MM["abajo"] * MM
    mas_bajo = min(alturas_del_contenido(contenido))
    assert mas_bajo >= suelo - 0.5, (
        f"hay texto a {mas_bajo / MM:.1f} mm y el papel util acaba en {suelo / MM:.1f} mm: "
        "el resumen se sale de la hoja y lo que sobra no se ve"
    )


@pytest.mark.django_db
def test_lo_que_deja_fuera_lo_dice(proyecto, proyectista, revisor):
    """**Callar lo recortado es mentir sobre el estado de la obra.**"""
    for n in range(ejecutivo.MAXIMO_VENCIDAS + 5):
        vencida(proyecto, proyectista, revisor, f"Atraso {n}", dias=n + 1)

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "5 vencidos más" in texto


@pytest.mark.django_db
def test_lo_vencido_sale_lo_mas_viejo_primero(proyecto, proyectista, revisor):
    """**Un atraso de tres meses y uno de ayer no piden lo mismo.**

    En la aplicacion salian mezclados: `pendientes_por_tramo` concatena dos consultas con ordenes
    distintos y dentro de «vencido» no ordena por antiguedad.
    """
    vencida(proyecto, proyectista, revisor, "El de ayer", dias=1)
    vencida(proyecto, proyectista, revisor, "El de hace tres meses", dias=92)
    vencida(proyecto, proyectista, revisor, "El de la semana pasada", dias=8)

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert texto.index("92 d") < texto.index("8 d") < texto.index("1 d")


@pytest.mark.django_db
def test_dice_cuantos_dias_lleva_cada_atraso(proyecto, proyectista, revisor):
    """La cifra que no existe en ninguna pantalla: **cuanto lleva**, no solo que esta en rojo."""
    vencida(proyecto, proyectista, revisor, "El ducto del eje C", dias=37)

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "37 d" in texto
    assert "El ducto del eje C" in texto


@pytest.mark.django_db
def test_las_cuatro_cifras_y_el_membrete(proyecto, proyectista, revisor, entregable, revision):
    """La cabecera de decision, y que la hoja lleve el membrete de la casa."""
    from apps.documents.models import Idoneidad

    revision.idoneidad = Idoneidad.A
    revision.save()
    anotar(proyecto, proyectista, revisor, "Uno abierto")

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "Resumen ejecutivo" in texto
    assert "Avance documental" in texto
    assert "Hallazgos abiertos" in texto
    assert "Vencidos" in texto
    # El bloque de contacto del membrete, que va como texto y no como imagen: es lo que hace que la
    # hoja se reconozca como de la casa.
    assert "jej.cl" in texto


@pytest.mark.django_db
def test_una_obra_de_prueba_se_marca_en_el_papel(proyecto, proyectista, revisor):
    """**Que no se decida sobre una obra de ensayo creyendo que es real.**"""
    from apps.projects.models import Proyecto

    proyecto.naturaleza = Proyecto.PRUEBA
    proyecto.save(update_fields=["naturaleza"])

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "PRUEBA" in texto


@pytest.mark.django_db
def test_una_obra_real_no_lleva_esa_marca(proyecto, proyectista, revisor):
    """La excepcion se dibuja; la norma no. Una etiqueta que sale siempre deja de leerse."""
    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "OBRA REAL" not in texto.upper()


@pytest.mark.django_db
def test_sin_nada_vencido_lo_dice_en_vez_de_dejar_un_hueco(proyecto, proyectista, revisor):
    """**Un hueco donde va una lista se lee como que no cargo.**"""
    anotar(proyecto, proyectista, revisor, "Abierto pero sin fecha")

    texto = texto_del_pdf(ejecutivo.pdf_de(proyecto))

    assert "Nada vencido" in texto


@pytest.mark.django_db
def test_nada_se_sale_de_los_margenes(proyecto, proyectista, revisor, disciplina):
    """**Mide milimetros, no cadenas.** Las barras se dibujan a mano, sin marco que las coloque."""
    import re

    from apps.documents.membrete import MARGEN_MM
    from apps.documents.tests.test_el_informe_cabe_en_el_papel import _flujo

    for n in range(6):
        vencida(proyecto, proyectista, revisor, f"Atraso {n}", dias=n + 3)

    contenido = ejecutivo.pdf_de(proyecto)

    izquierda = MARGEN_MM["izquierda"] * MM
    derecha = (215.9 - MARGEN_MM["derecha"]) * MM
    suelo = MARGEN_MM["abajo"] * MM

    patron = re.compile(r"(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re")
    for pagina in _flujo(contenido):
        for x, y, ancho, alto in patron.findall(pagina):
            x, y, ancho, alto = float(x), float(y), float(ancho), float(alto)
            assert x >= izquierda - 0.5, f"un rectángulo empieza en {x / MM:.1f} mm"
            assert x + ancho <= derecha + 0.5, (
                f"un rectángulo acaba en {(x + ancho) / MM:.1f} mm y el papel útil termina en "
                f"{derecha / MM:.1f} mm"
            )
            assert min(y, y + alto) >= suelo - 0.5, (
                f"un rectángulo baja hasta {min(y, y + alto) / MM:.1f} mm y el pie empieza en "
                f"{suelo / MM:.1f} mm"
            )


@pytest.mark.django_db
def test_se_pide_desde_la_pantalla_y_pide_el_mismo_permiso_que_el_otro(
    client, proyectista, proyecto
):
    """**Un informe es leer**, así que va con `view_observacion` y con el mismo acotado."""
    from django.urls import reverse

    from apps.documents.tests.test_informe import dar

    ruta = reverse("documents:resumen-ejecutivo", args=[proyecto.pk])

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_observacion"))
    respuesta = client.get(ruta)
    assert respuesta.status_code == 200
    assert respuesta["Content-Type"] == "application/pdf"
    assert "resumen" in respuesta["Content-Disposition"]


@pytest.mark.django_db
def test_no_se_saca_el_resumen_de_una_obra_ajena(client, proyectista):
    """La misma invariante de siempre: una empresa no alcanza lo de otra."""
    from django.urls import reverse

    from apps.core.models import Organizacion
    from apps.documents.tests.test_informe import dar
    from apps.projects.models import Proyecto

    ajena = Proyecto.objects.create(
        organizacion=Organizacion.objects.create(nombre="Otra", slug="otra"),
        codigo="999-XXX",
        nombre="Obra de otro cliente",
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.get(reverse("documents:resumen-ejecutivo", args=[ajena.pk])).status_code == 404


@pytest.mark.django_db
def test_el_resumen_se_puede_comprobar_sin_pasar_por_el_pdf(proyecto, proyectista, revisor):
    """**Las cifras se separan del dibujo a proposito.**

    Comprobar un numero leyendo el texto de un PDF es caro y fragil; que `Resumen` sea un dato
    permite mirar la aritmetica sin componer una pagina.
    """
    vencida(proyecto, proyectista, revisor, "Vencido", dias=5)
    anotar(proyecto, proyectista, revisor, "Abierto sin fecha")
    cerrada = anotar(proyecto, proyectista, revisor, "Ya resuelto")
    cerrada.estado = Observacion.CERRADA
    cerrada.save()

    resumen = ejecutivo.Resumen.de(proyecto)

    assert resumen.abiertas == 2
    assert resumen.vencidas == 1
    assert resumen.cerradas_ultimamente == 1
    assert resumen.atrasos[0][1] == 5
