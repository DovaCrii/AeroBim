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

| #      | Tarea                                                                                                     | Estado               |
| ------ | --------------------------------------------------------------------------------------------------------- | -------------------- |
| `F0.1` | Documentación de arranque: plan, MVP, arquitectura, referencias con licencias verificadas y marca         | ✅                   |
| `F0.2` | Repositorio creado y publicado, MIT, con la marca en la línea de la familia                               | ✅                   |
| `F0.3` | Monorepo npm: `apps/web` (React 19 + TS + Vite) y `packages/bim-core`, con build, lint y formato verdes   | ✅                   |
| `F0.4` | **PoC del visor**: cargar un IFC real y navegarlo — medir tiempo de carga y memoria                       | ✅ ver abajo         |
| `F0.5` | **Medir la conversión a Fragments** sobre el mismo modelo: tiempo de conversión y tamaño resultante       | ✅ medido            |
| `F0.6` | Decidir dónde corre la conversión (navegador con WASM vs worker de backend) **con los números de `F0.5`** | 🟡 medido, ver abajo |

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

**Criterio de aceptación:** un modelo subido sobrevive al cierre del navegador, y
la versión anterior sigue recuperable.

`F3.5` es lo que separa un visor de una herramienta de control: revisar a mano si
cada elemento trae el pset que el mandante exigió no escala; un IDS lo verifica en
un paso y dice exactamente qué falta.

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

| #       | Tarea                                                                                    | Estado |
| ------- | ---------------------------------------------------------------------------------------- | ------ |
| `F7.6`  | **Leer un DXF**: capas, unidades, colores, textos, líneas, polilíneas, arcos y bloques   | ✅     |
| `F7.7`  | **Dibujarlo en la escena** a una cota, con los colores reales del CAD y sus rótulos      | ✅     |
| `F7.8`  | **Calzar plano y modelo**: por dos pares de puntos, y a mano con unidad, cota y giro     | ✅     |
| `F7.9`  | **Panel de capas del plano**: encender y apagar cada una                                 | ✅     |
| `F7.10` | **Seleccionar en 2D**: clic en un trazo → su capa, su plano y el largo del tramo         | ✅     |
| `F7.11` | **Herramientas CAD de revisión**: ajuste a extremo y punto medio, y medir sobre el plano | 🟡     |
| `F7.13` | **Fidelidad del CAD**: paleta ACI real, tipos de línea y rótulos legibles                | ✅     |
| `F7.12` | **Cruzar**: el plano en planta con el modelo cortado a esa altura, lado a lado           | ⬜     |

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

**Lo que hay de `F7.11`**: el cursor se engancha a los **extremos** y a los **puntos medios** de los
trazos, y midiendo distancia esos son los puntos que toma la cota. Falta la **intersección** de dos
trazos, medir del plano al modelo en un mismo gesto, y marcar sobre el plano. El ajuste al plano se
apaga desde la cinta: midiendo el modelo con un plano debajo, engancharse al CAD falsea la medida.

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
| `F7.1` | Generar vistas 2D desde el modelo (plantas, alzados, secciones) con `TechnicalDrawings`              | ⬜     |
| `F7.2` | Viewports y capas: qué se dibuja, con qué grosor y en qué capa (`DrawingViewports`, `DrawingLayers`) | ⬜     |
| `F7.3` | Acotado y anotaciones sobre el plano: cotas lineales, ángulos, pendientes y llamadas                 | ⬜     |
| `F7.4` | **Exportar a DXF** con `DxfExporter`, para que el plano siga su camino en CAD                        | ⬜     |
| `F7.5` | Exportar a PDF imprimible, con formato y sello                                                       | ⬜     |

**Oráculo:** el DXF exportado **abre en AutoCAD o BricsCAD** con sus capas y cotas
intactas, y una distancia medida en el plano coincide con la del modelo. Un plano que solo
se entiende dentro de AeroBim no es un entregable.

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
