# MASTER_PLAN — AeroBim

> **Fuente única de verdad del trabajo pendiente.** Consolida el estudio de
> alternativas open-source (verificado el 2026-08-18 contra la API de GitHub y los
> registros de npm/PyPI) en un tablero ejecutable con seguimiento de estado.
> **Creado:** 2026-08-18 · **Actualizado:** 2026-09-02 (tablero de lo abierto, y la Fase 9 en marcha)
> **Rama base:** `main`
> **Regla de oro:** cada fase termina en algo **que alguien puede usar**. No se abre
> una fase nueva con la anterior a medio cerrar, y no se agrega alcance fuera de lo
> listado aquí sin que el usuario lo pida.

---

## Por dónde se empieza

**La Fase 9 está cerrada salvo `F9.6`.** El visor tiene tokens, escala calibrada, anillo de foco,
áreas de toque de 44 px y ninguna acción escondida detrás del ratón — todo con el contraste
comprobado en el gate, y sin mover un solo componente de sitio. **`F9.6` no la decide este plan**:
son tres decisiones del usuario y contradicen tres líneas escritas de `UX.md`.

**Lo que sigue** es la pantalla que dispara una corrida de interferencias —y con ella la decisión
de `F3.4`, que ahora tiene su número: 20 s—, el trazo libre de `F4.5`, o abrir la Fase 2 o la 6.

> **Esta sección decía «lo que sigue es `F0.6`» hasta el 2026-09-02**, y `F0.6` se cerró el
> 2026-08-19. La fuente única de verdad apuntaba a una tarea muerta durante dos semanas, mientras
> lo que quedaba de verdad había que ir a buscarlo por dos mil cuatrocientas líneas. De ahí el
> tablero de abajo: **una sola tabla con todo lo abierto**, que se actualiza al cerrar una fila.

**Lo cerrado en la semana del 2026-08-26 al 09-02**, para no volver a abrirlo: la auditoría entera
de la cinta (`F1.13`, siete desajustes), la puesta en la VM (`F3.11` — driver, gunicorn, `/health/`
y systemd), las vistas que se pueden pasar a otra persona (`F3.12`), la visibilidad en el viewpoint
(`F4.7`), la foto del hallazgo en el BCF (`F4.10`) y la medición que dejó `F3.4` sin proceder.

## Lo que queda, por fase

Las **veintinueve** filas abiertas, de una vez. `⬜` no empezada · `❓` medida y esperando algo ·
`⛔` bloqueada por una decisión del usuario.

| Fase                    | Filas abiertas                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **9 — Diseño**          | `F9.6` ⛔ — la decide el usuario, y son tres decisiones _(`F9.1` a `F9.5` cerradas)_                                      |
| **4 — Coordinación**    | `F4.5` ◐ falta el trazo libre; las cotas ya viajan · `F4.6` importar BCF ⬜                                               |
| **7 — Planos, salida**  | `F7.2` viewports y capas · `F7.3` acotado y anotaciones · `F7.5` exportar a PDF ⬜                                        |
| **2 — Nubes de puntos** | `F2.1` a `F2.6` ⬜ — cargar, alinear, visualizar, medir contra el modelo, documentar el pipeline, y el gaussian splatting |
| **5 — Interferencias**  | `F5.1` ◐ falta la pantalla de grupos · `F5.5` ◐ falta agrupar por proximidad _(2, 3 y 4 cerradas)_                        |
| **6 — Geo + BIM**       | `F6.1` a `F6.5` ⬜ — Cesium, ortofoto y terreno propios, situar el IFC, 3D Tiles, y recibir de AeroPlanner                |
| **1 — Visor**           | `F1.13` ❓ — auditada; quedan tres nombres que decide el usuario                                                          |
| **3 — Backend**         | `F3.4` ❓ — medida y hoy no procede; se reabre con un número, no con una intuición                                        |

**El orden no es el número de la fase.** Va primero lo que deja la aplicación entera y usable con
lo que ya hay —la Fase 9— y después lo que abre frente nuevo. Las fases 2, 5 y 6 son las tres
grandes que quedan por empezar, y ninguna se abre con la anterior a medio cerrar.

## Las decisiones que solo el usuario puede tomar

No son tareas: son preguntas abiertas que bloquean o desvían trabajo, y hasta hoy estaban
repartidas por el documento.

| #                                 | Qué hay que decidir                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F9.6` — **tres**, y por separado | Si el navegador de la derecha **se reparte** en un rail de destinos; si algo **puede flotar** sobre el modelo; si propiedades **se ancla** al elemento. Las tres contradicen una línea escrita de `UX.md`. Se puede aceptar una y rechazar las otras dos, y **si se acepta alguna se reescribe `UX.md` primero** |
| `F1.13` — **tres nombres**        | El grupo «Trabajo» de la cinta no dice qué contiene; **«Guardar vista»** es un mandato y solo vive en el panel derecho; y **calzar un plano, cortar a su altura, generar un plano y observar** son mandatos que hoy solo salen de un panel o de una ficha                                                        |
| `F3.4` — **el umbral**            | Ya está el número que la reabre: **30 s** sobre un archivo real. Hoy lo más lento son 1,5 s                                                                                                                                                                                                                      |
| Despliegue                        | Qué dominio (`bim.<dominio>`), y si comparte VM con AeroControl y AeroPlanner                                                                                                                                                                                                                                    |
| Copias de seguridad               | No hay nada escrito. Son dos cosas separadas a propósito: la base y `/var/lib/aerobim`                                                                                                                                                                                                                           |
| Modelos de prueba                 | Falta uno **> 50 MB** y uno de instalaciones. Son los dos que decidirían si `F3.4` procede                                                                                                                                                                                                                       |

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

**La estructura está escrita en [docs/UX.md](docs/UX.md)** (2026-08-19, a pedido del usuario) y
**los tokens en [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** (2026-09-01). Lo
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

| #       | Tarea                                                                                                                                 | Estado                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `F1.1`  | Árbol espacial navegable (proyecto → sitio → edificio → planta → elemento) con aislar y ocultar                                       | ✅ ver abajo                                                                                                   |
| `F1.2`  | Panel de propiedades y **psets** del elemento seleccionado                                                                            | ✅ ver abajo                                                                                                   |
| `F1.3`  | Planos de corte y secciones                                                                                                           | ✅ ver abajo                                                                                                   |
| `F1.4`  | Mediciones: distancia, área y ángulo                                                                                                  | ✅ ver abajo                                                                                                   |
| `F1.5`  | Cargar **varios modelos IFC a la vez** (arquitectura + estructura + instalaciones) y alternarlos                                      | ✅ ver abajo                                                                                                   |
| `F1.6`  | Vistas guardadas: cámara, visibilidad y cortes, recuperables por nombre                                                               | ✅ ver abajo                                                                                                   |
| `F1.7`  | **Modos de vista**: proyección perspectiva/ortográfica, navegación (órbita, planta, primera persona) y representación (sólido, malla) | ✅ ver abajo                                                                                                   |
| `F1.8`  | **Barra de herramientas y panel de modelos** — reubicar y agrupar las herramientas; ordenar, activar y desactivar lo cargado          | ✅ ver abajo                                                                                                   |
| `F1.9`  | **Unidades de las propiedades** — cada número con la unidad que declara el archivo                                                    | ✅ ver abajo                                                                                                   |
| `F1.10` | **Geometría que no se carga** — el conversor dejaba fuera `IfcProxy`: 433 elementos de 1.274                                          | ✅ ver abajo                                                                                                   |
| `F1.11` | **El picker caía desviado** el ancho del panel izquierdo: se seleccionaba otro elemento                                               | ✅ ver abajo                                                                                                   |
| `F1.12` | **Preselección al pasar el cursor** — se selecciona sin clicar y el usuario lo llama «poco práctico»                                  | ✅ ver abajo                                                                                                   |
| `F1.13` | **El panel de abajo no se entiende** — reubicar y agrupar las herramientas, mirando cómo lo resuelven Revit y AutoCAD                 | ❓ auditada la cinta entera: siete desajustes cerrados y tres decisiones de nombre para el usuario — ver abajo |
| `F1.14` | **La medición de distancia no funciona** en uso real, con el modelo del usuario                                                       | ✅ ver abajo                                                                                                   |
| `F1.15` | **El modo fantasma se cae al mover** la cámara                                                                                        | ✅ ver abajo                                                                                                   |
| `F1.16` | **El renderizado no da profundidad** — sin sombras creíbles, el modelo se lee peor de lo que debería                                  | ✅ ver abajo                                                                                                   |

### Lo que el usuario pidió el 2026-08-19 y no estaba en ningún tablero

**Estaba en una nota con dos capturas, y `obsidian/` está en `.gitignore`**: se habría perdido.
Son cinco cosas, dichas con sus palabras, y ninguna es cosmética — todas son sobre _cómo se
navega y se revisa_, que es lo que llamó «lo esencial»:

### `F1.12`: nada selecciona al pasar el cursor, y el sospechoso era un color (2026-08-26)

«Al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco práctico.»

**Buscado, y no hay nada en el código que seleccione al pasar el cursor**: `pickAt` se llama solo
desde `onClick`, y no hay un solo `addEventListener` de movimiento del ratón en todo
`packages/viewer` —lo único que escucha el puntero son los controles de cámara y los medidores de la
librería cuando están encendidos—.

**Lo que sí sigue al cursor es el marcador de ajuste del medidor**, y venía con el borde en
`rgb(122, 75, 209)` a 10 px: un punto violeta, del mismo tono que «esto está seleccionado», saltando
de vértice en vértice. Eso se lee como una selección, y era el único candidato.

**Arreglado sin tocar comportamiento**: el marcador pasa a `#ffd43b`, amarillo, que es la convención
de AutoCAD y de BricsCAD para las marcas de referencia — nadie las confunde con una selección. El
ajuste engancha exactamente donde enganchaba. Comprobado en el navegador y no supuesto: las cuatro
clases de ajuste —base, cara, vértice y arista— devuelven `#ffd43b`, y la comprobación va en el modo
`medidas` del diagnóstico **porque son estáticos de la librería**: si una versión nueva les cambia
el nombre, el recolorado dejaría de aplicarse en silencio.

> **Si el usuario sigue viendo que «selecciona solo»**, entonces no era esto y hace falta saber dos
> cosas: qué pestaña estaba activa y qué se resaltaba. No hay más candidatos en el código.

### `F1.14` cerrada: la medición no fallaba, mentía (2026-08-26)

**El defecto tenía dos mitades y la segunda es la que lo hacía indistinguible de «no funciona».**

1. El ajuste de `LengthMeasurement` **no usa el rayo de la CPU: lee los píxeles de la escena
   dibujada**. Cuando esa lectura no resuelve —y depende de qué fotograma haya— `create()` no
   coloca nada.
2. Y `addMeasurePoint` **devolvía `true` de todas formas**, con su propio comentario admitiéndolo:
   _«Los medidores de la librería no informan si el clic cayó en el vacío, así que acá se da por
   registrado»_. La interfaz avanzaba el contador, el aviso pasaba a pedir el segundo punto, y un
   clic que no hizo nada se veía **igual** que uno que sí.

**El arreglo es usar el rayo propio, que ya estaba escrito.** `snapAt` usa `fragments.raycast` con
las mismas clases de ajuste —vértice, arista, cara— y es el mismo mecanismo que la selección, que
sí funciona en uso real. Devuelve el punto o `null`, así que el valor de retorno deja de mentir; y
`addPlanMeasurePoint`, que ya dibujaba una cota de dos clics con coordenadas propias, se
generaliza a `addDistancePoint` y sirve para los dos.

**Y la otra mitad: ahora el clic al vacío se dice.** La barra de estado avisa en ámbar —«ahí no hay
geometría: el clic no contó»— en vez de callarse. El silencio es lo que se lee como «no funciona».

**De paso salió gratis lo que `docs/UX.md` tenía pedido**: medir del plano al modelo en un mismo
gesto. Los dos puntos entran por la misma función, así que uno puede engancharse a un trazo del CAD
y el otro a un vértice del modelo.

**Comprobado en el navegador** con `Piso 5.ifc` y `ACAD-Piso 5_Base.dxf` cargados a la vez:

| Qué                            | Resultado                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| El rayo propio sobre el modelo | Devuelve el punto; en una esquina vacía devuelve `null`          |
| Clic al vacío                  | `false` — **no cuenta**, y la barra lo dice                      |
| Dos clics sobre el modelo      | Una cota: **13,066 m**, con 13,064 en planta y 0,179 de desnivel |
| Del plano al modelo            | Una cota: **8,948 m**                                            |

> **El ángulo y el área quedaron con el medidor de la librería**, con la nota de que eran «las dos
> que quedan». **Cerradas el mismo día**, más abajo.

### Las cuatro mediciones pasan por el rayo propio (2026-08-26)

El arreglo de `F1.14` dejó dicho que el ángulo y el área seguían con el medidor de la librería y
seguían sin informar del clic al vacío. Ya no: las cuatro entran por el mismo sitio.

**Lo que se gana no es solo consistencia, es poder comprobarlas.** El ajuste de la librería lee
píxeles de la escena dibujada, así que las tres medidas que dependían de él **no se podían ejercitar
en un entorno que no compone fotogramas** — que es exactamente donde el usuario decía que no
funcionaban. El comentario de `diag.ts` lo daba por perdido: _«es la única medición que se puede
comprobar sin interfaz»_, hablando de la perpendicular. Ahora hay un modo `medidas` que las prueba.

**Y para poder probarlas hizo falta una entrada nueva que además hacía falta por otro motivo.**
`addMeasurePointAt(punto)` suma un punto **por su coordenada del mundo**, sin rayo. Existe porque
restaurar una medición guardada —o abrir el punto de vista de un BCF— son coordenadas, no clics; y
porque el rayo, en este panel, **se agota en un par de llamadas**: el ángulo pide tres puntos y el
área cuatro, así que por el clic no había forma de llegar al final. Medido: las mismas quince
coordenadas dan quince puntos, luego seis, luego ninguno. Es la limitación que `HANDOFF.md` ya tenía
anotada, no un defecto del visor.

**Comprobado, con figuras de medida conocida** —una prueba que acepta cualquier número no comprueba
nada—:

| Qué                                      | Resultado                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| Clic al vacío en los **cuatro** modos    | `false` en los cuatro — antes solo la distancia      |
| Distancia, dos clics sobre el modelo     | **7,702 m**, con su cota dibujada                    |
| Ángulo, un triángulo rectángulo          | **90,00°** exactos, con su cota                      |
| Área, un cuadrado de 4 m                 | **16,00 m²** y **16,00 m** de perímetro, con su cota |
| Área con dos vértices, al cerrar         | No cierra: un área de dos puntos no significa nada   |
| Cancelar con tres vértices puestos       | Quedan 0                                             |
| Cambiar de modo con dos vértices puestos | Quedan 0                                             |

> **Y el oráculo se ganó el sueldo en la primera pasada.** El perímetro del cuadrado salió **12 m
> en vez de 16**: al portar el área tomé `perimeterM`, que es —y así lo dice— el largo de una
> polilínea **abierta**, y le faltaba el lado de vuelta. Con un contorno cualquiera el número habría
> pasado inadvertido. Ahora el dominio tiene `closedPerimeterM` **como función aparte y no como un
> parámetro**, porque un nombre que dice «cerrado» no se usa por descuido para lo otro; con sus
> cuatro pruebas, incluida la que dice que dos puntos son un segmento y no un contorno.
>
> **Lo que sigue sin poder comprobarse acá es la perpendicular**, y es inherente: su primer punto no
> es un punto, es una **cara** —hace falta la normal— y eso no viaja como una terna de números.
> Depende del rayo, con el presupuesto que haya. Tiene su propio modo, `?modo=perpendicular`.

### `F1.15` cerrada: el fantasma no se caía al mover, nunca estuvo entero (2026-08-26)

**Primero hubo que poder verlo.** «Se cae al mover» no se depura mirando, y en el entorno de trabajo
tampoco se puede mirar —el panel del navegador no compone fotogramas—, así que lo primero fue un
oráculo: `BimViewer.paintAudit` cuenta, material por material de la escena, cuántos llevan la
pintura translúcida y cuántos siguen opacos, y `diag.html?modo=fantasma` mueve la cámara y va
anotando. Con eso el defecto dejó de ser una frase.

**Lo que dijo la medición sobre `Piso 5.ifc`, antes de tocar nada:**

| Momento                      | Pintado                    |
| ---------------------------- | -------------------------- |
| Recién encendido el fantasma | **0 %**                    |
| Moviendo la cámara           | 53–56 %                    |
| Con la cámara ya detenida    | **62 %**, y ahí se quedaba |

Es decir: **no es que se caiga al mover, es que nunca llegó a estar entero**, y detenerse no lo
recupera. Y el repintado que había al descansar la cámara corría _antes_ de que llegaran las mallas
nuevas, así que subía siete puntos y se rendía.

**La causa apareció por un error, y fue el error el que la nombró.** Al intentar clonar el material
de las mallas que quedaban opacas, la traza dijo `LodMaterial.clone()` →
`Cannot read properties of undefined (reading 'color')`, sobre un `LODMesh`. Esas mallas son los
**sustitutos del nivel de detalle**: lo que Fragments dibuja mientras la cámara se mueve. No pasan
por su registro de resaltado, así que `fragments.highlight()` no las alcanza — y no es cuestión de a
quién se resalta: pasarle la lista explícita de todos los elementos con `getLocalIds()` dejaba
**exactamente las mismas 16 mallas** opacas y dibujando, con 258, 822, 180 índices reales.

**Y había un segundo defecto detrás, que ninguna nota tenía apuntado:** `resetHighlight()` **no
deshace lo que `highlight()` pinta**. Al volver a sólido quedaban 32 mallas translúcidas para
siempre.

**El arreglo:** la vista fantasma se pinta por cuenta propia —un clon translúcido por material de
origen, `depthWrite` apagado y las dos caras—, y `fragments.highlight` queda solo para la selección,
que es lo que sí resuelve bien. El material del nivel de detalle es el único que se pinta en su
sitio, porque no se deja clonar; se guarda cómo estaba y se repone. Y se engancha `onViewUpdated`
para tapar la geometría que llega nueva, con la condición de parada puesta en la escena misma —no
quedan opacos— y un techo de cuatro repintados por gesto, porque un material que no se dejara pintar
convertiría eso en un bucle infinito que quema la GPU en silencio.

**Después:**

| Momento                             | Antes             | Ahora         |
| ----------------------------------- | ----------------- | ------------- |
| Recién encendido                    | 0 %               | **100 %**     |
| En cada uno de los tres movimientos | 53–56 %           | **100 %**     |
| Con la cámara detenida              | 62 %              | **100 %**     |
| Al volver a sólido                  | 32 mallas pegadas | **0, limpio** |
| Materiales visibles en escena       | ~50               | 18            |

Lo último no es cosmético: al dejar de usar el resaltado de la librería para el fantasma
desaparecen sus mallas duplicadas, así que el modo cuesta menos que antes. Los dos únicos
translúcidos que quedan son **el vidrio del propio modelo**, y se dejan a propósito: pintarlos los
volvería _más_ opacos de lo que el modelo dice.

De paso el fantasma **conserva el color de cada elemento** en vez de blanquear el modelo entero, que
es lo que hacía la librería: mirando detrás de un muro se sigue distinguiendo una viga de una losa.

> **Lo que este oráculo no puede decir.** `paintAudit` **es ciego a la selección**: medido en los
> dos estilos, seleccionar no añade ningún material a la escena, ni en sólido ni en fantasma —
> Fragments dibuja el elemento elegido dentro de su propia pasada. Un cero de opacos con algo
> seleccionado se leía como «el fantasma se tragó la selección» y no era verdad. Queda dicho en
> `diag.ts`: si la selección dentro del fantasma da problemas, hay que mirar la pantalla.

- **`F1.14`** «las opciones de medida de distancia no está funcionando». `F1.4` está cerrada con
  33 pruebas de geometría, así que **es la interacción, no la aritmética** — y encaja con lo que
  `HANDOFF.md` ya decía de la perpendicular: en el navegador de pruebas ningún rayo encuentra
  geometría después de un par de refrescos.

### `F1.16` cerrada: las sombras estaban montadas y apagadas (2026-08-26)

**Es el mismo caso que `F7.13`**: el código dice sombras y la pantalla dice que no. La escena se
crea con `ShadowedScene`, con `setup({shadows: {cascade: 1, resolution: 2048}})` y con la
postproducción en `COLOR_PEN_SHADOWS`, así que leyendo el código estaba hecho. Medido con
`diag.html?modo=sombras` sobre `Piso 5.ifc`, **había cuatro cosas mal a la vez**:

| Qué                                      | Antes                                      | Ahora              |
| ---------------------------------------- | ------------------------------------------ | ------------------ |
| Mapa de sombras del renderizador         | **apagado**                                | encendido, suave   |
| Recuadro de sombra de la luz direccional | **10 × 10 m**, con el modelo midiendo 40,5 | 65 × 65 m          |
| Mallas que proyectan sombra              | **0 de 8**, y **0 de 15** al mover         | 8 de 8, y 15 de 15 |
| Mallas que reciben sombra                | **0**                                      | todas              |
| Luz ambiental                            | 1,50                                       | 0,45               |
| Luz direccional                          | 1,50                                       | 2,20               |

Las cuatro tienen su explicación y ninguna se habría encontrado leyendo:

1. **`setup({shadows})` crea la luz que proyecta y deja el mapa de sombras del renderizador
   apagado.** Sin él no se calcula ninguna sombra, haga lo que haga el resto.
2. **La cámara de sombra de una luz direccional es ortográfica y trae un recuadro pequeño de
   fábrica.** Con el edificio fuera de él no se dibuja _ni una_ sombra aunque todo lo demás esté
   bien. Ahora se ajusta al modelo con holgura —la sombra cae **fuera** de la planta, así que un
   recuadro justo la corta— y se rehace por cada modelo que entra.
3. **Three.js exige `castShadow` y `receiveShadow` por objeto**, y las mallas del modelo las crea
   el worker de Fragments _después_ del `setup`. Se ponen al cargar **y en cada aviso de
   `onViewUpdated`**, que es el mismo enganche que arregló el modo fantasma: sin eso, media planta
   deja de proyectar al girar la cámara.
4. **La luz ambiental venía a 1,50, igual que la direccional.** Un término ambiente tan fuerte
   iguala todas las caras y el modelo se ve plano — y esa es la mitad de «no da profundidad» que no
   tiene nada que ver con las sombras proyectadas. Baja a 0,45 y la direccional sube a 2,20 para
   que el total no oscurezca.

Y una más, que también habría dejado el modelo sin sombras y es difícil de ver: **la luz apunta a
donde diga su `target`**, y el de fábrica está en el origen. Un IFC de obra viene en coordenadas de
proyecto, a cientos de metros del origen: la luz lo iluminaba de canto. Ahora el `target` va al
centro del modelo.

Comprobado también con el IFC real de 23,6 MB: 71,5 m de lado, recuadro de 114 × 114 m, y **87 de
87** mallas proyectando y recibiendo. Y sin romper lo de antes: el modo fantasma sigue al 100 % y el
informe de fidelidad del plano no cambia una cifra.

> **Lo que no se puede afirmar desde aquí.** El panel del navegador de este entorno **no compone
> fotogramas**, así que no se puede mirar el resultado. Lo que se afirma es que **las cinco
> condiciones que Three.js exige están puestas y medidas**, donde antes cuatro no lo estaban. Que
> la sombra guste —dirección de la luz, dureza del borde— es una decisión de aspecto que pide una
> pantalla. La postproducción sigue apagándose en Modo 2D a propósito (`F7.16`): sobre un dibujo de
> líneas lava los colores.

### `F1.13`: la premisa está vencida, y hay que preguntar (2026-08-26)

**Buscado, y lo que el ticket describe ya no existe así.** Dos hallazgos:

- **`F1.13` pide lo mismo que `F1.8`, palabra por palabra** —«reubicar y agrupar las
  herramientas»—, y `F1.8` está cerrada. El comentario de `components/Ribbon.tsx` nombra el defecto
  que se arregló y coincide con la queja: _«catorce botones en fila, dos llamados "Planta", sin
  nombres»_. Hoy cada herramienta lleva su nombre debajo del icono y cada bloque el nombre de su
  grupo, que es la convención de Revit y BricsCAD — la referencia que el propio ticket pide mirar.
- **Y el pie de hoy no tiene herramientas**: `components/StatusBar.tsx` son 27 px con el modo
  activo, qué hace el próximo clic, el resultado de la medición con **cada magnitud por su nombre**
  y el estado de visibilidad. Los dos únicos botones son las dos salidas del aislamiento, y están
  ahí por una razón escrita: aislar se hace desde la ficha o desde el árbol, y el camino de vuelta
  tiene que verse desde cualquier pestaña.

Las dos cosas pasaron **el mismo día** que la nota (2026-08-19), así que lo más probable es que el
ticket describa la pantalla de antes del rediseño. **Rediseñar el pie a ciegas sería inventar un
problema**, y por eso queda en `❓`: falta que el usuario diga si lo que no se entiende sigue ahí y
qué es exactamente.

#### La auditoría de la cinta, hecha entera (2026-08-28)

En vez de esperar la respuesta sin hacer nada, se auditó la cinta **botón por botón contra lo que el
visor sabe hacer**. La pregunta no era de gusto —eso sigue siendo del usuario— sino comprobable:
**¿lo que la cinta ofrece coincide con lo que el visor puede?** Salieron siete desajustes, y ninguno
es de opinión: en los siete el código dice una cosa y la pantalla otra.

| #   | Lo que se veía                                                                                          | Lo que era                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Con un **DXF solo**, medio Vista en gris —encuadre, las cuatro vistas, proyección y navegación—         | `frameAll` cuenta los planos **a propósito**, con su comentario diciéndolo; la puerta de la cinta seguía siendo `models.length > 0`        |
| 2   | Un área a medio contornear **no tenía salida**                                                          | `cancelMeasurement` estaba implementada y comprobada en `diag.html`, y **no la llamaba nadie**: la única salida era pulsar "Seleccionar"   |
| 3   | **"Navegador" dos veces**: en la fila de pestañas y dentro del grupo _Visibilidad_ de la pestaña Modelo | El mismo `onTogglePanel("derecha")`, y en un grupo que habla de apagar elementos del modelo                                                |
| 4   | **"Ver todo" con dos dibujos**: un árbol en la cinta, un ojo en la barra de estado                      | Mismo mandato. Dos iconos obligan a leer el rótulo, que es lo que un icono viene a evitar                                                  |
| 5   | Un lector de pantalla anunciaba _"Todo, botón de alternancia, no pulsado"_                              | `aria-pressed` estaba en **todos** los botones, mandatos incluidos; y "Ver todo" y "Salir" usaban `active` para decir "hay algo que hacer" |
| 6   | Salir del **Modo 2D** encendía modelos que estaban apagados a mano, y devolvía la cámara a perspectiva  | El interruptor no deshacía lo suyo: reponía un estado de fábrica en vez del que había antes de entrar                                      |
| 7   | Escribiendo el nombre de una vista en modo Área, **`Enter` cerraba el contorno**                        | Los atajos escuchan en la ventana entera —que es lo que los hace funcionar sin pinchar el lienzo— y también oían a quien escribe           |

Los siete están cerrados. Lo comprobado en el navegador, con `fidelidad-2d.dxf` y **sin ningún IFC
abierto**, que es el caso que delataba el 1:

- Encuadre, las cuatro vistas, proyección y navegación **habilitados**; "Planta" mueve la cámara de
  `(50, 50, 50)` a `(0, 7.53, 0)` mirando al plano. _Aspecto_ y _Cortes_ siguen **en gris**, y es
  correcto: pintan fragmentos y `addSection` se calcula desde la caja de los modelos.
- Tres vértices puestos, `Esc` → **cero**, sin tocar las mediciones ya tomadas.
- Los mismos `Esc` y `Enter` **desde dentro de un campo de texto**: tres vértices → tres.
- Ortográfica → entrar al Modo 2D → salir → **Ortográfica**, donde antes salía Perspectiva.
- `aria-pressed` solo en los interruptores: "Cerrar contorno", "Cancelar", "Borrar todas" y "Ver
  todo" ya no lo llevan.

**El aspecto no se pudo mirar**: el panel del agente no compone fotogramas y la captura se agota
—la trampa ya escrita en `HANDOFF.md`—. Lo verificado acá es el comportamiento, leído del DOM y de
la API del visor.

**Y quedan tres decisiones que son del usuario**, porque son de nombre y de sitio, no de
funcionamiento:

1. El grupo **"Trabajo"** (Modo 2D + Ejes) no dice qué contiene. Los demás sí — _Encuadre_,
   _Vistas_, _Proyección_.
2. **Guardar una vista es un mandato y no tiene sitio en la cinta**: vive solo en el navegador de la
   derecha. En Revit estaría en la pestaña Vista.
3. Igual que el anterior, sin decidir: **calzar un plano**, **cortar a la altura del plano**,
   **generar un plano** y **observar** son mandatos que hoy solo salen desde un panel o desde la
   ficha del elemento.

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
servidor, y eso **dejó de ser toda la historia el 2026-08-28**: `F3.12` añadió las **vistas del
proyecto**, que sí se le pueden pasar a alguien porque van en GUID y en el sistema del IFC. Las
locales se quedan como están, que es lo que las hace baratas.

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

### `F2.6` — Gaussian splatting: **va aquí y no en AeroPlanner** (decidido el 2026-08-26)

| #      | Tarea                                                                        | Estado |
| ------ | ---------------------------------------------------------------------------- | ------ |
| `F2.6` | Abrir una escena de gaussian splatting en la misma escena Three.js del visor | ⬜     |

Lo preguntó el usuario: ¿AeroBim o AeroPlanner? **AeroBim**, por cuatro razones, y ninguna es de
comodidad:

1. **El valor del splat es comparar lo construido con lo modelado**, y esa comparación **solo existe
   aquí**. Es literalmente la razón de ser del producto —«lo que dice el plano, ¿está modelado?»— y
   ya hay un IFC y un DXF en la misma escena para hacerla.
2. **El sitio ya está reservado.** `docs/UX.md` tiene `NUBES DE PUNTOS` como sección del navegador
   del proyecto, y un splat es de la misma clase: una captura de la realidad, con las mismas
   necesidades —encender y apagar, recortar por caja, medir contra ella y, sobre todo, **calzarla
   con el modelo**—. La regla de crecimiento del propio documento es «una capacidad nueva es una
   sección del navegador».
3. **La máquina que hace falta ya está montada acá**: la escena, la cámara, los cortes, las
   mediciones y la disciplina de unidades y coordenadas. Y `F2.2` —el problema difícil, alinear la
   captura con el modelo— **es el mismo problema** y se resuelve una vez para las dos.
4. **El ciclo se cierra acá**: sobre un splat se ve el defecto y se abre la observación, con su
   responsable y su correo. En AeroPlanner no hay a quién asignar nada.

**Lo que sí es de AeroPlanner** es la otra mitad: **planificar el vuelo que produce una buena
reconstrucción** —líneas y solape— y, si acaso, lanzar y vigilar el trabajo de reconstrucción. El
artefacto se consume aquí. Es la misma división que ya existe con la ortofoto (`F6.4`).

> **Y una trampa verificada que costaría una sesión.** El renderizador más conocido para Three.js,
> `@mkkellogg/gaussian-splats-3d` (MIT), usa **`SharedArrayBuffer` por defecto** para hablar con su
> worker de ordenamiento, y su propio README dice que para eso **hacen falta las cabeceras
> COOP/COEP**. Esas cabeceras son la **regla cerrada número 9 de `AGENTS.md`**: activan el WASM
> multihilo de `web-ifc`, que no funciona empaquetado, y **el visor se cuelga sin emitir error**.
>
> Así que si entra por ahí, entra con `sharedMemoryForWorkers: false` y —como recomienda el propio
> README cuando eso se apaga— `gpuAcceleratedSort: false`. No es una preferencia de rendimiento: es
> la diferencia entre que el IFC abra o no. Alternativas a evaluar, las tres MIT:
> `@sparkjsdev/spark` (pensado para Three.js), `gsplat` y el motor `playcanvas` — de este último hay
> que ver si trae su propia escena, que es el motivo por el que se descartó `dxf-viewer`.
>
> Lo otro a medir antes de prometer: **el peso**. Una escena de splats son cientos de megas, y este
> repositorio ya pagó una vez el precio de la memoria de vídeo con el atlas de rótulos del plano. El
> archivo vive fuera del repositorio, como los IFC.

---

## FASE 3 — Persistencia y backend

**Objetivo de salida:** los modelos dejan de vivir en la pestaña del navegador: se
guardan por proyecto, con versiones y con quién subió qué.

| #       | Tarea                                                                                                | Estado                                  |
| ------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `F3.1`  | API en Python (Django + DRF, como AeroControl): proyectos, modelos, versiones, usuarios y permisos   | ✅ ver abajo                            |
| `F3.2`  | Almacenamiento de archivos con validación de tipo, tamaño y nombre — nunca el nombre del cliente     | ✅ ver abajo                            |
| `F3.3`  | Extracción de metadatos con `ifcopenshell`: esquema, unidades, georreferenciación, conteo por tipo   | ✅ ver abajo                            |
| `F3.4`  | Jobs asíncronos (Celery) para lo que tarde: conversión, extracción, validación                       | ❓ medido, y hoy no procede — ver abajo |
| `F3.5`  | Validación **IDS** con `ifctester`: el modelo cumple o no el requisito de información del proyecto   | ✅ ver abajo                            |
| `F3.10` | **El IDS de partida**: qué trae el modelo, medido, y el requisito que sale de esa medición           | ✅                                      |
| `F3.6`  | **Levantar `services/api`**: Django 6 + uv, con la forma de AeroControl y base de datos propia       | ✅                                      |
| `F3.7`  | **Portal de ingreso**: `django.contrib.auth` endurecido con axes, sin auto-registro                  | ✅                                      |
| `F3.8`  | **Roles y el contrato de permisos**: la matriz como dato, el guardián, y la prueba de 403            | ✅                                      |
| `F3.9`  | **Los módulos y cómo se entra a cada uno**: portal por etapa de trabajo, filtrado por permiso        | ✅                                      |
| `F3.11` | **Ponerlo en la VM**: driver de PostgreSQL, servidor de aplicación, `/health/` y unidades de systemd | ✅ ver abajo                            |
| `F3.12` | **Vistas que se pueden pasar**: la vista del modelo sale del navegador y vive en el proyecto         | ✅ ver abajo                            |

**Criterio de aceptación:** un modelo subido sobrevive al cierre del navegador, y
la versión anterior sigue recuperable.

### `F3.4`: los tres trabajos «que tardan», medidos — y no tardan (2026-08-28)

La fila pedía **Celery** para «lo que tarde: conversión, extracción, validación», y esa premisa
nunca se había medido entera. Se midió, sobre los tres modelos y con los tres trabajos que hoy
corren **dentro de la petición**:

| Trabajo           | `muro-con-psets` (2 KB) | `Piso 5` (1,5 MB) | Real (**32,7 MB**) |
| ----------------- | ----------------------- | ----------------- | ------------------ |
| `ifc.extraer`     | 116 ms                  | 81 ms             | **1.397 ms**       |
| `cobertura.medir` | 14 ms                   | 91 ms             | **1.529 ms**       |
| `ids.validar`     | —                       | —                 | **668 ms**         |

**Ninguno llega a dos segundos sobre el modelo real de la organización**, y los tres juntos no
llegan a cuatro. Montar Celery para eso sería pagar un **broker, un proceso trabajador, su unidad de
systemd y una forma nueva de fallar en silencio** —un trabajo encolado que nadie procesa no da
error: simplemente no pasa nada, que es la lección que ya está escrita en `apps/core/jobs.py`— a
cambio de ahorrar segundo y medio.

**Y la «conversión» de la fila ya no vive aquí.** `F0.6` la movió a un **Web Worker del navegador**:
son 9,5 s para el IFC de 32,7 MB y **ninguno de ellos ocurre en el servidor**. La fila se escribió
antes de esa decisión y arrastraba el trabajo más pesado de los tres.

**Qué haría falta para que proceda, dicho como número y no como intuición**: que un trabajo pase de
**30 s** —la cuarta parte del `timeout` de gunicorn— sobre un archivo que la organización recibe de
verdad. Los candidatos son un IFC federado bastante mayor que 32,7 MB, o un IDS de proyecto con
cientos de especificaciones en vez de las que genera `F3.10`. **Ninguno de los dos existe todavía
como archivo que mirar**, y es la misma razón por la que `F4.6` sigue en espera.

Hasta entonces, el `timeout` de 120 s de `config/gunicorn.conf.py` deja de ser un parche con fecha y
pasa a ser holgura: **dos órdenes de magnitud** sobre lo medido.

### `F3.12`: una vista guardada que no se le puede pasar a nadie (2026-08-28)

**Es el objetivo de salida de esta fase aplicado a lo que quedaba dentro de la pestaña.** Las vistas
guardadas sobrevivían a recargar la página y **no salían del equipo** —lo decía el pie de su propia
sección—, así que dos personas revisando el mismo modelo no podían mirar lo mismo. Coordinar es
exactamente eso, y la limitación pasó de aceptable a molesta en cuanto la coordinación se metió
dentro del visor.

**No es «la misma vista, pero en el servidor», y esa es la decisión de fondo.** Una vista local está
escrita en el idioma de **esa sesión**: coordenadas de la escena —con el eje Y hacia arriba, que es
una convención de Three.js— y `localId` de Fragments para lo oculto, que es el identificador del
motor y cambia entre versiones del modelo. `savedView.ts` ya lo dejó anotado hace días: su clave
**no sirve** para un viewpoint. Guardar eso en una base de datos sería meter dos convenciones
internas en un dato que va a durar más que ellas.

Una vista compartida está escrita en el idioma del **modelo**:

| Qué        | Cómo viaja                                                          |
| ---------- | ------------------------------------------------------------------- |
| La cámara  | Ya en el sistema del IFC — lo mismo que escribe `F4.1`              |
| Lo apagado | Por **GUID**, con la forma de un `Visibility` — lo que cerró `F4.7` |
| Los cortes | Normal y origen, también en el sistema del IFC                      |

O sea: **es un viewpoint de BCF con nombre y con cortes**, y eso no es casualidad — es la
consecuencia de exigirle que sobreviva a quien la escribió. **Por eso `F4.7` iba primero**, aunque
en el orden de valor esta estaba antes: sin la visibilidad por GUID, una vista compartida solo
habría podido llevar la cámara.

**Las locales no desaparecen, y las dos secciones conviven a propósito.** Una vista local es de
trabajo —«déjame esto como está mientras almuerzo»— y no cuesta nada: ni viaje al servidor ni
permiso que pedir. Compartir es un acto explícito. Puestas una debajo de la otra en el navegador, la
diferencia se lee sin explicarla.

**Se comparte lo que se está mirando, no una vista local ya guardada.** No es una simplificación: a
una vista local **le faltan dos datos** para armar un viewpoint —el «arriba» real de la imagen y el
alto de la vista ortogonal—, que son justo los que BCF exige y los que una vista de trabajo no
necesita. Convertirla obligaría a inventarlos.

Tres decisiones más que conviene tener escritas:

- **El modo de navegación no viaja.** Es cómo se mueve uno, no lo que se ve, y quien recibe la vista
  está mirando, no recorriendo: ponerlo cambiaría el control del ratón de otra persona sin que nadie
  se lo pidiera. La proyección sí, porque una ortográfica y una perspectiva del mismo sitio **no
  muestran lo mismo**.
- **Los cortes se descartan uno a uno; la cámara, entera.** Son independientes entre sí, y perder
  una vista completa porque un corte venía mal sería peor que aplicarla con los que valen. La cámara
  no admite eso porque media cámara no se dibuja — y una vista sin cámara se rechaza al compartirla,
  en vez de dejar en la lista del otro una fila que se pulsa y no hace nada.
- **La borra quien la compartió, y nadie más.** `delete_vistadeproyecto` dice «puede borrar vistas»,
  no «puede borrar **estas**»: sin la comprobación del autor, cualquiera con el permiso quita la
  vista que otro dejó preparada para una reunión.

El contrato de permisos, sin atajos: `view_vistadeproyecto` está en la lectura del proyecto —también
para el **mandante**, porque una vista es como se le enseña algo a alguien y él es a quien más se le
enseña— y `add_`/`delete_` van con quien trabaja el modelo. Con su prueba de 403 y su prueba de
aislamiento entre organizaciones, que son dos preguntas distintas.

**Comprobado en el navegador sobre `Piso 5.ifc`**, con dos elementos apagados y un corte puesto: se
captura, se deshace todo —modelo entero, sin cortes, cámara en otro sitio— y al aplicar la vista
vuelven los dos ocultos, el corte y la cámara. La posición guardada en el sistema del IFC era
`(13,404, −10,32, 14,863)` y la cámara acabó en `(13,404, 14,863, 10,32)` de la escena, que es
`ifcAEscena` exacta.

**439 pruebas en la API con 94,21 % de cobertura y 251 en `bim-core`**, gate en verde.

### `F3.11`: los tres huecos entre «pasa el gate» y «arranca en la VM» (2026-08-28)

Los tres se habían localizado leyendo el despliegue, no ejecutándolo, y los tres tienen la misma
forma: **la aplicación funciona en el equipo de desarrollo justamente porque ahí no se usan.**

- **`psycopg` no estaba declarado.** `DB_ENGINE=postgresql` reventaba al arrancar, y peor que
  reventar: el mensaje de Django nombra **`psycopg2`** —el paquete anterior—, así que manda a
  instalar el que no es. Ahora psycopg 3 y gunicorn viven en un grupo `deploy` aparte —ninguno de
  los dos pinta nada en un equipo con SQLite, y gunicorn ni siquiera instala en Windows— y
  `base.py` comprueba el driver **al cargar los ajustes**, con el comando exacto en el mensaje. La
  diferencia importa: fallando en la primera consulta, `systemctl start` informa `active` sobre un
  servicio que no sirve.
- **No había servidor de aplicación.** `config/gunicorn.conf.py`, con socket de UNIX en vez de
  puerto —un puerto local deja saltarse el proxy, y con él la terminación TLS y las cabeceras que
  pone— y `timeout` en **120 s**, no en los 30 de fábrica: convertir un IFC grande pasa del minuto
  y con el tiempo por defecto gunicorn mata al worker a mitad y sale un 502 sin explicación. Es un
  parche con fecha: lo que tarde más que eso es trabajo de `F3.4`.
- **No había `/health/` ni unidades.** Ahora hay las dos cosas, y una decisión escrita en cada una.

**`/health/` es la única ruta sin login, y por qué eso no rompe el contrato de `AGENTS.md`.** La
regla del `view_*` explícito se sostiene porque una superficie de lectura entrega **datos de
alguien**; esta no entrega ninguno. Contesta una sola pregunta —¿este proceso puede atender?— y la
tiene que poder hacer quien todavía no puede autenticarse. Por lo mismo **no dice de más**: sin
autenticar la respuesta no lleva rutas, ni versiones, ni el texto de una excepción, y hay una
prueba que lo comprueba con un nombre de carpeta reconocible. El detalle va al journal.

Comprueba las **tres formas en que esta VM se rompe callada**, y no todas pesan igual:

| Comprobación             | Si falla              | Por qué                                                                                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos            | `503`                 | Con `CONN_MAX_AGE` puesto hay que preguntarle de verdad: la conexión puede seguir abierta contra un servidor que ya se fue              |
| Directorio de documentos | `503`                 | **Es el que destruye datos en silencio.** Sin el montaje, Django no falla: escribe en el disco local y lo subido se pierde al reiniciar |
| Visor construido         | `200` con `degradado` | El portal, el registro y la API funcionan sin el SPA. Un 503 sacaría de servicio la aplicación entera por una mitad que no lo está      |

**Las unidades: dos decisiones que se pagan si se hacen de otro modo.** `Type=notify` y no `simple`
—con `simple`, systemd da por arrancado el servicio en cuanto el proceso existe, o sea antes de que
Django cargue los ajustes, y un `SECRET_KEY` que falta se ve como `active`—; y el gunicorn del
entorno en el `ExecStart`, **no `uv run`**, que sincroniza el entorno antes de ejecutar y con
`ProtectSystem=strict` el disco está de solo lectura: el servicio no arrancaría, o peor, arrancaría
a veces.

Todo el procedimiento, con lo que hay que cambiar del `.env` y cómo comprobarlo, en
[docs/DEPLOY.md](docs/DEPLOY.md). **404 pruebas y 94,18 % de cobertura**, gate en verde. Las
líneas 89–101 de `base.py` —la comprobación del driver— salen sin cubrir a propósito: se ejercitan
en un proceso aparte, que es la única forma de probar algo que ocurre al **importar** el módulo de
ajustes, y coverage no sigue subprocesos.

**Lo que queda del bloque y no es código**: qué dominio, si comparte VM con AeroControl y
AeroPlanner, y las copias de seguridad —de las que no hay nada escrito, y son dos cosas separadas a
propósito: la base y el directorio de documentos—.

### `F3.5` cerrada: el modelo cumple o no el requisito del proyecto (2026-08-26)

**Es lo que este plan llamaba «lo que separa un visor de una herramienta de control».** Revisar a
mano si cada elemento trae el pset que el mandante exigió no escala —702 vigas por modelo— y un IDS
lo verifica en segundos.

**IDS es el estándar de buildingSMART**, así que el requisito es **interoperable**: el mismo archivo
lo entiende Solibri, lo entiende BlenderBIM y lo entiende esto. Un requisito escrito en una tabla
nuestra no lo entiende nadie más. `ifctester` (LGPL-3.0) se usa **como librería**, que es lo que
`AGENTS.md` permite.

**Dos modelos, y la separación importa.** `RequisitoIds` es del **proyecto** —el mandante exige lo
mismo a todos los modelos de la obra, y tenerlo por entregable obligaría a copiarlo—. `ValidacionIds`
es **un acto con su fecha**: el requisito cambia a mitad de proyecto, y entonces la misma revisión
cumple ayer y no cumple hoy. Guardar la corrida con su fecha es lo que permite contestar _«cumplía
cuando se aprobó»_.

**Tres decisiones que hacen que el resultado no mienta**, y las tres salieron de mirar el informe
crudo de `ifctester` antes de escribir nada:

1. **«No aplica» no es «cumple».** Una especificación cuyo conjunto de elementos no existe en el
   modelo sale de `ifctester` con `status: True` y `is_skipped: True`. Contarla como cumplida diría
   que el modelo satisface un requisito que **nunca se comprobó**, y es justo el número que alguien
   mira antes de aprobar una etapa. Aquí son **tres estados**: cumple, falla y no aplica.
2. **Si no aplicó ninguna, no se cumple nada.** Un IDS escrito para otra disciplina da cero
   comprobaciones y «todo bien»; lo que corresponde decir es que no se comprobó nada.
3. **El informe crudo no se guarda.** Son **944 KB** para el modelo de 24 MB: `ifctester` incluye la
   línea STEP completa de cada elemento que falla, 702 veces. Se guarda un resumen con un tope de
   fallos por requisito, y **el conteo total va aparte**, así que la cifra que se informa es la
   verdadera aunque la lista esté recortada.

**Y el ciclo se cierra donde tenía que cerrarse.** Cada fallo lleva el **GUID** del elemento —la
identidad estable, la que viaja en un BCF— así que desde el fallo se abre **una observación sobre esa
viga**, con responsable y fecha. Es lo que convierte «702 vigas sin su fase» en trabajo asignado. El
formulario de observación acepta el ancla en el modelo, comprobando la forma del GUID: 22 caracteres,
que es lo que mide uno de verdad.

**Comprobado por HTTP contra el servicio corriendo, con el IFC real de 23,6 MB:**

| Qué                          | Resultado                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Validar el modelo de 23,6 MB | **1,7 s**, incluida la carga del archivo                                            |
| El veredicto en pantalla     | «1 de 2 especificaciones fallan · 1 no aplicaron a este modelo»                     |
| El detalle                   | «Las vigas llevan su fase de obra — 702 de 702», con el motivo                      |
| El enlace a la observación   | Lleva el GUID real: `2x9ibDgrvAu8y4Yd$Ug4Qu`                                        |
| Un **mandante**              | Ve la lista; **sin** enlace de subir, **403** en el formulario y **403** al validar |
| Un IDS que no se puede leer  | **400** al subirlo, y **nada llega al disco**                                       |

23 pruebas nuevas. **Y `F3.4` (Celery) sigue sin hacer falta**: 1,7 s en la propia petición para el
tamaño que recibe un control documental. Queda para los trabajos que de verdad tarden.

> **Un detalle que no se puede arreglar y va dicho**: el motivo de cada fallo —«The required property
> set does not exist»— viene de `ifctester` **en sus palabras**, en inglés. Traducir los mensajes de
> una librería obligaría a mantener un mapa de sus cadenas, que se rompe en su siguiente versión sin
> avisar.

### `F3.3` cerrada: lo que el IFC declara de sí mismo (2026-08-26)

El visor ya leía las unidades para poner el símbolo al lado de un número, y las olvidaba al cerrar
la pestaña. El registro necesita otra cosa: **poder contestar sin abrir nada**. Ahora, al subir un
IFC, la revisión queda sabiendo su **esquema**, el **proyecto** que declara, su **unidad de longitud
con el factor a metros**, si está **georreferenciado y por qué vía**, y **cuántos elementos trae y de
qué tipos**. Se ve en el expediente, al lado del sha.

**Y hay un dato que solo se puede dar aquí**: si el archivo está georreferenciado. Fragments aplica
el factor de unidad a la geometría y **descarta la declaración**, así que después de convertir ya no
se puede preguntar.

`ifcopenshell` es **LGPL-3.0** y se usa **como librería**, que es exactamente lo que `AGENTS.md`
permite. Medido: **1,1 s** para el IFC real de 23,6 MB, así que se lee en la propia subida y no hace
falta un trabajo en segundo plano —`F3.4`— para el tamaño que recibe un control documental. El campo
es un `JSONField`, así que el día que llegue un federado que tarde, lo único que se mueve es dónde
se llama.

**Los dos defectos que encontró la primera pasada sobre los modelos reales**, y ninguno se habría
visto con un solo archivo de muestra:

1. **`IfcMapConversion` no existe en IFC2X3**, y pedirlo allí no devuelve una lista vacía: **levanta**.
   Eso tiraba la extracción entera y convertía «este IFC2X3 no tiene conversión de mapa» —que es lo
   normal— en «no se pudieron leer los metadatos». El archivo de muestra en IFC4 funcionaba y los dos
   en IFC2X3 no, **y la mayoría de los IFC de obra siguen siendo IFC2X3**.
2. **`Piso 5.ifc` declara su sitio en `(0, 0, 0, 0)`** y salía como georreferenciado. Latitud y
   longitud exactamente cero no son una ubicación: son **el marcador de posición** que escriben Revit
   y otros cuando nadie fijó el emplazamiento. Creérselo manda a buscar el edificio a la isla nula,
   en el golfo de Guinea.

Y una tercera que se atajó al escribirlo: en IFC una latitud es una tupla de enteros y **el signo va
solo en el primero**. `(-33, 26, 15)` es 33° 26′ 15″ **sur**; sumar los términos con su signo daría
una coordenada en otro hemisferio, y eso no se ve hasta que el modelo aparece en el mar.

**Lo que se dice en pantalla incluye el «no».** «Sin georreferenciar» va en negrita en el expediente,
porque es la respuesta que hace falta **antes** de prometer una vista sobre el terreno (Fase 6), y
callarla obliga a descubrirlo con el modelo ya cargado en el sitio equivocado.

11 pruebas nuevas, con IFC escritos a mano —uno por caso, incluido el sitio en cero— porque un
archivo real no permite comprobar el caso raro. Y **la extracción nunca levanta**: un IFC que no se
puede leer sigue siendo un entregable válido, se descarga y se emite; rechazar la subida por no
poder leerle los metadatos sería confundir dos cosas.

### `F3.1` y `F3.2` estaban hechas y el tablero decía que no (2026-08-26)

**El tablero miente en las dos direcciones**, que es la lección que `AGENTS.md` ya tenía escrita.
`F3.6`–`F3.9` construyeron el servicio y con él quedaron cubiertas estas dos filas, que nadie
volvió a mirar:

- **`F3.1`** — `services/api` es Django 6 + DRF: **proyectos** (`Proyecto`, `Disciplina`,
  `PaqueteWBS`), **versiones** (`Revision`, que nunca se sobreescribe), **usuarios y permisos**
  (`apps/accounts` con la matriz de roles como dato y el contrato de permisos con su prueba de 403),
  y la API del visor con `ViewModelPermissions` y su `api-token` con throttle propio.
- **`F3.2`** — `apps/documents/storage.py` valida **extensión, firma real del archivo y tamaño**
  (200 MB), y **el nombre del cliente nunca llega al disco**: la clave se compone del proyecto, el
  entregable y el sha256 del contenido.

> **Con un matiz que conviene decir en voz alta.** La fila de `F3.1` nombra «modelos» como entidad
> propia, y no la hay: **un IFC vive como `Revision` de un `Entregable`**. No es una omisión, es la
> forma de ISO 19650 que trajo la Fase 8 — un modelo _es_ un entregable que se emite por revisiones,
> con su código de idoneidad y su responsable— y es lo que permite que abrirlo en el visor sea la
> misma costura que abrir un plano (`F8.8`). La fila se escribió antes de que la Fase 8 existiera.

**Y el criterio de aceptación de la fase no tenía prueba.** «La versión anterior sigue recuperable»
es la que contesta _«¿qué decía el plano cuando se aprobó la etapa?»_, y no estaba comprobada en
ningún sitio. Ahora sí, en `test_versiones.py`, y no por lo obvio: se comprueba que la anterior
**se siga descargando**, que devuelva **sus propios bytes** —si la clave se derivara del entregable
en vez del contenido, la nueva habría pisado a la vieja y las dos descargas darían lo mismo con el
registro diciendo que son distintas— y que **relevar no sea borrar**. Y de paso que subir dos veces
el mismo archivo deje **dos revisiones en el registro y un solo archivo en el disco**, porque la
clave sale del contenido.

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

| #       | Tarea                                                                                         | Estado                                              |
| ------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `F4.1`  | Temas de observación con viewpoint: **cámara** y elementos involucrados por GUID              | ✅                                                  |
| `F4.7`  | Visibilidad en el viewpoint: lo apagado y lo aislado, traducido de `localId` a GUID           | ✅                                                  |
| `F4.8`  | **Ver y abrir la observación dentro del visor**: la lista lleva la cámara y selecciona        | ✅                                                  |
| `F4.2`  | Metadatos y ciclo de vida: prioridad, responsable, fecha de vencimiento, estado               | ✅                                                  |
| `F4.3`  | Comentarios ligados al viewpoint, con historial                                               | ✅                                                  |
| `F4.4`  | **Exportar BCF 2.1** — escrito a mano, leído de vuelta por `bcf-client` en las pruebas        | ✅                                                  |
| `F4.10` | **La foto del hallazgo** en el viewpoint: sin ella, el otro extremo abre una lista de títulos | ✅ ver abajo                                        |
| `F4.5`  | Marcado sobre la vista embebido en el viewpoint — **las cotas viajan como `<Lines>`**         | ◐ la mitad medida; falta el trazo libre — ver abajo |

**`F4.2` y `F4.3` las cerró la Fase 8, no esta.** Fue la apuesta del replanteo —«las
observaciones comparten modelo con los temas BCF», `F8.2`— y salió: `Observacion` ya trae
prioridad, responsable, vencimiento, estado y resolución, y `Comentario` el historial. No hay
tabla nueva que escribir; el tablero decía ⬜ sobre código que existe desde hace días.

### `F4.5`: las cotas ya dibujadas **son** el marcado (2026-09-02)

**El BCF llevaba a dónde mirar, qué se veía y una foto. Lo que no llevaba es qué señalaba quien
anotó.** El título dice «la viga del eje C choca con el ducto» y en la pantalla había una cota de
4 cm entre las dos: **ese número es el hallazgo**, y se quedaba en el navegador de quien lo
encontró.

**La decisión de fondo, y no es un atajo.** BCF 2.1 guarda el marcado de un viewpoint como
**segmentos de recta en coordenadas del modelo** —`<Lines>`— y el visor ya tiene puntos en
coordenadas del modelo, porque medir consiste precisamente en poner puntos ahí. Convertir las cotas
visibles en líneas es **ensamblar dos piezas que existen**, no construir una tercera. Y lo que sale
es lo que el otro extremo entiende: Solibri y Navisworks dibujan esas líneas sobre su propio modelo,
así que la cota viaja **en tres dimensiones** y no como un trazo pintado sobre una imagen.

| Medida        | Puntos | Segmentos                          |
| ------------- | ------ | ---------------------------------- |
| Distancia     | 2      | 1 — el propio tramo medido         |
| Perpendicular | 2      | 1 — del punto al pie en la cara    |
| Ángulo        | 3      | 2 — los dos lados desde el vértice |
| Área          | n ≥ 3  | n — el contorno, **cerrado**       |

Tres decisiones que conviene tener escritas:

- **Solo las cotas visibles.** Una cota apagada es una que quien anota decidió no mostrar, y
  mandarla sería devolverle al otro lo que el autor quitó de la pantalla.
- **Con el tope alcanzado se deja fuera la medición entera**, no los segmentos que sobran. Medio
  contorno de un área es una polilínea abierta que afirma una forma que nadie dibujó — mismo
  criterio con el que la visibilidad prefiere callarse antes que apagar el modelo. Y **sigue
  aceptando las que sí caben después de una que no**: perder una cota pequeña detrás de un contorno
  enorme sería peor.
- **Los puntos se guardan al medir**, en el mismo relevo que ya usaban los dibujos
  (`visualesPendientes`). La alternativa era ir a buscarlos dentro de los objetos de la librería,
  que es leer sus entrañas y romperse en su siguiente versión.

**El orden de los hijos importó por tercera vez** en `bcf.py`: el XSD declara `Components`,
`OrthogonalCamera`, `PerspectiveCamera`, **`Lines`**, `ClippingPlanes`, `Bitmap`. Hay una prueba que
mete cámara y marcado juntos justamente para que el orden no se rompa en silencio.

**Comprobado de las dos formas.** El archivo, con `bcf-client` leyendo el `<Lines>` de vuelta y
sacando sus extremos —incluido el contorno cerrado, donde el último segmento vuelve al primero—. Y
en el navegador sobre `Piso 5.ifc`: una distancia de 4 cm en la escena `(1, 2, 3)` sale como
`(1, −3, 2)` del IFC, que es `escenaAIfc` exacta; una distancia, un ángulo y un área de cuatro
vértices dan **1 + 2 + 4 = 7** segmentos; y apagando el área bajan a 3 y al encenderla vuelven a 7.

**Lo que falta de la fila, y por eso queda a medias:** el **trazo libre** —la nube, la flecha y el
texto que se dibujan a mano sobre la vista—. Eso es una herramienta de dibujo en 3D, no una
conversión, y es la mitad que no se puede sacar de algo que ya existe. Con el marcado ya viajando y
la instantánea en su sitio, entra cuando el usuario diga que la cota no le alcanza.

### `F4.10` cerrada: el BCF salía sin una sola foto (2026-08-28)

**`F4.4` estaba marcada ✅ y le faltaba lo primero que se ve.** Todo visor del mercado —Solibri,
Navisworks, BCF Manager— dibuja la lista de temas **con su miniatura al lado**, y es lo que hace que
quien recibe el archivo sepa de qué se le habla antes de cargar el modelo. Los nuestros salían sin
ninguna: el mandante abría una lista de títulos.

**La trampa está en cuándo se lee el lienzo, y no da error.** El búfer de dibujo de WebGL se borra
en cuanto el navegador compone el cuadro; leerlo un instante tarde devuelve un rectángulo vacío y
`toDataURL` **entrega un PNG perfectamente válido**, todo del mismo color. Así que se dibuja y se lee
en el mismo turno, sin un solo `await` en medio.

**Y aun así se comprueba lo que salió**, porque una miniatura en blanco dentro de un BCF afirma «así
se ve el problema» sobre nada, y eso es peor que no llevar ninguna. `pareceEnBlanco` vive en
`bim-core` —se prueba con píxeles escritos a mano, sin navegador— y mira el rango de color de una
muestra: si la imagen es un rectángulo liso, el visor devuelve `null` y la nota se guarda sin foto.

**El oráculo, comprobado en el navegador**: con el modelo a la vista, un PNG; con **todo el modelo
apagado** —o sea, solo el fondo— la misma llamada devuelve `null`. Las dos cosas a la vez prueban que
se están leyendo píxeles de verdad y que la comprobación hace su trabajo.

Lo demás son las reglas de siempre del registro, sin excepciones nuevas:

- **La firma manda, no la cabecera del `data:`**, que la escribe quien manda. Es la misma
  comprobación con la que se cae `virus.exe` renombrado a `plano.pdf`, y se reutiliza `storage`
  entero en vez de escribirla otra vez. Un `data:image/svg+xml` —que lleva scripts— no entra.
- **En la fila va la clave, nunca los bytes.** Un `data:` de un megabyte dentro de un registro lo
  vuelve imposible de listar y se duplica en cada copia de la base. La imagen vive donde viven los
  documentos, con su clave por sha256 — así **dos notas tomadas desde la misma pantalla no duplican
  el archivo**, y hay una prueba que lo dice.
- **Nada de esto puede costar el hallazgo.** Una imagen ilegible, un disco lleno o un montaje de
  solo lectura dejan la nota guardada sin foto. Y un archivo que ya no está en el disco **no tumba
  la exportación del proyecto entero**: ese tema sale sin miniatura y los demás salen enteros.

Medido sobre el IFC real de 32,7 MB con el lienzo a 1005 × 773: **100 ms** para capturar y **138 KB**
de PNG. Un BCF de treinta temas queda en unos cuatro megas, que es un correo.

**`F4.1`: el ancla por GUID, la cámara, la visibilidad —`F4.7`— y la foto —`F4.10`—.**

Con un modelo abierto desde el registro, la ficha del elemento ofrece «Observar este elemento»
y lleva al formulario con la revisión, el GUID y **el punto de vista de ese momento**. El
enlace no existe en tres casos, y los tres significan «no hay dónde anotarlo»: el modelo se
abrió del disco, el rol no puede abrir observaciones —lo contesta el servidor en los
metadatos, no el visor por adivinanza—, o el elemento no trae GUID válido.

**La cámara exigía una medición antes de exportarse**, y esa era la razón de que `F4.4` no la
escribiera: la escena del visor tiene el eje **Y** hacia arriba y BCF espera las coordenadas
del IFC, con **Z**. Exportar la posición sin la transformación produce un BCF que abre mirando
bajo tierra, que es peor que uno sin cámara: afirma algo falso.

La transformación **ya estaba en el repositorio y comprobada**:
[grid.ts:61](packages/viewer/src/grid.ts) dibuja los ejes de replanteo leyendo el IFC y
poniéndolos en la escena como `(x, cota, -y)`, y los ejes caen sobre el modelo — si fuera otra,
las letras aparecerían a noventa grados. La misma la usa el plano DXF de referencia, que calza
con error de milímetros. De ahí sale `escenaAIfc`, en `bim-core`, con sus pruebas.

> **Y quedó verificado de punta a punta el 2026-08-28.** Esa evidencia era **indirecta**: los ejes
> cayendo sobre el modelo dicen que la transformación es correcta para dibujar, no que lo sea para
> situar una cámara. El usuario abrió una observación en su navegador y **la cámara no queda bajo
> tierra**. Es la comprobación que no se podía hacer desde el entorno de trabajo —su panel no
> compone fotogramas— y cierra la duda: `escenaAIfc` e `ifcAEscena` valen de ida y de vuelta.

**Y el vector «arriba» se lee del cuaternión de la cámara, no se supone.** La tentación es
pasar el eje vertical del mundo, y con la cámara en planta —lo que hace el Modo 2D— eso es
paralelo a la dirección de vista: una cámara imposible que BCF rechaza. Leyéndolo no hay
convención que elegir ni caso degenerado que resolver a dedo.

| #      | Tarea                                                                               | Estado       |
| ------ | ----------------------------------------------------------------------------------- | ------------ |
| `F4.7` | Visibilidad en el viewpoint: lo apagado y lo aislado, traducido de `localId` a GUID | ✅ ver abajo |

### `F4.7` cerrada: el viewpoint decía «se ve todo» y a veces era falso (2026-08-28)

**Era la otra mitad del punto de vista.** `F4.1` cerró la cámara —desde dónde se miraba— y el BCF
seguía saliendo con `DefaultVisibility="true"` y las excepciones vacías. Con la nota tomada sobre un
modelo entero eso es cierto; **con el hallazgo encontrado aislando una planta es una afirmación
falsa**, y de la peor clase: quien abre el archivo en Solibri ve el edificio completo con el
problema tapado justo por lo que se había apagado para verlo.

**BCF no guarda «lo que se ve»: guarda un valor por defecto y sus excepciones**, y los dos lados
describen la misma pantalla.

| `DefaultVisibility` | Qué significa                                           |
| ------------------- | ------------------------------------------------------- |
| `true`              | Se ve todo **menos** los componentes de `Exceptions`    |
| `false`             | No se ve nada **salvo** los componentes de `Exceptions` |

Lo que cambia entre los dos es **cuántos componentes hay que escribir**, y ahí está la única
decisión de fondo: **se escribe el lado corto**. Apagando tres vigas de un modelo de veinte mil
elementos, el lado `true` escribe tres líneas y el `false` escribiría 19 997; aislando una planta es
al revés. La regla vive en `bim-core` con sus pruebas, y **recibe cuentas y no listas a propósito**:
resolver un GUID cuesta una consulta por elemento, así que el visor cuenta primero y **traduce solo
el lado que va a escribir**. Tres búsquedas en vez de veinte mil.

**Y hay un tope de 5.000 excepciones**, que no es del formato —BCF no pone ninguno— sino el punto en
que el archivo deja de ser útil. Pasado el tope por los dos lados no se escribe visibilidad y el
viewpoint vuelve al modelo entero, que **es lo honesto**: uno que ningún visor termina de leer no
informa de nada. El mismo número está en `apps/documents/visibilidad.py`, que es quien lo hace
cumplir de verdad — lo que llega al servidor lo escribe cualquiera, igual que la cámara.

**El peor archivo posible se comprueba explícitamente**: `DefaultVisibility="false"` con la lista
vacía es un viewpoint que **apaga el modelo entero y se abre en negro**. El validador lo descarta,
el exportador lo reescribe como modelo entero, y las dos cosas tienen su prueba.

**Va en su propio campo y no dentro de `punto_de_vista`.** Son dos datos con vidas distintas: la
cámara se descarta entera si un vector no es unitario, la visibilidad se limpia excepción por
excepción. Mezclados, una cámara mala se llevaría por delante la visibilidad buena.

**Y también vuelve.** Abrir la observación desde el panel de coordinación aplica la visibilidad
**antes** de la cámara —así el encuadre se calcula sobre lo que va a quedar en pantalla, y no hay
parpadeo de ver el modelo entero y que se apague medio segundo después—. Lo apagado por el viewpoint
se anota en el estado de la aplicación aunque el elemento no aparezca: sin eso, `hasHidden` daría
`false` con medio modelo apagado y la barra de estado no ofrecería la vuelta.

**Lo que no viaja por la URL, y es una decisión.** `urlDeNuevaObservacion` —el formulario de página
completa— lleva la cámara y **no** la visibilidad: una cámara son doscientos caracteres y una
visibilidad puede ser miles de GUID, y los navegadores y los proxys cortan las URL largas **sin
avisar**. Iría por el cuerpo del POST, que es el camino de la tarjeta flotante.

**Comprobado de las dos formas.** El archivo, con `bcf-client` —el lector de buildingSMART— leyendo
de vuelta los cuatro casos: sin dato, lo apagado a mano, el aislamiento y la visibilidad a medias. Y
el viaje de ida y vuelta en el navegador sobre `Piso 5.ifc`, 564 elementos:

- Tres apagados → `porDefecto: true` con tres GUID → "Ver todo" (cero ocultos) → aplicar → **los
  mismos tres**.
- Un elemento aislado → 563 ocultos y 1 visible → elige el lado corto, `porDefecto: false` con **un**
  GUID → aplicar → exactamente ese elemento a la vista.

**425 pruebas en la API con 94,28 % de cobertura y 240 en `bim-core`**, gate en verde.

**Y la importación quedó fuera de `F4.4` a propósito**, así que la fila dice «Exportar» y no
«Exportar e importar». Exportar es lo que desbloquea al mandante hoy; importar exige decidir
qué gana cuando el BCF que vuelve contradice lo que hay acá —y eso es una política de fusión,
no un parser—. Entra como `F4.6` cuando haya un BCF de vuelta de verdad que mirar.

| #      | Tarea                                                                                  | Estado |
| ------ | -------------------------------------------------------------------------------------- | ------ |
| `F4.6` | Importar BCF 2.1: reconciliar por GUID de tema, con política escrita para el conflicto | ⬜     |

**Oráculo, y es el que manda:** un BCF exportado por AeroBim **abre en Navisworks
o Solibri** con su viewpoint intacto, y uno generado por ellos abre aquí. Un BCF
que solo se entiende consigo mismo no es interoperabilidad, es un formato propio
con extensión prestada.

> **Lo que sí se verificó, y lo que no.** Las 20 pruebas de `test_bcf.py` leen el archivo con
> **`bcf-client`, la implementación de referencia de buildingSMART** —instalada porque la trae
> `ifcopenshell`—, no con nuestro propio código: el GUID del elemento, el correo del
> responsable, los comentarios con su historial y la ausencia de cámara sobreviven el viaje de
> ida y vuelta. **Eso no es lo mismo que el oráculo de arriba.** Navisworks y Solibri no corren
> acá; que la implementación de referencia lo parsee es evidencia fuerte, y el oráculo sigue
> abierto hasta que alguien lo abra en uno de los dos.

---

## FASE 5 — Detección de interferencias

**Objetivo de salida:** las interferencias entre disciplinas se encuentran solas y
llegan a la coordinación como temas, no como una lista en una planilla.

| #      | Tarea                                                                                  | Estado                                             |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `F5.1` | Definir grupos de comparación (A vs B) por filtros de tipo, disciplina o planta        | ◐ por selector desde el comando; falta la pantalla |
| `F5.2` | Ejecutar `ifcclash` como job de backend, con tolerancia de holgura configurable        | ✅ ver abajo                                       |
| `F5.3` | Resultados navegables: la lista lleva la cámara al conflicto y aísla los dos elementos | ✅ **sale de la Fase 4** — ver abajo               |
| `F5.4` | Convertir un resultado en tema BCF de la Fase 4, con su viewpoint ya apuntado          | ✅ ver abajo                                       |
| `F5.5` | Agrupar y silenciar falsos positivos, y conservarlos entre corridas                    | ✅ silenciar sí; agrupar por proximidad, no        |

**Oráculo:** un conjunto de prueba con interferencias conocidas y colocadas a
propósito; se cuentan las encontradas y las perdidas. Contra software comercial si
hay acceso a una licencia.

`F5.5` decide si la funcionalidad se usa o se abandona. Una detección cruda sobre
dos disciplinas reales devuelve cientos de conflictos, la mayoría irrelevantes; si
cada corrida vuelve a mostrar los mismos falsos positivos ya descartados, nadie
abre la herramienta una segunda vez.

### La Fase 5, medida y con el oráculo escrito (2026-09-02)

**Primero el oráculo, que es lo que el plan pedía.**
[`interferencias-a-proposito.ifc`](apps/web/public/samples/interferencias-a-proposito.ifc) —un muro
y cuatro pilares, con las coordenadas de cada uno escritas dentro del propio archivo— y **los cuatro
casos, no solo el que choca**, porque un detector que encuentra la interferencia buena y además tres
falsas es peor que ninguno:

| Elemento       | Debe salir                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `PILAR-CHOCA`  | **Sí** — cruza el muro de verdad                                                      |
| `PILAR-LEJOS`  | No — tres metros al este                                                              |
| `PILAR-ARRIBA` | No — **misma huella en planta, otro nivel**. Delata a un detector que compara plantas |
| `PILAR-ROZA`   | Solo admitiendo el roce — apoya contra la cara sin penetrar                           |

**`ifcclash` acierta los cuatro**: encuentra uno con el roce descartado y dos admitiéndolo. Se usa
**como librería y sin copiar una línea**, que es lo que `AGENTS.md` permite con LGPL-3.0.

**`F5.2`: y tarda de verdad.** Es el primer trabajo de este repositorio que se acerca al umbral que
dejó escrito `F3.4`:

| Comparación                                      | Tiempo     | Encontradas |
| ------------------------------------------------ | ---------- | ----------- |
| El fixture (1 muro vs 4 pilares)                 | 30 ms      | 1           |
| `Piso 5`: 470 proxies vs 10 puertas              | 431 ms     | 6           |
| El grande: 805 `IfcMember` vs 34 `IfcColumn`     | **15,7 s** | 3           |
| Cruzando los dos: 470 proxies vs 805 `IfcMember` | **20,0 s** | 35          |

Veinte segundos dentro de una petición no se sostienen, así que la corrida entra por un **comando de
gestión** que deja su fila en `JobRun` — porque un trabajo que deja de correr no da error, y la fila
es la única forma de notarlo. **El disparador desde la pantalla es lo que reabre `F3.4`**, y ahora
con un número y no con una intuición.

**`F5.3` y `F5.4` salieron de la Fase 4 sin escribir una pantalla.** Es la mejor consecuencia del
orden en que se hizo el trabajo: un conflicto **no es una lista aparte, es una observación**, y el
visor ya sabe abrirlas desde `F4.8`.

| Lo que pedía `F5.3`           | De dónde sale                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Llevar la cámara al conflicto | El GUID es el ancla y el visor encuadra el elemento — **sin inventar una cámara**: nadie eligió un punto de vista |
| Aislar los dos elementos      | La visibilidad de `F4.7`: `DefaultVisibility="false"` con dos excepciones                                         |
| Ver de qué se habla           | El marcado de `F4.5`: el segmento entre los dos puntos de contacto                                                |
| Repartirlo                    | Prioridad, responsable y estado, que ya trae `F4.2`                                                               |

**`F5.5`: silenciar, sí; agrupar por proximidad, todavía no.** La mitad que decide si la herramienta
se usa dos veces está hecha, y sale de una sola idea: **la identidad de un conflicto es la pareja de
GUID sin orden**.

- El punto de choque **no sirve** como identidad: cambia con la malla, con la tolerancia y con la
  versión de la librería.
- El orden tampoco: comparar A contra B y B contra A da el mismo conflicto al revés, y con el orden
  contando aparecería dos veces.

Con esa pareja, **descartar un falso positivo es dejar su observación en `descartada`, y la corrida
siguiente no la vuelve a abrir**. `F5.5` sale de `F4.2` sin una tabla nueva. Lo que falta es agrupar
los conflictos vecinos —veinte tornillos contra la misma viga son un problema, no veinte—, y eso
pide ver una corrida real sobre dos disciplinas de verdad.

**Dos trampas de `ifcclash` que no dan un error legible**, y las dos tienen su prueba:

1. **Un grupo vacío la hace reventar** con `TypeError: Attribute of type AGGREGATE OF STRING needs a
python sequence of strs`, que no menciona ni los grupos ni los selectores. Y pasa fácil:
   **`Piso 5.ifc` no tiene un solo `IfcWall`** —son 470 `IfcBuildingElementProxy`—, así que el
   selector obvio no encuentra nada. El envoltorio lo comprueba antes y dice **cuál** de los dos
   lados está vacío, con su selector dentro.
2. **El modo `intersection` exige `check_all`** y sin esa clave lanza un `AssertionError` **sin
   mensaje**, desde un `assert` de la librería.

**Lo que queda de la fase:** la pantalla para definir los grupos (`F5.1` hoy es un selector en la
línea de comandos), el disparador desde la aplicación —que es la decisión de `F3.4`— y el agrupado
por proximidad. **490 pruebas en la API con 94,30 %** y 306 en `bim-core`.

---

## FASE 8 — Control documental y seguimiento

**Agregada el 2026-08-26 a pedido del usuario**, junto con el portal de ingreso. La idea de
conjunto viene de **MineDoc** —el que ya usa la empresa: control de documentos con
transmittals, avance físico del documento y comentarios sobre el propio archivo— construida
aquí, MIT y local-first.

**Objetivo de salida:** que el seguimiento de un proyecto —qué falta, quién lo tiene, qué se
emitió y a quién— viva en un registro y no en la bandeja de correo de alguien.

| #       | Tarea                                                                                                      | Estado |
| ------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| `F8.1`  | **El modelo**: proyecto, disciplina, WBS, entregable, revisión, transmittal, observación, actividad        | ✅     |
| `F8.2`  | **La observación comparte modelo con los temas BCF** de la Fase 4, con dos anclas                          | ✅     |
| `F8.3`  | **Subir y descargar**: validación de firma real, clave por sha256, y el nombre del cliente fuera del disco | ✅     |
| `F8.4`  | **Asignar, avisar y seguir**: correo al asignar, resumen por tramos, y el expediente                       | ✅     |
| `F8.5`  | **Trabajos programados** con su fila en `JobRun` y su vigilante                                            | ✅     |
| `F8.6`  | **Ver y comentar el PDF en el navegador** con EmbedPDF (MIT), sin descargarlo                              | ✅     |
| `F8.7`  | **Emitir el transmittal desde la pantalla**, con carátula y acuse                                          | ✅     |
| `F8.8`  | **El visor y el registro son el mismo producto**: abrir la revisión desde su expediente                    | ✅     |
| `F8.9`  | **La obra existe en la aplicación**: lista, alta y detalle de proyecto y disciplina                        | ✅     |
| `F8.10` | **La puerta entre las dos mitades**: portal de partida, filas que se abren, y el visor con salida          | ✅     |
| `F8.11` | **El tablero gráfico del proyecto**: tarjetas, línea de tiempo, calendario y avance por disciplina         | ✅     |

### `F8.9`: los modelos estaban y la pantalla no (2026-08-28)

**El segundo hueco que no figuraba en ninguna lista.** `apps/projects` tenía sus tres modelos
desde `F8.1` y **ni una vista ni una URL**: un proyecto se creaba entrando al `/admin/` técnico de
Django, y sus disciplinas igual. Con una obra real eso significa que el trabajo empieza fuera de la
aplicación — y que la pregunta «¿dónde sigo?» no tiene entre qué elegir.

**La pantalla de detalle contesta esa pregunta, y por eso su orden no es alfabético**: primero los
entregables sin nada emitido —nombrados uno por uno, no contados—, después las observaciones
abiertas por prioridad, después **el salto directo al visor**, y al final lo que se consulta. Es la
idea del expediente de un entregable subida un nivel: la del proyecto entero.

`bootstrap_roles` no necesitó nada: los permisos de `Proyecto` y `Disciplina` ya estaban en la
matriz de `roles.py`.

### `F8.8`: el hueco que no estaba en ninguna lista (2026-08-26)

**Era el más grande, y no figuraba como tarea.** El visor abría archivos del disco de quien lo
usaba y no sabía nada de proyectos; el registro guardaba revisiones —DXF e IFC incluidos— y no
podía mostrarlas. O sea que _«visualizar y subir documentos todo junto»_, que es lo que el
usuario pidió con esas palabras, **no estaba**: se podían las dos cosas, pero no con el mismo
archivo. La tarjeta «BIM viewer» del portal no tenía ni enlace.

| Decisión                                          | Por qué                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| El SPA en **el mismo origen**, servido por Django | En otro origen harían falta CORS, un token en el navegador y una segunda CSP. Aquí la cookie de sesión ya sirve |
| Y **por una vista**, no por whitenoise            | Un archivo estático se entrega antes de que Django mire quién pregunta: no admite un login delante              |
| **Dos peticiones**: metadatos y luego bytes       | El visor dice _qué_ abre antes de descargar veinte megas, y el nombre no viaja en una cabecera del binario      |
| Vite con `base` **solo al construir**             | En desarrollo la aplicación vive en la raíz de Vite; con prefijo se rompería el flujo de siempre y `diag.html`  |
| La ruta del WASM desde `import.meta.env.BASE_URL` | Escrita a mano pediría `/wasm/`, recibiría el `index.html` y fallaría **dentro del worker**: sin error visible  |

**Y las tres reglas de acceso se aplican también en la API**, no solo en la pantalla. La del
acotado por organización hay que escribirla a mano: una `Revision` **no lleva** el campo
`organizacion` —cuelga de su entregable— y `scope_queryset_to_organizacion` devuelve intacto un
modelo sin el campo, así que confiar en él habría dejado el hueco abierto.

**Comprobado en el navegador con el servidor corriendo:** el plano real del usuario
(`ACAD-Piso 5_Base.dxf`, 1,5 MB) abre desde el registro y aparece como «PLANOS 2D (1)» con sus
capas; el IFC (`Piso 5.ifc`) abre con sus **551 elementos** en el árbol. Sin autenticar,
`/visor/` redirige y la API responde 401. Un `mandante` abre el visor pero tiene **cero
revisiones abribles** y 404 en la `S3` en curso.

> ### Y este bloque dejó accesibles los modelos del cliente sin autenticar
>
> **Vale escribirlo porque es la clase de defecto que se introduce arreglando otra cosa.**
> Publicar `apps/web/dist` como estático dejó los IFC y DXF reales de la organización
> descargables sin entrar: `HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc` devolvía
> **200 y 34 MB**. Vite copia todo lo que hay en `public/`, y ahí viven los archivos de prueba.
>
> `AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era: no
> están confirmados. Lo que faltaba decir es lo otro: **lo que se pone en `public/` se
> publica**, y publicar no es lo mismo que confirmar.
>
> El guardián es `apps/web/scripts/limpiar-dist.mjs`, que corre en cada `npm run build` y es
> una **lista blanca**: una lista de lo prohibido habría funcionado hoy y se habría quedado
> atrás con lo siguiente que alguien deje en `public/`. Y hay una prueba que falla si alguien
> salta el paso.

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

### `F8.7` cerrada: emitir el transmittal desde la pantalla (2026-08-26)

El modelo sabía emitir desde el primer día y estaba probado —no se emite vacío ni sin
destinatario—, pero **el acto solo se podía ejecutar desde una consola**: la pantalla listaba y
nada más. Ahora hay las tres piezas que faltaban:

- **El borrador**: se eligen las revisiones y los destinatarios, y **el proyecto no se pide, lo
  dicen las revisiones**. Pedirlo aparte abre la puerta a un transmittal cuyo proyecto no es el de
  los documentos que lleva, que es contestar mal la pregunta que el transmittal existe para
  contestar. Mezclar revisiones de dos proyectos se rechaza.
- **La carátula**: qué lleva, a quién, el paso a paso derivado del modelo (nunca teclado en la
  plantilla), y **lo que le falta nombrado** — la misma idea del expediente. Los botones solo si
  se pueden ejecutar.
- **Emitir y acusar**: emitir cambia el estado **y avisa**; el acuse cierra el ciclo, y solo sobre
  lo emitido. `Transmittal.acusar()` es nuevo; no guarda quién acusó porque un transmittal va a
  varios y el primero que confirma no habla por los demás — eso va a la auditoría, que admite
  varios.

**El correo lleva la lista de documentos, no solo el enlace.** Quien lo recibe suele leerlo en el
teléfono y en obra: tiene que poder saber qué le mandaron sin entrar.

**Y no se calla a quien no recibió nada.** Emitir tiene consecuencias contractuales, así que la
pantalla dice las dos cosas: cuántos se avisaron y **a quién no se pudo**. Es la misma lección que
`apps/core/mail.py` —el sistema decía «enviado a N» cuando el correo solo se imprimía— aplicada a
su gemelo: decir «emitido» a secas cuando dos de los cinco destinatarios no tienen dirección deja
al emisor creyendo que avisó.

**Comprobado por HTTP contra el servicio corriendo**, con los cuatro roles sembrados:

| Qué                                           | Resultado                                                  |
| --------------------------------------------- | ---------------------------------------------------------- |
| Armar el borrador sin destinatario            | **400**, no se crea nada                                   |
| Armarlo bien                                  | Carátula que ofrece **emitir** y no acusar                 |
| Acusar un borrador                            | Sigue en borrador                                          |
| Emitir                                        | «Transmittal T-1773 emitido, 3 destinatarios avisados»     |
| Un destinatario sin correo                    | «Sin dirección de correo para sin-correo: no se les avisó» |
| Acusar lo emitido                             | La carátula dice acusado                                   |
| Un **mandante** pidiendo el formulario a mano | **403**, y el enlace no se le ofrece                       |
| Un **mandante** intentando emitir             | **403**                                                    |

13 pruebas nuevas, incluidas las dos del contrato: 403 por vista y **aislamiento entre
organizaciones sobre el `POST` de emitir** — sin acotar la consulta, `emitir/<id-de-otra>` no es
una fuga de lectura, es firmar en nombre de otro.

> **De paso salió un defecto latente que el gate no podía ver.** `compilemessages` no recompila
> si el `.mo` es más nuevo que el `.po`, y el `.po` llevaba **una entrada que msgfmt rechaza** —el
> `\n` inicial en el `msgid` y no en el `msgstr` de la paginación—. El binario al día lo tapaba, y
> el error solo aparecía el día que alguien tocara el catálogo. Arreglada la entrada y **añadido
> `compilemessages` al gate borrando el `.mo` antes**, que es lo único que lo comprueba de verdad.

### `F8.6` cerrada: el documento se ve y se comenta en su sitio (2026-08-26)

**El modelo guardaba `pagina`, `ancla_x` y `ancla_y` desde el primer día y no había quien las
dibujara.** Una observación sobre la página 7 de un plano se leía como una línea de texto en una
lista, y quien la recibía tenía que abrir el PDF aparte y buscar de qué hablaba.

Ahora hay una pantalla que hace tres cosas y ninguna más: **ver el PDF sin descargarlo**, **ver
las observaciones en su sitio** y **abrir una nueva con un clic** sobre la página.

**Decisiones que importan, y por qué:**

- **De EmbedPDF se usa el motor, no su visor.** `@embedpdf/snippet` es un lector completo de 9,7
  MB con su propia interfaz en Preact; lo que hace falta aquí es dibujar páginas y poner **nuestras**
  marcas encima, con control de la coordenada. Así que se usa `@embedpdf/engines` (PDFium por
  WASM, MIT) y la capa de marcas es propia. La página pesa 348 kB de JavaScript.
- **Es una página aparte del build, no una pestaña del visor de modelos.** Un PDF en el visor 3D
  cargaría Three.js y el WASM de `web-ifc` para nada —y no sabría abrirlo—. Comparten el build,
  los assets, el `base` y el paso de limpieza, que es justo lo que no había que duplicar:
  `documento.html` es la segunda entrada de la misma configuración de Vite, y Django la sirve
  detrás del login con la misma vista, generalizada.
- **El ancla es una fracción de la página, no un píxel.** El PDF se dibuja a la escala que quepa
  y a la densidad de pantalla de cada equipo: un píxel guardado hoy apunta a otro sitio mañana.
- **El clic lleva al formulario de Django con el ancla puesta; no se guarda nada desde el
  navegador.** El formulario ya comprueba el permiso, el rango de la coordenada y que las tres
  partes del ancla vengan juntas; duplicar esa validación en el cliente serían dos reglas que se
  separan en el primer cambio.
- **Sólo se dibujan las páginas cercanas a la que se mira.** Una memoria de 200 páginas serían 200
  imágenes en memoria de vídeo a la vez, que es el fallo que ya se pagó con el atlas de rótulos.

**Y dos trampas encontradas, las dos del mismo tipo que las que `AGENTS.md` ya listaba:**

1. **El WASM de PDFium sale de un CDN por defecto** (`cdn.jsdelivr.net`). Con el valor de fábrica
   no habría un aviso: habría una página en blanco, porque la CSP de una página detrás del login
   no deja pedirle nada a otro origen — y porque en faena no hay internet. Se resuelve con
   `import "…/pdfium.wasm?url"`, así que **la ruta la calcula Vite**, con el prefijo
   `/static/visor/` incluido, en vez de componerla a mano como se hizo con el otro WASM. Va como
   regla nueva en `AGENTS.md`.
2. **`fontFallback` activado pide fuentes a otro origen** cuando el PDF no las trae incrustadas.
   Se pone en `null`.

**Y un defecto propio, encontrado por una prueba que ya existía:** «es abrible» y «lo abre **este**
visor» son dos preguntas distintas, y hasta ahora eran una función. Con el PDF sumado al conjunto
de lo abrible, los PDFs entraban en el selector del visor de modelos, que los habría cargado como
geometría. Ahora son `es_abrible` y `abre_en`.

**Comprobado en el navegador**, detrás del login, con un PDF de tres páginas y tres observaciones
ancladas:

| Qué                                 | Resultado                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Las tres páginas                    | Dibujadas: `img` de 595 × 842 desde `blob:`, sin un error en consola                    |
| El WASM                             | `/static/visor/assets/pdfium-RAgkpwfK.wasm`, 4,5 MB — **nada de un CDN**                |
| Las tres marcas                     | En 42 %/35 %, 68 %/55 % y 25 %/72 %, la cerrada en verde y las abiertas en violeta      |
| Clic sobre la página 2 al 30 %/80 % | Formulario con `pagina=2`, `ancla_x=0.2992`, `ancla_y=0.7993` y la revisión ya elegidas |
| Una coordenada de 1,4               | **400**, con el motivo en español, y no se crea nada                                    |
| `puedeObservar` por rol             | Coordinador `true`; proyectista y mandante `false`                                      |

16 pruebas nuevas. Gate en verde: 180 pruebas, 93,22 % de cobertura.

> **De paso salió un agujero de aislamiento que no era de esta tarea.** `NuevaObservacionView`
> buscaba el entregable **sin acotar por organización**: con `add_observacion`, pedir
> `/entregables/<id-de-otra>/observar/` metía un hallazgo en el proyecto de otro cliente **y le
> mandaba un correo a alguien que no tiene nada que ver**. Acotado, con su prueba.

### El PDF se lee: texto seleccionable y búsqueda (2026-08-26)

Era lo que `F8.6` dejó pendiente el mismo día: la página dibujaba imágenes y **de una imagen no se
copia nada**. De un plano lo que se copia es un código de recinto o una cota, para pegarlos en un
correo.

- **Capa de texto invisible sobre cada página**, con los rectángulos que da `getPageTextRects`
  puestos en su sitio y en transparente. Es la técnica de cualquier lector de PDF. El
  `pointer-events` va suelto en cada tramo y no en la capa, para que el clic que abre una
  observación siga llegando a la página: con la capa capturando el puntero se podría seleccionar
  texto y ya no se podría marcar un hallazgo.
- **Búsqueda en el documento entero**, con el número de página como botón para saltar.
  **El motor dice dónde buscar y la capa dice dónde está en la hoja**, y son dos cosas por un
  motivo: `searchAllPages` recorre el PDF sin dibujarlo —barato— pero devuelve índices de carácter,
  no rectángulos; la capa de texto ya tiene los rectángulos de las páginas que se están mirando, que
  es donde el resaltado se ve. Una página con coincidencias se dibuja aunque esté lejos, o saltar a
  ella mostraría el hueco reservado.
- **Un PDF escaneado no tiene texto que buscar**, y eso no rompe la pantalla: dice «sin
  coincidencias». El modo `pdf` del diagnóstico lo nombra explícitamente, porque «no encuentra nada»
  y «no hay nada que encontrar» son dos cosas distintas.

**Comprobado detrás del login**, con el fixture de tres páginas: 6 tramos de texto extraídos con su
posición y su fuente, el texto copiable palabra por palabra, y buscar «vanos» → **1 coincidencia en
la página 3**, la vista salta a la 3 y el tramo «Cuadro de vanos» queda resaltado en
`rgba(255, 212, 59, 0.45)`.

> **Un dato del entorno que costó encontrar y sirve para la próxima.** Los clics del panel del
> navegador **no llegan a los manejadores de React**: `computer left_click` sobre el botón no
> disparaba el `onSubmit`, y `form_input` sobre un campo controlado no actualizaba su estado. Con
> `elemento.click()` desde la consola sí. Es la misma razón por la que no se puede escribir en el
> formulario de ingreso desde aquí.
>
> De paso, el término de búsqueda dejó de ser estado de React y se lee del campo al enviar: solo
> importa en ese momento, y tenerlo en estado repintaba el documento en cada tecla.

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

| #      | Tarea                                                                                                | Estado       |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------ |
| `F7.1` | Generar vistas 2D desde el modelo (planta, alzados) proyectando sus aristas                          | 🟡           |
| `F7.2` | Viewports y capas: qué se dibuja, con qué grosor y en qué capa (`DrawingViewports`, `DrawingLayers`) | ⬜           |
| `F7.3` | Acotado y anotaciones sobre el plano: cotas lineales, ángulos, pendientes y llamadas                 | ⬜           |
| `F7.4` | **Exportar a DXF** con `DxfExporter`, en A3 y milímetros, listo para el CAD                          | ✅ ver abajo |
| `F7.5` | Exportar a PDF imprimible, con formato y sello                                                       | ⬜           |

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
tal cual **no cabría en la hoja**. Que la extensión sea exactamente la del A3 dice que el dibujo se
escala al papel, que es lo que hace falta para imprimirlo.

> **Lo que sigue sin confirmarse de `F7.4`**: que **AutoCAD** lo abra. Que nuestro lector lo lea es
> evidencia independiente y fuerte —es otra implementación— pero no es la misma afirmación. Y lo que
> se exporta aquí es un dibujo armado a mano, no uno **proyectado**: eso es `F7.1`.

> **`F7.1` sigue en 🟡 a propósito.** Lo que está comprobado es el camino del fallo, no el del acierto.
> **Falta confirmar en un navegador de verdad**: que la planta sale con las aristas del modelo,
> cuánto tarda con el IFC de 23,6 MB, y que el DXF abre en AutoCAD con su escala. El modo `planos`
> ya lleva el oráculo puesto para ese día: **exporta el DXF y lo vuelve a leer con nuestro propio
> lector**, y compara los trazos que salen con los segmentos proyectados y la extensión con el A3
> declarado. Ahí no hace falta creer a nadie.

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

## FASE 9 — Sistema de diseño y accesibilidad

**Agregada el 2026-09-01 a pedido del usuario**, después de una revisión de diseño que midió
los contrastes sobre el código en vez de estimarlos. El detalle vive en
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

**El hallazgo de fondo:** AeroBim tiene **dos sistemas de diseño y solo uno está hecho**. El
portal lleva tokens con nombre, el ratio anotado al lado de cada color, tema claro y oscuro,
`:focus-visible` y estilos de impresión; el visor tiene veinte pasos de `white/NN`, ningún
token, ningún foco y ningún tema. Son dos vocabularios y el usuario cruza la costura cada vez
que abre un modelo desde su expediente.

**Objetivo de salida:** que las dos mitades se pinten con el mismo juego de tokens, que ningún
texto de la aplicación quede por debajo de AA, y que se pueda usar el visor entero con el
teclado sabiendo dónde se está.

| #      | Tarea                                                                                                 | Estado       |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------ |
| `F9.1` | **Los tokens en `index.css`**: superficies, texto, marca/acción/acento y estado, con su ratio anotado | ✅ ver abajo |
| `F9.2` | **La escala tipográfica** y fuera el `font-size: 110%`: suelo de 11 px, y la densidad intacta         | ✅ ver abajo |
| `F9.3` | **`:focus-visible` global** y los **230** usos de `white/NN` reemplazados por papel con nombre        | ✅ ver abajo |
| `F9.4` | **Las acciones dejan de esconderse**: fuera `opacity-0 group-hover`, áreas de toque a 44 px           | ⬜           |
| `F9.5` | **Estados vacíos con puerta de entrada**, y escala de radio y elevación compartida con el portal      | ⬜           |
| `F9.6` | **Reordenar el shell del visor** — _bloqueada: contradice `docs/UX.md`, la decide el usuario_         | ⛔           |

**Oráculo:** ningún par texto/fondo de la aplicación por debajo de 4,5:1 medido con la fórmula
de WCAG 2.1 (los rótulos deshabilitados quedan exentos, con suelo propio de 3:1); recorrer el
visor entero con `Tab` sin perder de vista el foco; y `grep` de `white/` en `apps/web/src`
devolviendo cero.

**`F9.1` a `F9.5` no mueven un solo componente de sitio.** Son defectos, no rediseño, y por eso
van primero: cada una deja la aplicación entera y usable, y ninguna depende de que se resuelva
la discusión de `F9.6`.

### Dos cifras de la revisión, corregidas al ir a ejecutarlas (2026-09-02)

**`F9.3` conflacionaba dos medidas distintas**, y las dos importan por separado:

| Qué se cuenta                                                | Cuántos                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Usos de **texto por debajo de AA**                           | **123** — 89 de `white/30`–`45`, 24 de `text-brand` y 10 de blanco sobre `bg-brand` |
| Apariciones de `white/NN` **en total**, texto, borde y fondo | **230**, en 17 archivos y 180 líneas                                                |

Los 123 son el problema de accesibilidad; los 230 son el trabajo. El oráculo que la propia fase
declara —`grep` de `white/` devolviendo cero— exige los 230, así que la fila dice ese número y la
tabla de `DESIGN_SYSTEM.md` conserva el otro, que es el que explica **por qué** hay que hacerlo.

**Y `F9.2` tenía una consecuencia que no estaba dicha.** [index.css:40-46](apps/web/src/index.css)
ya dejó escrito que **toda la escala de Tailwind está en `rem`**: bajar la raíz de 110% a 100%
encogería también los paddings, los altos y los huecos **un 10%**, con la letra casi igual. Eso
deshace la densidad que el usuario fijó midiendo en su pantalla —dijo que al tamaño de fábrica
«pedía zoom para leerse», y que al 120% «se ve muy cerca»—, y esa medición no se tira porque el
documento de diseño no la conociera.

La salida no es elegir entre las dos cosas: **la raíz vuelve a 16 y `--spacing` sube un 10%**
(0,25rem → 0,275rem), así que la unidad de espaciado sigue midiendo los mismos 4,4 px. Con eso se
cumplen las dos: el suelo de 11 px que pide el sistema, y la densidad que pidió quien lo usa. La
tabla de mapeo está en la propia `F9.2`, más abajo.

### `F9.1`–`F9.3` cerradas: el visor tiene tokens, escala y foco (2026-09-02)

**Lo que había:** cinco tokens, ninguna regla de foco —**cero** coincidencias de `focus` en todo
`apps/web/src`— y el color jerárquico conseguido bajando la opacidad del blanco hasta que el texto
dejaba de leerse. `text-white/30` daba 2,67:1 y era el rótulo de grupo de la cinta, a 9,9 px.

**Lo que hay:** dieciocho tokens con su papel, la escala calibrada sobre una raíz de 16 y un anillo
de foco global. **230 clases traducidas en 17 archivos**, y ni un componente movido de sitio.

**El oráculo dejó de ser una afirmación y pasó a ser una prueba**, que es lo que más aporta de esta
pasada. `packages/bim-core/src/color/contraste.ts` implementa la fórmula de WCAG 2.1 —fijada con los
vectores conocidos de la norma: 21:1 blanco sobre negro, y el 4,48 de `#777777` sobre blanco, que es
el que distingue el umbral `0,03928` del `0,04045`— y su prueba hermana **lee `index.css`** en vez de
una copia. Comprueba quince cosas, entre ellas:

- los tres niveles de texto y los cuatro de estado, sobre las **cuatro** superficies, por encima de
  4,5:1;
- el blanco sobre los tres rellenos de acción —el botón `Abrir` daba **4,13:1** con el violeta de
  marca, o sea que la acción principal de la aplicación no pasaba AA—;
- que la marca **siga sin pasar** AA (3,96:1), porque es la razón de que exista un acento aparte y
  no se puede «simplificar» volviendo atrás;
- que el visor no pueda volver a escribir `white/NN`, ni un color de la paleta de Tailwind haciendo
  de estado, ni un `font-size` en porcentaje.

**Y corrigió un número del propio documento de diseño**: `--ab-disabled-fg` declaraba 3,1:1 y son
**3,6:1**. Los otros nueve ratios de la tabla estaban exactos.

**Comprobado en el navegador**, que es donde se ve si la compensación de densidad funcionó:

| Medida                  | Antes (raíz 110%) | Ahora (raíz 16 + `--spacing` 0,275) |
| ----------------------- | ----------------- | ----------------------------------- |
| Barra de estado (`h-7`) | 30,8 px           | **30,8 px** — idéntica              |
| Botón de la cinta       | 40,1 px           | 41,5 px                             |
| Cabecera de sección     | 35,0 px           | 36,6 px                             |
| Cinta desplegada        | 96,4 px           | 100 px                              |

**El espaciado quedó idéntico** —la barra de estado no lleva texto que la estire y mide exactamente
lo mismo— y lo que creció uno o cuatro píxeles son las cajas cuyo alto lo pone el texto más pequeño,
porque `micro` subió de 9,9 a 11 px y `nota` de 10,9 a 12. **Eso es el arreglo, no una regresión**:
era el texto que no se podía leer.

El foco, recorrido con `Tab`: cuatro paradas seguidas con `:focus-visible` casando y el anillo en
`2px solid rgb(195, 166, 240)` —que es `--color-accent` resuelto— con 2 px de separación.

**Lo que sigue sin comprobarse es el aspecto.** El panel del agente no compone fotogramas y la
captura se agota, así que esto está medido leyendo el DOM y los estilos calculados. Que los colores
nuevos **gusten** pide la pantalla del usuario, y se suma a las pantallas que ya esperaban su
mirada.

### `F9.4` y `F9.5` cerradas: la fase entera, menos la bloqueada (2026-09-02)

**`F9.4` — lo que se escondía y lo que no se podía tocar.**

Cinco acciones aparecían solo al pasar el ratón: cerrar un modelo, borrar una vista, borrar una
cota, quitar una vista compartida y el ojo del árbol. La intención estaba escrita y era buena —
cerrar un modelo cuesta volver a convertir el archivo— pero **la herramienta era la equivocada**:
esconder algo no lo hace menos pulsable por accidente, lo hace **imposible** con el teclado y en
una pantalla táctil, donde no existe «pasar por encima». Ahora están siempre a la vista en el gris
más apagado que todavía pasa AA, y el rojo llega al acercarse.

**El área de toque sale de una sola regla, y se engancha a `aria-label`.** Cuarenta y cuatro
píxeles es lo que pide una revisión de accesibilidad para algo que se toca con el dedo, y había
veinte botones por debajo: los iconos de lista miden 11 × 17 dentro de filas de 26. Agrandarlos
habría hinchado la interfaz, que es justo lo que `F9.2` acababa de proteger — así que el botón se
queda del tamaño que se ve y **crece solo su zona sensible**, con un pseudoelemento centrado que no
pinta nada.

Que la regla sea `button[aria-label]` no es un atajo: **un botón cuyo nombre accesible sale de un
atributo en vez de un texto visible es un botón de icono** —por eso necesita el atributo— y es
exactamente el que se queda pequeño. Así el que se escriba mañana lo hereda sin que nadie se
acuerde, que es la única forma de que una regla así sobreviva.

**Y tuvo un precio que solo se vio midiendo.** Un botón de 11 px pegado al borde derecho de un
panel deja su zona sensible sobresaliendo, y eso **le daba barra de desplazamiento horizontal** al
árbol (8 px) y a los modelos abiertos (3 px). Comprobado apagando el pseudoelemento y volviendo a
medir: sin él, cero. Las listas llevan ahora `overflow-x-clip` —que el navegador computa como
`hidden`, porque la norma lo manda cuando el otro eje se desplaza— y **ninguna barra aparece**.
Queda un residuo dicho en el código: esos dos contenedores admiten 8 y 3 px de desplazamiento por
código, invisible y sin perder contenido.

**`F9.5` — el radio, la elevación y las dos listas que no decían cómo llenarse.**

| Qué              | Antes                                         | Ahora                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------- |
| Radio de control | `rounded` a secas: 4 px fijos, sin token      | `--radius-sm` **6 px**, y la clase lo nombra      |
| Radio de tarjeta | `rounded-md` 6 px                             | `--radius-md` **10 px**                           |
| Radio del portal | —                                             | `--radius-lg` **12 px**, el `--ab-radius` de allá |
| Elevación        | La de fábrica: negro al 10%, para fondo claro | Tres oscuras, que sobre un panel **se ven**       |

`rounded` a secas es un alias heredado con valor fijo: **no lee el token**, así que las 38
apariciones pasaron a `rounded-sm` y el radio dejó de ser un número escrito en cuatro sitios.
`--shadow-lg` se deja como está a propósito: lo usa la hoja del documento, que es blanca sobre un
fondo claro, y ahí una sombra oscura sería la equivocada.

**Los dos estados vacíos sin puerta** eran justamente los primeros que se ven al abrir el visor: el
árbol decía «Todavía no hay ningún modelo abierto» y los modelos abiertos, «Ninguno». Ahora los dos
dicen el gesto — arrastrar, `Abrir`, o sacar uno del registro; y para qué sirve la lista de modelos,
que es apagar uno para mirar el otro. Los otros seis estados vacíos ya lo hacían desde que el
usuario preguntó «cómo puedo cargar una observación, no está claro eso» teniendo el botón delante.

**El oráculo creció con la fase**: 19 comprobaciones, y ahora también que no quede un solo
`opacity-0`, que la regla del área de toque exista con sus 44 px, que la escala de radio sea 6/10/12
y que las tres elevaciones sean oscuras.

**Con esto la Fase 9 está cerrada salvo `F9.6`**, que es una decisión del usuario y son tres.

### `F9.2`: la escala se **mapea**, no se borra

Quitar el `font-size: 110%` y dejar que cada clase caiga donde caiga encogería la interfaz. Las
cifras, con la raíz de hoy (17,6 px) contra la de destino (16 px):

| Token          | Hoy               | Pasa a             | Y en el sistema es |
| -------------- | ----------------- | ------------------ | ------------------ |
| `--text-micro` | 0,56rem = 9,9 px  | 0,6875rem = **11** | `--fs-micro`       |
| `--text-nota`  | 0,62rem = 10,9 px | 0,75rem = **12**   | `--fs-xs`          |
| `--text-xs`    | 0,75rem = 13,2 px | 0,8125rem = **13** | `--fs-sm`          |
| `--text-sm`    | 0,875rem = 15,4   | 0,9375rem = **15** | `--fs-base`        |
| `--text-base`  | 1rem = 17,6 px    | 1,0625rem = **17** | `--fs-lg`          |
| `--spacing`    | 0,25rem = 4,4 px  | **0,275rem** = 4,4 | —                  |

**Ningún tamaño baja más de medio píxel**, los dos que estaban por debajo del suelo de 11 px suben,
y padding, altos y huecos quedan idénticos. La raíz vuelve a 16, que es la mitad buena del 110%:
así vuelve a respetar a quien haya cambiado el tamaño de letra de su navegador — que es justamente
quien más lo necesita, y lo que el propio comentario de `index.css` daba como razón.

**Los nombres `nota` y `micro` se quedan** en vez de renombrarse a `--fs-*`: ya son semánticos, ya
están documentados, y renombrarlos serían noventa y siete ediciones que no cambian un píxel. La
equivalencia queda en la tabla de arriba.

### `F9.6`: por qué está bloqueada y no simplemente pendiente

La revisión propuso además reordenar el shell: barra de aplicación con migas compartida con el
portal, **rail de siete secciones** en vez del acordeón del navegador, **herramientas flotando
sobre el lienzo** con las opciones de la activa desplegándose debajo, y **propiedades como
tarjeta anclada a la selección** en vez de panel fijo.

Eso choca de frente con tres decisiones ya escritas en [docs/UX.md](docs/UX.md):

| Lo que dice UX.md hoy                                                                     | Lo que propone la revisión                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| «Nada flota sobre el modelo salvo el cubo de vistas»                                      | Herramientas, propiedades y controles de cámara flotan        |
| El navegador de la derecha es «el contenido del proyecto, todo junto»                     | Se reparte en siete destinos de un rail, uno visible a la vez |
| «Una capacidad nueva es una sección del navegador y, como mucho, un grupo en una pestaña» | Una capacidad nueva es un destino del rail                    |

**Y una cifra que hay que corregir antes de discutirla.** La revisión anunció que el shell nuevo
gana alto de lienzo. No es cierto en el caso que importa: la cinta de hoy **ya se pliega a
34 px**, y contra eso la barra nueva (48 + 32) pierde. La ganancia real es de **ancho**: los dos
paneles anclados suman 588 px irrecuperables y el rail más un panel suman 372, o sea **+216 px**.
Lo que sí mejora siempre, y no se mide en píxeles, es que **medir deja de exigir un cambio de
pestaña y la vuelta**.

Con eso sobre la mesa, la decisión es del usuario, y son tres separadas: si el navegador se
reparte, si algo puede flotar sobre el modelo, y si propiedades se ancla al elemento. Se puede
decir que sí a una y que no a las otras dos. **Si alguna se acepta, se reescribe UX.md primero
y el ticket después** — no al revés, porque UX.md es la fuente de esa decisión.

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
| El visor no es usable con teclado y 123 textos no pasan AA     | Excluye a parte del equipo y bloquea cualquier revisión formal | Abierto — es el objetivo de salida de la Fase 9; `F9.3` es la que lo cierra                                                                                          |
