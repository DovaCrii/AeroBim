# MASTER_PLAN — AeroBim

> **Fuente única de verdad del trabajo pendiente.** Consolida el estudio de
> alternativas open-source (verificado el 2026-08-18 contra la API de GitHub y los
> registros de npm/PyPI) en un tablero ejecutable con seguimiento de estado.
> **Creado:** 2026-08-18 · **Actualizado:** 2026-09-28 (diez fases cerradas; la tabla de lo que
> queda recontada fila por fila)
> **Rama base:** `main`
> **Regla de oro:** cada fase termina en algo **que alguien puede usar**. No se abre
> una fase nueva con la anterior a medio cerrar, y no se agrega alcance fuera de lo
> listado aquí sin que el usuario lo pida.

---

## Por dónde se empieza

> **Al 2026-09-28: lo que queda no lo cierra el código.** Las doce fases, el plan posterior —«que
> avise, que cuadre y que no sea plano», PRs #42 a #60— y las pasadas de uso que pidió el usuario
> después —legibilidad en oscuro, el seguimiento del equipo, archivar de verdad, «cómo se usa» por
> fases y «sacar y recibir», PRs #61 a #71— no dejan trabajo de código pendiente. Lo que falta:
>
> | Qué                                  | Quién                                                  |
> | ------------------------------------ | ------------------------------------------------------ |
> | **SMTP de Microsoft 365**            | El usuario — último bloqueo de `listo_para_produccion` |
> | **Desplegar `main` a `p340`**        | El usuario, con [docs/DEPLOY.md](docs/DEPLOY.md)       |
> | Las cinco filas de la tabla de abajo | El usuario, decidiendo o mirando un archivo de obra    |
>
> El estado de esos bloques, con lo que destaparon por el camino, está en
> [HANDOFF.md](HANDOFF.md).

**Once de las dieciséis fases con trabajo están cerradas** —las dos últimas, la 13 y la 14, se abrieron
el 2026-10-05—, y lo que queda se cuenta en una línea cada cosa. Actualizado el 2026-10-05.

| Fase                           | Estado                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0 · Cimientos**              | ✅ entera — `F0.6` cerró el 2026-09-02 y esta línea llevaba desde entonces sin actualizar                                                        |
| **1 · Visor**                  | ✅ entera — `F1.13` cerró el 2026-09-23: «Referencias», «Vistas guardadas» y «Documentar»                                                        |
| **3 · Backend**                | ✅ entera                                                                                                                                        |
| **4 · Coordinación**           | ✅ salvo `F4.5`, el trazo libre, **condicionado a que el usuario mire un BCF exportado**                                                         |
| **5 · Interferencias**         | ✅ entera                                                                                                                                        |
| **7 · Planos, salida**         | ✅ entera — capas, DXF, PDF con sello, y el plano acotado y con sus llamadas                                                                     |
| **8 · Registro documental**    | ✅ entera                                                                                                                                        |
| **9 · Diseño**                 | ✅ **entera** — `F9.6` cerró el 2026-09-07 al reescribir `docs/UX.md`                                                                            |
| **10 · Etiquetas y tablas**    | ✅ entera                                                                                                                                        |
| **11 · El portal se ve plano** | ✅ entera — incluida la ayuda con su recorrido                                                                                                   |
| **2 · Nubes de puntos**        | 🔶 abre, se maneja, calza y **entra al expediente**. `F2.4` espera **el IFC de la pasarela**                                                     |
| **12 · La interfaz**           | 🔶 los tres bloques cerrados; de `F12.2` queda **señalar tres pares con un ratón** — el par de archivos ya está en el repositorio                |
| **13 · Perfiles y espacios**   | 🔶 `F13.1`–`F13.4` construidas y verificadas **con muestras**; `F13.8` ✅; faltan `F13.5`–`F13.7` (el oráculo externo es de quien tiene la obra) |
| **16 · Línea del tiempo 4D**   | ⬜ **pospuesta a otra etapa** por decisión del usuario el 2026-10-06; solo apuntada, sin empezar                                                 |
| **15 · Revisión con marcas**   | ✅ **entera** (2026-10-06): panel y marcas en el 2D, globos y barra en el 3D, hilo con @menciones, reportes y buscador                           |
| **14 · Proceso y código**      | 🔶 `F14.1` (el kit) aplicada el 2026-10-05, a falta de las cifras de `/context`; el resto, planificada                                           |
| **6 · Geo + BIM**              | ⬜ pospuesta a propósito el 2026-09-02, para poner la coordinación delante                                                                       |

## Lo que queda, por fase

**Quedan veinte filas abiertas.** Nueve son las de siempre —las cierra el usuario, un archivo de obra o
una decisión— y eran todo lo que quedaba hasta el 2026-09-28. Desde el 2026-10-05 se suman cuatro de la
Fase 13 (`F13.5`–`F13.7` y `F13.11`; `F13.6` y `F13.7` piden archivos de obra; `F13.8`, `F13.9` y `F13.10` se cerraron el mismo día) y **siete de la Fase 14, que las cierra el
agente cuando se ejecute y hoy solo están planificadas**. `⬜` no empezada · `🔶` `◐` medida a medias ·
`❓` medida y esperando algo.

> **Esta tabla decía «veintinueve» y llevaba `F2.1`, `F2.2` y `F2.3` en `⬜` con el código escrito y
> comprobado desde el 2026-09-03.** Es el mismo error que ya se anotó una vez más abajo —«el tablero
> decía ⬜ sobre código que existe desde hace días»— y se repitió aquí. Corregido el 2026-09-09
> contando las filas una por una contra el estado de cada fase, que es lo único que no se desactualiza.

| Fase                         | Filas abiertas                                                                                                                      | Quién la cierra                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **4 — Coordinación**         | `F4.5` ◐ — falta el trazo libre, y depende de mirar un BCF exportado                                                                | El usuario, mirando                |
| **2 — Nubes de puntos**      | `F2.4` 🔶 — la medida funciona y **cuadra con un corrimiento conocido**; falta el IFC de la pasarela                                | Un archivo de obra                 |
| **12 — La interfaz**         | `F12.2` 🔶 — el par de archivos ya está en el repositorio; queda **señalar tres pares con un ratón**                                | El usuario, pinchando              |
| **2 — Nubes de puntos**      | `F2.6` ⬜ — el gaussian splatting                                                                                                   | Pospuesta por decisión             |
| **6 — Geo + BIM**            | `F6.1` a `F6.5` ⬜ — Cesium, ortofoto y terreno, situar el IFC, 3D Tiles, y recibir de AeroPlanner                                  | Pospuesta por decisión             |
| **13 — Perfiles**            | `F13.5` ⬜ `ClipStyler`, sin ensayar · `F13.6` ⬜ oráculos externos · `F13.7` ⬜ la nube real · `F13.11` ✅ falta mirarlo en un CAD | El agente / un archivo de obra     |
| **16 — Línea del tiempo 4D** | `F16.1` ⬜ — el visor de línea del tiempo (Gantt + modelo)                                                                          | Pospuesta por decisión, 2026-10-06 |
| **14 — Proceso y código**    | `F14.1` 🔶 · `F14.2`–`F14.7` ⬜ — el kit, la revisión, `R1`–`R4` y la Etapa 3 (**bloqueada**)                                       | El agente                          |
| **0, 3, 5, 7, 8, 9, 10, 11** | Ninguna: las ocho fases enteras                                                                                                     | —                                  |

## Las decisiones que solo el usuario puede tomar

No son tareas: son preguntas abiertas que bloquean o desvían trabajo, y hasta hoy estaban
repartidas por el documento.

| #                                     | Qué hay que decidir                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~`F9.6` — **tres**, y por separado~~ | **Contestada el 2026-09-07.** Herramientas flotantes: rechazada. Propiedades ancladas: rechazada. El rail: aceptado **como estado plegado** del mismo navegador, no como destinos. Escrito en `docs/UX.md`, que era la condición                                                                       |
| ~~`F1.13` — **tres nombres**~~        | ✅ **Contestada el 2026-09-23.** «Trabajo» pasa a «Referencias»; «Guardar vista» sube a un grupo propio, «Vistas guardadas», que lleva al campo del nombre; y suben «Generar plano» y «Observar» en «Documentar». Calzar y cortar a su altura se quedan con su plano: en la cinta no dirían sobre cuál |
| `F3.4` — **el umbral**                | Ya está el número que la reabre: **30 s** sobre un archivo real. Hoy lo más lento son 1,5 s                                                                                                                                                                                                            |
| ~~`F10.2` — qué es «una nota»~~       | ✅ **Contestada el 2026-09-02**: son los comentarios que ya existen, y lo que faltaba era elegir qué se imprime. Se cerró sin escribir ni un modelo nuevo — la pregunta valió más que el desarrollo que se habría hecho sin hacerla                                                                    |
| ~~`F10.3` — el papel~~                | ✅ **Contestada el 2026-09-02**: PDF desde el servidor, «así buscamos que sea interno». Con reportlab, elegido midiendo cinco opciones                                                                                                                                                                 |
| Despliegue                            | Qué dominio (`bim.<dominio>`), y si comparte VM con AeroControl y AeroPlanner                                                                                                                                                                                                                          |
| Copias de seguridad                   | No hay nada escrito. Son dos cosas separadas a propósito: la base y `/var/lib/aerobim`                                                                                                                                                                                                                 |
| Modelos de prueba                     | Falta uno **> 50 MB** y uno de instalaciones. Son los dos que decidirían si `F3.4` procede                                                                                                                                                                                                             |

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
| **4D / planificación de obra**                 | **Pospuesto a otra etapa, no descartado** (2026-10-06): ver Fase 16. Primero hay que ver el modelo bien             |
| **Cómputos y presupuesto (5D)**                | Ídem. `ifccsv` deja la puerta abierta, pero no es el MVP                                                            |
| **Compartir base de datos con las hermanas**   | Regla de la familia: la integración es por archivo y por API, nunca por base de datos                               |

---

## FASE 13 — Perfiles y espacios de trabajo (2026-10-05)

Nace de coordinar **un proyecto de metro con datos reales**: un trazado lineal, largo y con curvas,
donde un corte recto por el centro del modelo no dice nada del PK. El encargo —«reestructuración del
visor y crecimiento BIM»— se revisó contra el código antes de ejecutarse, y esa revisión recortó
lo que ya estaba decidido con medidas (`Highlighter`, `BCFTopics`, `Hider`, `Classifier`) y reordenó
lo demás: **primero los perfiles, que ya sirven al metro; los dos espacios y el estado observable
después**, cuando se sepa qué necesitan.

| Fila     | Qué                                                                                                                                            | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `F13.1`  | **Perfil IFC sobre una polilínea**, desarrollado por PK, con transversales y su tabla                                                          | ✅ ver abajo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `F13.2`  | Perfil de la **nube**: puntos de la franja, sin superficie de terreno inferida                                                                 | ✅ construido · ⬜ oráculo (`F13.6`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `F13.3`  | Los dos espacios, **Modelo 3D** y **Planos y perfiles**, y el reparto de herramientas                                                          | ✅ ver abajo (sin `ViewerSnapshot`, a propósito)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `F13.4`  | «Comparar» el plano con el modelo, restaurando la vista al salir                                                                               | ✅ ver abajo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `F13.5`  | `ClipStyler` para el relleno y las aristas de un corte, si conserva lo que ya funciona                                                         | ⬜ sin ensayar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `F13.6`  | **Oráculos externos** del perfil: la misma sección en **Bonsai** (IFC) y **CloudCompare** (nube) con el archivo de obra                        | ⬜ **lo corre quien tiene el archivo**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `F13.7`  | Medir el perfil de nube con la **nube real de 127 MB** (hoy solo la de muestra) y decidir el techo de puntos                                   | ⬜ pendiente de los datos del metro                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `F13.8`  | Recorrido de clics completo del perfil con **nube** y contraste del selector de espacio en tema claro                                          | ✅ 2026-10-05                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `F13.9`  | **Visor 2D de láminas**: un plano o un perfil generado se abre **solo**, sin el modelo debajo, y se vuelve al modelo como estaba               | ✅ 2026-10-05                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `F13.10` | **La banda de cruces del perfil**: qué elementos cruza el trazado, por PK y por cota, y qué hay bajo el cursor                                 | ✅ 2026-10-05 · 🔶 lámina con malla y regla (`F13.11`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `F13.11` | **La lámina de perfil con su malla**: eje de cotas, regla de PK y cuadrícula **dentro del dibujo**, para que salgan también en el DXF y el PDF | ✅ 2026-10-06 (código; **falta mirar el DXF en un CAD**): cuadrícula (`AB-MALLA`) y regla (`AB-REGLA`) a pasos 1/2/5×10ⁿ **y ahora sus cifras**: el PK bajo cada línea vertical y la cota a la izquierda de cada horizontal, como **texto del dibujo** —por el camino de las tablas, el único por el que un texto llega al DXF y a la lámina del PDF—. En el longitudinal, PK (`0+002`); **en una transversal, distancia en metros**: allí el eje horizontal no es un PK y rotularlo así engañaría. El viewport crece para incluirlas. Visto en el DXF de `Piso 5.ifc`: 16 PK y 20 cotas en el longitudinal, y ninguna transversal con forma de PK ni con la tabla ajena. **En pantalla las cifras no se dibujan** (el visor 2D no pinta texto); la banda de cruces es allí la regla |
| `F13.12` | **Paneles laterales contextuales**: la ficha de propiedades flota solo al seleccionar, y el navegador esconde lo que no aplica a lo abierto    | ✅ 2026-10-05                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### `F13.1`: el perfil IFC

**Es la proyección de la franja, y no un corte exacto de la geometría.** Cada franja mira los
elementos **visibles** cuya caja toca su ancho, de lado, y los recorta al largo del tramo. Las
aristas son las del elemento entero, no su intersección con un plano: con un ancho pequeño se acerca
a un corte, con uno grande a un alzado. La interfaz lo dice **antes** de pulsar.

- **Polilínea y no recta A–B.** En un tramo curvo una recta corta en diagonal y la distancia no es el
  PK. El perfil se **desarrolla**: cada tramo se mira de lado y se coloca en su PK. El dominio
  (`bim-core/src/perfiles/eje.ts`) es aritmética plana con respuestas calculables a mano: una L de
  3 + 4 m da PK 7. Un eje declara `sistema: "escena"` y el tipo no admite otro.
- **`orientTo()` no vale para una dirección cualquiera**: solo garantiza el sentido sin espejo para
  los seis ejes estándar. Se proyecta con `EdgeProjector`, que acepta cualquier dirección, y **las
  coordenadas del papel se calculan**: horizontal = PK (o desplazamiento lateral), vertical = cota.
  Por eso el DXF y la lámina PDF salen sin tocar nada más: leen X y Z.
- **La cota es la del IFC.** Fragments recentra el modelo y guarda el desplazamiento
  (`fragments.core.baseCoordinates`); sin sumarlo, la cota sería la de una escena recentrada.
- **Medido sobre `Piso 5.ifc`, con un eje en L de 31,04 m:** el longitudinal mide **31,04 × 2,98 m**
  —el largo exacto del eje, y la altura exacta del modelo—, tarda 2,3 s, y las cuatro transversales
  caben en el ancho pedido. Lo comprueba `diag.html?modo=perfil`, que exporta el DXF y lo lee de vuelta.
- **Y destapó una fuga que ya existía**: el exportador de tablas recorría los dibujos de **todos** los
  planos, así que la tabla de uno se escribía en el DXF de cualquier otro; `sheet()` hacía lo mismo
  en el PDF. Nadie lo veía porque solo había una tabla a la vez. Arreglada y sujeta por el
  diagnóstico: las transversales salen con 0 textos.
- **Lo que no hace, dicho:** no infiere una línea de terreno, no usa `IfcAlignment` y no calcula
  desviaciones. La regla 6 de `AGENTS.md` sigue en pie: es una vista de lectura, como los planos de
  la Fase 7.

### `F13.2`: el perfil de la nube

Los puntos de la nube que caen en la franja de cada tramo, como `(PK, cota)`, en la capa `AB-NUBE` del
DXF y de la lámina. **Son puntos y nunca una línea de terreno** —inferirla sería procesar—.

- **Sin cámara.** `nodosDeLaFranja` (`bim-core/src/nubes/franja.ts`) devuelve los nodos del octree que
  tocan la franja, lo menos profundo primero, sin frustum ni presupuesto de pantalla: el mismo eje da
  el mismo perfil con cualquier posición de cámara. Los tres sistemas (archivo, locales de la nube,
  escena) se cruzan **llevando a la escena las cajas de los nodos**, no invirtiendo la franja.
- **El techo cuenta puntos aceptados, no los del nodo.** La primera versión lo aplicaba al nodo entero
  y **dejaba el perfil vacío con una nube llena**: la raíz tiene más puntos que cualquier techo. Lo
  descubrió el diagnóstico. Ahora el último nodo se adelgaza (`cupoDeUnNodo`) y la ficha dice que es una
  muestra.
- **Sin calce no se superpone.** Con un modelo a la vista, una nube sin calzar queda fuera y la ficha
  del plano dice por qué: sus cotas no serían comparables con las del IFC. Sin modelo, se dibuja sola.
- **Medido** (`diag.html?modo=perfilnube`, nube de muestra, eje por su diagonal): 38 952 puntos, los
  mismos con la cámara movida; el DXF lleva 38 952 marcas en `AB-NUBE`; cota del dibujo de 17 m, la de
  la cabecera; 3,3 s. **Sin oráculo externo todavía** (`F13.6`).
- **Recorrido de interfaz (`F13.8`, 2026-10-05)**, en el navegador con `muro-en-utm.ifc` y su
  levantamiento: en _Planos y perfiles_ → «Documentar» → «Crear perfil» la tarjeta ofrece «Incluir los
  puntos de la nube» y, con la nube **sin calzar**, avisa en ámbar; dos clics sobre el muro y el perfil sale
  **sin** nube y con la nota en su ficha. Tras «Calzar automáticamente», el aviso desaparece y el segundo
  perfil sale con **3 144 puntos de la nube en `AB-NUBE`** (1,2 × 3,1 m). Consola sin errores.
  **Contraste del selector de espacio, medido sobre lo renderizado:** oscuro 8,98 (inactivo) y 6,12
  (activo); claro 6,84 y 8,26 —todos por encima de 4,5 : 1—.

### `F13.3` y `F13.4`: dos espacios, y comparar

**Modelo 3D** y **Planos y perfiles** son dos formas de usar **un solo motor**: solo cambia qué se
muestra, y cambiar no reconvierte nada (`apps/web/src/espacios.ts`, con pruebas).

| Se ve en              | Navegador                                                    | Cinta                                                                                                        |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Modelo 3D**         | Todo salvo los planos 2D y los generados                     | Cortes, Coordinar (Observar); **sin** Documentar, Modo 2D ni Comparar                                        |
| **Planos y perfiles** | Registro, modelos abiertos, planos 2D, generados, mediciones | Documentar (Generar plano, **Crear perfil**), Modo 2D, Comparar; **sin** Cortes, Coordinar, Vistas guardadas |

- **Crear perfil está en el espacio de planos** y no en los cortes del 3D: un eje de metro se traza en
  planta y lo que sale es un plano para entregar.
- Abrir un DXF —también por `?revision=`— o generar un perfil lleva solo a _Planos y perfiles_;
  `?espacio=planos` abre ese espacio.
- **Comparar** superpone el plano y el modelo (ortográfica en planta, modelo en «Fantasma») y **al salir
  restaura** cámara, cortes, modelos y planos apagados, proyección, navegación y estilo.
- **No se hizo el `ViewerSnapshot`** del plan original: el estado sigue en `App.tsx`, una vez, y los
  espacios solo filtran. Se introduce cuando algo lo necesite de verdad.
- Revisa la decisión de «una sola ventana» de `docs/UX.md`; allí queda la constancia.
- Verificado en el navegador con `Piso 5.ifc` y `ACAD-Piso 5_Base.dxf`: el recorrido «Documentar → Crear
  perfil → dos clics → generar» da un perfil de 5,8 × 3,0 m y 1 846 trazos en 0,8 s.

## FASE 14 — Proceso de agentes y base de código (planificada el 2026-10-05)

> **Solo está planificada. Hoy no se ejecuta ninguna de sus filas.** Nace de dos entregas que preparó
> el usuario fuera del repositorio —un kit de proceso para Claude Code y un plan de revisión y refactor—
> y de leerlas contra el código antes de ejecutarlas. **`AGENTS.md` y este plan mandan sobre el kit**:
> lo que choque con ellos está en «Choques detectados» y se resuelve ahí, no en silencio.
>
> **La «Regla de oro» de arriba dice que no se abre una fase con la anterior a medio cerrar.** La 13 lo
> está (`F13.5`–`F13.8`). Se abre porque **el usuario lo pidió**, y ninguna fila de la 14 depende de
> las de la 13 ni al revés.

Dos objetivos y una restricción: **gastar menos contexto por sesión** (el `HANDOFF.md` ya pesa 1 253
líneas), **que lo concentrado se pueda leer** (archivos de miles de líneas que ni una persona ni un
agente abren cómodos) y **no cambiar el comportamiento del producto**. Estructura sí, comportamiento
no, siempre con red de seguridad y en PR pequeños.

| Fila    | Qué                                                                                                                                                                                                   | Estado                                                  | Oráculo, medible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Quién la cierra                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `F14.1` | **Fase 1 del kit**: `CLAUDE.md`, `.claude/` (permisos, reglas por ruta, skills), `scripts/claude/`, `.gitignore`, el parche de `AGENTS.md` (**commit aparte**) y, **al final**, el `HANDOFF.md` corto | 🔶 aplicada en #80; **faltan las cifras de `/context`** | `/context` **antes y después**, con cifras en el PR; `fmt:check`, `lint`, `build` y `test` en verde; `git status` versiona `settings.json`, `rules/` y `skills/` y **no** `launch.json`, `settings.local.json` ni `.claude/tmp/`; `verificar.mjs api` probado contra el `verify.ps1` real o declarado sin probar; `HANDOFF.md` ≤120 líneas, verificado contra `git log`                                                                                                                                                                                                                                                                                                                                                                    | El agente: PR, CI verde y fusión. El usuario revisa las cifras de `/context` |
| `F14.2` | **Etapa 1 de la Fase 2: revisión de solo lectura** — seguridad (guion D1), arquitectura (D3) y mediciones (cobertura, complejidad, diez archivos más grandes, `impeccable detect`)                    | ⬜                                                      | Informe **fuera del repo**; cada hallazgo con archivo, evidencia y la prueba de 403 o de aislamiento que faltaba; **`git diff` vacío** (no se tocó código); los `alta` entran al plan como filas y el resto a la bandeja; la skill de terceros retirada y su commit anotado                                                                                                                                                                                                                                                                                                                                                                                                                                                                | El agente produce; el usuario decide qué hallazgos `alta` entran             |
| `F14.3` | **R1 · dividir `documents/views.py`** (2 499 líneas, 38 clases) en un paquete por dominio, re-exportando desde `views/__init__.py`                                                                    | ⬜                                                      | ✅ 2026-10-06: `documents/views.py` (2 523 líneas, 43 definiciones) es ahora el paquete `views/` con **nueve módulos por dominio** (`_comun`, `archivos`, `entregables`, `informes`, `ids`, `observaciones`, `actividades`, `transmittals`, `bandeja`; el mayor, 707 líneas) que **solo dependen de `_comun`**. **Medido contra el oráculo:** las 43 definiciones son **idénticas** a las originales (árbol sintáctico), **140 URL antes y 140 después con diferencia vacía**, **1 776 pruebas recogidas antes y después** (1 769 pasan + 7 omitidas) y la tabla de `test_permisos.py` intacta. Un único cambio en pruebas: un `monkeypatch` por ruta de texto apunta ahora al módulo donde vive (`views.observaciones.avisar_comentario`) | El agente: PR, CI verde y fusión                                             |
| `F14.4` | **R2 · sacar `diag.ts` del camino de la aplicación** (3 481 líneas)                                                                                                                                   | ⬜                                                      | `dist` no lo contiene (**ya hoy**: la lista blanca de `limpiar-dist.mjs` deja fuera `diag.html`); ninguna importación desde `src/` (**0 hoy**); **y todos los modos de `diag.html?modo=…` siguen corriendo en desarrollo**, porque son el oráculo de navegador de decenas de filas ✅. Mover no es borrar                                                                                                                                                                                                                                                                                                                                                                                                                                  | El agente: PR, CI verde y fusión                                             |
| `F14.5` | **R3 · guardia de complejidad** en ruff (`C901`) con un umbral que **hoy pase**                                                                                                                       | ⬜                                                      | Medido el 2026-10-05: con `max-complexity = 10` fallan **6** funciones y con **15**, **0**. Se activa en 15. `ruff check .` en verde, y una función de prueba de complejidad >15 **hace fallar el gate** (se prueba y se revierte)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | El agente: PR, CI verde y fusión                                             |
| `F14.6` | **R4 · humo e2e con Playwright y axe-core**: login, abrir una obra, abrir el visor con un IFC sintético del repositorio                                                                               | ⬜                                                      | Corre en el CI y pasa; el IFC es `muro-minimo.ifc` (sintético, ya versionado) subido por el selector de archivos —**las muestras no van al build**—; axe sin violaciones serias en portal y visor, en claro y en oscuro; **sin descargar nada de un CDN en ejecución** (regla 10 de `AGENTS.md`). **Prerrequisito de `F14.7`**                                                                                                                                                                                                                                                                                                                                                                                                             | El agente: PR, CI verde y fusión                                             |
| `F14.7` | **Etapa 3 · `App.tsx`** (3 314 líneas, `App()` desde la 338), **`packages/viewer/src/index.ts`** (5 955) y **`bim-core/plans/dxf.ts`** (1 911, solo si el piloto apunta ahí)                          | ⬜ **BLOQUEADA**                                        | **Desbloqueo: `F14.6` en verde y el piloto arrancado.** Cada paso contrastado **en el navegador con el mismo IFC y su oráculo** (`AGENTS.md`, «Verificación»), con `F14.6` en verde antes y después. Mismo comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | El agente, paso a paso; **no se hace de golpe**                              |

### El orden, y por qué

1. **Cerrar el trabajo en curso** (`#78`, fusionado el 2026-10-05) y partir de un `main` ya actualizado.
   **No hay hoy ninguna otra rama abierta**: las del trabajo anterior ya están en `main`.
2. **`F14.1`**, en `codex/mejora-proceso-agentes`, creada desde ese `main`. Dentro de la fila, el orden
   es: kit y scripts → `.gitignore` → `AGENTS.md` (commit aparte) → **`HANDOFF.md` corto al final**,
   porque es lo único que se pisaría con trabajo en curso. El `HANDOFF.md` nuevo resume **desde el #72
   hasta lo último**: el anterior cerraba en el #71.
3. **`F14.2`, en paralelo con el piloto.** La Fase 2 empieza **solo con `F14.1` fusionada y el piloto en
   marcha**: las etapas 0 (Preparación) y 1 (Registro documental) de `docs/PILOTO.md`; la Etapa 1 no
   necesita el IFC.
4. **`F14.3` a `F14.6`.** `F14.3` va **primero** y es **el más sensible a conflictos**: se hace cuando
   **ninguna rama abierta toque `views.py` ni `api.py`** (se revisa con `git branch -r` y
   `git log origin/main..<rama>` justo antes). `F14.4` y `F14.5` no dependen entre sí. `F14.6` antes de
   la Etapa 3.
5. **`F14.7`** al final, bloqueada hasta que `F14.6` esté en verde y el piloto haya arrancado.

### Lo que no se hace en esta fase

Reescribir el visor, cambiar de librería (That Open, `web-ifc`) ni tocar `COOP`/`COEP`, la CSP o la
carga de WASM como parte de un refactor. Instalar skills de terceros sin fijar versión y sin leer
antes sus hooks y scripts; las descartadas por el kit (Superpowers, Graphify, Caveman…) siguen fuera.
Los plugins de inteligencia de código (`typescript-lsp`, `pyright-lsp`) van a nivel de usuario, no al
repositorio, y se instalan avisando.

### Los números del diagnóstico, re-medidos el 2026-10-05

El kit los tomó sobre el PR #73; el repositorio **creció** desde entonces (el perfil, los dos espacios,
el IFC comprimido) y los números cambiaron. **Estos son los vigentes**, y la fila `F14.x` que los usa
dice cuál:

| Hallazgo                                               | El kit decía    | Medido hoy (`main`, `eccf703`, tras fusionar #78)                                                                                                                                    |
| ------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documents/views.py`                                   | 2 449 · 38      | **2 499 líneas · 38 clases de vista**                                                                                                                                                |
| `packages/viewer/src/index.ts`                         | 5 627           | **5 955** (126 métodos de la clase, aprox.)                                                                                                                                          |
| `apps/web/src/App.tsx`                                 | ~3 013          | **3 314** · `App()` desde la línea 338                                                                                                                                               |
| `apps/web/src/diag.ts`                                 | 3 208           | **3 481**                                                                                                                                                                            |
| `packages/bim-core/src/plans/dxf.ts`                   | 1 911           | **1 911** (sin cambio)                                                                                                                                                               |
| `documents/models.py` · `accounts/views.py` · `api.py` | 965 · 855 · 803 | **965 · 855 · 820**                                                                                                                                                                  |
| TODO / FIXME / HACK / XXX                              | 21              | **21** (sin cambio)                                                                                                                                                                  |
| Reglas de ruff                                         | sin `C901`      | `E, F, W, I, UP, B, DJ` — **sin `C901`**; con umbral 10 fallan 6, con 15, 0                                                                                                          |
| Pruebas                                                | 1 033 + 523     | **1 675 API** (CI, +2 omitidas) y **659 TS** (`npm test`: 528 `bim-core` + 103 `viewer` + 28 `apps/web`, que `npm test` no ejecutaba hasta el 2026-10-05); sigue sin e2e ni visuales |
| `HANDOFF.md`                                           | ~93 KB          | **1 253 líneas**                                                                                                                                                                     |

### Choques detectados entre el kit y `AGENTS.md` o el repo

1. **El kit prohíbe fusionar**: su `settings.json` niega `Bash(gh pr merge:*)` y sus instrucciones dicen
   «nunca fusiones el PR». **Desde el 2026-10-05 `AGENTS.md` dice lo contrario** —el agente fusiona con
   el CI verde; el usuario solo despliega—. Al aplicar el kit hay que **quitar esa regla de `deny`**, o
   el agente no podrá cumplir lo que `AGENTS.md` manda. Además pone `Bash(git push:*)` en `ask`: cada
   empuje pediría confirmación, y el reparto actual es que el agente empuja.
2. **`R3` no necesita tocar `ci.yml`**, al contrario de lo que dice el kit: `ci.yml` y `verify.ps1`
   ejecutan ambos `ruff check .`, que lee `pyproject.toml`. Basta la configuración; se comprueba, no se
   edita el flujo.
3. **`R2` parte de una premisa ya cumplida en producción**: `diag.ts` no está en el camino de la
   aplicación (nada de `src/` lo importa y la lista blanca deja `diag.html` fuera del build). Lo que
   queda es una cuestión de **mantenimiento** —3 481 líneas de herramienta de desarrollo dentro de
   `apps/web/src`—, no de seguridad. Y **no se puede borrar ni degradar**: es el oráculo de navegador de
   muchas filas ✅ de este plan y de `AGENTS.md` («verificación en el navegador»).
4. **La carpeta del kit está dentro del repositorio** (`claude-info/`, sin versionar), y el kit exige
   estar **fuera**. Hay que moverla o excluirla antes de copiar nada, para que ningún `git add` la
   arrastre. Los dos documentos aparecen además duplicados dentro y fuera de `aerobim-claude-kit/`.
5. **«Etapas 0 y 1 del piloto»** son la **Etapa 0 · Preparación** y la **Etapa 1 · Registro documental**
   de `docs/PILOTO.md`, que numera de la 0 a la 4. La Etapa 1 no necesita el IFC. (Una primera lectura
   de este plan dijo que el piloto numeraba 1–4: era un error y está corregido.)
6. **El `HANDOFF` de la plantilla es un borrador** que dice «del #71 al #73»; el repositorio va por el
   #78. Se rehace desde `git log`, no se copia.
7. **R4 y las muestras**: el build deja fuera `samples/` a propósito (regla de `AGENTS.md` sobre
   `apps/web/public/`), así que un e2e contra la aplicación empaquetada **no puede abrir** `muro-minimo.ifc`
   desde `/samples/`; el archivo se sube por el selector. Y Playwright descarga su navegador: es
   aceptable en el CI, pero la regla 10 (nada de CDN **en ejecución**) hay que vigilarla en la prueba.
8. **Playwright (Apache-2.0) y axe-core (MPL-2.0)** son dependencias de desarrollo: caben en la tabla de
   licencias de `AGENTS.md`, pero **hay que registrarlas en `docs/REFERENCES.md`** al añadirlas.

### `F13.9`: el visor 2D de láminas

Un plano o un perfil generado se dibuja **encima del modelo** y nacía apagado: encendido, se veía una
maraña de líneas sobre la geometría, y no había dónde **verlo solo**. Pedido por el usuario el 2026-10-05
mirando la versión desplegada: «cómo visualizar … los planos al generarlos, separarlos y tirarlos al
visor 2D, no sé si eso ya está listo». **No lo estaba.**

- **Se abre solo al generarlo** —la planta, o el longitudinal de un perfil— en _Planos y perfiles_: apaga los
  modelos, los planos de referencia, la nube y las demás láminas, pone la cámara ortográfica y encuadra la
  lámina. La ficha de cada lámina lleva «Ver en el visor 2D»; el ojo pasa a significar «superponer al modelo».
- **La barra del visor 2D**: «Volver al modelo» y **pestañas para pasar de una lámina a otra** (un perfil trae
  sus transversales). **Volver restaura**: cámara, qué estaba encendido —lo recién generado vuelve **apagado**
  en el 3D—, estilo y espacio. Generar otra lámina, o «Crear perfil», sale primero al modelo: proyectar
  exige el modelo encendido.
- **Y destapó un defecto que ya existía:** el perfil se orienta como un alzado frontal, o sea **de pie**, y al
  encenderlo la cámara lo encuadraba siempre **desde arriba**: se veía **de canto, una sola línea**. En #75
  solo se había verificado el DXF y la ficha; **nunca se vio un perfil en pantalla**. Lo mismo valía para los
  alzados frontal y lateral. Ahora cada lámina se encuadra de frente según su orientación.
- Verificado en el navegador con `Piso 5.ifc`: la planta (21 484 trazos) y un perfil con cuatro transversales
  se ven solos; cambiar de pestaña, volver (las cuatro láminas apagadas en 3D), cerrar la que se ve y
  «Crear perfil» desde el visor 2D. Consola sin errores.
- **Sin hacer:** medir el contraste de la barra por separado (usa las mismas piezas y tintas que las otras dos),
  y ver un perfil **con nube** en el visor 2D.

### `F13.10`: la banda de cruces

Pedido por el usuario el 2026-10-05 con dos láminas de perfil de topografía de ejemplo: «el perfil ahora es
más bien un corte como caja; no existe verlo como un visor directo 2D, con abajo lo que cruza en ese
momento». El visor 2D de láminas (`F13.9`) resolvió lo primero; esto, lo segundo.

- **Qué cruza.** Al generar un perfil se guarda, por cada elemento que toca la franja, su clase, nombre y
  GUID, **el tramo de PK que ocupa y su cota**. Es dominio puro en `bim-core/src/perfiles/cruces.ts`
  (`intervaloDeCaja`, `crucesEn`, `filasDeBanda`, `nombreDeClase`, `pasoDeGraduacion`), con 19 pruebas y
  **mutación**: siete reglas rotas a propósito, y una **sobrevivió** —mirar solo dos esquinas de la caja— hasta
  que se añadió un caso con el eje a lo largo de `z`.
- **La banda**, bajo el perfil en el visor 2D: una fila por clase, con la barra de los tramos de PK donde hay
  algo de ella, sobre una regla de PK con paso de topógrafo (1-2-5).
- **El cursor.** Al pasarlo por el dibujo, la banda dice **PK y cota, qué hay justo ahí y qué hay en esa
  vertical**, y una línea recorre las barras. El punto sale de cortar el rayo de la cámara con el plano de la
  lámina (`pointOnDrawing`).
- **Medido:** con `Piso 5.ifc` y un eje de 9,2 m, **61 cruces** (53 elementos genéricos, 5 de mobiliario, 3
  puertas); la cota del cursor es coherente —del tablero de una mesa a las ruedas de su silla hay **0,71 m**—.
- **Lo que se afirma y lo que no:** los tramos son de la **caja envolvente**, no de la geometría; un elemento
  diagonal puede figurar en un tramo que no ocupa del todo. La banda lo dice en su pie.
- **Falta (`F13.11`):** las láminas de ejemplo traen **la malla dentro del dibujo** —eje de cotas con su
  graduación, abscisado y cuadrícula—. Hoy el perfil dibuja la geometría y una tabla de PK; la regla vive
  solo en la banda HTML, así que **no sale en el DXF ni en el PDF**.

### `F13.12`: paneles laterales contextuales

Pedido por el usuario el 2026-10-05: _«sigue siendo saturado de información y poco práctico el diseño de las
herramientas laterales»_. Se **midió antes de tocar** (1600 × 1000, un modelo abierto, nada seleccionado):

|                         | Antes                                                  | Después                                      |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Panel izquierdo         | 346 px (21,6 %) **siempre**, con una frase de 3 líneas | **0 px**: la ficha flota solo al seleccionar |
| Cabeceras del navegador | **14** (4 grupos + 10 secciones), 3 de ellas «vacío»   | **10**                                       |
| Lienzo                  | 899 px (**56,2 %** del ancho)                          | **1250 px (78,1 %)**                         |

- **La ficha flota** como una tarjeta del alto de su contenido, con el mismo cristal que las otras barras del
  lienzo, **y no cambia el tamaño del visor** al seleccionar o soltar. El botón «Propiedades» pasa a **fijar**
  la columna (o a soltarla). Una ficha en columna que cambia el ancho del lienzo cada vez que se selecciona
  movería el modelo 173 px en cada clic; flotando, no.
- **El navegador esconde lo que no aplica a lo abierto** (`seccionesQueNoAplican`, con pruebas): sin nube no hay
  «Nube de puntos» ni «Calce y desviación»; sin obra del registro no hay «Coordinación» ni «Vistas del
  proyecto». Aparecen solas cuando hay algo a lo que aplicarlas. Abrir una nube no depende de esa sección:
  están el botón «Abrir» y soltar el archivo en cualquier parte del lienzo.
- **Contrapartida, dicha:** la tarjeta tapa una esquina del lienzo mientras hay algo seleccionado (320 px a la
  izquierda); si estorba, se fija en columna o se cierra con la «×».

## FASE 15 — Revisión con marcas, en 2D y en 3D (abierta el 2026-10-06)

Pedida por el usuario con **dos capturas de referencia**: la del 2D, **ProjectWise** (visor de PDF con marcas y un
panel «Issues»), y la del 3D, **iTwin Design Review**. Son productos cerrados: se toma la **distribución y el
gesto**, no el código (`docs/REFERENCES.md`). Lo que dijo: _«las marcaciones son bastante prácticas»_.

**Lo que ya existe, y por eso casi todo es interfaz:** `Observacion` (estado, prioridad, responsable, ancla de
documento, ancla de modelo, vista guardada, `marcado`), `Comentario` con imagen, y los endpoints de comentar,
repartir y cerrar. Lo que hoy **no** existe es la pantalla: `documento.html` pinta un punto por observación y manda
al formulario de Django para abrir una.

| Qué se ve en la referencia | ProjectWise (2D)                                                  | iTwin Design Review (3D)                                                                                           |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Herramientas               | Barra superior: mano, selección, llamada, nube, rectángulo, texto | Barra **vertical fina a la izquierda**: seleccionar, comentar, medir…                                              |
| La marca en el lienzo      | Rectángulo, **nube de revisión** y llamada con texto              | **Globo numerado** (`004`) anclado al elemento                                                                     |
| Panel derecho              | Lista «Issues»: título, fecha, estado, hilo plegable, responder   | **Detalle** de uno: volver, título y nº, **estado desplegable**, vista guardada, hilo tipo chat, caja con @mención |

| Fila    | Qué                                                                                                                                                                                             | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `F15.1` | **Panel «Observaciones» en `documento.html`**: lista a la derecha con estado, fecha y filtros; las marcas **numeradas**; elegir una lleva a su página y la resalta, y al revés                  | ✅ 2026-10-06: panel de 320 px con filtros y su cuenta (Todas / Abiertas / Vencidas / Cerradas), plazo con «n días de atraso», marcas numeradas **por orden en el documento** que no cambian con un filtro puesto; elegir desde la lista o desde la marca resalta ambas y trae «Abrir la ficha». Servidor: `creada`, `vence`, `vencida` y `comentarios` en la API, con prueba. Visto en el navegador con `planta-prueba.pdf` y la API simulada, con contraste medido en claro y oscuro (los números de las marcas pasaron de 3,67 a más de 4,5). Con un enlace compartido el panel **no sale**: no se piden las observaciones. El hilo y responder quedan para `F15.4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `F15.2` | **Marcas del 2D**: rectángulo, nube de revisión y llamada con texto sobre la página (campo `forma` en `Observacion`; hoy solo hay un punto)                                                     | ✅ 2026-10-06: rectángulo, **nube de revisión** (contorno festoneado, arcos hacia fuera) y llamada con flecha, que se trazan **arrastrando** sobre la página con la barra «Marcar» (Punto / Rectángulo / Nube / Llamada). Servidor: `ancla_forma`, `ancla_x2`, `ancla_y2` (migración `0016`), validados en el formulario —la forma exige su segunda esquina y que caiga en la hoja; sin forma las coordenadas sobrantes se limpian—, con 9 pruebas y la forma en la API. La geometría de la nube y la flecha está aparte, con pruebas. Visto en el navegador: las tres formas dibujadas y un arrastre real que abre el formulario con `forma=nube&x2=…&y2=…`. **Falta:** que la forma viaje al BCF (hoy solo el punto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `F15.3` | **3D**: barra vertical izquierda de herramientas, **globos numerados** en la escena y detalle de una observación (estado, «ir a la vista guardada», hilo)                                       | ✅ 2026-10-06: **globos numerados** (`001`, `002`…) sobre la cara de arriba de su elemento por GUID, que siguen a la cámara y van en rojo si el tema está vencido; **tarjeta de detalle** con estado, prioridad, responsable, plazo, «Ir a la vista guardada» y el **hilo** (`F15.4`); y la **barra vertical** a la izquierda con seleccionar, medir y anotar, solo iconos, **con el mismo mandato que la cinta** (no una segunda familia de herramientas: son tres) y que se corre a la derecha de la ficha cuando esta flota. Visto en la aplicación con `Piso 5.ifc`: los modos coinciden con la barra de estado y la barra no queda tapada por la ficha (medido: 373 px frente a 365 donde acaba ella). **Decidido, no pendiente:** los globos **no se ocultan tras los muros** —un globo visible a través de la pared dice «hay algo aquí» aunque no se vea el elemento, que en coordinación es lo que se quiere—                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `F15.6` | **Buscador del proyecto** a la manera de ProjectWise y Synchro (abajo): una caja que busca en documentos, observaciones y elementos del modelo, con filtros por propiedad y búsquedas guardadas | ✅ 2026-10-06 (sin decisión del usuario: se tomó el orden que decía la fila, documentos y después elementos; **cámbialo si lo que más se busca es otra cosa**). **Elementos del modelo (Synchro):** caja arriba en el visor, por nombre, clase IFC o GUID (todos los términos, sin acentos ni mayúsculas, GUID exacto primero; coincidencia pura en `bim-core`, 16 pruebas), sobre lo que tiene geometría de **todos** los modelos abiertos; elegir una fila hace lo que un clic sobre el elemento, y **«Aislar» deja solo lo hallado** (nuevo `isolateMany`, una sola entrada en la pila para «Salir»), desactivado si hay más de 200. Visto con `Piso 5.ifc`: `ifcbeam` → 7 vigas (los mismos GUID del archivo), aislarlas, y un GUID → 1 elemento con su ficha. **Registro (ProjectWise):** página «Buscar» en el registro documental, entregables por código o título y observaciones por título o descripción, con permisos separados (`view_entregable` y `view_observacion`), acotada por organización y con tope por grupo; 17 pruebas. **No hecho, y dicho:** las búsquedas **guardadas** como objeto (la URL con `?q=` ya se puede guardar o pegar en un correo) y que ignore acentos (pide la extensión `unaccent` de PostgreSQL: decisión de despliegue)                                                                                                                                                     |
| `F15.5` | **Panel de reportes** sobre el seguimiento que ya existe (`SeguimientoView`), con la presentación de la tercera referencia (abajo)                                                              | ✅ 2026-10-06: página **Reportes** (`documentos/reportes/`, en «Coordinación»): ocho cifras rápidas (abiertas, vencidas, abiertas hace más de 30 días, vencen esta semana, asignadas a mí, cerradas, cerradas esta semana y hoy) **con su definición al pasar el cursor**; una **dona** y unas **barras** reagrupables por responsable, estado, prioridad, obra u origen; y la tabla ordenable con el atraso en rojo y **«Exportar a Excel»** (CSV con BOM y `;`, todas las filas, cada celda neutralizada contra fórmulas). SVG y CSS sin JavaScript; las series usan los cinco acentos ya medidos (contraste del arco contra el panel: 5,2–8,3 en claro, 6,9–8,7 en oscuro). Mismo permiso que el seguimiento (`view_` + `change_observacion`) y acotada por organización; 19 pruebas de las cifras con respuestas a mano y 21 de la pantalla (403, aislamiento, URL mala, CSV). **Se vio mirándola y destapó un defecto de antes:** el estado «Abierta» de una observación salía como «Abrir» —comparte texto con el botón— en toda pantalla que lo imprime; corregido con contexto de traducción, sin migración                                                                                                                                                                                                                                                                                                      |
| `F15.4` | **Responder desde el panel**, con @menciones del equipo de la obra, sin salir del visor (hoy se va al formulario)                                                                               | ✅ 2026-10-06: **el hilo, responder y @mencionar, sin salir del visor**, en el panel del documento y en la tarjeta del tema en el 3D (la misma pieza): mensajes propios a la derecha y ajenos a la izquierda con «hace 4 h», Intro envía y Mayús+Intro hace salto de línea; contestar deja la observación «respondida». **Con `@` sale la lista de la gente de la obra** (filtra mientras se teclea, sin acentos ni mayúsculas; flechas e Intro eligen, Esc cierra); la mención va **en negrita y subrayada** en el hilo —no solo de otro color—. Servidor: `HiloDeObservacionAPI` (`view_comentario` para leer, `add_comentario` para escribir, acotada por organización) y `avisar_menciones`: **campana siempre y correo si la obra lo tiene encendido** (`al_responder`, el mismo interruptor del hilo: un emisor más con otro criterio es el ruido que se quería evitar). Los ids mencionados se validan contra las membresías de la organización —uno ajeno se ignora en silencio, sin decir si existe— con tope de 10, y **a quien ya recibe el aviso del hilo no se le avisa dos veces**. 25 pruebas del servidor y 21 del cliente; visto en el navegador: `@Mar` → lista, flecha + Intro, y el POST lleva `menciones: [13]`. **Decidido, no pendiente:** adjuntar imagen sigue siendo de la ficha (`F12.11`): subir un archivo desde una tarjeta flotante duplicaría su validación de firma y su tope de tamaño |

**Tercera referencia, 2026-10-06: «los reportes se presentan así»** (_Project Insights_ de Bentley). Una sola pantalla
que se lee de un vistazo, en este orden: **dos gráficos** que se pueden reagrupar por una propiedad (una dona por
responsable y unas barras por estado, cada una con su selector «Propiedad»), un bloque de **cifras rápidas** en
tarjetas (abiertas, vencidas, abiertas hace más de 30 días, cerradas, cerradas esta semana y hoy, asignadas a mí,
vencen esta semana) y debajo **la tabla** con orden, columnas elegibles, plazo con «n días de atraso» en rojo,
prioridad con icono y **«Exportar a Excel»**. Lo que ya hay para alimentarla: estado, prioridad, responsable y
`vence` de `Observacion`, y la exportación del registro. Dos cuidados: los colores de las series pasan el
contraste en oscuro y en claro (`docs/DESIGN_SYSTEM.md`), y **cada cifra dice cómo se cuenta** —«vencida» es
`vence` < hoy y no cerrada—, no se estima.

**La búsqueda, pedida el 2026-10-06:** _«la búsqueda y lo que deseo buscar, algo similar a Synchro y ProjectWise como
idea principal»_. Hoy **no hay buscador** ni en el visor ni en el navegador: solo la búsqueda de texto dentro de un
PDF. Las dos ideas que se toman:

- **ProjectWise: buscar en lo documental por atributos y guardar la búsqueda.** Una caja y, junto a ella, filtros por
  propiedad (código, título, disciplina, idoneidad, estado, responsable, fecha); la consulta se guarda con nombre y se
  vuelve a lanzar. Es el mismo registro de documentos (`F8.x`), con otra puerta.
- **Synchro: buscar elementos del modelo y volverlos un conjunto.** Por nombre, clase, GUID o valor de una propiedad,
  y el resultado **se aísla o se resalta** en el visor; un conjunto guardado se reutiliza (es el cimiento de la Fase 16:
  una actividad se liga a un conjunto de elementos).

Lo que **todavía hay que decidir con el usuario**, porque cambia el diseño: _qué es lo que más se busca en obra_
—¿un documento por su código, un elemento por su nombre o su GUID, una observación por su responsable?—. Se
pregunta antes de construir; el orden razonable es documentos (ya hay datos) y después elementos.

**Orden y razón:** `F15.1` primero —no toca el servidor y es lo que más se nota—; `F15.2` después, que pide una
migración; `F15.3` y `F15.4` comparten el panel de detalle. Verificación: cada una se mira en el navegador, en
oscuro y en claro, y las que tocan el servidor traen su prueba de 403 y de aislamiento por organización.

## FASE 16 — Línea del tiempo 4D (pospuesta a otra etapa, 2026-10-06)

El usuario pidió **dejarlo apuntado para otra etapa, relacionado con lo de That Open**: no se empieza ahora. Aporta
como referencia una captura del **visor de línea del tiempo 4D** de Bentley («Schedule»: el modelo 3D arriba y,
debajo, un Gantt de actividades con selector de día / semana / mes, filtro, rango de fechas y el cursor de «hoy»;
sus tres ideas: _ver actividades de construcción, compartir con las partes interesadas, identificar problemas_).

**Qué se retoma cuando llegue la etapa** (no antes de cerrar la Fase 15 y de tener un modelo de obra real):

- **Vincular actividad ↔ elementos por GUID** —es lo que convierte un cronograma en 4D; hoy las actividades del
  registro tienen fecha pero ningún elemento ligado (`docs/historial/plan/FASE-11.md`, tabla de lo que no está).
- **Pestaña de tiempo bajo el visor**, con el mismo patrón de panel inferior que la tabla de temas (`F13.9`):
  Gantt, escala día/semana/mes, cursor de «hoy», y el modelo coloreado por estado (por hacer / en curso / hecho).
- **Mirar primero lo de That Open**: su plataforma y sus componentes pueden traer una pieza de línea del tiempo; la
  plataforma es cerrada (solo referencia conceptual) pero los **componentes** son MIT y se pueden evaluar.
- **Dentro de la regla 6 de `AGENTS.md`**: se _lee_ un cronograma que otro produjo; no se planifica ni se calcula
  una ruta crítica aquí.

| Fila    | Qué                                                                                                          | Estado                                            |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `F16.1` | **Visor de línea del tiempo 4D**: actividades vinculadas a elementos, Gantt bajo el visor, modelo por estado | ⬜ pospuesta por decisión del usuario, 2026-10-06 |

## Historial por fase

Las fases cerradas **salieron de este archivo el 2026-10-05** y se conservan enteras, sin tocar, en
[`docs/historial/plan/`](docs/historial/plan/). Aquí queda lo que se decide y lo que sigue abierto; allí, el
cómo y el porqué de lo que ya se hizo. `plan-fila.mjs <código>` busca en los dos sitios.

| Fase                                  | Dónde                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0 · Cimientos                         | [FASE-0.md](docs/historial/plan/FASE-0.md)                                                                                           |
| 1 · Visor, y 2 · Nubes de puntos      | [FASE-1-2.md](docs/historial/plan/FASE-1-2.md) — `F2.4` y `F2.6` siguen abiertas, en la tabla de arriba                              |
| 3 · Backend                           | [FASE-3.md](docs/historial/plan/FASE-3.md)                                                                                           |
| 4 · Coordinación                      | [FASE-4.md](docs/historial/plan/FASE-4.md) — `F4.5` sigue abierta                                                                    |
| 5 · Interferencias                    | [FASE-5.md](docs/historial/plan/FASE-5.md)                                                                                           |
| 7 · Planos                            | [FASE-7.md](docs/historial/plan/FASE-7.md)                                                                                           |
| 8 · Registro documental               | [FASE-8.md](docs/historial/plan/FASE-8.md)                                                                                           |
| 9 · Diseño                            | [FASE-9.md](docs/historial/plan/FASE-9.md)                                                                                           |
| 10 · Etiquetas y tablas               | [FASE-10.md](docs/historial/plan/FASE-10.md)                                                                                         |
| 11 · El portal, y qué formatos entran | [FASE-11.md](docs/historial/plan/FASE-11.md)                                                                                         |
| 12 · La interfaz                      | [FASE-12.md](docs/historial/plan/FASE-12.md) — `F12.2` sigue abierta                                                                 |
| Estado de septiembre                  | [ESTADO-2026-09.md](docs/historial/plan/ESTADO-2026-09.md), [ESTADO-2026-09-bloque.md](docs/historial/plan/ESTADO-2026-09-bloque.md) |

## La competencia abierta, y qué se le puede mirar

**El usuario trajo la lista el 2026-09-02** —Bonsai, That Open Engine, OpenProject BIM y FreeCAD—
con el encargo de «tomar cómo funciona la competencia, que es abierta de revisar, para implementar y
mejorar». Lo primero que hay que decir es lo que ya pasó:

| Herramienta                                        | Dónde está respecto a AeroBim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **That Open Engine**                               | **Ya es el visor.** `@thatopen/components` y `@thatopen/fragments` con `web-ifc` son lo que abre el IFC en el navegador desde `F0.4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Bonsai** (antes BlenderBIM)                      | **Su motor ya es el servidor.** Bonsai es la interfaz de Blender sobre IfcOpenShell, y AeroBim usa esa misma familia: `ifcopenshell`, `ifctester`, `ifcclash` y `bcf-client`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **FreeCAD BIM**                                    | Lee IFC por la misma vía. Como referencia de producto no aporta: es modelado paramétrico, no coordinación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **OpenProject BIM**                                | **Es la única que hay que estudiar de verdad.** Es un CDE con seguimiento de incidencias y BCF, o sea el competidor directo de las fases 4, 5 y 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **That Open Platform** (beta, lanza el 2026-11-23) | **Producto cerrado: solo referencia conceptual**, nada de código ni de recursos. De su captura se tomó **la barra flotante de visibilidad y selección sobre el visor** (hecha el 2026-10-05). Y **la tabla de temas acoplada abajo** (prioridad, título, tipo, estado, responsable, vence, con búsqueda, filtros y orden; hecha el 2026-10-05, sobre la misma lista que el panel «Coordinación»). Queda como idea, sin construir: **los estados vacíos que dicen el motivo**, incluido el permiso. Lo público es casi nada —una página y una lista de espera—, así que **su comportamiento real no está comprobado** |

**O sea que dos de las cuatro ya están dentro**, y no por casualidad: se eligieron en la Fase 0
midiendo. Lo que queda por mirar es **OpenProject BIM**, y concretamente lo que aquí duele: cómo
presenta una lista larga de incidencias, cómo enseña el estado de cada una y cómo lleva a alguien de
la lista al modelo y de vuelta. Es justo el hueco de `F11.6`.

**Y una cosa que conviene decir antes de copiar nada:** OpenProject es un gestor de proyectos con un
módulo BIM encima, y AeroBim es lo contrario — un visor y un registro documental que hacen
coordinación. Lo que se puede tomar son **decisiones de presentación**, no su modelo de datos: sus
incidencias no llevan GUID de IFC como identidad, y esa es la pieza sobre la que está construido
todo lo de aquí.

**Lo que este documento no va a hacer** es prometer una comparación que no se ha hecho. Cuando se
mire, se escribe aquí lo que se tomó y lo que se descartó, con el porqué — como el resto.

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
