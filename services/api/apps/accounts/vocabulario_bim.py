"""Las dieciséis palabras del vocabulario BIM. `F11.11`.

## De dónde sale

El usuario trajo el 2026-09-11 una lámina de dieciséis conceptos BIM —«incorporar la idea por lo
menos como informativo, se ve interesante»—. Las dieciséis palabras son las de la lámina y están
todas.

## Por qué no es la lámina copiada

Un glosario de definiciones ya existe en veinte sitios de internet, y quien abre esto no necesita
otro: lo que no puede encontrar en ninguno es si la herramienta que tiene delante hace esa cosa.
Así que cada término lleva un campo más —`en_aerobim`— que contesta exactamente eso, con enlace a la
pantalla cuando la hay.

**Y dice que no cuando es que no.** La mitad justa —ocho de dieciséis— no está en el producto: LOD,
BEP, el modelado paramétrico, 4D, 5D, COBie, AIM y el gemelo digital. Cada uno explica qué hay en su
lugar o qué haría falta. Esa es la parte que vale: un glosario que promete las dieciséis cosas
convierte una ayuda en un folleto de ventas, y quien lo lee lo descubre buscando un botón que no
existe. Hay una prueba que fija cuáles son los ocho (`test_glosario.py`), para que nadie mueva uno a
«sí» sin construirlo.

La maquinaria —`Termino`, los grupos, cómo se resuelven los enlaces— y las dos reglas de escritura
que valen para cualquier vocabulario están en `glosario.py`.
"""

from __future__ import annotations

from apps.accounts.glosario import Termino, Vocabulario

MARCO = "Cómo se organiza el trabajo"
MODELO = "Qué es el modelo"
EXPLOTAR = "Qué se hace con él"

GRUPOS: tuple[str, ...] = (MARCO, MODELO, EXPLOTAR)

TERMINOS: tuple[Termino, ...] = (
    # --- Cómo se organiza el trabajo -------------------------------------------------------
    Termino(
        sigla="CDE",
        nombre="Common Data Environment · Entorno Común de Datos",
        que_es=(
            "El único sitio acordado donde vive la información del proyecto: se recopila, se "
            "revisa, se aprueba y se distribuye desde ahí. La idea de fondo de la ISO 19650."
        ),
        en_aerobim=(
            "Es lo que es el registro documental: entregables con correlativo, revisiones con su "
            "código de idoneidad, quién subió qué y cuándo, y el transmittal para emitir. Un "
            "modelo abierto desde el disco no está en el CDE y por eso no admite notas."
        ),
        lo_hace=True,
        grupo=MARCO,
        ruta="documents:entregables",
    ),
    Termino(
        sigla="Information Requirements",
        nombre="Requisitos de información · EIR, OIR, AIR, PIR",
        que_es=(
            "Qué información se necesita, para qué, cuándo, con qué nivel y quién la entrega. Es "
            "lo que convierte «entrega el modelo» en algo comprobable."
        ),
        en_aerobim=(
            "La mitad comprobable por máquina está: un requisito se escribe como IDS —el estándar "
            "de buildingSMART— y el producto valida el IFC contra él y dice qué elementos "
            "incumplen. La mitad contractual, la que se negocia y se firma, es un documento del "
            "expediente."
        ),
        lo_hace=True,
        grupo=MARCO,
        ruta="documents:requisitos-ids",
    ),
    Termino(
        sigla="LOD",
        nombre="Level of Development · Nivel de Desarrollo",
        que_es=(
            "Cuánta definición, información y fiabilidad tiene un elemento del modelo en una etapa "
            "y para un uso concretos. Un muro LOD 200 y uno LOD 400 se dibujan parecido y no "
            "sirven para lo mismo."
        ),
        en_aerobim=(
            "No hay campo de LOD. Lo que sí hay es el código de idoneidad de cada revisión —S0 "
            "a S7, A, B— que es el eje de la ISO 19650: para qué se puede usar este documento hoy. "
            "Son cosas distintas y conviene no confundirlas: la idoneidad habla del documento, el "
            "LOD habla del elemento. Si hiciera falta por elemento, el camino es un pset propio y "
            "un requisito IDS que lo exija."
        ),
        lo_hace=False,
        grupo=MARCO,
    ),
    Termino(
        sigla="BEP",
        nombre="BIM Execution Plan · Plan de Ejecución BIM",
        que_es=(
            "El documento que fija objetivos, usos, roles, estándares, flujos de trabajo y "
            "entregables de un proyecto BIM. Se acuerda al principio y manda sobre lo demás."
        ),
        en_aerobim=(
            "No es un objeto del producto: es un documento, y se archiva como cualquier otro "
            "entregable con su revisión y su idoneidad. Lo que el BEP decide sí se aplica aquí "
            "—los correlativos, los roles, qué se publica— pero se configura a mano, no se lee del "
            "documento."
        ),
        lo_hace=False,
        grupo=MARCO,
    ),
    # --- Qué es el modelo -------------------------------------------------------------------
    Termino(
        sigla="IFC",
        nombre="Industry Foundation Classes",
        que_es=(
            "El formato abierto para intercambiar modelos entre programas distintos. Es lo que "
            "permite que un modelo salga de Revit y se abra en otra cosa sin perder el significado "
            "de las piezas."
        ),
        en_aerobim=(
            "Es el formato nativo del visor: abre IFC2X3 e IFC4, lee el árbol, las propiedades con "
            "sus unidades y los conjuntos de propiedades del elemento y de su tipo. El GUID de "
            "cada elemento se valida, y es lo que hace que una nota de marzo se siga encontrando "
            "en el modelo de junio."
        ),
        lo_hace=True,
        grupo=MODELO,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Modelo federado",
        nombre="Federated Model",
        que_es=(
            "La vista coordinada que integra los modelos de varias disciplinas sin fundirlos "
            "en uno solo. Cada especialidad sigue siendo dueña del suyo."
        ),
        en_aerobim=(
            "El visor abre varios IFC a la vez y cada uno se enciende, se apaga y se cierra por "
            "separado; el cruce de interferencias toma todos los modelos vigentes de la obra. No "
            "hay un archivo fusionado, que es justamente la idea."
        ),
        lo_hace=True,
        grupo=MODELO,
        ruta="visor:visor",
    ),
    Termino(
        sigla="MEP",
        nombre="Mechanical, Electrical & Plumbing",
        que_es=(
            "Las instalaciones: climatización, electricidad y sanitarias. Es la disciplina que más "
            "choca con la estructura, y por eso es la que más coordinación pide."
        ),
        en_aerobim=(
            "No es una función sino una disciplina, y el producto la trata como a cualquier otra: "
            "su modelo entra al registro con su código de disciplina y el cruce de interferencias "
            "es exactamente la herramienta que la coordinación MEP necesita."
        ),
        lo_hace=True,
        grupo=MODELO,
        ruta="projects:proyectos",
    ),
    Termino(
        sigla="Scan to BIM",
        nombre="Del escaneo al modelo",
        que_es=(
            "Partir de una captura de la realidad —láser escáner o nube de puntos de un vuelo— "
            "para modelar lo que existe o para comprobar lo que se construyó."
        ),
        en_aerobim=(
            "La mitad de comprobar, que es la que se usa en obra: el levantamiento COPC entra al "
            "expediente como entregable, se abre en el visor, se calza con el modelo y se mide la "
            "desviación entre lo construido y lo modelado, con su mediana, su máxima y su "
            "sesgo. Modelar a partir de la nube no lo hace: eso es una herramienta de autoría."
        ),
        lo_hace=True,
        grupo=MODELO,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Modelado paramétrico",
        nombre="Parametric Modeling",
        que_es=(
            "Modelar con parámetros y reglas en vez de con geometría fija, de modo que cambiar un "
            "valor actualiza todo lo que depende de él."
        ),
        en_aerobim=(
            "No, y no es una carencia: AeroBim lee y coordina modelos, no los crea. El modelado "
            "paramétrico vive en la herramienta de autoría —Revit, Archicad, BricsCAD, "
            "OpenBuildings— y lo que llega aquí es su IFC."
        ),
        lo_hace=False,
        grupo=MODELO,
    ),
    # --- Qué se hace con él ------------------------------------------------------------------
    Termino(
        sigla="Clash Detection",
        nombre="Detección de interferencias",
        que_es=(
            "Buscar por geometría los conflictos entre elementos de disciplinas distintas: lo que "
            "ocupa el mismo sitio, o lo que pasa demasiado cerca."
        ),
        en_aerobim=(
            "«Revisar interferencias» en la pantalla de la obra cruza todos los modelos vigentes y "
            "deja lo que encuentra como observaciones abiertas, con los dos elementos aislados y "
            "el choque dibujado. Agrupa por proximidad: veinte tornillos contra la misma viga "
            "son un problema, no veinte. Y un falso positivo se descarta con motivo, para que la "
            "corrida siguiente no lo vuelva a abrir."
        ),
        lo_hace=True,
        grupo=EXPLOTAR,
        ruta="projects:proyectos",
    ),
    Termino(
        sigla="Model Coordination",
        nombre="Coordinación de modelos",
        que_es=(
            "El proceso, no la herramienta: revisar entre disciplinas, detectar conflictos, "
            "repartirlos, resolverlos y dejar constancia de cómo se resolvieron."
        ),
        en_aerobim=(
            "Es la columna del producto. Una observación se ancla al GUID del elemento con la "
            "cámara, la foto y lo que estaba visible; se reparte con responsable, fecha y "
            "prioridad; se contesta en un hilo; sale y vuelve en BCF para quien use Solibri o "
            "Navisworks, y se imprime como informe PDF para la reunión."
        ),
        lo_hace=True,
        grupo=EXPLOTAR,
        ruta="documents:observaciones",
    ),
    Termino(
        sigla="4D BIM",
        nombre="Tiempo + modelo",
        que_es=(
            "Vincular los elementos del modelo con las actividades de la programación para ver la "
            "secuencia constructiva y comparar el avance con lo planificado."
        ),
        en_aerobim=(
            "No. Hay actividades con fechas y responsable, y hay una línea de tiempo de la obra, "
            "pero no están vinculadas a elementos del modelo, que es lo que hace que algo sea "
            "4D. Lo que faltaría es esa vinculación y un reproductor de la secuencia."
        ),
        lo_hace=False,
        grupo=EXPLOTAR,
    ),
    Termino(
        sigla="5D BIM",
        nombre="Costos + modelo",
        que_es=(
            "Relacionar el modelo con cantidades, precios y presupuesto, para estimar y controlar "
            "el costo desde la misma fuente que la geometría."
        ),
        en_aerobim=(
            "No, y está a medio camino: los cuadros por categoría sacan las cantidades con sus "
            "unidades y sus conjuntos de propiedades, y salen en CSV. Eso es la materia prima de "
            "un presupuesto; lo que falta es el precio y la partida, que es lo que lo haría 5D."
        ),
        lo_hace=False,
        grupo=EXPLOTAR,
    ),
    Termino(
        sigla="COBie",
        nombre="Construction Operations Building information exchange",
        que_es=(
            "Un formato de tablas para entregar al operador la información útil del activo: "
            "espacios, equipos, garantías, repuestos y mantenimiento."
        ),
        en_aerobim=(
            "No hay exportación COBie. El dato de origen sí se lee —los conjuntos de propiedades "
            "de cada elemento, con la cobertura medida para saber qué falta antes de entregar— y "
            "sale en CSV, pero COBie tiene sus hojas y sus columnas obligatorias y eso no está "
            "escrito."
        ),
        lo_hace=False,
        grupo=EXPLOTAR,
    ),
    Termino(
        sigla="AIM",
        nombre="Asset Information Model · Modelo de Información del Activo",
        que_es=(
            "El modelo que queda después de construir, el que sirve para operar y mantener. "
            "Nace del modelo de proyecto y sigue vivo durante toda la vida del edificio."
        ),
        en_aerobim=(
            "No. AeroBim acompaña la etapa de proyecto y construcción; el AIM empieza donde ésta "
            "acaba y pide otras cosas —inventario de activos, mantenimientos, integración con el "
            "sistema de operación—."
        ),
        lo_hace=False,
        grupo=EXPLOTAR,
    ),
    Termino(
        sigla="Gemelo digital",
        nombre="Digital Twin",
        que_es=(
            "Una representación digital conectada a datos reales del activo —sensores, "
            "consumos, estado— para monitorear, analizar y optimizar mientras funciona."
        ),
        en_aerobim=(
            "No. Lo que distingue a un gemelo de un modelo es el dato en vivo, y aquí no entra "
            "ninguno: lo que hay es el modelo, el levantamiento y lo que las personas anotan sobre "
            "ellos."
        ),
        lo_hace=False,
        grupo=EXPLOTAR,
    ),
)

VOCABULARIO = Vocabulario(
    clave="bim",
    titulo="Vocabulario BIM",
    grupos=GRUPOS,
    terminos=TERMINOS,
)
