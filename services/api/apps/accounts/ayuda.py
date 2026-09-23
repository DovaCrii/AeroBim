"""El recorrido de como se usa AeroBim: `F11.7`.

El usuario lo pidio asi: **«una seccion de ayuda como usar el software con un recorrido o como
usarlo»**.

## Por que un recorrido **generado** y no uno superpuesto a la pantalla

La otra forma de hacer esto es un recorrido con globos sobre la interfaz —el patron de `intro.js`—
que va senalando botones. Se descarto por dos razones y no por una:

1. **Se rompe con cada cambio de interfaz**, y esta cambia. Un recorrido asi se ancla a selectores
   o a posiciones; el dia que un boton se mueve de panel, el globo apunta a otro sitio y la ayuda
   **miente sin avisar**. Es la peor clase de documentacion: la que parece correcta.
2. **No cubre las dos mitades del producto.** El portal es Django y el visor es una aplicacion de
   una pagina; un recorrido de globos habria que escribirlo dos veces, con dos librerias, y
   mantenerlo en dos sitios.

Lo que se hace en cambio: **el recorrido se genera de lo que el producto sabe hacer**, en el orden
en que se trabaja, y cada paso lleva **a la pantalla de verdad**. Eso le da una propiedad que un
recorrido escrito a mano no tiene: no puede apuntar a una pantalla que no existe, porque las rutas
se resuelven con el enrutador de Django y **hay una prueba que comprueba que cada destino esta
ademas en el catalogo del portal**. Si un modulo se quita, la ayuda falla en el gate en vez de
mentir en produccion.

## Y ensena el flujo entero, marcando lo que no te toca

**Es la diferencia con el portal, y es deliberada.** El portal **esconde** lo que tu rol no puede
abrir: ofrecer un boton que termina en 403 ensena a probar puertas. La ayuda hace lo contrario:
ensena los nueve pasos y marca los que no son tuyos, porque **una explicacion a la que le faltan
tres pasos no explica nada** — quien la lee no entiende de donde le llegan las observaciones que
tiene que contestar. El portal es una puerta; esto es una explicacion.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Paso:
    """Un paso del recorrido.

    `para_que` es lo que casi nunca esta escrito en una ayuda y es lo unico que hace falta para
    decidir si este paso te interesa. `que_hacer` es la accion concreta; sin ella la ayuda es un
    folleto.
    """

    titulo: str
    para_que: str
    que_hacer: str
    #: El nombre de la ruta a la que lleva, o `None` si el paso ocurre dentro de otra pantalla.
    ruta: str | None
    #: El permiso que hace falta, o `None` si no hace falta ninguno.
    permiso: str | None
    #: Quien lo hace normalmente, para el paso que no te toca. Se dice en vez de callar.
    de_quien: str
    #: Que rastro deja en la base haber hecho este paso, o `None` si no deja ninguno.
    #:
    #: **La mayoria no deja ninguno, y por eso este campo existe.** Mirar un modelo, medir, sacar el
    #: papel o exportar un BCF son lecturas y descargas: pasan en el navegador o son `GET`, y la
    #: auditoria solo anota lo que muta. Solo tres pasos escriben algo que se pueda comprobar
    #: despues, y la tarjeta de arranque **solo marca «hecho» esos tres** — ver `arranque.py`.
    #:
    #: El nombre casa con una columna de `_lo_que_ha_hecho`. Va aqui, al lado del paso, para que
    #: anadir un paso obligue a pensar si se puede comprobar en vez de suponerlo desde otro archivo.
    senal: str | None = None


#: El recorrido, **en el orden en que se trabaja de verdad** y no por modulos.
#:
#: Ese orden es la mitad del valor: un indice alfabetico de doce pantallas no dice por donde se
#: empieza, y por donde se empieza es justo lo que no sabe quien abre esto la primera vez.
#:
#: **El texto va en espanol literal y sin `gettext`**, al contrario que el resto del portal. El
#: catalogo del proyecto va de msgid en ingles a msgstr en espanol, asi que marcar prosa que ya esta
#: en espanol obligaria a treinta y cinco traducciones de si misma —ruido, y que sale como «sin
#: traducir» para siempre si no se rellena—. El visor entero ya es literal en espanol, asi que esto
#: es lo consistente. El chrome de la plantilla si lleva msgid en ingles: son cadenas cortas y son
#: las que un segundo idioma necesitaria primero. **Si algun dia hay un segundo idioma, este es el
#: archivo que se revisa.**
PASOS: tuple[Paso, ...] = (
    Paso(
        titulo="1 · Entra en la obra",
        para_que=(
            "Es la pantalla que contesta «¿dónde sigo?». Trae el avance de la obra, lo que está "
            "vencido, lo que tiene prioridad alta y los entregables sin nada emitido: lo que "
            "decide por dónde entrar hoy."
        ),
        que_hacer=(
            "Abre «Las obras → Proyectos» y entra en la tuya. El tablero de arriba se lee en tres "
            "segundos; debajo está la línea de tiempo y el calendario del mes."
        ),
        ruta="projects:proyectos",
        permiso="projects.view_proyecto",
        de_quien="cualquiera que tenga la obra asignada",
    ),
    Paso(
        titulo="2 · Abre el modelo",
        para_que=(
            "El visor abre los IFC y los DXF que ya están publicados en el registro, así que lo "
            "que miras es la revisión vigente y no una copia del correo de alguien."
        ),
        que_hacer=(
            "En la pantalla de la obra, «Modelos y planos que puedes abrir». También se abre desde "
            "el propio visor, en «Del registro». Un IFC del disco se puede arrastrar al visor, "
            "pero entonces no hay obra donde archivar lo que anotes."
        ),
        ruta="visor:visor",
        permiso=None,
        de_quien="cualquiera",
    ),
    Paso(
        titulo="3 · Mira y mide",
        para_que=(
            "Medir con ajuste a vértice es lo que hace que dos personas midan lo mismo: el cursor "
            "se pega a la esquina o a la arista, no a donde cayó el ratón."
        ),
        que_hacer=(
            "En la cinta: «Vista» para encuadrar y cortar, «Medición» para distancias, ángulos y "
            "áreas. Doble clic en un elemento lo encuadra; un clic enseña sus propiedades."
        ),
        ruta="visor:visor",
        permiso=None,
        de_quien="cualquiera",
    ),
    Paso(
        titulo="4 · Deja una nota sobre un elemento",
        para_que=(
            "Es la unidad de la coordinación. Queda anclada al GUID del elemento, con la cámara y "
            "lo que estaba visible, así que quien la abra ve exactamente lo que veías tú."
        ),
        que_hacer=(
            "Clic en el elemento y «Dejar una nota». El responsable y la fecha se reparten "
            "después: lo que importa es dejarla mientras la estás mirando."
        ),
        ruta=None,
        permiso="documents.add_observacion",
        de_quien="quien coordina o revisa",
        # Queda una `Observacion` con esta persona de `autor`. Es el rastro mas limpio de los tres.
        senal="nota",
    ),
    Paso(
        titulo="5 · Cruza los modelos",
        para_que=(
            "Encuentra los choques entre disciplinas sin mirarlos uno por uno. Los agrupa por "
            "proximidad —veinte tornillos contra la misma viga son un problema, no veinte— y los "
            "falsos positivos se descartan para que la corrida siguiente no los vuelva a abrir."
        ),
        que_hacer=(
            "En la pantalla de la obra, «Revisar interferencias». Necesita dos modelos vigentes o "
            "más. Tarda unos veinte segundos por par, así que la pantalla se queda quieta."
        ),
        ruta=None,
        permiso="documents.add_observacion",
        de_quien="quien coordina",
        # Lo que nace de una corrida lleva el GUID del otro elemento en `interferencia_con`, y lo
        # que escribe una persona a mano lo lleva vacio. Distingue las dos cosas sin tabla nueva.
        senal="cruce",
    ),
    Paso(
        titulo="6 · Reparte y sigue",
        para_que=(
            "Un hallazgo sin responsable y sin fecha no se resuelve. Aquí se tría por prioridad, "
            "se reparte, y el hilo de comentarios es lo que explica seis meses después por qué "
            "acabó como acabó."
        ),
        que_hacer=(
            "«Coordinación → Observaciones». Se ordena por cualquier columna y se filtra por "
            "prioridad, estado y obra. Cada hallazgo tiene su ficha con su paso a paso: abierta, "
            "respondida, cerrada."
        ),
        ruta="documents:observaciones",
        permiso="documents.view_observacion",
        de_quien="todos: cada uno contesta lo suyo",
        # **Repartir es escribirla para que la conteste otro.** Una nota que uno se asigna a si
        # mismo es un recordatorio, y contarla diria que ya coordino a alguien cuando no lo hizo.
        senal="reparto",
    ),
    Paso(
        titulo="7 · Saca el papel",
        para_que=(
            "Un informe se lleva a una reunión de obra, se firma y se archiva. Sale en Carta con "
            "el membrete de la casa, y el CSV es la mitad editable: abre en una hoja de cálculo."
        ),
        que_hacer=(
            "En la pantalla de la obra, debajo de «Observaciones abiertas»: elige qué estado, en "
            "qué orden y con qué etiqueta, y «Informe en PDF» o «Tabla en CSV»."
        ),
        ruta=None,
        permiso="documents.view_observacion",
        de_quien="quien prepara la reunión",
    ),
    Paso(
        titulo="8 · Manda y recibe BCF",
        para_que=(
            "Es lo que hace que la coordinación valga fuera de AeroBim: un BCF lo abren Solibri y "
            "Navisworks. Y de vuelta, los temas nuevos entran como observaciones y las respuestas "
            "se suman al hilo sin pisar nada."
        ),
        que_hacer=(
            "«Exportar a BCF 2.1» está arriba en la pantalla de la obra. Para lo que devuelve el "
            "mandante, «Importar una respuesta BCF»: primero enseña qué trae y solo escribe al "
            "confirmar."
        ),
        ruta=None,
        permiso="documents.add_observacion",
        de_quien="quien coordina",
    ),
    Paso(
        titulo="9 · Saca los planos",
        para_que=(
            "Para una oficina técnica un plano suele valer más que un modo de visualización: se "
            "imprime, se firma y se sigue trabajando en el CAD."
        ),
        que_hacer=(
            "En el visor, «Planos generados»: planta, frontal o lateral de lo que esté encendido. "
            "Se puede acotar con las mediciones, ponerle un cuadro del modelo, y sale en DXF para "
            "el CAD o en PDF con el membrete."
        ),
        ruta="visor:visor",
        permiso=None,
        de_quien="quien dibuja",
    ),
)


@dataclass(frozen=True)
class PasoResuelto:
    """Un paso con su enlace resuelto y si esta persona lo puede hacer."""

    paso: Paso
    url: str | None
    puedes: bool


def pasos_para(usuario) -> list[PasoResuelto]:
    """El recorrido para esta persona: los nueve pasos, con los que no le tocan marcados.

    **No se filtra, se marca.** Ver el docstring del modulo: una explicacion a la que le faltan
    tres pasos no explica nada, y quien la lee no entiende de donde le llegan las observaciones que
    tiene que contestar.
    """
    from django.urls import NoReverseMatch, reverse

    resueltos: list[PasoResuelto] = []
    for paso in PASOS:
        url = None
        if paso.ruta is not None:
            try:
                url = reverse(paso.ruta)
            except NoReverseMatch:
                # **Un enlace que no resuelve no se dibuja**, y no tumba la ayuda: una ayuda que
                # revienta es peor que una ayuda con un paso sin enlace. El gate lo caza antes:
                # `test_ayuda.py` comprueba que las nueve rutas existen.
                url = None
        resueltos.append(
            PasoResuelto(
                paso=paso,
                url=url,
                puedes=paso.permiso is None or usuario.has_perm(paso.permiso),
            )
        )
    return resueltos
