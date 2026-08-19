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

El monorepo está armado y el stack quedó validado con cifras sobre un modelo real:
el IFC parsea en 24 ms y convierte a Fragments en 643 ms, con un archivo 13,7 veces
más chico. **La premisa técnica se sostiene.**

**Lo que queda abierto es `F0.4`**, y es la prioridad: `IfcLoader.load` —la capa de
conveniencia de `@thatopen/components`— no completa de forma reproducible y no emite
ningún error. La vía alternativa ya está medida: convertir con `FRAGS.IfcImporter` y
cargar el `.frag`. Detalle completo en _Estado de `F0.4`_, más abajo.

> **AeroBim es el frente activo de la familia** (decisión del usuario, 2026-08-19).
> AeroPlanner y AeroLink quedan en pausa; AeroControl sigue en uso, tal como está.
> **Ninguno se toca desde aquí.** Si AeroBim necesita algo de ellos, entra por el
> `MASTER_PLAN.md` de ese repositorio.

---

## FASE 0 — Andamiaje y prueba de concepto

**Objetivo de salida:** un visor que abre un IFC real y lo muestra, con el
monorepo compilando y el plan confirmado o corregido con datos.

| #      | Tarea                                                                                                     | Estado       |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------ |
| `F0.1` | Documentación de arranque: plan, MVP, arquitectura, referencias con licencias verificadas y marca         | ✅           |
| `F0.2` | Repositorio creado y publicado, MIT, con la marca en la línea de la familia                               | ✅           |
| `F0.3` | Monorepo npm: `apps/web` (React 19 + TS + Vite) y `packages/bim-core`, con build, lint y formato verdes   | ✅           |
| `F0.4` | **PoC del visor**: cargar un IFC real y navegarlo — medir tiempo de carga y memoria                       | 🟡 ver abajo |
| `F0.5` | **Medir la conversión a Fragments** sobre el mismo modelo: tiempo de conversión y tamaño resultante       | ✅ medido    |
| `F0.6` | Decidir dónde corre la conversión (navegador con WASM vs worker de backend) **con los números de `F0.5`** | ⬜           |

**Criterio de aceptación:** un IFC de obra real abre en el navegador, se puede
orbitar y seleccionar un elemento, y hay una cifra medida de cuánto costó.

### Estado de `F0.4`: el stack sirve, la integración no está cerrada (2026-08-19)

**El modelo de prueba es real:** `Piso 5.ifc`, IFC2X3 exportado por BricsCAD BIM
26.2, 1,52 MB y 32.836 líneas, en milímetros, con geometría BREP
(532 `IfcFacetedBrep`) y 470 `IfcBuildingElementProxy`.

**Lo que quedó medido y funcionando:**

| Qué                                                 | Resultado                            |
| --------------------------------------------------- | ------------------------------------ |
| Parseo del IFC con `web-ifc` (WASM, hilo principal) | **24 ms** (init del WASM: 34 ms)     |
| Conversión a Fragments con `FRAGS.IfcImporter`      | **643 ms**                           |
| Tamaño del `.frag` resultante                       | **113 KB**, frente a 1,52 MB del IFC |
| Elementos con geometría / categorías IFC del modelo | 548 / 15                             |
| `IfcLoader.load` en una corrida que sí completó     | ~975 ms; todo listo en 2,17 s        |

Eso **confirma la premisa de Fragments**: la conversión cuesta menos de un segundo y
el archivo queda **13,7 veces más chico** que el IFC. Con esas cifras, `F0.5` se da
por cumplida.

**Lo que falta y por qué `F0.4` no está cerrada:** el pipeline de `IfcLoader.load`
(la capa de `@thatopen/components`) **no completa de forma reproducible**. En la
mayoría de las corridas no resuelve nunca la promesa y **no emite ningún error**:
consola limpia, red limpia, la interfaz se queda en "convirtiendo". Se descartaron,
midiendo:

- **el WASM** — `web-ifc` parsea el mismo archivo en 24 ms;
- **el aislamiento de origen** — con las cabeceras COOP/COEP puestas,
  `crossOriginIsolated` es `true` y `SharedArrayBuffer` existe;
- **el worker** — arranca sin error, y darle a cada visor su propio blob URL no cambia
  el síntoma;
- **el tamaño del modelo** — cuelga igual con un fixture de 2 KB;
- **React** — cuelga igual en `public/diag.html`, sin interfaz ni ciclo de vida de
  componentes;
- **una carrera de arranque** — con `initialized` en `true` y 4 s de espera, igual;
- **el pre-bundling y la resolución del módulo** — con y sin `optimizeDeps.exclude`, y
  con y sin alias al ESM, igual;
- **duplicación de dependencias** — hay una sola copia de cada paquete.

**El siguiente paso es acotado y prometedor:** saltarse esa capa. `FRAGS.IfcImporter`
—que sí convierte de forma reproducible en 643 ms— más `FragmentsModels.load` del
`.frag` resultante, en vez de `IfcLoader.load`. Es menos magia y más control, y encaja
mejor con `F0.6`, que de todos modos exige separar "convertir" de "mostrar".

> **Honestidad sobre el andamiaje:** `apps/web` monta el visor, sirve el WASM local y
> muestra el panel de métricas, y `packages/bim-core` está verificado contra un oráculo
> externo (ver abajo). Lo que **no** se puede afirmar todavía es que un IFC real se abra
> y se navegue de forma confiable. Hasta entonces `F0.4` sigue abierta.

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

| #      | Tarea                                                                                            | Estado |
| ------ | ------------------------------------------------------------------------------------------------ | ------ |
| `F1.1` | Árbol espacial navegable (proyecto → sitio → edificio → planta → elemento) con aislar y ocultar  | ⬜     |
| `F1.2` | Panel de propiedades y **psets** del elemento seleccionado                                       | ⬜     |
| `F1.3` | Planos de corte y secciones                                                                      | ⬜     |
| `F1.4` | Mediciones: distancia, área y ángulo                                                             | ⬜     |
| `F1.5` | Cargar **varios modelos IFC a la vez** (arquitectura + estructura + instalaciones) y alternarlos | ⬜     |
| `F1.6` | Vistas guardadas: cámara, visibilidad y cortes, recuperables por nombre                          | ⬜     |

**Oráculo:** el mismo modelo abierto en **Bonsai/BlenderBIM** (o cualquier visor
IFC de escritorio). El árbol, los psets y las mediciones deben coincidir — un
visor que muestra propiedades distintas a las del archivo es peor que no tenerlo.

`F1.5` no es un extra: la coordinación consiste precisamente en mirar dos
disciplinas juntas. Un visor de un modelo por vez no coordina nada.

---

## FASE 2 — Nubes de puntos

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
| `IfcLoader.load` no completa y no emite error                  | Bloquea `F0.4`: el visor no abre modelos de forma confiable    | **Abierto y es la prioridad.** Descartados WASM, worker, aislamiento, React, tamaño y resolución de módulos. Vía alternativa: `IfcImporter` + carga del `.frag`      |
| That Open rompe la API entre versiones mayores                 | Migración no planificada a mitad de una fase                   | Abierto — fijar versiones alineadas de `three`, `web-ifc` y `@thatopen/fragments`. Ya se topó con que `@thatopen/components` no declara `exports` y su `main` es CJS |
| Potree tiene mantenimiento lento                               | La Fase 2 queda sobre una base que avanza poco                 | Abierto — el wrapper `potree-core` sí está activo; alternativa es 3D Tiles vía Cesium (`F6.4`)                                                                       |
| La alineación nube ↔ modelo resulta más difícil de lo previsto | `F2.4` mide desviaciones sin sentido                           | Abierto — `F2.2` se resuelve antes de prometer mediciones                                                                                                            |
| El BCF exportado no lo acepta el software del mandante         | La coordinación no interopera, que es todo su valor            | Abierto — es el oráculo explícito de la Fase 4                                                                                                                       |
| Las interferencias detectadas son tantas que nadie las revisa  | La Fase 5 se construye y no se usa                             | Abierto — `F5.5` (silenciar falsos positivos) entra en la misma fase, no después                                                                                     |
| Tercer frente abierto con AeroPlanner y AeroControl sin cerrar | Los tres avanzan a un tercio de velocidad                      | Abierto — decisión del usuario; este plan no consume tiempo de los otros repositorios                                                                                |
| La ruta IFC → 3D Tiles abierta pierde metadatos                | En la vista geoespacial los elementos no traen sus propiedades | Abierto — se acota en `F6.3`: la vista de modelo sigue siendo la fuente de propiedades                                                                               |
