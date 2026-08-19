# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** La historia detallada vive en `git log`.
> La **fuente de verdad del trabajo pendiente** es [MASTER_PLAN.md](MASTER_PLAN.md).

## Cómo seguir (leer esto primero)

**Rama de trabajo: `codex/fase-0-andamiaje`, con PR abierto y sin fusionar.**

> ## ⚠️ Lo siguiente: la geometría que el conversor deja fuera (`F1.10`)
>
> **Es el problema más grave que hay abierto, y es de fidelidad.** El mismo IFC de 32,7 MB
> abierto en **Bentley OpenPlant** muestra mucho más que AeroBim: en el visor aparece la
> estructura de acero y **falta el resto** —los grandes elementos curvos de la planta,
> tuberías, maquinaria—. No hay error ni aviso: el visor abre el modelo, informa 839
> elementos con geometría y muestra la mitad.
>
> **Por qué no se notaba.** Cuando el conversor no puede con un elemento **no lo deja en el
> árbol sin dibujar: no lo importa**. Así que ningún contador interno lo echa de menos, y el
> hueco solo se ve comparando contra el archivo. Verificado con un fixture propio,
> `elemento-sin-geometria.ifc`.
>
> **Dos cosas ya descartadas o confirmadas:**
>
> - El conjunto de clases del importador (`ifcClasses.elements` de `@thatopen/fragments`) tiene
>   unas 140 clases e **incluye** tubería, fittings, segmentos de flujo, elementos de
>   distribución y el proxy genérico. Lo que exporta un modelador de planta está ahí, así que
>   **probablemente no es la causa**.
> - Un elemento sin geometría utilizable se descarta entero. Comprobado.
>
> **Ya está instrumentado:** el visor cuenta las clases del archivo antes de convertir, las
> compara con las categorías cargadas y lo avisa en el panel de modelos —_"Elementos del
> archivo que no se cargaron: N"_ con la lista de clases y su número—.
>
> **El paso siguiente es leer ese aviso sobre el modelo real de 32,7 MB**: abrirlo y desplegar
> su fila en el navegador de la derecha. Según lo que diga la lista:
>
> - una clase concreta ausente → se añade a `importer.classes.elements` con la constante de
>   `web-ifc`, una línea;
> - clases que sí están en el conjunto → es `web-ifc` con esas representaciones. Palancas por
>   orden de coste: `importer.webIfcSettings` (`MEMORY_LIMIT`, `CIRCLE_SEGMENTS`, tolerancias de
>   intersección), subir `web-ifc`, o convertir ese modelo con IfcOpenShell en la Fase 3.
>   **Ninguna se toca a ciegas.**

### Un error al girar que el usuario vio y no está reproducido

Combinando **ortográfica + vista fantasma + medición**, girar la cámara le produjo un error.
**No está reproducido ni se conoce el mensaje.** Se corrigió por el camino la causa más
probable —el repintado del resaltado se dispara en cada descanso de cámara y las llamadas se
solapaban; ahora están serializadas— pero hasta ver la consola no se puede cerrar. **Pedirle
el texto del error.**

Lo que sí se sabe del entorno: en una pestaña que no compone cuadros, `getComputedStyle`
sobre una transición de CSS se queda congelado y los uniformes de la cámara pueden salir
`NaN`, lo que produce `firstElem.toArray is not a function` desde three.js. Ese síntoma
concreto era artefacto del entorno de pruebas, no del código.

### Lo que la prueba de uso dejó, ya cerrado

| #   | Observación                                                                                     | Estado                                                    |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | **Cargar un segundo IFC daba error** `Aborted(both async and sync fetching of the wasm failed)` | ✅ arreglado (un solo `IfcImporter`)                      |
| 2   | Al orbitar se seleccionaban elementos sin querer                                                | ✅ arreglado (margen de clic, ahora 8 px)                 |
| 3   | El renderizado se ve plano                                                                      | ✅ `ShadowedScene` + `COLOR_PEN_SHADOWS`                  |
| 4   | **La barra de abajo no se entiende**                                                            | ✅ cinta arriba, tipo Revit — ver `F1.8`                  |
| 5   | Al pasar el ratón detecta antes de hacer clic                                                   | ✅ era el 2; además ahora el cursor dice qué hará el clic |
| 6   | La medición "no funciona"                                                                       | ✅ eran los marcadores que faltaban — ver `F1.4`          |
| 7   | El modo fantasma se cae al mover la cámara                                                      | ✅ se repinta al descansar la cámara, y es más legible    |
| 8   | El panel lateral necesita ordenar / activar / desactivar lo cargado                             | ✅ y además **cerrar** modelos — ver `F1.5`               |
| 9   | Faltan las unidades de los elementos IFC                                                        | ✅ verificado sobre el modelo real — ver `F1.9`           |
| 10  | El relleno del área pintaba de violeta toda la pantalla                                         | ✅ era `depthTest` desactivado en el material del relleno |
| 11  | Medir y seleccionar se pisaban                                                                  | ✅ entrar a medir suelta la selección                     |

### Lo que `@thatopen/components-front` ya trae, y qué se está usando

| Componente                                                 | Estado                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `PostproductionRenderer` + `COLOR_PEN_SHADOWS`             | **en uso** — sombras, oclusión y aristas dibujadas           |
| `LengthMeasurement`, `AngleMeasurement`, `AreaMeasurement` | **en uso** — con marcador de ajuste, cota y etiqueta         |
| `GraphicVertexPicker`, `Mark`                              | **en uso** a través de los medidores                         |
| `Highlighter`, `Outliner`                                  | sin usar: el resaltado propio va en capas y ya se controla   |
| `ClipEdges`, `ClipStyler`                                  | sin usar — cortes con las aristas marcadas, como en BricsCAD |
| `Hoverer`                                                  | sin usar — resaltar al pasar el ratón, si se pide            |
| `Views`, `Viewpoints`                                      | sin usar — son la base de `F1.6`                             |
| `VolumeMeasurement`                                        | sin usar — cuarta herramienta de medición si hace falta      |

### Lo que ya está cerrado con datos

- **`F0.4`**: `Piso 5.ifc` (1,52 MB, IFC2X3 de BricsCAD) abre en la aplicación en **0,6 a
  1,2 s** según la carga del equipo, con 548 elementos y 15 categorías. Las dimensiones
  que informa —21,8 × 3,0 × 22,7 m— confirman que el factor de unidades del IFC se aplica
  (el modelo viene en milímetros).
- **`F0.5`**: el Fragments pesa **113 KB** frente a 1,52 MB del IFC, **13,7× menos**. La
  promesa de Fragments se cumple.
- **El GUID de IFC está verificado contra un oráculo externo**: los 579 GUID del modelo
  real, generados por BricsCAD, sobreviven el round-trip sin una sola diferencia.
- **`F0.3`**: monorepo con build, lint, formato y pruebas verdes.

### El visor ya se puede mostrar

Con `F1.1` y `F1.2` cerradas, la aplicación hace lo que alguien espera de un visor:

- abre un IFC real en poco más de un segundo, en vista isométrica;
- **recorre el árbol** del modelo, aísla una categoría con un clic y oculta lo que estorba;
- **clic sobre un elemento** → categoría, GUID validado, tipo y material, con el elemento
  resaltado;
- orbita con el ratón, y **Encuadrar** vuelve a la vista general;
- **cambia de proyección** (perspectiva ↔ ortográfica), de **modo de navegación** (órbita,
  planta, interior) y de **representación** (sólido, fantasma);
- **mide** distancias, ángulos y áreas, con ajuste a vértices y aristas;
- **corta** el modelo por tres ejes, con los planos arrastrables.

Verificado de punta a punta sobre `Piso 5.ifc`: aislar `IFCDOOR (10)` deja exactamente las
diez puertas en pantalla, y **Ver todo** devuelve el edificio.

### `F0.6` ya se puede decidir: hay datos de un modelo grande

Llegó un segundo modelo real de **32,7 MB** (`716-LCD-ME-ISUP-D-TEST.ifc`, con **839
psets**), y con él la cifra que faltaba:

| Modelo           | Conversión | Hasta verlo | Fragments            |
| ---------------- | ---------- | ----------- | -------------------- |
| Piso 5 (1,5 MB)  | 1,11 s     | 2,20 s      | 113 KB — 13,7× menos |
| Grande (32,7 MB) | **9,53 s** | **9,82 s**  | 1,5 MB — 22,3× menos |

**La conversión corre en el hilo principal, así que esos 9,5 segundos son 9,5 segundos de
interfaz congelada.** Con eso, la respuesta a `F0.6` se inclina a **mover la conversión a un
Web Worker** —sigue siendo del lado del cliente, respeta el local-first, y deja de bloquear
la interfaz— antes que a montar un backend. Un servidor solo haría falta si aparecen modelos
mucho mayores o si se quiere convertir una vez y reutilizar el `.frag`, que es otra cosa y
encaja en la Fase 3.

Queda pendiente escribirlo como decisión en el plan y medir cuánto mejora con el worker.

### Y después, en este orden

1. **`F1.10` — la geometría que falta.** Ver el aviso del principio. Es lo único que hace que
   el visor mienta sobre el modelo, y por eso va antes que cualquier mejora.
2. **El error al girar**, con el mensaje que dé la consola del usuario.
3. **Herramientas de medición que se pidieron y no están:** perpendicular, y más tipos de
   cota. Existe `VolumeMeasurement` en la librería; perpendicular hay que ver si sale de
   `LinearAnnotationsTool`, que trae modos de proyección.
4. **De la referencia de Revit y Bentley, lo que falta:** la rejilla del entorno. El fondo
   claro de esos programas **no** se copia sin decidirlo: el oscuro es el de la familia.
5. **`F1.6` vistas guardadas**, con `Views` y `Viewpoints` de la librería.
6. **Mover la conversión a un Web Worker** (`F0.6`), y medir cuánto baja el bloqueo.
7. **Fase 2 — nubes de puntos.** El as-built contra el modelo, la comparación que hoy nadie
   puede hacer sin software de pago.

### Cómo está repartida la pantalla

Distribución tomada de Revit y de los modeladores de Bentley, a pedido del usuario:

| Dónde     | Componente                       | Qué hay                                        |
| --------- | -------------------------------- | ---------------------------------------------- |
| Arriba    | `components/Ribbon.tsx`          | Pestañas Vista · Medición · Modelo, con grupos |
| Izquierda | `components/PropertiesPanel.tsx` | Propiedades, con las unidades de cada número   |
| Derecha   | `components/ProjectBrowser.tsx`  | Estructura, modelos abiertos y cotas dibujadas |
| Centro    | el lienzo                        | El modelo, sin nada flotando encima            |
| Al pie    | `components/StatusBar.tsx`       | Modo, qué falta para medir, resultado y conteo |

Los iconos son propios (`components/icons.tsx`), dibujados a mano: un corte longitudinal o
una vista fantasma no existen en ninguna librería de iconos genérica, y con los genéricos
vuelve el problema original de herramientas que no se distinguen.

### Cómo levantar y cómo medir

```bash
npm run dev
```

Para exponerlo a la red local —hace falta autorizar el puerto en el firewall de Windows—:

```bash
npm run dev:host
```

Herramienta de medición: `apps/web/public/diag.html`, que ejecuta el pipeline **sin la
interfaz** y separa un problema del visor de uno de integración. Modos: `clase`, `manual`,
`camara`, `arbol`, `seleccion`, `medir`, `cortes`.

`http://localhost:5173/diag.html?modo=clase&ifc=/samples/muro-minimo.ifc`

### Los modelos de prueba

**Hay dos modelos reales de la organización**, ninguno versionado (`.gitignore` excluye todo
`*.ifc`). Para repetir las mediciones hay que copiarlos a `apps/web/public/samples/`:

| Modelo                       | Tamaño  | Qué aporta                                                     |
| ---------------------------- | ------- | -------------------------------------------------------------- |
| `Piso 5.ifc`                 | 1,5 MB  | El de referencia. **Sin psets** (export con la casilla en Off) |
| `716-LCD-ME-ISUP-D-TEST.ifc` | 32,7 MB | **839 psets reales** y el tamaño que hacía falta para `F0.6`   |

**Sí se versionan tres fixtures sintéticos**, escritos a mano y sin dato alguno de un
proyecto real:

| Fixture                      | Para qué                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `muro-minimo.ifc`            | Probar el pipeline con 2 KB. Delata errores de unidades: el visor debe informar 4,0 × 3,0 × 0,2 m, no miles de metros |
| `muro-con-psets.ifc`         | Verificar la lectura de **psets y cantidades**, que el modelo real no trae                                            |
| `elemento-sin-geometria.ifc` | Un muro con geometría y una tubería sin representación: es el oráculo del aviso de geometría que falta (`F1.10`)      |

### Cómo obtener un IFC con psets desde BricsCAD

Aplica a `Piso 5.ifc`; el modelo de 32,7 MB sí trae 839 psets. No es un defecto del archivo:
su propia cabecera lo declara. Si se abre el `.ifc` con un editor de texto, en
`FILE_DESCRIPTION` aparece:

```
Option [IfcExportBaseQuantities: Off]
```

Esa es la opción a activar en el diálogo de exportación IFC de BricsCAD. **La forma de
comprobar que quedó activada es el propio archivo**: al reexportar, esa línea debe decir
`On`. Es más fiable que buscar el control en la interfaz, porque el archivo registra lo que
de verdad se aplicó.

Con los psets activados, el panel de propiedades los muestra sin cambiar nada del código —
ya está verificado contra `muro-con-psets.ifc`.

## Alcance: ver y coordinar, nunca procesar ni modelar

Misma regla que AeroPlanner, con dos límites en vez de uno:

- **No procesa.** No genera nubes de puntos, ortofotos ni DSM. Abre lo que otro
  produjo — un COG se lee por rangos HTTP y una nube con octree se descarga por
  niveles, así que el coste es del cliente y a demanda.
- **No modela.** No edita geometría IFC. Modelar es trabajo de Revit, ArchiCAD o
  Bonsai; aquí se revisa, se mide y se coordina.

Regla corta: **la aplicación abre lo que otro produjo, y anota lo que hay que
corregir.**

## Estado al 2026-08-19

- **Build:** `npm install && npm run build` verde en los tres paquetes (Node 26).
- **Pruebas:** **100** en `packages/bim-core` — los vectores de GUID reales de BricsCAD, la
  geometría de las mediciones contra casos elementales, la lectura de unidades del IFC y el
  conteo de clases que delata la geometría que no se carga.
- **Código:** monorepo armado — `packages/bim-core` (dominio puro), `packages/viewer`
  (envoltura de That Open, con `components` + `components-front` + `fragments`) y
  `apps/web` (React 19 + Vite 8 + Tailwind 4).
- **Documentación:** plan por fases, MVP, arquitectura, referencias con licencias
  verificadas y contrato con AeroPlanner.
- **Licencia:** MIT.
- **Marca:** `assets/aerobim-mark.svg` — el dron de la familia con un cubo
  isométrico, en violeta `#9B5DE5`.
- **Repositorios hermanos:** [AeroControl](https://github.com/DovaCrii/AeroControl),
  [AeroPlanner](https://github.com/DovaCrii/AeroPlanner) y
  [AeroLink](https://github.com/DovaCrii/AeroLink) — **de solo lectura desde aquí**.

## Decisiones tomadas

1. **AeroBim se separa de AeroPlanner** (2026-08-18). Lo geoespacial —ortofoto, DEM,
   curvas de nivel, nube del vuelo— **se queda en AeroPlanner**, porque ahí cierra
   el ciclo de planificación. Lo BIM —IFC, psets, BCF, interferencias— es otro
   dominio y vive aquí.
2. **That Open Company para el visor**, no xeokit. xeokit es técnicamente superior
   en varios puntos (doble precisión para coordenadas globales, IFC y nube de puntos
   en la misma escena listo para usar) pero es **AGPL-3.0**: servir la aplicación
   obligaría a liberarla completa o a pagar licencia comercial. La decisión es
   legal, no técnica, y está registrada como tal.
3. **El backend llega en la Fase 3.** Las fases 0 a 2 corren enteras en el
   navegador, porque un visor que exige servidor para abrir un archivo local
   contradice el local-first de la familia.
4. **Speckle queda como referencia, no como dependencia.** Adoptarlo condicionaría
   toda la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo.

## La zona gris ya repartida: nubes de puntos

Aparecen en los dos productos y se reparten **por propósito**, no por formato:

| La nube como…                                        | Vive en         |
| ---------------------------------------------------- | --------------- |
| Producto del vuelo: verla, medirla, navegar la faena | **AeroPlanner** |
| As-built contra modelo: verificar avance, coordinar  | **AeroBim**     |

La tecnología de visor puede terminar siendo la misma —ambos son Three.js— y eso es
una ventaja: lo que se aprenda de un lado sirve del otro.

## Trampas ya pagadas (no reaprenderlas)

1. **El despliegue NO debe servir COOP/COEP.** Es la trampa más cara de este repositorio
   y es contraintuitiva. `Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`
   ponen `crossOriginIsolated` en `true`, y con eso `web-ifc` elige su WASM **multihilo**,
   que no funciona empaquetado: los workers de pthreads arrancan con una URL `undefined`,
   mueren con `Unexpected token '<'`, y la conversión se queda esperando **sin emitir
   error**. El visor comprueba esto al arrancar y falla con un mensaje explícito, pero es
   mejor no llegar ahí. El modo monohilo rinde de sobra: medio segundo para 1,5 MB.
2. **`@thatopen/components` no declara `exports`** y su `main` apunta a un `.cjs`. Hay
   un alias en `vite.config.ts` que fuerza el ESM. No era la causa del cuelgue, pero
   apuntar al ESM es lo correcto.
3. **El WASM de `web-ifc` se sirve local**, copiado por `apps/web/scripts/copy-wasm.mjs`
   en cada `dev` y `build`. Los archivos no se versionan. That Open los bajaría de un
   CDN, y eso rompe el local-first.
4. **`web-ifc` no exporta su `package.json`**: pedirlo falla con
   `ERR_PACKAGE_PATH_NOT_EXPORTED`. Cada `.wasm` sí está en sus `exports` y se resuelve
   uno por uno.
5. **Un visor liberado no se puede recrear** (That Open 3.4.8): tras
   `components.dispose()`, el pipeline de Fragments de una instancia nueva queda sin
   responder. Por eso `BimViewer.create` devuelve **una instancia por contenedor** y el
   desmontaje de React no libera nada.
6. **`fitToBox` con transición no debe esperarse.** Su promesa se resuelve al terminar la
   animación, que avanza con `requestAnimationFrame`; en una pestaña de fondo no vuelve
   nunca. Va con `enableTransition` en `false`.
7. **Los cambios en `packages/` no llegan solos a la aplicación.** `apps/web` consume
   `dist`, así que hay que correr `npm run build:packages` (el script `dev` de la raíz ya
   lo hace).
8. **El tamaño del Fragments se lee antes de cargarlo.** `core.load` transfiere el búfer al
   worker, y un `ArrayBuffer` transferido queda con `byteLength = 0`. Leerlo después
   reportaba "0 B" para todos los modelos.
9. **En un pipeline con workers, revisar la red antes que la consola.** Lo que delató el
   cuelgue de `F0.4` fue una tanda de `GET /undefined` en el registro de peticiones; la
   consola de la página estaba limpia.
10. **El navegador embebido de desarrollo cachea las cabeceras de respuesta.** Después de
    cambiar COOP/COEP en `vite.config.ts`, `crossOriginIsolated` seguía en `true` aunque el
    servidor ya no las enviaba. Se fuerza con un parámetro de consulta distinto en la URL.
11. **Con la cámara, el orden manda: encuadrar primero, rotar después.** `fitToBox`
    recoloca la cámara y pisa los ángulos, así que un `rotateTo` previo se pierde. Y nada
    se aplica hasta que alguien llama `controls.update(delta)`: los comandos registran el
    objetivo, no mueven la cámara. Las dos cosas juntas hacían parecer que la cámara
    ignoraba las órdenes.
12. **Los datos de un elemento no están donde dice el estándar.** El GUID viene en `_guid`
    y la categoría en `_category`. Y `IsDefinedBy` → tipo → `ObjectTypeOf` **cierra un
    ciclo** que devuelve todos los elementos del mismo tipo, así que esa relación se ignora
    y el recorrido se limita a dos niveles.
13. **`three` va fuera del pre-bundling, o hay dos copias en la página.** Los paquetes de
    That Open están excluidos y resuelven `three` por su ruta de archivo; la aplicación usaba
    la copia pre-empaquetada. El navegador avisaba "Multiple instances of Three.js being
    imported", y dos copias significan dos jerarquías de clases: un `instanceof THREE.Mesh`
    puede fallar sobre un objeto que sí es un mesh. **`resolve.dedupe` no basta** — hay que
    añadirlo a `optimizeDeps.exclude`.
14. **`camera.fitToItems()` no resuelve.** Es la API propia de la cámara de That Open para
    encuadrar, y su promesa se queda pendiente (llegó a colgar la propia herramienta de
    diagnóstico). El encuadre se hace con `fitToBox` más un `update` explícito.
15. **Al medir, el ajuste necesita la cara como respaldo.** Con solo vértice y arista, un
    clic en el medio de un muro no devuelve punto y medir se vuelve un juego de puntería. El
    orden `POINT, LINE, FACE` da preferencia al vértice sin rechazar la cara.

## Decisiones pendientes que solo el usuario puede tomar

- **Nombre de despliegue y dominio** (`bim.<dominio>`), y si comparte VM con las
  otras aplicaciones.
- **Modelos de prueba adicionales.** `Piso 5.ifc` es de arquitectura y mediano. Para
  saber si el visor aguanta lo que viene, conviene un modelo grande (>50 MB) y uno de
  estructura o instalaciones.
