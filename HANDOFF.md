# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** La historia detallada vive en `git log`.
> La **fuente de verdad del trabajo pendiente** es [MASTER_PLAN.md](MASTER_PLAN.md).

## Cómo seguir (leer esto primero)

**Rama de trabajo: `codex/fase-0-andamiaje`, con PR abierto y sin fusionar.** El
monorepo compila, 49 pruebas pasan, y el stack quedó validado con cifras sobre un
modelo real. Falta cerrar una cosa, y es la importante.

### El siguiente paso, y está acotado

**Reemplazar `IfcLoader.load` por `FRAGS.IfcImporter` + carga del `.frag`.**

`IfcLoader.load` —la capa de conveniencia de `@thatopen/components`— **no completa de
forma reproducible y no emite ningún error**: la interfaz se queda en "convirtiendo",
con la consola y la red limpias. Está documentado en detalle en
[MASTER_PLAN.md](MASTER_PLAN.md) → _Estado de `F0.4`_, con la lista de lo que se
descartó midiendo (WASM, worker, aislamiento de origen, React, tamaño del modelo,
resolución de módulos, duplicación de dependencias).

La vía alternativa **ya está medida y funciona**: `FRAGS.IfcImporter` convirtió el
modelo real en **643 ms**. Es menos magia y más control, y encaja con `F0.6`, que de
todos modos exige separar "convertir" de "mostrar".

Herramienta para trabajar en esto: `apps/web/public/diag.html`, que ejecuta el
pipeline **sin la interfaz** y compara ambos caminos.

```bash
npm run dev
```

Luego `http://localhost:5173/diag.html?modo=manual&ifc=/samples/muro-minimo.ifc`.

### Lo que ya está cerrado con datos

- **El stack sirve.** El IFC real (1,52 MB, IFC2X3 de BricsCAD) parsea en **24 ms** y
  convierte a Fragments en **643 ms**, con un `.frag` de 113 KB — **13,7× más chico**.
  La promesa de Fragments se cumple, así que `F0.5` está lista.
- **El GUID de IFC está verificado contra un oráculo externo**: los 579 GUID del
  modelo real, generados por BricsCAD, sobreviven el round-trip sin una sola
  diferencia.
- **`F0.3`**: monorepo con build, lint, formato y pruebas verdes.

### Y después, en este orden

1. **`F0.6`** — decidir dónde corre la conversión con los números ya medidos. Define
   si el backend de la Fase 3 es opcional u obligatorio.
2. **Fase 1 — visor IFC usable.** Árbol espacial, propiedades y psets, cortes,
   mediciones y varios modelos a la vez. Con eso ya hay algo que alguien de oficina
   técnica usa en vez de pedir una licencia de escritorio.
3. **Fase 2 — nubes de puntos.** El as-built contra el modelo, que es la
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

1. **El despliegue necesita las cabeceras COOP/COEP.** Sin
   `Cross-Origin-Opener-Policy: same-origin` y
   `Cross-Origin-Embedder-Policy: require-corp`, `crossOriginIsolated` queda en `false`,
   no existe `SharedArrayBuffer` y el WASM multihilo de `web-ifc` no puede usarse. Están
   en `vite.config.ts` para `server` y `preview`; **producción también las necesita**.
2. **`@thatopen/components` no declara `exports`** y su `main` apunta a un `.cjs`. Hay
   un alias en `vite.config.ts` que fuerza el ESM. No es la causa del cuelgue de `F0.4`,
   pero apuntar al ESM es lo correcto.
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

## Decisiones pendientes que solo el usuario puede tomar

- **Nombre de despliegue y dominio** (`bim.<dominio>`), y si comparte VM con las
  otras aplicaciones.
- **Modelos de prueba adicionales.** `Piso 5.ifc` es de arquitectura y mediano. Para
  saber si el visor aguanta lo que viene, conviene un modelo grande (>50 MB) y uno de
  estructura o instalaciones.
