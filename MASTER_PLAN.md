# MASTER_PLAN — AeroBim

> **Fuente única de verdad del trabajo pendiente.** Consolida el estudio de
> alternativas open-source (verificado el 2026-08-18 contra la API de GitHub y los
> registros de npm/PyPI) en un tablero ejecutable con seguimiento de estado.
> **Creado:** 2026-08-18 · **Actualizado:** 2026-08-19 (Fase 0: andamiaje y mediciones)
> **Rama base:** `main`
> **Regla de oro:** cada fase termina en algo **que alguien puede usar**. No se abre
> una fase nueva con la anterior a medio cerrar, y no se agrega alcance fuera de lo
> listado aquí sin que el usuario lo pida.

---

## Por dónde se empieza

**La Fase 0 está completa salvo `F0.6`.** Un IFC de obra real —1,52 MB, exportado por
BricsCAD— abre en la aplicación y se ve en **poco más de un segundo**, con el Fragments
pesando 13,7 veces menos que el IFC. La premisa técnica del stack está confirmada con
cifras, no con promesas de documentación.

**Lo que sigue es `F0.6`:** decidir dónde corre la conversión. Con medio segundo por
modelo en el navegador la respuesta se inclina a dejarla del lado del cliente, pero
conviene medir antes un modelo grande (>50 MB), porque la conversión ocurre en el hilo
principal y ahí sí podría congelar la interfaz.

> **La trampa que más cara salió, para no repetirla:** el despliegue **no debe servir**
> las cabeceras COOP/COEP. Con aislamiento de origen, `web-ifc` elige su WASM multihilo,
> que no funciona empaquetado, y la conversión se queda esperando **sin emitir error**.
> Detalle en _`F0.4` cerrada_, más abajo.

> **AeroBim es el frente activo de la familia** (decisión del usuario, 2026-08-19).
> AeroPlanner y AeroLink quedan en pausa; AeroControl sigue en uso, tal como está.
> **Ninguno se toca desde aquí.** Si AeroBim necesita algo de ellos, entra por el
> `MASTER_PLAN.md` de ese repositorio.

---

## La interfaz, y con qué regla crece

**La estructura está escrita en [docs/UX.md](docs/UX.md)** (2026-08-19, a pedido del usuario). Lo
que hay que saber para planificar encima:

- **Una barra arriba, no dos.** Marca, pestañas, estado y `Abrir` en la misma fila: de 196 px a
  **90 px**, y a **34 px** plegando la cinta al volver a pulsar su pestaña. Se recuerda.
- **Los laterales se mueven**: ancho por su borde y **alto de cada sección** por su separador.
- **El navegador de la derecha es la lista de todo lo abierto**, una sección por fuente:
  estructura, modelos, **planos 2D**, vistas, mediciones — y ahí entrarán nubes, BCF e
  interferencias sin rediseñar nada.
- **Cubo de vistas** arriba a la derecha, como AutoCAD: dice hacia dónde se mira y cambia la vista
  de un clic. Verificado moviendo la cámara con solo un plano cargado.
- **`Abrir` es uno solo** para todo lo que la aplicación sabe leer; la extensión decide.

**Regla para crecer:** una capacidad nueva es _una sección del navegador_ y, como mucho, _un grupo
en una pestaña existente_. Una pestaña nueva solo se abre para un modo de trabajo entero —coordinar
no es medir—, nunca para un botón.

---

## FASE 0 — Andamiaje y prueba de concepto

**Objetivo de salida:** un visor que abre un IFC real y lo muestra, con el
monorepo compilando y el plan confirmado o corregido con datos.

| #      | Tarea                                                                                                     | Estado       |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------ |
| `F0.1` | Documentación de arranque: plan, MVP, arquitectura, referencias con licencias verificadas y marca         | ✅           |
| `F0.2` | Repositorio creado y publicado, MIT, con la marca en la línea de la familia                               | ✅           |
| `F0.3` | Monorepo npm: `apps/web` (React 19 + TS + Vite) y `packages/bim-core`, con build, lint y formato verdes   | ✅           |
| `F0.4` | **PoC del visor**: cargar un IFC real y navegarlo — medir tiempo de carga y memoria                       | ✅ ver abajo |
| `F0.5` | **Medir la conversión a Fragments** sobre el mismo modelo: tiempo de conversión y tamaño resultante       | ✅ medido    |
| `F0.6` | Decidir dónde corre la conversión (navegador con WASM vs worker de backend) **con los números de `F0.5`** | ✅ ver abajo |

**Criterio de aceptación:** un IFC de obra real abre en el navegador, se puede
orbitar y seleccionar un elemento, y hay una cifra medida de cuánto costó.

### `F0.4` cerrada: el modelo real abre en poco más de un segundo (2026-08-19)

**Un IFC de obra real abre, se ve y se puede orbitar.** Medido en la aplicación, no en un
banco de pruebas:

| Qué                                      | Resultado                                 |
| ---------------------------------------- | ----------------------------------------- |
| Conversión IFC → Fragments               | **0,5 a 1,1 s** según la carga del equipo |
| Hasta verlo en pantalla                  | **0,6 a 1,2 s**                           |
| Tamaño del Fragments                     | **113 KB** frente a 1,52 MB — 13,7× menos |
| Categorías IFC / elementos con geometría | 15 / 548                                  |
| Dimensiones que reporta el visor         | 21,8 × 3,0 × 22,7 m                       |

Las dimensiones son la comprobación de unidades: el modelo declara **milímetros**, y el
visor informa metros plausibles para una planta de edificio. Si el factor de unidades no
se aplicara, diría 21.750 × 2.980 × 22.729 m.

#### La causa del cuelgue: el aislamiento de origen

`web-ifc` elige su WASM así:

```js
if (self.crossOriginIsolated && !forceSingleThread) usar web-ifc-mt.wasm  // multihilo
else                                               usar web-ifc.wasm     // monohilo
```

Su variante **multihilo no funciona empaquetada**: Emscripten arranca los workers de
pthreads con `new Worker(pthreadMainJs)` y ahí `pthreadMainJs` queda `undefined`. El
navegador pide `/undefined`, recibe el `index.html` y el worker muere con
`Unexpected token '<'`. La promesa de conversión **nunca se rechaza**, así que el síntoma
es una interfaz esperando para siempre con la consola limpia.

**La ironía está registrada a propósito:** las cabeceras COOP/COEP se habían agregado
creyendo que hacían falta para el WASM multihilo. Eran justo lo que activaba el camino
roto. Quitarlas es lo que cerró la fase.

`IfcImporter` no expone el `forceSingleThread` de `IfcAPI.Init`, así que la única palanca
es **no servir esas cabeceras**. El visor ahora lo comprueba al arrancar y falla con un
mensaje explícito en vez de colgarse.

#### Lo que además cambió

- **`IfcLoader.load` quedó fuera.** El visor usa `FRAGS.IfcImporter` para convertir y
  `core.load` para mostrar: dos pasos explícitos, medibles por separado, y alineados con
  `F0.6`, que exige poder convertir en un lugar y mostrar en otro.
- **Bug corregido:** el tamaño del Fragments se leía después de `core.load`, que
  **transfiere el búfer al worker** y lo deja en `byteLength = 0`. Se anota antes.

#### La cámara, resuelta (era el orden de dos llamadas)

El encuadre inicial mostraba el modelo de canto y ningún comando de cámara parecía surtir
efecto. Eran **dos cosas encadenadas**, y las dos valen registrarse:

1. **camera-controls solo mueve la cámara dentro de `update(delta)`.** `rotateTo` y
   `fitToBox` registran el objetivo al instante, pero si nadie llama `update` la cámara se
   queda donde estaba. Se fuerza uno al terminar.
2. **`fitToBox` pisa los ángulos.** Girar y luego encuadrar no deja rastro del giro; hay
   que **encuadrar primero y rotar después**. Ese era el motivo de que la orientación
   isométrica "no funcionara" — funcionaba, y el encuadre la borraba a continuación.

Con el orden correcto la vista inicial es una isométrica en la que se reconoce la planta
completa. Además quedó un botón **Encuadrar** en la interfaz, que un visor necesita de
todos modos.

### Cómo se llegó hasta ahí (2026-08-19)

**El modelo de prueba es real:** `Piso 5.ifc`, IFC2X3 exportado por BricsCAD BIM
26.2, 1,52 MB y 32.836 líneas, en milímetros, con geometría BREP
(532 `IfcFacetedBrep`) y 470 `IfcBuildingElementProxy`.

Medido por separado durante el diagnóstico, que sirve de referencia para comparar cuando
aparezcan modelos más grandes:

| Qué                                                 | Resultado                        |
| --------------------------------------------------- | -------------------------------- |
| Parseo del IFC con `web-ifc` (sin construir escena) | **24 ms** (init del WASM: 34 ms) |
| Conversión a Fragments con `FRAGS.IfcImporter`      | **643 ms**                       |
| Elementos con geometría / categorías IFC            | 548 / 15                         |

El cuelgue costó encontrarlo porque **no emite ningún error** y porque casi todo lo
sospechoso resultó inocente. Se descartaron midiendo, antes de dar con el aislamiento de
origen: el WASM (parsea en 24 ms), el worker de Fragments (arranca sin error, y darle uno
propio a cada visor no cambia nada), React (cuelga igual sin interfaz), el tamaño del
modelo (cuelga con un fixture de 2 KB), una carrera de arranque (4 s de espera con
`initialized` en `true`), el pre-bundling y la resolución del módulo, y la duplicación de
dependencias.

**Lo que finalmente lo delató fue el registro de red**, no la consola de la página: una
tanda de `GET /undefined` que solo aparecía al inspeccionar las peticiones. La lección
para la próxima: en un pipeline con workers, revisar la red antes que la consola.

### El oráculo del GUID ya está cerrado

`packages/bim-core` implementa la compresión y expansión de `IfcGloballyUniqueId`, y se
verificó contra los **579 GUID únicos del modelo real**, generados por BricsCAD y no por
este código: **cero rechazos y cero fallos de round-trip**. Una muestra de 17 quedó como
test de regresión en `ifcGuid.vectors.test.ts`. El modelo no se versiona — es dato de la
organización.

### Por qué `F0.4` va antes que cualquier otra cosa

El estudio verificó licencias y actividad de repositorio, no rendimiento sobre
**nuestros** modelos. Un visor que abre el modelo de demostración de la
documentación en dos segundos y el IFC de una obra real en cuatro minutos no
sirve, y eso no se descubre leyendo el README de nadie.

`F0.5` existe porque la promesa de Fragments —"convierte una vez, carga >10x más
rápido"— es el argumento central para elegir That Open. Si la conversión toma más
de lo que ahorra, o el archivo resultante es tan grande que no conviene guardarlo,
la arquitectura cambia. Se mide.

### `F0.6` con datos de un modelo grande (2026-08-19)

Llegó un segundo modelo real de **32,7 MB** con **839 psets**, y con él la cifra que
faltaba:

| Modelo           | Conversión | Hasta verlo | Fragments            |
| ---------------- | ---------- | ----------- | -------------------- |
| Piso 5 (1,5 MB)  | 1,11 s     | 2,20 s      | 113 KB — 13,7× menos |
| Grande (32,7 MB) | **9,53 s** | **9,82 s**  | 1,5 MB — 22,3× menos |

**La conversión corre en el hilo principal, así que esos 9,5 s son 9,5 s de interfaz
congelada.** La respuesta se inclina a **mover la conversión a un Web Worker**: sigue siendo
del lado del cliente, respeta el local-first y deja de bloquear la interfaz. Un backend solo
haría falta con modelos mucho mayores, o para convertir una vez y reutilizar el `.frag` —
otra cosa, y encaja en la Fase 3.

Falta implementarlo y medir cuánto mejora. Hasta entonces `F0.6` queda medido, no decidido.

### La primera prueba de uso, y lo que dejó (2026-08-19)

El usuario usó la aplicación y dejó notas con capturas. **La observación principal es que la
barra de herramientas no se entiende**: catorce botones en fila, dos de ellos llamados
"Planta" —uno es navegación y el otro un corte—, sin iconos. De ahí sale `F1.8`.

Corregido en el momento:

- **Cargar un segundo IFC fallaba** con `Aborted(both async and sync fetching of the wasm
failed)`. La causa era propia: se creaba un `IfcImporter` por carga, y el primero libera el
  WASM de `web-ifc` —que vive en una variable de módulo— dejando al segundo sin nada que
  cargar. Ahora se reutiliza. **Con eso `F1.5` pasa a funcionar**: dos modelos abiertos a la
  vez, cada uno con su árbol y sus métricas.
- **Al orbitar se seleccionaban elementos sin querer.** Un arrastre termina en `click`, así
  que cada giro de cámara seleccionaba lo que hubiera bajo el cursor. Ahora se compara dónde
  se pulsó y dónde se soltó, con 4 px de margen. Muy probablemente esto explica también las
  otras dos quejas —que "detectaba al pasar el ratón" y que la medición "no funcionaba"—,
  porque los clics se consumían al orbitar; **queda por confirmar con el usuario**.
- **El render se veía plano.** Se pasó a `ShadowedScene` con `PostproductionRenderer` en modo
  `COLOR_PEN_SHADOWS`: sombras, oclusión ambiental y **aristas dibujadas**. La referencia es
  BricsCAD, donde las líneas de los elementos están siempre presentes y son las que dejan
  leer el modelo.

### Qué se decide con `F0.6`

La conversión IFC → Fragments puede correr en dos lugares, y la diferencia manda
sobre si la Fase 3 (backend) es opcional o obligatoria:

|                            | Dónde corre                  | Qué implica                                                    |
| -------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **En el navegador** (WASM) | `web-ifc` en el cliente      | Local-first puro, cero backend. Limitado por la RAM del equipo |
| **En un worker**           | Node + `@thatopen/fragments` | Modelos grandes sin penar al usuario, pero exige servidor      |

Se decide con los números de `F0.5`, no por preferencia.

---

## FASE 1 — Visor IFC usable

**Objetivo de salida:** alguien de oficina técnica revisa un modelo sin abrir
software de escritorio ni pedir una licencia.

| #       | Tarea                                                                                                                                 | Estado       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `F1.1`  | Árbol espacial navegable (proyecto → sitio → edificio → planta → elemento) con aislar y ocultar                                       | ✅ ver abajo |
| `F1.2`  | Panel de propiedades y **psets** del elemento seleccionado                                                                            | ✅ ver abajo |
| `F1.3`  | Planos de corte y secciones                                                                                                           | ✅ ver abajo |
| `F1.4`  | Mediciones: distancia, área y ángulo                                                                                                  | ✅ ver abajo |
| `F1.5`  | Cargar **varios modelos IFC a la vez** (arquitectura + estructura + instalaciones) y alternarlos                                      | ✅ ver abajo |
| `F1.6`  | Vistas guardadas: cámara, visibilidad y cortes, recuperables por nombre                                                               | ✅ ver abajo |
| `F1.7`  | **Modos de vista**: proyección perspectiva/ortográfica, navegación (órbita, planta, primera persona) y representación (sólido, malla) | ✅ ver abajo |
| `F1.8`  | **Barra de herramientas y panel de modelos** — reubicar y agrupar las herramientas; ordenar, activar y desactivar lo cargado          | ✅ ver abajo |
| `F1.9`  | **Unidades de las propiedades** — cada número con la unidad que declara el archivo                                                    | ✅ ver abajo |
| `F1.10` | **Geometría que no se carga** — el conversor dejaba fuera `IfcProxy`: 433 elementos de 1.274                                          | ✅ ver abajo |
| `F1.11` | **El picker caía desviado** el ancho del panel izquierdo: se seleccionaba otro elemento                                               | ✅ ver abajo |
| `F1.12` | **Preselección al pasar el cursor** — se selecciona sin clicar y el usuario lo llama «poco práctico»                                  | ⬜ ver abajo |
| `F1.13` | **El panel de abajo no se entiende** — reubicar y agrupar las herramientas, mirando cómo lo resuelven Revit y AutoCAD                 | ⬜ ver abajo |
| `F1.14` | **La medición de distancia no funciona** en uso real, con el modelo del usuario                                                       | ⬜ ver abajo |
| `F1.15` | **El modo fantasma se cae al mover** la cámara                                                                                        | ⬜ ver abajo |
| `F1.16` | **El renderizado no da profundidad** — sin sombras creíbles, el modelo se lee peor de lo que debería                                  | ⬜ ver abajo |

### Lo que el usuario pidió el 2026-08-19 y no estaba en ningún tablero

**Estaba en una nota con dos capturas, y `obsidian/` está en `.gitignore`**: se habría perdido.
Son cinco cosas, dichas con sus palabras, y ninguna es cosmética — todas son sobre _cómo se
navega y se revisa_, que es lo que llamó «lo esencial»:

- **`F1.12`** «al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco
  práctico». **Se cruza con el 2D**: la preselección compite con el picking del plano, así que
  el arreglo hay que probarlo con un DXF y un IFC cargados a la vez.
- **`F1.13`** «abajo no se entienden bien, debe ser un panel mejor implementado; revisar cómo la
  competencia lo utiliza». La referencia declarada en `docs/UX.md` ya es AutoCAD y Revit.
- **`F1.14`** «las opciones de medida de distancia no está funcionando». `F1.4` está cerrada con
  33 pruebas de geometría, así que **es la interacción, no la aritmética** — y encaja con lo que
  `HANDOFF.md` ya decía de la perpendicular: en el navegador de pruebas ningún rayo encuentra
  geometría después de un par de refrescos.
- **`F1.15`** «el modo fantasma se cae al mover».
- **`F1.16`** «no está renderizando con mejor información de sombras o realista». Ojo con la
  interacción con el plano 2D: la postproducción **se apaga en Modo 2D** a propósito (`F7.16`),
  porque sobre un dibujo de líneas lava los colores.

**Oráculo:** el mismo modelo abierto en **Bonsai/BlenderBIM** (o cualquier visor
IFC de escritorio). El árbol, los psets y las mediciones deben coincidir — un
visor que muestra propiedades distintas a las del archivo es peor que no tenerlo.

`F1.5` no es un extra: la coordinación consiste precisamente en mirar dos
disciplinas juntas. Un visor de un modelo por vez no coordina nada.

### `F1.6` vistas guardadas (2026-08-19)

Una vista guarda **las tres cosas**, y las tres hacen falta: desde dónde se mira, qué está apagado y
por dónde está cortado. Con solo la cámara, la vista que le pasas a otro muestra algo distinto de lo
que tú estabas viendo, que es justo lo contrario de para qué sirve.

Se guardan por nombre en el navegador y **sobreviven a recargar la página** —verificado—. No van a un
servidor: eso es Fase 3, y el pie de la sección lo dice para que nadie cuente con más de lo que hay.

Dos decisiones que conviene tener escritas:

- **La forma de una vista vive en `bim-core`, no en la interfaz.** En cuanto algo se persiste, su
  forma es un contrato. Y su lectura es deliberadamente desconfiada: lo que sale del almacenamiento
  del navegador puede estar a medio escribir, ser de una versión anterior o haber sido editado a mano,
  así que `parseSavedViews` nunca lanza, descarta lo ilegible y conserva lo demás. Diez pruebas
  cubren eso, incluido el JSON truncado.
- **Lo oculto se guarda con identificadores de Fragments, no con GUID.** Sirve para una vista de
  trabajo —el mismo archivo, la misma sesión— y **no servirá para un viewpoint de BCF**, que tiene que
  ir por GUID porque los identificadores del motor cambian entre versiones del modelo. Queda dicho en
  el tipo para no descubrirlo en la Fase 4.

Al aplicar una vista, **lo que no exista se ignora**: si se guardó con tres modelos abiertos y ahora
hay dos, se restaura lo que hay en vez de fallar. Y el orden importa — la proyección primero, porque
sustituye el objeto de cámara y pisaría la posición si se hiciera después.

### `F1.11` el picker caía desviado, y era nuestro (2026-08-19)

**Clic en un pilar, se seleccionaba otro.** La causa: `pickAt` le restaba a las coordenadas del ratón
la posición del lienzo antes de pasárselas al rayo, y **Fragments ya se la resta por dentro**:

```js
// screenToCast, en @thatopen/fragments
const rect = element.getBoundingClientRect();
const x = (p.x - rect.left) / scaleX;
```

Restada dos veces, el rayo salía desviado **exactamente lo que mide el borde izquierdo del lienzo**.
Con el árbol como única columna eran 48 px y el fallo pasaba por "el picker es impreciso"; al poner
el panel de propiedades a la izquierda pasaron a ser 288 px y se volvió evidente.

Este error explica en retrospectiva **todas las quejas de selección desde la primera prueba de uso**,
y también por qué no se reproducía en `diag.html`: ahí el contenedor empieza en x = 0, así que restar
cero dos veces no cambia nada. La lección queda escrita en el código: **antes de convertir
coordenadas, leer qué espera la librería** — este error no da error, solo respuestas equivocadas.

### `F1.10` cerrada: eran los `IfcProxy` (2026-08-19)

**El usuario entregó el modelo y la respuesta salió en una consulta.** `716-LCD-ME-ISUP-D-TEST.ifc`,
una planta exportada por **ProStructures 24** de Bentley, declara:

| Clase       | Cuántos |
| ----------- | ------- |
| `IFCMEMBER` | 805     |
| `IFCPROXY`  | **433** |
| `IFCCOLUMN` | 34      |

Y el visor cargaba 839: los 805 perfiles y las 34 columnas. **Faltaban los 433 `IfcProxy`**, que es
donde ProStructures pone todo lo que no es estructura: la maquinaria, los grandes elementos curvos, el
transportador. `IfcProxy` es el comodín del estándar —un producto con geometría y sitio propios para
lo que no encaja en una clase concreta— y **no está en el conjunto de clases de `IfcImporter`**, que
sí trae `IfcBuildingElementProxy`, otra cosa.

El arreglo es una línea: añadir `WEBIFC.IFCPROXY` a `importer.classes.elements`. Medido antes y
después sobre el mismo archivo:

| Qué                     | Antes                | Después                  |
| ----------------------- | -------------------- | ------------------------ |
| Elementos en el árbol   | 841                  | **1.274**                |
| Elementos con geometría | 839                  | **1.272**                |
| Dimensiones del modelo  | 16,2 × 17,1 × 29,9 m | **20,6 × 21,0 × 69,0 m** |
| Fragments               | 1,5 MB               | 3,7 MB                   |

Los 69 metros de largo son el transportador que en OpenPlant se veía salir del edificio y en AeroBim
no estaba. Y un clic sobre esa geometría nueva abre su ficha, así que no es solo dibujo.

**El diagnóstico ahora compara cantidades, no presencia.** Antes solo detectaba la clase ausente por
completo; si de 500 tuberías llegaran 300, la clase aparecía entre las cargadas y no avisaba nada. Es
el caso que aparecerá con más modelos de Bentley, así que el aviso dice **cuántos de cuántos**.

**Cómo se amplía la lista de clases:** con datos. El aviso del panel de modelos dice qué clase falta;
cuando aparezca una nueva se añade con el modelo que la delató. La lista vive en dos sitios que hay
que mantener a la par —`packages/viewer/src/converter.ts` y `apps/web/src/convert.worker.ts`— porque
el worker no puede importar el paquete del visor sin arrastrarse three.js entero.

### El problema, como se veía antes de tener el archivo (2026-08-19)

**El mismo IFC de 32,7 MB abierto en Bentley OpenPlant muestra mucho más que AeroBim.** En el visor
aparece la estructura de acero —cerchas, columnas— y **falta el resto**: los grandes elementos
curvos de la planta, tuberías y maquinaria. No hay error, no hay aviso: el visor abre el modelo,
informa 839 elementos con geometría, y muestra la mitad.

**Por qué no se notaba desde dentro.** `IfcImporter` procesa un conjunto conocido de clases IFC
(`importer.classes.elements`). Una clase que no esté ahí no se importa, así que el elemento **no
entra ni al árbol**: ningún contador del visor lo echa de menos. Un modelo de arquitectura no
delata el problema porque sus clases son las esperadas; una planta industrial exportada desde un
modelador de tuberías está llena de clases que no lo son.

**Lo hecho:** el visor ahora **lo detecta y lo dice**. Antes de convertir, cuenta las clases que
declara el archivo (`countIfcEntities` en `bim-core`), las compara con las categorías que el modelo
cargado informa y avisa en el panel de modelos: _"Falta geometría: N elementos sin cargar"_ con la
lista de clases y su número. La comparación filtra geometría, relaciones, propiedades y tipos, que
no son elementos; una clase desconocida se informa, porque en un diagnóstico un falso positivo se
descarta leyendo su nombre y un falso negativo esconde justo lo que se busca.

#### Lo que se averiguó del conversor, con un fixture propio (2026-08-19)

Dos cosas concretas, y las dos cambian el diagnóstico:

1. **El conjunto de clases del importador no es el problema.** Se leyó
   `ifcClasses.elements` de `@thatopen/fragments`: son unas 140 clases e **incluyen** tubería,
   fittings, segmentos de flujo, elementos de distribución, ensamblajes y el proxy genérico. Lo que
   exporta un modelador de planta está ahí. La única exclusión deliberada visible es
   `IFCOPENINGELEMENT`, comentada, que es correcta —un vano es un hueco, no un elemento—.
2. **Cuando el conversor no puede construir la geometría de un elemento, descarta el elemento
   entero.** No lo deja en el árbol sin dibujar: no lo importa. Verificado con
   `elemento-sin-geometria.ifc`, un fixture con un muro con geometría y un `IFCPIPESEGMENT` sin
   representación: el muro entra, la tubería **no aparece ni en el árbol ni entre las categorías**, y
   el aviso del visor la señala.

Por eso el aviso dice las dos causas posibles sin elegir una, y por eso el contador de "elementos
cargados sin dibujar" existe pero casi siempre estará en cero: es el caso raro.

**Lo que falta:** leer ese aviso sobre el modelo real de 32,7 MB. La lista de clases dirá si lo que
falta es una clase concreta —entonces se añade al importador— o si son clases que sí están, y
entonces el problema es de `web-ifc` con esas representaciones. En ese caso las palancas, por orden
de coste: `importer.webIfcSettings` (`MEMORY_LIMIT`, `CIRCLE_SEGMENTS`, las tolerancias de
intersección de planos), subir la versión de `web-ifc`, o convertir ese modelo con IfcOpenShell en la
Fase 3. **Nada de eso se toca a ciegas.**

### `F1.4` las mediciones, rehechas con los componentes de la librería (2026-08-19)

Las propias calculaban bien y **no dibujaban nada**: ni el punto al que se ajustaba el cursor, ni los
extremos, ni el valor. Sin esa señal, medir era hacer clics a ciegas — es literalmente lo que hizo
pensar que la medición no funcionaba. Ahora son `LengthMeasurement`, `AngleMeasurement` y
`AreaMeasurement` de `@thatopen/components-front`, que traen marcador de ajuste, cota y etiqueta.
**Confirmado en el navegador del usuario**: cota dibujada, etiqueta con el valor y la lista contando
las cotas.

Cuatro cosas que hubo que corregir sobre lo que trae la librería:

1. **El relleno de un área tapaba el modelo entero.** Su material viene con `depthTest` desactivado,
   así que un área medida sobre el suelo se pintaba encima de todo y la pantalla quedaba violeta. Se
   sustituye por uno que respeta la profundidad.
2. **Las etiquetas venían azules**, con estilo escrito a mano en el elemento. Se repintan al
   aparecer, y sin `pointer-events`, porque una cota en medio del camino se comía el clic siguiente.
3. **Medir y seleccionar se pisaban.** Entrar a medir suelta la selección: un elemento violeta debajo
   de las cotas estorba y deja la duda de si el clic va a seguir seleccionando.
4. **El marcador de ajuste era un punto de 4 px** sobre un modelo de acero lleno de aristas. Ahora
   es más grande, y el ajuste se puede apagar para medir en medio de un paño.

Además, lo que la librería no da y en obra se pide: **la distancia se descompone en directa, en
planta y desnivel** (`distancePartsM` en `bim-core`, probado contra la rampa 3-4-5). Entre dos puntos
de una rampa son tres números distintos y se usa uno u otro según para qué; dar solo uno obliga a
adivinar cuál se está leyendo.

Y **las cotas se listan**: cada una se puede apagar sin borrarla o borrar sola. Se apaga sacándola de
la lista de su medidor —la librería solo permite ocultarlas por tipo— y se devuelve el mismo objeto,
así que conserva su identificador y su valor.

### `F1.9` las unidades de las propiedades (2026-08-19)

`Length 8070.861` no dice si son milímetros, metros o pies. Son tres órdenes de magnitud y alguien
va a pedir material con ese número. Ahora cada valor va con su unidad, y de dos fuentes:

1. **El tipo IFC del valor** (`IFCLENGTHMEASURE`, `IFCAREAMEASURE`…) más la unidad que el archivo
   declara en `IfcUnitAssignment`. Es lo que dice el archivo y no se discute.
2. **El nombre de la propiedad**, cuando el valor llega como número genérico. Los psets propios de
   las herramientas guardan longitudes como `IFCREAL` —así vienen los perfiles de acero— y ahí el
   nombre es lo único que queda. Se marca **atenuado** en la interfaz: una unidad deducida
   presentada como certeza es peor que ninguna.

**Fragments no conserva `IfcUnitAssignment`**: aplica el factor a la geometría y descarta la
declaración. Por eso se lee del texto del archivo antes de convertir (`parseIfcUnits`).

La inferencia por nombre es deliberadamente desconfiada: rechaza cualquier nombre con `/` o con
`per` —`Weight/Length` es kg/m, no kg— y los que terminan en identificador, tipo o estado.
Verificado sobre el modelo real: `Length 3520 mm`, `Volume 0.038 m³`, `Weight 300.116 kg` (85 kg/m
× 3,52 m = 299 kg ✓), y `Density/Spec. Weight` sin unidad, que es lo correcto.

**La masa cae al kilo cuando el archivo no la declara**, porque el estándar dice que sin declaración
manda la unidad base del SI. Longitud, área y volumen **no** caen a metros: ahí el mismo atajo
convertiría un modelo en milímetros en uno en metros.

#### Y el caso que faltaba: una medida escrita como texto (2026-08-19)

Al peso le seguía faltando el kilo, y la causa estaba en el archivo. ProStructures escribe:

```
#7887=IFCPROPERTYSINGLEVALUE('Length',$,IFCPOSITIVELENGTHMEASURE(1510.),$);
#7893=IFCPROPERTYSINGLEVALUE('Weight',$,IFCLABEL('579.84'),$);
```

El largo va como medida y **el peso como etiqueta**: un número escrito como texto. El visor lo
tomaba al pie de la letra —un texto no lleva unidad— y se quedaba sin kilos.

Ahora los tipos de texto se tratan como **"sin información"** y no como "sin unidad": si el valor es
un número a secas y el nombre dice de qué magnitud es, se deduce y se marca como deducida. Los tipos
numéricos sin dimensión —`IFCINTEGER`, `IFCBOOLEAN`— siguen cortando la deducción, porque ahí el
archivo sí está diciendo algo fiable.

Verificado sobre el modelo real con `diag.html?modo=psets&categoria=IFCMEMBER`, que lee un elemento
por categoría en vez de buscarlo con el ratón:

```
Length = 970 mm                  [IFCPOSITIVELENGTHMEASURE]
Volume = 0.001 m³                [IFCVOLUMEMEASURE]
Weight = 5.14145 kg (deducida)   [IFCLABEL]
Weight/Length = 5.1119           [IFCLABEL]      ← sin unidad: es kg/m
Density/Spec. Weight = 7850      [IFCLABEL]      ← sin unidad: es kg/m³
Total Count = 0                  [IFCLABEL]      ← sin unidad: es un conteo
```

Que los cocientes y el conteo se queden sin unidad **es el resultado correcto**, y es lo que
distingue una deducción prudente de una que inventa.

#### El falso positivo de las puertas (2026-08-19)

`Piso 5.ifc` acusaba **"7 elementos sin cargar: IFCDOORSTYLE"** con sus diez puertas dibujadas. En
IFC2X3 el tipo de una puerta es `IfcDoorStyle`: describe cómo son las puertas de esa clase y no es
ninguna de ellas. El filtro descartaba los `…TYPE` y no los `…STYLE`.

Con el filtro corregido, `Piso 5.ifc` no acusa nada: 555 entidades declaradas menos 7 estilos son
548 elementos, y 548 tienen geometría. **Un aviso con falsos positivos no sirve**: en cuanto miente
una vez, deja de creerse el resto.

### `F1.8` la barra de herramientas y el panel lateral (2026-08-19)

La barra de abajo tenía catorce botones en fila, dos llamados "Planta" y ningún icono. La
distribución se rehízo **tomando como referencia Revit y los modeladores de Bentley**, que es de
donde vienen quienes van a usar esto (petición del usuario, con capturas de OpenPlant y de Revit):

| Dónde         | Qué                                                                                    |
| ------------- | -------------------------------------------------------------------------------------- |
| **Arriba**    | Cinta con pestañas —Vista, Medición, Modelo— y grupos rotulados al pie                 |
| **Izquierda** | Propiedades del elemento seleccionado, siempre presente                                |
| **Derecha**   | Navegador del proyecto: estructura, modelos abiertos y cotas, plegables                |
| **Centro**    | El modelo, sin nada flotando encima                                                    |
| **Al pie**    | Barra de estado: qué hace el próximo clic, el resultado de la medida y qué hay abierto |

Las cuatro decisiones que resuelven el problema original:

- **Cada herramienta lleva su nombre debajo del icono**, y cada grupo el nombre del grupo. Con
  iconos solos hay que aprenderse la barra antes de poder usarla. La ambigüedad de "Planta"
  desaparece: una es "Desplazar" en Navegación y la otra "Horizontal" en Cortes.
- **Las pestañas mantienen la cinta en una fila.** Sin ellas serían veinte botones a la vez, que es
  el mismo desorden de antes en horizontal.
- **Nada flota sobre el modelo.** Las propiedades y los modelos vivían encima del lienzo tapando
  justo la esquina que se quería ver; ahora son paneles fijos, y los dos se pliegan desde la cinta.
- **El aviso de la herramienta está al pie**, en un sitio fijo, que es donde alguien que viene de
  Revit ya mira para saber qué está haciendo la herramienta.

**Pendiente de la referencia:** la rejilla del entorno y el fondo claro de esos programas. El fondo
oscuro es el de la familia AeroBim y no se cambia sin decidirlo; la rejilla sí encaja y queda como
mejora de la escena.

### `F1.5` la gestión de varios modelos (2026-08-19)

El panel de modelos permite **apagar, ordenar y cerrar** lo cargado. Apagar y cerrar son distintos y
se comportan distinto: apagado el modelo sigue en memoria y vuelve al instante; cerrado se libera y
hay que abrir el archivo otra vez. El botón de cerrar aparece solo al pasar por encima de la fila,
porque cuesta volver a convertir.

### `F1.3` cortes y `F1.4` mediciones completas (2026-08-19)

**Cortes.** Tres botones cortan el modelo por su centro: horizontal —para mirar la planta
sin la cubierta— y dos verticales. El plano se arrastra después con el ratón, y **Sin
cortes** los quita todos.

Se usa `createFromNormalAndCoplanarPoint` en vez de `create`, que coloca el plano donde
apunte el cursor: un corte por el centro es predecible, y es lo que alguien espera al pulsar
un botón llamado "corte horizontal".

Verificado de dos formas: con el contador de planos (0 → 1 → 2 → 3 al añadir los tres, y 0
al quitarlos) y **con captura del corte aplicado sobre el modelo real**, donde se ve el
plano con su manija de arrastre y el edificio seccionado mostrando el interior.

**Mediciones, ahora las tres.** Distancia entre dos puntos, ángulo entre tres —el segundo es
el vértice— y área de un contorno que **se recalcula con cada vértice**, así que se ve crecer
mientras se recorre. Medido sobre el modelo real: 1,131 m de distancia, 19,4° de ángulo, y
1,92 m² con 6,88 m de perímetro.

#### La geometría se mudó al dominio, y ahí sí tiene pruebas

`angleAtDeg`, `polygonAreaM2`, `perimeterM` y `distanceM` viven en `packages/bim-core`, no en
el visor. **Son números con consecuencias** —alguien va a pedir material con un área— y en el
dominio se prueban contra casos elementales verificables a mano: el cuadrado unitario mide
1 m², el triángulo 3-4-5 mide 6 m², un ángulo recto da 90°.

Dos casos merecen mención porque son los que delatan una implementación mala:

- **Un polígono lejos del origen mide igual.** La fórmula del área vectorial se rompe si se
  implementa sin cerrar el contorno; el test lo pone a 300 m del origen.
- **Un faldón inclinado mide su superficie real, no su sombra.** Un plano que sube 1 m en 1 m
  tiene √2 m² por metro de ancho, no 1 m². Proyectar al plano horizontal deja la obra corta
  de material, y por eso hay un test con exactamente ese caso.

18 pruebas nuevas; 67 en total.

### `F1.7`: modos de vista, y `F1.4`: medir distancias (2026-08-19)

**Agregado a pedido del usuario.** Una barra bajo el modelo agrupa lo que cambia _cómo_ se
mira, separado del árbol, que cambia _qué_ se mira. Los tres grupos son independientes: se
puede estar en ortográfica, en modo planta y en vista fantasma a la vez.

| Grupo              | Opciones                   | Verificado                                                                |
| ------------------ | -------------------------- | ------------------------------------------------------------------------- |
| **Proyección**     | Perspectiva · Ortográfica  | ✅ el objeto de cámara pasa de `PerspectiveCamera` a `OrthographicCamera` |
| **Navegación**     | Órbita · Planta · Interior | ✅ los tres modos se activan sin error                                    |
| **Representación** | Sólido · Fantasma          | ✅                                                                        |
| **Medir**          | Distancia entre dos puntos | ✅ midió 0,858 m entre dos puntos del modelo real                         |

La **ortográfica** es la que importa para una oficina técnica: sin fuga de perspectiva, dos
muros del mismo largo se ven del mismo largo, que es cómo se lee un plano.

#### Dos cosas dichas por su nombre

- **"Fantasma", no "wireframe".** Se logra pintando los materiales translúcidos, no
  dibujando aristas. Fragments **tiene** una representación de alambre (`CurrentLod.WIRES`)
  pero la reserva para su nivel de detalle automático y no la expone para forzarla. Llamarlo
  wireframe sería vender otra cosa; lo que hace —ver lo que hay detrás de un muro— es útil
  igual.
- **La medición es propia**, no de That Open. Sus anotaciones (`LinearAnnotations` y
  compañía) están atadas a los planos técnicos 2D (`pickHandle` pide un `TechnicalDrawing`),
  así que para medir en 3D se usa el raycast con ajuste a **vértice, arista y cara en ese
  orden de preferencia**. Sin la cara como respaldo, medir se vuelve un juego de puntería
  contra las esquinas.

La distancia sale en metros porque la escena está en metros: el factor de unidades del IFC
se aplicó al convertir, lo mismo que verifica la comprobación de dimensiones al cargar.
**Faltan área y ángulo** para cerrar `F1.4`.

### `F1.1`: árbol espacial con aislar y ocultar (2026-08-19)

El panel izquierdo recorre el modelo, y cada fila **aísla** con un clic u **oculta** con el
control de visibilidad. **Ver todo** restaura. Verificado sobre el modelo real: aislar
`IFCDOOR (10)` deja en pantalla exactamente las diez puertas, y restaurar devuelve el
edificio completo.

#### Cómo viene el árbol de Fragments, que no es lo que uno supone

Vale saberlo antes de tocar esa parte, porque el primer intento produjo niveles fantasma
etiquetados "sin categoría":

| Nodo                                | Qué es                                              |
| ----------------------------------- | --------------------------------------------------- |
| `category` presente, `localId` nulo | **Grupo** por categoría (`IFCBEAM`, `IFCDOOR`)      |
| `localId` presente, `category` nulo | El **elemento** real. Hereda la categoría del grupo |

Es decir, **Fragments ya agrupa por categoría**: reagrupar por encima duplica niveles. Y el
árbol no trae nombres, así que se resuelven aparte —`Name`, con `LongName` de respaldo,
que es donde muchos exportadores ponen el nombre de plantas y edificios— en **una sola
consulta por modelo**, no una por nodo.

#### Dos decisiones de presentación

- **Los grupos de más de 30 elementos no se listan.** El modelo de prueba tiene 470
  `IfcBuildingElementProxy`: listarlos da un árbol que nadie recorre. El grupo sigue siendo
  aislable y ocultable completo, y para llegar a uno concreto se hace clic en el modelo.
- **Un elemento sin nombre se muestra como `IFCBEAM #30188`.** El identificador es lo único
  que lo distingue de sus hermanos, y es honesto: inventar "Viga 1" sería peor.

### `F1.2`: clic → propiedades, con el GUID validado (2026-08-19)

Un clic sobre el modelo resuelve el elemento, lo resalta en violeta y abre su ficha. Sobre
el modelo de prueba, clicar una viga devuelve:

| Campo     | Valor                                                               |
| --------- | ------------------------------------------------------------------- |
| Categoría | `IFCBEAM`                                                           |
| GUID      | `2sOaC0lzL6JhvIR8y_YCPM`                                            |
| Tipo      | `IFCBEAMTYPE · Concrete, Plain 510.29`, con `PredefinedType = BEAM` |
| Material  | `IFCMATERIAL · Concrete, Plain`                                     |

**El GUID se valida con `bim-core` antes de mostrarlo**, en vez de confiar en el string:
un GUID mal formado no sirve como identidad, y es mejor saberlo acá que al exportar un
BCF. Así el dominio verificado contra el oráculo empieza a ganarse el sueldo.

#### Lo que el modelo de prueba enseñó sobre los datos

- **El GUID vive en `_guid`**, no en `GlobalId`, y la categoría en `_category`.
- **Este modelo no trae psets.** Su cabecera lo dice: `IfcExportBaseQuantities: Off`. Es
  una casilla del exportador, no un defecto del archivo, y **es el caso común**. Por eso
  el panel no habla de "psets" sino de bloques de propiedades: donde no hay psets sí hay
  tipo y material, que es justo lo que alguien busca al clicar una viga. Cuando el modelo
  los traiga, aparecen en el mismo lugar.
- **Las relaciones de IFC tienen ciclos.** `IsDefinedBy` lleva al tipo, y el tipo vuelve
  por `ObjectTypeOf` a _todos_ los elementos que comparten ese tipo — clicar una viga
  traía siete vigas hermanas. Esa relación se ignora, y el recorrido baja como máximo dos
  niveles: seguir el grafo sin límite lleva a listar medio modelo.

#### Los psets, ya verificados (2026-08-19)

Como el modelo real se exportó sin ellos, se escribió a mano el fixture
`muro-con-psets.ifc` con un `Pset_WallCommon` y unas `BaseQuantities`. **El panel los
muestra completos**, y con los tipos IFC bien traducidos: los booleanos como "sí"/"no", el
real como `0.35`, la etiqueta como `F-60`.

| Bloque            | Contenido                                                                    |
| ----------------- | ---------------------------------------------------------------------------- |
| `Pset_WallCommon` | LoadBearing sí · IsExternal no · ThermalTransmittance 0.35 · FireRating F-60 |
| `BaseQuantities`  | NetSideArea 12 · NetVolume 2.4 · Length 4000                                 |

Corregido de paso un problema de presentación que solo se vio con psets de verdad: el panel
mostraba **once bloques donde debía mostrar dos**. Las relaciones de IFC son de doble
sentido, así que cada propiedad reaparecía como bloque propio y el elemento se listaba a sí
mismo. Ahora las relaciones ya leídas (`HasProperties`, `Quantities`) no se recorren otra
vez, y el propio elemento se excluye de sus relacionados.

> **Pendiente honesto: las cantidades de longitud salen en las unidades del modelo.**
> `Length 4000` son 4000 mm, pero el panel no lo dice porque **no sabe la unidad**: los
> metadatos que expone Fragments traen esquema, nombres y CRS, y no `IfcUnitAssignment`.
> Convertir exige leer las unidades del IFC crudo con `web-ifc` durante la carga y guardar
> el factor — `bim-core` ya tiene `parseLengthUnit` y `toMeters` esperando para eso. Hasta
> entonces el valor se muestra tal como está en el archivo, sin inventar una unidad. Las
> áreas y volúmenes no tienen el problema: llegan en metros porque así los declara el IFC.

**Objetivo de salida:** el levantamiento y el modelo en la misma escena, que es la
comparación que nadie puede hacer hoy sin software de pago.

| #      | Tarea                                                                                         | Estado |
| ------ | --------------------------------------------------------------------------------------------- | ------ |
| `F2.1` | Cargar una nube (LAS/LAZ convertida) en la escena Three.js del visor                          | ⬜     |
| `F2.2` | Alinear nube y modelo: origen, rotación y escala, con ajuste manual asistido                  | ⬜     |
| `F2.3` | Controles de visualización: tamaño de punto, densidad, recorte por caja, color por altura/RGB | ⬜     |
| `F2.4` | Medir del modelo a la nube (desviación entre lo construido y lo modelado)                     | ⬜     |
| `F2.5` | Documentar el pipeline de conversión **fuera de la aplicación**: `PotreeConverter` y `pdal`   | ⬜     |

**Oráculo:** la misma nube y el mismo modelo cargados en **CloudCompare**; las
desviaciones medidas deben coincidir dentro de la tolerancia del levantamiento.

> **Límite explícito, heredado de AeroPlanner:** la aplicación **no procesa ni
> clasifica** nubes de puntos. Abre lo que otro generó. La conversión a un formato
> con octree ocurre fuera, con herramientas de línea de comandos, y `F2.5`
> simplemente lo deja escrito.

### La alineación es el problema real, no el render

Cargar puntos es un `loader`. Que los puntos caigan donde corresponde respecto al
modelo es lo difícil: un IFC suele venir en coordenadas locales de proyecto (y a
veces con el norte rotado), mientras la nube viene georreferenciada del vuelo. Sin
`F2.2` resuelta, `F2.4` mide basura con dos decimales.

---

## FASE 3 — Persistencia y backend

**Objetivo de salida:** los modelos dejan de vivir en la pestaña del navegador: se
guardan por proyecto, con versiones y con quién subió qué.

| #      | Tarea                                                                                              | Estado |
| ------ | -------------------------------------------------------------------------------------------------- | ------ |
| `F3.1` | API en Python (Django + DRF, como AeroControl): proyectos, modelos, versiones, usuarios y permisos | ⬜     |
| `F3.2` | Almacenamiento de archivos con validación de tipo, tamaño y nombre — nunca el nombre del cliente   | ⬜     |
| `F3.3` | Extracción de metadatos con `ifcopenshell`: esquema, unidades, georreferenciación, conteo por tipo | ⬜     |
| `F3.4` | Jobs asíncronos (Celery) para lo que tarde: conversión, extracción, validación                     | ⬜     |
| `F3.5` | Validación **IDS** con `ifctester`: el modelo cumple o no el requisito de información del proyecto | ⬜     |
| `F3.6` | **Levantar `services/api`**: Django 6 + uv, con la forma de AeroControl y base de datos propia     | ✅     |
| `F3.7` | **Portal de ingreso**: `django.contrib.auth` endurecido con axes, sin auto-registro                | ✅     |
| `F3.8` | **Roles y el contrato de permisos**: la matriz como dato, el guardián, y la prueba de 403          | ✅     |
| `F3.9` | **Los módulos y cómo se entra a cada uno**: portal por etapa de trabajo, filtrado por permiso      | ✅     |

**Criterio de aceptación:** un modelo subido sobrevive al cierre del navegador, y
la versión anterior sigue recuperable.

`F3.5` es lo que separa un visor de una herramienta de control: revisar a mano si
cada elemento trae el pset que el mandante exigió no escala; un IDS lo verifica en
un paso y dice exactamente qué falta.

### El portal de ingreso, y por qué se portó en vez de escribirse (2026-08-26)

**Lo pidió el usuario junto con la fidelidad del 2D**, y la aplicación hermana ya lo
tenía resuelto: AeroControl lleva 1440 pruebas en producción con datos reales de la
DGAC. Su fuerza no está en código ingenioso sino en un puñado de decisiones que ya
costaron encontrarse, y **eso es lo que se portó** — la forma, no el dominio. La base
de datos es propia: la regla de la familia es que ninguna aplicación comparte base con
otra.

| Qué se portó                                            | Por qué esa pieza y no otra                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `BaseModel`: UUID, marcas de tiempo, `is_active`        | Archivar en vez de borrar. Borrar un entregable se lleva su historial       |
| `AuditEvent` de solo agregar, con `sequence`            | `created_at` **no basta** para ordenar dos filas del mismo instante         |
| `RequestMetricsMiddleware`                              | Auditoría en cada petición que muta, id de correlación y log estructurado   |
| `mail.py`                                               | No decir "enviado" cuando el correo solo se imprimió en el log              |
| `jobs.py` + `JobRun`                                    | La fila nace en `running`: un proceso muerto a mitad deja de ser un éxito   |
| `exports.py`                                            | Una celda que empieza por `=` es una fórmula que se ejecuta en otra máquina |
| `tenancy.py`                                            | El permiso dice qué se puede hacer, no **sobre qué**                        |
| `ModelPermissionRequiredMixin` y `ViewModelPermissions` | El contrato de permisos, cumplido sin depender de que alguien se acuerde    |

**Las decisiones del portal:** `LoginView` con plantilla propia y **un solo mensaje de
error**, genérico —distinguir "no existe ese usuario" de "esa no es la contraseña" le
regala a quien prueba credenciales la mitad del trabajo—; axes **delante** del backend
real, para cortar un intento bloqueado antes de comprobar la contraseña; bloqueo **por
nombre de usuario y no por IP**, porque detrás de un proxy toda petición llega de la
misma dirección; sesión con tope de 12 h y expiración deslizante; **sin auto-registro**,
porque una aplicación de control documental donde cualquiera se da de alta no controla
nada; y `/api-token/` con throttle propio, porque el de DRF viene con
`throttle_classes = ()` y deja fuera del límite justo al único endpoint que acepta
usuario y contraseña sin autenticar.

**Los roles**, con la matriz en `apps/accounts/roles.py`: Administrador, Coordinador
BIM, Proyectista, Revisor y Mandante, más **Dirección**, que no es un rol sino un grupo
de notificación con cero permisos. Un nombre de permiso mal escrito **para el comando**
`bootstrap_roles` en vez de dejar un rol silenciosamente vacío.

> **La lección del `Viewer` de AeroControl, portada con el código.** Su rol de lectura
> era "todo permiso cuyo nombre empiece por `view_`", y eso le entregaba en silencio los
> tokens de API, la lista de usuarios, las sesiones, la auditoría y el historial de
> trabajos. `Mandante` es una **lista blanca explícita**, y hay una prueba que falla si
> alguna vez aparece ahí un permiso de administración.

**Comprobado contra un servidor corriendo**, que es el oráculo que pedía el contrato:

| Usuario             | Ve en el portal               | Pide a mano `/administracion/usuarios-y-roles/` |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| **Mandante**        | Organizaciones y el visor BIM | **403**                                         |
| **Coordinador BIM** | + Trabajos programados        | **403**                                         |
| **Administrador**   | Todo                          | 200                                             |

Y el bloqueo por intentos es real, no cosmético: al quinto fallo la respuesta pasa a
**429**, y **la contraseña correcta también recibe 429** mientras dura el enfriamiento
—si entrara, el bloqueo no estaría haciendo nada— mientras otro usuario sigue pudiendo
entrar, que es lo que distingue un bloqueo por nombre de un bloqueo global.

**El gate propio** (`services/api/scripts/verify.ps1`) replica el de AeroControl:
`check`, `check --deploy`, `makemigrations --check`, `pytest --cov`, `ruff`, `bandit` y
`pip-audit`. **64 pruebas, 89 % de cobertura**, todo en verde.

> **La primera versión del gate dijo «verde» con `ruff format` fallando.** Un ejecutable
> nativo que devuelve un código distinto de cero no dispara el manejo de errores de
> PowerShell, así que cada paso pasa ahora por una función que mira `$LASTEXITCODE`. Un
> gate que miente es peor que no tener gate — y es la misma clase de defecto que la
> `F7.13` marcada cerrada.

**Lo que queda de este frente**, dicho en voz alta: el catálogo de traducciones
(`locale/es/`) todavía no existe, así que la interfaz muestra las cadenas fuente en
inglés donde Django no traduce por su cuenta; y la matriz de roles solo cubre los
modelos que existen hoy — se completa con los entregables en `F8.1`.

---

## FASE 4 — Coordinación (BCF)

**Objetivo de salida:** una observación de coordinación deja de ser un correo con
una captura de pantalla.

| #      | Tarea                                                                                            | Estado |
| ------ | ------------------------------------------------------------------------------------------------ | ------ |
| `F4.1` | Temas de observación con viewpoint: cámara, visibilidad y elementos involucrados por GUID        | ⬜     |
| `F4.2` | Metadatos y ciclo de vida: prioridad, responsable, fecha de vencimiento, estado                  | ⬜     |
| `F4.3` | Comentarios ligados al viewpoint, con historial                                                  | ⬜     |
| `F4.4` | **Exportar e importar BCF 2.1 y 3.0** — con `BCFTopics` en el frontend y `bcf-client` en backend | ⬜     |
| `F4.5` | Marcado sobre la vista (nube, flecha, texto) embebido en el viewpoint                            | ⬜     |

**Oráculo, y es el que manda:** un BCF exportado por AeroBim **abre en Navisworks
o Solibri** con su viewpoint intacto, y uno generado por ellos abre aquí. Un BCF
que solo se entiende consigo mismo no es interoperabilidad, es un formato propio
con extensión prestada.

---

## FASE 5 — Detección de interferencias

**Objetivo de salida:** las interferencias entre disciplinas se encuentran solas y
llegan a la coordinación como temas, no como una lista en una planilla.

| #      | Tarea                                                                                  | Estado |
| ------ | -------------------------------------------------------------------------------------- | ------ |
| `F5.1` | Definir grupos de comparación (A vs B) por filtros de tipo, disciplina o planta        | ⬜     |
| `F5.2` | Ejecutar `ifcclash` como job de backend, con tolerancia de holgura configurable        | ⬜     |
| `F5.3` | Resultados navegables: la lista lleva la cámara al conflicto y aísla los dos elementos | ⬜     |
| `F5.4` | Convertir un resultado en tema BCF de la Fase 4, con su viewpoint ya apuntado          | ⬜     |
| `F5.5` | Agrupar y silenciar falsos positivos, y conservarlos entre corridas                    | ⬜     |

**Oráculo:** un conjunto de prueba con interferencias conocidas y colocadas a
propósito; se cuentan las encontradas y las perdidas. Contra software comercial si
hay acceso a una licencia.

`F5.5` decide si la funcionalidad se usa o se abandona. Una detección cruda sobre
dos disciplinas reales devuelve cientos de conflictos, la mayoría irrelevantes; si
cada corrida vuelve a mostrar los mismos falsos positivos ya descartados, nadie
abre la herramienta una segunda vez.

---

## FASE 8 — Control documental y seguimiento

**Agregada el 2026-08-26 a pedido del usuario**, junto con el portal de ingreso. La idea de
conjunto viene de **MineDoc** —el que ya usa la empresa: control de documentos con
transmittals, avance físico del documento y comentarios sobre el propio archivo— construida
aquí, MIT y local-first.

**Objetivo de salida:** que el seguimiento de un proyecto —qué falta, quién lo tiene, qué se
emitió y a quién— viva en un registro y no en la bandeja de correo de alguien.

| #      | Tarea                                                                                                      | Estado |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------ |
| `F8.1` | **El modelo**: proyecto, disciplina, WBS, entregable, revisión, transmittal, observación, actividad        | ✅     |
| `F8.2` | **La observación comparte modelo con los temas BCF** de la Fase 4, con dos anclas                          | ✅     |
| `F8.3` | **Subir y descargar**: validación de firma real, clave por sha256, y el nombre del cliente fuera del disco | ✅     |
| `F8.4` | **Asignar, avisar y seguir**: correo al asignar, resumen por tramos, y el expediente                       | ✅     |
| `F8.5` | **Trabajos programados** con su fila en `JobRun` y su vigilante                                            | ✅     |
| `F8.6` | **Ver y comentar el PDF en el navegador** con EmbedPDF (MIT), sin descargarlo                              | ⬜     |
| `F8.7` | **Emitir el transmittal desde la pantalla**, con carátula y acuse                                          | 🟡     |

**Oráculo, y está automatizado** (`apps/documents/tests/test_pantallas.py`): el ciclo completo
de un entregable —subir una revisión en `S3`, abrir una observación asignada a otro, comprobar
que **le llega el correo con el enlace**, responderla, que el proyectista **no la pueda
cerrar**, que el revisor la cierre diciendo cómo, y publicar en `A` para que el avance llegue
a 1— más la comprobación de que un `Mandante` **no ve lo que está en curso**.

### Las decisiones que ordenan este registro (2026-08-26)

**El vocabulario es el de ISO 19650, no uno inventado.** Un código de idoneidad `S3` o `A1`
significa lo mismo en la oficina del proyectista, en la del revisor y en la del mandante; un
estado llamado «en revisión» significa lo que cada uno entienda. Las `S` no son contractuales
y las `A`/`B` sí, y una `B` está publicada **con comentarios**: se puede usar y queda la
obligación de resolverlos, así que una `B` con observaciones abiertas no es un error del
sistema sino su estado normal.

**El entregable no tiene archivo, la revisión sí.** Un entregable existe desde que se
planifica —con su código, su responsable y su fecha— y mucho antes de que exista su primer
archivo. Un registro que necesita un archivo para existir **no puede decir que falta**, que es
justo lo que se le pide.

**El avance físico es una suma auditable, no un número teclado.** Sale del peso de cada
entregable por el código de idoneidad de su revisión vigente. Es la diferencia entre un
porcentaje que alguien escribe en una reunión y uno que se puede revisar entregable por
entregable.

**Nunca se sobreescribe una revisión: se emite otra.** Es lo que permite contestar «qué decía
el plano cuando se aprobó la etapa», que es la pregunta que llega seis meses después.

**La observación tiene un solo ciclo de vida y dos anclas** —revisión + página + coordenada
para el documento, GUID de IFC + viewpoint para el modelo—, así que este registro es **la mitad
ya construida de la Fase 4** en vez de dos tablas parecidas que hay que mantener sincronizadas.
Y **no se cierra sin decir cómo**: eso distingue una resuelta de una que alguien marcó para
bajar el contador.

**Quien abre una observación es quien la cierra.** El `Proyectista` sube revisiones y responde,
pero no cierra: si no, el registro se convierte en «yo mismo declaro que lo arreglé».

**Un archivo que llega de fuera es entrada hostil**, y son las tres reglas que
`docs/ARCHITECTURE.md` ya exigía: extensión, **firma real** de los primeros bytes y tamaño; y
**el nombre del cliente nunca llega al sistema de archivos** — la clave se construye con el
sha256 del contenido y el nombre original vive en la base de datos para poder mostrarlo.

**Los avisos son la función, no un adorno.** Es lo que el usuario pidió con estas palabras:
_«ver los responsables y asignar quién debe realizarlo y que le debe enviar mensaje e
información necesaria»_. Al asignar, al responsable le llega un correo con el enlace, la fecha
y la descripción; y hay un resumen por tramos —vencido, 7, 15 y 30 días—. Dos decisiones que
parecen menores: **no se manda un resumen vacío**, porque un correo que dice «no tienes nada»
todas las mañanas enseña a archivar el remitente sin leerlo; y **un responsable sin correo se
registra**, porque es un aviso que nadie va a recibir.

**Y el expediente es la pantalla que ordena todo**, copiada del `dossier.py` de AeroControl:
contesta _«¿esto está completo y documentado?»_ nombrando **cada fila que falta** con el atajo
que la cierra, y omitiendo los botones que el usuario no puede ejecutar — ofrecer un botón que
termina en 403 es peor que no ofrecerlo, porque enseña a probar puertas.

### Comprobado en el navegador, con el servidor corriendo (2026-08-26)

- Un ejecutable renombrado a `plano.pdf` (cabecera `MZ`) se **rechaza con 400** y el mensaje
  dice qué pasa; nada llega al disco.
- El PDF real sube, y en el disco queda como
  `716-LCD/716-LCD-AR-P-001/14fb1bb0a3f7….pdf`: **el nombre del cliente —con guiones largos y
  acentos— no lo tocó**, y la pantalla se lo devuelve tal cual porque vive en la base de datos.
- El expediente se actualiza solo: desaparece la fila «no hay revisión» y aparece «la revisión
  vigente no está publicada».
- La observación se crea con su responsable, su prioridad, su vencimiento y su ancla, y el
  responsable recibe el aviso.
- **La auditoría registró todo con acciones con nombre** —`subir_revision`,
  `abrir_observacion`— **y también los intentos rechazados**, que es justamente para lo que
  sirve una auditoría.
- Los cuatro roles ven el registro en el portal y **ninguno ve la auditoría**.

### Lo que falta de esta fase, dicho en voz alta

- **`F8.6`: ver y comentar el PDF en el navegador**, con **EmbedPDF** (MIT, framework-agnóstico,
  con anotación y búsqueda incluidas). Es el «comentar en línea sin descargar el documento» de
  MineDoc, y su licencia encaja donde `pdf.js` solo no llega — `pdf.js` muestra, no anota. Hoy
  la observación sobre un documento guarda su página y su coordenada y **no hay quien las
  dibuje**.
- **`F8.7`: emitir el transmittal desde la pantalla.** El modelo está y se prueba —no se emite
  vacío ni sin destinatario— pero la pantalla solo lista: falta armar el borrador, la carátula y
  el acuse.
- **El catálogo `locale/es/` no existe**, así que la interfaz mezcla las cadenas fuente en
  inglés con lo que Django traduce por su cuenta. Se vio en pantalla: «File» sale como
  «Archivo» y «Yes» como «Sí» porque esas las traduce Django, y las propias no.

---

## FASE 6 — Geo + BIM

**Objetivo de salida:** cerrar el ciclo con la familia — el modelo sobre el terreno
y la ortofoto del vuelo que hizo AeroPlanner.

| #      | Tarea                                                                                                                  | Estado |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| `F6.1` | Vista geoespacial con **CesiumJS**, separada de la vista de modelo                                                     | ⬜     |
| `F6.2` | Ortofoto propia (COG) y terreno propio (DEM/DSM) como base de esa vista                                                | ⬜     |
| `F6.3` | Situar el IFC georreferenciado sobre el terreno, leyendo `IfcSite` y el mapa de conversión del modelo                  | ⬜     |
| `F6.4` | Nubes en 3D Tiles con `py3dtiles`, para levantamientos que no caben en la vista de modelo                              | ⬜     |
| `F6.5` | Recibir productos de AeroPlanner por archivo, según [docs/INTEGRATION_AEROPLANNER.md](docs/INTEGRATION_AEROPLANNER.md) | ⬜     |

**Oráculo:** el modelo cae sobre la ortofoto donde está construido en la realidad,
comprobado contra un punto de coordenada conocida en QGIS.

> **Cesium ion queda fuera.** El runtime CesiumJS es Apache-2.0 y sí se usa; el
> servicio ion (terreno y su _Design Tiler_ de IFC) es comercial. AeroBim sirve
> terreno y ortofotos **propios**, que es justamente lo que la familia produce.

---

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

| #      | Tarea                                                                                                | Estado |
| ------ | ---------------------------------------------------------------------------------------------------- | ------ |
| `F7.1` | Generar vistas 2D desde el modelo (planta, alzados) proyectando sus aristas                          | 🟡     |
| `F7.2` | Viewports y capas: qué se dibuja, con qué grosor y en qué capa (`DrawingViewports`, `DrawingLayers`) | ⬜     |
| `F7.3` | Acotado y anotaciones sobre el plano: cotas lineales, ángulos, pendientes y llamadas                 | ⬜     |
| `F7.4` | **Exportar a DXF** con `DxfExporter`, en A3 y milímetros, listo para el CAD                          | 🟡     |
| `F7.5` | Exportar a PDF imprimible, con formato y sello                                                       | ⬜     |

**Oráculo:** el DXF exportado **abre en AutoCAD o BricsCAD** con sus capas y cotas
intactas, y una distancia medida en el plano coincide con la del modelo. Un plano que solo
se entiende dentro de AeroBim no es un entregable.

### Lo armado el 2026-08-19, y qué falta confirmar

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
> proyección **no arranca** — ni siquiera emite su primer aviso de avance. Es la misma limitación de
> siempre, y ahora afecta a una función entera. Por eso la interfaz muestra el avance y ofrece
> **"Dejar de esperar"**: si la proyección se queda quieta, la aplicación vuelve.
>
> **Lo que hay que confirmar en un navegador de verdad**: que la planta sale con las aristas del
> modelo, cuánto tarda con el IFC de 23,6 MB, y que el DXF abre en AutoCAD con su escala.

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

## Fuera de alcance (decidido, no pendiente)

No entran sin que el usuario lo pida explícitamente:

| Qué                                            | Por qué queda fuera                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Modelar o editar geometría IFC**             | Esto es un visor y un coordinador. Modelar es trabajo de Revit, ArchiCAD o Bonsai                                   |
| **Procesar fotogrametría** (generar nubes/DSM) | Misma razón que en AeroPlanner: pide horas de CPU y decenas de GB de RAM, y no hay hardware. Se abre lo ya generado |
| **Editar o clasificar nubes de puntos**        | Trabajo de CloudCompare. Aquí se visualiza y se mide                                                                |
| **xeokit-sdk**                                 | AGPL-3.0: obligaría a liberar la aplicación entera o a pagar licencia comercial. Excelente, pero incompatible       |
| **Adoptar Speckle como plataforma**            | Condicionaría toda la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo. Queda como referencia |
| **iTwin.js / Bentley**                         | MIT en el papel, pero los iModels usables exigen suscripción y la ingesta IFC depende de sus sincronizadores        |
| **Cesium ion**                                 | Servicio comercial. El runtime sí se usa; el terreno y las teselas son propios                                      |
| **4D / planificación de obra**                 | Otro producto. Primero hay que ver el modelo bien                                                                   |
| **Cómputos y presupuesto (5D)**                | Ídem. `ifccsv` deja la puerta abierta, pero no es el MVP                                                            |
| **Compartir base de datos con las hermanas**   | Regla de la familia: la integración es por archivo y por API, nunca por base de datos                               |

---

## Riesgos abiertos

| Riesgo                                                         | Impacto                                                        | Estado                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un IFC de obra real no abre con rendimiento aceptable          | Invalida el stack elegido antes de construir encima            | ✅ **Descartado con cifras** — parsea en 24 ms y convierte en 643 ms, y el `.frag` pesa 13,7× menos                                                                  |
| `IfcLoader.load` no completa y no emite error                  | Bloquea `F0.4`: el visor no abre modelos de forma confiable    | ✅ **Cerrado.** Era el aislamiento de origen activando el WASM multihilo, que no funciona empaquetado. Se quitaron COOP/COEP y se pasó a `IfcImporter` + `core.load` |
| Servir COOP/COEP en producción rompe el visor en silencio      | Vuelve el cuelgue sin error, y ya costó encontrarlo una vez    | Mitigado — el visor **falla al arrancar con un mensaje explícito** si detecta `crossOriginIsolated`. Queda como requisito de despliegue en `AGENTS.md`               |
| That Open rompe la API entre versiones mayores                 | Migración no planificada a mitad de una fase                   | Abierto — fijar versiones alineadas de `three`, `web-ifc` y `@thatopen/fragments`. Ya se topó con que `@thatopen/components` no declara `exports` y su `main` es CJS |
| Potree tiene mantenimiento lento                               | La Fase 2 queda sobre una base que avanza poco                 | Abierto — el wrapper `potree-core` sí está activo; alternativa es 3D Tiles vía Cesium (`F6.4`)                                                                       |
| La alineación nube ↔ modelo resulta más difícil de lo previsto | `F2.4` mide desviaciones sin sentido                           | Abierto — `F2.2` se resuelve antes de prometer mediciones                                                                                                            |
| El BCF exportado no lo acepta el software del mandante         | La coordinación no interopera, que es todo su valor            | Abierto — es el oráculo explícito de la Fase 4                                                                                                                       |
| Las interferencias detectadas son tantas que nadie las revisa  | La Fase 5 se construye y no se usa                             | Abierto — `F5.5` (silenciar falsos positivos) entra en la misma fase, no después                                                                                     |
| Tercer frente abierto con AeroPlanner y AeroControl sin cerrar | Los tres avanzan a un tercio de velocidad                      | Abierto — decisión del usuario; este plan no consume tiempo de los otros repositorios                                                                                |
| La ruta IFC → 3D Tiles abierta pierde metadatos                | En la vista geoespacial los elementos no traen sus propiedades | Abierto — se acota en `F6.3`: la vista de modelo sigue siendo la fuente de propiedades                                                                               |
