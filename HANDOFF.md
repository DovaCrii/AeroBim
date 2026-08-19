# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** La historia detallada vive en `git log`.
> La **fuente de verdad del trabajo pendiente** es [MASTER_PLAN.md](MASTER_PLAN.md).

## Cómo seguir (leer esto primero)

**Rama de trabajo: `codex/fase-0-andamiaje`, con PR abierto y sin fusionar.** La Fase 0
está **completa salvo `F0.6`**: el monorepo compila, 49 pruebas pasan, y un IFC de obra
real abre y se ve en poco más de un segundo.

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

### El siguiente paso

**`F0.6`: decidir dónde corre la conversión**, ahora que hay números. Con medio segundo
por modelo en el navegador, la respuesta se inclina fuerte hacia dejarlo del lado del
cliente y que el backend de la Fase 3 sea solo persistencia — pero conviene medir antes
un modelo grande (>50 MB), porque la conversión ocurre en el hilo principal y ahí sí
podría congelar la interfaz.

```bash
npm run dev
```

Herramienta de medición: `apps/web/public/diag.html`, que ejecuta el pipeline **sin la
interfaz** y compara la ruta directa contra la envoltura:

`http://localhost:5173/diag.html?modo=clase&ifc=/samples/muro-minimo.ifc`

### Y después, en este orden

1. **Fase 1 — lo que queda:** varios modelos a la vez (`F1.5`) y vistas guardadas (`F1.6`).
   Con `F1.5` la Fase 1 queda cerrada, y es la que falta para coordinar de verdad: mirar dos
   disciplinas juntas.
   - **`F1.2` tiene un cabo suelto honesto:** el código lee psets pero **no se ha podido
     verificar con un archivo que los traiga**, porque el modelo de prueba se exportó sin
     ellos. Hace falta un IFC con psets para cerrarlo de verdad.
   - **That Open trae mucho más hecho de lo que se está usando.** Antes de escribir código
     para las tareas que quedan, revisar sus componentes: `Clipper` (cortes), `Hider`
     (visibilidad), `MeasurementUtils` y las anotaciones, `OrthoPerspectiveCamera` con
     `PlanMode`/`OrbitMode`/`FirstPersonMode`, `ShadowedScene`, `EdgeProjector`,
     `TechnicalDrawings` + `DxfExporter`, `Views`/`Viewpoints`, `Classifier`, `ItemsFinder`
     e `IDSSpecifications`. Varias fases del plan pueden ser integración en vez de
     construcción.
2. **Fase 2 — nubes de puntos.** El as-built contra el modelo, que es la
   comparación que hoy nadie puede hacer sin software de pago.

### El modelo de prueba no está en el repositorio

`Piso 5.ifc` es dato de la organización y `.gitignore` excluye todo `*.ifc`. Para
repetir las mediciones hay que copiarlo a `apps/web/public/samples/piso-5.ifc`. Sí se
versiona `muro-minimo.ifc`, un fixture sintético de 2 KB escrito a mano —un muro de
4000 × 200 × 3000 mm— que sirve para probar el pipeline y de paso delata un error de
unidades: el visor debe reportar 4,0 × 0,2 × 3,0 m, no miles de metros.

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
- **Pruebas:** 49 en `packages/bim-core`, incluidos los vectores de GUID reales.
- **Código:** monorepo armado — `packages/bim-core` (dominio puro), `packages/viewer`
  (envoltura de That Open) y `apps/web` (React 19 + Vite 8 + Tailwind 4).
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
