# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** La historia detallada vive en `git log`.
> La **fuente de verdad del trabajo pendiente** es [MASTER_PLAN.md](MASTER_PLAN.md).

## Cómo seguir (leer esto primero)

**Rama de trabajo: `codex/fase-0-andamiaje`, con PR abierto y sin fusionar.**

> ## ⚠️ Lo siguiente: el plano 2D sobre el modelo (`F7.6`–`F7.10`)
>
> **El frente cambió el 2026-08-19 a pedido del usuario:** antes que las nubes de puntos va
> **cargar el plano DXF del proyecto y cruzarlo con el IFC**. La mitad de entrada de la Fase 7 está
> abierta en `MASTER_PLAN.md` con el archivo real ya radiografiado.
>
> **Lo que ya está hecho:** el lector de DXF (`packages/bim-core/src/plans/dxf.ts`, 11 pruebas)
> lee capas, unidades, líneas, polilíneas —con `bulge`—, arcos, círculos y bloques desarmados.
> Sobre el plano real del usuario: **36 ms, 5.608 polilíneas, 59.136 puntos**, y decide que son
> milímetros aunque el archivo declare centímetros.
>
> **El plano ya se ve, se ajusta y se puede clicar** (`F7.6`, `F7.7`, `F7.9` y `F7.10` cerradas):
> se dibuja con los **colores reales del CAD** —por color de entidad, no por capa, que es lo que
> separa lo nuevo de lo que se demuele—, con sus **rótulos** tumbados sobre el plano, cada capa se
> enciende y apaga, y un clic sobre un trazo devuelve su capa, su plano y el largo del tramo.
>
> **Lo que falta:** alinear por dos puntos (`F7.8` — hoy el ajuste es numérico: unidad, cota, X, Z,
> giro y reflejo), **herramientas CAD de revisión** (`F7.11`: snap a extremo, medio e intersección,
> y medir del plano al modelo) y el cruce lado a lado (`F7.12`). El DXF y el IFC4 nuevo están en
> `apps/web/public/samples/` (fuera de git).
>
> **Las unidades del plano, resueltas donde se decidían mal** (2026-08-19): el panel dice **cuánto
> mide el plano con la unidad puesta** —"52,6 m × 49,6 m", en ámbar y con aviso si no es tamaño de
> edificio— y **cambiar la unidad reencuadra**. Antes, pasar a metros hacía el plano mil veces más
> grande, se iba de la pantalla y parecía que se había borrado.
>
> **Y el CAD se ve como el CAD**: paleta ACI calculada con su regla real, tipos de línea de la tabla
> `LTYPE` —con el patrón llevado a una medida legible, porque `LTSCALE` deja rayas de dos milésimas
> de milímetro— y rótulos con alto mínimo de 35 cm, letra a 96 px y contorno oscuro detrás.
>
> **Ajuste y medición sobre el plano** (`F7.11`, a medias): el cursor se engancha a extremos y
> puntos medios de los trazos, y midiendo distancia la cota toma esos puntos. Se apaga desde
> Medición → Ajuste del cursor → **Al plano**.
>
> **La interfaz se rehízo a pedido del usuario** y está escrita en [docs/UX.md](docs/UX.md): una
> sola barra arriba —de 196 px a 90, y a 34 plegada—, paneles laterales con ancho y alto de sección
> arrastrables, **cubo de vistas** como el de AutoCAD, y `Abrir` uno solo para IFC y DXF.
>
> **En desarrollo el visor queda en `window.aerobim`**, que es lo que permite comprobar una
> selección sin ojos: `window.aerobim.pickPlan(x, y)` devuelve el trazo bajo esas coordenadas de
> pantalla. En producción no existe.
>
> **Salir del aislamiento ya no es "Ver todo".** Aislar apila lo que estaba oculto y salir lo
> devuelve —lo apagado a mano sigue apagado—; el aviso y las dos salidas viven en la barra de
> estado, que se ve en las tres pestañas. Verificado en el navegador sobre un modelo cargado.
>
> ### El IFC4 de OpenBuildings (`716-LCD-ME-ISUP-D-TEST00.ifc`), revisado
>
> | Lo que se veía                               | Lo que era                                                                                        |
> | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
> | "125 elementos no cargados"                  | Falso positivo: `IFCINDEXEDPOLYCURVE`, `IFCGRIDAXIS`, `IFCACTORROLE` no son elementos — corregido |
> | 15 bloques de propiedades con solo su nombre | Los psets **del tipo** se leían como atributos: ahora se expanden, y un pset vacío no se muestra  |
> | `UnitWeight = 40.1 g`                        | El archivo declara la masa en **gramos** y el dato es kg/m: sale marcado como "(deducida)"        |
>
> Lo demás lee bien: 1.316 elementos, 1.311 con geometría, 27 categorías, 2,2 s de conversión en
> el worker, 3,7 MB de Fragments, y las cantidades con sus unidades. Queda abierto que el
> **`IfcGrid` no se dibuja** — y es justo lo que serviría para alinear el DXF con el modelo,
> porque el plano trae su capa `0-EJES`.
>
> ## Lo anterior: confirmar la perpendicular y abrir la Fase 2
>
> **La Fase 1 está completa** y `F0.6` cerrada. Lo que queda antes de la Fase 2 son dos
> confirmaciones del usuario y una idea suya que quedó a medio camino:
>
> 1. **La medición perpendicular, en uso real.** Se rehízo para que **se vea la perpendicularidad**:
>    el primer clic marca la cara de referencia —una cruz con su normal saliendo— y la cota se dibuja
>    con **la escuadra del ángulo recto** en el pie, que es la notación de un plano y lo que el usuario
>    pedía ("no marca esa perpendicularidad para poder medir"). Las marcas escalan con la distancia a
>    la cámara y se apagan y borran con su medición. **No se pudo verificar en el navegador de
>    pruebas** (ver el aviso de más abajo sobre pestañas que no pintan): hay que preguntarle.
> 2. **Llevar la selección al árbol.** El usuario lo pidió y luego lo reorientó: prefiere **un botón
>    para apagar y encender lo seleccionado**, y eso está hecho —en la ficha del elemento y en la
>    cinta, con "Aislar" al lado—. Queda pendiente, si lo vuelve a pedir, **resaltar el elemento
>    seleccionado en el árbol y desplegar el camino hasta él**: los datos ya lo permiten, porque el
>    árbol dejó de recortar los hijos de los grupos grandes (se listan treinta y el resto a un clic).
> 3. **Fase 2 — nubes de puntos.** El as-built contra el modelo, que es la comparación que hoy nadie
>    puede hacer sin software de pago.
>
> ### Lo que ya se resolvió con los modelos reales del usuario
>
> Los dos IFC están en `apps/web/public/samples/` (fuera de git por el `.gitignore`), así que se
> pueden volver a usar: `Piso 5.ifc` de BricsCAD y `716-LCD-ME-ISUP-D-TEST.ifc` de ProStructures.
>
> | Lo que se veía                                 | Lo que era                                                   |
> | ---------------------------------------------- | ------------------------------------------------------------ |
> | Clic en un pilar, se seleccionaba otro         | El rayo restaba dos veces el borde del lienzo — `F1.11`      |
> | Faltaba la mitad del modelo de planta          | 433 `IfcProxy` que el conversor no procesa — `F1.10`         |
> | El modelo quedaba mitad sólido, mitad fantasma | El estado pintado no se rehacía tras cada operación          |
> | Al peso le faltaban los kilos                  | El archivo lo escribe como `IFCLABEL('579.84')`              |
> | "7 puertas sin cargar" con 10 dibujadas        | `IfcDoorStyle` es un tipo, no una puerta: falso positivo mío |

### El aviso de geometría que falta: cómo se usa

El visor cuenta las clases del archivo antes de convertir, las compara **por cantidad** con lo que el
modelo cargó, y lo avisa en la fila del modelo con un `⚠` y el número. Desplegando la fila salen las
clases y el detalle de cuántos de cuántos.

**Compara cantidades y no presencia** a propósito: si de quinientas tuberías llegaran trescientas, la
clase aparecería entre las cargadas y una comparación por nombre no diría nada. Con modelos de Bentley
ese es el caso que va a aparecer.

Cuando aparezca una clase nueva:

- si el conversor no la procesa, se añade a `importer.classes.elements` con su constante de `web-ifc`
  — es una línea, y hay que ponerla **en los dos sitios**: `packages/viewer/src/converter.ts` y
  `apps/web/src/convert.worker.ts`, porque el worker no puede importar el paquete del visor sin
  arrastrarse three.js entero;
- si la clase sí está en el conjunto, entonces es `web-ifc` con esas representaciones. Palancas por
  orden de coste: `importer.webIfcSettings` (`MEMORY_LIMIT`, `CIRCLE_SEGMENTS`, tolerancias de
  intersección de planos), subir la versión de `web-ifc`, o convertir ese modelo con IfcOpenShell en
  la Fase 3. **Ninguna se toca a ciegas.**

`elemento-sin-geometria.ifc` es el oráculo del aviso: un muro con geometría y una tubería sin
representación, y el aviso tiene que señalar la tubería y nada más.

### El error al girar, cerrado (2026-08-19)

El usuario lo reprodujo y **no era una excepción**: era el modelo quedando **mitad sólido y mitad
fantasma** al alternar proyección y aspecto. Fragments dibuja por niveles de detalle y la geometría
que entra nueva llega con su material original, sin el resaltado. Se repintaba solo en vista fantasma
y solo al descansar la cámara.

Ahora **todo lo que cambia la pantalla pasa por un único `refresh()`** que deja el estado consistente.
La misma causa producía el otro síntoma que parecía independiente: el violeta del elemento
seleccionado desaparecía al orbitar, y por eso la selección parecía no funcionar.

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

### `F0.6` cerrada: la conversión corre en un worker

**Los números que la decidieron.** Con el modelo grande la conversión tarda unos diez segundos, y en
el hilo principal eran diez segundos de interfaz congelada. Ahora corre en un worker: mismo
`web-ifc`, mismo WASM local, otro hilo del mismo navegador. **Sin backend y sin tocar el
local-first**, así que la Fase 3 sigue siendo opcional para esto.

El panel de modelos informa dónde convirtió cada uno, y `diag.html?modo=conversion` compara las dos
rutas midiendo lo que importa: no cuánto tarda, sino **cuánto bloquea**. Ese modo detecta cuándo no
puede medir —en una pestaña oculta el navegador limita los temporizadores a un segundo y todas las
cifras salen iguales— y lo avisa en vez de mentir.

Las cifras del modelo grande, medidas en la aplicación:

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

### Estado al cierre de la sesión del 2026-08-19

La aplicación hace, verificado sobre los dos modelos reales: abre varios IFC —la conversión en un
worker, sin congelar la interfaz—, recorre el árbol, selecciona con la ficha de propiedades y **cada
número con su unidad**, apaga y aísla el elemento seleccionado, corta por tres ejes, mide distancia
—directa, en planta y desnivel—, ángulo, área y perpendicular, lista las mediciones para apagarlas
una por una, guarda vistas con nombre que sobreviven a recargar, avisa cuando el archivo trae
elementos que no se cargaron, y reparte la pantalla como Revit.

**127 pruebas** en `bim-core`. Build, lint y formato verdes.

### Y después, en este orden

1. **`F1.10` — la geometría que falta.** Ver el aviso del principio. Es lo único que hace que
   el visor mienta sobre el modelo, y por eso va antes que cualquier mejora.
2. **El error al girar**, con el mensaje que dé la consola del usuario.
3. **Confirmar la perpendicular en uso real.** Está hecha —dos clics, cara y punto— y su
   geometría tiene seis pruebas, pero **la interacción no se pudo verificar**: en el navegador
   de pruebas ningún rayo encuentra geometría después de un par de refrescos. Si no encuentra
   la cara, lo primero que hay que probar es **no encender el medidor de distancia** en ese
   modo (`setMeasureMode`, en `packages/viewer`): se enciende solo para que dibuje el marcador
   de ajuste, y su selector lee píxeles de la escena.
4. **Más tipos de cota, si se piden:** `VolumeMeasurement` de la librería mide el volumen de
   los elementos que se le señalen, y sería lo siguiente para mediciones de cantidades.
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
`camara`, `arbol`, `seleccion`, `medir`, `cortes`, `perpendicular`, `conversion`, `psets`.

**`psets` es el más útil para revisar datos:** lee un elemento **por categoría** en vez de buscarlo
con el ratón, y muestra cada propiedad con su unidad y con el tipo que declara el archivo. Es lo que
resolvió por qué al peso le faltaban los kilos.

`http://localhost:5173/diag.html?modo=psets&categoria=IFCMEMBER&ifc=/samples/tu-modelo.ifc`

**Aviso sobre navegadores que no pintan:** en una pestaña oculta —el panel de vista previa de
un agente, por ejemplo— el rayo funciona las primeras veces y después deja de encontrar
geometría, porque cada refresco la deja en un estado que no se resuelve hasta dibujar un
fotograma. Ahí `diag.html` da falsos negativos y **lo visual hay que confirmarlo en un
navegador a la vista.**

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
