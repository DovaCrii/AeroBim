"""El informe de coordinacion, imprimible y **hecho en el servidor**: `F10.3`.

**Es la salida de todo lo anterior, y hasta hoy no existia.** Nueve fases construyen la coordinacion
entera —detectar, agrupar, repartir, descartar, distinguir lo nuevo, exportar e importar BCF— y todo
eso vive dentro de la aplicacion. El unico papel que salia era el BCF, y un BCF **no se lleva a una
reunion de obra ni se archiva en una carpeta**: se abre en otro software.

## Las dos decisiones del usuario, del 2026-09-02

**«El informe la meta es desde el servidor asi buscamos que sea interno.»** Asi que no es la
impresion del navegador: el PDF se arma aca, con control de los saltos de pagina, y no depende de
que quien lo pide tenga configurada su impresora ni de que su navegador respete `@media print`.

**«Con respecto a una nota, comentarios es eso basicamente; poder ir ordenando que imprimir dentro
de la impresion o informe.»** O sea que **la nota que faltaba no era un campo nuevo**: son los
comentarios que ya existen, y lo que faltaba es **elegir que entra en el papel**. De ahi que este
modulo no invente ningun dato y todo lo que hace sea seleccionar, ordenar y componer.

## Que se puede elegir, y por que cada cosa

| Opcion        | Para que sirve de verdad                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| `estado`      | Lo abierto para la reunion; **todo** para el archivo de cierre de una etapa   |
| `orden`       | Por prioridad se ataca; por responsable se reparte; por fecha se persigue     |
| `comentarios` | El hilo es la mitad del valor de un hallazgo, y **triplica el papel**         |
| `miniaturas`  | Quien lo recibe sabe de que se le habla sin abrir el modelo                   |
| `solo_de`     | El informe de una persona, para llevarselo a su parte de la obra              |
| `etiqueta`    | «Todo lo de instalaciones que sigue abierto», que es lo que se pide en la obra |

**Ninguna opcion cambia los numeros.** El encabezado cuenta lo que hay en el informe, no lo que hay
en la obra, y dice cual es cual: un informe filtrado que presuma de ser el total es peor que no
tener informe.

## Por que reportlab y no una conversion de HTML

La comparacion medida esta en `pyproject.toml`, junto a la dependencia. En resumen: dos paquetes,
licencia BSD sin condiciones, y **es el unico candidato que corre en la maquina donde corre el
gate** — con WeasyPrint (necesita GTK del sistema) o con LibreOffice headless (~500 MB y un proceso
externo) el informe solo se generaria en la VM, o sea sin oraculo que lo compruebe.

## El membrete es el de la casa, y **vive en `membrete.py`**

El usuario entrego `Formato Carta 2023 Nuevo Logo.docx` —el formato de carta de J.E.J. Ingenieria—
para que el informe salga con el, y **todo lo que hay abajo se leyo de ese archivo**, no se estimo.

Las piezas y la funcion que las dibuja se mudaron a `apps/documents/membrete.py` cuando la lamina de
un plano —`F7.5`— empezo a necesitar el mismo membrete: con una copia en cada salida, la segunda se
queda atras en el primer cambio y el producto manda dos papeles distintos con el mismo nombre. La
tabla de lo medido se queda aqui porque es donde se midio:

| Lo que dice el formato | Valor            | Consecuencia                                     |
| ---------------------- | ---------------- | ------------------------------------------------ |
| Tamaño de pagina       | 215,9 × 279,4 mm | Es **Carta**, no A4. El informe estaba en A4      |
| Margenes               | 52,4 / 30 / 25 / 30 mm | El de arriba es grande porque ahi va el logo |
| Pie                    | a 26,8 mm        | Debajo van el contacto y el arco de esquina      |
| Tipografia             | Helvetica        | Que reportlab trae de serie, sin incrustar nada  |
| Azul del logotipo      | `#1F428D`        | **9,45:1** sobre papel blanco: sirve para texto  |
| Azul claro del arco    | `#68B8E5`        | **2,19:1**: decoracion y **nunca** texto         |
| Gris del contacto      | `#585756`        | 7,21:1                                           |

**Los tres graficos venian en EMF**, que es un formato vectorial de Windows que reportlab no lee.
Los dos que son dibujo —el logotipo y el arco de la esquina— se convirtieron a PNG a cuatro veces su
tamaño de colocacion y viven en `static/img/membrete/`. Queda dicho de donde salieron para que nadie
los redibuje a mano.

**Y el tercero, el bloque de contacto, se compone como texto y no como imagen**, que es mejor por
tres cosas y no por una: sale **nitido a cualquier resolucion** —una imagen a 300 ppp impresa a 600
se ve blanda—, **se puede seleccionar y copiar** del PDF, que es lo que hace alguien que quiere el
telefono, y ademas **el EMF venia recortado por la derecha**: al convertirlo, «jej.cl» y
«jej@jej.cl» perdian la ultima letra, porque el marco del metarchivo es mas estrecho que su
contenido. Con texto ese problema no existe.

**Y el membrete que falta no tumba el informe.** Se busca con el buscador de estaticos de Django
—asi funciona igual en desarrollo y con `collectstatic` hecho— y si no aparece, el informe sale sin
el. Un informe sin logo es utilizable; una descarga que falla no.
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, replace
from datetime import date

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.html import escape

from apps.documents.membrete import AZUL, GRIS, MARGEN_MM, sellar
from apps.documents.models import Observacion

logger = logging.getLogger("aerobim.informe")

#: Los ordenes que se ofrecen, y el criterio de cada uno. La clave es lo que llega por la URL.
#:
#: **`orden_prioridad` primero y `created_at` como desempate en los tres**: sin un segundo criterio,
#: dos hallazgos de la misma prioridad salen en el orden que le apetezca a la base de datos, y
#: entonces **dos informes del mismo dia no coinciden** — que es exactamente lo que hace que nadie
#: se fie de un papel.
#:
#: **Y no se ordena por el campo `prioridad`, que era un defecto de verdad**: los valores guardados
#: son `alta`, `media` y `baja` —palabras—, asi que `ORDER BY prioridad` devuelve **alta, baja,
#: media** y colaba lo de prioridad baja en medio del informe. No se noto porque la obra de
#: desarrollo no tenia ni un hallazgo de prioridad baja. El peso vive en `apps/documents/orden.py`,
#: una sola vez, y lo usan este informe y la lista de la pantalla: con una copia en cada sitio se
#: llega a una pantalla que ordena de una forma y un PDF de la misma consulta que ordena de otra.
ORDENES = {
    "prioridad": ("orden_prioridad", "vence", "created_at"),
    "responsable": ("responsable__username", "orden_prioridad", "created_at"),
    "vencimiento": ("vence", "orden_prioridad", "created_at"),
    "antiguedad": ("created_at", "orden_prioridad"),
}

#: Que estados entran. `abiertas` es lo de la reunion; `todo` es el archivo de cierre de etapa.
ESTADOS = {
    "abiertas": (Observacion.ABIERTA, Observacion.RESPONDIDA),
    "cerradas": (Observacion.CERRADA, Observacion.DESCARTADA),
    "todo": None,
}

#: Tope de hallazgos por informe.
#:
#: **Doscientos folios ya no los lee nadie**, y el limite existe para que el informe siga siendo un
#: informe: pasado eso lo que se quiere es la salida CSV, que se filtra en una hoja de calculo. Se
#: dice en el propio papel cuando se recorta, porque un informe que calla lo que dejo fuera hace
#: creer que la obra esta mas limpia de lo que esta.
MAXIMO_FILAS = 400

#: Tope de comentarios que entran en la celda de un hallazgo.
#:
#: **Una fila de tabla no se puede partir entre dos paginas.** `LongTable` corta *entre* filas,
#: nunca dentro de una, asi que un hallazgo muy discutido —sesenta respuestas en la misma celda—
#: crece mas que el alto util del marco y reportlab ya no puede colocarlo en ninguna pagina: el
#: informe entero se cae.
#:
#: Doce respuestas son las que caben con holgura en media hoja Carta y, sobre todo, son las que
#: alguien lee en una reunion. El resto se dice en el papel —«y N respuestas mas»— porque un hilo
#: cortado en silencio hace creer que la discusion termino ahi.
MAXIMO_COMENTARIOS_POR_FILA = 12

#: Cuanto de cada respuesta entra en la celda.
#:
#: Doce respuestas de dos mil caracteres siguen sin caber, asi que el tope por numero **no basta
#: por si solo**: lo que hace crecer la fila son las lineas, no las respuestas. Se corta como ya lo
#: hace el aviso por correo del hilo, y por el mismo motivo: el papel lleva el hilo para poder
#: seguir la conversacion, no para sustituir a la aplicacion.
LARGO_DE_COMENTARIO = 280


@dataclass(frozen=True)
class Opciones:
    """Que imprimir. Es la respuesta a «poder ir ordenando que imprimir dentro del informe»."""

    estado: str = "abiertas"
    orden: str = "prioridad"
    comentarios: bool = False
    miniaturas: bool = True
    #: `None` = de todos. Con un usuario, el informe de esa persona.
    #:
    #: **La anotacion de tipo no es decorativa**: sin ella `solo_de` no es un campo del dataclass,
    #: es un atributo de clase, y `Opciones(solo_de=alguien)` revienta con un `TypeError`. Lo
    #: encontraron las pruebas.
    solo_de: object | None = None
    #: `None` = todas las etiquetas. Con una, el informe de esa etiqueta — `F10.1`.
    #:
    #: Es **la etiqueta ya resuelta y comprobada contra el proyecto**, no su identificador: asi el
    #: encabezado puede escribir su nombre, y una etiqueta de otra obra no puede filtrar aqui. Sin
    #: la comprobacion, un identificador ajeno devolveria cero filas y el informe diria «no hay
    #: nada abierto» sobre una obra con treinta hallazgos, que es la peor de las respuestas.
    etiqueta: object | None = None

    @classmethod
    def desde(cls, datos, usuario=None, proyecto=None) -> Opciones:
        """Las opciones que vengan de la URL, **validadas**.

        Un valor con mala forma cae al de por defecto en silencio y no da error: quien pide el
        informe no escribio ese parametro a mano, y un 400 en una descarga no dice nada util.
        """
        estado = datos.get("estado", "abiertas")
        orden = datos.get("orden", "prioridad")
        return cls(
            estado=estado if estado in ESTADOS else "abiertas",
            orden=orden if orden in ORDENES else "prioridad",
            comentarios=datos.get("comentarios") in ("1", "si", "true", "on"),
            miniaturas=datos.get("miniaturas", "1") in ("1", "si", "true", "on"),
            solo_de=usuario if datos.get("mias") in ("1", "si", "true", "on") else None,
            etiqueta=_etiqueta_de(datos.get("etiqueta"), proyecto),
        )


def _etiqueta_de(valor, proyecto):
    """La etiqueta del proyecto que corresponda a `valor`, o `None`.

    **Acotada al proyecto a proposito**: es lo que impide que el identificador de una etiqueta de
    otra obra filtre este informe. Y cae a `None` en silencio —igual que el resto de las opciones—
    porque una etiqueta que se borro mientras alguien tenia el formulario abierto no es motivo para
    negarle el informe.
    """
    if not valor or proyecto is None:
        return None

    from apps.projects.models import Etiqueta

    try:
        return Etiqueta.objects.filter(proyecto=proyecto).get(pk=valor)
    except (Etiqueta.DoesNotExist, ValidationError, ValueError, TypeError):
        return None


def hallazgos(proyecto, opciones: Opciones):
    """La consulta del informe, con su orden estable y su tope.

    **Se acota por proyecto y nada mas**: quien llama ya comprobo que el proyecto sea de una
    organizacion del usuario, que es donde vive esa pregunta.
    """
    consulta = Observacion.objects.filter(proyecto=proyecto)

    estados = ESTADOS[opciones.estado]
    if estados is not None:
        consulta = consulta.filter(estado__in=estados)
    if opciones.solo_de is not None:
        # Lo suyo es lo que le toca **o** lo que abrio: las dos cosas son «su parte».
        consulta = consulta.filter(Q(responsable=opciones.solo_de) | Q(autor=opciones.solo_de))
    if opciones.etiqueta is not None:
        consulta = consulta.filter(etiquetas=opciones.etiqueta)

    consulta = consulta.select_related("responsable", "autor", "revision__entregable")
    if opciones.comentarios:
        consulta = consulta.prefetch_related("comentarios__autor")

    # El peso de la prioridad, para poder ordenar por urgencia y no por letra. Ver `ORDENES`.
    #
    # **Y `nulos_al_final`, que faltaba aqui.** Dos de los tres ordenes de `ORDENES` llevan `vence`
    # y los motores no coinciden: SQLite pone los `NULL` primero en ascendente, PostgreSQL al final.
    # Un informe que se lee distinto segun donde corra es un informe que no se puede citar en una
    # reunion, y es lo que pasaba entre el equipo de desarrollo y la VM.
    from apps.documents.orden import anotaciones, nulos_al_final

    consulta = consulta.annotate(**anotaciones())

    return list(nulos_al_final(consulta, ORDENES[opciones.orden])[: MAXIMO_FILAS + 1])


@dataclass
class Resumen:
    """Las cifras del encabezado. **Cuentan lo que hay en el informe**, y se dice que es asi."""

    total: int
    recortado: bool
    altas: int
    vencidas: int
    interferencias: int
    notas: int

    @classmethod
    def de(cls, filas: list[Observacion]) -> Resumen:
        recortado = len(filas) > MAXIMO_FILAS
        utiles = filas[:MAXIMO_FILAS]
        return cls(
            total=len(utiles),
            recortado=recortado,
            altas=sum(1 for o in utiles if o.prioridad == Observacion.ALTA),
            vencidas=sum(1 for o in utiles if o.vencida),
            interferencias=sum(1 for o in utiles if o.interferencia_con),
            notas=sum(1 for o in utiles if not o.interferencia_con),
        )


def _ancla(observacion: Observacion) -> str:
    """Sobre que esta puesto el hallazgo, en una palabra: es de donde se resuelve."""
    if observacion.interferencia_con:
        return "choque"
    if observacion.ifc_guid:
        return "modelo"
    if observacion.pagina is not None:
        return f"pág. {observacion.pagina}"
    return "documento"


def csv_de(proyecto, opciones: Opciones) -> str:
    """El mismo informe en CSV, **que es la mitad editable**.

    **Es lo que resuelve «que sea editable» sin pagar LibreOffice.** Un PDF no se retoca antes de
    mandarlo y una hoja de calculo si, y este CSV abre en Calc y en Excel sin ninguna dependencia
    en el servidor. Va con `;` porque es lo que espera un Excel en configuracion regional
    castellana, y con BOM por lo mismo: sin el, las tildes salen partidas al abrirlo con doble clic.
    """
    filas = hallazgos(proyecto, opciones)[:MAXIMO_FILAS]

    salida = io.StringIO()
    escritor = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    escritor.writerow(
        [
            "Prioridad",
            "Estado",
            "Sobre",
            "Título",
            "Responsable",
            "Abierta por",
            "Abierta el",
            "Vence",
            "Vencida",
            "Resolución",
        ]
    )
    for una in filas:
        escritor.writerow(
            [
                una.get_prioridad_display(),
                una.get_estado_display(),
                _ancla(una),
                una.titulo,
                str(una.responsable),
                str(una.autor),
                timezone.localtime(una.created_at).strftime("%Y-%m-%d"),
                una.vence.isoformat() if una.vence else "",
                "sí" if una.vencida else "",
                una.resolucion,
            ]
        )
    return "﻿" + salida.getvalue()


# --- El PDF -----------------------------------------------------------------------------


def _miniatura(observacion: Observacion, alto_mm: float, ancho_maximo_mm: float | None = None):
    """La foto del hallazgo como imagen del informe, o `None`.

    **Su fallo no puede tumbar el informe.** La imagen vive en el disco del operador y la fila solo
    guarda su clave: un montaje mal puesto o una copia a medias dejan la clave apuntando a nada, y
    entonces la fila sale sin foto —que es lo que salia antes de que las hubiera— en vez de reventar
    el papel entero. Es la misma regla que ya aplica la exportacion a BCF.
    """
    from reportlab.lib.units import mm
    from reportlab.platypus import Image

    from apps.documents import storage

    if not observacion.instantanea:
        return None
    try:
        datos = storage.leer(observacion.instantanea)
    except (OSError, storage.CargaRechazada):
        return None
    try:
        # Se respeta la proporcion de la captura: estirarla mentiria sobre el encuadre.
        imagen = Image(io.BytesIO(datos))
        proporcion = imagen.imageWidth / imagen.imageHeight if imagen.imageHeight else 4 / 3
        alto, ancho = alto_mm, alto_mm * proporcion
        # ══════════════════════════════════════════════════════════════════════════════════
        # **El ancho tambien tiene tope, y faltaba.** Solo se fijaba el alto y el ancho salia de
        # la proporcion, sin mirar la columna: una captura **16:9 —la que produce el visor— da
        # 32 mm en una columna de 25**, y es la ultima del papel, asi que se comia el margen
        # derecho. En un PDF eso no avisa: recorta.
        #
        # No se vio porque el unico PNG de las pruebas era 8×6 —4:3 justo, el unico caso que
        # cabia por los pelos—. Se reduce **el alto tambien**, para no deformar el encuadre.
        # ══════════════════════════════════════════════════════════════════════════════════
        if ancho_maximo_mm is not None and ancho > ancho_maximo_mm:
            ancho = ancho_maximo_mm
            alto = ancho / proporcion if proporcion else alto_mm
        imagen.drawHeight = alto * mm
        imagen.drawWidth = ancho * mm
        return imagen
    except Exception:  # noqa: BLE001 — un PNG corrupto no tumba el informe.
        return None


def pdf_de(proyecto, opciones: Opciones, *, pedido_por=None) -> bytes:
    """Los bytes del informe. Quien llama decide si los manda como descarga o los guarda."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    from reportlab.platypus.doctemplate import LayoutError

    filas = hallazgos(proyecto, opciones)
    resumen = Resumen.de(filas)
    utiles = filas[:MAXIMO_FILAS]

    azul = colors.HexColor(AZUL)
    hojas = getSampleStyleSheet()
    # **Helvetica en todo**, que es la del formato de carta y la que reportlab trae de serie: no hay
    # que incrustar ninguna fuente ni depender de que la VM tenga instalada la de la casa.
    titulo = ParagraphStyle(
        "tituloInforme",
        parent=hojas["Title"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        alignment=TA_LEFT,
        textColor=azul,
        spaceAfter=0,
    )
    celda = ParagraphStyle(
        "celda", parent=hojas["BodyText"], fontName="Helvetica", fontSize=8, leading=10
    )
    hilo = ParagraphStyle(
        "hilo", parent=celda, fontSize=7, leading=9, textColor=colors.HexColor(GRIS)
    )
    nota = ParagraphStyle(
        "nota", parent=hojas["BodyText"], fontName="Helvetica", fontSize=8, leading=11
    )

    hoy = timezone.localdate()
    piezas = [
        # También escapados: el nombre de una obra lleva `&` con la misma facilidad que el de una
        # empresa —«Ampliación Planta A&B»— y aquí el estropicio sale en el titular.
        Paragraph(f"Informe de coordinación · {escape(str(proyecto.codigo))}", titulo),
        Paragraph(escape(str(proyecto.nombre)), nota),
        Spacer(1, 4 * mm),
        Paragraph(_encabezado(resumen, opciones, hoy, pedido_por), nota),
        Spacer(1, 4 * mm),
    ]

    if not utiles:
        # **Un informe vacio se emite igual y lo dice.** «No hay nada abierto con este filtro» es
        # una respuesta; una descarga que falla no lo es.
        piezas.append(
            Paragraph(
                "No hay ningún hallazgo con lo que se pidió imprimir. "
                "Prueba con «todo» en el estado, o quita el filtro de lo tuyo.",
                nota,
            )
        )
    else:
        piezas.append(_tabla(utiles, opciones, celda, hilo))

    if resumen.recortado:
        piezas.append(Spacer(1, 4 * mm))
        piezas.append(
            Paragraph(
                f"<b>Se imprimieron los primeros {MAXIMO_FILAS}</b> y hay más. "
                "Para trabajar la lista entera, descarga el CSV y fíltralo en una hoja de cálculo.",
                nota,
            )
        )

    ancho_pagina, alto_pagina = letter

    def documento_en(memoria):
        return SimpleDocTemplate(
            memoria,
            # **Carta y no A4**, que es lo que declara el formato de la casa: 215,9 × 279,4 mm.
            pagesize=letter,
            leftMargin=MARGEN_MM["izquierda"] * mm,
            rightMargin=MARGEN_MM["derecha"] * mm,
            topMargin=MARGEN_MM["arriba"] * mm,
            bottomMargin=MARGEN_MM["abajo"] * mm,
            title=f"Informe de coordinación {proyecto.codigo}",
            author="J.E.J. Ingeniería · AeroBim",
            subject=f"{proyecto.codigo} · {proyecto.nombre}",
        )

    # ══════════════════════════════════════════════════════════════════════════════════════
    # **El membrete se dibuja al final, y no mientras se compone. El motivo es «de N».**
    #
    # El pie decía «Página 3» a secas, y eso **no permite saber si falta una hoja** — que es
    # justo lo que un informe fotocopiado y grapado necesita decir. Para escribir «Página 3 de
    # 7» hay que saber cuántas son, y eso no se sabe hasta que la última está compuesta.
    #
    # Por eso el sellado sale de `onFirstPage`/`onLaterPages` —que corren *durante* la
    # composición— y pasa a un lienzo que guarda el estado de cada página y las sella todas al
    # guardar, cuando el total ya es un número. Es el patrón estándar de reportlab para esto, y
    # **evita componer el documento dos veces**, que era la otra salida.
    #
    # Lo que dibuja sigue siendo `membrete.sellar`, en una sola copia compartida con la lámina.
    # ══════════════════════════════════════════════════════════════════════════════════════
    class LienzoSellado(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._paginas: list[dict] = []

        def showPage(self):
            self._paginas.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._paginas)
            for estado in self._paginas:
                self.__dict__.update(estado)
                sellar(
                    self,
                    ancho_pagina=ancho_pagina,
                    alto_pagina=alto_pagina,
                    # Sin `escape`: la franja se dibuja con `drawRightString`, que pinta texto
                    # llano. Escapar aquí imprimiría «A&amp;B» en el papel.
                    titulo=f"{proyecto.codigo} · Informe de coordinación",
                    fecha=hoy,
                    pagina=self._pageNumber,
                    total=total,
                )
                super().showPage()
            super().save()

    # ══════════════════════════════════════════════════════════════════════════════════════
    # **La red, porque ningún tope es demostrablemente suficiente.**
    #
    # Una fila de tabla **no se puede partir entre dos páginas**: `LongTable` corta *entre* filas,
    # nunca dentro de una. Si una celda crece más que el alto útil del marco, reportlab no puede
    # colocarla en ninguna página y levanta `LayoutError` — o sea, **la descarga entera se cae**
    # por culpa de un solo hallazgo muy discutido.
    #
    # Los topes de arriba hacen que no pase en la práctica. Esto hace que no pase nunca: si aun
    # así no cabe, sale el informe **sin los hilos**, que es la parte que crece, y el papel dice
    # por qué. Un informe recortado y que lo explica es infinitamente mejor que un 500 delante de
    # quien lo necesita para una reunión.
    # ══════════════════════════════════════════════════════════════════════════════════════
    memoria = io.BytesIO()
    try:
        documento_en(memoria).build(list(piezas), canvasmaker=LienzoSellado)
    except LayoutError:
        if not opciones.comentarios:
            raise
        logger.warning("informe_sin_hilos", extra={"item_count": len(utiles)})
        memoria = io.BytesIO()
        documento_en(memoria).build(
            _piezas_sin_hilos(piezas, utiles, opciones, celda, hilo, nota),
            canvasmaker=LienzoSellado,
        )
    return memoria.getvalue()


def _piezas_sin_hilos(piezas, utiles, opciones, celda, hilo, nota):
    """Las mismas piezas, con la tabla recompuesta sin comentarios y un aviso que lo dice."""
    from reportlab.platypus import LongTable, Paragraph

    rehechas = []
    for pieza in piezas:
        if isinstance(pieza, LongTable):
            rehechas.append(
                Paragraph(
                    "<b>Los hilos de comentarios se dejaron fuera</b> porque uno de ellos no cabía "
                    "en una página. El resto del informe está completo; las respuestas están en la "
                    "aplicación.",
                    nota,
                )
            )
            rehechas.append(
                _tabla(utiles, replace(opciones, comentarios=False), celda, hilo),
            )
            continue
        rehechas.append(pieza)
    return rehechas


def _encabezado(resumen: Resumen, opciones: Opciones, hoy: date, pedido_por) -> str:
    """La linea de cifras, que **dice de que informe habla**.

    Un informe filtrado que presume de ser el total es peor que no tener informe: por eso el
    encabezado enumera lo que se pidio imprimir, no solo cuanto salio.
    """
    que = {
        "abiertas": "hallazgos abiertos",
        "cerradas": "hallazgos cerrados y descartados",
        "todo": "hallazgos, en cualquier estado",
    }[opciones.estado]
    partes = [
        f"<b>{resumen.total}</b> {que}",
        f"{resumen.altas} de prioridad alta",
        f"{resumen.vencidas} vencidos",
        f"{resumen.interferencias} choques y {resumen.notas} notas",
    ]
    if opciones.solo_de is not None:
        partes.append("<b>solo lo tuyo</b>")
    if opciones.etiqueta is not None:
        # **Con el nombre y no «filtrado»**: el informe se lleva a una reunion y a los tres dias
        # nadie recuerda por que trae doce hallazgos y no treinta.
        partes.append(f"<b>solo «{escape(str(opciones.etiqueta))}»</b>")
    linea = " · ".join(partes)
    quien = f" · lo pidió {pedido_por}" if pedido_por else ""
    return f"{linea}<br/>Sacado el {hoy.isoformat()}{quien}"


def _tabla(filas: list[Observacion], opciones: Opciones, celda, hilo):
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import LongTable, Paragraph, TableStyle

    con_foto = opciones.miniaturas and any(o.instantanea for o in filas)

    # **El ancho util es 155,9 mm y no 186**, porque el formato de la casa es Carta con margenes de
    # 30: 215,9 − 30 − 30. Con los anchos de A4 la tabla se salia del papel por la derecha, y eso en
    # un PDF no avisa — recorta.
    cabecera = ["Prior.", "Sobre", "Hallazgo", "Responsable", "Vence"]
    anchos = [12 * mm, 15 * mm, 79 * mm, 32 * mm, 17 * mm]
    if con_foto:
        cabecera.append("Vista")
        anchos = [12 * mm, 14 * mm, 61 * mm, 28 * mm, 15 * mm, 25 * mm]

    datos = [cabecera]
    for una in filas:
        # ══════════════════════════════════════════════════════════════════════════════════
        # **Todo lo que escribe una persona pasa por `escape`, y no es por seguridad.**
        #
        # `Paragraph` lee su texto como mini-XML. Sin escapar no levanta ninguna excepción —eso
        # sería lo bueno, porque se vería—: **corrompe el papel en silencio**. Medido:
        #
        #   «Muro de A&A Ingeniería»      →  «Muro de A&A; Ingeniería»   (un `;` que nadie puso)
        #   «Cliente <ACME> y asociados»  →  «Cliente  y asociados»      (la empresa desaparece)
        #
        # El informe sale, parece correcto, se lleva a la reunión y dice otra cosa. Y entra por el
        # importador BCF, que es justo donde más probable es un ampersand.
        #
        # El módulo **ya escapaba en un sitio** —la etiqueta del filtro, en `_encabezado`— así que
        # el riesgo se conocía. Las etiquetas `<b>` de aquí son nuestras, no del usuario.
        # ══════════════════════════════════════════════════════════════════════════════════
        cuerpo = [f"<b>{escape(una.titulo)}</b>"]
        if una.descripcion:
            cuerpo.append(escape(una.descripcion))
        if una.resolucion:
            cuerpo.append(f"<b>Resolución:</b> {escape(una.resolucion)}")
        bloque = [Paragraph("<br/>".join(cuerpo), celda)]

        if opciones.comentarios:
            # **El hilo es la mitad del valor de un hallazgo**: la respuesta del proyectista y el
            # cierre del revisor son lo que explica por qué está donde está.
            #
            # **Pero se acota, porque una fila no se puede partir.** `LongTable` corta entre filas,
            # nunca dentro de una: un hallazgo muy discutido mete N párrafos en la misma celda,
            # pasa el alto útil del marco y reportlab ya no puede colocarlo en ninguna página.
            hilo_entero = list(una.comentarios.all())
            for comentario in hilo_entero[:MAXIMO_COMENTARIOS_POR_FILA]:
                cuando = timezone.localtime(comentario.created_at).strftime("%Y-%m-%d")
                texto = comentario.texto
                if len(texto) > LARGO_DE_COMENTARIO:
                    texto = texto[:LARGO_DE_COMENTARIO].rstrip() + "…"
                bloque.append(
                    Paragraph(
                        f"— {escape(str(comentario.autor))} · {cuando}: {escape(texto)}",
                        hilo,
                    )
                )
            if len(hilo_entero) > MAXIMO_COMENTARIOS_POR_FILA:
                # Se dice cuántos faltan: un hilo cortado en silencio es peor que uno cortado.
                bloque.append(
                    Paragraph(
                        f"… y {len(hilo_entero) - MAXIMO_COMENTARIOS_POR_FILA} respuestas más "
                        f"en la aplicación.",
                        hilo,
                    )
                )

        fila = [
            Paragraph(escape(una.get_prioridad_display()), celda),
            Paragraph(escape(_ancla(una)), celda),
            bloque,
            Paragraph(escape(str(una.responsable)), celda),
            Paragraph(una.vence.isoformat() if una.vence else "—", celda),
        ]
        if con_foto:
            # El ancho de la columna, menos el aire de la celda: ver `_miniatura`.
            fila.append(_miniatura(una, 18, anchos[-1] / mm - 2) or Paragraph("", celda))
        datos.append(fila)

    # **`LongTable` y no `Table`**: la segunda calcula el alto de todas las filas a la vez, y con
    # cuatrocientas eso es tiempo y memoria de sobra. `repeatRows=1` repite la cabecera en cada
    # pagina, que es lo que permite leer la pagina siete sin volver a la primera.
    tabla = LongTable(datos, colWidths=anchos, repeatRows=1)
    tabla.setStyle(
        TableStyle(
            [
                # La cabecera en el azul de la casa con letra blanca: 9,45:1, o sea que se lee
                # impresa y también fotocopiada en gris.
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZUL)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d2e0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return tabla
