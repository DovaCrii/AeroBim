# Fase 0 — Andamiaje y prueba de concepto

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

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
