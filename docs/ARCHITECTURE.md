# Arquitectura — AeroBim

> Estado al **2026-10-05**: construido el visor (fases 0 a 2 y 4 a 5 en la interfaz), el registro
> documental ISO 19650 con su portal (`services/api`), los planos 2D y generados, la nube de puntos y,
> desde la Fase 13, los **perfiles** y los **dos espacios de trabajo**. Queda como diseño la vista
> geoespacial (Fase 6). Lo que falta de cada fase, con su estado exacto, está en `MASTER_PLAN.md`, que
> es la fuente de verdad; este documento describe **cómo está hecho**, no qué sigue.

## El principio que ordena todo

**El dominio no sabe de Three.js, y la escena no sabe de reglas de negocio.**

Es la misma separación que hace útil a `mission-core` en AeroPlanner: lo que se puede probar en Node
sin navegador vive aparte de lo que necesita una GPU. En un visor la tentación de mezclar es fuerte
—"esto es solo geometría"— y hay que resistirla, porque el día que la coordinación necesite correr en
un servidor, o que haya que exportar un BCF sin abrir la pantalla, el código tiene que dejarse.

## Paquetes

```
aerobim/
├── apps/
│   └── web/              React 19 + TypeScript + Vite. La aplicación.
├── packages/
│   ├── bim-core/         Dominio puro. Sin React, sin Three.js, sin DOM.
│   └── viewer/           Envoltura del visor: escena, cámara, selección, cortes, planos.
└── services/
    └── api/              Django 6 + DRF: portal, registro documental, BCF, interferencias.
```

No hay un `services/worker`: **lo pesado corre dentro de `services/api`**, como procesos de fondo que
lanza el propio servidor (la revisión de interferencias, la conversión DWG → DXF). Un servicio aparte
con su cola es una pieza más que desplegar y vigilar para una carga que hoy no la pide.

### `packages/bim-core` — el dominio

Sin React, sin Three.js y sin DOM: se prueba en Node. Lo que hay, por carpeta:

| Carpeta     | Qué es                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `identity/` | El **GUID de IFC como identidad** y la conversión desde los identificadores efímeros de cada motor |
| `units/`    | Conversión desde las unidades que declara el IFC: todo va en SI dentro                             |
| `measure/`  | Distancias, ángulos, áreas y pendientes; los tipos de medición                                     |
| `inspect/`  | Lo que se lee del IFC sin escena: ficha, psets, el IFC comprimido (`.ifczip`)                      |
| `plans/`    | Planos 2D: capas, calce de un plano sobre el modelo, escalas                                       |
| `nubes/`    | Octree COPC, qué nodos bajar, calce nube ↔ modelo, desviación, **qué parte cae en una franja**     |
| `perfiles/` | **Perfiles**: el eje como polilínea con PK, sus tramos, la franja de cada uno, las estaciones      |
| `views/`    | Vistas guardadas y su persistencia                                                                 |
| `registro/` | El viewpoint de una observación, y lo que cruza con el registro documental                         |
| `color/`    | El sistema de diseño y su contraste medido                                                         |

Lo que **no** entra: nada que necesite un `canvas` para probarse.

### `packages/viewer` — la escena

Envuelve `@thatopen/components` y Three.js. Existe como paquete aparte por una razón concreta:
**aísla el punto de ruptura**. That Open rompió su API entre 2.x y 3.x, y volverá a hacerlo; si la
aplicación entera importa sus componentes directamente, una migración toca cientos de archivos. Con
la envoltura, toca uno.

`BimViewer` (`index.ts`) es la fachada y sigue siendo grande: **no se parte de golpe**. Lo que cada
entrega toca se extrae a su módulo, y la fachada pública no cambia:

| Módulo                                   | Qué hace                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `converter.ts`                           | IFC → Fragments en un Web Worker: recibe bytes y devuelve bytes, sin escena                              |
| `nubes.ts`                               | Carga la nube por tramos y la dibuja; consulta de los puntos de una franja, **sin mirar la cámara**      |
| `plan.ts`                                | El plano 2D (DXF) y su calce                                                                             |
| `drawings.ts`                            | Genera planos **desde el modelo** (planta, alzados) y **perfiles**; proyecta aristas con `EdgeProjector` |
| `perfiles.ts`                            | Las tablas de un perfil: PK escrito, referencias cruzadas                                                |
| `cuadros.ts`, `cuadro-en-plano.ts`       | Cuadros de cantidades y su exportación dentro de la lámina                                               |
| `cotas.ts`, `senalar.ts`, `etiquetas.ts` | Mediciones y su anotación                                                                                |
| `desviacion.ts`                          | Distancia nube ↔ modelo                                                                                  |
| `grid.ts`                                | Ejes de replanteo                                                                                        |

### `apps/web` — la aplicación

React 19, igual que AeroPlanner. Aquí viven los paneles, el árbol, las tablas y el estado de
interfaz. **Son dos páginas del mismo build** (`F8.6`): `index.html` es el visor de modelos y planos,
y `documento.html` el del PDF con las observaciones dibujadas encima. La separación es de coste: un
PDF en el visor 3D cargaría Three.js y el WASM de `web-ifc` para nada. Comparten build, assets y el
paso de limpieza, y Django las sirve las dos detrás del login.

**Qué visor abre qué lo decide un solo sitio**, `apps/documents/abribles.py`, por la extensión: si
hay algún visor que lo abra, y si lo abre **este**.

#### Los dos espacios de trabajo (Fase 13)

La aplicación tiene **dos espacios** sobre **un solo motor**:

| Espacio               | Es el trabajo de                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Modelo 3D**         | Revisar y coordinar: árbol, propiedades, nube, calce, cortes, mediciones, observaciones, BCF      |
| **Planos y perfiles** | Sacar, leer y entregar: planos 2D, planos generados, perfiles, láminas, comparar plano con modelo |

**Un espacio solo cambia qué se muestra**: qué secciones del navegador y qué grupos o botones de la
cinta. La escena, la selección, los cortes y la cámara son los mismos, y por eso cambiar **no
reconvierte nada**. Las reglas viven en `apps/web/src/espacios.ts` —datos y funciones puras, con
pruebas— y se declara **lo oculto**, no lo visible: una herramienta nueva aparece en los dos espacios
hasta que alguien decide dónde no va. Abrir un DXF o generar un perfil lleva solo a _Planos y
perfiles_. La decisión y su porqué, en `docs/UX.md`.

El estado de la aplicación sigue en `App.tsx`, una sola vez. No hay un estado observable del visor
(`ViewerSnapshot`): no hizo falta para cambiar de espacio, y se introduce cuando algo lo necesite.

### `services/api` — el portal, el registro y las credenciales

Django 6 + DRF por coherencia con AeroControl. `ifcopenshell` es Python, así que la extracción de
metadatos, la validación IDS y las interferencias caen del mismo lado. Aplicaciones:

| App         | Qué hace                                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`  | Usuarios, roles, tokens, sesiones, auditoría                                                                                                                                           |
| `core`      | Lo común: modelo base, avisos, auditoría de solo agregar, middleware de CSP y log, exportación CSV                                                                                     |
| `projects`  | Obras (proyectos) y su tablero                                                                                                                                                         |
| `documents` | **El registro documental ISO 19650**: entregables y revisiones, estados, observaciones, BCF 2.1 (escrito a mano y verificado con `bcf-client`), IDS, interferencias, láminas, informes |
| `visor`     | Sirve el visor empaquetado detrás del login                                                                                                                                            |

**Se portó la forma de AeroControl, no su dominio**: el contrato de permisos —que vive en
`AGENTS.md`—, la auditoría de solo agregar, el acotado por organización. **La base de datos es
propia**: ninguna aplicación comparte base con otra; la integración es por archivo y por API.

Lo pesado (revisar interferencias de dos IFC de decenas de megas, convertir un DWG) **no corre dentro
de una petición**: lo lanza un proceso de fondo que deja el resultado como aviso. Un IFC se guarda y
se sirve **comprimido** (`.ifczip`, `gzip` en el servidor): el de obra pesa 34 MB.

> **Dos cosas del despliegue que romperían el visor sin dejar rastro**, escritas en
> `config/settings/prod.py` y en `docs/DEPLOY.md`: nunca servir `COOP` ni `COEP` —activan el WASM
> multihilo de `web-ifc`, que no funciona empaquetado, y el visor se cuelga **sin error**— y la CSP
> necesita `'wasm-unsafe-eval'` y `worker-src 'self' blob:`. Y ninguna librería descarga su WASM de un
> CDN: se empaqueta con `?url`.

Las fases 0 a 2 del visor siguen abriendo un archivo local **sin necesitar servidor**: el portal es la
puerta, no un requisito para mirar un modelo.

## El flujo de un modelo

```
   IFC en disco (o .ifczip, o desde el registro)
        │
        ▼
   Web Worker del navegador ── web-ifc (WASM, un solo hilo) ──► Fragments ──► escena Three.js
                                                                                  │
                                                                                  ▼
                                                  árbol espacial · propiedades · psets · planos · perfiles
```

La conversión corre en un **Web Worker, monohilo** (`F0.6`, cerrada): el WASM multihilo de `web-ifc`
no funciona empaquetado. `packages/viewer` recibe **Fragments**, no un IFC: de dónde vinieron es
problema de la capa de arriba.

### Por qué Fragments y no IFC directo en la escena

Un IFC es texto con referencias cruzadas: para dibujar un muro hay que resolver su representación, su
perfil, su material y su ubicación relativa, y eso se paga cada vez que se abre el archivo. Fragments
es el resultado ya teselado en binario (FlatBuffers).

La contrapartida honesta: es un formato de un proyecto, no un estándar. Si That Open lo abandona, los
`.frag` guardados dejan de tener quién los lea — pero el IFC original sigue ahí. **Nunca se guarda
solo el Fragments; el IFC de origen es la fuente de verdad.**

## Planos y perfiles: lo que se genera y lo que no

La aplicación **no modela ni procesa**: abre lo que otro produjo. Un plano o un perfil generado es una
**vista de lectura** del modelo abierto, igual que los planos de la Fase 7:

- Un **plano generado** proyecta las aristas de lo que está encendido (`EdgeProjector`) y se exporta a
  DXF y a lámina PDF.
- Un **perfil** es la **proyección de una franja**, no un corte exacto: el eje es una polilínea con PK,
  cada tramo se mira de lado y se coloca **desarrollado** en su PK, con transversales opcionales. Si hay
  una nube abierta, **sus puntos** de la franja entran en una capa aparte —solo si está calzada con el
  modelo—. **Nunca se infiere una línea de terreno ni se calcula una superficie**: eso sería procesar.
- Ambos salen por el mismo camino de exportación; el perfil no tiene un exportador propio.

## Las dos vistas, y por qué son dos

| Vista                    | Motor                | Para qué                                       |
| ------------------------ | -------------------- | ---------------------------------------------- |
| **Modelo** (Fases 1–5)   | Three.js + That Open | Coordinar: árbol, psets, cortes, BCF, clashes  |
| **Geoespacial** (Fase 6) | CesiumJS             | Situar: ortofoto, terreno, contexto de la obra |

(No confundir con los dos _espacios de trabajo_ de arriba: esos son dos formas de usar **el mismo**
motor de modelo. Esto son dos **motores**.)

Podrían haber sido una sola, y sería peor. La vista de modelo trabaja en coordenadas locales de
proyecto con precisión de milímetros; la geoespacial trabaja sobre un elipsoide con coordenadas de
siete cifras. Forzar ambas al mismo motor significa o perder precisión en el modelo, o arrastrar doble
precisión en toda la escena.

**El puente entre ambas** es `IfcSite` y el mapa de conversión del modelo — la única pieza que traduce
coordenadas locales a globales. Vive en `bim-core`, con su CRS declarado. **La vista geoespacial
(Fase 6) no está construida.**

## Las nubes de puntos, y su límite

La nube entra en la escena de la vista de modelo para poder compararla con el modelo. Se lee por
tramos desde un **COPC** (octree sobre LAZ): el navegador descarga lo que cabe en pantalla, no el
archivo. Dos consultas, que no se confunden:

- **Para dibujar**: lo que se ve, con presupuesto de pantalla (depende de la cámara).
- **Para medir y perfilar**: lo que cae en una franja o en una zona, **sin mirar la cámara** — el mismo
  eje da el mismo perfil con cualquier posición.

**La conversión ocurre fuera de la aplicación**, con `PotreeConverter` o `pdal`: convertir es un
pipeline de procesamiento, y esta familia de aplicaciones no procesa. Un LAZ que no es COPC se avisa
con las instrucciones para convertirlo.

## Seguridad

Reglas heredadas de AeroControl y AeroPlanner, vigentes con la API:

- Toda ruta que maneje datos de usuario valida el token como primera operación, y toda consulta se
  acota con el ID del usuario autenticado tomado del token — **nunca con un identificador enviado por
  el cliente**.
- Las cargas de archivo se validan por extensión, tipo MIME y tamaño máximo, y **nunca se usa el
  nombre de archivo del usuario en el filesystem**. Un IFC llega de fuera: es entrada hostil.
- Los `.env` no se confirman, y el secreto de firma debe ser aleatorio de verdad en producción.
- Nunca se exponen errores crudos ni trazas al cliente.
- Lo que se pone en `apps/web/public/` se publica: lo que va al build lo decide la **lista blanca** de
  `apps/web/scripts/limpiar-dist.mjs`.

## Lo que esta arquitectura deja fuera a propósito

- **Un servidor de teselas propio.** COG por rangos HTTP y Fragments servidos como estáticos alcanzan.
- **Una base de datos compartida con las aplicaciones hermanas.** Regla de la familia.
- **Estado de sesión en el servidor para el visor.** Lo que el usuario ve —cámara, visibilidad,
  cortes— es estado de cliente. Solo se persiste cuando alguien lo guarda como vista o como viewpoint.
- **Procesar, modelar o inferir geometría**: terreno, superficies, `IfcAlignment`. Ver `AGENTS.md`.
