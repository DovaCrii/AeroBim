# Changelog — AeroBim

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

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
