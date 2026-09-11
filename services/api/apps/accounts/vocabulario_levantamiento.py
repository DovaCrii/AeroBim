"""El vocabulario del levantamiento: nube de puntos, MDT, ortofoto. `F11.12`.

## De dónde sale

El usuario lo pidió el 2026-09-11, justo después del vocabulario BIM: «glosario topográfico para
entender en general las diferentes especialidades… principalmente explicando el tema de nube de
puntos, DEM, ortofotos, esa es la línea».

**El motivo es el que da la tarea su forma:** aquí no se hablan dos idiomas sino tres —el de quien
vuela, el de quien topografía y el de quien modela— y las palabras que más se usan son justo las que
cada oficio entiende de otra manera. Un modelador oye «cota» y piensa en el nivel del proyecto; un
topógrafo pregunta si es elipsoidal u ortométrica, y la diferencia son decenas de metros.

## Los tres avisos que esta pantalla existe para dar

Están escritos en el término que les toca, y son de los que cuestan una obra:

1. **Cota elipsoidal y cota ortométrica no son la misma cota.** Mezclarlas mete un sesgo constante
   de decenas de metros, y AeroBim mediría la desviación y daría un número correcto sobre datos
   incomparables.
2. **Precisión no es exactitud.** Un vuelo RTK repite milímetros y puede estar corrido un metro
   entero si la base estaba mal puesta. El punto de chequeo —el que no entra en el ajuste— es la
   única medida honesta.
3. **Fotogrametría no ve el suelo bajo la vegetación**, y el LiDAR sí. De ahí que el mismo terreno
   dé dos MDT distintos según con qué se voló.

## El mismo trato que el vocabulario BIM

Cada término dice qué hace AeroBim con él, y dice que no cuando es que no: el visor abre y mide la
nube, pero **no genera MDT, no hace ortofotos, no clasifica y no cubica**. Ver `glosario.py`.
"""

from __future__ import annotations

from apps.accounts.glosario import Termino, Vocabulario

CAPTURA = "Cómo se captura"
DONDE = "Dónde cae: el sistema de referencia"
PRODUCTOS = "Qué productos salen"

GRUPOS: tuple[str, ...] = (CAPTURA, DONDE, PRODUCTOS)

TERMINOS: tuple[Termino, ...] = (
    # --- Cómo se captura -------------------------------------------------------------------
    Termino(
        sigla="Nube de puntos",
        nombre="Point cloud",
        que_es=(
            "Millones de puntos con coordenada —y a veces color, intensidad y clase— que "
            "describen lo que existe. No es una superficie ni un modelo: es una muestra de la "
            "realidad, y todo lo demás (terreno, curvas, volúmenes) se deriva de ella."
        ),
        en_aerobim=(
            "Se abre en el visor, entra al expediente como entregable con su correlativo, y se "
            "recorta sola a lo que se está mirando con un techo de memoria. Sobre el "
            "levantamiento del Camino Agrícola, 15 366 674 puntos declarados y la carga respeta "
            "el presupuesto sin que haya que diezmar el archivo a mano."
        ),
        lo_hace=True,
        grupo=CAPTURA,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Fotogrametría",
        nombre="Photogrammetry",
        que_es=(
            "Sacar geometría de fotografías: muchas tomas solapadas del mismo sitio desde "
            "ángulos distintos, y de ahí la posición de cada punto. Es lo que hace un dron con "
            "cámara."
        ),
        en_aerobim=(
            "No la hace: AeroBim recibe el producto ya procesado. Quien planifica el vuelo y "
            "controla el solape es AeroPlanner. Lo que sí importa saber aquí es su límite —el de "
            "abajo, en LiDAR—: la fotogrametría solo ve lo que sale en las fotos, así que bajo "
            "vegetación densa no hay suelo que medir."
        ),
        lo_hace=False,
        grupo=CAPTURA,
    ),
    Termino(
        sigla="LiDAR",
        nombre="Light Detection and Ranging",
        que_es=(
            "Medir distancias con un láser que barre el terreno. A diferencia de la "
            "fotogrametría, un mismo disparo devuelve varios ecos —hoja, rama, suelo—, así que "
            "se puede quedar con el último y llegar al terreno bajo la copa de los árboles."
        ),
        en_aerobim=(
            "No lo captura, pero sí le saca partido a lo que trae: la intensidad del retorno es "
            "uno de los modos de color del visor, y es el que distingue asfalto de tierra o de "
            "pasto cuando el color de la foto no lo hace."
        ),
        lo_hace=False,
        grupo=CAPTURA,
    ),
    Termino(
        sigla="Densidad de puntos",
        nombre="Puntos por metro cuadrado",
        que_es=(
            "Cuántos puntos hay por metro cuadrado. Decide qué se puede medir: con 10 pts/m² un "
            "bordillo de 15 cm es ruido, y con 400 pts/m² se ve la junta. Es el número que hay "
            "que pedirle a quien vuela, antes del vuelo y no después."
        ),
        en_aerobim=(
            "No la calcula. Lo que informa es cuántos puntos cargó de cuántos declara el archivo "
            "y cuánta memoria ocupan, que es otra pregunta: la de si cabe, no la de si alcanza "
            "para medir lo que hay que medir."
        ),
        lo_hace=False,
        grupo=CAPTURA,
    ),
    Termino(
        sigla="GSD",
        nombre="Ground Sample Distance · Tamaño del píxel en el suelo",
        que_es=(
            "Cuántos centímetros de terreno mide un píxel de la foto. Un GSD de 2 cm/px quiere "
            "decir que lo que sea más chico que eso no está en la imagen, por mucho que se "
            "amplíe. Lo fija la altura de vuelo y la cámara."
        ),
        en_aerobim=(
            "No: es una cifra del vuelo, y se decide antes de despegar. Se nombra aquí porque es "
            "la que contesta «¿se va a ver la grieta?» y porque se confunde con la precisión, "
            "que es otra cosa."
        ),
        lo_hace=False,
        grupo=CAPTURA,
    ),
    # --- Dónde cae -------------------------------------------------------------------------
    Termino(
        sigla="Sistema de referencia",
        nombre="EPSG, UTM, huso",
        que_es=(
            "El acuerdo sobre qué significan las coordenadas. Se nombra con un código EPSG: el "
            "de esta obra es EPSG:32719, que es WGS 84 proyectado en UTM huso 19 sur. Dos "
            "archivos con códigos distintos no se pueden comparar aunque los dos digan «metros»."
        ),
        en_aerobim=(
            "Lee el sistema declarado en la cabecera del COPC y lo dice. Y hace algo que no se "
            "ve y sostiene todo lo demás: resta el origen antes de bajar a coma flotante de 32 "
            "bits. Sin eso, un norte UTM de 6 292 883 m pierde 115 mm por redondeo; restándolo, "
            "0,0037 mm."
        ),
        lo_hace=True,
        grupo=DONDE,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Cota elipsoidal y cota ortométrica",
        nombre="Altura h, altura H y el geoide",
        que_es=(
            "Un GNSS mide altura sobre el elipsoide, que es una figura matemática. La cota que "
            "usa un proyecto es la ortométrica, sobre el nivel medio del mar, y se obtiene "
            "restando la ondulación del geoide. En Chile continental esa diferencia son varias "
            "decenas de metros, y localmente es casi constante: por eso se cuela sin que nada "
            "parezca raro."
        ),
        en_aerobim=(
            "No convierte entre una y otra, y conviene saberlo antes de medir: si el modelo está "
            "en cota de proyecto y la nube llega en cota elipsoidal, la desviación se calcula "
            "bien y sale con decenas de metros de sesgo. El número sería correcto sobre datos "
            "que no se pueden comparar. La conversión se hace al procesar la nube, con el modelo "
            "de geoide que use la obra."
        ),
        lo_hace=False,
        grupo=DONDE,
    ),
    Termino(
        sigla="Precisión y exactitud",
        nombre="Repetir siempre igual, y acertar",
        que_es=(
            "Precisión es repetir el mismo valor; exactitud es que ese valor sea el verdadero. "
            "Un vuelo RTK puede repetir milímetros y estar corrido un metro entero si la base "
            "estaba mal puesta: precisión altísima, exactitud mala. Los dos se dicen «precisión» "
            "en la conversación diaria y son la causa de la mitad de los malentendidos."
        ),
        en_aerobim=(
            "La medición de desviación separa las dos: la mediana y la máxima hablan de "
            "dispersión, y el sesgo —la media con signo— es lo que delata un corrimiento "
            "sistemático. Sobre el muro de prueba, con un corrimiento puesto a propósito, el "
            "sesgo salió en el número exacto de ese corrimiento."
        ),
        lo_hace=True,
        grupo=DONDE,
        ruta="visor:visor",
    ),
    Termino(
        sigla="RTK y PPK",
        nombre="Real Time Kinematic · Post Processed Kinematic",
        que_es=(
            "Dos formas de corregir la posición del GNSS con una estación de referencia: RTK en "
            "vivo por radio o internet, PPK después del vuelo con los registros de ambos. Llevan "
            "el error de metros a centímetros."
        ),
        en_aerobim=(
            "No: es del levantamiento, y llega resuelto en las coordenadas del archivo. Importa "
            "aquí porque de ello depende si la nube cae sobre el modelo o al lado."
        ),
        lo_hace=False,
        grupo=DONDE,
    ),
    Termino(
        sigla="Punto de apoyo y punto de chequeo",
        nombre="GCP y checkpoint",
        que_es=(
            "Puntos del terreno medidos con topografía. Los de apoyo entran en el ajuste del "
            "vuelo y lo amarran al sistema; los de chequeo se miden igual y se dejan fuera a "
            "propósito. El residuo en un punto de apoyo dice lo bien que ajustó; el residuo en "
            "uno de chequeo es la única medida honesta del error."
        ),
        en_aerobim=(
            "No gestiona puntos de apoyo. Lo que sí hace, y es la misma idea, es el calce manual "
            "por tres pares de puntos: se señalan en el modelo y en la nube, y el visor devuelve "
            "el residuo medio y el máximo de ese ajuste. El calce automático por "
            "IfcMapConversion va primero, cuando el modelo lo trae."
        ),
        lo_hace=False,
        grupo=DONDE,
    ),
    Termino(
        sigla="Georreferenciación y calce",
        nombre="Llevar la nube y el modelo al mismo sitio",
        que_es=(
            "Un IFC viene casi siempre en coordenadas locales de proyecto, con el norte girado; "
            "la nube viene georreferenciada del vuelo. Calzar es la transformación que los pone "
            "en el mismo sistema, y sin ella medir la desviación es medir basura con dos "
            "decimales."
        ),
        en_aerobim=(
            "Sí, por dos caminos. El automático lee el IfcMapConversion del modelo —el "
            "emplazamiento que escribe la herramienta de autoría— y el manual pide tres pares de "
            "puntos y devuelve giro, desplazamiento, cota y el residuo. El calce se deshace, así "
            "que probar no cuesta."
        ),
        lo_hace=True,
        grupo=DONDE,
        ruta="visor:visor",
    ),
    # --- Qué productos salen ---------------------------------------------------------------
    Termino(
        sigla="LAS y LAZ",
        nombre="El formato de la nube, y su versión comprimida",
        que_es=(
            "LAS es el formato estándar de nube de puntos; LAZ es el mismo comprimido, sin "
            "pérdida y a un quinto del tamaño. Guardan por punto la coordenada, la intensidad, "
            "la clase, el color y el número de retorno."
        ),
        en_aerobim=(
            "Los dos entran al registro como entregable de obra, con su topógrafo y su fecha: es "
            "lo que entrega un topógrafo y rechazarlo obligaría a archivar solo la copia "
            "convertida. Para abrirlos en el visor hace falta que estén en COPC, que es lo de "
            "abajo."
        ),
        lo_hace=True,
        grupo=PRODUCTOS,
        ruta="documents:entregables",
    ),
    Termino(
        sigla="COPC",
        nombre="Cloud Optimized Point Cloud",
        que_es=(
            "Un LAZ con un índice de octree dentro: el archivo queda organizado por zonas y por "
            "niveles de detalle, así que un programa puede leer solo el trozo que necesita en "
            "vez de cargar los tres gigabytes enteros. Es lo que hace posible abrir un "
            "levantamiento en un navegador."
        ),
        en_aerobim=(
            "Es el formato que abre el visor, y el motivo por el que abre. Sobre el "
            "levantamiento real: 1329 nodos de octree en seis niveles, y se traen los que se "
            "están mirando. La conversión desde el LAS original se hace con PDAL antes de "
            "subirlo."
        ),
        lo_hace=True,
        grupo=PRODUCTOS,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Clasificación",
        nombre="Suelo, vegetación, edificación",
        que_es=(
            "Etiquetar cada punto con lo que es, según una tabla estándar: 2 es suelo, 3 a 5 "
            "vegetación por altura, 6 edificación. Es el paso que convierte una nube en algo con "
            "lo que se puede trabajar — sin él no hay MDT, porque no se sabe qué puntos son "
            "terreno."
        ),
        en_aerobim=(
            "Lee la clase que traiga el archivo y pinta por ella, pero no clasifica: eso se pide "
            "al procesar la nube. Y avisa cuando no sirve — el levantamiento del Camino Agrícola "
            "trae la dimensión con el mismo valor en los quince millones de puntos, o sea sin "
            "clasificar, y el visor lo dice y pinta por altura en vez de dejar la pantalla de un "
            "solo gris."
        ),
        lo_hace=True,
        grupo=PRODUCTOS,
        ruta="visor:visor",
    ),
    Termino(
        sigla="Intensidad",
        nombre="La fuerza del retorno del láser",
        que_es=(
            "Cuánta luz devolvió cada punto. Depende del material y de la humedad más que del "
            "color, así que separa cosas que una foto no separa: asfalto de hormigón, tierra "
            "compactada de suelta, una marca vial del pavimento."
        ),
        en_aerobim=(
            "Es uno de los cuatro modos de color del visor —altura, clase, intensidad y el color "
            "del levantamiento—, y sobre el levantamiento real da más de doscientos tonos "
            "distintos, o sea que distingue de verdad."
        ),
        lo_hace=True,
        grupo=PRODUCTOS,
        ruta="visor:visor",
    ),
    Termino(
        sigla="MDT y MDS",
        nombre="Modelo Digital del Terreno y de Superficie · DTM y DSM",
        que_es=(
            "Dos mallas de alturas que se confunden todo el tiempo. El MDS es la superficie tal "
            "cual: con los árboles, los postes y los techos. El MDT es el terreno desnudo, con "
            "todo eso quitado. Para cubicar movimiento de tierras hace falta el MDT; usar el MDS "
            "mete el volumen de la vegetación en la partida. «DEM» se usa para cualquiera de los "
            "dos, y por eso conviene decir cuál."
        ),
        en_aerobim=(
            "No los genera: hacen falta la clasificación y una interpolación, y las dos son del "
            "procesamiento de la nube. Lo que hay aquí es la nube misma —que es el dato del que "
            "salen los dos— y la medición de desviación contra el modelo, que no necesita malla."
        ),
        lo_hace=False,
        grupo=PRODUCTOS,
    ),
    Termino(
        sigla="Ortofoto",
        nombre="Ortomosaico",
        que_es=(
            "Una imagen aérea corregida para que tenga escala uniforme, como un plano. Una foto "
            "normal tiene perspectiva y no se puede medir sobre ella; una ortofoto sí. Se "
            "construye a partir del MDS, así que su calidad depende de la del modelo de "
            "superficie."
        ),
        en_aerobim=(
            "No. Es un producto del vuelo y se genera en el procesamiento; la Fase 6 del plan "
            "—la vista geoespacial con ortofoto y terreno de fondo— está pospuesta por decisión. "
            "Un PDF o una imagen de la ortofoto sí se archiva como entregable."
        ),
        lo_hace=False,
        grupo=PRODUCTOS,
    ),
    Termino(
        sigla="Curvas de nivel y TIN",
        nombre="Contornos, y malla de triángulos",
        que_es=(
            "Dos formas de enseñar un terreno. El TIN es una malla de triángulos entre puntos; "
            "las curvas de nivel son los cortes horizontales de esa malla a intervalos fijos. "
            "Las dos se derivan del MDT, así que heredan sus errores."
        ),
        en_aerobim=(
            "No las genera. Es el camino natural si alguna vez hace falta, porque parte del "
            "mismo sitio que el MDT; hoy no está y un plano de curvas se archiva como documento."
        ),
        lo_hace=False,
        grupo=PRODUCTOS,
    ),
    Termino(
        sigla="Cubicación",
        nombre="Volumen entre dos superficies",
        que_es=(
            "Cuánto material hay entre dos estados del terreno: lo excavado y lo rellenado entre "
            "el levantamiento de hoy y el del mes pasado, o entre el terreno y la rasante de "
            "proyecto. Es la medición que se factura."
        ),
        en_aerobim=(
            "No cubica. Lo que hay es la desviación punto a malla —cuánto se separa lo "
            "construido de lo modelado, con su mediana, su máxima y su sesgo—, que contesta "
            "«¿está donde debía?» y no «¿cuánto material hay?». Son dos preguntas distintas y la "
            "segunda pide dos superficies, no una nube y un modelo."
        ),
        lo_hace=False,
        grupo=PRODUCTOS,
    ),
    Termino(
        sigla="Desviación",
        nombre="Lo construido contra lo modelado",
        que_es=(
            "La distancia de cada punto del levantamiento a la superficie del modelo. Es la "
            "comparación para la que sirve todo lo anterior: dice si el muro se construyó donde "
            "estaba dibujado, y de cuánto es la diferencia."
        ),
        en_aerobim=(
            "Sí, y es de lo poco que el producto hace entero. Se señala un elemento, se mide "
            "contra la nube calzada y devuelve mediana, máxima y sesgo. El ITO abre con eso una "
            "observación anclada al GUID del elemento y con la coordenada del punto medido, y el "
            "proyectista la contesta en el mismo hilo."
        ),
        lo_hace=True,
        grupo=PRODUCTOS,
        ruta="visor:visor",
    ),
)

VOCABULARIO = Vocabulario(
    clave="levantamiento",
    titulo="Vocabulario del levantamiento",
    grupos=GRUPOS,
    terminos=TERMINOS,
)
