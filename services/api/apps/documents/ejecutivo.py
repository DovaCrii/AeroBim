"""El informe ejecutivo: **una hoja para decidir**, con el membrete de la casa.

## Por que existe, y en que se diferencia del de coordinacion

El informe de coordinacion contesta *«que hay»*: una tabla con todos los hallazgos, su descripcion,
su hilo y su foto. Es el papel de la reunion tecnica, y con una obra de verdad son seis o siete
folios.

Este contesta otra pregunta, que es la que hace quien no va a esa reunion: **«¿como va la obra y que
tengo que decidir esta semana?»**. Por eso cabe en una hoja, y por eso **no lleva la tabla de
hallazgos**: si hay que leer treinta filas para saber como va la obra, el informe no ha hecho su
trabajo.

## La restriccion que gobierna el modulo: una pagina

No es una aspiracion, es el contrato — y es lo que obliga a **decidir que se queda fuera**. Un
informe ejecutivo que se desborda a una segunda hoja deja de ser ejecutivo: vuelve a ser un listado.

De ahi los topes de `MAXIMO_DISCIPLINAS`, `MAXIMO_VENCIDAS` y `MAXIMO_PERSONAS`, y de ahi que cuando
se recorta **se diga en el papel**. Un resumen que calla lo que dejo fuera hace creer que la obra
esta mas limpia de lo que esta, que es exactamente lo que este papel no puede hacer.

## Por que se dibuja con `canvas` y no con Platypus

El de coordinacion usa flowables porque **no sabe cuantas paginas va a ocupar** y necesita que la
tabla pagine sola. Aqui es al reves: la pagina es una y fija, y lo que hace falta es control exacto
de donde va cada cosa. Con flowables habria que pelearse con el paginador para impedir justo lo que
el paginador existe para hacer.

El membrete es el mismo y sale de `membrete.sellar`, en una sola copia compartida con el informe de
coordinacion y con la lamina de un plano.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from apps.documents.membrete import AZUL, AZUL_CLARO, GRIS, MARGEN_MM, sellar
from apps.documents.models import Observacion

#: Cuantas disciplinas se dibujan. Pasadas estas, el resto se resume en una linea.
MAXIMO_DISCIPLINAS = 8

#: Cuantos vencidos se nombran. **Ocho son los que caben y son los que se leen**: una lista de
#: cuarenta atrasos no se decide, se archiva.
MAXIMO_VENCIDAS = 8

#: Cuantas personas entran en «quien actua esta semana».
MAXIMO_PERSONAS = 6

#: Ventana de «lo cerrado ultimamente».
#:
#: **Se dice «en los ultimos 30 dias» y no «desde el informe anterior»**, y es una diferencia
#: honesta: no se guarda registro de cuando se saco el informe anterior, asi que «desde el anterior»
#: seria una cifra que suena precisa y no lo es. Treinta dias es un dato comprobable.
DIAS_DE_CIERRE = 30


@dataclass(frozen=True)
class Resumen:
    """Lo que la hoja dice, ya calculado. Se separa del dibujo para poder comprobarlo sin un PDF."""

    avance_pct: int
    abiertas: int
    vencidas: int
    cerradas_ultimamente: int
    disciplinas: list
    disciplinas_de_mas: int
    atrasos: list
    atrasos_de_mas: int
    personas: list
    personas_de_mas: int

    @classmethod
    def de(cls, proyecto) -> Resumen:
        from apps.projects import tablero

        hoy = timezone.localdate()
        entregables = list(
            proyecto.entregables.filter(is_active=True).prefetch_related("revisiones")
        )

        abiertas = list(
            proyecto.observaciones.exclude(
                estado__in=(Observacion.CERRADA, Observacion.DESCARTADA)
            ).select_related("responsable")
        )
        # **Lo mas viejo primero**: un atraso de tres meses y uno de ayer no piden lo mismo, y en la
        # lista de la aplicacion salian mezclados porque nada ordenaba por antiguedad.
        vencidas = sorted(
            (una for una in abiertas if una.vence is not None and una.vence < hoy),
            key=lambda una: una.vence,
        )

        barras = tablero.avance_por_disciplina(entregables)

        # Quien actua: cuantas cosas abiertas tiene cada persona a su nombre, de mas a menos.
        cuenta: dict = {}
        for una in abiertas:
            if una.responsable_id is None:
                continue
            cuenta.setdefault(una.responsable, 0)
            cuenta[una.responsable] += 1
        personas = sorted(cuenta.items(), key=lambda par: (-par[1], str(par[0])))

        return cls(
            avance_pct=proyecto.avance_pct,
            abiertas=len(abiertas),
            vencidas=len(vencidas),
            # **Con un instante y no con una fecha suelta.** `updated_at` es `DateTimeField`, y
            # comparar contra un `date` deja a Django avisando de una fecha sin zona horaria y
            # midiendo desde medianoche UTC — que en Chile es el dia anterior.
            cerradas_ultimamente=proyecto.observaciones.filter(
                estado=Observacion.CERRADA,
                updated_at__gte=timezone.now() - timedelta(days=DIAS_DE_CIERRE),
            ).count(),
            disciplinas=barras[:MAXIMO_DISCIPLINAS],
            disciplinas_de_mas=max(0, len(barras) - MAXIMO_DISCIPLINAS),
            atrasos=[(una, (hoy - una.vence).days) for una in vencidas[:MAXIMO_VENCIDAS]],
            atrasos_de_mas=max(0, len(vencidas) - MAXIMO_VENCIDAS),
            personas=personas[:MAXIMO_PERSONAS],
            personas_de_mas=max(0, len(personas) - MAXIMO_PERSONAS),
        )


def _corta(texto: str, largo: int) -> str:
    """Una linea que no cabe se corta aqui y no en el borde del papel, donde no avisa."""
    texto = str(texto or "")
    return texto if len(texto) <= largo else texto[: largo - 1].rstrip() + "…"


def pdf_de(proyecto, *, pedido_por=None) -> bytes:
    """Los bytes de la hoja. Quien llama decide si la manda como descarga o la guarda."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    resumen = Resumen.de(proyecto)
    hoy = timezone.localdate()

    memoria = io.BytesIO()
    ancho_pagina, alto_pagina = letter
    lienzo = canvas.Canvas(memoria, pagesize=letter)
    lienzo.setTitle(f"Resumen ejecutivo {proyecto.codigo}")
    lienzo.setAuthor("J.E.J. Ingeniería · AeroBim")

    izquierda = MARGEN_MM["izquierda"] * mm
    derecha = ancho_pagina - MARGEN_MM["derecha"] * mm
    util = derecha - izquierda
    azul = colors.HexColor(AZUL)
    gris = colors.HexColor(GRIS)

    y = alto_pagina - MARGEN_MM["arriba"] * mm

    # ── El titulo ──────────────────────────────────────────────────────────────────────
    lienzo.setFillColor(azul)
    lienzo.setFont("Helvetica-Bold", 15)
    lienzo.drawString(izquierda, y, f"Resumen ejecutivo · {_corta(proyecto.codigo, 28)}")
    y -= 6 * mm
    lienzo.setFillColor(gris)
    lienzo.setFont("Helvetica", 9)
    linea = _corta(proyecto.nombre, 70)
    # La naturaleza solo se dice cuando **no** es una obra real: lo que hay que ver es la excepcion.
    if getattr(proyecto, "naturaleza", "real") != "real":
        linea = f"{linea}   ({proyecto.get_naturaleza_display().upper()})"
    lienzo.drawString(izquierda, y, linea)
    y -= 10 * mm

    # ── Las cuatro cifras ──────────────────────────────────────────────────────────────
    # **Grandes y sin adorno**: son lo que se mira en tres segundos antes de decidir si hay que
    # leer el resto. El rojo solo aparece si hay algo vencido — un rojo que sale siempre no alerta.
    cifras = [
        (f"{resumen.avance_pct}%", "Avance documental", azul),
        (str(resumen.abiertas), "Hallazgos abiertos", gris),
        (
            str(resumen.vencidas),
            "Vencidos",
            colors.HexColor("#b3261e") if resumen.vencidas else gris,
        ),
        (str(resumen.cerradas_ultimamente), f"Cerrados en {DIAS_DE_CIERRE} días", gris),
    ]
    paso = util / len(cifras)
    for indice, (valor, rotulo, color) in enumerate(cifras):
        x = izquierda + indice * paso
        lienzo.setFillColor(color)
        lienzo.setFont("Helvetica-Bold", 22)
        lienzo.drawString(x, y, valor)
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica", 7.5)
        lienzo.drawString(x, y - 5 * mm, rotulo)
    y -= 14 * mm

    y = _regla(lienzo, izquierda, derecha, y)

    # ── Avance por disciplina ──────────────────────────────────────────────────────────
    y = _titulo(lienzo, izquierda, y, "Avance por disciplina", azul)
    ancho_barra = util - 52 * mm
    for barra in resumen.disciplinas:
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica", 8)
        lienzo.drawString(izquierda, y, _corta(barra.codigo or "Sin disciplina", 16))
        # El carril, y encima el cumplido con el color de la propia disciplina.
        lienzo.setFillColor(colors.HexColor("#e4e9f0"))
        lienzo.rect(izquierda + 26 * mm, y - 0.6 * mm, ancho_barra, 3 * mm, stroke=0, fill=1)
        try:
            relleno = colors.HexColor(barra.color)
        except Exception:  # noqa: BLE001 — un color mal escrito no tumba el papel.
            relleno = azul
        lienzo.setFillColor(relleno)
        lienzo.rect(
            izquierda + 26 * mm,
            y - 0.6 * mm,
            ancho_barra * max(0.0, min(barra.avance_pct, 100.0)) / 100.0,
            3 * mm,
            stroke=0,
            fill=1,
        )
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica-Bold", 8)
        lienzo.drawRightString(derecha, y, f"{barra.avance_pct:g}%")
        y -= 6 * mm
    if not resumen.disciplinas:
        y = _vacio(lienzo, izquierda, y, "Todavía no hay entregables con disciplina.")
    if resumen.disciplinas_de_mas:
        y = _vacio(lienzo, izquierda, y, f"y {resumen.disciplinas_de_mas} disciplinas más")

    y -= 3 * mm
    y = _regla(lienzo, izquierda, derecha, y)

    # ── Lo vencido, lo más viejo primero ───────────────────────────────────────────────
    y = _titulo(lienzo, izquierda, y, "Vencido, y desde cuándo", azul)
    for una, dias in resumen.atrasos:
        lienzo.setFillColor(colors.HexColor("#b3261e"))
        lienzo.setFont("Helvetica-Bold", 8)
        lienzo.drawString(izquierda, y, f"{dias} d")
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica", 8)
        lienzo.drawString(izquierda + 12 * mm, y, _corta(una.titulo, 62))
        lienzo.drawRightString(derecha, y, _corta(una.responsable or "sin dueño", 26))
        y -= 5 * mm
    if not resumen.atrasos:
        y = _vacio(lienzo, izquierda, y, "Nada vencido. La obra va al día.")
    if resumen.atrasos_de_mas:
        y = _vacio(
            lienzo, izquierda, y, f"y {resumen.atrasos_de_mas} vencidos más en la aplicación"
        )

    y -= 3 * mm
    y = _regla(lienzo, izquierda, derecha, y)

    # ── Quién actúa ────────────────────────────────────────────────────────────────────
    y = _titulo(lienzo, izquierda, y, "Quién tiene trabajo por delante", azul)
    for persona, cuantas in resumen.personas:
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica", 8)
        lienzo.drawString(izquierda, y, _corta(persona, 60))
        lienzo.setFont("Helvetica-Bold", 8)
        lienzo.drawRightString(derecha, y, f"{cuantas}")
        y -= 5 * mm
    if not resumen.personas:
        y = _vacio(lienzo, izquierda, y, "Nadie tiene hallazgos abiertos a su nombre.")
    if resumen.personas_de_mas:
        _vacio(lienzo, izquierda, y, f"y {resumen.personas_de_mas} personas más")

    sellar(
        lienzo,
        ancho_pagina=ancho_pagina,
        alto_pagina=alto_pagina,
        titulo=f"{proyecto.codigo} · Resumen ejecutivo",
        fecha=hoy,
        pagina=1,
    )
    if pedido_por:
        lienzo.setFillColor(gris)
        lienzo.setFont("Helvetica", 7)
        lienzo.drawString(izquierda, (MARGEN_MM["abajo"] + 4) * mm, f"Lo pidió {pedido_por}")

    lienzo.showPage()
    lienzo.save()
    return memoria.getvalue()


def _titulo(lienzo, x, y, texto, color):
    from reportlab.lib.units import mm

    lienzo.setFillColor(color)
    lienzo.setFont("Helvetica-Bold", 9)
    lienzo.drawString(x, y, texto.upper())
    return y - 6 * mm


def _regla(lienzo, x0, x1, y):
    from reportlab.lib import colors
    from reportlab.lib.units import mm

    lienzo.setStrokeColor(colors.HexColor(AZUL_CLARO))
    lienzo.setLineWidth(0.6)
    lienzo.line(x0, y, x1, y)
    return y - 7 * mm


def _vacio(lienzo, x, y, texto):
    from reportlab.lib import colors
    from reportlab.lib.units import mm

    lienzo.setFillColor(colors.HexColor(GRIS))
    lienzo.setFont("Helvetica-Oblique", 8)
    lienzo.drawString(x, y, texto)
    return y - 5 * mm
