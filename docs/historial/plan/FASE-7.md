# Fase 7 — Planos 2D

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 7 — Planos 2D: los que llegan y los que salen

**Agregada el 2026-08-19 a pedido del usuario.** No estaba en el plan original, y entra
porque para una oficina técnica un plano suele valer más que un modo de visualización: es
lo que se imprime, se firma y se lleva a obra.

**Tiene dos direcciones, y la de entrada se pidió después y va primero** (2026-08-19):
cargar el plano 2D que ya existe —el DXF del proyecto— y **cruzarlo con el IFC**. Es lo que
hoy obliga a tener el CAD y el visor BIM abiertos a la vez para responder una pregunta
simple: lo que dice el plano, ¿está modelado, y dónde?

**Objetivo de entrada:** ver el plano bajo el modelo, a escala y en su sitio, con sus capas
encendibles una por una, y poder comparar.

**Objetivo de salida:** sacar del modelo un plano acotado que alguien pueda usar, sin
volver a la herramienta de escritorio.

### La mitad de entrada: cargar el plano y cruzarlo con el modelo

| #       | Tarea                                                                                                             | Estado                            |
| ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `F7.6`  | **Leer un DXF**: capas, unidades, colores, textos, líneas, polilíneas, arcos y bloques                            | ✅                                |
| `F7.7`  | **Dibujarlo en la escena** a una cota, con los colores reales del CAD y sus rótulos                               | ✅                                |
| `F7.8`  | **Calzar plano y modelo**: por dos pares de puntos, y a mano con unidad, cota y giro                              | ✅                                |
| `F7.9`  | **Panel de capas del plano**: encender y apagar cada una                                                          | ✅                                |
| `F7.10` | **Seleccionar en 2D**: clic en un trazo → su capa, su plano y el largo del tramo                                  | ✅                                |
| `F7.11` | **Herramientas CAD**: ajuste a extremo, punto medio y cruce, y medir sobre el plano                               | ✅                                |
| `F7.12` | **Cruzar**: modo 2D, y cortar el modelo a la altura del plano desde su ficha                                      | ✅                                |
| `F7.13` | **Fidelidad del CAD**: paleta ACI, tipos de línea, rellenos, anchos y rótulos                                     | ✅ reabierta y cerrada, ver abajo |
| `F7.14` | **Que sea reproducible**: fixture DXF sintético y modo `plano` en `diag.html`                                     | ✅                                |
| `F7.15` | **El color, resuelto donde el CAD lo pone**: capa `0` en bloque, `BYBLOCK`, capa apagada, color verdadero, grosor | ✅                                |
| `F7.16` | **La forma**: grosores de trazo, patrones de rayado y espacio papel                                               | ✅                                |
| `F7.17` | **Lo que no se dibujaba**: cotas, llamadas, elipses, `POLYLINE`, atributos, matrices                              | ✅                                |
| `F7.18` | **El texto**: alineación real, multilínea, y que el plano no arranque mudo                                        | ✅                                |

### `F7.13` estaba marcada cerrada y la pantalla decía otra cosa (2026-08-26)

**El usuario volvió con la misma queja: «el 2D no representa los colores, las formas ni las
figuras como se esperaba».** La ficha decía «paleta ACI, tipos de línea, rellenos, anchos y
rótulos: ✅». Es exactamente la lección que `AeroControl/AGENTS.md` ya tenía por escrito —_el
tablero miente en las dos direcciones; antes de implementar una fila pendiente, grep el código
que describe_— y aquí mentía en la dirección cómoda.

Medido contra `ACAD-Piso 5_Base.dxf` y `Base1.dxf`, no eran una brecha sino **quince**. Las
cuatro que explicaban lo que se veía:

| Lo que se veía                           | Lo que era                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El contenido de los bloques, casi blanco | **116 entidades** en `Base` y **140** en `Base1` están en la capa `0` dentro de un bloque, y AutoCAD las pinta con la capa del `INSERT`. Se quedaban en la capa `0` literal → índice 7 |
| Un muro pesaba lo mismo que una cota     | **El grosor (código 370) no se leía en ninguna parte**, y `LineBasicMaterial` ignora su `linewidth`: todo a 1 px. La tabla `LAYER` declara `0-MUROS 370=30` contra `AA - COTAS 370=-3` |
| Los rellenos, recuadros vacíos           | Los **23 `HATCH`** del archivo son `ANSI31` y solo se consideraba macizo lo que dice `SOLID`: se dibujaban solo con su contorno                                                        |
| Una capa violeta encima del dibujo       | `Math.abs` borraba el signo del código 62, que es la marca de **capa apagada**. `0-AREA UTIL` (`62 = -201`) está apagada en AutoCAD                                                    |

Y desaparecían en silencio **12 cotas, 11 llamadas, 36 puntos, 3 enmascaramientos** y **10
elipses**; las opacidades estaban inventadas entre 0,35 y 0,9 con la postproducción encendida
sobre el plano; los 433 textos salían todos centrados cuando **398 van arriba a la izquierda**;
un `MTEXT` de cuatro renglones se aplastaba a uno y se cortaba a 60 caracteres; y con 433
textos el plano **arrancaba sin un solo rótulo**, porque el tope era un conteo de 150.

> **Dos brechas solo aparecieron al medir, y las dos eran de la propia reparación.**
>
> **Las capas apagadas no pueden decidir el tamaño del plano.** En `Base1.dxf` la capa
> `0-AREA UTIL` mide 7.050 unidades de alto contra las 2.500 del edificio, y contándola el
> plano pasaba de 27 × 25 m a 27 × 82 m. Con la extensión mal, se deduce mal la unidad y se
> centra mal el dibujo.
>
> **La rampa de grosor tiene que medirse desde el grosor por defecto del archivo, no desde
> cero.** El primer intento —un píxel más 3,5 por milímetro— daba 1,875 px para los 0,25 mm
> del `$LWDEFAULT` y 2,05 para los 0,30 del muro: los dos redondeaban a 2 y el muro volvía a
> pesar lo mismo que la cota. Y los 34 grupos de trazos pagaban la malla gruesa sin ganar nada.

**Lo medido al cerrar** (2026-08-26, sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB):

| Qué                 | Antes                  | Ahora                                        |
| ------------------- | ---------------------- | -------------------------------------------- |
| Trazos              | 5.608                  | **5.711** (con las 12 cotas y 11 llamadas)   |
| Textos              | 380                    | **433** (con los atributos de bloque)        |
| Renglones dibujados | **0** (arrancaba mudo) | **498 de 498**, ninguno descartado           |
| Rellenos            | 23 contornos vacíos    | **23 rayados `ANSI31`**                      |
| Grosores            | todo a 1 px            | **242 trazos a 0,30 mm** contra 5.469 a 0,25 |
| Espacio papel       | dentro del dibujo      | **10 entidades fuera**, contadas aparte      |
| Texturas de rótulos | 7 por plano            | **8 en la escena** con los dos planos        |
| Carga en la escena  | —                      | **137 ms**, sin un error en consola          |

> **La malla gruesa se dibuja y no se clica.** `LineSegments2` es una malla y su geometría ya
> no son pares de vértices, y de esos pares dependen dos cosas que ya funcionaban: el clic que
> devuelve la capa y el largo del tramo (`F7.10`) y el ajuste al cruce de dos trazos (`F7.11`).
> Donde hace falta grosor se dibujan **dos objetos**: la malla, y la línea de siempre con el
> material apagado —que no se dibuja, no cuesta una pasada y sigue contestando—. Comprobado:
> el clic sobre un muro de `0-MUROS` devuelve 0,71 m, el largo exacto del segmento, en una capa
> que ahora tiene malla gruesa al lado.

**Oráculo, y por qué el fixture** (`F7.14`): nada de esto era reproducible —`.gitignore`
excluía `*.dxf` sin excepción y no había un solo plano versionado—, así que se escribió a mano
`apps/web/public/samples/fidelidad-2d.dxf` con un caso por defecto corregido, y el modo `plano`
de `diag.html` emite el informe que lo comprueba. En el informe del fixture **la capa `0` no
aparece**: las 14 entidades del bloque heredaron su capa de inserción, que es la prueba de que
la brecha mayor está cerrada.

`POINT` y `WIPEOUT` **siguen contados a propósito**: un punto se dibuja como un punto —invisible
a escala de plano, y los 36 del plano real están en `Defpoints`, que no se imprime— y un
enmascaramiento **tapa** lo de abajo, que es un efecto y no un trazo. En un visor cuyo objeto es
cruzar plano y modelo, una máscara opaca taparía el modelo. Son 492 en el plano real, y se dicen.

**Lo que quedó hecho el 2026-08-19**, verificado sobre el DXF real en el navegador: el lector
(`packages/bim-core/src/plans/dxf.ts`, 13 pruebas) resuelve el archivo del usuario en **36 ms**
—5.608 polilíneas y 59.136 puntos— y decide que son milímetros aunque la cabecera diga
centímetros; el visor lo dibuja **por color y no por capa** (un plano de remodelación lleva lo
nuevo y lo que se demuele en la misma capa con colores distintos), pone los rótulos tumbados sobre
el plano, y un clic sobre un trazo devuelve su capa y el largo del tramo — comprobado: `0-MUROS`,
0,060 m, en (8,113, 0, −14,913).

**`F7.8` cerrada con el gesto** (2026-08-19). **Calzar con 2 puntos**: se señala un punto
reconocible del plano, su equivalente en el modelo, y otro par más. De ahí salen el **giro**, el
**desplazamiento**, la **cota** —la del punto del modelo— y, si se pide, la **escala**. Los números
siguen ahí: son la red de seguridad cuando el gesto no basta.

Comprobado en el navegador con dos pares construidos a propósito: con un giro de 90° los dos puntos
del plano caen sobre sus destinos con **0 mm de error**, y pidiendo escala sobre un destino del
doble de largo la unidad pasa de 0,001 a 0,002 m, otra vez con 0 mm de error.

> **Dos pares y no uno**: con un par solo se puede mover el plano, no orientarlo. La dirección entre
> los dos puntos dice cuánto girar y su largo cuánto escalar.
>
> **La escala solo si se pide**, con su casilla: en un plano cuya unidad ya es correcta, corregirla
> con dos clics imprecisos estropea lo que estaba bien. Cuando se aplica, la unidad deja de ser una
> de la lista y el selector lo dice — "a medida (0,002 m por unidad)".

**`F7.11` cerrada**: el cursor se engancha al **cruce de dos trazos** —la esquina de dos muros, el
encuentro de dos ejes—, a los **extremos** y a los **puntos medios**, y midiendo distancia esos son
los puntos que toma la cota. El ajuste al plano se apaga desde la cinta: midiendo el modelo con un
plano debajo, engancharse al CAD falsea la medida.

El cruce se calcula en el clic, no por adelantado: se miran los trazos que pasan cerca del cursor y
se cruzan de dos en dos, con un tope de sesenta para que una zona densa siga costando lo que un
clic. Medido sobre el plano real: **3,4 ms por clic**, y de 28 clics sobre tabiques salieron 2
cruces, 5 extremos, 1 punto medio y 20 sobre la línea. La aritmética del cruce vive en el dominio
puro (`segmentIntersection`, con sus pruebas): **no inventa la esquina de dos muros que no llegan a
tocarse**, que es lo que haría cortando las rectas prolongadas.

> **Encuadrar un plano dejaba la cámara en `NaN`.** Un plano 2D es una caja **sin grosor**, y
> `fitToBox` con un lado en cero devuelve una posición imposible: la vista se queda negra, el rayo
> no encuentra nada y ningún botón la recupera, porque todos parten de donde está la cámara. Ahora
> el encuadre le da unos centímetros de grosor a los lados degenerados — no cambia lo que se ve y
> quita el caso que rompe la aritmética. Le pasaba también a un elemento plano encuadrado solo.

### Los ejes de replanteo, dibujados (2026-08-19)

El `IfcGrid` **se cargaba y no se dibujaba**: Fragments lo trata como un producto sin geometría, así
que salía en el árbol y en ninguna otra parte. Era el último pendiente de la revisión del IFC4 de
OpenBuildings, y el que más falta hacía: los ejes son con lo que se habla en obra —"el pilar del eje
C con el 4"— y son **el ancla natural para calzar un plano CAD**, que trae su propia capa de ejes.

Se leen **del propio archivo** (`packages/bim-core/src/inspect/ifcGrid.ts`, 5 pruebas): se indexan
las entidades por identificador y se siguen las pocas referencias que llevan del `IfcGrid` a sus
coordenadas, en las dos formas que aparecen —`IfcIndexedPolyCurve` de IFC4 y la `IfcPolyline`
clásica—, aplicando la colocación de la rejilla y el factor de unidades. Sobre el modelo real:
**12 ejes en 72 ms**, de la A a la H y del 1 al 4; en pantalla, la línea de trazos con su burbuja en
los dos extremos. Se encienden y apagan en Vista → Trabajo → **Ejes**.

Lo que no se puede trazar se cuenta, como en todo lo demás: una `IfcLine` es una recta infinita y
dibujarla exigiría inventar hasta dónde llega.

### Lo que faltaba para que el plano se vea completo (2026-08-19)

Comparando la pantalla con AutoCAD, lo que quedaba fuera eran **los macizos**. Un plano de
arquitectura los dibuja de tres maneras distintas y ahora se leen las tres:

| Cómo lo dibuja el CAD   | Qué se hace                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `HATCH` macizo          | Cara translúcida, con los contornos interiores como huecos        |
| `HATCH` de rayado       | Solo su contorno — a la escala de un plano es lo que se distingue |
| `SOLID` y `3DFACE`      | Cara: son cuatro puntos, con el tercero y el cuarto cruzados      |
| Polilínea **con ancho** | Banda maciza a los dos lados del eje, con el eje dibujado encima  |

> **El ancho de una polilínea no es una línea gruesa, es un macizo.** Es como se dibuja un muro en
> buena parte de los planos, y trazándolo fino el plano se ve vacío justo donde tenía que verse
> lleno. Las uniones van a tope, sin inglete: la diferencia son milímetros en la esquina de un muro.

**Y ahora se puede clicar todo lo que se ve**, no solo las líneas: un relleno dice su capa y un
rótulo, lo que dice. La comparación se hacía con el ojo puesto en los macizos y no había forma de
preguntarles nada.

> **Cómo se decide qué se clicó, con todo en el mismo plano.** No puede ser por distancia a la
> cámara —un rótulo y el trazo que tiene debajo están a la misma—, sino por **cuánto se desvió el
> rayo**: una cara solo acierta si la atraviesa, y una línea acierta dentro de su margen de
> centímetros. Con la distancia mandaba siempre la línea y los rótulos eran inclicables; con el
> desvío, cuarenta de cuarenta rótulos se seleccionan y cinco de seis clics sobre una línea siguen
> dando la línea.

### Cargar un IFC después de trabajar en 2D tumbaba la pestaña (2026-08-19)

**Era la memoria de vídeo, y la culpa era de los rótulos.** Cada texto del plano se dibujaba en su
propio lienzo y subía su propia textura: cuatrocientas texturas de hasta 4096 px por un plano
corriente. Con eso ya cargado, abrir un IFC de veinte megas dejaba la pestaña sin memoria y se caía
todo.

Ahora los rótulos de cada capa van en **un solo atlas** y **una sola malla**: siete texturas para el
plano entero en vez de cuatrocientas, y una pasada de dibujo por capa. Comprobado en el navegador:
el plano, un IFC de 1,5 MB y otro de 23,6 MB conviven sin un solo error en consola.

De paso, el tamaño de los rótulos **se elige** —ocultos, 8, 15, 30 o 60 cm— porque no se puede
deducir del archivo: un plano anotativo escribe alturas de papel (un centímetro de modelo, invisible)
y otro escribe alturas de modelo (que tapan el dibujo).

### `F7.13`: que el plano se vea como en el CAD (2026-08-19)

Tres cosas que el usuario vio de inmediato al poner su plano al lado de AutoCAD:

| Lo que se veía                        | Lo que era                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Los colores no eran los del CAD       | La paleta ACI del 10 al 249 estaba aproximada a ojo; ahora se calcula con su regla real |
| Las líneas discontinuas salían llenas | No se leía la tabla `LTYPE` ni el tipo de línea de la capa                              |
| Los rótulos, diminutos y borrosos     | Textura de 32 px y el alto del CAD tal cual: 2,5 mm de escena                           |

> **El tamaño del patrón de un tipo de línea no sirve tal cual.** Los patrones se definen en
> unidades de papel y se escalan con `LTSCALE`, que en cada oficina vale otra cosa: en el plano real
> salen rayas de **dos milésimas de milímetro** —la línea parpadea o desaparece— junto a otras de
> decenas de metros, que se ven llenas. El visor conserva la proporción entre raya y espacio y lleva
> la raya a una medida legible. Es lo que hace a mano cualquiera que trae un CAD a un modelo.
>
> **Y el rótulo tiene un alto mínimo en la escena.** Con el plano en milímetros, un texto de 2,5
> unidades existe y no se ve. Se sube a 35 cm de escena, con la letra dibujada a 96 px y un
> contorno oscuro detrás para que se lea sobre el dibujo y sobre el modelo.

**Oráculo de entrada:** el `ACAD-Piso 5_Base.dxf` del usuario cae sobre `Piso 5.ifc` y **los
muros coinciden**: la capa `0-MUROS` se superpone a los `IfcWall` del modelo, con la misma
longitud medida en los dos.

**Lo que ya se sabe del archivo real** (medido sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB):

| Qué           | Qué trae                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| Versión       | `AC1032` (AutoCAD 2018), ASCII                                                             |
| Entidades     | 1.480 `LWPOLYLINE`, 496 `INSERT`, 380 `MTEXT`, 21 `HATCH`, 12 `DIMENSION`, 10 `CIRCLE`     |
| Capas         | `0-MUROS`, `0-TABIQUES`, `0-R-NUEVO`, `0-R-DEMUELE`, `0-EJES`, `AA - COTAS`, `0-AREA UTIL` |
| Bloques       | 24, entre ellos `EJES` y mobiliario (`escritorio120x60`…)                                  |
| **Unidades**  | La cabecera declara `$INSUNITS=5` (**centímetros**) y las coordenadas dicen otra cosa      |
| **Extensión** | `$EXTMIN`/`$EXTMAX` **sin calcular** (`1e20` y `0`): no sirven para encuadrar              |

> **Y el tamaño total tampoco basta para deducirlas** (2026-08-19, con el segundo plano real). El
> `ACAD-Piso 5_Base1.dxf` declara **metros**, mide 48 unidades de lado —tamaño creíble en
> milímetros— y sin embargo está en **centímetros**: lo que infla la extensión es el marco de la
> lámina, mientras la planta de verdad ocupaba dos metros mal contados. Con la unidad equivocada,
> todo lo que se calcula a partir del plano sale mal: el tamaño de los rótulos, el patrón de los
> trazos y, sobre todo, el calce con el modelo.
>
> La medida que no engaña es **el trazo más largo**: en un plano de edificio es una fachada, un muro
> o un eje, y mide entre tres y cien metros, nunca dos. Se puntúan las dos —extensión total y trazo
> mayor— y gana la unidad que cumple las dos. Con eso, `Base1` sale en centímetros y `Base` sigue en
> milímetros, cada uno con su edificio a tamaño de edificio.
>
> **Y el encuadre cuenta solo lo encendido**: con el marco de la lámina apagado, encuadrar el plano
> lleva al edificio (19,9 m de ancho, contra los 21,8 m del IFC) en vez de dejarlo como un sello en
> una esquina de 480 metros.

> **Las unidades de un DXF no se creen, se comprueban.** `0-MUROS` mide 20.023 unidades de
> ancho y el piso del IFC mide 21,8 m: son milímetros, no los centímetros que declara la
> cabecera. Por eso la carga **propone** un factor y deja cambiarlo, en vez de aplicar
> `$INSUNITS` a ciegas. Es el mismo problema que ya costó una sesión con las unidades de los
> psets, y la misma respuesta: mostrar el número y de dónde sale.
>
> **`$EXTMIN` viene sin calcular**, así que el encuadre se hace con la extensión real de lo
> dibujado y no con lo que dice la cabecera.
>
> **Es un plano de remodelación**: `0-R-NUEVO` y `0-R-DEMUELE` son lo que se construye y lo
> que se bota. Cruzar esas dos capas con el modelo es justo la pregunta que el usuario
> quiere poder responder, y por eso las capas se encienden una por una y no en bloque.

### La mitad de salida: generar el plano desde el modelo

| #      | Tarea                                                                                                | Estado       |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------ |
| `F7.1` | Generar vistas 2D desde el modelo (planta, alzados) proyectando sus aristas                          | ✅ ver abajo |
| `F7.2` | Viewports y capas: qué se dibuja, con qué grosor y en qué capa (`DrawingViewports`, `DrawingLayers`) | ✅ ver abajo |
| `F7.3` | Acotado y anotaciones sobre el plano: cotas lineales, ángulos, pendientes y llamadas                 | ✅ ver abajo |
| `F7.4` | **Exportar a DXF** con `DxfExporter`, en A3 y milímetros, listo para el CAD                          | ✅ ver abajo |
| `F7.5` | Exportar a PDF imprimible, con formato y sello                                                       | ✅ ver abajo |

**Oráculo:** el DXF exportado **abre en AutoCAD o BricsCAD** con sus capas y cotas
intactas, y una distancia medida en el plano coincide con la del modelo. Un plano que solo
se entiende dentro de AeroBim no es un entregable.

### Lo armado el 2026-08-19, y qué falta confirmar

> **Esta sección es del 2026-08-19 y se deja como estaba.** Las dos filas que da por sin confirmar
> se cerraron después: `F7.4` el 2026-08-26 y `F7.1` el 2026-09-09, las dos más abajo.

**`F7.1` y `F7.4` están montadas y sin confirmar en pantalla.** El panel "Planos generados" del
navegador ofrece **planta, frontal y lateral**: proyecta las aristas de lo que está encendido —esa
es la selección, no hay diálogo aparte—, arma el dibujo con su viewport, y lo exporta a **DXF en A3
y milímetros**, que es lo que se pide cuando alguien quiere un plano imprimible. Las aristas ocultas
se generan y se dejan apagadas, porque en un plano de arquitectura son la mitad del ruido.

**El ensamblaje es de la librería**, como decía la nota de esta fase: `EdgeProjector` proyecta,
`TechnicalDrawing` sostiene el dibujo y sus viewports, `DxfExporter` serializa. Lo propio es qué se
proyecta, con qué nombre, en qué papel y con qué avisos.

> **No se pudo verificar en el navegador de pruebas**, y esta vez el motivo es claro: `EdgeProjector`
> usa el renderizador para descartar lo tapado, y en un panel que no compone fotogramas la
> proyección **no arranca** — ni siquiera emite su primer aviso de avance.

#### Medido el 2026-08-26: el cuelgue ahora se dice

Se escribió el modo `planos` del diagnóstico —`/diag.html?modo=planos&ifc=…`— y **confirmó el
diagnóstico con precisión**: en las tres vistas, `projector.get()` **no resuelve nunca y no emite un
solo aviso**; la promesa se queda pendiente para siempre.

Eso, mirado de frente, **es un defecto del producto y no solo del entorno**: quien pulsara «Planta»
en un equipo sin aceleración —o con la pestaña de fondo— veía «Proyectando las aristas del modelo…»
indefinidamente. Había un botón «Dejar de esperar», pero solo limpiaba el aviso: no explicaba nada y
la promesa seguía colgada. Es la misma clase de fallo que el WASM multihilo, y ese ya costó una
sesión.

**Ahora hay un corte por falta de latido**, y la distinción importa: **no es un tope al tiempo
total** —proyectar un modelo grande puede tardar minutos con razón— sino a **veinte segundos sin un
solo aviso de avance**. Lo que llega por `onProgress` es el latido. Al cortar, el mensaje dice qué
pasó y por qué:

> _«La proyección de aristas no respondió en 20 s y se dio por colgada. Suele ser que el navegador no
> está dibujando la escena: EdgeProjector lee la escena dibujada, así que en una pestaña oculta o sin
> aceleración no avanza.»_

Comprobado en las tres vistas: las tres cortan con ese mensaje, la interfaz vuelve y el aviso de
avance se limpia. **Un cuelgue se convirtió en algo que se puede contar.**

### `F7.5` — ✅ La lámina en PDF, y el reparto navegador/servidor

**Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** El visor ya sacaba
el DXF; esto cubre el caso más común de todos, que es mandarle la planta a alguien que no tiene
AutoCAD. Sale en **Carta con el membrete de J.E.J.**, igual que el informe.

**El navegador proyecta y el servidor compone el papel**, y ese reparto no es una comodidad:

- **Proyectar aristas necesita un renderizador**, y en un servidor sin pantalla es justo lo que no
  hay. Mandar el modelo para proyectarlo allí significaría además convertir el IFC dos veces y tener
  `web-ifc` en el servidor.
- **El membrete ya vive en el servidor**, medido del formato de la oficina. Y es la decisión que el
  usuario tomó para el informe: «la meta es desde el servidor, así buscamos que sea interno».

Lo que viaja son **los segmentos y los textos ya situados en coordenadas del dibujo** —lo mismo que
se escribe en el DXF—, así que el PDF y el DXF dibujan el mismo plano. Solo las capas encendidas: el
papel tiene que decir lo mismo que la pantalla.

Tres decisiones del papel:

- **La misma escala en los dos ejes**, y escrita en la hoja. Escalar cada eje por su cuenta llenaría
  más el papel y **deformaría el plano**, que es lo peor que le puede pasar a un dibujo del que
  alguien va a medir. No se redondea a 1:50 ni a 1:100 —eso obligaría a recortar o a dejar media hoja
  vacía— pero la que salió se dice: «Escala aproximada 1:64».
- **Trazo de 0,3 pt.** Una planta con trazo de un punto se convierte en una mancha negra en cuanto
  hay dos muros cerca; 0,3 es lo que usa un CAD para la capa de proyección.
- **Tope de 60.000 segmentos, y cuando se recorta se dice en el propio papel.** Una lámina que calla
  lo que dejó fuera hace creer que el plano está completo, y de ahí salen decisiones sobre lo que no
  se ve. Por encima de ese tope lo que se quiere es el DXF, que es geometría y no papel.

> **El oráculo, y uno de sus asertos no es de texto.** `pypdf` lee el archivo: página Carta —612 ×
> 792 pt—, el sello con el código de la obra, el contacto copiable, la escala. Pero **un PDF con
> membrete y sin una sola línea pasaría cualquier prueba de texto y sería una hoja en blanco con
> sello**, así que se cuentan los operadores de trazo del flujo de contenido.
>
> Costó mirar el flujo de verdad para acertar: reportlab escribe la ruta entera **en una sola
> línea** —`n x y m x y l … S`—, así que anclar la búsqueda a principio de renglón no encontraba
> nada; y las cadenas de texto van entre paréntesis en el mismo flujo, así que hay que quitarlas o
> una `l` dentro de «Planta» cuenta como un trazo.
>
> Y hay una prueba de que **el dibujo no se deforma**: un dibujo de 40 × 1 m tiene que salir a una
> escala del orden de 1:260, no llenando la hoja.

> **El membrete se extrajo a `membrete.py` y lo usan las dos salidas.** Con una copia en cada una, la
> segunda se queda atrás en el primer cambio —el logotipo nuevo, otro teléfono— y el producto manda
> dos papeles distintos con el mismo nombre. Las pruebas del informe que comprobaban el membrete
> apuntan ahora al módulo nuevo, y las 24 del informe siguen pasando: eso es lo que prueba que la
> extracción no cambió el papel.

> **Y un error propio que hay que dejar escrito.** Al escribir `membrete.py` **inventé el bloque de
> contacto** —una dirección y un teléfono que no son los de la oficina— en vez de copiar el que
> había. Lo destaparon las pruebas del informe, que comprueban «jej.cl» en el PDF, y se recuperó de
> `git show HEAD:…`. Mover código es copiar, no reescribir de memoria: si el original está a un
> comando de distancia, se lee.

**Lo que queda fuera, y por qué:** las cotas de `F7.3` **no salen en el PDF**, solo en el DXF. Sus
líneas y su número los construye la librería dentro de sus propios grupos, y sacarlos de ahí sería
leer sus entrañas y romperse en su siguiente versión. Para el PDF hace falta el mismo camino que las
tablas: calcular su trazo nosotros. Queda dicho en el código, en `DrawingMaker.sheet`.

### `F7.3` — ✅ El acotado sale del modelo, y no se mide dos veces

**Las cotas, primero**: las que ya se midieron sobre el modelo —con el
ajuste a vértice, que es lo que hace que dos personas midan lo mismo— **se llevan a la lámina** y
salen en el DXF con su número. El botón está en la ficha de cada plano generado: «Acotar con las 3
mediciones».

Acotar encima del dibujo, que es la otra forma de hacerlo, sería **medir dos veces la misma cosa** y
arriesgarse a que los dos números no coincidan. Midiendo una vez sobre el modelo, el número del plano
es el número del modelo por construcción.

Tres cosas que se ven poco:

- **Los puntos se llevan a coordenadas del dibujo y se aplasta la Y.** Un dibujo es un plano en el
  espacio, así que una cota entre dos puntos a distinta altura **se proyecta acortada** — igual que
  la geometría, y es lo correcto: en una planta, una diagonal que sube se dibuja más corta.
- **Una cota que se proyecta a un punto no es una cota.** Una medición vertical en una planta se
  aplasta a cero: se salta, y la ficha dice **cuántas entraron** en vez de «hecho». Un «hecho»
  dejaría a alguien buscando en el DXF una cota que no está.
- **Solo las encendidas.** Una medición apagada es una que quien mide decidió no mostrar, y el plano
  tiene que decir lo mismo que la pantalla.

> **El oráculo.** `diag.html?modo=dxf` acota el lado de 10 m del rectángulo de prueba, exporta, y lee
> el DXF con nuestro lector: entre los textos está **`10.00 m`**, la medida exacta. Es lo que importa
> de una cota — la línea y las marcas son geometría que el exportador ya escribía; **una cota que no
> escribe su número no es una cota**.

**Y las otras tres, cerradas el 2026-09-03**, cada una con su decisión:

- **Los ángulos se llevan igual que las cotas**: un ángulo medido tiene tres puntos —dos extremos y
  el vértice— y el del plano también, así que la traducción es directa y no hay que inventar nada.
- **La pendiente no se mide: ya está medida.** El visor no tiene herramienta de pendiente y no hace
  falta, porque **una cota entre dos puntos a distinta altura la lleva dentro**: es la diferencia de
  altura partida por el recorrido en horizontal. Añadir una herramienta para pedir otra vez lo que
  ya se sabe sería preguntar dos veces lo mismo. Va cuesta abajo, que es la convención —la flecha
  apunta a donde corre el agua— y se salta lo que está a nivel con un umbral **en milímetros y no en
  cero**: dos puntos ajustados a vértices distintos de la misma losa difieren en décimas de
  milímetro, y anotar «0,02 %» en una planta es ruido que hace dudar de la que sí importa.
- **Las llamadas son el punto de la fase entera**: señalan **dónde cayó el elemento de cada
  hallazgo** en el plano. Un plano que dice «aquí falta la cota del vano V-03» es un plano con el
  que se va a obra; sin ellas, el plano y la lista de hallazgos son dos papeles que hay que cruzar a
  mano.

> **Y la posición de un hallazgo no se estima, se lee del propio dibujo.** `EdgeProjector` devuelve,
> junto a la geometría, **a qué elemento pertenece cada grupo de vértices**, y la geometría lleva un
> atributo `group` por vértice. Así que la posición de un elemento en la lámina es el centro de sus
> vértices **proyectados** — dónde está dibujado de verdad, no dónde estaría su caja del modelo, que
> en una planta puede caer fuera del dibujo. Ese mapa **se guarda al proyectar o se pierde**: no hay
> forma de reconstruirlo después.

> **Un solo botón para las tres primeras**, y no tres. Quien acota un plano no quiere elegir «ahora
> las cotas, ahora los ángulos»: quiere que lo que midió aparezca. Y las tres salen del mismo sitio
> —las mediciones encendidas—, así que separarlas sería inventar una decisión que nadie tiene. Las
> llamadas sí van aparte porque salen de otro sitio: los hallazgos de la obra.

> **El oráculo: las cuatro escriben su valor en el DXF.** Medido con `diag.html?modo=dxf`, leyendo
> el archivo con nuestro propio lector: **`10.00 m`, `90.00°`, `15.00 %`** y **«Falta la cota del
> vano V-03»**. Es lo que importa de una anotación —las líneas y las marcas son geometría que el
> exportador ya escribía— y **una cota que no escribe su número no es una cota**.

> **Y lo que no se pudo comprobar en pantalla, dicho:** el botón está tipado, compilado y con lint y
> formato limpios, pero **no se ha pulsado**, porque para eso hay que generar un plano y `F7.1`
> necesita un navegador que componga fotogramas — la misma limitación de siempre, la que hizo falta
> el corte por falta de latido. Lo comprobado es el camino de datos completo hasta el DXF.

> **Pulsado el 2026-09-09**, en cuanto `F7.1` dejó de ser el tapón, y de punta a punta:
> `?modo=acotar` mide sobre el modelo con el rayo y el ajuste, genera la planta, llama a
> `annotateDrawing` —que **es** el botón: la interfaz no hace nada más— y lee el DXF de vuelta.
>
> **El oráculo son tres cifras que cierran entre ellas**, y es mejor que cualquiera de las tres por
> separado: se mide **6,990 m** directos con **2,830 de desnivel**, el DXF escribe la cota en
> **6,39 m** —porque en una planta la cota es la proyección horizontal, no la distancia— y la
> pendiente en **44,28 %**; y 44,28 % de 6,39 dan 2,830 de desnivel y 6,990 directos. Si el acotado
> tomara la cifra equivocada de la medición, eso no cuadraría. La cota además **cae dentro del
> dibujo**: a 123,6 / 144,1 de una hoja de 217,5 × 227,3, que es la otra mitad de la pregunta —un
> texto en el archivo pero fuera de la caja es una cota que en el CAD nadie ve.
>
> **Y la primera versión de esa comprobación estaba mal, no el código:** buscaba los 6,990 m
> directos y dio «NO (mal)» sobre un plano correcto. Es el error de siempre, comparar contra el
> número equivocado, y por eso queda escrito en el propio modo.

### `F7.2` — ✅ Capas con nombre, y el viewport que se llevaba la mitad del plano

**Dos cosas, y la segunda no se buscaba.**

**Las capas.** Todo salía en la capa `0` del DXF, y eso es lo que hace inútil un plano en una oficina
técnica: quien lo abre no puede apagar las aristas ocultas, ni darles otro grosor, ni congelarlas
para acotar encima. Un dibujo en el que todo es la misma capa no es un entregable. La causa era que
el código colgaba las líneas a mano —`drawing.three.add()` y `layers.set(1)`— en vez de pasarlas por
`addProjectionLines()`, que es lo que asigna la capa: **la librería tenía la API desde el principio y
no se estaba usando.** Ahora salen `AB-VISIBLE` y `AB-OCULTA`, con prefijo para no mezclarse con las
capas de la oficina al insertar el plano en otro archivo.

**Y el viewport, que era un defecto serio.** Al comprobar el reparto por capas salieron **4 de 5
segmentos**, y de ahí tiró el hilo:

- El exportador escribe cada segmento como `(x, z)` del dibujo, pasado por su transformación.
- `DrawingViewport.bbox` se construye como `Z ∈ [-top, -bottom]`, y el eje Y local de la librería
  está documentado como **«world −Z»**. O sea: `top` y `bottom` **son coordenadas de papel, no Z**.
- `drawings.ts` pasaba las Z tal cual, así que la caja de recorte quedaba **al otro lado del
  dibujo**: para un plano con z de 0 a 6 aceptaba `z ≤ margen` y tiraba el resto.

Medido sobre un rectángulo de 10 × 6 m con diagonal: el borde superior **desaparecía entero** y la
diagonal se cortaba en x = 1,3, justo donde cruza el borde de la caja mala. Con las coordenadas de
papel salen los cinco segmentos, y los dos de la otra capa, y el testigo.

> **Por qué no lo veía nadie, que es la parte que importa.** La comprobación con la que se cerró
> `F7.4` miraba **la extensión del DXF y el número de trazos**. Y la extensión la marca el recuadro
> del viewport, no el dibujo: cuadraba igual con el plano recortado que con el entero. Un oráculo que
> mide el marco no puede ver que falta el cuadro.
>
> Ahora se comparan **las coordenadas**, capa por capa y segmento por segmento, contra una geometría
> de medidas conocidas. Es la diferencia entre «el exportador escribió algo» y «escribió esto».

**Lo que queda de la fila, dicho:** el grosor de trazo. El exportador **no escribe el código 370**,
así que las tres capas salen con «por defecto» y la jerarquía de grosores —muro gordo, oculta fina—
habría que ponerla en el CAD. Se mide y se dice en el diagnóstico en vez de suponerlo; darlo por
hecho sería repetir el error de arriba.

#### `F7.4` cerrada aparte: el exportador **no depende del proyector** (2026-08-26)

**Es una descomposición que no se había hecho, y cambia lo que se puede afirmar.** `F7.1` y `F7.4`
estaban las dos en 🟡 «por el mismo motivo», y no era el mismo: proyectar necesita un navegador que
componga fotogramas, pero **exportar recibe un dibujo con su viewport y lo serializa**. Así que se le
arma un dibujo de **medidas conocidas** —un rectángulo de 10 × 6 m— y se comprueba lo suyo, en
`/diag.html?modo=dxf`.

El oráculo es doble y no hay que creerle a nadie:

| Qué                              | Resultado                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| Sin papel, en unidades del mundo | **11,00 × 7,00** — el rectángulo más su margen de 0,5 por lado  |
| En A3 y milímetros               | **420,00 × 297,00 mm**, el 100 % del ancho del papel            |
| Lo lee **nuestro propio lector** | 8 y 16 trazos, **nada sin dibujar** en ninguno de los dos casos |

La segunda fila es la que importa: 10 m son 10 000 mm, así que un exportador que pusiera el dibujo
tal cual **no cabría en la hoja**.

> **Y de esa segunda fila se sacó una conclusión que era falsa**, corregida el 2026-09-09: «que la
> extensión sea exactamente la del A3 dice que el dibujo se escala al papel». No lo dice. La
> extensión del DXF la marca **el recuadro del papel**, que el exportador dibuja siempre y mide
> 420 × 297 haya lo que haya dentro. El rectángulo de 10 × 6 m cabía por su tamaño, no porque nada
> lo escalara — y cuando llegó un edificio de 69 m, no cupo. Ver el cierre de `F7.1`.

> **Lo que sigue sin confirmarse de `F7.4`**: que **AutoCAD** lo abra. Que nuestro lector lo lea es
> evidencia independiente y fuerte —es otra implementación— pero no es la misma afirmación. Y lo que
> se exporta aquí es un dibujo armado a mano, no uno **proyectado**: eso es `F7.1`.

#### `F7.1` cerrada el 2026-09-09, corriéndola: dos defectos que su oráculo no podía ver

**Llevaba meses en 🟡 con el motivo anotado y era cierto**: `EdgeProjector` lee la escena dibujada y
el panel del entorno no compone fotogramas, así que la proyección no avanzaba ni un paso. Hoy se
pudo correr **forzando el fotograma desde fuera** —una captura de pantalla obliga al navegador a
pintar, y cada pintado da de comer al proyector—, y con eso el modo `?modo=planos` llegó al final.

**Lo que salió no fue la confirmación esperada, sino dos defectos.** Los dos pasaban el oráculo que
había, y por el mismo motivo: contaba trazos y medía la extensión del DXF, y ninguna de las dos
cosas dice **dónde caen** los trazos.

| Qué                                               | Medido sobre `Piso 5.ifc` y el IFC de 23,6 MB                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Los dos alzados salían aplastados en una raya** | El frontal, **2 349 trazos en 217,5 × 0,0 mm** de papel; el lateral, 2 526 en **0,0 × 227,3**. La planta, correcta                                         |
| **El plano no cabía en la hoja que decía**        | La planta del modelo grande, **362 × 690 mm sobre un A3 de 420 × 297** — el doble de alto que el papel, con el recuadro dibujado alrededor como si cupiera |

**El primero es de sistema de referencia, y la causa está en la librería siendo razonable.**
`EdgeProjector` gira las mallas para que la dirección de proyección quede en `(0, −1, 0)`, proyecta
—el resultado queda plano en el XZ— y al final **le aplica la rotación inversa** para devolverlo en
coordenadas del mundo. Lo que vuelve está sobre el plano de proyección, pero en el mundo: en el XZ
solo si se miraba desde arriba. Un alzado frontal vuelve en el XY, y todo lo de aquí —el viewport,
que se arma con X y Z; el exportador, que lee X y Z; `sizeM`; las cotas; y la lámina del PDF— lee una
coordenada como constante y colapsa el dibujo.

**Y lo que faltaba era una llamada, no una matriz nuestra.** El primer arreglo giró la geometría con
una rotación escrita a mano: daba las medidas correctas y era el camino equivocado.
`TechnicalDrawing.orientTo()` orienta el contenedor para los seis ejes estándar y garantiza **las
dos** condiciones que la librería documenta —que el −Y local apunte a lo que se captura, y que el +X
local caiga a la derecha de la pantalla—, y la segunda es la que evita que **las cotas y sus números
salgan en espejo**: justo la que una rotación propia se salta sin avisar. Con el contenedor
orientado, lo local es el papel, y de paso el alzado **queda de pie en la escena 3D** en vez de
tumbado sobre la planta. Es la regla de esta fase otra vez: antes de construir, mirar si ya está
hecho.

Y hay un detalle que merece quedar escrito: `aEspacioDelDibujo` —lo que lleva una cota medida al
papel— **ya era correcto** y aun así acotaba mal los alzados. Lo era **a condición de** que el
contenedor estuviera orientado, y nadie llamaba a `orientTo`. No cambió la función; cambió que su
premisa se cumple.

**El segundo es de escala.** El viewport nacía a 1:100, el valor por defecto de la librería, y ese
número no depende del papel. Ahora se elige **la mayor escala del escalímetro en la que el dibujo
entra** —1:500 para el modelo grande, 1:100 para su alzado— y **el nombre del archivo la dice**,
porque un plano sin escala escrita no se puede medir con una regla.

**Lo que queda comprobado, y es comprobable a mano:** las tres vistas de `Piso 5.ifc` dan
**21,75 / 22,73 / 2,98 m** —las dos del contorno y la altura de piso— repartidas en seis casillas,
o sea que los seis números se reducen a tres. Y **cuánto tarda con el IFC de 23,6 MB**: la planta
**16,0 s** con 99 160 segmentos visibles y 40 114 ocultos, el alzado frontal **30,6 s** con 85 447.
Son cotas superiores y no una medida limpia: en este entorno el proyector solo avanza cuando algo
de fuera fuerza un pintado, y la tercera vista se cortó por eso mismo —veinte segundos sin
fotogramas— no por el generador, que la había generado sobre el modelo pequeño.

`packages/viewer/src/papel.test.ts` lo fija **sin navegador**, y le pregunta **a la librería** y no a
una matriz nuestra —porque lo que faltaba era la llamada, así que una prueba de aritmética propia
habría seguido pasando sin ella—: a dónde manda cada eje del mundo, y que las tres vistas giran
**sin reflejar**. Un plano en espejo se lee perfectamente y está mal, y el determinante es lo único
que lo delata.

> **Lo que sigue necesitando al usuario**, y es lo mismo que `F7.4`: que **AutoCAD** abra el DXF con
> su escala. Nuestro lector es evidencia independiente y fuerte, pero no es AutoCAD.

> **Por qué esta fase es sobre todo integración.** `TechnicalDrawings`, `DrawingViewports`,
> `DrawingLayers`, `DxfExporter` y la familia de anotaciones —lineales, de ángulo, de
> pendiente, de llamada— **ya existen en `@thatopen/components`**. El trabajo es
> ensamblarlas y darles interfaz, no construir un motor de dibujo. Conviene revisar qué
> resuelven antes de escribir una línea.
>
> Ese descubrimiento vale para más fases: los cortes (`F1.3`) tienen `Clipper`, las vistas
> guardadas (`F1.6`) tienen `Views` y `Viewpoints`, la validación IDS (`F3.5`) tiene
> `IDSSpecifications`, y el BCF de la Fase 4 tiene `BCFTopics`. **Antes de construir, mirar
> si ya está hecho.**

---
