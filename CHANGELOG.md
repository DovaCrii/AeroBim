# Changelog — AeroBim

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Decidido — el visor abrirá **COPC**, y `float32` perdía 20 cm en UTM (`F2.5`, 2026-09-03)

**El formato que entra es COPC** (`.copc.laz`), convertido con `pdal` fuera de la aplicación. Está en
[`docs/NUBES_DE_PUNTOS.md`](docs/NUBES_DE_PUNTOS.md), y se decidió midiendo, no recordando.

**Potree quedó descartado, y por razones comprobables.** Los tres cargadores que existen para
Three.js no sirven con el visor de hoy: `@pnext/three-loader` fija `three: ~0.160.0` y estamos en
0.185.1, y `potree-loader` se construyó contra three 0.138.3 y arrastra **`vite ^2.8.6` como
dependencia de runtime** teniendo nosotros vite 8. Por encima de eso hay una razón de producto:
`PotreeConverter` produce **un directorio con miles de archivos** y el registro documental guarda un
archivo por documento. COPC es un archivo, cabe en el expediente, y **CloudCompare lo abre** —con lo
que el oráculo de la fase sigue existiendo—.

**Y el cruce con el IFC se comprobó, no se supuso.** Escribiendo y leyendo un COPC de verdad en UTM
19S: el `AUTHORITY["EPSG","32719"]` vuelve intacto dentro del archivo, el nodo raíz se puede pedir
solo —977 puntos, el 18 % del archivo— y **pedir la caja de un elemento devolvió 260 puntos en
17 ms**, con sus clases. Eso _es_ el cruce: la caja del elemento del IFC, los puntos de dentro, la
desviación.

> **El hallazgo caro: `float32` pierde 200 mm en la coordenada norte de un UTM chileno.**
> WebGL solo acepta `Float32Array` y un `float32` tiene siete cifras significativas; la coordenada
> norte de Santiago (6 298 000 m) ya las gasta en la parte entera. Medido sobre 62 500 puntos:
> **200 mm de error en el norte**, 12,5 mm en el este, 0 en la altura. Los mismos puntos restando
> primero el desplazamiento de la cabecera: **0,003 mm**.
>
> Con 200 mm de regla, la promesa de `F2.4` —medir la desviación entre lo construido y lo modelado—
> era imposible. Y falla de la peor manera: el error no es ruido sino un escalonado, así que **la
> nube se ve perfectamente bien y miente con dos decimales**. De ahí un requisito del formato que no
> es negociable: el archivo tiene que traer el desplazamiento dentro.

**Dos módulos nuevos en `bim-core`, probados**, porque estas cuentas no pueden volver a perderse:
`nubes/precision.ts` —el error y el escalón del `float32`, con los vectores medidos en Python como
oráculo— y `nubes/presupuesto.ts` —lo que pesa una nube en la tarjeta, verificado contra Three.js
r185 leyendo `BufferAttribute.array.byteLength`: 15 bytes por punto con color, **y se pagan dos
veces**, así que 50 millones de puntos son **1,5 GB**—. Eso es por qué hace falta un octree y no un
`loader`.

**Los comandos de `pdal` van marcados como no ejecutados**, porque `pdal` no está instalado en la
máquina de desarrollo —tampoco `PotreeConverter`, `untwine` ni `entwine`—: están escritos desde su
documentación y hay que correrlos antes de darlos por buenos. Y queda dicho lo que **no** está
verificado: que `copc` + `laz-perf` abran en el navegador el archivo que escribe `pdal`. Es lo primero
que tiene que hacer `F2.1`, antes de escribir una línea de cargador.

### Añadido — una sección de ayuda con el recorrido de cómo se usa (`F11.7`, 2026-09-02)

**Nueve pasos, en el orden en que se trabaja de verdad** y no por módulos: entrar en la obra, abrir
el modelo, mirar y medir, dejar una nota, cruzar los modelos, repartir y seguir, sacar el papel,
mandar y recibir BCF, sacar los planos. Cada paso dice **para qué sirve** —que es lo que casi nunca
está escrito en una ayuda y lo único que hace falta para decidir si te interesa—, qué hacer, y lleva
a la pantalla de verdad. Está en la barra de todas las pantallas: se busca desde donde uno se ha
atascado, no volviendo a la puerta.

**Se descartó el recorrido con globos sobre la interfaz**, que era la otra forma: se ancla a
selectores y el día que un botón se mueve de panel el globo apunta a otro sitio y la ayuda miente sin
avisar. Y habría que escribirlo dos veces, porque el portal y el visor son dos aplicaciones.

**Enseña el flujo entero marcando lo que no te toca**, al contrario que el portal, que esconde lo que
tu rol no puede abrir. Ahí esconderlo es correcto; aquí sería mentir por omisión: quien lo lee no
entendería de dónde le llegan las observaciones que tiene que contestar. Con el rol de mandante, 3 de
los 9 pasos salen marcados **con quién los hace** y sin botón que acabaría en 403.

Y lo que impide que se desfase: cada destino resuelve con el enrutador, **cada destino está además
en el catálogo del portal** —si un módulo se quita, el gate lo dice— y cada permiso que nombra existe
de verdad. Un permiso mal escrito no falla: calla, y el paso saldría marcado como ajeno para todo el
mundo.

### Añadido — la lámina de un plano sale en PDF, en Carta y con el sello de la casa (`F7.5`, 2026-09-02)

**Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** El visor ya sacaba
el DXF; esto cubre el caso más común, que es mandarle la planta a alguien que no tiene AutoCAD.
Botón «Exportar a PDF (Carta)» en la ficha de cada plano generado.

**El navegador proyecta y el servidor compone el papel**: proyectar aristas necesita un renderizador
—en un servidor sin pantalla no lo hay— y el membrete de J.E.J. ya vive en el servidor. Es la misma
decisión que el usuario tomó para el informe: desde el servidor, para que sea interno.

Lo que viaja son los segmentos y textos ya situados, los mismos que se escriben en el DXF, así que
**el PDF y el DXF dibujan el mismo plano**. Y solo las capas encendidas: el papel dice lo mismo que
la pantalla.

- **La misma escala en los dos ejes, y escrita en la hoja.** Escalar cada eje por su cuenta llenaría
  más el papel y deformaría el plano, que es lo peor que le puede pasar a un dibujo del que alguien
  va a medir.
- **Tope de 60.000 segmentos, y cuando se recorta se dice en el propio papel.** Una lámina que calla
  lo que dejó fuera hace creer que el plano está completo.

El membrete se extrajo a su propio módulo y lo usan el informe y la lámina: con una copia en cada
salida, la segunda se queda atrás en el primer cambio y el producto manda dos papeles distintos con
el mismo nombre.

Las cotas todavía no salen en el PDF, solo en el DXF: las dibuja la librería dentro de sus grupos y
sacarlas de ahí sería leer sus entrañas.

### Añadido — el plano lleva sus ángulos, sus pendientes y sus hallazgos señalados (`F7.3`, 2026-09-03)

Con esto la lámina lleva **las cuatro anotaciones** y la Fase 7 cierra entera.

- **Los ángulos** se llevan igual que las cotas: un ángulo medido tiene tres puntos y el del plano
  también, así que la traducción es directa.
- **La pendiente no se mide: ya está medida.** Una cota entre dos puntos a distinta altura lleva
  dentro la diferencia de altura y el recorrido, así que la pendiente se deriva. Añadir una
  herramienta para pedir otra vez lo que ya se sabe sería preguntar dos veces lo mismo. Va cuesta
  abajo —la flecha apunta a donde corre el agua— y lo que está a nivel se salta con un umbral en
  milímetros: dos puntos de la misma losa difieren en décimas y anotar «0,02 %» es ruido.
- **Las llamadas señalan dónde cayó el elemento de cada hallazgo en el plano.** Un plano que dice
  «aquí falta la cota del vano V-03» es un plano con el que se va a obra; sin ellas, el plano y la
  lista de hallazgos son dos papeles que hay que cruzar a mano.

Y la posición de un hallazgo **no se estima**: la proyección devuelve a qué elemento pertenece cada
grupo de vértices, así que la posición es el centro de sus vértices **proyectados** — dónde está
dibujado de verdad, no dónde estaría su caja del modelo, que en una planta puede caer fuera del
dibujo.

Las cotas, los ángulos y las pendientes van en **un solo botón**: quien acota no quiere elegir «ahora
las cotas, ahora los ángulos», y las tres salen de lo mismo. Las llamadas van aparte porque salen de
otro sitio: los hallazgos de la obra.

Comprobado leyendo el DXF: las cuatro escriben su valor —`10.00 m`, `90.00°`, `15.00 %` y el título
del hallazgo—. Una anotación que no escribe su valor no es una anotación.

### Añadido — el acotado del plano sale del modelo (`F7.3`, 2026-09-02)

**Las cotas que ya se midieron sobre el modelo se llevan a la lámina y salen en el DXF con su
número.** El botón está en la ficha de cada plano generado: «Acotar con las 3 mediciones».

Acotar encima del dibujo sería **medir dos veces la misma cosa** y arriesgarse a dos números
distintos. Midiendo una vez sobre el modelo —con el ajuste a vértice, que es lo que hace que dos
personas midan lo mismo— el número del plano es el número del modelo por construcción.

Los puntos se proyectan sobre el plano del dibujo, así que **una cota entre dos alturas distintas
sale acortada**: es lo correcto, en una planta una diagonal que sube se dibuja más corta. Y una
medición que se proyecta a un punto —una vertical en una planta— no es una cota y se salta: la ficha
dice **cuántas entraron**, no «hecho».

Comprobado con el oráculo del DXF: la cota del lado de 10 m escribe **`10.00 m`** en el archivo. Una
cota que no escribe su número no es una cota.

Quedan los ángulos, las pendientes y las llamadas, que son anotación de detalle: acotar es lo que
hace falta para que una planta se construya.

### Añadido — la lámina sale con su cuadro dentro (`F10.4`, 2026-09-02)

**Un plano con el modelo dibujado y sin cuadro obliga a llevar dos papeles a la obra, y el segundo se
pierde.** Ahora el plano generado lleva su tabla dentro —título, cabecera y filas, debajo del
dibujo— en el mismo DXF, y se ve también en pantalla.

Se pone desde «Planos generados» cuando hay un cuadro cargado, y el botón dice de qué categoría es:
poner «el cuadro» sin saber cuál es una lámina que hay que volver a hacer.

**La tabla del papel no es la de la pantalla**, y eso es deliberado: en pantalla hay veinticuatro
columnas y se puede desplazar; en una lámina son ilegibles a cualquier escala. Se quedan las seis que
más filas llevan y cuarenta filas, con lo que no cupo dicho en el título. Y las celdas se recortan a
22 caracteres con `…`, porque hay valores de sesenta y sin tope la tabla mide cuarenta metros de
papel.

Lo que costó averiguar: el exportador de DXF escribe líneas de toda la geometría pero **texto solo de
los sistemas de anotación**, y una tabla sin texto son cuadrículas vacías. La aritmética de la tabla
vive en una sola función que usan la pantalla y el DXF — con dos cálculos, el cuadro que se imprime y
el que se ve se separan en la primera columna que cambie de ancho.

### Añadido — cuadros desde el modelo: una categoría, sus elementos y sus propiedades (`F10.5`, 2026-09-02)

**Es el cuadro de carpinterías o de pilares de una oficina.** El visor sabía enseñar las propiedades
de un elemento al clicarlo; ahora las enseña de todos a la vez, que es cuando se ve lo que falta —el
perfil sin nombre, los diez muros sin material—. Medido sobre un modelo de 32 MB: 300 filas de 805
perfiles con 24 columnas en 155 ms, con los pesos en kg, los volúmenes en m³ y las medidas en mm
leídas del propio archivo.

Se ordena por cualquier columna, se filtra por texto, y **el nombre de cada fila lleva al elemento en
el modelo**: es lo que lo convierte en una herramienta de revisión y no en una tabla. Y se descarga
como CSV, con `;` y BOM igual que el informe del servidor.

Tres cosas que no se ven y sostienen lo demás:

- **Las columnas se descubren de los datos** y se ordenan por cuántas filas las llevan. Un IFC no
  tiene un juego fijo de propiedades, así que una lista escrita a mano enseñaría columnas vacías y
  esconderia las que ese modelo sí trae.
- **Solo se ofrecen las categorías con geometría.** Las tres más numerosas de ese archivo son
  `IFCPROPERTYSINGLEVALUE` (23.946), `IFCPROPERTYSET` (839) e `IFCSIUNIT` (10): fontanería del
  formato, no cosas del edificio. Sin el filtro, lo primero que se veía era eso.
- **El cuadro y la ficha de un elemento leen por el mismo camino**, así que no pueden discrepar sobre
  un valor ni sobre una unidad. Hay una comprobación que lo cruza celda por celda.

Se leen como mucho 300 elementos por cuadro —leer propiedades es una consulta por elemento— y
**cuando se corta se dice**, con el total al lado.

### Corregido — el DXF de un plano generado salía con la mitad del dibujo recortada (`F7.2`, 2026-09-02)

**El viewport se construía con las coordenadas equivocadas y el recorte se comía el plano.** La
librería define la vertical del papel como el eje Z negado —su caja de recorte es `Z ∈ [-top,
-bottom]`— y el código pasaba las Z tal cual, así que la caja quedaba al otro lado del dibujo.

Medido sobre un rectángulo de 10 × 6 m con diagonal: salían **4 de 5 segmentos**, el borde superior
desaparecía entero y la diagonal se cortaba a un octavo de su largo. Con las coordenadas de papel
salen los cinco.

**Y no lo veía nadie porque el oráculo medía el marco y no el cuadro**: la comprobación anterior
miraba la extensión del DXF, que la marca el recuadro del viewport y no el dibujo, así que cuadraba
igual con el plano recortado que con el entero. Ahora se comparan las coordenadas capa por capa
contra una geometría de medidas conocidas.

### Añadido — el DXF sale con capas con nombre (`F7.2`, 2026-09-02)

**Todo salía en la capa `0`**, y un plano en el que todo es la misma capa no es un entregable: quien
lo abre en el CAD no puede apagar las aristas ocultas, ni darles otro grosor, ni congelarlas para
acotar encima. Ahora salen `AB-VISIBLE` y `AB-OCULTA`, con prefijo para no mezclarse con las capas
de la oficina al insertar el plano en otro archivo.

La causa era que el código colgaba las líneas a mano en vez de usar la API de capas que la librería
tenía desde el principio. Apagar las aristas ocultas va también por la capa, así que la pantalla y el
DXF ya no pueden discrepar.

El grosor de trazo queda dicho y no supuesto: el exportador no lo escribe, así que las capas salen
con «por defecto» y la jerarquía de grosores habría que ponerla en el CAD.

### Corregido — cambiar de proyección mientras se mueve la cámara dejaba el modelo sin dibujar (2026-09-02)

**El visor esperaba un aviso que nadie iba a dar.** Al cambiar de proyección se refrescaba una vez,
y el refresco de verdad se dejaba para cuando la cámara avisara de que había parado. Pero
camera-controls avisa al **terminar** un movimiento, y el cambio de proyección interrumpe el que
está en marcha: ese aviso no llegaba nunca. Medido: la escena se quedaba sin mallas y seguía así dos
segundos después sin que nadie tocara nada; con el aviso emitido a mano volvía a dibujar.

Es lo que el usuario reportó como «al momento de mover y cambiar de órbita a ortográfica pasaba
eso». Ahora el refresco no se cuelga solo del evento: se pide también un poco después, a ciegas.

En la misma pasada se cerró otra asimetría: **entrar** en la vista fantasma tenía un bucle que
insiste hasta que no queda geometría sin pintar y **salir** no tenía nada equivalente, así que una
malla creada después de volver a sólido nacía translúcida y nadie la devolvía.

**Lo que queda abierto va dicho en el plan**: volver de ortográfica a perspectiva termina sin mallas
también con la cámara quieta, y este entorno no puede distinguir un defecto de un artefacto —el
panel del navegador no compone fotogramas, y el auditor cuenta mallas que se crean al dibujar—. La
receta para reproducirlo está en el modo de diagnóstico.

### Corregido — el visor no podía escribir nada desde un navegador (2026-09-02)

**Dejar una nota sobre un elemento, descartar un conflicto, marcar la coordinación como vista y
guardar una vista compartida: las cuatro devolvían 403.** No por permisos ni por sesión caducada,
que es lo que decía el mensaje, sino porque la cookie del testigo CSRF estaba marcada como
`HttpOnly` y el visor no podía leerla: mandaba la cabecera vacía en cada petición.

Lo encontró el usuario intentando anotar un elemento con un rol que **sí** puede abrir
observaciones, y el visor le contestó «tu sesión caducó o tu rol no puede abrir observaciones». Ni
una cosa ni la otra, y el mensaje le mandaba a buscar el problema donde no estaba.

**Y el gate entero pasaba en verde**, porque el cliente de pruebas de Django no comprueba CSRF: las
cuatro capacidades funcionaban en las pruebas y en ningún navegador. Ahora hay pruebas que hacen lo
que hace el navegador —comprobación activada y el testigo leído de la cookie— así que volver a
esconderla falla aquí en vez de descubrirse anotando en obra.

La cookie de **sesión** sigue siendo `HttpOnly`, que es la que de verdad protege; `HttpOnly` en la
del CSRF no aporta protección real, y lo dice la documentación de Django.

De paso, el mensaje de error distingue las tres causas —falta el testigo, sesión caducada, rol sin
permiso—, que eran tres cosas distintas dichas con la misma frase.

### Corregido — ordenar por prioridad devolvía alta, baja, media (2026-09-02)

**Los valores guardados son palabras**, así que `ORDER BY prioridad` los ordena por letra y la
prioridad baja se colaba entre la alta y la media. Estaba en el informe desde que se escribió y no
se notó porque la obra de desarrollo no tenía ni un hallazgo de prioridad baja. Lo mismo con el
estado: por letra, lo cerrado salía antes que lo que espera respuesta.

El peso vive ahora en un solo sitio y lo usan la pantalla de la obra, la lista general y el informe:
con una copia en cada sitio se llega a una pantalla que ordena de una forma y un PDF de la misma
consulta que ordena de otra. Hay una prueba que compara las dos salidas.

### Añadido — la lista de observaciones se ordena y se filtra por columna (2026-09-02)

**«Poder ordenarlos por columna como yo quiera, filtrarlos.»** Cada cabecera ordena por su columna
y vuelve a pincharla le da la vuelta; la que manda lleva su flecha, porque una tabla ordenada que no
dice por dónde lo está obliga a deducirlo leyendo las filas. Y hay filtros por prioridad, estado y
obra.

Va por URL y no ordenando la tabla en el navegador, por dos razones: la lista está **paginada**, así
que ordenar sólo las cincuenta filas visibles daría un orden falso —el hallazgo más urgente puede
estar en la página tres—, y con el orden en la URL **una vista se puede guardar en favoritos y
mandar por correo**, que es lo que hace quien revisa lo mismo cada semana. Ordenar tampoco se lleva
por delante el filtro que había puesto, que es el defecto clásico de una tabla ordenable.

### Cambiado — el estado y la prioridad se distinguen por color (2026-09-02)

**«El estado cerrado o abierta: cambiar color, que sea visible y trazable más claro.»** Las dos iban
como la misma ficha gris. Ahora el estado lleva el color de su paso —ámbar lo que espera algo,
violeta lo que está en marcha, verde lo cerrado, gris lo descartado— y **son los mismos colores del
paso a paso de la ficha**, así que se sigue el mismo color de la lista al detalle.

Y lo mismo en la prioridad, que era el otro extremo de la fila: alta en rojo, media en ámbar y baja
en gris, las tres con relleno. Antes media y baja eran dos grises que se distinguían leyendo la
palabra.

### Cambiado — las herramientas de la obra, en dos cajas y no en una pila (2026-09-02)

**«Está mal distribuido, muy junto y poco entendible el flujo, sobre todo en las observaciones
abiertas y lo que está abajo.»** Debajo de la tabla había cinco filas de controles seguidas sin nada
que dijera dónde acaba una herramienta y empieza la otra: dos selectores, tres casillas, dos
botones, una explicación, un selector de archivo, otro botón y otra explicación.

Son dos herramientas independientes —sacar el informe y meter un BCF que llega— y ahora se dibujan
como dos, cada una en su caja y con su nombre. Una al lado de la otra y no apiladas: apiladas, la
pantalla decía que la segunda venía después de la primera.

### Cambiado — la ficha de un hallazgo se lee en dos columnas (`F11.9`, 2026-09-02)

**«Este flujo no es práctico ni comprensible y se ve mal distribuido.»** Era la segunda vez que el
usuario se quejaba de esta pantalla, ya con las migas y el paso a paso puestos — y con razón: eran
cuatro secciones apiladas con el mismo peso —hilo, responder, etiquetas, cerrar— en un monitor donde
sobraba media pantalla.

Quien entra a un hallazgo hace una de dos cosas: **leer de qué va** o **hacer algo con él**. Ahora
eso son las dos mitades de la pantalla. A la izquierda la conversación —de qué va, qué se ha dicho,
responder—, con la medida de una columna de lectura y no la del monitor. A la derecha la ficha: en
qué punto va, de quién es, sobre qué está, cómo está clasificado y cómo se cierra.

- **El hilo es una conversación y no una tabla**, y se distingue lo que escribió quien mira: sus
  mensajes van al otro lado y con el color de la marca.
- **El rótulo de cada campo va encima de la caja**, no flotando a media altura a su izquierda.
- **Cerrar deja de parecer la acción principal.** Responder se hace todos los días y cerrar una vez;
  con los dos como bloques iguales, el de abajo ganaba por estar abajo.

Y una corrección de nombres: la miga dice **«Observaciones»**, igual que el portal y el título de la
pantalla a la que lleva. «Hallazgo» se queda donde es una palabra de columna, no de sección.

### Corregido — los iconos del portal eran violetas aunque cada grupo tenía su color (`F11.10`, 2026-09-02)

**Los cinco acentos del portal estaban medidos y aplicados, y aun así los doce iconos salían
violetas.** La causa era una sola línea: el trazo del icono estaba clavado en el violeta de la marca,
y como los dibujos son de trazo y no de relleno, el color del grupo solo pintaba la baldosa de
detrás. El comentario del archivo de iconos afirmaba desde el primer día que heredaban el color;
ahora es verdad.

Es además un defecto que engaña al medirlo: la propiedad `color` devolvía el acento correcto
mientras lo que se ve en pantalla es el `stroke`.

En la misma pasada, y a petición del usuario —«mejorar las etiquetas de ayuda y los logos, buscar
los mejores nombres para cada sección»:

- **El tono también se mide, no solo el contraste.** El cian del modelo y el verde de coordinación
  estaban a 21 grados de tono, o sea que a 18 px eran el mismo color. El modelo pasa a azul y la
  coordinación a verde; el par más cercano queda a 63 grados. Administración baja a gris casi puro:
  no es una etapa del trabajo. Los diez valores siguen pasando AA sobre las dos superficies.
- **Los nombres de sección dicen de qué tratan y no qué clase de objeto son**: «Las obras», «El
  modelo», «El registro documental», «Coordinación», «Administración».
- **«Lo mío» pasa a Coordinación**, que es donde vive lo que lista. Estaba en documentos porque el
  permiso que pide es de observaciones, y el permiso no es el sitio.
- **Las líneas de ayuda, reescritas enteras** para contestar «qué encuentro ahí» sin repetir el
  título y sin prometer lo que no hay.
- **Tres iconos que eran la misma mancha a 18 px**, rehechos: organización era el mismo cubo que el
  visor, y entregable, requisito y observación eran tres hojas casi iguales.

### Añadido — el informe se pide por etiqueta (`F10.1`, 2026-09-02)

**«Todo lo de instalaciones que sigue abierto» era la consulta que no se podía escribir.** Un
hallazgo tenía prioridad, responsable, estado y disciplina, y nada que dijera **de qué va** más allá
de la especialidad de su documento.

Ahora cada obra define su vocabulario —«instalaciones», «obra ejecutada», «pendiente de mandante»,
«afecta a presupuesto»— y un hallazgo lleva las que le correspondan, con su color y su palabra. El
informe en PDF y la tabla en CSV se pueden pedir por una de ellas, y **el encabezado escribe el
nombre de la etiqueta**: a los tres días nadie recuerda por qué ese informe traía doce hallazgos y
no treinta. Medido sobre la obra de desarrollo: el informe completo trae 9 hallazgos y el de
«Instalaciones», 3.

**Son vocabulario del proyecto y no un campo de texto**, y esa es la decisión entera: un texto libre
se fragmenta a la tercera semana —«estructura», «Estructura», «estruct», «EE» son cuatro etiquetas
para una cosa— y entonces filtrar por etiqueta deja de encontrar lo que hay.

Tres cosas que se ven poco:

- **Etiquetar pide permiso de cambiar la observación, no de crear etiquetas.** Quien coordina
  clasifica lo que ve sin poder inventar vocabulario, que es lo que evita que se fragmente.
- **Una etiqueta de otra obra se ignora, no filtra.** Filtrar con ella devolvería cero filas, y un
  informe que dice «no hay nada abierto» sobre una obra con treinta hallazgos es la peor respuesta.
- **La letra de cada etiqueta se elige midiendo** la luminancia de su color, con la misma regla que
  ya usan los distintivos de disciplina: una palabra en blanco sobre amarillo no se lee.

El vocabulario se define por ahora en el admin, igual que las disciplinas.

### Cambiado — «Observaciones abiertas» se tría de un vistazo (`F11.6`, 2026-09-02)

**La lista de hallazgos de la obra era texto plano, y por eso no se podía triar.** La prioridad iba
como palabra gris del mismo peso que todo lo demás —justo la dimensión por la que se recorre una
lista—, nueve títulos subrayados competían entre sí, y «Vence» era una columna de rayas porque casi
ninguna observación tiene fecha.

Ahora la prioridad es una **píldora con su color**, y solo «Alta» toma el de alarma: si las tres
gritaran, ninguna gritaría. El título va sin subrayar y se subraya al pasar por encima, porque la
fila entera se resalta. Cada fila dice **de dónde viene** —choque, modelo o documento— con la
palabra que ya calculaba el modelo: un choque lo encontró una máquina y una nota la escribió
alguien. Y donde no hay vencimiento va la **antigüedad**, que es el caso normal: «abierta hace 3
horas» dice algo y una raya no.

**Ninguno de los cinco cambios añade un dato que no estuviera**, y el componente de la píldora ya
existía en `app.css` — solo lo usaba la pantalla de cobertura.

**Y las dos barras de herramientas pasan debajo de la tabla.** Estaban entre el rótulo de la sección
y los datos, así que para llegar a la lista había que pasar por encima de dos formularios. Un rótulo
va seguido de lo que nombra; es de lo que el usuario se quejaba como «mal distribuido».

Detalle que se ve poco y ocupaba mucho: el filtro `timesince` de Django dice **dos** unidades, y
«abierta hace 3 horas, 43 minutos» era más largo que el título del hallazgo de al lado. El filtro
`antiguedad` es el mismo `timesince` con `depth=1` —el redondeo y las traducciones siguen siendo los
de Django— y su prueba lo compara contra la función original.

### Corregido — un hallazgo escrito en el mismo instante que la marca nacía ya visto (`F5.5`, 2026-09-02)

**Lo destapó el gate fallando una vez de veinte, y el fallo intermitente era el síntoma de un hueco
real.** «Lo nuevo» se calculaba comparando estrictamente la fecha de la observación con la marca de
«ya lo vi»; cuando el reloj del sistema devolvía el mismo instante para las dos —en Windows la
granularidad no siempre distingue milisegundos—, el hallazgo aparecía como ya visto sin que nadie lo
hubiera visto.

El empate cuenta ahora como **nueva**, y la prueba lo fuerza en vez de esperarlo, así que la regla no
depende de la resolución del reloj de la máquina que corra el gate. De los dos errores posibles,
mostrar de más se corrige mirando y **perder un hallazgo no se corrige nunca**.

### Añadido — el informe de coordinación, en papel y con el membrete de la casa (`F10.3`, 2026-09-02)

**Es la primera salida en papel que tiene el producto.** Nueve fases construyen la coordinación
entera y todo vivía dentro de la aplicación: lo único que salía era el BCF, y un BCF no se lleva a
una reunión de obra ni se archiva en una carpeta — se abre en otro software.

La pantalla de la obra tiene ahora **«Informe en PDF»** y **«Tabla en CSV»**, con las opciones a la
vista: qué estado imprimir, en qué orden, solo lo mío, con o sin el hilo de comentarios, con o sin
miniaturas. Sale **en Carta con el membrete de J.E.J.** —logotipo, obra y fecha arriba, contacto y
arco de esquina abajo, y el número de página en cada hoja—, porque una hoja suelta se fotocopia y se
queda seis meses en una carpeta.

**Ninguna opción cambia los números y el encabezado dice de qué informe habla**: un informe filtrado
que presume de ser el total es peor que no tener informe.

**El PDF se arma en el servidor**, que es lo que pidió el usuario, y la librería se eligió midiendo
cinco opciones: reportlab gana con **dos paquetes**, licencia sin condiciones y —lo decisivo— es la
única que corre en la máquina donde corre el gate. Con WeasyPrint (necesita GTK) o LibreOffice
headless (~500 MB) el informe solo se generaría en la VM, o sea sin oráculo. El CSV cubre lo que
LibreOffice daría de verdad —un informe editable— sin instalar nada: abre en Calc y en Excel, con
`;` y BOM para no partir las tildes.

**El membrete se leyó del formato de la casa**, no se estimó: Carta y no A4, Helvetica, y el azul
`#1F428D` que da 9,45:1 sobre papel. Tres cosas salieron de mirar el papel impreso: los gráficos
venían en EMF y el primer intento de conversión **los recortaba por la derecha**; el bloque de
contacto se compone como texto —nítido, seleccionable y sin recorte— en vez de pegarse como imagen;
y el margen de arriba es 38 mm y no los 52,4 de la carta, porque esos 52,4 dejaban **24 mm de papel
en blanco** entre el membrete y el título.

### Decidido — «una nota» ya existía, y preguntarlo ahorró un modelo (`F10.2`, 2026-09-02)

La fila pedía «poner notas en las decisiones». Antes de construir se preguntó qué significaba, y la
respuesta fue que **los comentarios ya son eso**: lo que faltaba era poder elegir qué se imprime. Se
cierra sin una migración y sin un campo nuevo.

### Añadido — lo nuevo frente a lo ya visto en la coordinación (`F5.5`, 2026-09-02)

**Es lo único que ningún otro filtro contestaba.** «Mías», «Choques» y «Notas» separan de quién es y
de dónde viene cada hallazgo; ninguno decía **qué apareció desde que miré**. Con treinta y cinco
filas abiertas y trece problemas nuevos de la corrida de hoy, había que releer la lista entera.

El panel tiene un filtro **«Nuevas»** con su cuenta, las tarjetas nuevas llevan un filo violeta y la
palabra «nueva», y un **«ya lo vi»** que solo aparece cuando hay algo nuevo que ver.

La marca de hasta cuándo se ha mirado es **por persona y por obra**: dos coordinadores no han mirado
lo mismo. Se crea sola la primera vez —si no, la primera visita marcaría treinta y cinco de treinta
y cinco como nuevas, que es el ruido del que se venía huyendo— y **no se mueve al leer**, porque
entonces abrir el panel marcaría como visto justo lo que se acaba de descubrir.

### Corregido — la lista de coordinación tenía el título del mismo tamaño que los metadatos (2026-09-02)

Medido en pantalla: el título y la línea de abajo estaban los dos en **13 px**, así que la jerarquía
la llevaba solo el color y la tarjeta se leía como un bloque gris. El título sube a **15 px**, los
metadatos bajan a **12** y los chips suben de 11 a 12. El contraste no era el problema —el peor par
da 5,5:1—, era el tamaño.

Y el título ya no se corta con puntos suspensivos: **envuelve a dos líneas**. «Muro cortina eje 4 ×
Conducto de extrac…» se cortaba justo donde dejaba de distinguirse de la fila siguiente, y el título
es la identidad del problema. El coste medido es 21 px por tarjeta envuelta.

### Corregido — la marca no estaba donde tenía que estar, y donde estaba no se veía (2026-09-02)

**El portal no tenía icono de pestaña** y la pantalla de ingreso no tenía marca: con cuatro pestañas
abiertas, la única reconocible era la del visor. Las dos la llevan ya.

Y un defecto que arrastraba el visor desde el primer día: el relleno del dibujo es `#1B2A4A`, que
sobre los fondos oscuros del producto da **1,15:1 en la cinta, 1,00:1 en la barra del portal y
1,10:1 en la tarjeta de ingreso oscura**. El trazo violeta aguantaba, pero el cuerpo del dron y las
caras del cubo eran agujeros: llegaba media marca. Ahora va sobre placa clara en las tres pantallas,
donde se lee entera —14,2:1—. La placa está en el CSS y no en el archivo, porque el archivo lo
comparten el portal y el visor.

### Añadido — veinte tornillos contra la misma viga son un problema, no veinte (`F5.5`, 2026-09-02)

**Una corrida que devuelve treinta y cinco filas cuando hay trece problemas no se tría: se
abandona.** Silenciar falsos positivos decidía si la herramienta se usa una segunda vez; agrupar
decide si la primera corrida sirve. Repartir veinte observaciones de la misma unión atornillada
entre cuatro personas es peor que no repartir nada.

Las interferencias vecinas se agrupan ahora en un problema, y lo que llega a la lista es una fila
con su título por delante: «V-12 × 20 elementos». Abrirla **aísla el problema entero** —los
veintiún elementos, no los dos del representante— y dibuja un segmento por conflicto.

**El radio es un metro y sale de medirlo**, no de intuirlo. Sobre el par real de la organización, la
corrida que devuelve 35 interferencias: 22 problemas a 0,25 m, 20 a 0,50 m, **13 a 1 m**, 8 a 2 m y
5 a partir de 5 m. La razón de no subirlo no es que la curva se aplane — es que se derrumba: la
unión es transitiva, así que a 2 m un solo cúmulo se come 17 de las 35 y a 5 m son 22. El metro está
justo antes de ese salto.

Y una cláusula que el propio oráculo obligó a añadir: **la misma pareja de GUID es siempre el mismo
problema, y la distancia no opina.** La detección informa el mismo conflicto dos veces cuando los
dos modelos comparten GUID, y cada informe trae una cara distinta del contacto — medido, los dos
centros caen a 1,95 m uno del otro. Con la proximidad sola quedaban como dos problemas.

### Corregido — el resumen de una corrida concuerda, y un cero deja de parecer una medida (2026-09-02)

«1 pares · 1 problemas · 1 nuevos» estaba mal concordado, y es lo que se lee al pulsar el botón.
Ahora va con `ngettext`, y las dos cifras que importan van en la misma frase: «35 interferencias en
13 problemas» dice cuánto hay que triar _y_ que el número crudo no era el trabajo real.

Y la ficha de un hallazgo automático decía «Separación medida: 0.0000 m» cuando el modo de detección
no mide penetración: ese cero tenía el aspecto de una medición sin serlo. Ahora dice «Los volúmenes
se cruzan», que es lo que se sabe.

### Añadido — el BCF que vuelve del mandante entra (`F4.6`, 2026-09-02)

**Sin la vuelta, la coordinación es un altavoz.** `F4.4` cerró la ida: las observaciones salen en un
ZIP que Solibri y Navisworks abren. Pero coordinar es de ida y vuelta — el mandante revisa, contesta
y **manda otro BCF**—, y esa respuesta se leía en un correo y se teclaba a mano, o no se teclaba.

La pantalla de la obra tiene **«Importar una respuesta BCF»**. Los temas nuevos entran como
observaciones, con su prioridad, su cámara y su foto; las respuestas a las nuestras **se suman a su
hilo sin pisar nada**. El mismo archivo importado dos veces no duplica: la identidad es el GUID del
tema, que es el `pk` que escribió nuestra propia exportación.

La política de fusión se escribió **antes** que el lector, y las tres reglas eligen lo conservador:
gana lo de acá cuando el tema ya existe, `Closed` vuelve como `cerrada` y nunca como `descartada`
—que silenciaría el conflicto para siempre en las corridas—, y un correo que viene en el archivo
solo alcanza a la gente de la organización.

**El oráculo es `bcf-client`, al revés que en la exportación**: allí escribimos a mano y leemos con
la librería, acá la librería escribe y leemos nosotros. Escribir el lector contra un archivo real y
no contra el XSD encontró que **el viewpoint no se llama `viewpoint.bcfv`** —ese es nuestro nombre;
el estándar dice que va declarado en el markup—. Darlo por supuesto no revienta: deja fuera cada
cámara y cada GUID de elemento, en silencio.

Y como el archivo llega por correo desde otra oficina, se parsea con `defusedxml` y el ZIP se lee
con topes: `zipfile` descomprime una bomba sin quejarse.

### Corregido — un éxito ya no se ve como un fallo (2026-09-02)

Los mensajes del portal se pintaban todos en rojo: «Importado: 1 tema nuevo» salía con el borde y el
color de un error. Ahora el nivel se distingue —y el `role` separa `alert` de `status`, porque
anunciar un éxito como alarma enseña a ignorar las alarmas—. De paso, el resumen concuerda en
singular y calla los ceros, y la explicación de los formularios de acción dejó de partirse alrededor
del botón.

### Añadido — descartar un conflicto sin salir del visor, y la lista que se puede triar (`F5.5`, 2026-09-02)

**`DESCARTADA` existía como estado y nada lo ponía.** El silenciado estaba resuelto en el modelo —la
pareja de GUID sin orden impide que la corrida siguiente reabra un conflicto descartado— y **no
había camino en la interfaz para llegar a ese estado**. O sea que la mitad que decide si la
detección se usa una segunda vez estaba escrita y no se podía usar.

Ahora cada hallazgo del visor tiene **«no es un problema»**, con el motivo obligatorio: descartar es
permanente, así que el motivo es lo único que le queda a quien pregunte dentro de seis meses por qué
nadie miró esa viga. La fila se va de la lista sin volver a pedirla, porque triando treinta y cinco
conflictos recargar entera después de cada uno pierde el sitio y el desplazamiento. Descartarla dos
veces —alguien lo hizo desde otra pestaña— contesta el estado real y no un error.

**Y la lista larga se puede separar**: filtros «Todas / Mías / Choques / Notas» con su cuenta al
lado, porque «Choques 35» ya dice qué hay que hacer. Un choque lo encontró una máquina y una nota la
escribió alguien: mezclados, la nota que un revisor redactó a mano se pierde entre el resultado de
una corrida.

Dos cosas que salieron de medir y no de opinar:

- **El permiso iba en la dirección mala.** `DjangoModelPermissions` asume que `POST` es crear;
  descartar es **cambiar**. Con el mapa de fábrica, un rol que puede abrir hallazgos podría
  descartar los ajenos, y uno que puede cambiarlos no podría. Lo descubrió su propia prueba de 403.
- **Las acciones de cada fila pertenecían a la fila de abajo.** Medido sobre los 35 en pantalla:
  43,8 px desde su propio título y 11 px del siguiente. En una lista donde descartar es permanente,
  eso es descartar el conflicto equivocado. Cada hallazgo es ahora una tarjeta con su papel propio.

### Añadido — «Revisar interferencias» en la pantalla de la obra (`F5.1`–`F5.5`, 2026-09-02)

**Era el hueco que separaba «la coordinación funciona» de «se está usando».** La detección existía,
estaba probada contra su oráculo, y se alcanzaba escribiendo dos UUID en una terminal.

Un coordinador no elige dos UUID: pregunta **«¿choca algo?»**. El botón toma la revisión vigente de
cada entregable que trae un modelo y las cruza todas contra todas. **Y no hay pantalla de
resultados**, que es lo mejor que tiene: lo que encuentra cae entre las observaciones abiertas de la
propia pantalla del proyecto, y desde ahí el visor ya sabe abrirlas —aislando los dos elementos y
dibujando el segmento entre ellos—.

Tres exclusiones evitan el ruido de entrada, y cada una tiene su motivo medido: un
`IfcOpeningElement` **choca con todo por definición** —es el volumen que se resta del muro—, una
silla que atraviesa un tabique no es un problema de obra (59 de 548 elementos en `Piso 5`), y una
anotación no es geometría construida.

**Con esto quedó decidida `F3.4`: la petición espera.** Veinte segundos caben de sobra en los ciento
veinte del servidor, y una cola traería una forma nueva de fallar en silencio que no hace falta
pagar todavía. El botón avisa de que tarda **antes** de pulsarlo.

Y un hallazgo de la propia prueba: cruzando dos modelos que comparten GUID la detección devuelve **la
pareja espejada**, y la identidad sin orden la colapsa dentro de la misma corrida.

### Añadido — El conflicto llega a la coordinación como un tema (`F5.2`–`F5.4`, 2026-09-02)

El plan pedía «un conjunto de prueba con interferencias colocadas a propósito; se cuentan las
encontradas y las perdidas». Ese conjunto es un muro y cuatro pilares con las coordenadas escritas
dentro del propio archivo, y trae **los cuatro casos y no solo el que choca**: el que cruza debe
salir, el que está tres metros al este no, el que tiene la misma huella en planta pero está un metro
más arriba tampoco —**y ese es el que delata a un detector que compara plantas en vez de
volúmenes**— y el que apoya contra la cara sin penetrar, solo si se admite el roce. `ifcclash`
acierta los cuatro.

Y lo mejor del orden en que se hizo el trabajo: **un conflicto no es una lista aparte, es una
observación**, así que la navegación salió de la Fase 4 sin escribir una pantalla. La identidad de un
conflicto es **la pareja de GUID sin orden** —el punto de choque cambia con la malla y con la versión
de la librería—, y con eso descartar un falso positivo es dejar su observación en `descartada`: la
corrida siguiente no la vuelve a abrir.

### Añadido — La cota que demuestra el hallazgo viaja con él (`F4.5`, 2026-09-02)

El BCF ya llevaba a dónde mirar, qué se veía y una foto. **Lo que no llevaba es qué señalaba quien
anotó**: el título decía «la viga del eje C choca con el ducto» y la cota de 4 cm que lo demuestra se
quedaba en el navegador.

**Las cotas ya dibujadas son el marcado**, y no es un atajo: BCF 2.1 guarda el marcado de un
viewpoint como **segmentos de recta en coordenadas del modelo** —`<Lines>`— y el visor ya tiene
puntos ahí, porque medir consiste en ponerlos. Una distancia da un tramo, un ángulo dos, un área su
contorno **cerrado**. Solibri y Navisworks dibujan esas líneas sobre su propio modelo, así que la
cota viaja **en tres dimensiones** y no como un trazo pintado sobre una imagen.

Solo las cotas **visibles**: una apagada es una que quien anota decidió no mostrar. Y con el tope
alcanzado se deja fuera la medición entera, no los segmentos que sobran — medio contorno es una
forma que nadie dibujó.

Queda pendiente la otra mitad de la fila: el **trazo libre** —nube, flecha y texto a mano—, que es
una herramienta de dibujo y no una conversión de algo que ya existe.

### Corregido — Nada se esconde detrás del ratón (`F9.4`–`F9.5`, 2026-09-02)

**Cinco acciones aparecían solo al pasar el cursor**: cerrar un modelo, borrar una vista, borrar una
cota, quitar una vista compartida y el ojo del árbol. La intención era buena —cerrar un modelo cuesta
volver a convertir el archivo— pero la herramienta era la equivocada: esconder algo no lo hace menos
pulsable por accidente, lo hace **imposible** con el teclado y en táctil, donde no existe «pasar por
encima».

**Y veinte botones estaban por debajo del área mínima de toque**: los iconos de lista miden 11 × 17
dentro de filas de 26. Agrandarlos habría hinchado la interfaz, así que el botón se queda del tamaño
que se ve y **crece solo su zona sensible**. La regla se engancha a `aria-label`, porque un botón
cuyo nombre sale de un atributo **es** un botón de icono: el que se escriba mañana lo hereda solo.

Eso tuvo un precio que solo se vio midiendo: la zona sensible sobresalía del borde y **le daba barra
horizontal** a dos secciones del navegador, 8 px y 3 px. Se recorta el eje y no aparece ninguna.

Además, la escala de radio pasa a ser la del portal —6 px para un control, 10 para una tarjeta, 12
para la del portal—, las elevaciones dejan de ser las de fábrica (negro al 10%, calculadas para
fondo claro, invisibles sobre un panel oscuro), y **los dos estados vacíos que no decían cómo
llenarse** —el árbol y los modelos abiertos, justo los primeros que se ven— ahora dicen el gesto.

### Corregido — El visor tiene tokens, escala y foco (`F9.1`–`F9.3`, 2026-09-02)

**AeroBim tenía dos sistemas de diseño y solo uno estaba hecho.** El portal lleva tokens con nombre,
el ratio de contraste anotado al lado de cada color, tema claro y oscuro y `:focus-visible`; el visor
tenía **cinco tokens, cero coincidencias de `focus` y veinte pasos de `white/NN`**. El color
jerárquico salía de bajar la opacidad del blanco hasta que el texto dejaba de leerse:
`text-white/30` daba **2,67:1** y era el rótulo de grupo de la cinta, a 9,9 px.

Ahora hay dieciocho tokens con su papel, un anillo de foco global y la escala calibrada:
**230 clases traducidas en 17 archivos, y ni un componente movido de sitio.** El botón `Abrir` daba
4,13:1 con el violeta de marca —la acción principal de la aplicación no pasaba AA— y ahora usa un
violeta de acción que sí: la marca **pinta**, el acento **se lee**.

**Y el ratio dejó de ser una afirmación para ser una prueba.** La fórmula de WCAG 2.1 vive en
`bim-core`, fijada con los vectores de la norma, y su prueba **lee `index.css`** en vez de una copia:
si alguien baja un color por debajo del mínimo, falla el gate. De paso corrigió un número del propio
documento de diseño.

**Quitar el `font-size: 110%` no encogió la interfaz**, que era el riesgo: toda la escala de Tailwind
está en `rem`, así que la raíz volvió a 16 px **y** la unidad de espaciado subió un 10%. La barra de
estado mide exactamente los mismos 30,8 px; lo que creció uno o cuatro píxeles son las cajas cuyo
alto lo pone el texto más pequeño, porque ese texto pasó de 9,9 px a 11.

### Añadido — La foto del hallazgo viaja en el BCF (`F4.10`, 2026-08-28)

`F4.4` estaba marcada cerrada y le faltaba lo primero que se ve. Todo visor del mercado —Solibri,
Navisworks, BCF Manager— dibuja la lista de temas **con su miniatura al lado**, y es lo que hace que
quien recibe el archivo sepa de qué se le habla antes de cargar el modelo. Los nuestros salían con
títulos y nada más.

**La trampa está en cuándo se lee el lienzo, y no da error.** El búfer de dibujo de WebGL se borra
en cuanto el navegador compone el cuadro; leerlo un instante tarde devuelve un rectángulo vacío y
`toDataURL` entrega un PNG **perfectamente válido**, todo del mismo color. Se dibuja y se lee en el
mismo turno, sin un `await` en medio — y **aun así se comprueba lo que salió**, porque una miniatura
en blanco dentro de un BCF afirma «así se ve el problema» sobre nada.

El oráculo: con el modelo a la vista sale un PNG; con **todo el modelo apagado** —o sea solo el
fondo— la misma llamada devuelve `null`. Medido sobre el IFC real de 32,7 MB: **100 ms** y
**138 KB**. En la fila va la clave y nunca el megabyte de bytes, con su sha256, así que dos notas
desde la misma pantalla no duplican el archivo.

### Añadido — Una vista del modelo se le puede pasar a alguien (`F3.12`, 2026-08-28)

Las vistas guardadas sobrevivían a recargar la página y **no salían del equipo**, así que dos
personas revisando el mismo modelo no podían mirar lo mismo. Coordinar es exactamente eso.

**No es «la misma vista, pero en el servidor».** Una vista local está escrita en el idioma de esa
sesión —coordenadas de la escena y `localId` de Fragments, que cambia entre versiones del modelo—.
Una compartida está escrita en el idioma del **modelo**: cámara en el sistema del IFC, lo apagado
por **GUID** y los cortes también en el sistema del IFC. O sea, es un viewpoint de BCF con nombre y
con cortes. Las locales se quedan: son de trabajo y no cuestan nada.

### Añadido — La visibilidad en el viewpoint (`F4.7`, 2026-08-28)

El BCF salía con `DefaultVisibility="true"` siempre. Con la nota tomada sobre el modelo entero eso
es cierto; **con el hallazgo encontrado aislando una planta es falso**, y quien lo abre ve el
edificio completo con el problema tapado justo por lo que se había apagado para verlo.

Ahora viaja **el lado corto** —lo apagado o lo visible, el que produzca menos componentes— por GUID.
Apagando tres vigas de veinte mil elementos, un lado escribe tres líneas y el otro 19.997. Y también
vuelve: abrir la observación deja la pantalla como estaba.

### Añadido — La VM deja de depender de lo que no está escrito (`F3.11`, 2026-08-28)

Tres huecos con la misma forma: la aplicación funciona en el equipo de desarrollo justamente porque
ahí no se usan. Faltaba **`psycopg`** —y el mensaje de Django nombra `psycopg2`, o sea que mandaba a
instalar el que no es—, faltaba **`gunicorn`**, y no había **endpoint de salud ni unidades de
systemd**.

El endpoint mira las tres formas en que esa máquina se rompe callada, y la que más importa es el
**directorio de documentos**: sin el montaje Django no falla, escribe en el disco local y lo subido
se pierde al reiniciar. Procedimiento entero en [docs/DEPLOY.md](docs/DEPLOY.md).

### Corregido — La cinta ofrece lo que el visor puede, y no menos (`F1.13`, 2026-08-28)

Auditada botón por botón contra la API del visor. Siete desajustes, y en los siete el código decía
una cosa y la pantalla otra. El que más pesa: **con un DXF solo, medio Vista estaba en gris** aunque
`frameAll` cuenta los planos a propósito. Además, una medida a medias no tenía salida
(`cancelMeasurement` estaba implementada y no la llamaba nadie), «Navegador» estaba dos veces, «Ver
todo» tenía dos iconos distintos, y `aria-pressed` estaba en **todos** los botones — un lector de
pantalla anunciaba «Todo, botón de alternancia, no pulsado».

### Añadido — El IDS de partida, medido desde el modelo (`F3.10`, 2026-08-28)

Validar contra un IDS funciona desde `F3.5` y **lo que faltaba era el archivo**: nadie tiene un IDS
escrito para su obra, y escribirlo a ciegas produce una de dos cosas — un requisito que el modelo ya
cumple entero, que no dice nada, o uno que no cumple en absoluto, que se ignora desde el primer día.
Los dos enseñan a no mirar el informe de validación.

Así que **primero se mide.** Una pantalla nueva dice, clase por clase: cuántos elementos hay, qué
psets aparecen y **en cuántos**. Con esos números el requisito lo decide alguien mirando datos, y el
criterio va escrito en la propia pantalla —no solo en el código— porque quien decide tiene que poder
discutir la regla con la que se lo propusieron.

**Se propone lo que está en la franja alta pero incompleta.** 802 de 805 vigas con su pset es una
brecha real y exigirlo la cierra; cobertura total no hace falta exigirla, y cobertura cero sería
inventarle al proyecto una obligación que nadie pidió. Y con menos de cinco elementos no se propone
nada: «tres de cuatro» no es una tendencia, es una anécdota.

Un botón genera el IDS y lo deja como requisito del proyecto. **Cada especificación lleva escrito de
dónde salió** —«propuesto porque 4 de 5 ya lo traen»— y el archivo lleva su propósito en el
`purpose`: un requisito que llega sin explicación se firma sin leer o se rechaza entero.

Tres decisiones que vale nombrar:

- **Se exige que el pset exista, no un valor.** Cuál debe ser el valor no lo sabe el modelo ni lo
  sabe esta función: lo acuerda el mandante. Lo objetivo es que el dato **esté**.
- **Se declara el esquema del propio modelo**, no uno fijo. Un IDS que dice `IFC4` sobre un archivo
  IFC2X3 no aplica, y el informe saldría vacío diciendo que cumple — el fallo que `F3.5` ya
  documentó: «si no aplicó ninguna, no se cumple nada».
- **Y no se genera un IDS vacío.** Sin especificaciones es inválido según el XSD, así que el botón
  no se ofrece y el `POST` a mano lo dice en vez de guardar un archivo que ninguna herramienta
  acepta.

**El oráculo es la librería de otro**, como en el BCF: el archivo se escribe a mano con
`ElementTree` y se lee de vuelta con `ifctester`. Y una prueba cierra el círculo: **el IDS generado
valida contra el modelo del que salió**, con 5 aplicables y 1 fallo — la brecha exacta que se quería
exigir. Es el oráculo que el plan declaró para este bloque.

Dos cosas que corrigió el propio proceso: el XSD rechazó la primera versión y **dijo por qué**
—`description` es un atributo y no un hijo, y `specification` no acepta `minOccurs`—; y bandit señaló
un `except: continue` que se tragaba los elementos ilegibles. El arreglo no fue callarlo: se cuentan
y **se dicen**, porque si fallaron cuatrocientos de ochocientos la cobertura no significa nada y un
`continue` a secas convierte un archivo roto en una tabla de ceros creíble.

393 pruebas en la API con 94,33% de cobertura, 226 en `bim-core`, gate en verde.

### Añadido — La coordinación vive dentro del visor (`F4.8`, 2026-08-28)

**Era la mitad que faltaba del ciclo.** La observación se creaba desde el visor —desde la ficha de
un elemento, con su GUID y su cámara— y para **verla** había que salir a otra pantalla: quien
coordinaba tenía el hallazgo en un sitio y el modelo en otro.

Ahora el panel del proyecto tiene «Coordinación»: las observaciones abiertas de la obra ancladas a
elementos, ordenadas por prioridad. **Un clic hace las dos cosas que hacen falta**: pone la cámara
donde estaba quien lo encontró y selecciona el elemento, con su ficha abierta. Es lo que Solibri
hace bien, y es lo que convierte una lista en una herramienta de coordinación.

**Las dos piezas ya existían y aquí solo se ensamblan**, que es la regla del repositorio:
`getLocalIdsByGuids` lo trae `@thatopen/fragments` —la búsqueda por GUID no se escribe, se llama— y
`ifcAEscena` de `bim-core` es la **inversa exacta**, con su prueba, de la conversión que ayer
escribió la cámara en el BCF. El IFC lleva la cota en Z y la escena el «arriba» en Y: aplicar la
posición sin convertir deja la cámara bajo tierra.

**Y sin cámara guardada se encuadra el elemento.** Es el caso de las observaciones que nacen de una
validación IDS, y es lo que se puede afirmar —dónde está— sin inventar desde dónde lo miraba nadie.

**Cuando el GUID no está en ningún modelo abierto se dice junto a esa fila**, no en un aviso suelto:
con quince filas, «no se encontró» obliga a adivinar de cuál habla. Y suele tener una explicación
concreta —la observación es de otra disciplina—, así que el mensaje la dice.

La API va **por proyecto y no por revisión**: un hallazgo sobre una viga de la estructura importa
mirando el modelo de arquitectura, que es de lo que trata coordinar. Solo devuelve las que llevan a
algún sitio —con GUID y abiertas—; una observación sobre un PDF no tiene elemento que seleccionar y
pondría en la lista una fila muerta. Y **la cámara viaja sin convertir**: la vuelta la hace el visor,
porque tener la misma regla en dos sitios es como se separan.

359 pruebas en la API con 94,33% de cobertura, 221 en `bim-core`, gate en verde.

**Verificado por el usuario en su navegador, y era lo importante de este cambio.** Las piezas
estaban probadas por separado —la conversión con su prueba, la búsqueda por GUID es de la librería—
y el ensamblaje no: el panel del navegador de trabajo no compone fotogramas y tiene su propia
sesión, así que el vuelo de la cámara no se podía mirar desde acá.

Lo miró él y **la cámara no queda bajo tierra**. Eso cierra la única duda que quedaba abierta sobre
la conversión de coordenadas: `escenaAIfc` e `ifcAEscena` son correctas de ida y de vuelta, y la
transformación que se dedujo de `grid.ts` —los ejes de replanteo cayendo sobre el modelo— vale
también para la cámara. Era evidencia indirecta y ahora es directa.

### Añadido — La puerta entre las dos mitades (`F8.10`, 2026-08-28)

Cuatro huecos que hacían que el producto se sintiera como dos aplicaciones cosidas, y los cuatro
eran de ida y vuelta:

**El portal pasa de menú a punto de partida.** Encima de las tarjetas de módulo hay ahora
«Continuar»: lo vencido, lo que vence esta semana, y las obras con su etapa y su avance. Un menú
dice a qué sitios puedes entrar; esto dice **en qué ibas**, que es la pregunta que uno tiene al
abrir la aplicación por la mañana. Sale de `pendientes_por_tramo`, la misma función que alimenta el
resumen por correo, así que la pantalla y el correo **no pueden discrepar** sobre qué está vencido.

**Las filas se pueden abrir, y eran texto plano.** En la bandeja se veía que algo vencía y no se
podía ir — en la pantalla que se abre cada mañana. Funciona sin que la plantilla pregunte de qué
tipo es cada fila porque `Observacion` y `Actividad` llevan ahora `get_absolute_url`, que es donde
toca: «dónde vivo» es asunto del objeto, y la lista las mezcla a propósito porque para quien mira
son lo mismo — algo con fecha y responsable.

**Y una actividad no vivía en ninguna parte.** Había listado y alta, y ninguna pantalla de detalle:
todas esas filas eran filas muertas. Ahora tiene la suya, con su paso a paso —**derivado de
`STATUS_FLOW`**, no escrito en la plantilla— y un botón que avanza **un** paso. Un desplegable con
los cinco estados deja pasar de «pendiente» a «hecha» de un salto, que es justo lo que el flujo
existe para impedir; y el `POST` no pasa por el botón, así que la vista compara con lo que el flujo
permite.

**El visor deja de ser un callejón sin salida.** Se entraba desde el expediente de una revisión y
la única salida era el botón de atrás del navegador — que además descarta el modelo cargado: veinte
megas y medio minuto de conversión por querer mirar una lista. Ahora la cabecera lleva la obra y el
entregable enlazados, y la marca lleva al portal. La asimetría era llamativa: el visor de PDF tenía
tres enlaces de vuelta y el de modelos ninguno.

**Y también se puede llegar sin enlace.** El panel del proyecto tiene «Del registro»: qué hay que
puedas abrir, **agrupado por obra**. La API que lo alimenta existía desde `F8.8` y **no la consumía
nadie** — el selector que su propia documentación describía nunca se había cableado. Devolvía
doscientas revisiones de todas las organizaciones en una lista plana; con un proyecto real eso es
inservible, y el tope cortaba **en silencio**: un modelo que no aparece se lee como que no está
subido. Ahora el tope es por obra y la respuesta dice cuántas quedaron fuera.

**El paso a paso es un parcial reutilizable**, porque **tres modelos avanzan** —`Proyecto`,
`Revision` y `Actividad`— y ninguno lo dibujaba.

**Y un incidente que vale contar, porque cambió cómo se toca el catálogo.** Un script mío dejó
`msgid "S1 · Suitable for coordination"` con `msgstr "Pendiente"`: la traducción de otra entrada.
Eso es **peor que una cadena sin traducir** —la pantalla afirma algo falso y nada falla— y ninguna
de las cuatro pruebas del catálogo lo habría visto: el `msgstr` no está vacío, no es fuzzy y no
repite el original. Se revirtió con `git checkout` y se rehizo con un escritor que recorre líneas y
que **compara contra `HEAD` antes de escribir**: si toca una entrada que no estaba en la lista,
aborta. La comprobación es la mitad del valor.

351 pruebas, 94,30% de cobertura, gate en verde. 221 en `bim-core`.

### Añadido — La obra existe en la aplicación, y su pantalla dice dónde sigue (`F8.9`, 2026-08-28)

`apps/projects` tenía sus modelos desde `F8.1` y **ni una vista**: un proyecto solo se podía crear
entrando al `/admin/` técnico de Django, y sus disciplinas igual. Con una obra real eso no es una
incomodidad, es que el trabajo empieza fuera de la aplicación.

**La pantalla de detalle contesta «dónde sigo»**, que es una pregunta distinta de «qué hay». El
orden de los bloques es la respuesta: primero los entregables sin nada emitido —**nombrados, no
contados**—, después las observaciones abiertas por prioridad, después el salto directo al visor, y
al final lo que se consulta. Un listado alfabético de doscientos entregables no dice nada.

**El salto al visor es la costura que faltaba.** Hasta hoy obligaba a pasar por el listado de
entregables y buscar a mano. Y abierto así el visor sabe de qué revisión viene, que es lo que le
permite ofrecer «Observar este elemento» sobre un GUID.

La organización **se pregunta solo cuando hay algo que preguntar**: con una sola membresía se pone
sola y el campo va oculto. Y el POST no pasa por el desplegable, así que la vista comprueba la
organización contra la lista de verdad — hay prueba de que escribir a mano el id de otro cliente no
cuela. El código se normaliza en mayúsculas porque es un identificador y no un texto: `716-lcd` y
`716-LCD` son la misma obra, y la restricción de unicidad de la base distingue.

`bootstrap_roles` no necesitó ni una línea: los permisos de `Proyecto` y `Disciplina` ya estaban en
la matriz de `roles.py`.

**Cuatro defectos que aparecieron por el camino:**

- **`DescargarRevisionView` tenía el mismo defecto que el BCF de ayer.** `FileResponse` con un
  iterador se traga `as_attachment` y `filename` sin avisar, así que el nombre que su propio
  comentario prometía devolver nunca llegaba al navegador.
- **`Entregable.observaciones_abiertas` excluía solo `CERRADA`, no `DESCARTADA`.** El resto del
  código —`notify.py`, la lista, `esta_vencida`— excluye las dos, y esta era la única que
  discrepaba. No lo delató ninguna prueba porque **la propiedad no la usaba nadie**: la estrena esta
  pantalla.
- **Las fixturas compartidas vivían en `apps/documents/tests/conftest.py`** con un reenvío en
  `apps/visor/tests`, y el motivo escrito era equivocado: decía que «un fixture global lo carga toda
  la suite», y las fixturas de pytest son perezosas. Suben a la raíz y los dos reenvíos desaparecen.
- **El catálogo tenía `"Accounts"` sin traducir y la prueba no podía verlo**: la cadena estaba en el
  código y **nunca se había extraído**, así que no figuraba en el `.po`. Queda dicho porque es un
  hueco real: `test_no_queda_ninguna_cadena_sin_traducir` solo vigila lo que ya está en el catálogo.

Y dos trampas de plantilla, con su motivo escrito donde toca: `visor_ruta` es un **nombre de ruta y
no una URL** —hay que resolverlo con la etiqueta `url`, y sin eso el enlace no lleva a ninguna parte
sin que nada falle—, y los comentarios `{# #}` son **de una sola línea**: repartido en dos, Django
parsea las etiquetas de la segunda.

21 pruebas nuevas: 403 por vista, aislamiento entre organizaciones, y que la pantalla no ofrezca
botones que terminan en 403. Gate en verde con 293 y 93,76% de cobertura, y las 19 cadenas nuevas
traducidas sin perder ninguna de las 335 que había.

**Lo que no se verificó:** el aspecto de las dos pantallas en el navegador. Responden por HTTP —302
a `/accounts/login/?next=/proyectos/`, sin ningún 500— y las 21 pruebas las ejercen de punta a
punta, pero no hay usuario en la base.

### Añadido — El BCF abre mirando al problema, no solo señalándolo (`F4.1`, 2026-08-27)

La observación abierta desde el visor se lleva **el punto de vista desde el que se vio el
problema**, y el BCF exportado lo escribe como `PerspectiveCamera` u `OrthogonalCamera`. Quien lo
abre en Solibri o en Navisworks aparece donde estaba quien lo encontró, en vez de tener que buscar
el elemento seleccionado.

**Esto era lo que faltaba y por qué faltaba.** `F4.4` se negó a exportar una cámara a propósito: la
escena del visor tiene el eje **Y** hacia arriba y BCF espera las coordenadas del IFC, con **Z**.
Exportar la posición sin la transformación produce un BCF que abre mirando bajo tierra, y eso es
peor que uno sin cámara — afirma algo falso.

**La transformación no se adivinó: ya estaba en el repositorio y comprobada.**
[grid.ts:61](packages/viewer/src/grid.ts) dibuja los ejes de replanteo leyendo las coordenadas del
IFC y poniéndolas en la escena como `(x, cota, -y)`, y los ejes **caen sobre el modelo**: si la
regla fuera otra, las letras aparecerían a noventa grados del edificio. La misma la usa el plano DXF
de referencia, que calza con error de milímetros. De ahí sale `escenaAIfc` en `bim-core`, con la
prueba que fija las dos direcciones y la que la ata explícitamente a `grid.ts`.

**Y el vector «arriba» se lee del cuaternión de la cámara.** La tentación es pasar el eje vertical
del mundo, y con la cámara en planta —lo que hace el Modo 2D, o sea el caso más común— eso es
paralelo a la dirección de vista: una cámara imposible que el XSD de BCF rechaza. Leyendo el giro
real no hay convención que elegir ni caso degenerado que resolver a dedo.

**La cámara se lee al pulsar, no al seleccionar.** Entre elegir el elemento y pulsar «Observar» uno
gira para verlo mejor, y el punto de vista que hay que guardar es el de ese momento. El `href` del
enlace lleva la versión sin cámara, que sigue siendo válida al copiarlo o abrirlo con el botón
central.

**Lo que llega por la URL se valida como dato hostil** (`camara.py`, 32 pruebas): tipo conocido,
tres ternas de números finitos, vectores unitarios, «arriba» perpendicular a la dirección, y un tope
de distancia que caza el fallo real de leer un modelo en milímetros como si fuera metros. Una cámara
mala **se descarta y no da error**: quien abre la observación no escribió ese parámetro, y negarse a
guardar un hallazgo real por un dato accesorio sería el peor de los dos errores. Y una cámara sin
GUID no se guarda: sin el elemento al que apunta, un viewpoint dice «mira hacia acá» sin decir qué
hay que mirar.

**Un defecto que encontró el oráculo, y de los buenos.** `_camara` escribía sobre la marcha, así que
una cámara a medias —de una versión anterior, o escrita por un script— dejaba un `PerspectiveCamera`
sin sus hijos obligatorios, y con eso **`bcf-client` se niega a leer el archivo entero**: se caía la
exportación de todo el proyecto por un registro. Ahora se comprueba todo antes de escribir nada. Y
el orden importa en el otro sentido también: el XSD declara `Components` **antes** de la cámara.

Total del día: 272 pruebas en la API, 214 en `bim-core`, gate en verde.

### Añadido — Del elemento del modelo a la observación, sin salir del visor (`F4.1`, 2026-08-26)

Ver el problema y que alguien lo arregle eran dos aplicaciones. Ahora, con un modelo abierto desde
el registro, la ficha del elemento ofrece **«Observar este elemento»** y lleva al formulario con la
revisión y el GUID ya puestos: quien revisa no copia un GUID de 22 caracteres a mano ni busca el
entregable en otra pestaña.

**El ancla es el GUID y no el identificador del motor**, que es la decisión que hace que esto sirva
para algo: `localId` cambia entre versiones del modelo y entre librerías, y una observación que
apunte a uno queda huérfana en la siguiente carga. El GUID es lo único estable, y es el que después
selecciona la viga en Solibri por el BCF de `F4.4`.

**El enlace no existe en tres casos, y no se dibuja gris.** El modelo se abrió arrastrando un
archivo del disco —no hay entregable donde colgar nada—; el rol no puede abrir observaciones; o el
elemento no trae GUID válido. Los tres significan «no hay dónde anotarlo», no «está
deshabilitado»: un botón gris que no explica por qué manda a buscar el error donde no está.

Y el permiso **lo contesta el servidor**, en los metadatos de la revisión que el visor ya pedía —una
pregunta de un solo bit no merece una petición más—. El visor no puede contestarla: depende de
`add_observacion` y de la organización.

**El armado de la URL vive en `bim-core`, no en el componente**, y con 12 pruebas. No es purismo:
los nombres de los parámetros son un contrato con `NuevaObservacionView.ancla_pedida` del otro lado,
y renombrar uno rompe el ancla **en silencio** — el formulario se abre igual, sin GUID, y la
observación queda diciendo «algo en este modelo». Una de las pruebas es exactamente esa: que las
claves sean `guid`, `revision` y `titulo` y ninguna otra.

Un archivo del disco borra el origen a propósito: si se abre una revisión y se arrastra otro IFC
encima, el elemento seleccionado ya puede ser del segundo modelo, y anclar a la revisión del primero
apuntaría a un GUID que ese archivo no contiene.

**Lo que falta de `F4.1`, y por qué no está:** la cámara. La escena del visor tiene el eje **Y**
hacia arriba y BCF espera las coordenadas del IFC, con **Z** arriba. Exportar la posición sin medir
esa transformación produce un BCF que abre mirando bajo tierra, y eso es peor que uno sin cámara:
afirma algo falso. Se mide antes de exportarla. _(Medido y cerrado el mismo día — ver la entrada de
arriba.)_

### Añadido — La observación se lleva a Solibri o a Navisworks (`F4.4`, 2026-08-26)

Un hallazgo anclado al GUID de una viga es exactamente lo que el mandante necesita abrir en su
software; guardado solo acá, obliga a que **todos entren a nuestra pantalla**, y eso no pasa. Ahora
la lista de observaciones ofrece, por proyecto, un **BCF 2.1** con sus temas.

**Se escribe a mano, con `zipfile` y `ElementTree`, y es una decisión con dos motivos.** El primero
es que es un ZIP con tres XML pequeños, y una dependencia más —con su licencia y su forma de
fallar— no se paga por ahorrar cien líneas. El segundo pesa más: **así el oráculo es
independiente.** `bcf-client` está instalado —lo trae `ifcopenshell`— y se usa **en las pruebas
para leer de vuelta lo que escribimos**. Si escribiéramos con su serializador y leyéramos con su
parser, la prueba solo diría que la librería es consistente consigo misma; ahora dice algo sobre el
archivo.

**Se emite 2.1 y no 3.0**: la 3.0 existe y todavía no la lee todo el mercado.

**Y no se inventa una cámara.** BCF permite un viewpoint con solo los componentes seleccionados,
sin posición de cámara, y es lo que corresponde: nadie eligió un punto de vista para estas
observaciones —vienen de una validación IDS o de un clic sobre un documento—. Un BCF que abre en
Solibri mirando a un sitio que nadie decidió es peor que uno que simplemente **selecciona el
elemento**: el primero afirma algo falso, el segundo dice lo que sabe. Por el mismo motivo el
elemento va **seleccionado y no aislado**: aislar decidiría por quien revisa que lo demás no
importa, y a veces el problema es justamente el vecino.

El GUID del tema **es** el de la observación, no uno nuevo, así reimportar el mismo BCF actualiza
el tema en vez de duplicarlo. Y a las personas las identifica su correo, que es lo que BCF espera;
a quien no tenga correo se le pone el nombre de usuario, porque inventar una dirección haría que el
software del otro lado asignara el tema a alguien que no existe.

**Un defecto que apareció por escribir la prueba de la pantalla:** `FileResponse` solo llama a
`set_headers` cuando el contenido tiene `read`, así que con `iter([bytes])` se tragaba
`as_attachment` y `filename` **sin avisar** y el archivo salía sin `Content-Disposition`. Ahora va
un `BytesIO` y el nombre lleva el código del proyecto — quien lo recibe por correo tiene que saber
de qué obra es sin abrirlo.

15 pruebas, y con ellas el tablero de la Fase 4 se reconcilió: `F4.2` y `F4.3` estaban en ⬜ sobre
código que existe desde hace días —las cerró `Observacion` y `Comentario`, que era justamente la
apuesta de `F8.2`—, y `F4.1` pasa a 🟡 porque el ancla por GUID está y la cámara no.

**Lo que no se verificó, dicho en voz alta:** el oráculo de la fase es que el BCF **abra en
Navisworks o Solibri**, y ninguno de los dos corre acá. Que la implementación de referencia de
buildingSMART lo parsee es evidencia fuerte; no es la misma afirmación.

### Comprobado — El exportador a DXF **no dependía del proyector** (`F7.4`, 2026-08-26)

`F7.1` y `F7.4` llevaban meses las dos en 🟡 «por el mismo motivo», y no era el mismo: proyectar las
aristas necesita un navegador que componga fotogramas, pero **exportar recibe un dibujo con su
viewport y lo serializa**. Separadas, `F7.4` sí se puede confirmar.

Se le arma un dibujo de **medidas conocidas** —un rectángulo de 10 × 6 m— y el oráculo es doble: que
**nuestro propio lector de DXF** lo lea, y que las medidas sean las que se pusieron.

| Qué                              | Resultado                                                      |
| -------------------------------- | -------------------------------------------------------------- |
| Sin papel, en unidades del mundo | **11,00 × 7,00** — el rectángulo más su margen de 0,5 por lado |
| En A3 y milímetros               | **420,00 × 297,00 mm**, el 100 % del ancho del papel           |
| Lo lee nuestro lector            | 8 y 16 trazos, **nada sin dibujar** en los dos casos           |

La segunda fila es la que importa: 10 m son 10 000 mm, así que un exportador que pusiera el dibujo
tal cual no cabría en la hoja. Que la extensión sea exactamente la del A3 dice que **se escala al
papel**, que es lo que hace falta para imprimirlo.

Lo que sigue sin confirmarse: que **AutoCAD** lo abra —que nuestro lector lo lea es evidencia
independiente, no la misma afirmación— y que un dibujo **proyectado** exporte igual, que es `F7.1`.

### Añadido — El modelo cumple o no el requisito del proyecto (`F3.5`, 2026-08-26)

Es lo que el plan llamaba **«lo que separa un visor de una herramienta de control»**: revisar a mano
si cada elemento trae el pset que el mandante exigió no escala —702 vigas por modelo— y un IDS lo
verifica en segundos. IDS es el estándar de buildingSMART, así que el requisito es **interoperable**;
`ifctester` (LGPL-3.0) se usa como librería.

**Dos modelos, y la separación importa.** El requisito es del **proyecto** —el mandante exige lo
mismo a todos los modelos de la obra—; la validación es **un acto con su fecha**, porque el requisito
cambia a mitad de proyecto y entonces la misma revisión cumple ayer y no cumple hoy. Eso es lo que
permite contestar «cumplía cuando se aprobó».

**Tres decisiones que hacen que el resultado no mienta**, las tres sacadas de mirar el informe crudo:

1. **«No aplica» no es «cumple».** `ifctester` devuelve `status: True` para una especificación que no
   aplicó a nada; contarla como cumplida diría que el modelo satisface un requisito que **nunca se
   comprobó**. Aquí son tres estados.
2. **Si no aplicó ninguna, no se cumple nada**: un IDS de otra disciplina no dice nada del modelo.
3. **El informe crudo no se guarda**: 944 KB para el modelo de 24 MB, porque incluye la línea STEP de
   cada elemento que falla. Se guarda un resumen acotado, y **el conteo total va aparte**.

**Y el ciclo cierra donde tenía que cerrar**: cada fallo lleva el **GUID** del elemento, así que desde
el fallo se abre una observación sobre **esa viga**, con responsable y fecha.

Comprobado por HTTP con el IFC real de 23,6 MB: validar tarda **1,7 s**; el veredicto en pantalla dice
«1 de 2 especificaciones fallan · 1 no aplicaron a este modelo»; el detalle nombra «702 de 702» con su
motivo; el enlace a la observación lleva el GUID real. Un **mandante** ve la lista y recibe **403** en
el formulario y al validar. Un IDS ilegible da **400** y nada llega al disco. 23 pruebas nuevas.

`F3.4` (Celery) sigue sin hacer falta: 1,7 s en la propia petición para el tamaño que recibe un
control documental.

### Añadido — Lo que el IFC declara de sí mismo, leído al subirlo (`F3.3`, 2026-08-26)

Al subir un IFC, la revisión queda sabiendo su **esquema**, el **proyecto** que declara, su **unidad
de longitud con el factor a metros**, si está **georreferenciado y por qué vía**, y **cuántos
elementos trae y de qué tipos**. Se ve en el expediente, al lado del sha.

El visor ya leía las unidades, pero las olvidaba al cerrar la pestaña; el registro necesita **poder
contestar sin abrir nada**. Y hay un dato que solo se puede dar aquí: Fragments aplica el factor de
unidad a la geometría y **descarta la declaración**, así que después de convertir ya no se puede
preguntar si el archivo está georreferenciado.

`ifcopenshell` (LGPL-3.0) se usa **como librería**, que es lo que `AGENTS.md` permite. Medido:
**1,1 s** para el IFC real de 23,6 MB, así que se lee en la propia subida — no hace falta `F3.4`
para el tamaño que recibe un control documental, y el campo es un `JSONField` por si algún día sí.

**Dos defectos que encontró la primera pasada sobre los modelos reales**, y ninguno se habría visto
con un solo archivo de muestra:

- **`IfcMapConversion` no existe en IFC2X3** y pedirlo allí **levanta**, no devuelve vacío. Eso
  tiraba la extracción entera para la mayoría de los IFC del mundo; el de muestra en IFC4 funcionaba.
- **`Piso 5.ifc` declara su sitio en `(0, 0, 0, 0)`** y salía como georreferenciado. Cero y cero no
  son una ubicación: son el marcador de posición que escriben Revit y otros cuando nadie fijó el
  emplazamiento, y creérselo manda a buscar el edificio a la isla nula.

Y una tercera atajada al escribirlo: en IFC **el signo de una latitud va solo en el primer término**.
`(-33, 26, 15)` es 33° 26′ 15″ sur; sumarlos con su signo daría otro hemisferio.

**«Sin georreferenciar» se dice, no se omite**: es la respuesta que hace falta antes de prometer una
vista sobre el terreno. 11 pruebas nuevas con IFC escritos a mano, uno por caso.

### Corregido — Generar un plano podía dejar la interfaz esperando para siempre (`F7.1`, 2026-08-26)

Se escribió el modo `planos` del diagnóstico para confirmar de una vez las dos tareas que llevaban
meses montadas y sin comprobar. Lo que confirmó, con precisión, es el fallo: en las tres vistas
`EdgeProjector.get()` **no resuelve nunca y no emite un solo aviso de avance**.

Mirado de frente **eso es un defecto del producto y no solo del entorno de pruebas**: quien pulsara
«Planta» en un equipo sin aceleración —o con la pestaña de fondo— veía «Proyectando las aristas del
modelo…» indefinidamente. Había un botón «Dejar de esperar», pero solo limpiaba el aviso: no
explicaba nada.

Ahora hay un **corte por falta de latido**, y la distinción importa: no es un tope al tiempo total
—proyectar un modelo grande puede tardar minutos con razón— sino a **veinte segundos sin un solo
aviso**. Al cortar, el mensaje dice qué pasó: que el navegador probablemente no está dibujando la
escena, que es de donde `EdgeProjector` lee. Comprobado en las tres vistas.

`F7.1` y `F7.4` **siguen en 🟡 a propósito**: lo comprobado es el camino del fallo, no el del
acierto. El modo `planos` ya lleva el oráculo puesto para el día que se corra en un navegador de
verdad — **exporta el DXF y lo vuelve a leer con nuestro propio lector**, comparando trazos contra
segmentos proyectados y la extensión contra el A3 declarado.

### Añadido — El PDF se lee: texto seleccionable y búsqueda (`F8.6`, 2026-08-26)

Era lo que `F8.6` dejó pendiente el mismo día: la página dibujaba imágenes, y **de una imagen no se
copia nada**. De un plano lo que se copia es un código de recinto o una cota.

- **Capa de texto invisible** sobre cada página, con los rectángulos de `getPageTextRects` en su
  sitio y en transparente. El `pointer-events` va suelto en cada tramo, no en la capa, para que el
  clic que abre una observación siga llegando a la página.
- **Búsqueda en el documento entero**, con el número de página como botón para saltar. El motor dice
  **dónde buscar** —`searchAllPages` recorre el PDF sin dibujarlo— y la capa de texto dice **dónde
  está en la hoja**, porque el motor devuelve índices de carácter y no rectángulos.
- **Un PDF escaneado no tiene texto que buscar** y eso no rompe la pantalla: dice «sin
  coincidencias». El modo `pdf` del diagnóstico lo nombra, porque «no encuentra nada» y «no hay nada
  que encontrar» son dos cosas distintas.

Comprobado detrás del login con un fixture de tres páginas: 6 tramos extraídos con posición y
fuente, el texto copiable palabra por palabra, y buscar «vanos» da **1 coincidencia en la página
3** — la vista salta allí y «Cuadro de vanos» queda resaltado.

### Corregido — La CSP de desarrollo avisaba de una violación en cada carga (2026-08-26)

Los dos permisos que el WASM necesita —`'wasm-unsafe-eval'` y `worker-src 'self' blob:`— estaban
solo en `prod.py`, así que en desarrollo el navegador informaba de una violación de CSP en cada
carga del visor. Inofensiva, porque allí la política es solo un informe, pero **indistinguible de
una de verdad**: la peor clase de aviso, el que se aprende a ignorar. Pasan a `base.py`, que es
donde vale para los dos entornos; producción sigue siendo la única que aplica la política.

### Corregido — El marcador de ajuste era del mismo violeta que la selección (`F1.12`, 2026-08-26)

«Al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco práctico.» **No hay
nada en el código que seleccione al pasar el cursor** —`pickAt` se llama solo desde `onClick` y no
hay un solo escuchador de movimiento del ratón en el paquete del visor—, pero sí había un
sospechoso: el marcador de ajuste del medidor venía con el borde en `rgb(122, 75, 209)` a 10 px. Un
punto violeta, del mismo tono que «esto está seleccionado», saltando de vértice en vértice.

Pasa a `#ffd43b`, que es la convención de AutoCAD y BricsCAD para las marcas de referencia. **El
cambio es de color, no de comportamiento**: el ajuste engancha donde enganchaba. Comprobado en el
navegador: las cuatro clases de ajuste devuelven `#ffd43b`, y la comprobación queda en el
diagnóstico porque son estáticos de la librería — si una versión nueva les cambia el nombre, el
recolorado dejaría de aplicarse en silencio.

### Corregido — Las cuatro mediciones pasan por el rayo propio (2026-08-26)

El arreglo de la medición de distancia dejó dicho que el ángulo y el área seguían con el medidor de
la librería y **seguían sin informar del clic al vacío**. Ya no: las cuatro entran por el mismo
sitio, y las cuatro devuelven `false` cuando el clic no encontró geometría.

Lo que se gana no es solo consistencia: **es poder comprobarlas.** El ajuste de la librería lee
píxeles de la escena dibujada, así que las tres medidas que dependían de él no se podían ejercitar
en un entorno que no compone fotogramas — justo donde el usuario decía que no funcionaban.

Para probarlas hizo falta una entrada que además hacía falta por otro motivo:
**`addMeasurePointAt(punto)`**, que suma un punto por su coordenada del mundo. Restaurar una
medición guardada —o abrir el punto de vista de un BCF— son coordenadas, no clics; y el rayo, en el
panel de pruebas, se agota en un par de llamadas, así que por el clic no había forma de completar un
ángulo (tres puntos) ni un área (cuatro).

Comprobado con figuras de medida conocida: distancia **7,702 m** sobre el modelo, ángulo de un
triángulo rectángulo **90,00°**, cuadrado de 4 m **16,00 m²** y **16,00 m** de perímetro, cada uno
con su cota dibujada; un área de dos vértices no cierra; cancelar y cambiar de modo dejan el
contorno en cero.

**Y el oráculo encontró un defecto en la primera pasada**: el perímetro del cuadrado salía **12 m en
vez de 16**. Al portar el área tomé `perimeterM`, que es —y así lo documenta— el largo de una
polilínea **abierta**. Ahora el dominio tiene `closedPerimeterM` como función aparte, con cuatro
pruebas. Con un contorno cualquiera ese número habría pasado inadvertido.

### Corregido — Las sombras estaban montadas y apagadas (`F1.16`, 2026-08-26)

Lo reportó el usuario: «no está renderizando con mejor información de sombras o realista». Y
leyendo el código estaba hecho —`ShadowedScene`, `setup({shadows})`, postproducción
`COLOR_PEN_SHADOWS`—, que es el mismo caso que `F7.13`: el código dice una cosa y la pantalla otra.
Medido con el modo `sombras` nuevo de `diag.html`, había **cuatro** cosas mal a la vez, más una
quinta que también las habría anulado:

| Qué                                      | Antes                                      | Ahora              |
| ---------------------------------------- | ------------------------------------------ | ------------------ |
| Mapa de sombras del renderizador         | **apagado**                                | encendido, suave   |
| Recuadro de sombra de la luz direccional | **10 × 10 m**, con el modelo midiendo 40,5 | 65 × 65 m          |
| Mallas que proyectan sombra              | **0 de 8**, y **0 de 15** al mover         | 8 de 8, y 15 de 15 |
| Mallas que reciben sombra                | **0**                                      | todas              |
| Luz ambiental / direccional              | 1,50 / 1,50                                | 0,45 / 2,20        |

- `setup({shadows})` crea la luz que proyecta y **deja el mapa de sombras del renderizador
  apagado**: sin él no se calcula ninguna sombra, haga lo que haga el resto.
- La cámara de sombra de una luz direccional es ortográfica y trae **un recuadro pequeño de
  fábrica**; con el edificio fuera, no se dibuja ni una sombra aunque todo lo demás esté bien.
- Three.js exige `castShadow` y `receiveShadow` **por objeto**, y las mallas del modelo las crea el
  worker de Fragments _después_ del `setup`. Se ponen al cargar y en cada `onViewUpdated`, el mismo
  enganche que arregló el modo fantasma.
- La **luz ambiental venía tan fuerte como la direccional**, y eso iguala todas las caras: es la
  mitad de «no da profundidad» que no tiene nada que ver con las sombras proyectadas.
- Y la quinta: **la luz apuntaba al origen**, no al modelo. Un IFC de obra viene en coordenadas de
  proyecto, a cientos de metros: lo iluminaba de canto.

Comprobado también con el IFC de 23,6 MB —71,5 m de lado, recuadro de 114 × 114 m, 87 de 87 mallas
proyectando y recibiendo— y sin romper nada: el modo fantasma sigue al 100 % y el informe de
fidelidad del plano no cambia una cifra. **Lo que no se puede afirmar desde aquí** es que la sombra
guste: el panel del navegador de este entorno no compone fotogramas, así que lo verificado es que
las cinco condiciones que Three.js exige están puestas, donde antes cuatro no lo estaban.

### Añadido — El documento se ve y se comenta en su sitio (`F8.6`, 2026-08-26)

El modelo guardaba `pagina`, `ancla_x` y `ancla_y` de cada observación desde el primer día y **no
había quien las dibujara**: una observación sobre la página 7 de un plano se leía como una línea de
texto en una lista. Ahora hay una pantalla que ve el PDF sin descargarlo, dibuja las observaciones
donde se abrieron, y abre una nueva con un clic sobre la página.

- **De EmbedPDF se usa el motor, no su visor.** `@embedpdf/snippet` es un lector completo de 9,7 MB
  con su propia interfaz; aquí hace falta dibujar páginas y poner **nuestras** marcas encima, con
  control de la coordenada. Con `@embedpdf/engines` (PDFium por WASM, MIT) la página pesa 348 kB.
- **Es una página aparte del build**, no una pestaña del visor de modelos: un PDF ahí cargaría
  Three.js y `web-ifc` para nada, y no sabría abrirlo. Comparten build, assets, `base` y limpieza.
- **El ancla es una fracción de la página, no un píxel**: el PDF se dibuja a la escala que quepa y
  a la densidad de cada pantalla.
- **El clic lleva al formulario de Django con el ancla puesta**; no se guarda nada desde el
  navegador. Fuera de `[0, 1]`, o con media ancla, se rechaza.
- **Sólo se dibujan las páginas cercanas a la que se mira.** Una memoria de 200 páginas serían 200
  imágenes en memoria de vídeo, que es el fallo que ya se pagó con el atlas de rótulos del plano.

Dos trampas encontradas, del mismo tipo que las que `AGENTS.md` ya listaba: **el WASM de PDFium
sale de un CDN por defecto** —con el valor de fábrica, página en blanco detrás del login— y
**`fontFallback` pide fuentes a otro origen**. La primera se resuelve con
`import "…/pdfium.wasm?url"`, así que la ruta la calcula Vite en vez de componerla a mano; va como
regla nueva en `AGENTS.md`.

Comprobado en el navegador detrás del login, con un PDF de tres páginas: las tres dibujadas
(595 × 842 desde `blob:`, sin errores en consola), el WASM servido desde
`/static/visor/assets/pdfium-*.wasm` y **nada desde un CDN**, las tres marcas en su fracción exacta
—la cerrada en verde—, y un clic al 30 %/80 % de la página 2 llegando al formulario con
`pagina=2`, `ancla_x=0.2992`, `ancla_y=0.7993`.

### Corregido — «Es abrible» y «lo abre este visor» eran la misma función (2026-08-26)

Lo delató una prueba que ya existía. Al sumar el PDF al conjunto de lo abrible, los PDFs entraban
en el **selector del visor de modelos**, que los habría cargado como geometría: pantalla en blanco.
Son dos preguntas distintas —si ofrecer un enlace, y si este visor concreto sabe abrirlo— y ahora
son dos funciones.

### Corregido — Se podía abrir una observación sobre el entregable de otra organización (2026-08-26)

`NuevaObservacionView` buscaba el entregable **sin acotar por organización**. Con
`add_observacion`, pedir `/entregables/<id-de-otra>/observar/` metía un hallazgo en el proyecto de
otro cliente **y le mandaba un correo a alguien que no tiene nada que ver**. Es la regla de
`AGENTS.md` que ya estaba escrita —«un permiso dice qué se puede hacer, no sobre qué»— y esta vista
se había quedado sin ella. Acotada, con su prueba.

### Añadido — Emitir el transmittal desde la pantalla (`F8.7`, 2026-08-26)

El modelo sabía emitir desde el primer día y estaba probado —no se emite vacío ni sin
destinatario—, pero **el acto solo se podía ejecutar desde una consola**: la pantalla listaba y
nada más. Ahora están las tres piezas que faltaban: **el borrador**, **la carátula** y **emitir y
acusar**.

- El **proyecto no se pide: lo dicen las revisiones.** Pedirlo aparte abre la puerta a un
  transmittal cuyo proyecto no es el de los documentos que lleva, que es contestar mal la pregunta
  que el transmittal existe para contestar. Mezclar revisiones de dos proyectos se rechaza.
- La carátula deriva su paso a paso **del modelo** y **nombra lo que falta**, igual que el
  expediente. Los botones, solo si se pueden ejecutar.
- `Transmittal.acusar()` es nuevo, y solo sobre lo emitido: un acuse sobre un borrador diría que
  alguien recibió algo que nunca salió. No guarda quién acusó —un transmittal va a varios y el
  primero que confirma no habla por los demás—; eso va a la auditoría, que admite varios.
- **El correo lleva la lista de documentos**, no solo el enlace: quien lo recibe suele leerlo en el
  teléfono y en obra.
- **Y no se calla a quien no recibió nada.** La pantalla dice cuántos se avisaron **y a quién no se
  pudo**. Es la lección de `apps/core/mail.py` aplicada a su gemelo: decir «emitido» a secas cuando
  dos de los cinco destinatarios no tienen dirección deja al emisor creyendo que avisó.

Comprobado por HTTP contra el servicio corriendo, con los cuatro roles sembrados: sin destinatario
da 400; emitido dice «Transmittal T-1773 emitido, 3 destinatarios avisados» **y** «Sin dirección de
correo para sin-correo: no se les avisó»; acusar un borrador no hace nada y acusar lo emitido sí; y
un **mandante** no ve el enlace, recibe 403 pidiendo el formulario a mano y 403 intentando emitir.
13 pruebas nuevas, incluida la de aislamiento sobre el `POST` de emitir — sin acotar la consulta,
eso no es una fuga de lectura, es firmar en nombre de otro.

### Corregido — El catálogo no compilaba, y el gate no podía verlo (2026-08-26)

`compilemessages` **no recompila si el `.mo` es más nuevo que el `.po`**, y el `.po` llevaba una
entrada que msgfmt rechaza: el `\n` inicial estaba en el `msgid` y no en el `msgstr` de la
paginación. El binario al día lo tapaba, así que el error solo iba a aparecer el día que alguien
tocara el catálogo — y apareció hoy. Arreglada la entrada, y **`compilemessages` añadido al gate
borrando el `.mo` antes**, que es lo único que lo comprueba de verdad.

### Corregido — El modo fantasma no se caía al mover: nunca estuvo entero (`F1.15`, 2026-08-26)

Lo reportó el usuario: «el modo fantasma se cae al mover». Antes de arreglarlo hubo que poder
verlo, porque esa frase no se depura mirando: `BimViewer.paintAudit` cuenta material por material
de la escena cuántos llevan la pintura translúcida y cuántos siguen opacos, y
`diag.html?modo=fantasma` mueve la cámara anotando en cada paso.

**Y la medición corrigió el diagnóstico.** Sobre `Piso 5.ifc`: recién encendido el fantasma iba al
**0 %**, moviendo la cámara al 53–56 %, y con la cámara ya detenida al **62 %, donde se quedaba**.
No se caía al mover — nunca llegó a estar entero, y detenerse no lo recuperaba.

La causa la nombró un error: al clonar el material de las mallas que quedaban opacas, la traza dijo
`LodMaterial.clone()` sobre un `LODMesh`. Son los **sustitutos del nivel de detalle**, lo que
Fragments dibuja mientras la cámara se mueve, y no pasan por su registro de resaltado. No es
cuestión de a quién se resalta: pasarle la lista explícita de todos los elementos dejaba
**exactamente las mismas 16 mallas** opacas y dibujando.

Y apareció un segundo defecto que ninguna nota tenía: **`resetHighlight()` no deshace lo que
`highlight()` pinta.** Al volver a sólido quedaban 32 mallas translúcidas para siempre.

Así que la vista fantasma se pinta por cuenta propia —un clon translúcido por material de origen,
`depthWrite` apagado, las dos caras— y `fragments.highlight` queda solo para la selección. Se
engancha `onViewUpdated` para tapar la geometría que llega nueva, con la condición de parada en la
escena misma y un techo de repintados por gesto: sin techo, un material que no se dejara pintar
sería un bucle infinito quemando la GPU en silencio.

| Momento                       | Antes             | Ahora         |
| ----------------------------- | ----------------- | ------------- |
| Recién encendido              | 0 %               | **100 %**     |
| En cada movimiento de cámara  | 53–56 %           | **100 %**     |
| Con la cámara detenida        | 62 %              | **100 %**     |
| Al volver a sólido            | 32 mallas pegadas | **0, limpio** |
| Materiales visibles en escena | ~50               | 18            |

Lo último no es cosmético: sin las mallas duplicadas del resaltado, el modo cuesta menos que antes.
Y el fantasma **conserva el color de cada elemento** en vez de blanquear el modelo, así que mirando
detrás de un muro se sigue distinguiendo una viga de una losa.

**Lo que este oráculo no puede decir**, dicho en el código: `paintAudit` es **ciego a la
selección** —medido en los dos estilos, seleccionar no añade ningún material a la escena—, así que
un cero de opacos con algo seleccionado no significa que el fantasma se la haya tragado.

### Corregido — La medición de distancia no fallaba, mentía (`F1.14`, 2026-08-26)

Lo reportó el usuario: «las opciones de medida de distancia no está funcionando». El defecto
tenía dos mitades, y la segunda es la que lo hacía indistinguible de «no funciona».

- El ajuste de `LengthMeasurement` **no usa el rayo de la CPU: lee los píxeles de la escena
  dibujada.** Cuando esa lectura no resuelve, `create()` no coloca nada.
- Y `addMeasurePoint` **devolvía `true` de todas formas** —con su propio comentario admitiéndolo—,
  así que la interfaz avanzaba el contador y el aviso pasaba a pedir el segundo punto. Un clic que
  no hizo nada se veía **igual** que uno que sí.

El arreglo usa el rayo propio, que ya estaba escrito: `snapAt` va por `fragments.raycast` con las
mismas clases de ajuste y es el mismo mecanismo que la selección, que sí funciona en uso real.
Devuelve el punto o `null`, así que el valor de retorno deja de mentir. Y `addPlanMeasurePoint`,
que ya dibujaba una cota de dos clics con coordenadas propias, se generaliza y sirve para los dos.

**Y ahora el clic al vacío se dice**: la barra de estado avisa en ámbar en vez de callarse. El
silencio es lo que se lee como «no funciona».

**De paso salió gratis lo que `docs/UX.md` tenía pedido**: medir del plano al modelo en un mismo
gesto, porque los dos puntos entran por la misma función.

Comprobado en el navegador con `Piso 5.ifc` y `ACAD-Piso 5_Base.dxf` cargados a la vez: clic al
vacío devuelve `false`, dos clics sobre el modelo dan **13,066 m** (13,064 en planta, 0,179 de
desnivel), y del plano al modelo **8,948 m**. Sin errores en consola.

El ángulo y el área quedaron con el medidor de la librería —«las dos que quedan»—, y se cerraron el
mismo día: ver más arriba.

### Buscado y no encontrado — la preselección al pasar el ratón (`F1.12`, 2026-08-26)

«Al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco práctico.»
**No está en nuestro código**: `pickAt` se llama solo desde `onClick`, y no hay un solo
`addEventListener` de movimiento del ratón en todo `packages/viewer`. Lo único que escucha el
puntero son los controles de cámara y los medidores de la librería cuando están encendidos.

El único candidato es el **marcador de ajuste** de `LengthMeasurement`: un punto de 10 px **del
mismo violeta que la selección** que sigue al cursor mientras se está en modo medición. Antes de
cambiar el comportamiento de la selección hace falta confirmar con el usuario si eso es lo que vio.

### Añadido — El visor y el registro dejan de ser dos herramientas (2026-08-26)

**El hueco no estaba en ninguna lista, y era el más grande.** El visor abría archivos del disco
de quien lo usaba y no sabía nada de proyectos; el registro guardaba revisiones —DXF e IFC
incluidos— y no podía mostrarlas. Así que «visualizar y subir documentos todo junto» **no
estaba**: se podían las dos cosas, pero no con el mismo archivo.

- **El SPA se sirve detrás del login**, en el mismo origen (`/visor/`). Con la aplicación en
  otro origen harían falta CORS, un token en el navegador y una segunda configuración de CSP;
  en el mismo origen la cookie de sesión ya sirve y las dos trampas del despliegue —COOP/COEP y
  el `'wasm-unsafe-eval'`— se resuelven una vez.
- **Y pasa por una vista, no por whitenoise**: un archivo estático no se puede poner detrás de
  `LoginRequiredMixin`, porque se entrega antes de que Django mire quién pregunta.
- **«Abrir en el visor» desde el expediente de la revisión.** La extensión decide qué se
  ofrece, que es la misma regla que ya usa la aplicación al soltar un archivo.
- **Una API de dos peticiones**: primero los metadatos —qué entregable, qué revisión, qué código
  de idoneidad— y después los bytes. Así el visor dice qué está abriendo antes de descargar
  veinte megas, y el nombre del archivo no hay que sacarlo de una cabecera del binario.
- **Las tres reglas de acceso se aplican también en la API**, no solo en la pantalla:
  `view_revision` explícito, acotado por organización —y aquí a mano, porque una `Revision` no
  lleva el campo y cuelga de su entregable—, y solo lo publicado para quien no escribe.

**Comprobado en el navegador, con el servidor corriendo:** el plano real del usuario
(`ACAD-Piso 5_Base.dxf`, 1,5 MB) abre desde el registro y aparece como «PLANOS 2D (1)» con sus
capas; el IFC (`Piso 5.ifc`) abre con sus 551 elementos en el árbol. Sin autenticar, `/visor/`
redirige y la API responde 401. Un `mandante` abre el visor pero tiene **cero revisiones
abribles** y 404 en la `S3` en curso.

### Corregido — Los modelos del cliente quedaron accesibles sin autenticar (2026-08-26)

**Defecto introducido por el cambio anterior, encontrado midiendo.** Publicar `apps/web/dist`
como estático dejó los IFC y DXF reales de la organización descargables **sin autenticar**:
`HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc` devolvía **200 y 34 MB**. Vite copia
todo lo que hay en `public/`, y ahí viven los archivos de prueba.

`AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era: no
están confirmados. Lo que faltaba decir es lo otro: **lo que se pone en `public/` se publica**,
y publicar no es lo mismo que confirmar.

El arreglo es `apps/web/scripts/limpiar-dist.mjs`, que corre en cada `npm run build` y es una
**lista blanca y no una lista negra**: una lista de lo prohibido habría funcionado hoy y se
habría quedado atrás con lo siguiente que alguien deje en `public/`. Y hay una prueba que falla
si alguien salta el paso.

### Corregido — La marca no cargaba con el visor servido por Django (2026-08-26)

**Vite reescribe las rutas del `index.html` y no las cadenas dentro del JSX.** El favicon salió
bien en el build y el `<img>` de la cinta se quedó pidiendo `/aerobim-mark.svg`, que bajo
`/static/visor/` no existe. Ahora la ruta sale de `import.meta.env.BASE_URL`, igual que la del
WASM — y esa es la que importaba de verdad: pedirla mal habría dado `Unexpected token '<'`
**dentro del worker**, o sea sin error visible.

### Añadido — Control documental y seguimiento (2026-08-26)

La Fase 8, a pedido del usuario y tomando la idea de **MineDoc** —el que ya usa la empresa—
construida aquí: MIT y local-first.

- **El registro**: proyecto, disciplina, WBS, entregable, revisión, transmittal, observación,
  comentario y actividad. **El vocabulario es el de ISO 19650**: un código `S3` o `A1` significa
  lo mismo en las tres oficinas, y un estado llamado «en revisión» significa lo que cada uno
  entienda. Las `S` no son contractuales y las `A`/`B` sí.
- **El entregable no tiene archivo, la revisión sí.** Existe desde que se planifica, mucho antes
  de su primer archivo: un registro que necesita un archivo para existir no puede decir que
  falta.
- **El avance físico es una suma auditable**, del peso de cada entregable por el código de
  idoneidad de su revisión vigente. Y una `B` no es el 100 %: queda la obligación de resolver
  los comentarios.
- **Nunca se sobreescribe una revisión: se emite otra**, para poder contestar qué decía el plano
  cuando se aprobó la etapa.
- **La observación tiene un ciclo de vida y dos anclas** —documento (revisión, página,
  coordenada) y modelo (GUID de IFC + viewpoint)—, así que este registro es la mitad ya
  construida de la Fase 4. Y **no se cierra sin decir cómo**.
- **Quien abre una observación es quien la cierra.** El `Proyectista` sube y responde; si
  cerrara, el registro sería «yo mismo declaro que lo arreglé».
- **Subir es entrada hostil**: extensión, **firma real** de los primeros bytes y tamaño, y **el
  nombre del cliente nunca llega al sistema de archivos** — la clave se construye con el sha256 y
  el nombre original vive en la base de datos.
- **Avisar es la función.** Correo al asignar con el enlace, la fecha y la descripción; resumen
  por tramos (vencido, 7, 15, 30 días) desde un comando con su fila en `JobRun`. **No se manda un
  resumen vacío** —enseña a archivar el remitente— y **un responsable sin correo se registra**.
- **El expediente**, copiado del `dossier.py` de AeroControl: contesta «¿esto está completo y
  documentado?» nombrando cada fila que falta con el atajo que la cierra, y omitiendo los botones
  que el usuario no puede ejecutar.
- **La matriz de roles queda completa**, y un `Mandante` **no ve lo que está en curso**: eso no
  lo puede decir un permiso —`view_revision` no distingue una `S0` de una `A1`— así que lo pone
  la vista, con la regla en un solo sitio.

**Comprobado en el navegador con el servidor corriendo:** un ejecutable renombrado a `plano.pdf`
se rechaza con 400 y nada llega al disco; el PDF real queda en el disco como
`716-LCD/716-LCD-AR-P-001/14fb1bb0a3f7….pdf` —el nombre con guiones largos y acentos no lo
tocó— y la pantalla lo devuelve tal cual; el expediente se actualiza solo; la observación se
crea con su responsable y su aviso; y **la auditoría registró todo con acciones con nombre,
incluidos los intentos rechazados**.

**122 pruebas, 92 % de cobertura**, con el ciclo completo de un entregable automatizado.

### Corregido — Tres defectos del validador de archivos, encontrados por sus propias pruebas (2026-08-26)

- **`latin-1` nunca falla.** Asigna un carácter a cada uno de los 256 bytes, así que un
  ejecutable renombrado a `.dxf` pasaba el filtro entero. Ahora se comprueba lo que sí distingue
  un texto de un binario: que no lleve bytes nulos y que casi todo sea imprimible.
- **`carpeta//doble.pdf` no se rechazaba.** Partiendo el separador con `[/\\]+`, un `//` se
  colapsaba en uno y el tramo vacío desaparecía sin que nadie lo viera.
- **`../../etc` salía como `..-..-etc`.** No es una fuga —no queda separador— pero es un nombre
  de carpeta que parece una, y hace perder el tiempo a quien audite el disco.

### Pendiente conocido — Control documental

- **`F8.6`: ver y comentar el PDF en el navegador** con **EmbedPDF** (MIT). Es el «comentar en
  línea sin descargar» de MineDoc. Hoy la observación sobre un documento guarda su página y su
  coordenada y **no hay quien las dibuje**.
- **`F8.7`: emitir el transmittal desde la pantalla.** El modelo está y se prueba —no se emite
  vacío ni sin destinatario—, pero la pantalla solo lista.

### Añadido — Portal de ingreso y credenciales (2026-08-26)

`services/api` existe: Django 6 + uv, con la **forma** de AeroControl y base de datos propia. Se
portó lo que esa aplicación ya tenía probado en producción —1440 pruebas con datos reales de la
DGAC— y no su dominio.

- **El portal de ingreso.** `django.contrib.auth` endurecido: axes **delante** del backend real
  para cortar un intento bloqueado antes de comprobar la contraseña, bloqueo **por nombre de
  usuario** —detrás de un proxy toda petición llega de la misma dirección, así que una clave por IP
  sería inútil o falsificable—, sesión con tope de 12 h y expiración deslizante, y **un solo
  mensaje de error, genérico**: distinguir «no existe ese usuario» de «esa no es la contraseña» le
  regala a quien prueba credenciales la mitad del trabajo.
- **Sin auto-registro.** El primer usuario sale de `createsuperuser` y el resto los crea un
  administrador. Una aplicación de control documental donde cualquiera se da de alta no controla
  nada. El cambio de contraseña vive **dentro** de la aplicación, para que nadie tenga que entrar
  al `/admin/` técnico a rotar su propia credencial.
- **`/api-token/` con throttle propio.** `ObtainAuthToken` de DRF viene con
  `throttle_classes = ()`, o sea que deja fuera del límite global justo al único endpoint que
  acepta pares usuario/contraseña sin autenticar: sin esto es un oráculo de contraseñas.
- **Los roles como dato** (`apps/accounts/roles.py`): Administrador, Coordinador BIM, Proyectista,
  Revisor y Mandante, más **Dirección**, que no es un rol sino un grupo de notificación con cero
  permisos. Un nombre de permiso mal escrito **para** el comando `bootstrap_roles`.
- **El contrato de permisos, en `AGENTS.md`.** Toda superficie de lectura pide un `view_*`
  explícito; `LoginRequiredMixin` solo no alcanza; un modelo acotado por organización acota el
  queryset y no solo comprueba el permiso; y **cada vista nueva trae su prueba de 403**. Es lo que
  de verdad hizo robusto a AeroControl, y es agnóstico del stack.
- **El rol de lectura es una lista blanca, nunca un patrón.** El `Viewer` de AeroControl era «todo
  permiso que empiece por `view_`», y eso le entregaba en silencio los tokens de API, la lista de
  usuarios, las sesiones y la auditoría. Hay una prueba que falla si aparece uno de esos en
  `Mandante`.
- **Piezas portadas con su historia:** `BaseModel` (archivar, no borrar), `AuditEvent` de solo
  agregar con `sequence` —porque `created_at` no basta para ordenar dos filas del mismo instante—,
  el middleware de auditoría y CSP, `mail.py` (no decir «enviado» cuando el correo solo se
  imprimió), `jobs.py` con la fila que nace en `running`, la exportación CSV que neutraliza
  fórmulas, y el acotado por organización.
- **SQLite en WAL.** La auditoría escribe en cada petición que muta, y con los 5 s por defecto
  AeroControl tuvo «database is locked» intermitentes que su propio `except` se tragaba: eventos
  perdidos en silencio.

**Comprobado contra un servidor corriendo:** un `Mandante` ve en el portal solo Organizaciones y el
visor, y pedir a mano `/administracion/usuarios-y-roles/` le devuelve **403**, no la página; un
`Coordinador BIM` ve además Trabajos programados y puede abrirlo; un `Administrador` lo ve todo. Y
el bloqueo por intentos es real: al quinto fallo la respuesta pasa a **429** y **la contraseña
correcta también recibe 429** mientras dura el enfriamiento, mientras otro usuario sigue entrando.

**Gate propio** (`services/api/scripts/verify.ps1`), el mismo que AeroControl: `check`,
`check --deploy`, `makemigrations --check`, `pytest --cov`, `ruff`, `bandit` y `pip-audit`. **64
pruebas, 89 % de cobertura.**

### Corregido — Un gate que decía «verde» estando rojo (2026-08-26)

La primera versión de `verify.ps1` imprimió «Gate en verde» con `ruff format` fallando:
`$ErrorActionPreference = "Stop"` **no cubre a un ejecutable nativo** que devuelve un código
distinto de cero. Cada paso pasa ahora por una función que mira `$LASTEXITCODE`. Es la misma clase
de defecto que la `F7.13` marcada cerrada, y por eso va escrito.

### Pendiente conocido — Portal

- **El catálogo de traducciones (`locale/es/`) no existe todavía**, así que la interfaz muestra las
  cadenas fuente en inglés donde Django no traduce por su cuenta. La convención está puesta —el
  código escribe en inglés y el español vive en el catálogo— pero el catálogo hay que generarlo.
- **La matriz de roles solo cubre los modelos que existen hoy.** Se completa con los entregables.
- `services/worker` no existe: los jobs pesados de `ifcopenshell` siguen pendientes (`F3.4`).

### Corregido — Fidelidad del plano 2D (2026-08-26)

`F7.13` estaba marcada cerrada y la pantalla decía otra cosa: el usuario volvió con «el 2D no
representa los colores, las formas ni las figuras como se esperaba». Medido contra
`ACAD-Piso 5_Base.dxf` y `Base1.dxf` no era una brecha, eran **quince**.

**El color, resuelto donde el CAD lo pone** (`F7.15`):

- **La capa `0` dentro de un bloque no es la capa `0`**: AutoCAD la sustituye por la capa del
  `INSERT`. Eran 116 entidades en `Base` y 140 en `Base1` que se quedaban en la capa `0` literal
  y salían casi blancas. Era la brecha de color más grande.
- **`62 = 0` es «por bloque»**, no «por capa» (37 entidades), y el trazo `BYBLOCK` tampoco es
  `BYLAYER` (54, que se dibujaban llenas).
- **El signo negativo del código 62 es «capa apagada»**, y se descartaba con un valor absoluto:
  `0-AREA UTIL` (`62 = -201`) está apagada en AutoCAD y el visor la pintaba violeta encima del
  dibujo. Se lee también el congelado y `Defpoints`. La geometría se conserva y la capa arranca
  oculta, con el ojo cerrado en la lista.
- **Color verdadero (420) y transparencia (440)**, que se ignoraban del todo.
- El color pasa a ser un `DxfColor` con su valor, su índice ACI y **de dónde salió** — entidad,
  capa, bloque o por defecto. Sin la procedencia, «por qué esto se ve de este color» solo se
  contesta leyendo el archivo a mano. Y el visor deja de resolver color: se le quitó el
  `?? capa.colorIndex` que no sabía nada de bloques.

**La forma** (`F7.16`):

- **El grosor de trazo (código 370) no se leía en ninguna parte**, y `LineBasicMaterial` ignora
  su `linewidth` en WebGL: todo salía a un píxel y un muro pesaba lo mismo que una cota. Se
  siguen la cadena entidad → capa → `$LWDEFAULT` y se dibuja con `LineSegments2`.
- **Los rayados se rayan.** Los 23 `HATCH` del plano real son `ANSI31` y se dibujaban solo con
  su contorno: 23 recuadros vacíos donde el CAD dibuja un muro rayado.
- **El espacio papel (código 67) no es el dibujo.** El marco de la lámina es la _causa_ del plano
  de 480 metros que antes se rodeaba midiendo el trazo más largo.
- El `bulge` del contorno de un relleno se leía y se tiraba, así que un macizo de muro curvo se
  cerraba con la cuerda.

**Lo que no se dibujaba** (`F7.17`): las 12 cotas y las 11 llamadas —o sea **todo el acotado**—,
los atributos de bloque, las 10 elipses de `Base1`, la `POLYLINE` clásica (cuyos `VERTEX` se
descartaban en silencio), las matrices de `INSERT` (de una reja de veinte pilares se dibujaba
uno) y la extrusión hacia −Z, que sale espejada.

**El texto** (`F7.18`): los 433 textos salían **todos centrados** cuando 398 van arriba a la
izquierda; un texto justificado se coloca con su segundo punto y no con el primero; un `MTEXT`
de cuatro renglones se aplastaba a uno y se cortaba a 60 caracteres; y con 433 textos el plano
**arrancaba sin un solo rótulo**, porque el tope era un conteo de 150 en vez de una densidad.

**Y el plano se dibuja opaco.** Las opacidades estaban inventadas entre 0,35 y 0,9 y el CAD es
opaco; lo que evita que un macizo tape el contorno del muro que rellena es el orden de dibujo,
no la transparencia. La postproducción `COLOR_PEN_SHADOWS` **se apaga en Modo 2D**: está para que
se lea un modelo, y sobre un dibujo de líneas filtra los colores.

### Medido al cerrar (2026-08-26, sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB)

| Qué                 | Antes                  | Ahora                                        |
| ------------------- | ---------------------- | -------------------------------------------- |
| Trazos              | 5.608                  | **5.711**, con las cotas y las llamadas      |
| Textos              | 380                    | **433**, con los atributos de bloque         |
| Renglones dibujados | **0** (arrancaba mudo) | **498 de 498**, ninguno descartado           |
| Rellenos            | 23 contornos vacíos    | **23 rayados `ANSI31`**                      |
| Grosores            | todo a 1 px            | **242 trazos a 0,30 mm** contra 5.469 a 0,25 |
| Espacio papel       | dentro del dibujo      | **10 entidades fuera**, contadas aparte      |
| Texturas de rótulos | 7 por plano            | **8 en la escena** con los dos planos        |
| Carga en la escena  | —                      | **137 ms**, sin un error en consola          |

Y `Base1.dxf` pasa de 27 × 82 m a **27 × 25 m** —un edificio creíble— porque las capas apagadas
dejaron de contar para la extensión, y sigue deduciendo centímetros como estaba documentado.

**El clic no se rompió**, que era el riesgo: `LineSegments2` es una malla y su geometría ya no son
pares de vértices, de los que dependen el clic con el largo del tramo (`F7.10`) y el ajuste al
cruce (`F7.11`). Donde hace falta grosor se dibujan dos objetos: la malla, y la línea de siempre
con el material apagado —que no se dibuja, no cuesta una pasada y sigue contestando—. Comprobado
en el navegador: un clic sobre `0-MUROS` devuelve 0,71 m, el largo exacto del segmento.

### Añadido — Que la fidelidad del 2D sea reproducible (2026-08-26)

- **`apps/web/public/samples/fidelidad-2d.dxf`**: fixture sintético escrito a mano con un caso
  por cada defecto corregido. Nada de esto era comprobable en CI —`.gitignore` excluía `*.dxf`
  sin excepción y no había un solo plano versionado—, y los planos del usuario no se confirman.
- **Modo `plano` en `diag.html`**: el informe de fidelidad que la frase «el 2D no se ve como en
  el CAD» necesita para poder depurarse. Por tipo de entidad, cuántas entraron y cuántas
  quedaron fuera; por capa, su color **con su procedencia**, su grosor y si está apagada.
- **`hatchLines` en `bim-core`, con 8 pruebas.** El recorte por paridad de un rayado falla en
  silencio: una raya que pasa por un vértice invierte la paridad y sale **el negativo del
  relleno**, que a primera vista parece un rayado válido. Vive en el dominio por la misma razón
  que `segmentIntersection`.

**182 pruebas** en `bim-core`, contra 139. Las nuevas cubren lo que no tenía ninguna: capa
apagada, congelada y `Defpoints`, capa `0` en bloque, `BYBLOCK`, espacio papel, color verdadero,
grosor, matriz de `INSERT`, `POLYLINE` con `bulge`, atributos, cota por su bloque anónimo,
elipse, `MULTILEADER` con sus dos trampas de códigos, extrusión negativa, y el rayado entero.

### Pendiente conocido

- **`POINT` y `WIPEOUT` no se dibujan, y se cuentan.** Un punto se dibuja como un punto
  —invisible a escala de plano, y los 36 del plano real están en `Defpoints`, que no se imprime—
  y un enmascaramiento **tapa** lo de abajo, que es un efecto y no un trazo. Son 492 en el plano
  real: en un visor cuyo objeto es cruzar plano y modelo, una máscara opaca taparía el modelo.
- **`SPLINE`, `MLINE`, `XLINE`, `RAY` y `ACAD_TABLE`** siguen contados sin dibujar. No aparecen
  en los planos del usuario.
- **La caja para clicar un rótulo girado sigue siendo alineada a los ejes.** Ya lo era antes; con
  la alineación real se nota algo más en rótulos muy girados.
- **Los cinco pedidos de la nota del 2026-08-19** entran al plan como `F1.12` a `F1.16` y no se
  tocaron: la preselección al pasar el cursor, el panel de abajo, la medición de distancia en uso
  real, el modo fantasma al mover y las sombras del renderizado.

### Añadido — Fase 0, andamiaje y mediciones (2026-08-19)

- **Monorepo npm** con tres paquetes: `packages/bim-core` (dominio puro, sin React ni
  Three.js), `packages/viewer` (envoltura de That Open, para aislar su API) y
  `apps/web` (React 19 + Vite 8 + Tailwind 4). Build, lint, formato y pruebas verdes.
- **GUID de IFC** (`IfcGloballyUniqueId`) en `bim-core`: compresión, expansión y
  validación, con 49 pruebas. **Verificado contra un oráculo externo**: los 579 GUID
  únicos de un modelo real exportado por BricsCAD sobreviven el round-trip sin una sola
  diferencia. Una muestra quedó como test de regresión.
- **Unidades de longitud** en `bim-core`: prefijos SI y unidades imperiales con sus
  factores exactos. Ante una unidad desconocida devuelve `null` en vez de asumir metros,
  porque asumir ahí coloca un modelo en el lugar equivocado sin que nadie se entere.
- **Visor** con carga de IFC, encuadre automático y panel de métricas, más el WASM de
  `web-ifc` servido localmente (sin CDN, coherente con el local-first).
- **Página de diagnóstico** `apps/web/public/diag.html`, que ejecuta el pipeline sin la
  interfaz para separar problemas del visor de problemas de integración.
- **Fixture** `muro-minimo.ifc`: un IFC2X3 sintético de 2 KB en milímetros, que además
  delata errores de conversión de unidades.

### Medido sobre un modelo real (IFC2X3 de BricsCAD, 1,52 MB, en milímetros)

| Qué                    | Resultado                                  |
| ---------------------- | ------------------------------------------ |
| Abrir y ver el modelo  | **0,6 a 1,2 s** en la aplicación           |
| Tamaño del `.frag`     | 113 KB — **13,7× más chico** que el IFC    |
| Contenido reconocido   | 548 elementos con geometría, 15 categorías |
| Dimensiones informadas | 21,8 × 3,0 × 22,7 m                        |

Las dimensiones son la comprobación de unidades: el modelo viene en milímetros y el visor
informa metros plausibles. `F0.4` y `F0.5` quedan cumplidas.

### Corregido

- **La conversión no terminaba nunca, y sin emitir error.** La causa era el aislamiento de
  origen: con `crossOriginIsolated` en `true`, `web-ifc` elige su WASM **multihilo**, que
  no funciona empaquetado —los workers de pthreads arrancan con una URL `undefined` y
  mueren con `Unexpected token '<'`—. Se quitaron las cabeceras COOP/COEP, que además
  habían sido agregadas creyendo que hacían falta: eran justo lo que activaba el camino
  roto. El visor ahora **falla al arrancar con un mensaje explícito** si detecta
  aislamiento de origen, en vez de colgarse.
- **`IfcLoader.load` quedó fuera** en favor de `FRAGS.IfcImporter` + `core.load`: dos pasos
  explícitos, medibles por separado, y alineados con `F0.6`.
- **El tamaño del Fragments se reportaba como 0 B.** `core.load` transfiere el búfer al
  worker y lo deja con `byteLength = 0`; ahora se anota antes de cargar.

### Corregido tras la primera prueba de uso (2026-08-19)

- **Cargar un segundo IFC fallaba** con `Aborted(both async and sync fetching of the wasm
failed)`. Se creaba un `IfcImporter` por carga, y el primero libera el WASM de `web-ifc`
  —que vive en una variable de módulo— dejando al segundo sin nada que cargar. Ahora se
  reutiliza. **Con eso `F1.5` pasa a funcionar**: dos modelos abiertos a la vez, cada uno con
  su árbol y sus métricas.
- **Al orbitar se seleccionaban elementos sin querer.** Un arrastre termina en `click`, así
  que cada giro de cámara seleccionaba lo que hubiera bajo el cursor y, en modo medición,
  consumía puntos. Ahora se compara dónde se pulsó con dónde se soltó, con 4 px de margen.

### Cambiado — el render ya no es plano

`SimpleScene` y `SimpleRenderer` dieron paso a **`ShadowedScene`** con
**`PostproductionRenderer`** en modo `COLOR_PEN_SHADOWS`: sombras proyectadas, oclusión
ambiental y **aristas dibujadas**. La referencia es BricsCAD, donde las líneas de los
elementos están siempre presentes y son las que dejan leer el modelo; sin ellas todo era el
mismo blanco plano.

### Medido — un modelo de 32,7 MB, para `F0.6`

| Modelo           | Conversión | Hasta verlo | Fragments            |
| ---------------- | ---------- | ----------- | -------------------- |
| Piso 5 (1,5 MB)  | 1,11 s     | 2,20 s      | 113 KB — 13,7× menos |
| Grande (32,7 MB) | **9,53 s** | **9,82 s**  | 1,5 MB — 22,3× menos |

La conversión corre en el hilo principal, así que esos 9,5 s son de interfaz congelada. La
respuesta se inclina a un **Web Worker** antes que a un backend: sigue siendo cliente y
respeta el local-first.

### Añadido — psets verificados, y el corte con captura (2026-08-19)

- **Fixture `muro-con-psets.ifc`**, escrito a mano con un `Pset_WallCommon` y unas
  `BaseQuantities`. Cierra `F1.2` sin depender de un reexport: el panel muestra los siete
  valores con sus tipos bien traducidos (booleanos como "sí"/"no", real `0.35`, etiqueta
  `F-60`).
- **El corte quedó verificado también en imagen**, sobre el modelo real: se ve el plano con
  su manija de arrastre y el edificio seccionado mostrando el interior.

### Corregido — el panel mostraba once bloques donde debía mostrar dos

Solo se vio con psets de verdad. Las relaciones de IFC son de doble sentido, así que cada
propiedad reaparecía como bloque propio y el elemento se listaba a sí mismo. Ahora las
relaciones ya leídas (`HasProperties`, `Quantities`) no se recorren otra vez, el propio
elemento se excluye de sus relacionados, y un pset se titula con su nombre en vez de
`IFCPROPERTYSET · nombre`. De paso entraron las cantidades, que antes no se leían: viven en
`Quantities`, no en `HasProperties`.

### Pendiente conocido — las cantidades de longitud salen en las unidades del modelo

`Length 4000` son 4000 mm, pero el panel no lo dice porque **no sabe la unidad**: los
metadatos que expone Fragments traen esquema, nombres y CRS, no `IfcUnitAssignment`.
Convertir exige leer las unidades del IFC crudo durante la carga; `bim-core` ya tiene
`parseLengthUnit` y `toMeters` para eso. Hasta entonces el valor se muestra tal como está en
el archivo, sin inventar una unidad. Áreas y volúmenes no tienen el problema: el IFC los
declara en metros.

### Añadido — cortes y mediciones completas, `F1.3` y `F1.4` (2026-08-19)

- **Cortes por tres ejes**, con el plano arrastrable y un botón para quitarlos. Verificado con
  el contador de planos: 0 → 1 → 2 → 3 y de vuelta a 0. El efecto visual **no se pudo
  capturar** porque el panel de vista previa dejó de componer.
- **Ángulo y área**, que faltaban para cerrar `F1.4`. El área se recalcula con cada vértice,
  así que se ve crecer mientras se recorre el contorno. Medido sobre el modelo real: 1,131 m,
  19,4° y 1,92 m² con 6,88 m de perímetro.
- **La geometría de las mediciones se mudó a `bim-core`**, donde tiene 18 pruebas contra casos
  elementales: el cuadrado unitario mide 1 m², el triángulo 3-4-5 mide 6 m², el ángulo recto
  da 90°. Son números con consecuencias —alguien pide material con un área— y no deben vivir
  sin pruebas en la capa de dibujo. Dos casos que delatan una mala implementación: un polígono
  a 300 m del origen debe medir lo mismo, y **un faldón inclinado mide su superficie real
  (√2 m²), no su sombra en planta (1 m²)**.

### Corregido — el árbol mentía sobre lo que estaba oculto

El estado de visibilidad vivía dentro de cada fila del árbol, así que **Ver todo** restauraba
el modelo pero los iconos seguían marcando lo oculto. Ahora el estado vive fuera y el icono
dice la verdad; aislar también lo limpia, porque aislar deja todo lo demás oculto y los
iconos dejarían de corresponder.

### Añadido — modos de vista y medición, `F1.7` y `F1.4` (2026-08-19)

A pedido del usuario. Una barra bajo el modelo agrupa lo que cambia **cómo** se mira,
separado del árbol, que cambia **qué** se mira:

| Grupo          | Opciones                   | Verificado                                                   |
| -------------- | -------------------------- | ------------------------------------------------------------ |
| Proyección     | Perspectiva · Ortográfica  | La cámara pasa de `PerspectiveCamera` a `OrthographicCamera` |
| Navegación     | Órbita · Planta · Interior | Los tres modos se activan sin error                          |
| Representación | Sólido · Fantasma          | ✅                                                           |
| Medir          | Distancia entre dos puntos | Midió 0,858 m sobre el modelo real                           |

- **La cámara pasó a `OrthoPerspectiveCamera`.** La ortográfica es la que importa para una
  oficina técnica: sin fuga, dos muros del mismo largo se ven del mismo largo.
- **"Fantasma", no "wireframe", y a propósito.** Se logra con materiales translúcidos, no
  dibujando aristas. Fragments tiene una representación de alambre (`CurrentLod.WIRES`) pero
  la reserva para su nivel de detalle automático y no la expone. Llamarlo wireframe sería
  vender otra cosa.
- **La medición es propia.** Las anotaciones de That Open están atadas a los planos 2D, así
  que medir en 3D usa el raycast con ajuste a vértice, arista y cara **en ese orden**. Sin la
  cara como respaldo, medir es un juego de puntería contra las esquinas.
- **Falta área y ángulo** para cerrar `F1.4`.

### Corregido — dos copias de Three.js en la página

El navegador avisaba "Multiple instances of Three.js being imported": los paquetes de That
Open están fuera del pre-bundling y resolvían `three` por su ruta de archivo, mientras la
aplicación usaba la copia pre-empaquetada. Dos copias son dos jerarquías de clases, y un
`instanceof` puede fallar sobre un objeto que sí es de ese tipo — la clase de fallo que
aparece meses después y no se entiende. `resolve.dedupe` no basta: hay que excluir `three`
del pre-bundling.

### Añadido — árbol espacial, `F1.1` (2026-08-19)

- **Panel de estructura** que recorre el modelo, con **aislar** en un clic, **ocultar** por
  nodo y **Ver todo** para restaurar. Verificado sobre el modelo real: aislar `IFCDOOR (10)`
  deja exactamente las diez puertas en pantalla.
- Los nombres se resuelven en **una sola consulta por modelo** (con `LongName` de respaldo,
  que es donde muchos exportadores ponen el nombre de plantas y edificios).
- **Los grupos de más de 30 elementos no se listan**: el modelo de prueba tiene 470
  `IfcBuildingElementProxy` y listarlos da un árbol que nadie recorre. El grupo sigue siendo
  aislable completo.

Lo que costó entender: **Fragments ya agrupa por categoría**. Un nodo con `category` y sin
`localId` es un grupo; uno con `localId` es el elemento, y hereda la categoría del grupo.
Reagrupar por encima producía niveles fantasma etiquetados "sin categoría".

### Añadido — selección con propiedades, `F1.2` (2026-08-19)

- **Un clic sobre el modelo abre la ficha del elemento**: categoría, GUID, tipo y material,
  con el elemento resaltado en el violeta de la marca. Sobre el modelo de prueba, clicar
  una viga informa `IFCBEAM`, su tipo `Concrete, Plain 510.29` y su material.
- **El GUID se valida con `bim-core` antes de mostrarlo.** Un GUID mal formado no sirve
  como identidad, y es mejor detectarlo al seleccionar que al exportar un BCF.
- **Vista inicial isométrica** y botón **Encuadrar**.

Lo que el modelo real enseñó, y quedó en el código: el GUID vive en `_guid` (no en
`GlobalId`), la categoría en `_category`, y las relaciones de IFC **tienen ciclos**
—`IsDefinedBy` → tipo → `ObjectTypeOf` devuelve todos los elementos del mismo tipo—, así
que esa relación se ignora y el recorrido se limita a dos niveles.

### Corregido — la cámara no obedecía

Eran dos causas encadenadas: camera-controls **solo mueve la cámara dentro de
`update(delta)`**, y **`fitToBox` pisa los ángulos**, así que girar antes de encuadrar no
dejaba rastro. Con el orden invertido —encuadrar primero, rotar después— y un `update`
explícito, la vista inicial es la isométrica esperada.

### Pendiente conocido

- **Los psets no se han verificado contra un archivo real.** El código los lee, pero el
  modelo de prueba se exportó sin ellos (`IfcExportBaseQuantities: Off` en su cabecera), así
  que hace falta un IFC que los traiga para cerrar ese punto. Mientras tanto el panel
  muestra tipo y material, que es la información que sí llega.

### Añadido — arranque del repositorio (2026-08-18)

- **Arranque del repositorio** (2026-08-18). AeroBim se separa de AeroPlanner como
  producto propio: visor y coordinador BIM en el navegador — modelos IFC, nubes de
  puntos, temas de coordinación en BCF y detección de interferencias.
- `MASTER_PLAN.md` con siete fases, cada una con criterio de salida y oráculo de
  verificación, más los riesgos abiertos. `F0.4` (abrir un IFC real y medir el
  rendimiento) queda marcada como la tarea que puede invalidar el stack elegido.
- `AGENTS.md` con las convenciones obligatorias: el GUID de IFC como única identidad,
  unidades explícitas en los nombres, CRS declarado en toda coordenada, y
  `packages/bim-core` sin dependencias de interfaz.
- `docs/REFERENCES.md` con el estudio de alternativas open-source y **las licencias
  verificadas** contra la API de GitHub, npm y PyPI.
- `docs/ARCHITECTURE.md`, `docs/MVP.md` y `docs/INTEGRATION_AEROPLANNER.md`.
- Marca `assets/aerobim-mark.svg`: el dron común de la familia —mismos brazos, mismos
  cuatro rotores, mismo fuselaje— con un cubo isométrico como motivo propio, en
  violeta `#9B5DE5`. Es el cuarto color de la familia, junto al turquesa de
  AeroControl, el ámbar de AeroPlanner y el amarillo de AeroLink.

### Decisiones registradas

- **That Open Company para el visor** (MIT / MPL-2.0), no xeokit. xeokit es superior en
  varios puntos —doble precisión para coordenadas globales, IFC y nube de puntos en una
  misma escena listos para usar— pero es AGPL-3.0: servir la aplicación obligaría a
  liberarla completa o a pagar licencia comercial. La decisión es legal, no técnica, y
  queda registrada como tal para no reabrirla con información incompleta.
- **El backend llega en la Fase 3**, no antes. Las fases 0 a 2 corren enteras en el
  navegador: un visor que exige servidor para abrir un archivo local contradice el
  local-first de la familia.
- **Speckle queda como referencia**, no como dependencia: adoptarlo condicionaría toda
  la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo.
- **Lo geoespacial se queda en AeroPlanner.** Ortofoto, DEM, curvas de nivel y la nube
  del vuelo cierran allá el ciclo de planificación. Las nubes de puntos se reparten por
  propósito: producto del vuelo en AeroPlanner, as-built contra modelo en AeroBim.
