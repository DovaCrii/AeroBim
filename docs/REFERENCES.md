# Referencias — AeroBim

Verificado el 2026-08-18 contra la API de GitHub, los registros de npm y PyPI y los
sitios oficiales de cada proyecto. Antes de portar una línea de código de cualquiera
de estos proyectos, confirmar la licencia aquí y registrar el origen en el archivo
destino.

## Regla de licencias

AeroBim es MIT y debe seguir siéndolo.

| Licencia del origen        | Qué se puede hacer                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| **MIT / BSD / Apache-2.0** | Portar y adaptar código, manteniendo el aviso de copyright del original                               |
| **MPL-2.0**                | Usar como dependencia sin condiciones. Si se **modifica un archivo suyo**, ese archivo queda bajo MPL |
| **LGPL**                   | **Enlazar como librería o invocar como proceso, sí. Copiar su código al nuestro, no**                 |
| **GPL**                    | **Solo leer como referencia conceptual.** No copiar código                                            |
| **AGPL**                   | **Solo consumir como servicio separado**, en su propio contenedor y por su API. No enlazar su código  |
| **CDDL**                   | Referencia conceptual. Copia archivo por archivo con obligaciones; no vale la pena                    |

Una línea copiada de un proyecto GPL o AGPL contamina el repositorio completo. Ante
la duda, se reimplementa desde la documentación, no desde el código.

**El matiz de LGPL importa aquí**, porque el mejor backend IFC lo es: invocar
`ifcopenshell` como librería de Python o `ifcclash` como proceso está permitido y no
obliga a liberar nuestro código. Copiar fragmentos de su código fuente al nuestro,
sí. La distinción es la que hace viable la Fase 3.

---

## El visor: la decisión central

### That Open Company (ex IFC.js) — ELEGIDO

| Repositorio / paquete                                     | Licencia    | Estrellas | Actividad                            |
| --------------------------------------------------------- | ----------- | --------- | ------------------------------------ |
| `ThatOpen/engine_components` → npm `@thatopen/components` | **MIT**     | ~693      | v3.4.0 abr-2026; npm 3.4.8; jul-2026 |
| `ThatOpen/engine_web-ifc` → npm `web-ifc`                 | **MPL-2.0** | ~1.010    | npm 0.0.77; push ago-2026            |
| `ThatOpen/engine_fragment` → npm `@thatopen/fragments`    | **MIT**     | ~201      | npm 3.4.7; push jul-2026             |

<https://github.com/ThatOpen/engine_components>

Ecosistema completo sobre **Three.js**: `@thatopen/components` (núcleo),
`@thatopen/components-front` (herramientas de interfaz) y `@thatopen/ui`. Cadencia de
releases sana y sostenida: v3.1 jul-2025, v3.2 oct-2025, v3.3 ene-2026, v3.4 abr-2026.

**Qué trae que nos importa:** lector IFC en WASM, árbol espacial, propiedades y psets,
planos de corte, mediciones, planos de planta, exportación DXF, postproducción, y el
componente **BCFTopics** con import/export de BCF 2.1 y 3.0 (topics con prioridad,
responsable y vencimiento; viewpoints con cámara y GUIDs de entidades).

**Fragments** es su formato binario sobre FlatBuffers: convierte el IFC una vez y las
aperturas siguientes cargan mucho más rápido sin bloquear el hilo principal. Es su
respuesta al problema de los modelos grandes, y la razón principal de elegirlos —
razón que `F0.5` debe **medir**, no dar por buena.

**Riesgo registrado:** rompieron la API entre 2.x y 3.x (Fragments v2), y volverán a
hacerlo. Hay que fijar versiones alineadas de `three`, `web-ifc` y
`@thatopen/fragments`, y por eso existe `packages/viewer` como envoltura. Curva de
aprendizaje media, con buena documentación en docs.thatopen.com.

### xeokit-sdk — descartado por licencia, no por calidad

<https://github.com/xeokit/xeokit-sdk> · **AGPL-3.0** (verificado), con licencia
comercial de pago vía xeolabs / Creoox AG. ~923 estrellas, npm
`@xeokit/xeokit-sdk` 2.6.112, push ago-2026.

Conviene dejar escrito **qué se está perdiendo**, para no reabrir la discusión con
información incompleta:

- Es el visor BIM web más pulido y maduro del ecosistema open-source.
- **Doble precisión para coordenadas globales** — exactamente el problema que la
  Fase 6 tendrá que resolver a mano.
- Su `LASLoaderPlugin` carga **LAS/LAZ 1.4 en la misma escena que el IFC**, listo para
  usar. Es el único visor OSS que trae IFC + nube de puntos integrado; en nuestra ruta
  eso es trabajo de la Fase 2.

**Por qué queda fuera igual:** la AGPL-3.0 obliga a liberar el código de la aplicación
completa si se sirve por red. Para una herramienta interna de la organización eso
podría discutirse; para cualquier escenario de producto, no. El precio de la licencia
comercial no es público. **Si algún día hay presupuesto, esta es la alternativa a
evaluar primero.**

### Speckle — referencia, no dependencia

<https://github.com/specklesystems/speckle-server> · **Apache-2.0 con excepción**: los
módulos `workspaces/` y `gatekeeper/` del servidor son Enterprise Edition propietaria
(modelo open-core, verificado en su `LICENSE`). El visor npm `@speckle/viewer` (2.31.14)
sí es Apache-2.0 limpio. ~834 estrellas, push diario. Serie A de 12,5 M USD.

Es una **plataforma de colaboración**, no una librería de visor: importa IFC en el
servidor (con motor IfcOpenShell, hasta 1 GB), versiona modelos, tiene comentarios y
markups, y conectores para Revit, Rhino, Blender y QGIS.

**Por qué no se adopta:** su visor consume objetos Speckle, no IFC directo, así que
tomarlo suelto obliga a adoptar su modelo de datos y con él toda la arquitectura. Y
sus comentarios **no son BCF nativo**: si el requisito es interoperar con Navisworks o
Solibri —y lo es— Speckle no lo resuelve solo. Excelente referencia de cómo se ve un
flujo de colaboración bien hecho.

### xbim — fuera de nuestra arquitectura

<https://github.com/xBimTeam/XbimEssentials> · **CDDL**, ~569 estrellas, activo (.NET
8/10). Stack .NET; su visor web es un demostrador y el motor de geometría es **solo
Windows**. Solo tendría sentido en una organización que ya viva en .NET.

### BIMserver — no recomendado

Java, AGPL. Envejecido; no es base para un proyecto nuevo.

---

## Nubes de puntos

| Proyecto / paquete               | Licencia         | Estrellas | Estado                                         |
| -------------------------------- | ---------------- | --------- | ---------------------------------------------- |
| `potree/potree`                  | **BSD-2-Clause** | ~5.577    | Push ene-2026. Estándar de facto, avance lento |
| `potree/PotreeConverter`         | BSD-2-Clause     | ~815      | Push jun-2026                                  |
| npm `potree-core` (tentone)      | **MIT**          | —         | 2.0.15 (~abr-2026), activo                     |
| `CesiumGS/cesium` → npm `cesium` | **Apache-2.0**   | ~15.577   | Push diario                                    |
| `py3dtiles` (pip, OSGeo)         | OSS              | —         | v12.1.1 mar-2026, muy activo                   |
| PDAL (pip/conda `pdal`)          | **BSD**          | —         | Maduro                                         |

**La vía elegida para la Fase 2:** `potree-core` montado en la misma escena Three.js
del visor That Open. Ambos son Three.js, así que la integración es posible — pero es
**trabajo nuestro**, nadie la entrega hecha (a diferencia de xeokit, ver arriba).

**Conversión, siempre fuera de la aplicación:** `PotreeConverter` para LAS/LAZ y
`pdal` para pasar E57 de escáner terrestre a LAZ. `py3dtiles` convierte a 3D Tiles
para la vista geoespacial de la Fase 6.

**Riesgo registrado:** Potree avanza lento. El wrapper `potree-core` sí está activo, y
la alternativa —si el mantenimiento se detiene— es 3D Tiles sobre Cesium, que ya entra
por la Fase 6.

---

## Backend IFC

### IfcOpenShell — sin competencia real en Python

<https://github.com/IfcOpenShell/IfcOpenShell> · **LGPL-3.0**, ~2.712 estrellas, push
diario (ago-2026). Es el motor de Bonsai/BlenderBIM y del importador IFC de Speckle.
pip: `ifcopenshell` (0.8.x).

Qué se usa de él, todo como librería o proceso — nunca copiando código:

| Pieza                       | Para qué en AeroBim                                                    |
| --------------------------- | ---------------------------------------------------------------------- |
| `ifcopenshell.util.element` | Propiedades y psets en el backend (`F3.3`)                             |
| Georreferenciación          | `IfcSite` y mapa de conversión, para el puente a la vista geo (`F6.3`) |
| **IfcConvert** (CLI)        | IFC → GLB para la ruta de 3D Tiles; también OBJ y SVG (planos)         |
| `ifctester`                 | Validación **IDS** (`F3.5`)                                            |
| `ifcpatch`                  | Transformaciones sobre el modelo                                       |
| `ifccsv`                    | Exportación tabular. Fuera del MVP, deja la puerta abierta a 5D        |

Nota: la conversión **IFC → Fragments** no la hace IfcOpenShell, sino el serializador
JavaScript de That Open corriendo en Node.

### `ifcclash` — detección de interferencias

<https://docs.ifcopenshell.org/ifcclash.html> · pip, **LGPL-3.0-or-later**, parte del
proyecto IfcOpenShell.

Clash sets con filtros por consulta IFC, grupos A vs B y holgura configurable. CLI y
librería; los resultados salen en JSON. No tiene la experiencia de uso de Navisworks,
pero es real y se usa en producción (Bonsai lo integra). Base de la Fase 5.

### `bcf-client` — BCF en el backend

<https://pypi.org/project/bcf-client/> · pip, LGPL, del proyecto IfcOpenShell.

BCF-XML 2.1 y 3.0, más cliente **BCF-API 3.0** (OpenCDE). Complementa a `BCFTopics`
del frontend: lo que el navegador arma, el backend lo persiste, lo valida y lo
intercambia con otras plataformas.

---

## Geoespacial

### CesiumJS — Apache-2.0, el runtime sí; el servicio no

<https://github.com/CesiumGS/cesium> · npm `cesium`, ~15.577 estrellas, push diario.

Globo 3D con terreno cuantizado, capas de imagen y 3D Tiles para nubes y edificios.
Base de la vista geoespacial de la Fase 6, alimentada con **ortofotos y terreno
propios** (los que produce el flujo de AeroPlanner), servidos con GDAL.

Ruta abierta de IFC a 3D Tiles: `IfcConvert --use-element-guids` a GLB, y de ahí
`3d-tiles-tools` (npm, Apache-2.0) para armar el tileset.

> **Cesium ion queda fuera.** Es el servicio comercial: su plan gratuito es solo para
> uso community, y su _Design Tiler_ (desde mar-2025 tesela IFC preservando psets) es
> de pago. **Riesgo registrado:** la ruta abierta pierde parte de esa metadata, así
> que la vista de modelo sigue siendo la fuente de propiedades, no la geoespacial.

### iTwin.js — MIT en el papel, servicios de pago en la práctica

<https://github.com/iTwin/itwinjs-core> · licencia **MIT** verificada, ~726 estrellas,
push diario.

El negocio está en los servicios: sincronizar y hospedar iModels usables **requiere
suscripción a la plataforma iTwin de Bentley**; solo los snapshot iModels (locales, de
solo lectura) son libres, y la ingesta IFC depende de sincronizadores de Bentley.
Curva de aprendizaje alta. No es base para un MVP independiente.

### TerriaJS — si algún día hace falta un portal de capas

<https://github.com/TerriaJS/terriajs> · **Apache-2.0**, ~1.356 estrellas, push
ago-2026. Plataforma geoespacial llave en mano sobre Cesium, con catálogo de capas y
soporte WMS/WMTS/3D Tiles. Sin IFC nativo. Ahorra meses si el requisito llega a ser un
portal de mapas, que hoy no lo es.

---

## Estándares y formatos

### IFC — Industry Foundation Classes (ISO 16739)

El formato de intercambio de la industria. Versiones que importan: IFC 2x3 (la más
extendida en obra), IFC 4 e IFC 4x3.

### BCF — BIM Collaboration Format

Estándar de buildingSMART para intercambiar observaciones de coordinación: un tema con
su viewpoint (cámara, visibilidad, elementos por GUID) y sus comentarios. Versiones
2.1 y 3.0. **Es el formato que hace que la Fase 4 valga**: sin él, las observaciones
solo se entienden dentro de AeroBim.

### IDS — Information Delivery Specification

Especificación legible por máquina de qué información debe traer un modelo. Permite
verificar en un paso si cada elemento tiene el pset que el mandante exigió. Se valida
con `ifctester`.

### COPC y COG

**COPC** (Cloud Optimized Point Cloud): un LAZ con octree interno, para streaming
multirresolución. **COG** (Cloud Optimized GeoTIFF, <https://cogeo.org/>): raster con
teselado interno y pirámides, legible por rangos HTTP sin servidor de teselas. Los dos
formatos en que conviene recibir los productos del vuelo.

---

## Herramientas de escritorio: oráculos de verificación

No se integran; se usan para comprobar que lo nuestro dice la verdad.

| Herramienta                | Licencia  | Para verificar                                            |
| -------------------------- | --------- | --------------------------------------------------------- |
| **Bonsai** (ex BlenderBIM) | GPL       | Árbol espacial, propiedades, psets y mediciones           |
| **CloudCompare**           | GPL       | Alineación y desviaciones nube ↔ modelo                   |
| **QGIS**                   | GPL       | Georreferenciación contra un punto de coordenada conocida |
| **Navisworks / Solibri**   | Comercial | Que el BCF exportado abra con su viewpoint intacto        |

Todas son GPL o comerciales: **se usan como aplicaciones, jamás se copia su código.**
