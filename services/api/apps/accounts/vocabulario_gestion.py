"""El vocabulario de gestión y costos: CAPEX, OPEX y los indicadores. `F11.13`.

## De dónde sale

Lo pidió el usuario el 2026-09-11, después de los dos primeros: «se puede sumar al glosario el tema
de CAPEX y OPEX y los KPI».

## Por qué este es el que más tiene que decir que no

Los dos primeros vocabularios acaban con ocho de dieciséis y once de veinte fuera del producto. Este
acaba con **quince de diecinueve**, y esa proporción es el dato: **AeroBim no es una herramienta de
costos.** No hay presupuesto, no hay partidas, no hay valor ganado y no hay un campo de CAPEX en
ninguna parte.

Decirlo aquí, en la pantalla que alguien abre buscando la palabra, es más barato que descubrirlo en
una reunión donde se prometió un informe de costos. Y deja a la vista las cuatro cosas que **sí**
tiene y que alimentan a la herramienta que sí lleva el dinero: las cantidades del modelo, el avance
documental, el tiempo de ciclo de un hallazgo y las cifras de `metricas_piloto`.

## El aviso que da nombre a esta pantalla

**`avance_fisico` no mide avance físico.** Es una suma ponderada de entregables por el avance de su
revisión vigente, o sea **avance documental**. Que un proyecto tenga el 80 % de los planos emitidos
no dice nada de cuánto hormigón se vertió, y confundir los dos es de los errores que se firman.
Está escrito en su término.
"""

from __future__ import annotations

from apps.accounts.glosario import Termino, Vocabulario

DINERO = "El dinero de la obra"
AVANCE = "Cómo se mide el avance"
INDICADORES = "Los indicadores"

GRUPOS: tuple[str, ...] = (DINERO, AVANCE, INDICADORES)

TERMINOS: tuple[Termino, ...] = (
    # --- El dinero de la obra --------------------------------------------------------------
    Termino(
        sigla="CAPEX",
        nombre="Capital Expenditure · Inversión",
        que_es=(
            "Lo que cuesta construir o comprar el activo: terreno, proyecto, obra, equipamiento. "
            "Se gasta una vez, se capitaliza y se deprecia a lo largo de la vida útil. Es el "
            "número que aprueba el directorio antes de empezar."
        ),
        en_aerobim=(
            "No hay ningún campo de CAPEX ni nada que sume pesos. Lo que sí vive aquí son los "
            "documentos con los que se arma —el presupuesto, las bases, los contratos— "
            "archivados como entregables con su revisión y su idoneidad, y las cantidades del "
            "modelo, que son la entrada física del cálculo. El cálculo lo hace otra herramienta."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    Termino(
        sigla="OPEX",
        nombre="Operational Expenditure · Operación",
        que_es=(
            "Lo que cuesta hacer funcionar el activo una vez construido: energía, mantenimiento, "
            "personal, seguros, repuestos. Es recurrente, y a lo largo de la vida de un edificio "
            "suele superar con holgura a lo que costó levantarlo."
        ),
        en_aerobim=(
            "No. El OPEX empieza donde AeroBim acaba: pide el modelo de información del activo y "
            "un sistema de operación, y ninguno de los dos está aquí. La decisión de proyecto "
            "que baja el OPEX —una solución más cara de construir y más barata de mantener— se "
            "toma antes, con el LCC."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    Termino(
        sigla="LCC y TOTEX",
        nombre="Coste del ciclo de vida · Life Cycle Cost",
        que_es=(
            "Sumar CAPEX y OPEX a lo largo de toda la vida del activo, traídos a valor presente. "
            "Es lo que permite comparar dos soluciones que cuestan distinto de construir y "
            "distinto de mantener. TOTEX es el mismo total dicho en una palabra."
        ),
        en_aerobim=(
            "No lo calcula. Se nombra aquí porque es el argumento que decide muchas de las cosas "
            "que sí se coordinan en el visor: una interferencia resuelta en el modelo no solo "
            "ahorra el retrabajo de obra, también evita la solución improvisada que después hay "
            "que mantener veinte años."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    Termino(
        sigla="Partida y APU",
        nombre="Análisis de Precio Unitario",
        que_es=(
            "El presupuesto se divide en partidas —«hormigón G25 en fundaciones»—, cada una con "
            "su unidad y su cantidad. El APU es el desglose del precio de una: materiales, mano "
            "de obra, equipos, rendimientos y los gastos generales que le tocan."
        ),
        en_aerobim=(
            "No hay partidas ni precios. Lo más cerca que llega es el cuadro por categoría del "
            "modelo, que es otra cosa: agrupa por clase IFC y no por partida presupuestaria, y "
            "traducir de una a otra es precisamente el trabajo de quien presupuesta."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    Termino(
        sigla="Cantidades del modelo",
        nombre="Quantity Take-off · QTO",
        que_es=(
            "Sacar del modelo cuánto hay de cada cosa: metros cúbicos de hormigón, kilos de "
            "acero, metros cuadrados de tabique. Es el puente entre la geometría y el "
            "presupuesto, y es lo que la gente quiere decir cuando dice «5D»."
        ),
        en_aerobim=(
            "Sí, y es de las cuatro cosas de este vocabulario que el producto hace. Los cuadros "
            "listan los elementos por categoría con sus cantidades y sus conjuntos de "
            "propiedades, cada número con la unidad que declara el archivo, y salen en CSV. Lo "
            "que sale de aquí es la cantidad; el precio y la partida los pone quien presupuesta."
        ),
        lo_hace=True,
        grupo=DINERO,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Contingencia y reserva de gestión",
        nombre="Lo que se guarda para lo que no se sabe",
        que_es=(
            "La contingencia cubre lo que se sabe que puede pasar y no se sabe cuánto "
            "—imprevistos con probabilidad estimada— y la maneja el equipo de proyecto. La "
            "reserva de gestión cubre lo que ni siquiera se previó, y la libera el mandante. "
            "Confundirlas hace que la primera se gaste sin que nadie decida nada."
        ),
        en_aerobim=(
            "No. Se nombran porque son la conversación en la que aterrizan los hallazgos: una "
            "interferencia encontrada en el modelo se paga con horas de proyectista y una "
            "encontrada en obra se paga con contingencia."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    Termino(
        sigla="Orden de cambio",
        nombre="Change order · Aumento de obra",
        que_es=(
            "La modificación formal del contrato que cambia alcance, plazo o precio. Es el "
            "mecanismo por el que el CAPEX crece después de aprobado, y la causa más repetida es "
            "un problema de coordinación que llegó tarde."
        ),
        en_aerobim=(
            "No las gestiona: eso vive en la administración del contrato. Lo que hace es la "
            "mitad que la evita — un choque detectado y cerrado antes de construir es una orden "
            "de cambio que no se emitió—, y deja el rastro que la sustenta cuando sí hay que "
            "emitirla: quién lo abrió, cuándo, con qué modelo y cómo se resolvió."
        ),
        lo_hace=False,
        grupo=DINERO,
    ),
    # --- Cómo se mide el avance ------------------------------------------------------------
    Termino(
        sigla="Avance físico y avance financiero",
        nombre="Lo construido, y lo pagado",
        que_es=(
            "El físico es cuánto se ha ejecutado de verdad; el financiero, cuánto se ha pagado. "
            "Rara vez van juntos, y la distancia entre los dos es el primer síntoma de que algo "
            "va mal: pagado por delante de lo construido es riesgo, construido por delante de lo "
            "pagado es un problema de caja del contratista."
        ),
        en_aerobim=(
            "Ni uno ni otro, y aquí hay un aviso que conviene leer despacio: el producto tiene "
            "un campo que se llama avance_fisico y no mide avance físico. Es una suma ponderada "
            "de entregables por el avance de su revisión vigente, o sea avance documental. Que "
            "el 80 % de los planos esté emitido no dice nada del hormigón vertido."
        ),
        lo_hace=False,
        grupo=AVANCE,
    ),
    Termino(
        sigla="Avance documental",
        nombre="Cuánto del proyecto está emitido",
        que_es=(
            "Qué proporción de los entregables comprometidos tiene una revisión emitida, "
            "ponderada por el peso de cada uno. Mide cómo va el proyecto, no cómo va la obra, y "
            "es lo que decide si el frente siguiente puede empezar."
        ),
        en_aerobim=(
            "Sí: es lo que pinta la barra de cada tarjeta de obra, y sale sumado del registro en "
            "vez de tecleado por alguien — que es lo que lo hace fiable. La lista de entregables "
            "sin nada emitido es la otra mitad de la misma pregunta."
        ),
        lo_hace=True,
        grupo=AVANCE,
        ruta="projects:proyectos",
    ),
    Termino(
        sigla="Curva S",
        nombre="El avance acumulado en el tiempo",
        que_es=(
            "La gráfica del avance acumulado, que en casi toda obra tiene forma de S: lenta al "
            "principio, rápida en el medio, lenta al final. Se dibujan dos —la planificada y la "
            "real— y lo que se lee es la separación entre ellas."
        ),
        en_aerobim=(
            "No la dibuja. Hay una línea de tiempo de la obra con sus actividades y un "
            "calendario del mes, que contestan «¿qué toca ahora?» y no «¿vamos adelantados o "
            "atrasados respecto de la curva?»."
        ),
        lo_hace=False,
        grupo=AVANCE,
    ),
    Termino(
        sigla="Valor ganado",
        nombre="EVM · PV, EV y AC",
        que_es=(
            "Tres números que se comparan entre sí: PV es lo que se planificó gastar a esta "
            "fecha, EV es el valor de lo realmente ejecutado, y AC lo realmente gastado. Con los "
            "tres se sabe a la vez si se va caro y si se va tarde, que es lo que ningún número "
            "suelto dice."
        ),
        en_aerobim=(
            "No. Los tres son cifras de costo y ninguna de las tres entra al producto. Se "
            "nombran porque son el vocabulario en el que se pide un informe de avance, y "
            "conviene saber de entrada que ese informe no sale de aquí."
        ),
        lo_hace=False,
        grupo=AVANCE,
    ),
    Termino(
        sigla="CPI y SPI",
        nombre="Índice de costo y de plazo",
        que_es=(
            "Los dos indicadores que salen del valor ganado: CPI es EV dividido por AC y SPI es "
            "EV dividido por PV. Uno por debajo de 1 quiere decir que se va caro o tarde, y el "
            "mérito de ambos es que son adimensionales, así que se comparan entre obras de "
            "tamaños distintos."
        ),
        en_aerobim=(
            "No, por lo mismo que el valor ganado. Se dicen aquí porque son el ejemplo de lo que "
            "hace bueno a un indicador —un número, una fórmula pública, un umbral claro— y esa "
            "forma sí se puede copiar para los indicadores que el producto sí da."
        ),
        lo_hace=False,
        grupo=AVANCE,
    ),
    Termino(
        sigla="Estado de pago",
        nombre="La cuenta del período",
        que_es=(
            "El documento periódico en el que el contratista cobra lo ejecutado: partidas, "
            "cantidades del período, retenciones y anticipos. Es donde el avance físico se "
            "convierte en dinero, y por eso es donde se discute."
        ),
        en_aerobim=(
            "No. Es un documento y como tal se archiva en el registro con su correlativo y su "
            "revisión; lo que hay dentro —cantidades y precios— no lo lee ni lo calcula nadie "
            "aquí."
        ),
        lo_hace=False,
        grupo=AVANCE,
    ),
    # --- Los indicadores -------------------------------------------------------------------
    Termino(
        sigla="KPI",
        nombre="Key Performance Indicator · Indicador clave",
        que_es=(
            "Un número que se mira para decidir. Lo que separa un KPI de una cifra cualquiera "
            "son cuatro cosas: se calcula solo de datos que ya existen, tiene una meta, tiene un "
            "dueño y tiene una cadencia. Sin meta es un dato, y sin dueño no lo mira nadie."
        ),
        en_aerobim=(
            "Sí, unos pocos y concretos, y salen de lo que la base ya guarda: hallazgos "
            "abiertos, cerrados y descartados en un rango; el tiempo de ciclo; qué proporción de "
            "los abiertos trae cámara, foto o coordenada; y el reparto por pantalla y por tipo. "
            "Se piden con metricas_piloto, que no escribe nada. Lo que no hay es meta: la "
            "primera semana es la línea base, y fijar metas antes de tenerla es inventárselas."
        ),
        lo_hace=True,
        grupo=INDICADORES,
    ),
    Termino(
        sigla="Línea base",
        nombre="Baseline",
        que_es=(
            "El valor de partida contra el que se compara todo lo demás. Sin ella un indicador "
            "no significa nada: «treinta hallazgos abiertos» no es bueno ni malo hasta que se "
            "sabe cuántos había el mes pasado y cuántos cierra el equipo por semana."
        ),
        en_aerobim=(
            "No la guarda como un objeto. Las cifras se piden por rango de fechas, así que la "
            "línea base es el primer rango que se mida y vive en la bitácora del piloto, no en "
            "la base de datos. Es una decisión y no un olvido: una línea base congelada en una "
            "tabla se desactualiza sin que nadie se entere."
        ),
        lo_hace=False,
        grupo=INDICADORES,
    ),
    Termino(
        sigla="Tiempo de ciclo",
        nombre="Cuánto tarda un hallazgo en cerrarse",
        que_es=(
            "Los días entre que se abre un problema y se cierra. Es el indicador más honesto de "
            "una coordinación, porque no se puede maquillar abriendo menos: si sube, es que las "
            "cosas se quedan pendientes."
        ),
        en_aerobim=(
            "Sí: metricas_piloto lo calcula sobre las observaciones cerradas en el rango, y "
            "avisa aparte de las que se resolvieron sin fecha de cierre en vez de dejarlas caer "
            "en silencio — que es como un indicador de ciclo termina mintiendo a la baja."
        ),
        lo_hace=True,
        grupo=INDICADORES,
    ),
    Termino(
        sigla="Retrabajo",
        nombre="Rework",
        que_es=(
            "Hacer dos veces lo que debió hacerse una: demoler y rehacer, rehacer un plano, "
            "reordenar una instalación ya montada. Es la partida que la coordinación BIM promete "
            "reducir, y la que casi nadie mide."
        ),
        en_aerobim=(
            "No lo mide en pesos ni en horas. Lo que deja es el rastro con el que se argumenta: "
            "cada choque detectado y cerrado antes de construir, con su fecha, su responsable y "
            "su resolución. Cuánto costaba cada uno lo pone quien conoce el precio de la "
            "partida."
        ),
        lo_hace=False,
        grupo=INDICADORES,
    ),
    Termino(
        sigla="Costo de no calidad",
        nombre="Lo que cuesta lo que salió mal",
        que_es=(
            "La suma del retrabajo, los rechazos, las esperas y las reclamaciones. La regla "
            "vieja es que cuesta diez veces más arreglar un problema en obra que en proyecto, y "
            "cien veces más en operación."
        ),
        en_aerobim=(
            "No lo calcula. Lo que sí distingue, y es lo que hace falta para calcularlo después, "
            "es en qué momento se encontró cada problema: una observación abierta sobre un "
            "modelo en revisión y una abierta sobre lo ya construido son el mismo registro con "
            "costos muy distintos."
        ),
        lo_hace=False,
        grupo=INDICADORES,
    ),
    Termino(
        sigla="ROI del BIM",
        nombre="Qué devuelve lo que se invirtió en coordinar",
        que_es=(
            "La comparación entre lo que cuesta coordinar —horas, licencias, modelos— y lo que "
            "se ahorra en órdenes de cambio y retrabajo evitados. Es la pregunta que hace quien "
            "firma el presupuesto, y casi siempre se contesta con estimaciones ajenas."
        ),
        en_aerobim=(
            "No lo calcula, y la mitad que le falta no es técnica: son los precios. La otra "
            "mitad sí está y es la que nadie suele tener —cuántos problemas se encontraron, "
            "cuándo, de qué tipo y en qué pantalla, y cuánto tardaron en cerrarse—, que es "
            "exactamente lo que convierte una estimación prestada en un número de esta obra."
        ),
        lo_hace=False,
        grupo=INDICADORES,
    ),
)

VOCABULARIO = Vocabulario(
    clave="gestion",
    titulo="Vocabulario de gestión y costos",
    grupos=GRUPOS,
    terminos=TERMINOS,
)
