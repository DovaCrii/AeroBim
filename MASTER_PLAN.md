# MASTER_PLAN — AeroBim

> **Fuente única de verdad del trabajo pendiente.** Consolida el estudio de
> alternativas open-source (verificado el 2026-08-18 contra la API de GitHub y los
> registros de npm/PyPI) en un tablero ejecutable con seguimiento de estado.
> **Creado:** 2026-08-18 · **Actualizado:** 2026-09-03 (siete fases cerradas; sigue la Fase 2)
> **Rama base:** `main`
> **Regla de oro:** cada fase termina en algo **que alguien puede usar**. No se abre
> una fase nueva con la anterior a medio cerrar, y no se agrega alcance fuera de lo
> listado aquí sin que el usuario lo pida.

---

## Por dónde se empieza

**Siete de las diez fases con trabajo están cerradas enteras**, y lo que queda se cuenta en una
línea cada cosa. Actualizado el 2026-09-03.

| Fase                           | Estado                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **0 · Cimientos**              | ✅ salvo `F0.6`, la conversión en un worker                                                   |
| **1 · Visor**                  | ✅ salvo `F1.13`, que son **tres nombres que decide el usuario**                              |
| **3 · Backend**                | ✅ entera                                                                                     |
| **4 · Coordinación**           | ✅ salvo `F4.5`, el trazo libre, **condicionado a que el usuario mire un BCF exportado**      |
| **5 · Interferencias**         | ✅ entera                                                                                     |
| **7 · Planos, salida**         | ✅ entera — capas, DXF, PDF con sello, y el plano acotado y con sus llamadas                  |
| **8 · Registro documental**    | ✅ entera                                                                                     |
| **9 · Diseño**                 | ✅ salvo `F9.6`, que son **tres decisiones del usuario** y contradicen tres líneas de `UX.md` |
| **10 · Etiquetas y tablas**    | ✅ entera                                                                                     |
| **11 · El portal se ve plano** | ✅ entera — incluida la ayuda con su recorrido                                                |
| **2 · Nubes de puntos**        | 🔶 **casi.** `F2.5` `F2.1` `F2.2` `F2.3` ✅ — abre, se maneja y calza. Falta `F2.4`           |
| **6 · Geo + BIM**              | ⬜ pospuesta a propósito el 2026-09-02, para poner la coordinación delante                    |

**La Fase 2 va por tres cuartos**, y en un orden que no es el de su numeración. Desde el 2026-09-03
se comprueba contra **el levantamiento real del CC 741 — Camino Agrícola**, no contra un fixture:
129,7 millones de puntos y 3,37 GB, diezmados a 15,4 millones y 130 MB de COPC.

- **`F2.5` ✅** — el formato es **COPC**, decidido midiendo, en
  [`docs/NUBES_DE_PUNTOS.md`](docs/NUBES_DE_PUNTOS.md).
- **`F2.1` ✅** — la nube abre en la escena: **915 ms** de primer pintado sobre la nube real, todas
  las peticiones `206 Partial Content`, y la precisión conservada dentro de 0,004 mm cuando sin
  restar el desplazamiento se perderían **115 mm**.
- **`F2.3` ✅** — tamaño de punto, densidad, recorte por caja y los cuatro colores, más el recorte
  por lo que se está mirando: **295 ms** para rehacer la selección, con 694 nodos descartados por no
  verse.
- **`F2.2` ✅** — la nube calza con el modelo: señalar puntos sobre ella y aplicar la alineación. Con
  una desalineación conocida de 22,5°, el giro se recupera exacto y **la nube cae a 0,000 mm del
  modelo**. Y por el camino aparecieron dos defectos que daban números creíbles: el signo del giro
  invertido (69 m de desvío) y las cajas de los nodos calculadas en el sistema equivocado.

> **El sistema de referencia lo confirmó el usuario el 2026-09-03: `EPSG:32719` (WGS 84 / UTM 19S).**
> El levantamiento original no lo declaraba, y ahora **viaja dentro del `.copc.laz`** —1 501
> caracteres de WKT, comprobado al leerlo de vuelta— porque el conversor lo escribe con `--epsg`. Así
> no depende de que nadie lo recuerde.

- **`F2.4` 🔶** — la medida funciona y está comprobada con una respuesta calculable a mano: una losa
  y una nube 5 cm por encima dan `50,000 mm`. Falta el **IFC de la pasarela** para medir de verdad, y
  el oráculo —CloudCompare— **solo lo puede correr el usuario**.

**`F2.6`, el gaussian splatting, queda aparcado por decisión del usuario el 2026-09-03**: «no es tan
importante de momento; avanzar en los otros pendientes y módulos es mejor». No se descarta, se
pospone — y con el mismo criterio que la Fase 6.

**Lo que sigue, entonces, es `F0.6`**: la conversión del IFC en un worker. Gana peso justo ahora,
porque el usuario avisó de que **se van a incorporar diseños de otras especialidades** y el número de
modelos abiertos a la vez va a crecer: hoy la conversión bloquea el hilo de la interfaz.

**Y tres cosas no las decide este plan**, porque no son trabajo sino elecciones: `F1.13`, `F9.6` y
el trazo libre de `F4.5`. Están reunidas abajo, en «Las decisiones que solo el usuario puede tomar».

## La prioridad cambió el 2026-09-02, y la puso el usuario

> **«El diseño y la coordinación van con la misma prioridad, porque el proyecto empieza pronto y la
> coordinación es la piedra angular de todo.»**

**Eso reordena el plan, y no solo la lista de lo que sigue.** Hasta hoy el orden lo decidía qué
dejaba la aplicación entera y usable; desde hoy lo decide además **qué hace falta para coordinar una
obra de verdad en pocas semanas**. Lo que cambia en la práctica:

- **Las fases 4 y 5 pasan al frente**, y las tres grandes sin empezar —nubes de puntos, geo— se
  quedan detrás. No se descartan: se posponen, y queda dicho por qué.
- **La vara sube de «funciona» a «lo usa alguien».** Una capacidad que existe y solo se alcanza por
  la línea de comandos **no cuenta como hecha** para este objetivo. La detección de interferencias
  está en ese caso ahora mismo.
- **Lo que se mide cambia.** Hasta aquí las cifras eran de corrección —ratios, milisegundos,
  interferencias encontradas y perdidas—. Coordinar añade otras: cuántos hallazgos abre una corrida
  sobre dos disciplinas de verdad, cuántos son ruido, y cuántos clics hay entre ver uno y repartirlo.

**Los tres huecos que hoy separan «la coordinación funciona» de «se está usando»**, en el orden en
que estorban:

1. ~~**Nadie puede lanzar una corrida de interferencias desde la aplicación.**~~ **Cerrado el
   2026-09-02**: la pantalla del proyecto tiene «Revisar interferencias», cruza todos los modelos
   vigentes de la obra y deja lo que encuentra entre sus observaciones abiertas. Y con eso se
   decidió `F3.4`: **la petición espera**, porque veinte segundos caben en los ciento veinte del
   servidor y una cola traería una forma nueva de fallar en silencio.
2. ~~**La lista de coordinación no se puede trabajar cuando es larga.**~~ **Cerrado el 2026-09-02**:
   filtros «Todas / Mías / Choques / Notas» con su cuenta, y **descartar sin salir del visor** con
   el motivo obligatorio — el estado `DESCARTADA` existía y nada lo ponía. Lo que **sigue faltando**
   es separar lo nuevo de lo ya visto: los filtros no distinguen «esto apareció en la corrida de
   hoy».
3. ~~**`F4.6`, la vuelta del BCF.**~~ **Cerrado el 2026-09-02**: la pantalla de la obra importa un
   BCF del mandante, los temas nuevos entran como observaciones y las respuestas a las nuestras se
   suman a su hilo sin pisar nada. La política de fusión se escribió antes que el parser, y el
   oráculo fue `bcf-client`, que es otra implementación.

4. ~~**Una corrida devuelve treinta y cinco filas cuando hay trece problemas.**~~ **Cerrado el
   2026-09-02**: las interferencias vecinas se agrupan y llegan a la lista como una fila. Medido
   sobre el par real: **35 interferencias en 13 problemas**, y el cúmulo mayor de 6. Con eso la
   Fase 5 queda cerrada entera.

5. ~~**La lista no distinguía lo nuevo de lo ya visto.**~~ **Cerrado el 2026-09-02**: filtro
   «Nuevas» con su cuenta, filo y palabra en las tarjetas nuevas, y un «ya lo vi» que solo aparece
   cuando hay algo que ver. La marca es **por persona y por obra**.

**Lo que sigue**, entonces: el **trazo libre** de `F4.5` si la cota no alcanza —eso lo dice el
usuario mirando un BCF exportado— y la **Fase 10**, que el usuario abrió el 2026-09-02: etiquetas,
informes y tablas en los planos.

La coordinación ya hace el ciclo completo: detectar, agrupar, repartir, descartar, distinguir lo
nuevo, exportar e importar.

> **Esta sección decía «lo que sigue es `F0.6`» hasta el 2026-09-02**, y `F0.6` se cerró el
> 2026-08-19. La fuente única de verdad apuntaba a una tarea muerta durante dos semanas, mientras
> lo que quedaba de verdad había que ir a buscarlo por dos mil cuatrocientas líneas. De ahí el
> tablero de abajo: **una sola tabla con todo lo abierto**, que se actualiza al cerrar una fila.

**Lo cerrado en la semana del 2026-08-26 al 09-02**, para no volver a abrirlo: la auditoría entera
de la cinta (`F1.13`, siete desajustes), la puesta en la VM (`F3.11` — driver, gunicorn, `/health/`
y systemd), las vistas que se pueden pasar a otra persona (`F3.12`), la visibilidad en el viewpoint
(`F4.7`), la foto del hallazgo en el BCF (`F4.10`) y la medición que dejó `F3.4` sin proceder.

## Lo que queda, por fase

Las **veintinueve** filas abiertas, de una vez. `⬜` no empezada · `❓` medida y esperando algo ·
`⛔` bloqueada por una decisión del usuario.

**Y en el orden de prioridad del 2026-09-02**, no en el de los números de fase.

| Fase                                     | Filas abiertas                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **5 — Interferencias**                   | ✅ **la fase entera** — `F5.5` cierra con las dos mitades: silenciar y agrupar _(35 interferencias en 13 problemas)_            |
| **4 — Coordinación** ⭐                  | `F4.5` ◐ falta el trazo libre; las cotas ya viajan _(`F4.6` cerrada: el ciclo va y vuelve)_                                     |
| **3 — Backend**                          | `F3.4` ✅ decidida por el usuario el 2026-09-02: **la petición espera**, y por qué                                              |
| **9 — Diseño** ⭐                        | `F9.6` ⛔ — la decide el usuario, y son tres decisiones _(`F9.1` a `F9.5` cerradas)_                                            |
| **11 — El portal se ve plano** ⭐        | ✅ **la fase entera** — el portal, la ficha, la lista, los colores y la ayuda con su recorrido                                  |
| **10 — Etiquetas, informes y tablas** ⭐ | ✅ **la fase entera** — el informe sale en papel, se pide por etiqueta, el modelo saca sus cuadros y la lámina los lleva dentro |
| **1 — Visor**                            | `F1.13` ❓ — auditada; quedan tres nombres que decide el usuario                                                                |
| **7 — Planos, salida**                   | ✅ **la fase entera** — capas, DXF, PDF con sello, y el plano acotado y con sus llamadas                                        |
| **2 — Nubes de puntos**                  | `F2.5` ✅ el formato es **COPC**; `F2.1` `F2.2` `F2.3` `F2.4` `F2.6` ⬜ — cargar, alinear, visualizar, medir, y el splatting    |
| **6 — Geo + BIM**                        | `F6.1` a `F6.5` ⬜ — Cesium, ortofoto y terreno propios, situar el IFC, 3D Tiles, y recibir de AeroPlanner                      |

### Hasta dónde llega este bloque, revisado el 2026-09-03

El usuario lo encargó así: **«revisar el plan de los módulos pendientes y ver hasta dónde llegar, ya
que de momento la coordinación, nubes de puntos e IFC son lo más importante en este bloque»**. Esto
es la respuesta, con lo que se puede afirmar y lo que no.

**De los tres, dos están hechos y el tercero no ha empezado.**

| Lo importante del bloque | Dónde está de verdad                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coordinación**         | **Cerrada salvo medio punto.** Las fases 4, 5, 10 y 11 completas: detectar, agrupar, repartir, descartar, distinguir lo nuevo, el papel, el BCF de ida y vuelta. Queda `F4.5` |
| **IFC**                  | **Cerrado como camino completo**: se lee, se valida con IDS, se cruza, se anota por GUID, se saca en BCF, en DXF, en PDF y en cuadros. No queda ninguna fila abierta          |
| **Nubes de puntos**      | **Sin empezar: seis filas.** Y con dos condiciones que hay que decir antes de prometer plazos                                                                                 |

**Lo que queda de coordinación son dos tardes**, no un bloque: `F4.5` —el trazo libre sobre el
modelo— y las tres anotaciones que faltan de `F7.3` —ángulos, pendientes y llamadas—, las dos por
caminos que ya están abiertos. Eso es lo que se hace primero, porque cierra dos fases enteras.

**Y sobre las nubes, dos cosas que cambian la conversación:**

1. **El problema real es la alineación, no el render.** Cargar puntos es un `loader` y se hace en una
   tarde. Que caigan **donde corresponde respecto al modelo** es lo difícil: un IFC viene en
   coordenadas locales de proyecto y a veces con el norte rotado, mientras la nube viene
   georreferenciada del vuelo. `F2.1` sin `F2.2` es una nube bonita al lado del edificio, y `F2.4`
   —medir la desviación entre lo construido y lo modelado, que es para lo que sirve todo esto— mide
   basura con dos decimales hasta que `F2.2` esté resuelta.
2. **No se puede verificar en este entorno.** El oráculo de la fase es CloudCompare y el panel del
   navegador **no compone fotogramas**: es la misma limitación que tuvo `F7.1` parada meses y que
   obligó al corte por falta de latido. Una nube se juzga mirándola. Lo que sí se puede comprobar sin
   pantalla es la aritmética de la alineación —una transformación conocida aplicada a puntos
   conocidos— y ahí es donde conviene poner el esfuerzo medible.

**La recomendación, entonces, en este orden:**

1. ~~`F4.5` y lo que falta de `F7.3`~~ — **`F7.3` cerrada el 2026-09-03**, y con ella la fase 7
   entera. `F4.5` sigue condicionada a que mires un BCF exportado.
2. ~~`F2.5` **antes que `F2.1`**~~ — **cerrada el 2026-09-03**, y acertó el orden: decidió que entra
   **COPC** y no Potree, con lo que el cargador se escribe una vez. Está en
   [`docs/NUBES_DE_PUNTOS.md`](docs/NUBES_DE_PUNTOS.md).
3. **`F2.2`, la alineación** — es lo que sigue, con su prueba de aritmética pura en `bim-core`:
   transformación conocida, puntos conocidos, desviación esperada. Y ahora se sabe que empieza por
   **restar el desplazamiento**, no por rotar: en coordenadas UTM absolutas el `float32` de WebGL ya
   pierde 20 cm antes de que nadie alinee nada.
4. `F2.1` y `F2.3` después, sabiendo que **su aspecto queda pendiente de tu pantalla**, no de la
   nuestra. Y que lo primero de `F2.1` es comprobar que `copc` + `laz-perf` abren en el navegador el
   archivo que escribe `pdal` — eso está **sin verificar**, y el documento lo dice.

**Y las tres decisiones que siguen bloqueadas** —`F9.6`, `F1.13` y las que aparezcan— no están en
esta lista porque no son trabajo: son elecciones. Están abajo, en «Las decisiones que solo el usuario
puede tomar».

⭐ = prioridad del 2026-09-02. Las fases 2 y 6 **no se descartan, se posponen**: son las dos que no
tienen ni un archivo con el que verificarse hoy —no hay nube de puntos ni ortofoto en el
repositorio— así que abrirlas sería construir a ciegas mientras la coordinación espera.

**El orden no es el número de la fase.** Va primero lo que deja la aplicación entera y usable con
lo que ya hay —la Fase 9— y después lo que abre frente nuevo. Las fases 2, 5 y 6 son las tres
grandes que quedan por empezar, y ninguna se abre con la anterior a medio cerrar.

## Las decisiones que solo el usuario puede tomar

No son tareas: son preguntas abiertas que bloquean o desvían trabajo, y hasta hoy estaban
repartidas por el documento.

| #                                 | Qué hay que decidir                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F9.6` — **tres**, y por separado | Si el navegador de la derecha **se reparte** en un rail de destinos; si algo **puede flotar** sobre el modelo; si propiedades **se ancla** al elemento. Las tres contradicen una línea escrita de `UX.md`. Se puede aceptar una y rechazar las otras dos, y **si se acepta alguna se reescribe `UX.md` primero** |
| `F1.13` — **tres nombres**        | El grupo «Trabajo» de la cinta no dice qué contiene; **«Guardar vista»** es un mandato y solo vive en el panel derecho; y **calzar un plano, cortar a su altura, generar un plano y observar** son mandatos que hoy solo salen de un panel o de una ficha                                                        |
| `F3.4` — **el umbral**            | Ya está el número que la reabre: **30 s** sobre un archivo real. Hoy lo más lento son 1,5 s                                                                                                                                                                                                                      |
| ~~`F10.2` — qué es «una nota»~~   | ✅ **Contestada el 2026-09-02**: son los comentarios que ya existen, y lo que faltaba era elegir qué se imprime. Se cerró sin escribir ni un modelo nuevo — la pregunta valió más que el desarrollo que se habría hecho sin hacerla                                                                              |
| ~~`F10.3` — el papel~~            | ✅ **Contestada el 2026-09-02**: PDF desde el servidor, «así buscamos que sea interno». Con reportlab, elegido midiendo cinco opciones                                                                                                                                                                           |
| Despliegue                        | Qué dominio (`bim.<dominio>`), y si comparte VM con AeroControl y AeroPlanner                                                                                                                                                                                                                                    |
| Copias de seguridad               | No hay nada escrito. Son dos cosas separadas a propósito: la base y `/var/lib/aerobim`                                                                                                                                                                                                                           |
| Modelos de prueba                 | Falta uno **> 50 MB** y uno de instalaciones. Son los dos que decidirían si `F3.4` procede                                                                                                                                                                                                                       |

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

## FASE 1 — Visor IFC usable

**Objetivo de salida:** alguien de oficina técnica revisa un modelo sin abrir
software de escritorio ni pedir una licencia.

| #       | Tarea                                                                                                                                 | Estado                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `F1.1`  | Árbol espacial navegable (proyecto → sitio → edificio → planta → elemento) con aislar y ocultar                                       | ✅ ver abajo                                                                                                   |
| `F1.2`  | Panel de propiedades y **psets** del elemento seleccionado                                                                            | ✅ ver abajo                                                                                                   |
| `F1.3`  | Planos de corte y secciones                                                                                                           | ✅ ver abajo                                                                                                   |
| `F1.4`  | Mediciones: distancia, área y ángulo                                                                                                  | ✅ ver abajo                                                                                                   |
| `F1.5`  | Cargar **varios modelos IFC a la vez** (arquitectura + estructura + instalaciones) y alternarlos                                      | ✅ ver abajo                                                                                                   |
| `F1.6`  | Vistas guardadas: cámara, visibilidad y cortes, recuperables por nombre                                                               | ✅ ver abajo                                                                                                   |
| `F1.7`  | **Modos de vista**: proyección perspectiva/ortográfica, navegación (órbita, planta, primera persona) y representación (sólido, malla) | ✅ ver abajo                                                                                                   |
| `F1.8`  | **Barra de herramientas y panel de modelos** — reubicar y agrupar las herramientas; ordenar, activar y desactivar lo cargado          | ✅ ver abajo                                                                                                   |
| `F1.9`  | **Unidades de las propiedades** — cada número con la unidad que declara el archivo                                                    | ✅ ver abajo                                                                                                   |
| `F1.10` | **Geometría que no se carga** — el conversor dejaba fuera `IfcProxy`: 433 elementos de 1.274                                          | ✅ ver abajo                                                                                                   |
| `F1.11` | **El picker caía desviado** el ancho del panel izquierdo: se seleccionaba otro elemento                                               | ✅ ver abajo                                                                                                   |
| `F1.12` | **Preselección al pasar el cursor** — se selecciona sin clicar y el usuario lo llama «poco práctico»                                  | ✅ ver abajo                                                                                                   |
| `F1.13` | **El panel de abajo no se entiende** — reubicar y agrupar las herramientas, mirando cómo lo resuelven Revit y AutoCAD                 | ❓ auditada la cinta entera: siete desajustes cerrados y tres decisiones de nombre para el usuario — ver abajo |
| `F1.14` | **La medición de distancia no funciona** en uso real, con el modelo del usuario                                                       | ✅ ver abajo                                                                                                   |
| `F1.15` | **El modo fantasma se cae al mover** la cámara                                                                                        | ✅ ver abajo                                                                                                   |
| `F1.16` | **El renderizado no da profundidad** — sin sombras creíbles, el modelo se lee peor de lo que debería                                  | ✅ ver abajo                                                                                                   |

### Lo que el usuario pidió el 2026-08-19 y no estaba en ningún tablero

**Estaba en una nota con dos capturas, y `obsidian/` está en `.gitignore`**: se habría perdido.
Son cinco cosas, dichas con sus palabras, y ninguna es cosmética — todas son sobre _cómo se
navega y se revisa_, que es lo que llamó «lo esencial»:

### `F1.12`: nada selecciona al pasar el cursor, y el sospechoso era un color (2026-08-26)

«Al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco práctico.»

**Buscado, y no hay nada en el código que seleccione al pasar el cursor**: `pickAt` se llama solo
desde `onClick`, y no hay un solo `addEventListener` de movimiento del ratón en todo
`packages/viewer` —lo único que escucha el puntero son los controles de cámara y los medidores de la
librería cuando están encendidos—.

**Lo que sí sigue al cursor es el marcador de ajuste del medidor**, y venía con el borde en
`rgb(122, 75, 209)` a 10 px: un punto violeta, del mismo tono que «esto está seleccionado», saltando
de vértice en vértice. Eso se lee como una selección, y era el único candidato.

**Arreglado sin tocar comportamiento**: el marcador pasa a `#ffd43b`, amarillo, que es la convención
de AutoCAD y de BricsCAD para las marcas de referencia — nadie las confunde con una selección. El
ajuste engancha exactamente donde enganchaba. Comprobado en el navegador y no supuesto: las cuatro
clases de ajuste —base, cara, vértice y arista— devuelven `#ffd43b`, y la comprobación va en el modo
`medidas` del diagnóstico **porque son estáticos de la librería**: si una versión nueva les cambia
el nombre, el recolorado dejaría de aplicarse en silencio.

> **Si el usuario sigue viendo que «selecciona solo»**, entonces no era esto y hace falta saber dos
> cosas: qué pestaña estaba activa y qué se resaltaba. No hay más candidatos en el código.

### `F1.14` cerrada: la medición no fallaba, mentía (2026-08-26)

**El defecto tenía dos mitades y la segunda es la que lo hacía indistinguible de «no funciona».**

1. El ajuste de `LengthMeasurement` **no usa el rayo de la CPU: lee los píxeles de la escena
   dibujada**. Cuando esa lectura no resuelve —y depende de qué fotograma haya— `create()` no
   coloca nada.
2. Y `addMeasurePoint` **devolvía `true` de todas formas**, con su propio comentario admitiéndolo:
   _«Los medidores de la librería no informan si el clic cayó en el vacío, así que acá se da por
   registrado»_. La interfaz avanzaba el contador, el aviso pasaba a pedir el segundo punto, y un
   clic que no hizo nada se veía **igual** que uno que sí.

**El arreglo es usar el rayo propio, que ya estaba escrito.** `snapAt` usa `fragments.raycast` con
las mismas clases de ajuste —vértice, arista, cara— y es el mismo mecanismo que la selección, que
sí funciona en uso real. Devuelve el punto o `null`, así que el valor de retorno deja de mentir; y
`addPlanMeasurePoint`, que ya dibujaba una cota de dos clics con coordenadas propias, se
generaliza a `addDistancePoint` y sirve para los dos.

**Y la otra mitad: ahora el clic al vacío se dice.** La barra de estado avisa en ámbar —«ahí no hay
geometría: el clic no contó»— en vez de callarse. El silencio es lo que se lee como «no funciona».

**De paso salió gratis lo que `docs/UX.md` tenía pedido**: medir del plano al modelo en un mismo
gesto. Los dos puntos entran por la misma función, así que uno puede engancharse a un trazo del CAD
y el otro a un vértice del modelo.

**Comprobado en el navegador** con `Piso 5.ifc` y `ACAD-Piso 5_Base.dxf` cargados a la vez:

| Qué                            | Resultado                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| El rayo propio sobre el modelo | Devuelve el punto; en una esquina vacía devuelve `null`          |
| Clic al vacío                  | `false` — **no cuenta**, y la barra lo dice                      |
| Dos clics sobre el modelo      | Una cota: **13,066 m**, con 13,064 en planta y 0,179 de desnivel |
| Del plano al modelo            | Una cota: **8,948 m**                                            |

> **El ángulo y el área quedaron con el medidor de la librería**, con la nota de que eran «las dos
> que quedan». **Cerradas el mismo día**, más abajo.

### Las cuatro mediciones pasan por el rayo propio (2026-08-26)

El arreglo de `F1.14` dejó dicho que el ángulo y el área seguían con el medidor de la librería y
seguían sin informar del clic al vacío. Ya no: las cuatro entran por el mismo sitio.

**Lo que se gana no es solo consistencia, es poder comprobarlas.** El ajuste de la librería lee
píxeles de la escena dibujada, así que las tres medidas que dependían de él **no se podían ejercitar
en un entorno que no compone fotogramas** — que es exactamente donde el usuario decía que no
funcionaban. El comentario de `diag.ts` lo daba por perdido: _«es la única medición que se puede
comprobar sin interfaz»_, hablando de la perpendicular. Ahora hay un modo `medidas` que las prueba.

**Y para poder probarlas hizo falta una entrada nueva que además hacía falta por otro motivo.**
`addMeasurePointAt(punto)` suma un punto **por su coordenada del mundo**, sin rayo. Existe porque
restaurar una medición guardada —o abrir el punto de vista de un BCF— son coordenadas, no clics; y
porque el rayo, en este panel, **se agota en un par de llamadas**: el ángulo pide tres puntos y el
área cuatro, así que por el clic no había forma de llegar al final. Medido: las mismas quince
coordenadas dan quince puntos, luego seis, luego ninguno. Es la limitación que `HANDOFF.md` ya tenía
anotada, no un defecto del visor.

**Comprobado, con figuras de medida conocida** —una prueba que acepta cualquier número no comprueba
nada—:

| Qué                                      | Resultado                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| Clic al vacío en los **cuatro** modos    | `false` en los cuatro — antes solo la distancia      |
| Distancia, dos clics sobre el modelo     | **7,702 m**, con su cota dibujada                    |
| Ángulo, un triángulo rectángulo          | **90,00°** exactos, con su cota                      |
| Área, un cuadrado de 4 m                 | **16,00 m²** y **16,00 m** de perímetro, con su cota |
| Área con dos vértices, al cerrar         | No cierra: un área de dos puntos no significa nada   |
| Cancelar con tres vértices puestos       | Quedan 0                                             |
| Cambiar de modo con dos vértices puestos | Quedan 0                                             |

> **Y el oráculo se ganó el sueldo en la primera pasada.** El perímetro del cuadrado salió **12 m
> en vez de 16**: al portar el área tomé `perimeterM`, que es —y así lo dice— el largo de una
> polilínea **abierta**, y le faltaba el lado de vuelta. Con un contorno cualquiera el número habría
> pasado inadvertido. Ahora el dominio tiene `closedPerimeterM` **como función aparte y no como un
> parámetro**, porque un nombre que dice «cerrado» no se usa por descuido para lo otro; con sus
> cuatro pruebas, incluida la que dice que dos puntos son un segmento y no un contorno.
>
> **Lo que sigue sin poder comprobarse acá es la perpendicular**, y es inherente: su primer punto no
> es un punto, es una **cara** —hace falta la normal— y eso no viaja como una terna de números.
> Depende del rayo, con el presupuesto que haya. Tiene su propio modo, `?modo=perpendicular`.

### `F1.15` cerrada: el fantasma no se caía al mover, nunca estuvo entero (2026-08-26)

**Primero hubo que poder verlo.** «Se cae al mover» no se depura mirando, y en el entorno de trabajo
tampoco se puede mirar —el panel del navegador no compone fotogramas—, así que lo primero fue un
oráculo: `BimViewer.paintAudit` cuenta, material por material de la escena, cuántos llevan la
pintura translúcida y cuántos siguen opacos, y `diag.html?modo=fantasma` mueve la cámara y va
anotando. Con eso el defecto dejó de ser una frase.

**Lo que dijo la medición sobre `Piso 5.ifc`, antes de tocar nada:**

| Momento                      | Pintado                    |
| ---------------------------- | -------------------------- |
| Recién encendido el fantasma | **0 %**                    |
| Moviendo la cámara           | 53–56 %                    |
| Con la cámara ya detenida    | **62 %**, y ahí se quedaba |

Es decir: **no es que se caiga al mover, es que nunca llegó a estar entero**, y detenerse no lo
recupera. Y el repintado que había al descansar la cámara corría _antes_ de que llegaran las mallas
nuevas, así que subía siete puntos y se rendía.

**La causa apareció por un error, y fue el error el que la nombró.** Al intentar clonar el material
de las mallas que quedaban opacas, la traza dijo `LodMaterial.clone()` →
`Cannot read properties of undefined (reading 'color')`, sobre un `LODMesh`. Esas mallas son los
**sustitutos del nivel de detalle**: lo que Fragments dibuja mientras la cámara se mueve. No pasan
por su registro de resaltado, así que `fragments.highlight()` no las alcanza — y no es cuestión de a
quién se resalta: pasarle la lista explícita de todos los elementos con `getLocalIds()` dejaba
**exactamente las mismas 16 mallas** opacas y dibujando, con 258, 822, 180 índices reales.

**Y había un segundo defecto detrás, que ninguna nota tenía apuntado:** `resetHighlight()` **no
deshace lo que `highlight()` pinta**. Al volver a sólido quedaban 32 mallas translúcidas para
siempre.

**El arreglo:** la vista fantasma se pinta por cuenta propia —un clon translúcido por material de
origen, `depthWrite` apagado y las dos caras—, y `fragments.highlight` queda solo para la selección,
que es lo que sí resuelve bien. El material del nivel de detalle es el único que se pinta en su
sitio, porque no se deja clonar; se guarda cómo estaba y se repone. Y se engancha `onViewUpdated`
para tapar la geometría que llega nueva, con la condición de parada puesta en la escena misma —no
quedan opacos— y un techo de cuatro repintados por gesto, porque un material que no se dejara pintar
convertiría eso en un bucle infinito que quema la GPU en silencio.

**Después:**

| Momento                             | Antes             | Ahora         |
| ----------------------------------- | ----------------- | ------------- |
| Recién encendido                    | 0 %               | **100 %**     |
| En cada uno de los tres movimientos | 53–56 %           | **100 %**     |
| Con la cámara detenida              | 62 %              | **100 %**     |
| Al volver a sólido                  | 32 mallas pegadas | **0, limpio** |
| Materiales visibles en escena       | ~50               | 18            |

Lo último no es cosmético: al dejar de usar el resaltado de la librería para el fantasma
desaparecen sus mallas duplicadas, así que el modo cuesta menos que antes. Los dos únicos
translúcidos que quedan son **el vidrio del propio modelo**, y se dejan a propósito: pintarlos los
volvería _más_ opacos de lo que el modelo dice.

De paso el fantasma **conserva el color de cada elemento** en vez de blanquear el modelo entero, que
es lo que hacía la librería: mirando detrás de un muro se sigue distinguiendo una viga de una losa.

> **Lo que este oráculo no puede decir.** `paintAudit` **es ciego a la selección**: medido en los
> dos estilos, seleccionar no añade ningún material a la escena, ni en sólido ni en fantasma —
> Fragments dibuja el elemento elegido dentro de su propia pasada. Un cero de opacos con algo
> seleccionado se leía como «el fantasma se tragó la selección» y no era verdad. Queda dicho en
> `diag.ts`: si la selección dentro del fantasma da problemas, hay que mirar la pantalla.

- **`F1.14`** «las opciones de medida de distancia no está funcionando». `F1.4` está cerrada con
  33 pruebas de geometría, así que **es la interacción, no la aritmética** — y encaja con lo que
  `HANDOFF.md` ya decía de la perpendicular: en el navegador de pruebas ningún rayo encuentra
  geometría después de un par de refrescos.

### `F1.16` cerrada: las sombras estaban montadas y apagadas (2026-08-26)

**Es el mismo caso que `F7.13`**: el código dice sombras y la pantalla dice que no. La escena se
crea con `ShadowedScene`, con `setup({shadows: {cascade: 1, resolution: 2048}})` y con la
postproducción en `COLOR_PEN_SHADOWS`, así que leyendo el código estaba hecho. Medido con
`diag.html?modo=sombras` sobre `Piso 5.ifc`, **había cuatro cosas mal a la vez**:

| Qué                                      | Antes                                      | Ahora              |
| ---------------------------------------- | ------------------------------------------ | ------------------ |
| Mapa de sombras del renderizador         | **apagado**                                | encendido, suave   |
| Recuadro de sombra de la luz direccional | **10 × 10 m**, con el modelo midiendo 40,5 | 65 × 65 m          |
| Mallas que proyectan sombra              | **0 de 8**, y **0 de 15** al mover         | 8 de 8, y 15 de 15 |
| Mallas que reciben sombra                | **0**                                      | todas              |
| Luz ambiental                            | 1,50                                       | 0,45               |
| Luz direccional                          | 1,50                                       | 2,20               |

Las cuatro tienen su explicación y ninguna se habría encontrado leyendo:

1. **`setup({shadows})` crea la luz que proyecta y deja el mapa de sombras del renderizador
   apagado.** Sin él no se calcula ninguna sombra, haga lo que haga el resto.
2. **La cámara de sombra de una luz direccional es ortográfica y trae un recuadro pequeño de
   fábrica.** Con el edificio fuera de él no se dibuja _ni una_ sombra aunque todo lo demás esté
   bien. Ahora se ajusta al modelo con holgura —la sombra cae **fuera** de la planta, así que un
   recuadro justo la corta— y se rehace por cada modelo que entra.
3. **Three.js exige `castShadow` y `receiveShadow` por objeto**, y las mallas del modelo las crea
   el worker de Fragments _después_ del `setup`. Se ponen al cargar **y en cada aviso de
   `onViewUpdated`**, que es el mismo enganche que arregló el modo fantasma: sin eso, media planta
   deja de proyectar al girar la cámara.
4. **La luz ambiental venía a 1,50, igual que la direccional.** Un término ambiente tan fuerte
   iguala todas las caras y el modelo se ve plano — y esa es la mitad de «no da profundidad» que no
   tiene nada que ver con las sombras proyectadas. Baja a 0,45 y la direccional sube a 2,20 para
   que el total no oscurezca.

Y una más, que también habría dejado el modelo sin sombras y es difícil de ver: **la luz apunta a
donde diga su `target`**, y el de fábrica está en el origen. Un IFC de obra viene en coordenadas de
proyecto, a cientos de metros del origen: la luz lo iluminaba de canto. Ahora el `target` va al
centro del modelo.

Comprobado también con el IFC real de 23,6 MB: 71,5 m de lado, recuadro de 114 × 114 m, y **87 de
87** mallas proyectando y recibiendo. Y sin romper lo de antes: el modo fantasma sigue al 100 % y el
informe de fidelidad del plano no cambia una cifra.

> **Lo que no se puede afirmar desde aquí.** El panel del navegador de este entorno **no compone
> fotogramas**, así que no se puede mirar el resultado. Lo que se afirma es que **las cinco
> condiciones que Three.js exige están puestas y medidas**, donde antes cuatro no lo estaban. Que
> la sombra guste —dirección de la luz, dureza del borde— es una decisión de aspecto que pide una
> pantalla. La postproducción sigue apagándose en Modo 2D a propósito (`F7.16`): sobre un dibujo de
> líneas lava los colores.

### `F1.13`: la premisa está vencida, y hay que preguntar (2026-08-26)

**Buscado, y lo que el ticket describe ya no existe así.** Dos hallazgos:

- **`F1.13` pide lo mismo que `F1.8`, palabra por palabra** —«reubicar y agrupar las
  herramientas»—, y `F1.8` está cerrada. El comentario de `components/Ribbon.tsx` nombra el defecto
  que se arregló y coincide con la queja: _«catorce botones en fila, dos llamados "Planta", sin
  nombres»_. Hoy cada herramienta lleva su nombre debajo del icono y cada bloque el nombre de su
  grupo, que es la convención de Revit y BricsCAD — la referencia que el propio ticket pide mirar.
- **Y el pie de hoy no tiene herramientas**: `components/StatusBar.tsx` son 27 px con el modo
  activo, qué hace el próximo clic, el resultado de la medición con **cada magnitud por su nombre**
  y el estado de visibilidad. Los dos únicos botones son las dos salidas del aislamiento, y están
  ahí por una razón escrita: aislar se hace desde la ficha o desde el árbol, y el camino de vuelta
  tiene que verse desde cualquier pestaña.

Las dos cosas pasaron **el mismo día** que la nota (2026-08-19), así que lo más probable es que el
ticket describa la pantalla de antes del rediseño. **Rediseñar el pie a ciegas sería inventar un
problema**, y por eso queda en `❓`: falta que el usuario diga si lo que no se entiende sigue ahí y
qué es exactamente.

#### La auditoría de la cinta, hecha entera (2026-08-28)

En vez de esperar la respuesta sin hacer nada, se auditó la cinta **botón por botón contra lo que el
visor sabe hacer**. La pregunta no era de gusto —eso sigue siendo del usuario— sino comprobable:
**¿lo que la cinta ofrece coincide con lo que el visor puede?** Salieron siete desajustes, y ninguno
es de opinión: en los siete el código dice una cosa y la pantalla otra.

| #   | Lo que se veía                                                                                          | Lo que era                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Con un **DXF solo**, medio Vista en gris —encuadre, las cuatro vistas, proyección y navegación—         | `frameAll` cuenta los planos **a propósito**, con su comentario diciéndolo; la puerta de la cinta seguía siendo `models.length > 0`        |
| 2   | Un área a medio contornear **no tenía salida**                                                          | `cancelMeasurement` estaba implementada y comprobada en `diag.html`, y **no la llamaba nadie**: la única salida era pulsar "Seleccionar"   |
| 3   | **"Navegador" dos veces**: en la fila de pestañas y dentro del grupo _Visibilidad_ de la pestaña Modelo | El mismo `onTogglePanel("derecha")`, y en un grupo que habla de apagar elementos del modelo                                                |
| 4   | **"Ver todo" con dos dibujos**: un árbol en la cinta, un ojo en la barra de estado                      | Mismo mandato. Dos iconos obligan a leer el rótulo, que es lo que un icono viene a evitar                                                  |
| 5   | Un lector de pantalla anunciaba _"Todo, botón de alternancia, no pulsado"_                              | `aria-pressed` estaba en **todos** los botones, mandatos incluidos; y "Ver todo" y "Salir" usaban `active` para decir "hay algo que hacer" |
| 6   | Salir del **Modo 2D** encendía modelos que estaban apagados a mano, y devolvía la cámara a perspectiva  | El interruptor no deshacía lo suyo: reponía un estado de fábrica en vez del que había antes de entrar                                      |
| 7   | Escribiendo el nombre de una vista en modo Área, **`Enter` cerraba el contorno**                        | Los atajos escuchan en la ventana entera —que es lo que los hace funcionar sin pinchar el lienzo— y también oían a quien escribe           |

Los siete están cerrados. Lo comprobado en el navegador, con `fidelidad-2d.dxf` y **sin ningún IFC
abierto**, que es el caso que delataba el 1:

- Encuadre, las cuatro vistas, proyección y navegación **habilitados**; "Planta" mueve la cámara de
  `(50, 50, 50)` a `(0, 7.53, 0)` mirando al plano. _Aspecto_ y _Cortes_ siguen **en gris**, y es
  correcto: pintan fragmentos y `addSection` se calcula desde la caja de los modelos.
- Tres vértices puestos, `Esc` → **cero**, sin tocar las mediciones ya tomadas.
- Los mismos `Esc` y `Enter` **desde dentro de un campo de texto**: tres vértices → tres.
- Ortográfica → entrar al Modo 2D → salir → **Ortográfica**, donde antes salía Perspectiva.
- `aria-pressed` solo en los interruptores: "Cerrar contorno", "Cancelar", "Borrar todas" y "Ver
  todo" ya no lo llevan.

**El aspecto no se pudo mirar**: el panel del agente no compone fotogramas y la captura se agota
—la trampa ya escrita en `HANDOFF.md`—. Lo verificado acá es el comportamiento, leído del DOM y de
la API del visor.

**Y quedan tres decisiones que son del usuario**, porque son de nombre y de sitio, no de
funcionamiento:

1. El grupo **"Trabajo"** (Modo 2D + Ejes) no dice qué contiene. Los demás sí — _Encuadre_,
   _Vistas_, _Proyección_.
2. **Guardar una vista es un mandato y no tiene sitio en la cinta**: vive solo en el navegador de la
   derecha. En Revit estaría en la pestaña Vista.
3. Igual que el anterior, sin decidir: **calzar un plano**, **cortar a la altura del plano**,
   **generar un plano** y **observar** son mandatos que hoy solo salen desde un panel o desde la
   ficha del elemento.

**Oráculo:** el mismo modelo abierto en **Bonsai/BlenderBIM** (o cualquier visor
IFC de escritorio). El árbol, los psets y las mediciones deben coincidir — un
visor que muestra propiedades distintas a las del archivo es peor que no tenerlo.

`F1.5` no es un extra: la coordinación consiste precisamente en mirar dos
disciplinas juntas. Un visor de un modelo por vez no coordina nada.

### `F1.6` vistas guardadas (2026-08-19)

Una vista guarda **las tres cosas**, y las tres hacen falta: desde dónde se mira, qué está apagado y
por dónde está cortado. Con solo la cámara, la vista que le pasas a otro muestra algo distinto de lo
que tú estabas viendo, que es justo lo contrario de para qué sirve.

Se guardan por nombre en el navegador y **sobreviven a recargar la página** —verificado—. No van a un
servidor, y eso **dejó de ser toda la historia el 2026-08-28**: `F3.12` añadió las **vistas del
proyecto**, que sí se le pueden pasar a alguien porque van en GUID y en el sistema del IFC. Las
locales se quedan como están, que es lo que las hace baratas.

Dos decisiones que conviene tener escritas:

- **La forma de una vista vive en `bim-core`, no en la interfaz.** En cuanto algo se persiste, su
  forma es un contrato. Y su lectura es deliberadamente desconfiada: lo que sale del almacenamiento
  del navegador puede estar a medio escribir, ser de una versión anterior o haber sido editado a mano,
  así que `parseSavedViews` nunca lanza, descarta lo ilegible y conserva lo demás. Diez pruebas
  cubren eso, incluido el JSON truncado.
- **Lo oculto se guarda con identificadores de Fragments, no con GUID.** Sirve para una vista de
  trabajo —el mismo archivo, la misma sesión— y **no servirá para un viewpoint de BCF**, que tiene que
  ir por GUID porque los identificadores del motor cambian entre versiones del modelo. Queda dicho en
  el tipo para no descubrirlo en la Fase 4.

Al aplicar una vista, **lo que no exista se ignora**: si se guardó con tres modelos abiertos y ahora
hay dos, se restaura lo que hay en vez de fallar. Y el orden importa — la proyección primero, porque
sustituye el objeto de cámara y pisaría la posición si se hiciera después.

### `F1.11` el picker caía desviado, y era nuestro (2026-08-19)

**Clic en un pilar, se seleccionaba otro.** La causa: `pickAt` le restaba a las coordenadas del ratón
la posición del lienzo antes de pasárselas al rayo, y **Fragments ya se la resta por dentro**:

```js
// screenToCast, en @thatopen/fragments
const rect = element.getBoundingClientRect();
const x = (p.x - rect.left) / scaleX;
```

Restada dos veces, el rayo salía desviado **exactamente lo que mide el borde izquierdo del lienzo**.
Con el árbol como única columna eran 48 px y el fallo pasaba por "el picker es impreciso"; al poner
el panel de propiedades a la izquierda pasaron a ser 288 px y se volvió evidente.

Este error explica en retrospectiva **todas las quejas de selección desde la primera prueba de uso**,
y también por qué no se reproducía en `diag.html`: ahí el contenedor empieza en x = 0, así que restar
cero dos veces no cambia nada. La lección queda escrita en el código: **antes de convertir
coordenadas, leer qué espera la librería** — este error no da error, solo respuestas equivocadas.

### `F1.10` cerrada: eran los `IfcProxy` (2026-08-19)

**El usuario entregó el modelo y la respuesta salió en una consulta.** `716-LCD-ME-ISUP-D-TEST.ifc`,
una planta exportada por **ProStructures 24** de Bentley, declara:

| Clase       | Cuántos |
| ----------- | ------- |
| `IFCMEMBER` | 805     |
| `IFCPROXY`  | **433** |
| `IFCCOLUMN` | 34      |

Y el visor cargaba 839: los 805 perfiles y las 34 columnas. **Faltaban los 433 `IfcProxy`**, que es
donde ProStructures pone todo lo que no es estructura: la maquinaria, los grandes elementos curvos, el
transportador. `IfcProxy` es el comodín del estándar —un producto con geometría y sitio propios para
lo que no encaja en una clase concreta— y **no está en el conjunto de clases de `IfcImporter`**, que
sí trae `IfcBuildingElementProxy`, otra cosa.

El arreglo es una línea: añadir `WEBIFC.IFCPROXY` a `importer.classes.elements`. Medido antes y
después sobre el mismo archivo:

| Qué                     | Antes                | Después                  |
| ----------------------- | -------------------- | ------------------------ |
| Elementos en el árbol   | 841                  | **1.274**                |
| Elementos con geometría | 839                  | **1.272**                |
| Dimensiones del modelo  | 16,2 × 17,1 × 29,9 m | **20,6 × 21,0 × 69,0 m** |
| Fragments               | 1,5 MB               | 3,7 MB                   |

Los 69 metros de largo son el transportador que en OpenPlant se veía salir del edificio y en AeroBim
no estaba. Y un clic sobre esa geometría nueva abre su ficha, así que no es solo dibujo.

**El diagnóstico ahora compara cantidades, no presencia.** Antes solo detectaba la clase ausente por
completo; si de 500 tuberías llegaran 300, la clase aparecía entre las cargadas y no avisaba nada. Es
el caso que aparecerá con más modelos de Bentley, así que el aviso dice **cuántos de cuántos**.

**Cómo se amplía la lista de clases:** con datos. El aviso del panel de modelos dice qué clase falta;
cuando aparezca una nueva se añade con el modelo que la delató. La lista vive en dos sitios que hay
que mantener a la par —`packages/viewer/src/converter.ts` y `apps/web/src/convert.worker.ts`— porque
el worker no puede importar el paquete del visor sin arrastrarse three.js entero.

### El problema, como se veía antes de tener el archivo (2026-08-19)

**El mismo IFC de 32,7 MB abierto en Bentley OpenPlant muestra mucho más que AeroBim.** En el visor
aparece la estructura de acero —cerchas, columnas— y **falta el resto**: los grandes elementos
curvos de la planta, tuberías y maquinaria. No hay error, no hay aviso: el visor abre el modelo,
informa 839 elementos con geometría, y muestra la mitad.

**Por qué no se notaba desde dentro.** `IfcImporter` procesa un conjunto conocido de clases IFC
(`importer.classes.elements`). Una clase que no esté ahí no se importa, así que el elemento **no
entra ni al árbol**: ningún contador del visor lo echa de menos. Un modelo de arquitectura no
delata el problema porque sus clases son las esperadas; una planta industrial exportada desde un
modelador de tuberías está llena de clases que no lo son.

**Lo hecho:** el visor ahora **lo detecta y lo dice**. Antes de convertir, cuenta las clases que
declara el archivo (`countIfcEntities` en `bim-core`), las compara con las categorías que el modelo
cargado informa y avisa en el panel de modelos: _"Falta geometría: N elementos sin cargar"_ con la
lista de clases y su número. La comparación filtra geometría, relaciones, propiedades y tipos, que
no son elementos; una clase desconocida se informa, porque en un diagnóstico un falso positivo se
descarta leyendo su nombre y un falso negativo esconde justo lo que se busca.

#### Lo que se averiguó del conversor, con un fixture propio (2026-08-19)

Dos cosas concretas, y las dos cambian el diagnóstico:

1. **El conjunto de clases del importador no es el problema.** Se leyó
   `ifcClasses.elements` de `@thatopen/fragments`: son unas 140 clases e **incluyen** tubería,
   fittings, segmentos de flujo, elementos de distribución, ensamblajes y el proxy genérico. Lo que
   exporta un modelador de planta está ahí. La única exclusión deliberada visible es
   `IFCOPENINGELEMENT`, comentada, que es correcta —un vano es un hueco, no un elemento—.
2. **Cuando el conversor no puede construir la geometría de un elemento, descarta el elemento
   entero.** No lo deja en el árbol sin dibujar: no lo importa. Verificado con
   `elemento-sin-geometria.ifc`, un fixture con un muro con geometría y un `IFCPIPESEGMENT` sin
   representación: el muro entra, la tubería **no aparece ni en el árbol ni entre las categorías**, y
   el aviso del visor la señala.

Por eso el aviso dice las dos causas posibles sin elegir una, y por eso el contador de "elementos
cargados sin dibujar" existe pero casi siempre estará en cero: es el caso raro.

**Lo que falta:** leer ese aviso sobre el modelo real de 32,7 MB. La lista de clases dirá si lo que
falta es una clase concreta —entonces se añade al importador— o si son clases que sí están, y
entonces el problema es de `web-ifc` con esas representaciones. En ese caso las palancas, por orden
de coste: `importer.webIfcSettings` (`MEMORY_LIMIT`, `CIRCLE_SEGMENTS`, las tolerancias de
intersección de planos), subir la versión de `web-ifc`, o convertir ese modelo con IfcOpenShell en la
Fase 3. **Nada de eso se toca a ciegas.**

### `F1.4` las mediciones, rehechas con los componentes de la librería (2026-08-19)

Las propias calculaban bien y **no dibujaban nada**: ni el punto al que se ajustaba el cursor, ni los
extremos, ni el valor. Sin esa señal, medir era hacer clics a ciegas — es literalmente lo que hizo
pensar que la medición no funcionaba. Ahora son `LengthMeasurement`, `AngleMeasurement` y
`AreaMeasurement` de `@thatopen/components-front`, que traen marcador de ajuste, cota y etiqueta.
**Confirmado en el navegador del usuario**: cota dibujada, etiqueta con el valor y la lista contando
las cotas.

Cuatro cosas que hubo que corregir sobre lo que trae la librería:

1. **El relleno de un área tapaba el modelo entero.** Su material viene con `depthTest` desactivado,
   así que un área medida sobre el suelo se pintaba encima de todo y la pantalla quedaba violeta. Se
   sustituye por uno que respeta la profundidad.
2. **Las etiquetas venían azules**, con estilo escrito a mano en el elemento. Se repintan al
   aparecer, y sin `pointer-events`, porque una cota en medio del camino se comía el clic siguiente.
3. **Medir y seleccionar se pisaban.** Entrar a medir suelta la selección: un elemento violeta debajo
   de las cotas estorba y deja la duda de si el clic va a seguir seleccionando.
4. **El marcador de ajuste era un punto de 4 px** sobre un modelo de acero lleno de aristas. Ahora
   es más grande, y el ajuste se puede apagar para medir en medio de un paño.

Además, lo que la librería no da y en obra se pide: **la distancia se descompone en directa, en
planta y desnivel** (`distancePartsM` en `bim-core`, probado contra la rampa 3-4-5). Entre dos puntos
de una rampa son tres números distintos y se usa uno u otro según para qué; dar solo uno obliga a
adivinar cuál se está leyendo.

Y **las cotas se listan**: cada una se puede apagar sin borrarla o borrar sola. Se apaga sacándola de
la lista de su medidor —la librería solo permite ocultarlas por tipo— y se devuelve el mismo objeto,
así que conserva su identificador y su valor.

### `F1.9` las unidades de las propiedades (2026-08-19)

`Length 8070.861` no dice si son milímetros, metros o pies. Son tres órdenes de magnitud y alguien
va a pedir material con ese número. Ahora cada valor va con su unidad, y de dos fuentes:

1. **El tipo IFC del valor** (`IFCLENGTHMEASURE`, `IFCAREAMEASURE`…) más la unidad que el archivo
   declara en `IfcUnitAssignment`. Es lo que dice el archivo y no se discute.
2. **El nombre de la propiedad**, cuando el valor llega como número genérico. Los psets propios de
   las herramientas guardan longitudes como `IFCREAL` —así vienen los perfiles de acero— y ahí el
   nombre es lo único que queda. Se marca **atenuado** en la interfaz: una unidad deducida
   presentada como certeza es peor que ninguna.

**Fragments no conserva `IfcUnitAssignment`**: aplica el factor a la geometría y descarta la
declaración. Por eso se lee del texto del archivo antes de convertir (`parseIfcUnits`).

La inferencia por nombre es deliberadamente desconfiada: rechaza cualquier nombre con `/` o con
`per` —`Weight/Length` es kg/m, no kg— y los que terminan en identificador, tipo o estado.
Verificado sobre el modelo real: `Length 3520 mm`, `Volume 0.038 m³`, `Weight 300.116 kg` (85 kg/m
× 3,52 m = 299 kg ✓), y `Density/Spec. Weight` sin unidad, que es lo correcto.

**La masa cae al kilo cuando el archivo no la declara**, porque el estándar dice que sin declaración
manda la unidad base del SI. Longitud, área y volumen **no** caen a metros: ahí el mismo atajo
convertiría un modelo en milímetros en uno en metros.

#### Y el caso que faltaba: una medida escrita como texto (2026-08-19)

Al peso le seguía faltando el kilo, y la causa estaba en el archivo. ProStructures escribe:

```
#7887=IFCPROPERTYSINGLEVALUE('Length',$,IFCPOSITIVELENGTHMEASURE(1510.),$);
#7893=IFCPROPERTYSINGLEVALUE('Weight',$,IFCLABEL('579.84'),$);
```

El largo va como medida y **el peso como etiqueta**: un número escrito como texto. El visor lo
tomaba al pie de la letra —un texto no lleva unidad— y se quedaba sin kilos.

Ahora los tipos de texto se tratan como **"sin información"** y no como "sin unidad": si el valor es
un número a secas y el nombre dice de qué magnitud es, se deduce y se marca como deducida. Los tipos
numéricos sin dimensión —`IFCINTEGER`, `IFCBOOLEAN`— siguen cortando la deducción, porque ahí el
archivo sí está diciendo algo fiable.

Verificado sobre el modelo real con `diag.html?modo=psets&categoria=IFCMEMBER`, que lee un elemento
por categoría en vez de buscarlo con el ratón:

```
Length = 970 mm                  [IFCPOSITIVELENGTHMEASURE]
Volume = 0.001 m³                [IFCVOLUMEMEASURE]
Weight = 5.14145 kg (deducida)   [IFCLABEL]
Weight/Length = 5.1119           [IFCLABEL]      ← sin unidad: es kg/m
Density/Spec. Weight = 7850      [IFCLABEL]      ← sin unidad: es kg/m³
Total Count = 0                  [IFCLABEL]      ← sin unidad: es un conteo
```

Que los cocientes y el conteo se queden sin unidad **es el resultado correcto**, y es lo que
distingue una deducción prudente de una que inventa.

#### El falso positivo de las puertas (2026-08-19)

`Piso 5.ifc` acusaba **"7 elementos sin cargar: IFCDOORSTYLE"** con sus diez puertas dibujadas. En
IFC2X3 el tipo de una puerta es `IfcDoorStyle`: describe cómo son las puertas de esa clase y no es
ninguna de ellas. El filtro descartaba los `…TYPE` y no los `…STYLE`.

Con el filtro corregido, `Piso 5.ifc` no acusa nada: 555 entidades declaradas menos 7 estilos son
548 elementos, y 548 tienen geometría. **Un aviso con falsos positivos no sirve**: en cuanto miente
una vez, deja de creerse el resto.

### `F1.8` la barra de herramientas y el panel lateral (2026-08-19)

La barra de abajo tenía catorce botones en fila, dos llamados "Planta" y ningún icono. La
distribución se rehízo **tomando como referencia Revit y los modeladores de Bentley**, que es de
donde vienen quienes van a usar esto (petición del usuario, con capturas de OpenPlant y de Revit):

| Dónde         | Qué                                                                                    |
| ------------- | -------------------------------------------------------------------------------------- |
| **Arriba**    | Cinta con pestañas —Vista, Medición, Modelo— y grupos rotulados al pie                 |
| **Izquierda** | Propiedades del elemento seleccionado, siempre presente                                |
| **Derecha**   | Navegador del proyecto: estructura, modelos abiertos y cotas, plegables                |
| **Centro**    | El modelo, sin nada flotando encima                                                    |
| **Al pie**    | Barra de estado: qué hace el próximo clic, el resultado de la medida y qué hay abierto |

Las cuatro decisiones que resuelven el problema original:

- **Cada herramienta lleva su nombre debajo del icono**, y cada grupo el nombre del grupo. Con
  iconos solos hay que aprenderse la barra antes de poder usarla. La ambigüedad de "Planta"
  desaparece: una es "Desplazar" en Navegación y la otra "Horizontal" en Cortes.
- **Las pestañas mantienen la cinta en una fila.** Sin ellas serían veinte botones a la vez, que es
  el mismo desorden de antes en horizontal.
- **Nada flota sobre el modelo.** Las propiedades y los modelos vivían encima del lienzo tapando
  justo la esquina que se quería ver; ahora son paneles fijos, y los dos se pliegan desde la cinta.
- **El aviso de la herramienta está al pie**, en un sitio fijo, que es donde alguien que viene de
  Revit ya mira para saber qué está haciendo la herramienta.

**Pendiente de la referencia:** la rejilla del entorno y el fondo claro de esos programas. El fondo
oscuro es el de la familia AeroBim y no se cambia sin decidirlo; la rejilla sí encaja y queda como
mejora de la escena.

### `F1.5` la gestión de varios modelos (2026-08-19)

El panel de modelos permite **apagar, ordenar y cerrar** lo cargado. Apagar y cerrar son distintos y
se comportan distinto: apagado el modelo sigue en memoria y vuelve al instante; cerrado se libera y
hay que abrir el archivo otra vez. El botón de cerrar aparece solo al pasar por encima de la fila,
porque cuesta volver a convertir.

### `F1.3` cortes y `F1.4` mediciones completas (2026-08-19)

**Cortes.** Tres botones cortan el modelo por su centro: horizontal —para mirar la planta
sin la cubierta— y dos verticales. El plano se arrastra después con el ratón, y **Sin
cortes** los quita todos.

Se usa `createFromNormalAndCoplanarPoint` en vez de `create`, que coloca el plano donde
apunte el cursor: un corte por el centro es predecible, y es lo que alguien espera al pulsar
un botón llamado "corte horizontal".

Verificado de dos formas: con el contador de planos (0 → 1 → 2 → 3 al añadir los tres, y 0
al quitarlos) y **con captura del corte aplicado sobre el modelo real**, donde se ve el
plano con su manija de arrastre y el edificio seccionado mostrando el interior.

**Mediciones, ahora las tres.** Distancia entre dos puntos, ángulo entre tres —el segundo es
el vértice— y área de un contorno que **se recalcula con cada vértice**, así que se ve crecer
mientras se recorre. Medido sobre el modelo real: 1,131 m de distancia, 19,4° de ángulo, y
1,92 m² con 6,88 m de perímetro.

#### La geometría se mudó al dominio, y ahí sí tiene pruebas

`angleAtDeg`, `polygonAreaM2`, `perimeterM` y `distanceM` viven en `packages/bim-core`, no en
el visor. **Son números con consecuencias** —alguien va a pedir material con un área— y en el
dominio se prueban contra casos elementales verificables a mano: el cuadrado unitario mide
1 m², el triángulo 3-4-5 mide 6 m², un ángulo recto da 90°.

Dos casos merecen mención porque son los que delatan una implementación mala:

- **Un polígono lejos del origen mide igual.** La fórmula del área vectorial se rompe si se
  implementa sin cerrar el contorno; el test lo pone a 300 m del origen.
- **Un faldón inclinado mide su superficie real, no su sombra.** Un plano que sube 1 m en 1 m
  tiene √2 m² por metro de ancho, no 1 m². Proyectar al plano horizontal deja la obra corta
  de material, y por eso hay un test con exactamente ese caso.

18 pruebas nuevas; 67 en total.

### `F1.7`: modos de vista, y `F1.4`: medir distancias (2026-08-19)

**Agregado a pedido del usuario.** Una barra bajo el modelo agrupa lo que cambia _cómo_ se
mira, separado del árbol, que cambia _qué_ se mira. Los tres grupos son independientes: se
puede estar en ortográfica, en modo planta y en vista fantasma a la vez.

| Grupo              | Opciones                   | Verificado                                                                |
| ------------------ | -------------------------- | ------------------------------------------------------------------------- |
| **Proyección**     | Perspectiva · Ortográfica  | ✅ el objeto de cámara pasa de `PerspectiveCamera` a `OrthographicCamera` |
| **Navegación**     | Órbita · Planta · Interior | ✅ los tres modos se activan sin error                                    |
| **Representación** | Sólido · Fantasma          | ✅                                                                        |
| **Medir**          | Distancia entre dos puntos | ✅ midió 0,858 m entre dos puntos del modelo real                         |

La **ortográfica** es la que importa para una oficina técnica: sin fuga de perspectiva, dos
muros del mismo largo se ven del mismo largo, que es cómo se lee un plano.

#### Dos cosas dichas por su nombre

- **"Fantasma", no "wireframe".** Se logra pintando los materiales translúcidos, no
  dibujando aristas. Fragments **tiene** una representación de alambre (`CurrentLod.WIRES`)
  pero la reserva para su nivel de detalle automático y no la expone para forzarla. Llamarlo
  wireframe sería vender otra cosa; lo que hace —ver lo que hay detrás de un muro— es útil
  igual.
- **La medición es propia**, no de That Open. Sus anotaciones (`LinearAnnotations` y
  compañía) están atadas a los planos técnicos 2D (`pickHandle` pide un `TechnicalDrawing`),
  así que para medir en 3D se usa el raycast con ajuste a **vértice, arista y cara en ese
  orden de preferencia**. Sin la cara como respaldo, medir se vuelve un juego de puntería
  contra las esquinas.

La distancia sale en metros porque la escena está en metros: el factor de unidades del IFC
se aplicó al convertir, lo mismo que verifica la comprobación de dimensiones al cargar.
**Faltan área y ángulo** para cerrar `F1.4`.

### `F1.1`: árbol espacial con aislar y ocultar (2026-08-19)

El panel izquierdo recorre el modelo, y cada fila **aísla** con un clic u **oculta** con el
control de visibilidad. **Ver todo** restaura. Verificado sobre el modelo real: aislar
`IFCDOOR (10)` deja en pantalla exactamente las diez puertas, y restaurar devuelve el
edificio completo.

#### Cómo viene el árbol de Fragments, que no es lo que uno supone

Vale saberlo antes de tocar esa parte, porque el primer intento produjo niveles fantasma
etiquetados "sin categoría":

| Nodo                                | Qué es                                              |
| ----------------------------------- | --------------------------------------------------- |
| `category` presente, `localId` nulo | **Grupo** por categoría (`IFCBEAM`, `IFCDOOR`)      |
| `localId` presente, `category` nulo | El **elemento** real. Hereda la categoría del grupo |

Es decir, **Fragments ya agrupa por categoría**: reagrupar por encima duplica niveles. Y el
árbol no trae nombres, así que se resuelven aparte —`Name`, con `LongName` de respaldo,
que es donde muchos exportadores ponen el nombre de plantas y edificios— en **una sola
consulta por modelo**, no una por nodo.

#### Dos decisiones de presentación

- **Los grupos de más de 30 elementos no se listan.** El modelo de prueba tiene 470
  `IfcBuildingElementProxy`: listarlos da un árbol que nadie recorre. El grupo sigue siendo
  aislable y ocultable completo, y para llegar a uno concreto se hace clic en el modelo.
- **Un elemento sin nombre se muestra como `IFCBEAM #30188`.** El identificador es lo único
  que lo distingue de sus hermanos, y es honesto: inventar "Viga 1" sería peor.

### `F1.2`: clic → propiedades, con el GUID validado (2026-08-19)

Un clic sobre el modelo resuelve el elemento, lo resalta en violeta y abre su ficha. Sobre
el modelo de prueba, clicar una viga devuelve:

| Campo     | Valor                                                               |
| --------- | ------------------------------------------------------------------- |
| Categoría | `IFCBEAM`                                                           |
| GUID      | `2sOaC0lzL6JhvIR8y_YCPM`                                            |
| Tipo      | `IFCBEAMTYPE · Concrete, Plain 510.29`, con `PredefinedType = BEAM` |
| Material  | `IFCMATERIAL · Concrete, Plain`                                     |

**El GUID se valida con `bim-core` antes de mostrarlo**, en vez de confiar en el string:
un GUID mal formado no sirve como identidad, y es mejor saberlo acá que al exportar un
BCF. Así el dominio verificado contra el oráculo empieza a ganarse el sueldo.

#### Lo que el modelo de prueba enseñó sobre los datos

- **El GUID vive en `_guid`**, no en `GlobalId`, y la categoría en `_category`.
- **Este modelo no trae psets.** Su cabecera lo dice: `IfcExportBaseQuantities: Off`. Es
  una casilla del exportador, no un defecto del archivo, y **es el caso común**. Por eso
  el panel no habla de "psets" sino de bloques de propiedades: donde no hay psets sí hay
  tipo y material, que es justo lo que alguien busca al clicar una viga. Cuando el modelo
  los traiga, aparecen en el mismo lugar.
- **Las relaciones de IFC tienen ciclos.** `IsDefinedBy` lleva al tipo, y el tipo vuelve
  por `ObjectTypeOf` a _todos_ los elementos que comparten ese tipo — clicar una viga
  traía siete vigas hermanas. Esa relación se ignora, y el recorrido baja como máximo dos
  niveles: seguir el grafo sin límite lleva a listar medio modelo.

#### Los psets, ya verificados (2026-08-19)

Como el modelo real se exportó sin ellos, se escribió a mano el fixture
`muro-con-psets.ifc` con un `Pset_WallCommon` y unas `BaseQuantities`. **El panel los
muestra completos**, y con los tipos IFC bien traducidos: los booleanos como "sí"/"no", el
real como `0.35`, la etiqueta como `F-60`.

| Bloque            | Contenido                                                                    |
| ----------------- | ---------------------------------------------------------------------------- |
| `Pset_WallCommon` | LoadBearing sí · IsExternal no · ThermalTransmittance 0.35 · FireRating F-60 |
| `BaseQuantities`  | NetSideArea 12 · NetVolume 2.4 · Length 4000                                 |

Corregido de paso un problema de presentación que solo se vio con psets de verdad: el panel
mostraba **once bloques donde debía mostrar dos**. Las relaciones de IFC son de doble
sentido, así que cada propiedad reaparecía como bloque propio y el elemento se listaba a sí
mismo. Ahora las relaciones ya leídas (`HasProperties`, `Quantities`) no se recorren otra
vez, y el propio elemento se excluye de sus relacionados.

> **Pendiente honesto: las cantidades de longitud salen en las unidades del modelo.**
> `Length 4000` son 4000 mm, pero el panel no lo dice porque **no sabe la unidad**: los
> metadatos que expone Fragments traen esquema, nombres y CRS, y no `IfcUnitAssignment`.
> Convertir exige leer las unidades del IFC crudo con `web-ifc` durante la carga y guardar
> el factor — `bim-core` ya tiene `parseLengthUnit` y `toMeters` esperando para eso. Hasta
> entonces el valor se muestra tal como está en el archivo, sin inventar una unidad. Las
> áreas y volúmenes no tienen el problema: llegan en metros porque así los declara el IFC.

**Objetivo de salida:** el levantamiento y el modelo en la misma escena, que es la
comparación que nadie puede hacer hoy sin software de pago.

| #      | Tarea                                                                                         | Estado |
| ------ | --------------------------------------------------------------------------------------------- | ------ |
| `F2.1` | Cargar una nube (LAS/LAZ convertida) en la escena Three.js del visor                          | ✅     |
| `F2.2` | Alinear nube y modelo: origen, rotación y escala, con ajuste manual asistido                  | ✅     |
| `F2.3` | Controles de visualización: tamaño de punto, densidad, recorte por caja, color por altura/RGB | ✅     |
| `F2.4` | Medir del modelo a la nube (desviación entre lo construido y lo modelado)                     | 🔶     |
| `F2.5` | Documentar el pipeline de conversión **fuera de la aplicación**: `PotreeConverter` y `pdal`   | ✅     |

### `F2.4` el 2026-09-03 — la medida funciona; falta el modelo del usuario y su oráculo

**Se mide de cada punto del levantamiento a la superficie del modelo más cercana**, acotado a la caja
de un elemento. Con signo, porque un muro 5 cm más grueso y uno 5 cm más delgado dan la misma
distancia y son problemas opuestos: uno se come el espacio libre y el otro deja hueco.

**Comprobado en el navegador con una respuesta calculable a mano:** una losa modelada y una nube
puesta **5 cm por encima** dan `media: 50,000 mm`, `máxima: 50,000 mm`, `sesgo: +50,000 mm` sobre los
400 puntos, y la nube queda pintada por desviación. Y del `muro-minimo.ifc` real se extraen sus **12
triángulos** con la matriz de la malla aplicada, comprobado porque caen dentro de la caja que el
propio Fragments declara para ese elemento.

**El resumen da seis cifras y no una**, porque una sola miente: media, mediana, máxima, cuadrática
media, **percentil 95** —lo que se suele exigir en un control de obra— y **sesgo**. El sesgo es el
que distingue «la obra está corrida 3 cm» de «la obra está mal rematada»: con la distancia a secas
los dos casos se ven idénticos.

**Y el signo se declara no fiable** cuando todo lo que se sale de tolerancia cae del mismo lado, que
es lo que produce un modelo con las caras invertidas o una nube mal calzada. Entonces el sesgo no
informa de la obra sino del error, y decirlo es mejor que dar un número que parece medido.

> **Un hallazgo que costará tiempo a quien no lo sepa: la geometría del modelo NO está en la escena
> de Three.js.** Con un IFC cargado, el grafo tiene la escena, tres luces y **dos `Object3D`
> vacíos** — Fragments 3.x dibuja por su propio camino. Se descubrió recorriéndolo. La geometría se
> pide con `model.getItemsGeometry`, que devuelve posiciones, índices y **la matriz de cada malla**;
> un modelo con cien pilares iguales guarda una malla y cien matrices, así que ignorarla mediría
> contra el primero y daría la desviación de los otros noventa y nueve como si estuvieran todos en el
> mismo sitio.
>
> `EdgeProjector` —lo que usa el generador de planos— tampoco vale: **lee la escena dibujada**, y en
> un navegador que no compone fotogramas no resuelve nunca.

**Se mide por zonas y no de golpe, y no es una limitación sino la forma correcta.** 15 millones de
puntos contra decenas de miles de triángulos son cientos de miles de millones de operaciones: no es
que tarde, es que no acaba. Acotando a la caja de un elemento son cientos de triángulos y miles de
puntos —un instante— **y el resultado se puede atribuir a ese elemento**, que es lo que hace falta
para abrir una observación sobre él.

> **Lo que falta para cerrarla, y no depende de escribir código: el IFC de la pasarela del CC 741.**
> El usuario avisó el 2026-09-03 de que **el modelo está en construcción y todavía no existe**. Sin
> modelo del mismo sitio que la nube no hay contra qué medir de verdad, y **el oráculo de la fase —la
> misma nube y el mismo modelo en CloudCompare— solo lo puede correr el usuario**. La nube convertida
> está en `D:\I+D\nubes\camino-agricola.copc.laz`.

### El calce automático, y dos preguntas contestadas antes de que llegue el modelo

Esperar al modelo no era razón para no cerrar riesgos. Con un IFC de prueba **situado en las
coordenadas del Camino Agrícola** (`apps/web/public/samples/muro-en-utm.ifc`) se contestaron dos
cosas que iban a aparecer el día que llegue el de verdad:

**1. Un IFC en coordenadas UTM absolutas NO pierde precisión.** Era una duda legítima: la nube pierde
115 mm en el norte por el `float32`, y la geometría del modelo va por otro camino. Medido: el muro de
4,000 × 3,000 × 0,200 m vuelve con **0,00 mm de error** en sus lados.

**2. Y se sabe por qué: Fragments recentra el modelo y guarda su emplazamiento.** La caja vuelve en
el origen —no en UTM— y `getCoordinates()` devuelve `-349 721,696 · -564,466 · 6 292 883,778`, **ya
en ejes de escena**. La geometría nunca llega a manejar seis millones de metros, así que no hay nada
que perder.

**Eso abre el calce sin señalar un punto.** Si el modelo trae su emplazamiento y la nube el suyo,
juntarlos es una resta: `alignPointCloudToModel()`. **Comprobado con el levantamiento real**: el muro
situado en las coordenadas de la obra cae **dentro** de la nube tras un traslado de `1,304 · -3,466 ·
0,778` m. Con los ejes o el signo mal, caería a kilómetros.

Señalar puntos sigue siendo el camino que se usará casi siempre —la mayoría de los IFC de obra no
traen emplazamiento— pero cuando lo traen, el automático es exacto y no depende del pulso de nadie.

> **Lo que el calce automático no comprueba: que los dos estén en el mismo sistema de referencia.**
> Si el modelo estuviera en UTM 19S y la nube en otro huso, la resta daría un número y el edificio
> acabaría a cientos de kilómetros. Comparar los CRS es de quien decide.

**Oráculo:** la misma nube y el mismo modelo cargados en **CloudCompare**; las
desviaciones medidas deben coincidir dentro de la tolerancia del levantamiento.

> **Límite explícito, heredado de AeroPlanner:** la aplicación **no procesa ni
> clasifica** nubes de puntos. Abre lo que otro generó. La conversión a un formato
> con octree ocurre fuera, con herramientas de línea de comandos, y `F2.5`
> simplemente lo deja escrito.

### `F2.5` cerrada el 2026-09-03 — y el formato es **COPC**

El documento entero está en **[`docs/NUBES_DE_PUNTOS.md`](docs/NUBES_DE_PUNTOS.md)**: qué formato
entra, por qué, los comandos de `pdal` —marcados como **no ejecutados**, porque `pdal` no está
instalado— y qué queda fijado para `F2.1` a `F2.6`.

**Se decidió COPC** (`.copc.laz`) y no Potree, y las razones se midieron:

- **Es un archivo**, así que cabe en el expediente como cualquier documento. `PotreeConverter`
  produce un directorio con miles, y el registro guarda un archivo por documento.
- **CloudCompare lo abre**, con lo que el oráculo de la fase sigue existiendo. 3D Tiles no.
- **Los tres cargadores de Potree para Three.js no se pueden usar hoy:** `@pnext/three-loader` 1.0.0
  fija `three: ~0.160.0` y estamos en 0.185.1; `potree-loader` 1.10.4 se construyó contra three
  0.138.3 y lleva **`vite ^2.8.6` como dependencia de runtime**, con vite 8 en el repositorio.
- **Trae dentro el desplazamiento y el WKT**, comprobado escribiendo y leyendo un COPC de verdad: el
  `AUTHORITY["EPSG","32719"]` vuelve intacto, y `GetPointsWithinBox` sobre la caja de un elemento
  devolvió **260 puntos en 17 ms** — que es literalmente la operación del cruce con el IFC.

> **El hallazgo más caro de la fase, y cambia `F2.2`: `float32` pierde 20 cm en UTM.**
> Medido sobre 62 500 puntos en UTM 19S (Santiago), comparando cada coordenada con la misma pasada
> por `Float32Array` —que es lo que acepta WebGL—: **200 mm de error en el norte** (6 298 000 m),
> 12,5 mm en el este, 0 en la altura. Los **mismos** puntos restando primero el desplazamiento de la
> cabecera: **0,003 mm**.
>
> Y falla de la peor manera: el error **no es ruido**, es un escalonado, así que la nube **se ve bien
> y miente con dos decimales**. Con 200 mm de regla, la promesa de `F2.4` —medir la desviación entre
> lo construido y lo modelado— es imposible.
>
> La aritmética quedó probada en `packages/bim-core/src/nubes/precision.ts`, con los vectores
> medidos en Python como oráculo. Si alguien vuelve a perder precisión, **falla el gate**.

**Y el presupuesto de memoria, que es por qué hace falta un octree y no un `loader`:** verificado
contra Three.js r185 leyendo `BufferAttribute.array.byteLength`, un punto con posición y color son 15
bytes **y se pagan dos veces** —el `TypedArray` y su copia en la tarjeta—. **50 millones de puntos =
1,5 GB.** Un levantamiento de obra mediana son 50 a 200 millones. Está en
`packages/bim-core/src/nubes/presupuesto.ts` y lo usará `F2.3`.

### La alineación es el problema real, no el render

Cargar puntos es un `loader`. Que los puntos caigan donde corresponde respecto al
modelo es lo difícil: un IFC suele venir en coordenadas locales de proyecto (y a
veces con el norte rotado), mientras la nube viene georreferenciada del vuelo. Sin
`F2.2` resuelta, `F2.4` mide basura con dos decimales.

Y ahora se sabe que **no es solo cuestión de que calce a la vista**: con la nube en coordenadas
absolutas el error de representación es de 20 cm antes de empezar. Restar el desplazamiento no es un
detalle de la alineación, es su **primer paso obligatorio**.

### `F2.2` el 2026-09-03 — la aritmética está hecha y probada; el señalar puntos espera a `F2.1`

**Lo que está cerrado**, todo con prueba en `bim-core` y con el oráculo de una **transformación
conocida aplicada a puntos conocidos**:

- **`nubes/georreferencia.ts`** — `IfcMapConversion` resuelto en las dos direcciones. El giro sale de
  `atan2` sobre las dos componentes del eje y no de dividirlas, porque dividir **pierde el
  cuadrante**: un eje al suroeste da el mismo cociente que uno al noreste, y ese error pone el
  edificio girado 180°. Probado en nueve ángulos, incluidos los cuadrantes.
- **`nubes/calce.ts`** — el calce señalando puntos, que es **el camino que se va a usar casi
  siempre**: en IFC2X3 `IfcMapConversion` no existe, y en los IFC4 de obra suele venir vacía. Es
  Procrustes ortogonal, con solución cerrada. Recupera una transformación conocida con residuo por
  debajo de 10⁻⁶ m.
- **El hueco del servidor, que era grave.** El extractor leía `Eastings`, `Northings`,
  `OrthogonalHeight` y `Scale` y **se dejaba `XAxisAbscissa` y `XAxisOrdinate`**: con lo que llegaba
  al visor se podía trasladar el modelo y **no orientarlo**. Se añadieron, junto al sistema de
  referencia de `TargetCRS`, y el expediente ya dice «georreferenciado (IfcMapConversion, EPSG:32719,
  girado 30,0° respecto al norte)» — o «sin giro declarado», que es distinto de 0°.

**Tres decisiones del calce que cambian el resultado, y quedan escritas:**

1. **El giro es solo alrededor del vertical.** Un edificio y un levantamiento están los dos
   aplomados. Dejar que el ajuste gire en tres dimensiones le permite **inclinar el edificio** para
   absorber el error de quien señaló los puntos: el residuo baja mientras la alineación empeora. Es
   el fallo clásico de estos ajustes.
2. **La escala se queda en 1 salvo que se pida.** Una escala ajustada de 1,003 no es que el edificio
   mida distinto: es un error de unidades o unos puntos mal señalados, y absorberla lo esconde.
3. **El residuo se devuelve siempre, con el máximo además del medio.** El medio diluye el punto que
   se señaló mal; el máximo lo delata y dice cuál fue.

### `F2.2` cerrada el 2026-09-03 — señalar y calzar, medido sobre la nube real

Con la nube ya en la escena, la mitad que faltaba —señalar los puntos— quedó hecha:
`pickPointCloud` devuelve un punto de la nube **en los dos sistemas**, el de la escena para dibujar
la marca y el del archivo para el par de calce; `alignPointCloud` aplica la alineación.

**Lo medido en el navegador**, con una desalineación conocida de 22,5° sobre el levantamiento del
Camino Agrícola: el giro se recupera en `22.5000°`, el residuo es 0,000 mm, y **la nube cae a
0,000 mm del modelo** al aplicar la matriz. Al señalar, el punto devuelto queda a **0 mm del rayo** y
su conversión al sistema del archivo es exacta.

**El calce se aplica como matriz del objeto y no reescribiendo los puntos**: ya están en coordenadas
locales pequeñas, así que el giro lo hace la tarjeta sin perder precisión, y volver a calzar cuesta
dieciséis números en vez de subir cientos de megas otra vez. La matriz vive en
`packages/bim-core/src/nubes/matriz.ts`, probada **aplicándola** —no comparando dieciséis números
contra otros dieciséis, que sería comparar la fórmula consigo misma—.

> **Dos defectos encontrados escribiendo esto, y los dos daban números creíbles.**
>
> **1. El signo del giro estaba invertido**, y dejaba la nube a **69 metros** de su sitio. Lo cazó la
> prueba que aplica la matriz a puntos conocidos; una que comparara coeficientes no lo habría visto.
>
> **2. Las cajas de los nodos se calculaban en el sistema equivocado.** La clave de un nodo —`(d, x,
y, z)`— indexa las celdas en los ejes **del archivo**, y el cargador le pasaba el cubo **ya
> convertido a la escena**: el índice del norte se aplicaba sobre la altura. El recorte seguía dando
> cuentas verosímiles —«597 nodos fuera de vista»— **pero eran los nodos equivocados**. Ahora se
> convierte la cámara al sistema del archivo, con `planoAArchivo` y `cajaAArchivo`, y se nota en las
> cifras: el recorte por caja pasó de descartar los 1 329 nodos a descartar 575 y conservar 694.
>
> Es el mismo patrón que los 200 mm del `float32`: **el error no se ve, se mide**.

**Y una prueba propia que estaba mal planteada.** Exigía que señalar devolviera _el punto al que se
apuntó_, y devolvía otro a 24 m. No era un defecto: al pinchar una nube se atrapa **la superficie de
delante**, que es lo que quiere quien marca una esquina. Lo que sí hay que comprobar es que el punto
esté sobre el rayo —lo está, a 0 mm— y que su conversión sea la suya.

> **Y un límite dicho: señalar es tosco a distancia.** El umbral es de seis píxeles, y a 200 m de la
> nube seis píxeles son **dos metros**: se atrapa lo que hay cerca del rayo, no exactamente donde se
> apuntó. Es inherente a señalar por rayo sobre puntos sueltos; la forma fina es pintar un búfer de
> identificadores y leerlo, y eso queda para cuando estorbe de verdad.

### `F2.1` cerrada el 2026-09-03 — y comprobada en un navegador, no en Node

`packages/viewer/src/nubes.ts` abre un COPC y lo deja en la escena, con `loadPointCloud` y
`unloadPointCloud` en el visor. El diagnóstico es
`/diag.html?modo=nube&nube=/samples/levantamiento-sintetico.copc.laz`, y **lo medido en Chrome**
sobre una nube de geometría conocida —un plano y un muro de 3 m, en UTM 19S—:

| Lo que había que comprobar                       | Medido en el navegador                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Que `copc` + `laz-perf` abran de verdad          | **62 500 de 62 500 puntos**, en 88 ms                                    |
| Que se lea **por partes** y no el archivo entero | Todas las peticiones **`206 Partial Content`** — nunca un `200`          |
| Que la cabecera se lea sin bajar puntos          | 4 ms: extensión, escala, desplazamiento, 3 nodos y el WKT con EPSG 32719 |
| Que **WebGL los dibuje**                         | `renderer.info.render.points` = **62 500**, en **una** llamada de dibujo |
| Que la precisión sobreviva                       | error máximo **0,002 mm** frente a la extensión declarada                |
| Que la geometría conocida esté ahí               | el muro mide **3,000 m** medido en la geometría de la escena             |

**Y la demostración del hallazgo, ahora en el navegador:** la misma coordenada norte
—6 298 099,600— guardada sin restar el desplazamiento **habría perdido 100,0 mm**; restándolo,
0,0015 mm.

**Tres defectos que solo aparecen en un navegador, y por eso la comprobación no era opcional:**

1. **`Getter.create` de `copc` tomaba el camino de Node.** Decide entre `fs` y HTTP **mirando si la
   cadena parece una URL**, y `/samples/…` no se lo parece: moría con `Cannot read properties of
undefined (reading 'access')`. Se escribió nuestro lector con `fetch` y `Range`, que además deja
   a la vista que cada nodo es una petición de rango.
2. **El WASM de `laz-perf` va aparte** —214 KB— y por defecto lo busca al lado de su JavaScript, que
   empaquetado no está donde él cree. Es la trampa de la regla 9 de `AGENTS.md`, la del WASM de
   `web-ifc`. Se sirve desde `public/wasm/` y se le dice dónde está.
3. **Los ejes.** Un LAS tiene la cota en **Z** y la escena de Three.js el arriba en **Y**: sin
   convertir, el levantamiento entra **de canto**. Se usa `(x, z, -y)`, la misma transformación que
   ya usaban los ejes de replanteo y el plano DXF de referencia.

**Y dos límites dichos, que `F2.3` tiene que levantar:**

- **No hay recorte por lo que se está mirando.** Se carga por niveles de arriba abajo hasta el
  presupuesto que se le dé, y el nivel se toma entero o no se toma —media capa deja la nube con una
  zona fina y otra gruesa por el orden de la jerarquía, y eso se ve como un defecto del
  levantamiento—. El recorte por vista pide las cajas de los nodos, que salen del cubo del octree.
- **El cubo no siempre está declarado.** El primer COPC de prueba salió con el cubo en cero y
  `copc` lo leyó igual: sin cubo no hay recorte por vista posible, así que la ficha lo dice
  (`hayCubo`) en vez de dejar creer que funciona. El fixture se regeneró con el cubo puesto.

### `F2.3` cerrada el 2026-09-03 — y sobre la nube real del proyecto

**El usuario entregó el levantamiento del CC 741 — Camino Agrícola** el 2026-09-03, así que la fase
dejó de comprobarse contra un fixture. Lo que trae el archivo, medido:

| Del `Metro Camino Agricola Recortado.las` |                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Tamaño                                    | **3,37 GB**, LAS 1.2, formato de punto 2, de `3DReshaper`                  |
| Puntos                                    | **129 724 840** en 97,4 × 143,5 × 17,0 m — unos 9 300 puntos por m²        |
| Coordenadas                               | UTM, E 349 723 · N 6 292 883 · H 561                                       |
| **Sistema de referencia**                 | **NINGUNO declarado.** Es una pregunta abierta para el usuario             |
| Color                                     | **RGB de verdad**, no los campos en cero                                   |
| Clasificación                             | **toda en 0**: sin clasificar, así que «color por clase» no dice nada aquí |
| En un `float32`                           | **115 mm de error en el norte**. El hallazgo, sobre datos reales           |

**Convertida con `apps/web/scripts/a-copc.py`** —escrito porque `pdal` no se puede instalar en esta
máquina—: diezmada por rejilla a 3 cm queda en **15 366 674 puntos** (el 11,8 %) y **130 MB**, con un
octree de 7 niveles y 1 329 nodos. El diezmado no es una pérdida real para coordinar: 3 cm es más
fino que la tolerancia de cualquier control de obra, y 9 300 puntos por m² es densidad de escáner
terrestre, no de coordinación.

**Y lo medido en el navegador, sobre esa nube:**

|                                 |                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| La cabecera, sin bajar un punto | **8 ms**                                                                           |
| Primer pintado                  | **915 ms** con 1,5 millones de puntos                                              |
| Refresco con la cámara          | **295 ms** — 694 nodos descartados por no verse, 146 por ser diminutos             |
| Recorte por caja                | 1 176 nodos descartados **antes de descargarlos**                                  |
| Densidad a la mitad             | respeta el techo exacto                                                            |
| Los cuatro colores              | altura, clase, intensidad y RGB — el más lento, 140 ms, **sin volver a descargar** |
| Dibujado por WebGL              | **9 322 089 puntos** en 452 llamadas                                               |
| La precisión                    | 115 mm evitados; error restando, **0,0037 mm**                                     |

**Tres cosas se midieron y cambiaron el diseño**, y ninguna se habría visto sin la nube real:

1. **Los nodos eran demasiado pequeños.** La primera conversión, con la rejilla de 128 que dice la
   especificación, salió en **15 017 nodos de unos 1 000 puntos**: el visor tardaba **19,7 s** en
   traer lo que se veía, porque cada nodo es una petición de rango y el tiempo se iba en el ir y
   venir. Con rejilla de 512 son 1 329 nodos de 11 563 puntos y el refresco baja a **2,2 s**. La
   referencia de PotreeConverter y PDAL son 50 000 a 100 000 puntos por nodo, y el conversor ahora
   **imprime esa cifra y avisa** si queda baja.
2. **El mínimo de píxeles no puede ser 1.** Con el mínimo teórico, `refrescar` traía 6 378 nodos para
   una imagen idéntica. Con 16 píxeles —lo que un nodo puede aportar de detalle a esa distancia—
   pasa a 85. De 19,7 s a 295 ms es casi todo esto.
3. **La apertura no debe llenar el presupuesto.** Sin cámara no se puede descartar nada por tamaño,
   así que llenar 256 MB eran 8,9 millones de puntos y **7,8 s de pantalla vacía**. Con un tope de
   primer pintado de 1,5 millones aparece en 915 ms, y el refresco sube el detalle donde hace falta.

**Y una corrección de una prueba propia:** el diagnóstico decía «se dibujaron 35 270 de 36 935 —
algo se quedó fuera». No era un defecto: nuestra selección es conservadora a propósito y **Three.js
hace además su propio recorte por objeto**, que es exacto. Dibujar menos de lo cargado es el recorte
funcionando dos veces; lo que sería un defecto es cero, o más de lo cargado.

> **Lo que sigue sin verificar: no se ha abierto un COPC hecho por `pdal`.** Los archivos de esta
> fase los escribe `copclib` desde Python, con generadores versionados
> —`apps/web/scripts/nube-sintetica.py` y `apps/web/scripts/a-copc.py`— para que no sean binarios
> opacos. El octree que producen **sí reparte por el espacio** y se comprueba que cada punto cae en
> la caja de su nodo, pero `pdal` sigue siendo la herramienta del oficio y su salida habría que
> probarla cuando se pueda instalar.

### `F2.6` — Gaussian splatting: **va aquí y no en AeroPlanner** (decidido el 2026-08-26)

| #      | Tarea                                                                        | Estado |
| ------ | ---------------------------------------------------------------------------- | ------ |
| `F2.6` | Abrir una escena de gaussian splatting en la misma escena Three.js del visor | ⬜     |

Lo preguntó el usuario: ¿AeroBim o AeroPlanner? **AeroBim**, por cuatro razones, y ninguna es de
comodidad:

1. **El valor del splat es comparar lo construido con lo modelado**, y esa comparación **solo existe
   aquí**. Es literalmente la razón de ser del producto —«lo que dice el plano, ¿está modelado?»— y
   ya hay un IFC y un DXF en la misma escena para hacerla.
2. **El sitio ya está reservado.** `docs/UX.md` tiene `NUBES DE PUNTOS` como sección del navegador
   del proyecto, y un splat es de la misma clase: una captura de la realidad, con las mismas
   necesidades —encender y apagar, recortar por caja, medir contra ella y, sobre todo, **calzarla
   con el modelo**—. La regla de crecimiento del propio documento es «una capacidad nueva es una
   sección del navegador».
3. **La máquina que hace falta ya está montada acá**: la escena, la cámara, los cortes, las
   mediciones y la disciplina de unidades y coordenadas. Y `F2.2` —el problema difícil, alinear la
   captura con el modelo— **es el mismo problema** y se resuelve una vez para las dos.
4. **El ciclo se cierra acá**: sobre un splat se ve el defecto y se abre la observación, con su
   responsable y su correo. En AeroPlanner no hay a quién asignar nada.

**Lo que sí es de AeroPlanner** es la otra mitad: **planificar el vuelo que produce una buena
reconstrucción** —líneas y solape— y, si acaso, lanzar y vigilar el trabajo de reconstrucción. El
artefacto se consume aquí. Es la misma división que ya existe con la ortofoto (`F6.4`).

> **Y una trampa verificada que costaría una sesión.** El renderizador más conocido para Three.js,
> `@mkkellogg/gaussian-splats-3d` (MIT), usa **`SharedArrayBuffer` por defecto** para hablar con su
> worker de ordenamiento, y su propio README dice que para eso **hacen falta las cabeceras
> COOP/COEP**. Esas cabeceras son la **regla cerrada número 9 de `AGENTS.md`**: activan el WASM
> multihilo de `web-ifc`, que no funciona empaquetado, y **el visor se cuelga sin emitir error**.
>
> Así que si entra por ahí, entra con `sharedMemoryForWorkers: false` y —como recomienda el propio
> README cuando eso se apaga— `gpuAcceleratedSort: false`. No es una preferencia de rendimiento: es
> la diferencia entre que el IFC abra o no. Alternativas a evaluar, las tres MIT:
> `@sparkjsdev/spark` (pensado para Three.js), `gsplat` y el motor `playcanvas` — de este último hay
> que ver si trae su propia escena, que es el motivo por el que se descartó `dxf-viewer`.
>
> Lo otro a medir antes de prometer: **el peso**. Una escena de splats son cientos de megas, y este
> repositorio ya pagó una vez el precio de la memoria de vídeo con el atlas de rótulos del plano. El
> archivo vive fuera del repositorio, como los IFC.

---

## FASE 3 — Persistencia y backend

**Objetivo de salida:** los modelos dejan de vivir en la pestaña del navegador: se
guardan por proyecto, con versiones y con quién subió qué.

| #       | Tarea                                                                                                | Estado                                       |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `F3.1`  | API en Python (Django + DRF, como AeroControl): proyectos, modelos, versiones, usuarios y permisos   | ✅ ver abajo                                 |
| `F3.2`  | Almacenamiento de archivos con validación de tipo, tamaño y nombre — nunca el nombre del cliente     | ✅ ver abajo                                 |
| `F3.3`  | Extracción de metadatos con `ifcopenshell`: esquema, unidades, georreferenciación, conteo por tipo   | ✅ ver abajo                                 |
| `F3.4`  | Jobs asíncronos (Celery) para lo que tarde: conversión, extracción, validación                       | ✅ decidida: no, y con el número — ver abajo |
| `F3.5`  | Validación **IDS** con `ifctester`: el modelo cumple o no el requisito de información del proyecto   | ✅ ver abajo                                 |
| `F3.10` | **El IDS de partida**: qué trae el modelo, medido, y el requisito que sale de esa medición           | ✅                                           |
| `F3.6`  | **Levantar `services/api`**: Django 6 + uv, con la forma de AeroControl y base de datos propia       | ✅                                           |
| `F3.7`  | **Portal de ingreso**: `django.contrib.auth` endurecido con axes, sin auto-registro                  | ✅                                           |
| `F3.8`  | **Roles y el contrato de permisos**: la matriz como dato, el guardián, y la prueba de 403            | ✅                                           |
| `F3.9`  | **Los módulos y cómo se entra a cada uno**: portal por etapa de trabajo, filtrado por permiso        | ✅                                           |
| `F3.11` | **Ponerlo en la VM**: driver de PostgreSQL, servidor de aplicación, `/health/` y unidades de systemd | ✅ ver abajo                                 |
| `F3.12` | **Vistas que se pueden pasar**: la vista del modelo sale del navegador y vive en el proyecto         | ✅ ver abajo                                 |

**Criterio de aceptación:** un modelo subido sobrevive al cierre del navegador, y
la versión anterior sigue recuperable.

### `F3.4` decidida: la petición espera, y con el número delante (2026-09-02)

**La decisión la tomó el usuario** cuando la pantalla de interferencias la forzó: la corrida tarda
**20 s medidos** por par de modelos, y esos veinte segundos **caben de sobra en los ciento veinte**
que da el servidor. Una cola traería un broker, un proceso trabajador, su unidad de systemd y una
forma nueva de fallar callada —un trabajo encolado que nadie procesa no da error— a cambio de
ahorrar una espera que se puede anunciar.

Así que **se anuncia**: el botón dice cuánto tarda **antes** de pulsarlo, porque uno que deja la
pantalla quieta sin explicación se pulsa dos veces. Y la corrida deja su fila en `JobRun`, que es
donde se ve una que murió a mitad.

**Lo que reabriría la cola, escrito para no volver a discutirlo por intuición:** que un par de
modelos reales pase de **60 s** —la mitad del tiempo del servidor— o que una obra tenga tantos
modelos que la corrida completa se acerque a ese tope. Con cuatro modelos son seis pares, unos dos
minutos: **ahí ya conviene la cola**, y el número está.

### Y antes de eso: los tres trabajos «que tardan», medidos — y no tardaban (2026-08-28)

La fila pedía **Celery** para «lo que tarde: conversión, extracción, validación», y esa premisa
nunca se había medido entera. Se midió, sobre los tres modelos y con los tres trabajos que hoy
corren **dentro de la petición**:

| Trabajo           | `muro-con-psets` (2 KB) | `Piso 5` (1,5 MB) | Real (**32,7 MB**) |
| ----------------- | ----------------------- | ----------------- | ------------------ |
| `ifc.extraer`     | 116 ms                  | 81 ms             | **1.397 ms**       |
| `cobertura.medir` | 14 ms                   | 91 ms             | **1.529 ms**       |
| `ids.validar`     | —                       | —                 | **668 ms**         |

**Ninguno llega a dos segundos sobre el modelo real de la organización**, y los tres juntos no
llegan a cuatro. Montar Celery para eso sería pagar un **broker, un proceso trabajador, su unidad de
systemd y una forma nueva de fallar en silencio** —un trabajo encolado que nadie procesa no da
error: simplemente no pasa nada, que es la lección que ya está escrita en `apps/core/jobs.py`— a
cambio de ahorrar segundo y medio.

**Y la «conversión» de la fila ya no vive aquí.** `F0.6` la movió a un **Web Worker del navegador**:
son 9,5 s para el IFC de 32,7 MB y **ninguno de ellos ocurre en el servidor**. La fila se escribió
antes de esa decisión y arrastraba el trabajo más pesado de los tres.

**Qué haría falta para que proceda, dicho como número y no como intuición**: que un trabajo pase de
**30 s** —la cuarta parte del `timeout` de gunicorn— sobre un archivo que la organización recibe de
verdad. Los candidatos son un IFC federado bastante mayor que 32,7 MB, o un IDS de proyecto con
cientos de especificaciones en vez de las que genera `F3.10`. **Ninguno de los dos existe todavía
como archivo que mirar**, y es la misma razón por la que `F4.6` sigue en espera.

Hasta entonces, el `timeout` de 120 s de `config/gunicorn.conf.py` deja de ser un parche con fecha y
pasa a ser holgura: **dos órdenes de magnitud** sobre lo medido.

### `F3.12`: una vista guardada que no se le puede pasar a nadie (2026-08-28)

**Es el objetivo de salida de esta fase aplicado a lo que quedaba dentro de la pestaña.** Las vistas
guardadas sobrevivían a recargar la página y **no salían del equipo** —lo decía el pie de su propia
sección—, así que dos personas revisando el mismo modelo no podían mirar lo mismo. Coordinar es
exactamente eso, y la limitación pasó de aceptable a molesta en cuanto la coordinación se metió
dentro del visor.

**No es «la misma vista, pero en el servidor», y esa es la decisión de fondo.** Una vista local está
escrita en el idioma de **esa sesión**: coordenadas de la escena —con el eje Y hacia arriba, que es
una convención de Three.js— y `localId` de Fragments para lo oculto, que es el identificador del
motor y cambia entre versiones del modelo. `savedView.ts` ya lo dejó anotado hace días: su clave
**no sirve** para un viewpoint. Guardar eso en una base de datos sería meter dos convenciones
internas en un dato que va a durar más que ellas.

Una vista compartida está escrita en el idioma del **modelo**:

| Qué        | Cómo viaja                                                          |
| ---------- | ------------------------------------------------------------------- |
| La cámara  | Ya en el sistema del IFC — lo mismo que escribe `F4.1`              |
| Lo apagado | Por **GUID**, con la forma de un `Visibility` — lo que cerró `F4.7` |
| Los cortes | Normal y origen, también en el sistema del IFC                      |

O sea: **es un viewpoint de BCF con nombre y con cortes**, y eso no es casualidad — es la
consecuencia de exigirle que sobreviva a quien la escribió. **Por eso `F4.7` iba primero**, aunque
en el orden de valor esta estaba antes: sin la visibilidad por GUID, una vista compartida solo
habría podido llevar la cámara.

**Las locales no desaparecen, y las dos secciones conviven a propósito.** Una vista local es de
trabajo —«déjame esto como está mientras almuerzo»— y no cuesta nada: ni viaje al servidor ni
permiso que pedir. Compartir es un acto explícito. Puestas una debajo de la otra en el navegador, la
diferencia se lee sin explicarla.

**Se comparte lo que se está mirando, no una vista local ya guardada.** No es una simplificación: a
una vista local **le faltan dos datos** para armar un viewpoint —el «arriba» real de la imagen y el
alto de la vista ortogonal—, que son justo los que BCF exige y los que una vista de trabajo no
necesita. Convertirla obligaría a inventarlos.

Tres decisiones más que conviene tener escritas:

- **El modo de navegación no viaja.** Es cómo se mueve uno, no lo que se ve, y quien recibe la vista
  está mirando, no recorriendo: ponerlo cambiaría el control del ratón de otra persona sin que nadie
  se lo pidiera. La proyección sí, porque una ortográfica y una perspectiva del mismo sitio **no
  muestran lo mismo**.
- **Los cortes se descartan uno a uno; la cámara, entera.** Son independientes entre sí, y perder
  una vista completa porque un corte venía mal sería peor que aplicarla con los que valen. La cámara
  no admite eso porque media cámara no se dibuja — y una vista sin cámara se rechaza al compartirla,
  en vez de dejar en la lista del otro una fila que se pulsa y no hace nada.
- **La borra quien la compartió, y nadie más.** `delete_vistadeproyecto` dice «puede borrar vistas»,
  no «puede borrar **estas**»: sin la comprobación del autor, cualquiera con el permiso quita la
  vista que otro dejó preparada para una reunión.

El contrato de permisos, sin atajos: `view_vistadeproyecto` está en la lectura del proyecto —también
para el **mandante**, porque una vista es como se le enseña algo a alguien y él es a quien más se le
enseña— y `add_`/`delete_` van con quien trabaja el modelo. Con su prueba de 403 y su prueba de
aislamiento entre organizaciones, que son dos preguntas distintas.

**Comprobado en el navegador sobre `Piso 5.ifc`**, con dos elementos apagados y un corte puesto: se
captura, se deshace todo —modelo entero, sin cortes, cámara en otro sitio— y al aplicar la vista
vuelven los dos ocultos, el corte y la cámara. La posición guardada en el sistema del IFC era
`(13,404, −10,32, 14,863)` y la cámara acabó en `(13,404, 14,863, 10,32)` de la escena, que es
`ifcAEscena` exacta.

**439 pruebas en la API con 94,21 % de cobertura y 251 en `bim-core`**, gate en verde.

### `F3.11`: los tres huecos entre «pasa el gate» y «arranca en la VM» (2026-08-28)

Los tres se habían localizado leyendo el despliegue, no ejecutándolo, y los tres tienen la misma
forma: **la aplicación funciona en el equipo de desarrollo justamente porque ahí no se usan.**

- **`psycopg` no estaba declarado.** `DB_ENGINE=postgresql` reventaba al arrancar, y peor que
  reventar: el mensaje de Django nombra **`psycopg2`** —el paquete anterior—, así que manda a
  instalar el que no es. Ahora psycopg 3 y gunicorn viven en un grupo `deploy` aparte —ninguno de
  los dos pinta nada en un equipo con SQLite, y gunicorn ni siquiera instala en Windows— y
  `base.py` comprueba el driver **al cargar los ajustes**, con el comando exacto en el mensaje. La
  diferencia importa: fallando en la primera consulta, `systemctl start` informa `active` sobre un
  servicio que no sirve.
- **No había servidor de aplicación.** `config/gunicorn.conf.py`, con socket de UNIX en vez de
  puerto —un puerto local deja saltarse el proxy, y con él la terminación TLS y las cabeceras que
  pone— y `timeout` en **120 s**, no en los 30 de fábrica: convertir un IFC grande pasa del minuto
  y con el tiempo por defecto gunicorn mata al worker a mitad y sale un 502 sin explicación. Es un
  parche con fecha: lo que tarde más que eso es trabajo de `F3.4`.
- **No había `/health/` ni unidades.** Ahora hay las dos cosas, y una decisión escrita en cada una.

**`/health/` es la única ruta sin login, y por qué eso no rompe el contrato de `AGENTS.md`.** La
regla del `view_*` explícito se sostiene porque una superficie de lectura entrega **datos de
alguien**; esta no entrega ninguno. Contesta una sola pregunta —¿este proceso puede atender?— y la
tiene que poder hacer quien todavía no puede autenticarse. Por lo mismo **no dice de más**: sin
autenticar la respuesta no lleva rutas, ni versiones, ni el texto de una excepción, y hay una
prueba que lo comprueba con un nombre de carpeta reconocible. El detalle va al journal.

Comprueba las **tres formas en que esta VM se rompe callada**, y no todas pesan igual:

| Comprobación             | Si falla              | Por qué                                                                                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos            | `503`                 | Con `CONN_MAX_AGE` puesto hay que preguntarle de verdad: la conexión puede seguir abierta contra un servidor que ya se fue              |
| Directorio de documentos | `503`                 | **Es el que destruye datos en silencio.** Sin el montaje, Django no falla: escribe en el disco local y lo subido se pierde al reiniciar |
| Visor construido         | `200` con `degradado` | El portal, el registro y la API funcionan sin el SPA. Un 503 sacaría de servicio la aplicación entera por una mitad que no lo está      |

**Las unidades: dos decisiones que se pagan si se hacen de otro modo.** `Type=notify` y no `simple`
—con `simple`, systemd da por arrancado el servicio en cuanto el proceso existe, o sea antes de que
Django cargue los ajustes, y un `SECRET_KEY` que falta se ve como `active`—; y el gunicorn del
entorno en el `ExecStart`, **no `uv run`**, que sincroniza el entorno antes de ejecutar y con
`ProtectSystem=strict` el disco está de solo lectura: el servicio no arrancaría, o peor, arrancaría
a veces.

Todo el procedimiento, con lo que hay que cambiar del `.env` y cómo comprobarlo, en
[docs/DEPLOY.md](docs/DEPLOY.md). **404 pruebas y 94,18 % de cobertura**, gate en verde. Las
líneas 89–101 de `base.py` —la comprobación del driver— salen sin cubrir a propósito: se ejercitan
en un proceso aparte, que es la única forma de probar algo que ocurre al **importar** el módulo de
ajustes, y coverage no sigue subprocesos.

**Lo que queda del bloque y no es código**: qué dominio, si comparte VM con AeroControl y
AeroPlanner, y las copias de seguridad —de las que no hay nada escrito, y son dos cosas separadas a
propósito: la base y el directorio de documentos—.

### `F3.5` cerrada: el modelo cumple o no el requisito del proyecto (2026-08-26)

**Es lo que este plan llamaba «lo que separa un visor de una herramienta de control».** Revisar a
mano si cada elemento trae el pset que el mandante exigió no escala —702 vigas por modelo— y un IDS
lo verifica en segundos.

**IDS es el estándar de buildingSMART**, así que el requisito es **interoperable**: el mismo archivo
lo entiende Solibri, lo entiende BlenderBIM y lo entiende esto. Un requisito escrito en una tabla
nuestra no lo entiende nadie más. `ifctester` (LGPL-3.0) se usa **como librería**, que es lo que
`AGENTS.md` permite.

**Dos modelos, y la separación importa.** `RequisitoIds` es del **proyecto** —el mandante exige lo
mismo a todos los modelos de la obra, y tenerlo por entregable obligaría a copiarlo—. `ValidacionIds`
es **un acto con su fecha**: el requisito cambia a mitad de proyecto, y entonces la misma revisión
cumple ayer y no cumple hoy. Guardar la corrida con su fecha es lo que permite contestar _«cumplía
cuando se aprobó»_.

**Tres decisiones que hacen que el resultado no mienta**, y las tres salieron de mirar el informe
crudo de `ifctester` antes de escribir nada:

1. **«No aplica» no es «cumple».** Una especificación cuyo conjunto de elementos no existe en el
   modelo sale de `ifctester` con `status: True` y `is_skipped: True`. Contarla como cumplida diría
   que el modelo satisface un requisito que **nunca se comprobó**, y es justo el número que alguien
   mira antes de aprobar una etapa. Aquí son **tres estados**: cumple, falla y no aplica.
2. **Si no aplicó ninguna, no se cumple nada.** Un IDS escrito para otra disciplina da cero
   comprobaciones y «todo bien»; lo que corresponde decir es que no se comprobó nada.
3. **El informe crudo no se guarda.** Son **944 KB** para el modelo de 24 MB: `ifctester` incluye la
   línea STEP completa de cada elemento que falla, 702 veces. Se guarda un resumen con un tope de
   fallos por requisito, y **el conteo total va aparte**, así que la cifra que se informa es la
   verdadera aunque la lista esté recortada.

**Y el ciclo se cierra donde tenía que cerrarse.** Cada fallo lleva el **GUID** del elemento —la
identidad estable, la que viaja en un BCF— así que desde el fallo se abre **una observación sobre esa
viga**, con responsable y fecha. Es lo que convierte «702 vigas sin su fase» en trabajo asignado. El
formulario de observación acepta el ancla en el modelo, comprobando la forma del GUID: 22 caracteres,
que es lo que mide uno de verdad.

**Comprobado por HTTP contra el servicio corriendo, con el IFC real de 23,6 MB:**

| Qué                          | Resultado                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Validar el modelo de 23,6 MB | **1,7 s**, incluida la carga del archivo                                            |
| El veredicto en pantalla     | «1 de 2 especificaciones fallan · 1 no aplicaron a este modelo»                     |
| El detalle                   | «Las vigas llevan su fase de obra — 702 de 702», con el motivo                      |
| El enlace a la observación   | Lleva el GUID real: `2x9ibDgrvAu8y4Yd$Ug4Qu`                                        |
| Un **mandante**              | Ve la lista; **sin** enlace de subir, **403** en el formulario y **403** al validar |
| Un IDS que no se puede leer  | **400** al subirlo, y **nada llega al disco**                                       |

23 pruebas nuevas. **Y `F3.4` (Celery) sigue sin hacer falta**: 1,7 s en la propia petición para el
tamaño que recibe un control documental. Queda para los trabajos que de verdad tarden.

> **Un detalle que no se puede arreglar y va dicho**: el motivo de cada fallo —«The required property
> set does not exist»— viene de `ifctester` **en sus palabras**, en inglés. Traducir los mensajes de
> una librería obligaría a mantener un mapa de sus cadenas, que se rompe en su siguiente versión sin
> avisar.

### `F3.3` cerrada: lo que el IFC declara de sí mismo (2026-08-26)

El visor ya leía las unidades para poner el símbolo al lado de un número, y las olvidaba al cerrar
la pestaña. El registro necesita otra cosa: **poder contestar sin abrir nada**. Ahora, al subir un
IFC, la revisión queda sabiendo su **esquema**, el **proyecto** que declara, su **unidad de longitud
con el factor a metros**, si está **georreferenciado y por qué vía**, y **cuántos elementos trae y de
qué tipos**. Se ve en el expediente, al lado del sha.

**Y hay un dato que solo se puede dar aquí**: si el archivo está georreferenciado. Fragments aplica
el factor de unidad a la geometría y **descarta la declaración**, así que después de convertir ya no
se puede preguntar.

`ifcopenshell` es **LGPL-3.0** y se usa **como librería**, que es exactamente lo que `AGENTS.md`
permite. Medido: **1,1 s** para el IFC real de 23,6 MB, así que se lee en la propia subida y no hace
falta un trabajo en segundo plano —`F3.4`— para el tamaño que recibe un control documental. El campo
es un `JSONField`, así que el día que llegue un federado que tarde, lo único que se mueve es dónde
se llama.

**Los dos defectos que encontró la primera pasada sobre los modelos reales**, y ninguno se habría
visto con un solo archivo de muestra:

1. **`IfcMapConversion` no existe en IFC2X3**, y pedirlo allí no devuelve una lista vacía: **levanta**.
   Eso tiraba la extracción entera y convertía «este IFC2X3 no tiene conversión de mapa» —que es lo
   normal— en «no se pudieron leer los metadatos». El archivo de muestra en IFC4 funcionaba y los dos
   en IFC2X3 no, **y la mayoría de los IFC de obra siguen siendo IFC2X3**.
2. **`Piso 5.ifc` declara su sitio en `(0, 0, 0, 0)`** y salía como georreferenciado. Latitud y
   longitud exactamente cero no son una ubicación: son **el marcador de posición** que escriben Revit
   y otros cuando nadie fijó el emplazamiento. Creérselo manda a buscar el edificio a la isla nula,
   en el golfo de Guinea.

Y una tercera que se atajó al escribirlo: en IFC una latitud es una tupla de enteros y **el signo va
solo en el primero**. `(-33, 26, 15)` es 33° 26′ 15″ **sur**; sumar los términos con su signo daría
una coordenada en otro hemisferio, y eso no se ve hasta que el modelo aparece en el mar.

**Lo que se dice en pantalla incluye el «no».** «Sin georreferenciar» va en negrita en el expediente,
porque es la respuesta que hace falta **antes** de prometer una vista sobre el terreno (Fase 6), y
callarla obliga a descubrirlo con el modelo ya cargado en el sitio equivocado.

11 pruebas nuevas, con IFC escritos a mano —uno por caso, incluido el sitio en cero— porque un
archivo real no permite comprobar el caso raro. Y **la extracción nunca levanta**: un IFC que no se
puede leer sigue siendo un entregable válido, se descarga y se emite; rechazar la subida por no
poder leerle los metadatos sería confundir dos cosas.

### `F3.1` y `F3.2` estaban hechas y el tablero decía que no (2026-08-26)

**El tablero miente en las dos direcciones**, que es la lección que `AGENTS.md` ya tenía escrita.
`F3.6`–`F3.9` construyeron el servicio y con él quedaron cubiertas estas dos filas, que nadie
volvió a mirar:

- **`F3.1`** — `services/api` es Django 6 + DRF: **proyectos** (`Proyecto`, `Disciplina`,
  `PaqueteWBS`), **versiones** (`Revision`, que nunca se sobreescribe), **usuarios y permisos**
  (`apps/accounts` con la matriz de roles como dato y el contrato de permisos con su prueba de 403),
  y la API del visor con `ViewModelPermissions` y su `api-token` con throttle propio.
- **`F3.2`** — `apps/documents/storage.py` valida **extensión, firma real del archivo y tamaño**
  (200 MB), y **el nombre del cliente nunca llega al disco**: la clave se compone del proyecto, el
  entregable y el sha256 del contenido.

> **Con un matiz que conviene decir en voz alta.** La fila de `F3.1` nombra «modelos» como entidad
> propia, y no la hay: **un IFC vive como `Revision` de un `Entregable`**. No es una omisión, es la
> forma de ISO 19650 que trajo la Fase 8 — un modelo _es_ un entregable que se emite por revisiones,
> con su código de idoneidad y su responsable— y es lo que permite que abrirlo en el visor sea la
> misma costura que abrir un plano (`F8.8`). La fila se escribió antes de que la Fase 8 existiera.

**Y el criterio de aceptación de la fase no tenía prueba.** «La versión anterior sigue recuperable»
es la que contesta _«¿qué decía el plano cuando se aprobó la etapa?»_, y no estaba comprobada en
ningún sitio. Ahora sí, en `test_versiones.py`, y no por lo obvio: se comprueba que la anterior
**se siga descargando**, que devuelva **sus propios bytes** —si la clave se derivara del entregable
en vez del contenido, la nueva habría pisado a la vieja y las dos descargas darían lo mismo con el
registro diciendo que son distintas— y que **relevar no sea borrar**. Y de paso que subir dos veces
el mismo archivo deje **dos revisiones en el registro y un solo archivo en el disco**, porque la
clave sale del contenido.

`F3.5` es lo que separa un visor de una herramienta de control: revisar a mano si
cada elemento trae el pset que el mandante exigió no escala; un IDS lo verifica en
un paso y dice exactamente qué falta.

### El portal de ingreso, y por qué se portó en vez de escribirse (2026-08-26)

**Lo pidió el usuario junto con la fidelidad del 2D**, y la aplicación hermana ya lo
tenía resuelto: AeroControl lleva 1440 pruebas en producción con datos reales de la
DGAC. Su fuerza no está en código ingenioso sino en un puñado de decisiones que ya
costaron encontrarse, y **eso es lo que se portó** — la forma, no el dominio. La base
de datos es propia: la regla de la familia es que ninguna aplicación comparte base con
otra.

| Qué se portó                                            | Por qué esa pieza y no otra                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `BaseModel`: UUID, marcas de tiempo, `is_active`        | Archivar en vez de borrar. Borrar un entregable se lleva su historial       |
| `AuditEvent` de solo agregar, con `sequence`            | `created_at` **no basta** para ordenar dos filas del mismo instante         |
| `RequestMetricsMiddleware`                              | Auditoría en cada petición que muta, id de correlación y log estructurado   |
| `mail.py`                                               | No decir "enviado" cuando el correo solo se imprimió en el log              |
| `jobs.py` + `JobRun`                                    | La fila nace en `running`: un proceso muerto a mitad deja de ser un éxito   |
| `exports.py`                                            | Una celda que empieza por `=` es una fórmula que se ejecuta en otra máquina |
| `tenancy.py`                                            | El permiso dice qué se puede hacer, no **sobre qué**                        |
| `ModelPermissionRequiredMixin` y `ViewModelPermissions` | El contrato de permisos, cumplido sin depender de que alguien se acuerde    |

**Las decisiones del portal:** `LoginView` con plantilla propia y **un solo mensaje de
error**, genérico —distinguir "no existe ese usuario" de "esa no es la contraseña" le
regala a quien prueba credenciales la mitad del trabajo—; axes **delante** del backend
real, para cortar un intento bloqueado antes de comprobar la contraseña; bloqueo **por
nombre de usuario y no por IP**, porque detrás de un proxy toda petición llega de la
misma dirección; sesión con tope de 12 h y expiración deslizante; **sin auto-registro**,
porque una aplicación de control documental donde cualquiera se da de alta no controla
nada; y `/api-token/` con throttle propio, porque el de DRF viene con
`throttle_classes = ()` y deja fuera del límite justo al único endpoint que acepta
usuario y contraseña sin autenticar.

**Los roles**, con la matriz en `apps/accounts/roles.py`: Administrador, Coordinador
BIM, Proyectista, Revisor y Mandante, más **Dirección**, que no es un rol sino un grupo
de notificación con cero permisos. Un nombre de permiso mal escrito **para el comando**
`bootstrap_roles` en vez de dejar un rol silenciosamente vacío.

> **La lección del `Viewer` de AeroControl, portada con el código.** Su rol de lectura
> era "todo permiso cuyo nombre empiece por `view_`", y eso le entregaba en silencio los
> tokens de API, la lista de usuarios, las sesiones, la auditoría y el historial de
> trabajos. `Mandante` es una **lista blanca explícita**, y hay una prueba que falla si
> alguna vez aparece ahí un permiso de administración.

**Comprobado contra un servidor corriendo**, que es el oráculo que pedía el contrato:

| Usuario             | Ve en el portal               | Pide a mano `/administracion/usuarios-y-roles/` |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| **Mandante**        | Organizaciones y el visor BIM | **403**                                         |
| **Coordinador BIM** | + Trabajos programados        | **403**                                         |
| **Administrador**   | Todo                          | 200                                             |

Y el bloqueo por intentos es real, no cosmético: al quinto fallo la respuesta pasa a
**429**, y **la contraseña correcta también recibe 429** mientras dura el enfriamiento
—si entrara, el bloqueo no estaría haciendo nada— mientras otro usuario sigue pudiendo
entrar, que es lo que distingue un bloqueo por nombre de un bloqueo global.

**El gate propio** (`services/api/scripts/verify.ps1`) replica el de AeroControl:
`check`, `check --deploy`, `makemigrations --check`, `pytest --cov`, `ruff`, `bandit` y
`pip-audit`. **64 pruebas, 89 % de cobertura**, todo en verde.

> **La primera versión del gate dijo «verde» con `ruff format` fallando.** Un ejecutable
> nativo que devuelve un código distinto de cero no dispara el manejo de errores de
> PowerShell, así que cada paso pasa ahora por una función que mira `$LASTEXITCODE`. Un
> gate que miente es peor que no tener gate — y es la misma clase de defecto que la
> `F7.13` marcada cerrada.

**Lo que queda de este frente**, dicho en voz alta: el catálogo de traducciones
(`locale/es/`) todavía no existe, así que la interfaz muestra las cadenas fuente en
inglés donde Django no traduce por su cuenta; y la matriz de roles solo cubre los
modelos que existen hoy — se completa con los entregables en `F8.1`.

---

## FASE 4 — Coordinación (BCF)

**Objetivo de salida:** una observación de coordinación deja de ser un correo con
una captura de pantalla.

| #       | Tarea                                                                                         | Estado                                              |
| ------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `F4.1`  | Temas de observación con viewpoint: **cámara** y elementos involucrados por GUID              | ✅                                                  |
| `F4.7`  | Visibilidad en el viewpoint: lo apagado y lo aislado, traducido de `localId` a GUID           | ✅                                                  |
| `F4.8`  | **Ver y abrir la observación dentro del visor**: la lista lleva la cámara y selecciona        | ✅                                                  |
| `F4.2`  | Metadatos y ciclo de vida: prioridad, responsable, fecha de vencimiento, estado               | ✅                                                  |
| `F4.3`  | Comentarios ligados al viewpoint, con historial                                               | ✅                                                  |
| `F4.4`  | **Exportar BCF 2.1** — escrito a mano, leído de vuelta por `bcf-client` en las pruebas        | ✅                                                  |
| `F4.10` | **La foto del hallazgo** en el viewpoint: sin ella, el otro extremo abre una lista de títulos | ✅ ver abajo                                        |
| `F4.5`  | Marcado sobre la vista embebido en el viewpoint — **las cotas viajan como `<Lines>`**         | ◐ la mitad medida; falta el trazo libre — ver abajo |

**`F4.2` y `F4.3` las cerró la Fase 8, no esta.** Fue la apuesta del replanteo —«las
observaciones comparten modelo con los temas BCF», `F8.2`— y salió: `Observacion` ya trae
prioridad, responsable, vencimiento, estado y resolución, y `Comentario` el historial. No hay
tabla nueva que escribir; el tablero decía ⬜ sobre código que existe desde hace días.

### `F4.5`: las cotas ya dibujadas **son** el marcado (2026-09-02)

**El BCF llevaba a dónde mirar, qué se veía y una foto. Lo que no llevaba es qué señalaba quien
anotó.** El título dice «la viga del eje C choca con el ducto» y en la pantalla había una cota de
4 cm entre las dos: **ese número es el hallazgo**, y se quedaba en el navegador de quien lo
encontró.

**La decisión de fondo, y no es un atajo.** BCF 2.1 guarda el marcado de un viewpoint como
**segmentos de recta en coordenadas del modelo** —`<Lines>`— y el visor ya tiene puntos en
coordenadas del modelo, porque medir consiste precisamente en poner puntos ahí. Convertir las cotas
visibles en líneas es **ensamblar dos piezas que existen**, no construir una tercera. Y lo que sale
es lo que el otro extremo entiende: Solibri y Navisworks dibujan esas líneas sobre su propio modelo,
así que la cota viaja **en tres dimensiones** y no como un trazo pintado sobre una imagen.

| Medida        | Puntos | Segmentos                          |
| ------------- | ------ | ---------------------------------- |
| Distancia     | 2      | 1 — el propio tramo medido         |
| Perpendicular | 2      | 1 — del punto al pie en la cara    |
| Ángulo        | 3      | 2 — los dos lados desde el vértice |
| Área          | n ≥ 3  | n — el contorno, **cerrado**       |

Tres decisiones que conviene tener escritas:

- **Solo las cotas visibles.** Una cota apagada es una que quien anota decidió no mostrar, y
  mandarla sería devolverle al otro lo que el autor quitó de la pantalla.
- **Con el tope alcanzado se deja fuera la medición entera**, no los segmentos que sobran. Medio
  contorno de un área es una polilínea abierta que afirma una forma que nadie dibujó — mismo
  criterio con el que la visibilidad prefiere callarse antes que apagar el modelo. Y **sigue
  aceptando las que sí caben después de una que no**: perder una cota pequeña detrás de un contorno
  enorme sería peor.
- **Los puntos se guardan al medir**, en el mismo relevo que ya usaban los dibujos
  (`visualesPendientes`). La alternativa era ir a buscarlos dentro de los objetos de la librería,
  que es leer sus entrañas y romperse en su siguiente versión.

**El orden de los hijos importó por tercera vez** en `bcf.py`: el XSD declara `Components`,
`OrthogonalCamera`, `PerspectiveCamera`, **`Lines`**, `ClippingPlanes`, `Bitmap`. Hay una prueba que
mete cámara y marcado juntos justamente para que el orden no se rompa en silencio.

**Comprobado de las dos formas.** El archivo, con `bcf-client` leyendo el `<Lines>` de vuelta y
sacando sus extremos —incluido el contorno cerrado, donde el último segmento vuelve al primero—. Y
en el navegador sobre `Piso 5.ifc`: una distancia de 4 cm en la escena `(1, 2, 3)` sale como
`(1, −3, 2)` del IFC, que es `escenaAIfc` exacta; una distancia, un ángulo y un área de cuatro
vértices dan **1 + 2 + 4 = 7** segmentos; y apagando el área bajan a 3 y al encenderla vuelven a 7.

**Lo que falta de la fila, y por eso queda a medias:** el **trazo libre** —la nube, la flecha y el
texto que se dibujan a mano sobre la vista—. Eso es una herramienta de dibujo en 3D, no una
conversión, y es la mitad que no se puede sacar de algo que ya existe. Con el marcado ya viajando y
la instantánea en su sitio, entra cuando el usuario diga que la cota no le alcanza.

### `F4.10` cerrada: el BCF salía sin una sola foto (2026-08-28)

**`F4.4` estaba marcada ✅ y le faltaba lo primero que se ve.** Todo visor del mercado —Solibri,
Navisworks, BCF Manager— dibuja la lista de temas **con su miniatura al lado**, y es lo que hace que
quien recibe el archivo sepa de qué se le habla antes de cargar el modelo. Los nuestros salían sin
ninguna: el mandante abría una lista de títulos.

**La trampa está en cuándo se lee el lienzo, y no da error.** El búfer de dibujo de WebGL se borra
en cuanto el navegador compone el cuadro; leerlo un instante tarde devuelve un rectángulo vacío y
`toDataURL` **entrega un PNG perfectamente válido**, todo del mismo color. Así que se dibuja y se lee
en el mismo turno, sin un solo `await` en medio.

**Y aun así se comprueba lo que salió**, porque una miniatura en blanco dentro de un BCF afirma «así
se ve el problema» sobre nada, y eso es peor que no llevar ninguna. `pareceEnBlanco` vive en
`bim-core` —se prueba con píxeles escritos a mano, sin navegador— y mira el rango de color de una
muestra: si la imagen es un rectángulo liso, el visor devuelve `null` y la nota se guarda sin foto.

**El oráculo, comprobado en el navegador**: con el modelo a la vista, un PNG; con **todo el modelo
apagado** —o sea, solo el fondo— la misma llamada devuelve `null`. Las dos cosas a la vez prueban que
se están leyendo píxeles de verdad y que la comprobación hace su trabajo.

Lo demás son las reglas de siempre del registro, sin excepciones nuevas:

- **La firma manda, no la cabecera del `data:`**, que la escribe quien manda. Es la misma
  comprobación con la que se cae `virus.exe` renombrado a `plano.pdf`, y se reutiliza `storage`
  entero en vez de escribirla otra vez. Un `data:image/svg+xml` —que lleva scripts— no entra.
- **En la fila va la clave, nunca los bytes.** Un `data:` de un megabyte dentro de un registro lo
  vuelve imposible de listar y se duplica en cada copia de la base. La imagen vive donde viven los
  documentos, con su clave por sha256 — así **dos notas tomadas desde la misma pantalla no duplican
  el archivo**, y hay una prueba que lo dice.
- **Nada de esto puede costar el hallazgo.** Una imagen ilegible, un disco lleno o un montaje de
  solo lectura dejan la nota guardada sin foto. Y un archivo que ya no está en el disco **no tumba
  la exportación del proyecto entero**: ese tema sale sin miniatura y los demás salen enteros.

Medido sobre el IFC real de 32,7 MB con el lienzo a 1005 × 773: **100 ms** para capturar y **138 KB**
de PNG. Un BCF de treinta temas queda en unos cuatro megas, que es un correo.

**`F4.1`: el ancla por GUID, la cámara, la visibilidad —`F4.7`— y la foto —`F4.10`—.**

Con un modelo abierto desde el registro, la ficha del elemento ofrece «Observar este elemento»
y lleva al formulario con la revisión, el GUID y **el punto de vista de ese momento**. El
enlace no existe en tres casos, y los tres significan «no hay dónde anotarlo»: el modelo se
abrió del disco, el rol no puede abrir observaciones —lo contesta el servidor en los
metadatos, no el visor por adivinanza—, o el elemento no trae GUID válido.

**La cámara exigía una medición antes de exportarse**, y esa era la razón de que `F4.4` no la
escribiera: la escena del visor tiene el eje **Y** hacia arriba y BCF espera las coordenadas
del IFC, con **Z**. Exportar la posición sin la transformación produce un BCF que abre mirando
bajo tierra, que es peor que uno sin cámara: afirma algo falso.

La transformación **ya estaba en el repositorio y comprobada**:
[grid.ts:61](packages/viewer/src/grid.ts) dibuja los ejes de replanteo leyendo el IFC y
poniéndolos en la escena como `(x, cota, -y)`, y los ejes caen sobre el modelo — si fuera otra,
las letras aparecerían a noventa grados. La misma la usa el plano DXF de referencia, que calza
con error de milímetros. De ahí sale `escenaAIfc`, en `bim-core`, con sus pruebas.

> **Y quedó verificado de punta a punta el 2026-08-28.** Esa evidencia era **indirecta**: los ejes
> cayendo sobre el modelo dicen que la transformación es correcta para dibujar, no que lo sea para
> situar una cámara. El usuario abrió una observación en su navegador y **la cámara no queda bajo
> tierra**. Es la comprobación que no se podía hacer desde el entorno de trabajo —su panel no
> compone fotogramas— y cierra la duda: `escenaAIfc` e `ifcAEscena` valen de ida y de vuelta.

**Y el vector «arriba» se lee del cuaternión de la cámara, no se supone.** La tentación es
pasar el eje vertical del mundo, y con la cámara en planta —lo que hace el Modo 2D— eso es
paralelo a la dirección de vista: una cámara imposible que BCF rechaza. Leyéndolo no hay
convención que elegir ni caso degenerado que resolver a dedo.

| #      | Tarea                                                                               | Estado       |
| ------ | ----------------------------------------------------------------------------------- | ------------ |
| `F4.7` | Visibilidad en el viewpoint: lo apagado y lo aislado, traducido de `localId` a GUID | ✅ ver abajo |

### `F4.7` cerrada: el viewpoint decía «se ve todo» y a veces era falso (2026-08-28)

**Era la otra mitad del punto de vista.** `F4.1` cerró la cámara —desde dónde se miraba— y el BCF
seguía saliendo con `DefaultVisibility="true"` y las excepciones vacías. Con la nota tomada sobre un
modelo entero eso es cierto; **con el hallazgo encontrado aislando una planta es una afirmación
falsa**, y de la peor clase: quien abre el archivo en Solibri ve el edificio completo con el
problema tapado justo por lo que se había apagado para verlo.

**BCF no guarda «lo que se ve»: guarda un valor por defecto y sus excepciones**, y los dos lados
describen la misma pantalla.

| `DefaultVisibility` | Qué significa                                           |
| ------------------- | ------------------------------------------------------- |
| `true`              | Se ve todo **menos** los componentes de `Exceptions`    |
| `false`             | No se ve nada **salvo** los componentes de `Exceptions` |

Lo que cambia entre los dos es **cuántos componentes hay que escribir**, y ahí está la única
decisión de fondo: **se escribe el lado corto**. Apagando tres vigas de un modelo de veinte mil
elementos, el lado `true` escribe tres líneas y el `false` escribiría 19 997; aislando una planta es
al revés. La regla vive en `bim-core` con sus pruebas, y **recibe cuentas y no listas a propósito**:
resolver un GUID cuesta una consulta por elemento, así que el visor cuenta primero y **traduce solo
el lado que va a escribir**. Tres búsquedas en vez de veinte mil.

**Y hay un tope de 5.000 excepciones**, que no es del formato —BCF no pone ninguno— sino el punto en
que el archivo deja de ser útil. Pasado el tope por los dos lados no se escribe visibilidad y el
viewpoint vuelve al modelo entero, que **es lo honesto**: uno que ningún visor termina de leer no
informa de nada. El mismo número está en `apps/documents/visibilidad.py`, que es quien lo hace
cumplir de verdad — lo que llega al servidor lo escribe cualquiera, igual que la cámara.

**El peor archivo posible se comprueba explícitamente**: `DefaultVisibility="false"` con la lista
vacía es un viewpoint que **apaga el modelo entero y se abre en negro**. El validador lo descarta,
el exportador lo reescribe como modelo entero, y las dos cosas tienen su prueba.

**Va en su propio campo y no dentro de `punto_de_vista`.** Son dos datos con vidas distintas: la
cámara se descarta entera si un vector no es unitario, la visibilidad se limpia excepción por
excepción. Mezclados, una cámara mala se llevaría por delante la visibilidad buena.

**Y también vuelve.** Abrir la observación desde el panel de coordinación aplica la visibilidad
**antes** de la cámara —así el encuadre se calcula sobre lo que va a quedar en pantalla, y no hay
parpadeo de ver el modelo entero y que se apague medio segundo después—. Lo apagado por el viewpoint
se anota en el estado de la aplicación aunque el elemento no aparezca: sin eso, `hasHidden` daría
`false` con medio modelo apagado y la barra de estado no ofrecería la vuelta.

**Lo que no viaja por la URL, y es una decisión.** `urlDeNuevaObservacion` —el formulario de página
completa— lleva la cámara y **no** la visibilidad: una cámara son doscientos caracteres y una
visibilidad puede ser miles de GUID, y los navegadores y los proxys cortan las URL largas **sin
avisar**. Iría por el cuerpo del POST, que es el camino de la tarjeta flotante.

**Comprobado de las dos formas.** El archivo, con `bcf-client` —el lector de buildingSMART— leyendo
de vuelta los cuatro casos: sin dato, lo apagado a mano, el aislamiento y la visibilidad a medias. Y
el viaje de ida y vuelta en el navegador sobre `Piso 5.ifc`, 564 elementos:

- Tres apagados → `porDefecto: true` con tres GUID → "Ver todo" (cero ocultos) → aplicar → **los
  mismos tres**.
- Un elemento aislado → 563 ocultos y 1 visible → elige el lado corto, `porDefecto: false` con **un**
  GUID → aplicar → exactamente ese elemento a la vista.

**425 pruebas en la API con 94,28 % de cobertura y 240 en `bim-core`**, gate en verde.

**Y la importación quedó fuera de `F4.4` a propósito**, así que la fila dice «Exportar» y no
«Exportar e importar». Exportar es lo que desbloquea al mandante hoy; importar exige decidir
qué gana cuando el BCF que vuelve contradice lo que hay acá —y eso es una política de fusión,
no un parser—. **Se cerró el 2026-09-02 como `F4.6`**, con esa política escrita primero; el «BCF de
vuelta de verdad que mirar» lo dio `bcf-client`, que es una implementación independiente y no
nuestra.

| #      | Tarea                                                                                  | Estado       |
| ------ | -------------------------------------------------------------------------------------- | ------------ |
| `F4.6` | Importar BCF 2.1: reconciliar por GUID de tema, con política escrita para el conflicto | ✅ ver abajo |

**`F4.6` cerrada el 2026-09-02, y la política de fusión está escrita antes que el parser**, que era
la condición para abrirla. Tres reglas, y las tres eligen lo conservador:

| La pregunta                           | La decisión, y por qué                                                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué gana si el tema ya existe?       | **Gana lo de acá.** Lo que trae la vuelta es la respuesta —comentarios y un estado nuevo—, no una versión mejor del hallazgo. Reescribir título, descripción y prioridad borraría el trabajo local **en silencio**                                    |
| ¿`Closed` vuelve como qué?            | **`cerrada`, nunca `descartada`.** La ida colapsa las dos en `Closed`, así que la vuelta no puede distinguirlas; `descartada` es la afirmación más fuerte —silencia el conflicto para siempre en las corridas— y eso no lo decide un archivo de fuera |
| ¿Y el correo que viene en el archivo? | **Solo alcanza a la gente de la organización.** Sin acotar, quien manda el BCF elige a nombre de quién queda una observación en una obra que no es suya                                                                                               |

**La identidad es el GUID del tema, y por eso el ciclo cierra.** La ida escribe el `pk` de la
observación como `Topic Guid`, así que nuestro propio BCF vuelve a casa y **actualiza en vez de
duplicar**. Lo mismo con los comentarios: el `Comment Guid` se usa como clave, así que el hilo
reenviado entero —que es lo que hacen las herramientas— no se dobla.

**El oráculo es `bcf-client`, al revés que en la exportación.** Allí escribimos a mano y leemos con
la librería; acá la librería **escribe** y leemos nosotros. Y escribir el lector contra un archivo
real en vez de contra el XSD encontró tres cosas que un lector ingenuo se come:

1. **El viewpoint no se llama `viewpoint.bcfv`.** Ese es _nuestro_ nombre; `bcf-client` lo llama
   `<guid>.bcfv`. El estándar dice que el nombre va en `<Viewpoints><Viewpoint>`, y de ahí se lee.
   Darlo por supuesto no revienta: deja fuera **cada cámara y cada GUID de elemento**, en silencio,
   que es justo lo que se venía a buscar. Es la mitad del valor del lector.
2. **`TopicStatus` y `TopicType` llegan vacíos**, no solo ausentes: un `""` sin traducir deja la
   observación con un estado que no está en las opciones.
3. **Las fechas llegan sin zona** —`2026-09-02T12:02:09.580527`—, y una fecha ingenua con `USE_TZ`
   es un aviso de Django y una hora corrida. Y `Visibility` puede no traer `Exceptions`.

**Es dato hostil de verdad**, y el propio `bcf.py` lo tenía escrito desde `F4.4`: «si algún día se
importa un BCF de vuelta, el `nosec` se quita y se parsea con `defusedxml`». Así se hizo. `zipfile`
descomprime una bomba sin quejarse, así que hay topes de miembros, de tamaño por miembro y de total
descomprimido, los tres con su prueba. Y `defusedxml` **se declaró como dependencia** aunque
`ifcopenshell` ya la arrastraba: una comprobación de seguridad no puede depender de que otra
librería la traiga de regalo.

**Y tres defectos de pantalla que solo se vieron mirándola**, ninguno de ellos del lector:

- **Un éxito se veía igual que un fallo.** `.aviso` era rojo para todo, así que «Importado: 1 tema
  nuevo» salía con el borde y el color de un error. Ahora el nivel se pinta —y el `role` distingue
  `alert` de `status`, porque anunciar un éxito como alarma enseña a ignorar las alarmas—.
- **«1 temas: 1 nuevos, 0 actualizados, 0 sin cambios. 0 comentarios nuevos.»** Mal concordado y
  contando cuatro nadas. Con `ngettext` y callando los ceros: «Importado: 1 tema nuevo.»
- **La explicación del formulario se partía alrededor del botón**, porque `.detalle` estaba definido
  solo dentro de `.tarjeta`. Y al arreglarlo, un `max-width: 68ch` **anuló el `flex-basis: 100%`**:
  flexbox decide el salto de línea con el tamaño hipotético, y `max-width` lo recorta antes. El
  ancho medido del detalle era exactamente esos 68ch. Queda escrito en el CSS.

**Oráculo, y es el que manda:** un BCF exportado por AeroBim **abre en Navisworks
o Solibri** con su viewpoint intacto, y uno generado por ellos abre aquí. Un BCF
que solo se entiende consigo mismo no es interoperabilidad, es un formato propio
con extensión prestada.

> **Lo que sí se verificó, y lo que no.** Las 20 pruebas de `test_bcf.py` leen el archivo con
> **`bcf-client`, la implementación de referencia de buildingSMART** —instalada porque la trae
> `ifcopenshell`—, no con nuestro propio código: el GUID del elemento, el correo del
> responsable, los comentarios con su historial y la ausencia de cámara sobreviven el viaje de
> ida y vuelta. **Eso no es lo mismo que el oráculo de arriba.** Navisworks y Solibri no corren
> acá; que la implementación de referencia lo parsee es evidencia fuerte, y el oráculo sigue
> abierto hasta que alguien lo abra en uno de los dos.

---

## FASE 5 — Detección de interferencias

**Objetivo de salida:** las interferencias entre disciplinas se encuentran solas y
llegan a la coordinación como temas, no como una lista en una planilla.

| #      | Tarea                                                                                  | Estado                                                                 |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `F5.1` | Definir grupos de comparación (A vs B) por filtros de tipo, disciplina o planta        | ✅ la obra entera desde su pantalla; los selectores finos, por comando |
| `F5.2` | Ejecutar `ifcclash` como job de backend, con tolerancia de holgura configurable        | ✅ ver abajo                                                           |
| `F5.3` | Resultados navegables: la lista lleva la cámara al conflicto y aísla los dos elementos | ✅ **sale de la Fase 4** — ver abajo                                   |
| `F5.4` | Convertir un resultado en tema BCF de la Fase 4, con su viewpoint ya apuntado          | ✅ ver abajo                                                           |
| `F5.5` | Agrupar y silenciar falsos positivos, y conservarlos entre corridas                    | ✅ las dos mitades, ver abajo                                          |

**Oráculo:** un conjunto de prueba con interferencias conocidas y colocadas a
propósito; se cuentan las encontradas y las perdidas. Contra software comercial si
hay acceso a una licencia.

`F5.5` decide si la funcionalidad se usa o se abandona. Una detección cruda sobre
dos disciplinas reales devuelve cientos de conflictos, la mayoría irrelevantes; si
cada corrida vuelve a mostrar los mismos falsos positivos ya descartados, nadie
abre la herramienta una segunda vez.

### La Fase 5, medida y con el oráculo escrito (2026-09-02)

**Primero el oráculo, que es lo que el plan pedía.**
[`interferencias-a-proposito.ifc`](apps/web/public/samples/interferencias-a-proposito.ifc) —un muro
y cuatro pilares, con las coordenadas de cada uno escritas dentro del propio archivo— y **los cuatro
casos, no solo el que choca**, porque un detector que encuentra la interferencia buena y además tres
falsas es peor que ninguno:

| Elemento       | Debe salir                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `PILAR-CHOCA`  | **Sí** — cruza el muro de verdad                                                      |
| `PILAR-LEJOS`  | No — tres metros al este                                                              |
| `PILAR-ARRIBA` | No — **misma huella en planta, otro nivel**. Delata a un detector que compara plantas |
| `PILAR-ROZA`   | Solo admitiendo el roce — apoya contra la cara sin penetrar                           |

**`ifcclash` acierta los cuatro**: encuentra uno con el roce descartado y dos admitiéndolo. Se usa
**como librería y sin copiar una línea**, que es lo que `AGENTS.md` permite con LGPL-3.0.

**`F5.2`: y tarda de verdad.** Es el primer trabajo de este repositorio que se acerca al umbral que
dejó escrito `F3.4`:

| Comparación                                      | Tiempo     | Encontradas |
| ------------------------------------------------ | ---------- | ----------- |
| El fixture (1 muro vs 4 pilares)                 | 30 ms      | 1           |
| `Piso 5`: 470 proxies vs 10 puertas              | 431 ms     | 6           |
| El grande: 805 `IfcMember` vs 34 `IfcColumn`     | **15,7 s** | 3           |
| Cruzando los dos: 470 proxies vs 805 `IfcMember` | **20,0 s** | 35          |

Veinte segundos dentro de una petición no se sostienen, así que la corrida entra por un **comando de
gestión** que deja su fila en `JobRun` — porque un trabajo que deja de correr no da error, y la fila
es la única forma de notarlo. **El disparador desde la pantalla es lo que reabre `F3.4`**, y ahora
con un número y no con una intuición.

**`F5.3` y `F5.4` salieron de la Fase 4 sin escribir una pantalla.** Es la mejor consecuencia del
orden en que se hizo el trabajo: un conflicto **no es una lista aparte, es una observación**, y el
visor ya sabe abrirlas desde `F4.8`.

| Lo que pedía `F5.3`           | De dónde sale                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Llevar la cámara al conflicto | El GUID es el ancla y el visor encuadra el elemento — **sin inventar una cámara**: nadie eligió un punto de vista |
| Aislar los dos elementos      | La visibilidad de `F4.7`: `DefaultVisibility="false"` con dos excepciones                                         |
| Ver de qué se habla           | El marcado de `F4.5`: el segmento entre los dos puntos de contacto                                                |
| Repartirlo                    | Prioridad, responsable y estado, que ya trae `F4.2`                                                               |

**`F5.5`: las dos mitades, cerradas el 2026-09-02.** La mitad que decide si la herramienta
se usa dos veces está hecha, y sale de una sola idea: **la identidad de un conflicto es la pareja de
GUID sin orden**.

- El punto de choque **no sirve** como identidad: cambia con la malla, con la tolerancia y con la
  versión de la librería.
- El orden tampoco: comparar A contra B y B contra A da el mismo conflicto al revés, y con el orden
  contando aparecería dos veces.

Con esa pareja, **descartar un falso positivo es dejar su observación en `descartada`, y la corrida
siguiente no la vuelve a abrir**. `F5.5` sale de `F4.2` sin una tabla nueva.

### La otra mitad: agrupar por proximidad

**Veinte tornillos contra la misma viga son un problema, no veinte.** Silenciar decide si la
herramienta se usa una segunda vez; agrupar decide si la primera corrida se tría en vez de
abandonarse. Una lista de treinta y cinco filas cuando hay trece problemas no se reparte.

**La regla tiene tres cláusulas, y las tres salieron de un caso que rompía la anterior:**

1. **La misma pareja de GUID es siempre el mismo problema, y la distancia no opina.** Lo encontró el
   propio fixture del oráculo: `ifcclash` informa el mismo conflicto **dos veces** cuando los dos
   modelos comparten GUID —A contra B y B contra A— y **cada informe trae una cara distinta del
   contacto**. Medido: los dos centros del mismo muro contra el mismo pilar caen a **1,95 m** uno
   del otro. Con la proximidad sola quedaban como dos problemas.
2. **Comparten un elemento.** Sin esto, un conducto que cruza un muro y, medio metro más allá, una
   tubería que cruza otro se colapsan en uno. Son dos problemas y los resuelven dos personas.
3. **Sus puntos de contacto están cerca**, medidos en el **punto medio** del segmento: los dos
   extremos son la cara de cada elemento, así que el medio es el único que no depende de cuál se
   leyó primero. Sin esta cláusula, un muro de cuarenta metros que choca con ocho instalaciones
   repartidas por la planta sería una fila, y cada choque está en un sitio distinto de la obra.

**El radio es un metro, y sale de medirlo sobre el par real** —470 `IfcBuildingElementProxy` de
`Piso 5.ifc` contra 805 `IfcMember`, la corrida de veinte segundos que devuelve 35 interferencias:

| Radio  | Cúmulos | El mayor | Lo que dice                                    |
| ------ | ------- | -------- | ---------------------------------------------- |
| 0,00 m | 35      | 1        | sin agrupar: es de donde se viene              |
| 0,25 m | 22      | 6        |                                                |
| 0,50 m | 20      | 6        |                                                |
| 1,00 m | **13**  | **6**    | **el elegido**                                 |
| 2,00 m | 8       | 17       | un cúmulo se come la mitad de la corrida       |
| 5,00 m | 5       | 22       | y de ahí ya no baja: 22 de 35 en una sola fila |

**De 35 a 13 filas, y el cúmulo mayor sigue siendo de 6.** Y la razón de no subir el radio no es que
la curva se aplane: **es que se derrumba.** La unión es transitiva —si A y B son vecinas y B y C
también, las tres caen en el mismo cúmulo aunque A y C estén lejos—, así que pasado un punto los
cúmulos se encadenan por la obra entera. El metro está justo antes de ese salto.

**Agrupar no cuesta nada**: 0,1 ms sobre esas 35 interferencias, contra los veinte segundos de la
detección. Por eso no hay que decidir si esto entra en la petición o en una cola.

**Lo que se abre es el cúmulo, no la interferencia**: se aísla el problema entero —los veintiún
elementos, no los dos del representante— y se dibuja **un segmento por conflicto distinto**. El
título dice por dónde empezar: «V-12 × 20 elementos» cuando hay un elemento compartido, «A × B y 6
más» cuando no lo hay. Y se cuentan **parejas y no informes**: titular «A × B y 1 más» un conflicto
informado dos veces sería contarlo dos veces delante de quien lo resuelve.

**La identidad la presta la pareja que ordena primero**, no la de mayor separación: la separación es
un `float` que se mueve con la malla y con la versión de la librería, y un representante que baila
abre una observación nueva en cada corrida.

**Y un caso que no se resuelve bien, dicho y no escondido.** El cúmulo se reconoce en la corrida
siguiente porque **alguna** de sus parejas ya tiene observación. Si se corrige justo la pareja
representante y el resto sigue chocando, el cúmulo nuevo no coincide con nada y se abre por segunda
vez, mientras la primera queda apuntando a una pareja que ya no choca. Es el precio de no guardar
las parejas del cúmulo en una tabla propia; la alternativa —un modelo más y su migración— no se paga
hasta que el caso aparezca sobre una obra de verdad.

**El camino a `descartada` ya existe, y hasta el 2026-09-02 no existía.** El estado estaba en el
modelo y **nada lo ponía**: la mitad que decide si la herramienta se usa una segunda vez estaba
escrita y no se podía usar. Lo que se añadió:

| Pieza                                                  | Qué resuelve                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `Observacion.descartar(por, motivo)`                   | Exige el motivo. Es permanente —la pareja de GUID impide que la corrida siguiente reabra—, así que es lo único que queda |
| `POST /api/observaciones/<id>/descartar/`              | Se tría **sin salir del visor**. Abrir la ficha de cada conflicto en otra pestaña no lo hace nadie                       |
| `ChangeModelPermissions`                               | Descartar es **cambiar**, no crear. Ver abajo                                                                            |
| Filtros «Todas / Mías / Choques / Notas» con su cuenta | Una corrida abre decenas y las mezcla con las pocas que escribió una persona                                             |

**El permiso iba en la dirección mala, y lo descubrió su propia prueba de 403.**
`DjangoModelPermissions` asume que `POST` es crear, y eso vale en una API de recursos pero no en una
de acciones: «descartar» llega por `POST` y lo que pide es `change_observacion`. Con el mapa de
fábrica, un rol que puede **abrir** hallazgos podría descartar los ajenos, y uno que puede
cambiarlos no podría. `ChangeModelPermissions` es la clase que lo corrige, y queda para el siguiente
endpoint de acción.

**Un defecto de la lista, medido y no opinado.** Con los 35 conflictos en pantalla, las dos acciones
de cada fila caían a **43,8 px de su propio título y a 11 px del título siguiente**: por proximidad
—la única pista que había— «no es un problema» pertenecía cuatro veces más a la fila de abajo que a
la suya. En una lista de triaje donde descartar es permanente, eso es descartar el conflicto
equivocado. Y no se arregla con proximidad, porque tres líneas de alto parecido no se agrupan solas:
se arregla **dibujando el grupo**. Cada hallazgo es ahora una tarjeta con su papel propio, con las
acciones dentro y 6,6 px de aire entre tarjetas.

**Dos trampas de `ifcclash` que no dan un error legible**, y las dos tienen su prueba:

1. **Un grupo vacío la hace reventar** con `TypeError: Attribute of type AGGREGATE OF STRING needs a
python sequence of strs`, que no menciona ni los grupos ni los selectores. Y pasa fácil:
   **`Piso 5.ifc` no tiene un solo `IfcWall`** —son 470 `IfcBuildingElementProxy`—, así que el
   selector obvio no encuentra nada. El envoltorio lo comprueba antes y dice **cuál** de los dos
   lados está vacío, con su selector dentro.
2. **El modo `intersection` exige `check_all`** y sin esa clave lanza un `AssertionError` **sin
   mensaje**, desde un `assert` de la librería.

### `F5.1` cerrada y `F3.4` decidida: «Revisar interferencias» en la pantalla de la obra (2026-09-02)

**Era el hueco que separaba «la coordinación funciona» de «se está usando».** La detección existía,
estaba probada contra su oráculo, y se alcanzaba escribiendo dos UUID en una terminal.

**«Comparar dos revisiones» no es como se coordina una obra.** Un coordinador no elige dos UUID:
pregunta «¿choca algo?». Así que el botón toma **la revisión vigente de cada entregable que trae un
modelo** y las cruza todas contra todas. El comando de gestión se queda con el caso dirigido
—«estructura contra instalaciones, con esta tolerancia»—, que es el que necesita elegir los
selectores a mano.

**Y no hay pantalla de resultados, que es lo mejor que tiene.** Lo que encuentra cae donde ya vive
la coordinación: entre las observaciones abiertas de la propia pantalla del proyecto, y desde ahí el
visor ya sabe abrirlas —aislando los dos elementos y dibujando el segmento entre ellos—. Una lista
aparte habría que mantenerla sincronizada con el estado de las observaciones.

**Lo que entra en una comparación, y las tres exclusiones que evitan ruido de entrada.** El selector
por defecto es `IfcElement` menos tres clases, y cada una tiene su motivo medido:

| Fuera                  | Por qué                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `IfcOpeningElement`    | **Choca con todo por definición**: es el volumen que se resta del muro                                                |
| `IfcFurnishingElement` | Una silla que atraviesa un tabique no es un problema de obra. **59 de 548** en `Piso 5` — un diez por ciento de ruido |
| `IfcAnnotation`        | No es geometría construida                                                                                            |

**Y `F3.4` quedó decidida por el usuario**, que es de quien era la decisión: **la petición espera.**
Veinte segundos caben de sobra en los ciento veinte del servidor, y una cola traería una forma nueva
de fallar en silencio —un trabajo encolado que nadie procesa no da error— que no hace falta pagar
todavía. El botón **avisa de que tarda antes de pulsarlo**, no después: uno que deja la pantalla
quieta sin explicación se pulsa dos veces. Si un par federado se pasa del minuto, ahí se monta la
cola con el número en la mano.

**Un hallazgo de la propia prueba, que conviene tener escrito.** Cruzando dos modelos que comparten
GUID —el mismo archivo dos veces, que es lo que pasa comparando dos revisiones del mismo
entregable— la detección devuelve **la pareja espejada**: muro × pilar y pilar × muro. La identidad
sin orden las colapsa **dentro de la misma corrida**, no solo entre corridas, y eso salió medido:
`encontradas: 2, abiertas: 1, repetidas: 1`.

**Lo que queda de la fase:** el agrupado por proximidad —veinte tornillos contra la misma viga son un
problema, no veinte—, que pide ver una corrida real sobre dos disciplinas de verdad.
**501 pruebas en la API con 94,18 %** y 306 en `bim-core`.

---

## FASE 8 — Control documental y seguimiento

**Agregada el 2026-08-26 a pedido del usuario**, junto con el portal de ingreso. La idea de
conjunto viene de **MineDoc** —el que ya usa la empresa: control de documentos con
transmittals, avance físico del documento y comentarios sobre el propio archivo— construida
aquí, MIT y local-first.

**Objetivo de salida:** que el seguimiento de un proyecto —qué falta, quién lo tiene, qué se
emitió y a quién— viva en un registro y no en la bandeja de correo de alguien.

| #       | Tarea                                                                                                      | Estado |
| ------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| `F8.1`  | **El modelo**: proyecto, disciplina, WBS, entregable, revisión, transmittal, observación, actividad        | ✅     |
| `F8.2`  | **La observación comparte modelo con los temas BCF** de la Fase 4, con dos anclas                          | ✅     |
| `F8.3`  | **Subir y descargar**: validación de firma real, clave por sha256, y el nombre del cliente fuera del disco | ✅     |
| `F8.4`  | **Asignar, avisar y seguir**: correo al asignar, resumen por tramos, y el expediente                       | ✅     |
| `F8.5`  | **Trabajos programados** con su fila en `JobRun` y su vigilante                                            | ✅     |
| `F8.6`  | **Ver y comentar el PDF en el navegador** con EmbedPDF (MIT), sin descargarlo                              | ✅     |
| `F8.7`  | **Emitir el transmittal desde la pantalla**, con carátula y acuse                                          | ✅     |
| `F8.8`  | **El visor y el registro son el mismo producto**: abrir la revisión desde su expediente                    | ✅     |
| `F8.9`  | **La obra existe en la aplicación**: lista, alta y detalle de proyecto y disciplina                        | ✅     |
| `F8.10` | **La puerta entre las dos mitades**: portal de partida, filas que se abren, y el visor con salida          | ✅     |
| `F8.11` | **El tablero gráfico del proyecto**: tarjetas, línea de tiempo, calendario y avance por disciplina         | ✅     |

### `F8.9`: los modelos estaban y la pantalla no (2026-08-28)

**El segundo hueco que no figuraba en ninguna lista.** `apps/projects` tenía sus tres modelos
desde `F8.1` y **ni una vista ni una URL**: un proyecto se creaba entrando al `/admin/` técnico de
Django, y sus disciplinas igual. Con una obra real eso significa que el trabajo empieza fuera de la
aplicación — y que la pregunta «¿dónde sigo?» no tiene entre qué elegir.

**La pantalla de detalle contesta esa pregunta, y por eso su orden no es alfabético**: primero los
entregables sin nada emitido —nombrados uno por uno, no contados—, después las observaciones
abiertas por prioridad, después **el salto directo al visor**, y al final lo que se consulta. Es la
idea del expediente de un entregable subida un nivel: la del proyecto entero.

`bootstrap_roles` no necesitó nada: los permisos de `Proyecto` y `Disciplina` ya estaban en la
matriz de `roles.py`.

### `F8.8`: el hueco que no estaba en ninguna lista (2026-08-26)

**Era el más grande, y no figuraba como tarea.** El visor abría archivos del disco de quien lo
usaba y no sabía nada de proyectos; el registro guardaba revisiones —DXF e IFC incluidos— y no
podía mostrarlas. O sea que _«visualizar y subir documentos todo junto»_, que es lo que el
usuario pidió con esas palabras, **no estaba**: se podían las dos cosas, pero no con el mismo
archivo. La tarjeta «BIM viewer» del portal no tenía ni enlace.

| Decisión                                          | Por qué                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| El SPA en **el mismo origen**, servido por Django | En otro origen harían falta CORS, un token en el navegador y una segunda CSP. Aquí la cookie de sesión ya sirve |
| Y **por una vista**, no por whitenoise            | Un archivo estático se entrega antes de que Django mire quién pregunta: no admite un login delante              |
| **Dos peticiones**: metadatos y luego bytes       | El visor dice _qué_ abre antes de descargar veinte megas, y el nombre no viaja en una cabecera del binario      |
| Vite con `base` **solo al construir**             | En desarrollo la aplicación vive en la raíz de Vite; con prefijo se rompería el flujo de siempre y `diag.html`  |
| La ruta del WASM desde `import.meta.env.BASE_URL` | Escrita a mano pediría `/wasm/`, recibiría el `index.html` y fallaría **dentro del worker**: sin error visible  |

**Y las tres reglas de acceso se aplican también en la API**, no solo en la pantalla. La del
acotado por organización hay que escribirla a mano: una `Revision` **no lleva** el campo
`organizacion` —cuelga de su entregable— y `scope_queryset_to_organizacion` devuelve intacto un
modelo sin el campo, así que confiar en él habría dejado el hueco abierto.

**Comprobado en el navegador con el servidor corriendo:** el plano real del usuario
(`ACAD-Piso 5_Base.dxf`, 1,5 MB) abre desde el registro y aparece como «PLANOS 2D (1)» con sus
capas; el IFC (`Piso 5.ifc`) abre con sus **551 elementos** en el árbol. Sin autenticar,
`/visor/` redirige y la API responde 401. Un `mandante` abre el visor pero tiene **cero
revisiones abribles** y 404 en la `S3` en curso.

> ### Y este bloque dejó accesibles los modelos del cliente sin autenticar
>
> **Vale escribirlo porque es la clase de defecto que se introduce arreglando otra cosa.**
> Publicar `apps/web/dist` como estático dejó los IFC y DXF reales de la organización
> descargables sin entrar: `HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc` devolvía
> **200 y 34 MB**. Vite copia todo lo que hay en `public/`, y ahí viven los archivos de prueba.
>
> `AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era: no
> están confirmados. Lo que faltaba decir es lo otro: **lo que se pone en `public/` se
> publica**, y publicar no es lo mismo que confirmar.
>
> El guardián es `apps/web/scripts/limpiar-dist.mjs`, que corre en cada `npm run build` y es
> una **lista blanca**: una lista de lo prohibido habría funcionado hoy y se habría quedado
> atrás con lo siguiente que alguien deje en `public/`. Y hay una prueba que falla si alguien
> salta el paso.

**Oráculo, y está automatizado** (`apps/documents/tests/test_pantallas.py`): el ciclo completo
de un entregable —subir una revisión en `S3`, abrir una observación asignada a otro, comprobar
que **le llega el correo con el enlace**, responderla, que el proyectista **no la pueda
cerrar**, que el revisor la cierre diciendo cómo, y publicar en `A` para que el avance llegue
a 1— más la comprobación de que un `Mandante` **no ve lo que está en curso**.

### Las decisiones que ordenan este registro (2026-08-26)

**El vocabulario es el de ISO 19650, no uno inventado.** Un código de idoneidad `S3` o `A1`
significa lo mismo en la oficina del proyectista, en la del revisor y en la del mandante; un
estado llamado «en revisión» significa lo que cada uno entienda. Las `S` no son contractuales
y las `A`/`B` sí, y una `B` está publicada **con comentarios**: se puede usar y queda la
obligación de resolverlos, así que una `B` con observaciones abiertas no es un error del
sistema sino su estado normal.

**El entregable no tiene archivo, la revisión sí.** Un entregable existe desde que se
planifica —con su código, su responsable y su fecha— y mucho antes de que exista su primer
archivo. Un registro que necesita un archivo para existir **no puede decir que falta**, que es
justo lo que se le pide.

**El avance físico es una suma auditable, no un número teclado.** Sale del peso de cada
entregable por el código de idoneidad de su revisión vigente. Es la diferencia entre un
porcentaje que alguien escribe en una reunión y uno que se puede revisar entregable por
entregable.

**Nunca se sobreescribe una revisión: se emite otra.** Es lo que permite contestar «qué decía
el plano cuando se aprobó la etapa», que es la pregunta que llega seis meses después.

**La observación tiene un solo ciclo de vida y dos anclas** —revisión + página + coordenada
para el documento, GUID de IFC + viewpoint para el modelo—, así que este registro es **la mitad
ya construida de la Fase 4** en vez de dos tablas parecidas que hay que mantener sincronizadas.
Y **no se cierra sin decir cómo**: eso distingue una resuelta de una que alguien marcó para
bajar el contador.

**Quien abre una observación es quien la cierra.** El `Proyectista` sube revisiones y responde,
pero no cierra: si no, el registro se convierte en «yo mismo declaro que lo arreglé».

**Un archivo que llega de fuera es entrada hostil**, y son las tres reglas que
`docs/ARCHITECTURE.md` ya exigía: extensión, **firma real** de los primeros bytes y tamaño; y
**el nombre del cliente nunca llega al sistema de archivos** — la clave se construye con el
sha256 del contenido y el nombre original vive en la base de datos para poder mostrarlo.

**Los avisos son la función, no un adorno.** Es lo que el usuario pidió con estas palabras:
_«ver los responsables y asignar quién debe realizarlo y que le debe enviar mensaje e
información necesaria»_. Al asignar, al responsable le llega un correo con el enlace, la fecha
y la descripción; y hay un resumen por tramos —vencido, 7, 15 y 30 días—. Dos decisiones que
parecen menores: **no se manda un resumen vacío**, porque un correo que dice «no tienes nada»
todas las mañanas enseña a archivar el remitente sin leerlo; y **un responsable sin correo se
registra**, porque es un aviso que nadie va a recibir.

**Y el expediente es la pantalla que ordena todo**, copiada del `dossier.py` de AeroControl:
contesta _«¿esto está completo y documentado?»_ nombrando **cada fila que falta** con el atajo
que la cierra, y omitiendo los botones que el usuario no puede ejecutar — ofrecer un botón que
termina en 403 es peor que no ofrecerlo, porque enseña a probar puertas.

### Comprobado en el navegador, con el servidor corriendo (2026-08-26)

- Un ejecutable renombrado a `plano.pdf` (cabecera `MZ`) se **rechaza con 400** y el mensaje
  dice qué pasa; nada llega al disco.
- El PDF real sube, y en el disco queda como
  `716-LCD/716-LCD-AR-P-001/14fb1bb0a3f7….pdf`: **el nombre del cliente —con guiones largos y
  acentos— no lo tocó**, y la pantalla se lo devuelve tal cual porque vive en la base de datos.
- El expediente se actualiza solo: desaparece la fila «no hay revisión» y aparece «la revisión
  vigente no está publicada».
- La observación se crea con su responsable, su prioridad, su vencimiento y su ancla, y el
  responsable recibe el aviso.
- **La auditoría registró todo con acciones con nombre** —`subir_revision`,
  `abrir_observacion`— **y también los intentos rechazados**, que es justamente para lo que
  sirve una auditoría.
- Los cuatro roles ven el registro en el portal y **ninguno ve la auditoría**.

### `F8.7` cerrada: emitir el transmittal desde la pantalla (2026-08-26)

El modelo sabía emitir desde el primer día y estaba probado —no se emite vacío ni sin
destinatario—, pero **el acto solo se podía ejecutar desde una consola**: la pantalla listaba y
nada más. Ahora hay las tres piezas que faltaban:

- **El borrador**: se eligen las revisiones y los destinatarios, y **el proyecto no se pide, lo
  dicen las revisiones**. Pedirlo aparte abre la puerta a un transmittal cuyo proyecto no es el de
  los documentos que lleva, que es contestar mal la pregunta que el transmittal existe para
  contestar. Mezclar revisiones de dos proyectos se rechaza.
- **La carátula**: qué lleva, a quién, el paso a paso derivado del modelo (nunca teclado en la
  plantilla), y **lo que le falta nombrado** — la misma idea del expediente. Los botones solo si
  se pueden ejecutar.
- **Emitir y acusar**: emitir cambia el estado **y avisa**; el acuse cierra el ciclo, y solo sobre
  lo emitido. `Transmittal.acusar()` es nuevo; no guarda quién acusó porque un transmittal va a
  varios y el primero que confirma no habla por los demás — eso va a la auditoría, que admite
  varios.

**El correo lleva la lista de documentos, no solo el enlace.** Quien lo recibe suele leerlo en el
teléfono y en obra: tiene que poder saber qué le mandaron sin entrar.

**Y no se calla a quien no recibió nada.** Emitir tiene consecuencias contractuales, así que la
pantalla dice las dos cosas: cuántos se avisaron y **a quién no se pudo**. Es la misma lección que
`apps/core/mail.py` —el sistema decía «enviado a N» cuando el correo solo se imprimía— aplicada a
su gemelo: decir «emitido» a secas cuando dos de los cinco destinatarios no tienen dirección deja
al emisor creyendo que avisó.

**Comprobado por HTTP contra el servicio corriendo**, con los cuatro roles sembrados:

| Qué                                           | Resultado                                                  |
| --------------------------------------------- | ---------------------------------------------------------- |
| Armar el borrador sin destinatario            | **400**, no se crea nada                                   |
| Armarlo bien                                  | Carátula que ofrece **emitir** y no acusar                 |
| Acusar un borrador                            | Sigue en borrador                                          |
| Emitir                                        | «Transmittal T-1773 emitido, 3 destinatarios avisados»     |
| Un destinatario sin correo                    | «Sin dirección de correo para sin-correo: no se les avisó» |
| Acusar lo emitido                             | La carátula dice acusado                                   |
| Un **mandante** pidiendo el formulario a mano | **403**, y el enlace no se le ofrece                       |
| Un **mandante** intentando emitir             | **403**                                                    |

13 pruebas nuevas, incluidas las dos del contrato: 403 por vista y **aislamiento entre
organizaciones sobre el `POST` de emitir** — sin acotar la consulta, `emitir/<id-de-otra>` no es
una fuga de lectura, es firmar en nombre de otro.

> **De paso salió un defecto latente que el gate no podía ver.** `compilemessages` no recompila
> si el `.mo` es más nuevo que el `.po`, y el `.po` llevaba **una entrada que msgfmt rechaza** —el
> `\n` inicial en el `msgid` y no en el `msgstr` de la paginación—. El binario al día lo tapaba, y
> el error solo aparecía el día que alguien tocara el catálogo. Arreglada la entrada y **añadido
> `compilemessages` al gate borrando el `.mo` antes**, que es lo único que lo comprueba de verdad.

### `F8.6` cerrada: el documento se ve y se comenta en su sitio (2026-08-26)

**El modelo guardaba `pagina`, `ancla_x` y `ancla_y` desde el primer día y no había quien las
dibujara.** Una observación sobre la página 7 de un plano se leía como una línea de texto en una
lista, y quien la recibía tenía que abrir el PDF aparte y buscar de qué hablaba.

Ahora hay una pantalla que hace tres cosas y ninguna más: **ver el PDF sin descargarlo**, **ver
las observaciones en su sitio** y **abrir una nueva con un clic** sobre la página.

**Decisiones que importan, y por qué:**

- **De EmbedPDF se usa el motor, no su visor.** `@embedpdf/snippet` es un lector completo de 9,7
  MB con su propia interfaz en Preact; lo que hace falta aquí es dibujar páginas y poner **nuestras**
  marcas encima, con control de la coordenada. Así que se usa `@embedpdf/engines` (PDFium por
  WASM, MIT) y la capa de marcas es propia. La página pesa 348 kB de JavaScript.
- **Es una página aparte del build, no una pestaña del visor de modelos.** Un PDF en el visor 3D
  cargaría Three.js y el WASM de `web-ifc` para nada —y no sabría abrirlo—. Comparten el build,
  los assets, el `base` y el paso de limpieza, que es justo lo que no había que duplicar:
  `documento.html` es la segunda entrada de la misma configuración de Vite, y Django la sirve
  detrás del login con la misma vista, generalizada.
- **El ancla es una fracción de la página, no un píxel.** El PDF se dibuja a la escala que quepa
  y a la densidad de pantalla de cada equipo: un píxel guardado hoy apunta a otro sitio mañana.
- **El clic lleva al formulario de Django con el ancla puesta; no se guarda nada desde el
  navegador.** El formulario ya comprueba el permiso, el rango de la coordenada y que las tres
  partes del ancla vengan juntas; duplicar esa validación en el cliente serían dos reglas que se
  separan en el primer cambio.
- **Sólo se dibujan las páginas cercanas a la que se mira.** Una memoria de 200 páginas serían 200
  imágenes en memoria de vídeo a la vez, que es el fallo que ya se pagó con el atlas de rótulos.

**Y dos trampas encontradas, las dos del mismo tipo que las que `AGENTS.md` ya listaba:**

1. **El WASM de PDFium sale de un CDN por defecto** (`cdn.jsdelivr.net`). Con el valor de fábrica
   no habría un aviso: habría una página en blanco, porque la CSP de una página detrás del login
   no deja pedirle nada a otro origen — y porque en faena no hay internet. Se resuelve con
   `import "…/pdfium.wasm?url"`, así que **la ruta la calcula Vite**, con el prefijo
   `/static/visor/` incluido, en vez de componerla a mano como se hizo con el otro WASM. Va como
   regla nueva en `AGENTS.md`.
2. **`fontFallback` activado pide fuentes a otro origen** cuando el PDF no las trae incrustadas.
   Se pone en `null`.

**Y un defecto propio, encontrado por una prueba que ya existía:** «es abrible» y «lo abre **este**
visor» son dos preguntas distintas, y hasta ahora eran una función. Con el PDF sumado al conjunto
de lo abrible, los PDFs entraban en el selector del visor de modelos, que los habría cargado como
geometría. Ahora son `es_abrible` y `abre_en`.

**Comprobado en el navegador**, detrás del login, con un PDF de tres páginas y tres observaciones
ancladas:

| Qué                                 | Resultado                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Las tres páginas                    | Dibujadas: `img` de 595 × 842 desde `blob:`, sin un error en consola                    |
| El WASM                             | `/static/visor/assets/pdfium-RAgkpwfK.wasm`, 4,5 MB — **nada de un CDN**                |
| Las tres marcas                     | En 42 %/35 %, 68 %/55 % y 25 %/72 %, la cerrada en verde y las abiertas en violeta      |
| Clic sobre la página 2 al 30 %/80 % | Formulario con `pagina=2`, `ancla_x=0.2992`, `ancla_y=0.7993` y la revisión ya elegidas |
| Una coordenada de 1,4               | **400**, con el motivo en español, y no se crea nada                                    |
| `puedeObservar` por rol             | Coordinador `true`; proyectista y mandante `false`                                      |

16 pruebas nuevas. Gate en verde: 180 pruebas, 93,22 % de cobertura.

> **De paso salió un agujero de aislamiento que no era de esta tarea.** `NuevaObservacionView`
> buscaba el entregable **sin acotar por organización**: con `add_observacion`, pedir
> `/entregables/<id-de-otra>/observar/` metía un hallazgo en el proyecto de otro cliente **y le
> mandaba un correo a alguien que no tiene nada que ver**. Acotado, con su prueba.

### El PDF se lee: texto seleccionable y búsqueda (2026-08-26)

Era lo que `F8.6` dejó pendiente el mismo día: la página dibujaba imágenes y **de una imagen no se
copia nada**. De un plano lo que se copia es un código de recinto o una cota, para pegarlos en un
correo.

- **Capa de texto invisible sobre cada página**, con los rectángulos que da `getPageTextRects`
  puestos en su sitio y en transparente. Es la técnica de cualquier lector de PDF. El
  `pointer-events` va suelto en cada tramo y no en la capa, para que el clic que abre una
  observación siga llegando a la página: con la capa capturando el puntero se podría seleccionar
  texto y ya no se podría marcar un hallazgo.
- **Búsqueda en el documento entero**, con el número de página como botón para saltar.
  **El motor dice dónde buscar y la capa dice dónde está en la hoja**, y son dos cosas por un
  motivo: `searchAllPages` recorre el PDF sin dibujarlo —barato— pero devuelve índices de carácter,
  no rectángulos; la capa de texto ya tiene los rectángulos de las páginas que se están mirando, que
  es donde el resaltado se ve. Una página con coincidencias se dibuja aunque esté lejos, o saltar a
  ella mostraría el hueco reservado.
- **Un PDF escaneado no tiene texto que buscar**, y eso no rompe la pantalla: dice «sin
  coincidencias». El modo `pdf` del diagnóstico lo nombra explícitamente, porque «no encuentra nada»
  y «no hay nada que encontrar» son dos cosas distintas.

**Comprobado detrás del login**, con el fixture de tres páginas: 6 tramos de texto extraídos con su
posición y su fuente, el texto copiable palabra por palabra, y buscar «vanos» → **1 coincidencia en
la página 3**, la vista salta a la 3 y el tramo «Cuadro de vanos» queda resaltado en
`rgba(255, 212, 59, 0.45)`.

> **Un dato del entorno que costó encontrar y sirve para la próxima.** Los clics del panel del
> navegador **no llegan a los manejadores de React**: `computer left_click` sobre el botón no
> disparaba el `onSubmit`, y `form_input` sobre un campo controlado no actualizaba su estado. Con
> `elemento.click()` desde la consola sí. Es la misma razón por la que no se puede escribir en el
> formulario de ingreso desde aquí.
>
> De paso, el término de búsqueda dejó de ser estado de React y se lee del campo al enviar: solo
> importa en ese momento, y tenerlo en estado repintaba el documento en cada tecla.

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

## FASE 7 — Planos 2D: los que llegan y los que salen

**Agregada el 2026-08-19 a pedido del usuario.** No estaba en el plan original, y entra
porque para una oficina técnica un plano suele valer más que un modo de visualización: es
lo que se imprime, se firma y se lleva a obra.

**Tiene dos direcciones, y la de entrada se pidió después y va primero** (2026-08-19):
cargar el plano 2D que ya existe —el DXF del proyecto— y **cruzarlo con el IFC**. Es lo que
hoy obliga a tener el CAD y el visor BIM abiertos a la vez para responder una pregunta
simple: lo que dice el plano, ¿está modelado, y dónde?

**Objetivo de entrada:** ver el plano bajo el modelo, a escala y en su sitio, con sus capas
encendibles una por una, y poder comparar.

**Objetivo de salida:** sacar del modelo un plano acotado que alguien pueda usar, sin
volver a la herramienta de escritorio.

### La mitad de entrada: cargar el plano y cruzarlo con el modelo

| #       | Tarea                                                                                                             | Estado                            |
| ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `F7.6`  | **Leer un DXF**: capas, unidades, colores, textos, líneas, polilíneas, arcos y bloques                            | ✅                                |
| `F7.7`  | **Dibujarlo en la escena** a una cota, con los colores reales del CAD y sus rótulos                               | ✅                                |
| `F7.8`  | **Calzar plano y modelo**: por dos pares de puntos, y a mano con unidad, cota y giro                              | ✅                                |
| `F7.9`  | **Panel de capas del plano**: encender y apagar cada una                                                          | ✅                                |
| `F7.10` | **Seleccionar en 2D**: clic en un trazo → su capa, su plano y el largo del tramo                                  | ✅                                |
| `F7.11` | **Herramientas CAD**: ajuste a extremo, punto medio y cruce, y medir sobre el plano                               | ✅                                |
| `F7.12` | **Cruzar**: modo 2D, y cortar el modelo a la altura del plano desde su ficha                                      | ✅                                |
| `F7.13` | **Fidelidad del CAD**: paleta ACI, tipos de línea, rellenos, anchos y rótulos                                     | ✅ reabierta y cerrada, ver abajo |
| `F7.14` | **Que sea reproducible**: fixture DXF sintético y modo `plano` en `diag.html`                                     | ✅                                |
| `F7.15` | **El color, resuelto donde el CAD lo pone**: capa `0` en bloque, `BYBLOCK`, capa apagada, color verdadero, grosor | ✅                                |
| `F7.16` | **La forma**: grosores de trazo, patrones de rayado y espacio papel                                               | ✅                                |
| `F7.17` | **Lo que no se dibujaba**: cotas, llamadas, elipses, `POLYLINE`, atributos, matrices                              | ✅                                |
| `F7.18` | **El texto**: alineación real, multilínea, y que el plano no arranque mudo                                        | ✅                                |

### `F7.13` estaba marcada cerrada y la pantalla decía otra cosa (2026-08-26)

**El usuario volvió con la misma queja: «el 2D no representa los colores, las formas ni las
figuras como se esperaba».** La ficha decía «paleta ACI, tipos de línea, rellenos, anchos y
rótulos: ✅». Es exactamente la lección que `AeroControl/AGENTS.md` ya tenía por escrito —_el
tablero miente en las dos direcciones; antes de implementar una fila pendiente, grep el código
que describe_— y aquí mentía en la dirección cómoda.

Medido contra `ACAD-Piso 5_Base.dxf` y `Base1.dxf`, no eran una brecha sino **quince**. Las
cuatro que explicaban lo que se veía:

| Lo que se veía                           | Lo que era                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El contenido de los bloques, casi blanco | **116 entidades** en `Base` y **140** en `Base1` están en la capa `0` dentro de un bloque, y AutoCAD las pinta con la capa del `INSERT`. Se quedaban en la capa `0` literal → índice 7 |
| Un muro pesaba lo mismo que una cota     | **El grosor (código 370) no se leía en ninguna parte**, y `LineBasicMaterial` ignora su `linewidth`: todo a 1 px. La tabla `LAYER` declara `0-MUROS 370=30` contra `AA - COTAS 370=-3` |
| Los rellenos, recuadros vacíos           | Los **23 `HATCH`** del archivo son `ANSI31` y solo se consideraba macizo lo que dice `SOLID`: se dibujaban solo con su contorno                                                        |
| Una capa violeta encima del dibujo       | `Math.abs` borraba el signo del código 62, que es la marca de **capa apagada**. `0-AREA UTIL` (`62 = -201`) está apagada en AutoCAD                                                    |

Y desaparecían en silencio **12 cotas, 11 llamadas, 36 puntos, 3 enmascaramientos** y **10
elipses**; las opacidades estaban inventadas entre 0,35 y 0,9 con la postproducción encendida
sobre el plano; los 433 textos salían todos centrados cuando **398 van arriba a la izquierda**;
un `MTEXT` de cuatro renglones se aplastaba a uno y se cortaba a 60 caracteres; y con 433
textos el plano **arrancaba sin un solo rótulo**, porque el tope era un conteo de 150.

> **Dos brechas solo aparecieron al medir, y las dos eran de la propia reparación.**
>
> **Las capas apagadas no pueden decidir el tamaño del plano.** En `Base1.dxf` la capa
> `0-AREA UTIL` mide 7.050 unidades de alto contra las 2.500 del edificio, y contándola el
> plano pasaba de 27 × 25 m a 27 × 82 m. Con la extensión mal, se deduce mal la unidad y se
> centra mal el dibujo.
>
> **La rampa de grosor tiene que medirse desde el grosor por defecto del archivo, no desde
> cero.** El primer intento —un píxel más 3,5 por milímetro— daba 1,875 px para los 0,25 mm
> del `$LWDEFAULT` y 2,05 para los 0,30 del muro: los dos redondeaban a 2 y el muro volvía a
> pesar lo mismo que la cota. Y los 34 grupos de trazos pagaban la malla gruesa sin ganar nada.

**Lo medido al cerrar** (2026-08-26, sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB):

| Qué                 | Antes                  | Ahora                                        |
| ------------------- | ---------------------- | -------------------------------------------- |
| Trazos              | 5.608                  | **5.711** (con las 12 cotas y 11 llamadas)   |
| Textos              | 380                    | **433** (con los atributos de bloque)        |
| Renglones dibujados | **0** (arrancaba mudo) | **498 de 498**, ninguno descartado           |
| Rellenos            | 23 contornos vacíos    | **23 rayados `ANSI31`**                      |
| Grosores            | todo a 1 px            | **242 trazos a 0,30 mm** contra 5.469 a 0,25 |
| Espacio papel       | dentro del dibujo      | **10 entidades fuera**, contadas aparte      |
| Texturas de rótulos | 7 por plano            | **8 en la escena** con los dos planos        |
| Carga en la escena  | —                      | **137 ms**, sin un error en consola          |

> **La malla gruesa se dibuja y no se clica.** `LineSegments2` es una malla y su geometría ya
> no son pares de vértices, y de esos pares dependen dos cosas que ya funcionaban: el clic que
> devuelve la capa y el largo del tramo (`F7.10`) y el ajuste al cruce de dos trazos (`F7.11`).
> Donde hace falta grosor se dibujan **dos objetos**: la malla, y la línea de siempre con el
> material apagado —que no se dibuja, no cuesta una pasada y sigue contestando—. Comprobado:
> el clic sobre un muro de `0-MUROS` devuelve 0,71 m, el largo exacto del segmento, en una capa
> que ahora tiene malla gruesa al lado.

**Oráculo, y por qué el fixture** (`F7.14`): nada de esto era reproducible —`.gitignore`
excluía `*.dxf` sin excepción y no había un solo plano versionado—, así que se escribió a mano
`apps/web/public/samples/fidelidad-2d.dxf` con un caso por defecto corregido, y el modo `plano`
de `diag.html` emite el informe que lo comprueba. En el informe del fixture **la capa `0` no
aparece**: las 14 entidades del bloque heredaron su capa de inserción, que es la prueba de que
la brecha mayor está cerrada.

`POINT` y `WIPEOUT` **siguen contados a propósito**: un punto se dibuja como un punto —invisible
a escala de plano, y los 36 del plano real están en `Defpoints`, que no se imprime— y un
enmascaramiento **tapa** lo de abajo, que es un efecto y no un trazo. En un visor cuyo objeto es
cruzar plano y modelo, una máscara opaca taparía el modelo. Son 492 en el plano real, y se dicen.

**Lo que quedó hecho el 2026-08-19**, verificado sobre el DXF real en el navegador: el lector
(`packages/bim-core/src/plans/dxf.ts`, 13 pruebas) resuelve el archivo del usuario en **36 ms**
—5.608 polilíneas y 59.136 puntos— y decide que son milímetros aunque la cabecera diga
centímetros; el visor lo dibuja **por color y no por capa** (un plano de remodelación lleva lo
nuevo y lo que se demuele en la misma capa con colores distintos), pone los rótulos tumbados sobre
el plano, y un clic sobre un trazo devuelve su capa y el largo del tramo — comprobado: `0-MUROS`,
0,060 m, en (8,113, 0, −14,913).

**`F7.8` cerrada con el gesto** (2026-08-19). **Calzar con 2 puntos**: se señala un punto
reconocible del plano, su equivalente en el modelo, y otro par más. De ahí salen el **giro**, el
**desplazamiento**, la **cota** —la del punto del modelo— y, si se pide, la **escala**. Los números
siguen ahí: son la red de seguridad cuando el gesto no basta.

Comprobado en el navegador con dos pares construidos a propósito: con un giro de 90° los dos puntos
del plano caen sobre sus destinos con **0 mm de error**, y pidiendo escala sobre un destino del
doble de largo la unidad pasa de 0,001 a 0,002 m, otra vez con 0 mm de error.

> **Dos pares y no uno**: con un par solo se puede mover el plano, no orientarlo. La dirección entre
> los dos puntos dice cuánto girar y su largo cuánto escalar.
>
> **La escala solo si se pide**, con su casilla: en un plano cuya unidad ya es correcta, corregirla
> con dos clics imprecisos estropea lo que estaba bien. Cuando se aplica, la unidad deja de ser una
> de la lista y el selector lo dice — "a medida (0,002 m por unidad)".

**`F7.11` cerrada**: el cursor se engancha al **cruce de dos trazos** —la esquina de dos muros, el
encuentro de dos ejes—, a los **extremos** y a los **puntos medios**, y midiendo distancia esos son
los puntos que toma la cota. El ajuste al plano se apaga desde la cinta: midiendo el modelo con un
plano debajo, engancharse al CAD falsea la medida.

El cruce se calcula en el clic, no por adelantado: se miran los trazos que pasan cerca del cursor y
se cruzan de dos en dos, con un tope de sesenta para que una zona densa siga costando lo que un
clic. Medido sobre el plano real: **3,4 ms por clic**, y de 28 clics sobre tabiques salieron 2
cruces, 5 extremos, 1 punto medio y 20 sobre la línea. La aritmética del cruce vive en el dominio
puro (`segmentIntersection`, con sus pruebas): **no inventa la esquina de dos muros que no llegan a
tocarse**, que es lo que haría cortando las rectas prolongadas.

> **Encuadrar un plano dejaba la cámara en `NaN`.** Un plano 2D es una caja **sin grosor**, y
> `fitToBox` con un lado en cero devuelve una posición imposible: la vista se queda negra, el rayo
> no encuentra nada y ningún botón la recupera, porque todos parten de donde está la cámara. Ahora
> el encuadre le da unos centímetros de grosor a los lados degenerados — no cambia lo que se ve y
> quita el caso que rompe la aritmética. Le pasaba también a un elemento plano encuadrado solo.

### Los ejes de replanteo, dibujados (2026-08-19)

El `IfcGrid` **se cargaba y no se dibujaba**: Fragments lo trata como un producto sin geometría, así
que salía en el árbol y en ninguna otra parte. Era el último pendiente de la revisión del IFC4 de
OpenBuildings, y el que más falta hacía: los ejes son con lo que se habla en obra —"el pilar del eje
C con el 4"— y son **el ancla natural para calzar un plano CAD**, que trae su propia capa de ejes.

Se leen **del propio archivo** (`packages/bim-core/src/inspect/ifcGrid.ts`, 5 pruebas): se indexan
las entidades por identificador y se siguen las pocas referencias que llevan del `IfcGrid` a sus
coordenadas, en las dos formas que aparecen —`IfcIndexedPolyCurve` de IFC4 y la `IfcPolyline`
clásica—, aplicando la colocación de la rejilla y el factor de unidades. Sobre el modelo real:
**12 ejes en 72 ms**, de la A a la H y del 1 al 4; en pantalla, la línea de trazos con su burbuja en
los dos extremos. Se encienden y apagan en Vista → Trabajo → **Ejes**.

Lo que no se puede trazar se cuenta, como en todo lo demás: una `IfcLine` es una recta infinita y
dibujarla exigiría inventar hasta dónde llega.

### Lo que faltaba para que el plano se vea completo (2026-08-19)

Comparando la pantalla con AutoCAD, lo que quedaba fuera eran **los macizos**. Un plano de
arquitectura los dibuja de tres maneras distintas y ahora se leen las tres:

| Cómo lo dibuja el CAD   | Qué se hace                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `HATCH` macizo          | Cara translúcida, con los contornos interiores como huecos        |
| `HATCH` de rayado       | Solo su contorno — a la escala de un plano es lo que se distingue |
| `SOLID` y `3DFACE`      | Cara: son cuatro puntos, con el tercero y el cuarto cruzados      |
| Polilínea **con ancho** | Banda maciza a los dos lados del eje, con el eje dibujado encima  |

> **El ancho de una polilínea no es una línea gruesa, es un macizo.** Es como se dibuja un muro en
> buena parte de los planos, y trazándolo fino el plano se ve vacío justo donde tenía que verse
> lleno. Las uniones van a tope, sin inglete: la diferencia son milímetros en la esquina de un muro.

**Y ahora se puede clicar todo lo que se ve**, no solo las líneas: un relleno dice su capa y un
rótulo, lo que dice. La comparación se hacía con el ojo puesto en los macizos y no había forma de
preguntarles nada.

> **Cómo se decide qué se clicó, con todo en el mismo plano.** No puede ser por distancia a la
> cámara —un rótulo y el trazo que tiene debajo están a la misma—, sino por **cuánto se desvió el
> rayo**: una cara solo acierta si la atraviesa, y una línea acierta dentro de su margen de
> centímetros. Con la distancia mandaba siempre la línea y los rótulos eran inclicables; con el
> desvío, cuarenta de cuarenta rótulos se seleccionan y cinco de seis clics sobre una línea siguen
> dando la línea.

### Cargar un IFC después de trabajar en 2D tumbaba la pestaña (2026-08-19)

**Era la memoria de vídeo, y la culpa era de los rótulos.** Cada texto del plano se dibujaba en su
propio lienzo y subía su propia textura: cuatrocientas texturas de hasta 4096 px por un plano
corriente. Con eso ya cargado, abrir un IFC de veinte megas dejaba la pestaña sin memoria y se caía
todo.

Ahora los rótulos de cada capa van en **un solo atlas** y **una sola malla**: siete texturas para el
plano entero en vez de cuatrocientas, y una pasada de dibujo por capa. Comprobado en el navegador:
el plano, un IFC de 1,5 MB y otro de 23,6 MB conviven sin un solo error en consola.

De paso, el tamaño de los rótulos **se elige** —ocultos, 8, 15, 30 o 60 cm— porque no se puede
deducir del archivo: un plano anotativo escribe alturas de papel (un centímetro de modelo, invisible)
y otro escribe alturas de modelo (que tapan el dibujo).

### `F7.13`: que el plano se vea como en el CAD (2026-08-19)

Tres cosas que el usuario vio de inmediato al poner su plano al lado de AutoCAD:

| Lo que se veía                        | Lo que era                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Los colores no eran los del CAD       | La paleta ACI del 10 al 249 estaba aproximada a ojo; ahora se calcula con su regla real |
| Las líneas discontinuas salían llenas | No se leía la tabla `LTYPE` ni el tipo de línea de la capa                              |
| Los rótulos, diminutos y borrosos     | Textura de 32 px y el alto del CAD tal cual: 2,5 mm de escena                           |

> **El tamaño del patrón de un tipo de línea no sirve tal cual.** Los patrones se definen en
> unidades de papel y se escalan con `LTSCALE`, que en cada oficina vale otra cosa: en el plano real
> salen rayas de **dos milésimas de milímetro** —la línea parpadea o desaparece— junto a otras de
> decenas de metros, que se ven llenas. El visor conserva la proporción entre raya y espacio y lleva
> la raya a una medida legible. Es lo que hace a mano cualquiera que trae un CAD a un modelo.
>
> **Y el rótulo tiene un alto mínimo en la escena.** Con el plano en milímetros, un texto de 2,5
> unidades existe y no se ve. Se sube a 35 cm de escena, con la letra dibujada a 96 px y un
> contorno oscuro detrás para que se lea sobre el dibujo y sobre el modelo.

**Oráculo de entrada:** el `ACAD-Piso 5_Base.dxf` del usuario cae sobre `Piso 5.ifc` y **los
muros coinciden**: la capa `0-MUROS` se superpone a los `IfcWall` del modelo, con la misma
longitud medida en los dos.

**Lo que ya se sabe del archivo real** (medido sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB):

| Qué           | Qué trae                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| Versión       | `AC1032` (AutoCAD 2018), ASCII                                                             |
| Entidades     | 1.480 `LWPOLYLINE`, 496 `INSERT`, 380 `MTEXT`, 21 `HATCH`, 12 `DIMENSION`, 10 `CIRCLE`     |
| Capas         | `0-MUROS`, `0-TABIQUES`, `0-R-NUEVO`, `0-R-DEMUELE`, `0-EJES`, `AA - COTAS`, `0-AREA UTIL` |
| Bloques       | 24, entre ellos `EJES` y mobiliario (`escritorio120x60`…)                                  |
| **Unidades**  | La cabecera declara `$INSUNITS=5` (**centímetros**) y las coordenadas dicen otra cosa      |
| **Extensión** | `$EXTMIN`/`$EXTMAX` **sin calcular** (`1e20` y `0`): no sirven para encuadrar              |

> **Y el tamaño total tampoco basta para deducirlas** (2026-08-19, con el segundo plano real). El
> `ACAD-Piso 5_Base1.dxf` declara **metros**, mide 48 unidades de lado —tamaño creíble en
> milímetros— y sin embargo está en **centímetros**: lo que infla la extensión es el marco de la
> lámina, mientras la planta de verdad ocupaba dos metros mal contados. Con la unidad equivocada,
> todo lo que se calcula a partir del plano sale mal: el tamaño de los rótulos, el patrón de los
> trazos y, sobre todo, el calce con el modelo.
>
> La medida que no engaña es **el trazo más largo**: en un plano de edificio es una fachada, un muro
> o un eje, y mide entre tres y cien metros, nunca dos. Se puntúan las dos —extensión total y trazo
> mayor— y gana la unidad que cumple las dos. Con eso, `Base1` sale en centímetros y `Base` sigue en
> milímetros, cada uno con su edificio a tamaño de edificio.
>
> **Y el encuadre cuenta solo lo encendido**: con el marco de la lámina apagado, encuadrar el plano
> lleva al edificio (19,9 m de ancho, contra los 21,8 m del IFC) en vez de dejarlo como un sello en
> una esquina de 480 metros.

> **Las unidades de un DXF no se creen, se comprueban.** `0-MUROS` mide 20.023 unidades de
> ancho y el piso del IFC mide 21,8 m: son milímetros, no los centímetros que declara la
> cabecera. Por eso la carga **propone** un factor y deja cambiarlo, en vez de aplicar
> `$INSUNITS` a ciegas. Es el mismo problema que ya costó una sesión con las unidades de los
> psets, y la misma respuesta: mostrar el número y de dónde sale.
>
> **`$EXTMIN` viene sin calcular**, así que el encuadre se hace con la extensión real de lo
> dibujado y no con lo que dice la cabecera.
>
> **Es un plano de remodelación**: `0-R-NUEVO` y `0-R-DEMUELE` son lo que se construye y lo
> que se bota. Cruzar esas dos capas con el modelo es justo la pregunta que el usuario
> quiere poder responder, y por eso las capas se encienden una por una y no en bloque.

### La mitad de salida: generar el plano desde el modelo

| #      | Tarea                                                                                                | Estado       |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------ |
| `F7.1` | Generar vistas 2D desde el modelo (planta, alzados) proyectando sus aristas                          | 🟡           |
| `F7.2` | Viewports y capas: qué se dibuja, con qué grosor y en qué capa (`DrawingViewports`, `DrawingLayers`) | ✅ ver abajo |
| `F7.3` | Acotado y anotaciones sobre el plano: cotas lineales, ángulos, pendientes y llamadas                 | ✅ ver abajo |
| `F7.4` | **Exportar a DXF** con `DxfExporter`, en A3 y milímetros, listo para el CAD                          | ✅ ver abajo |
| `F7.5` | Exportar a PDF imprimible, con formato y sello                                                       | ✅ ver abajo |

**Oráculo:** el DXF exportado **abre en AutoCAD o BricsCAD** con sus capas y cotas
intactas, y una distancia medida en el plano coincide con la del modelo. Un plano que solo
se entiende dentro de AeroBim no es un entregable.

### Lo armado el 2026-08-19, y qué falta confirmar

**`F7.1` y `F7.4` están montadas y sin confirmar en pantalla.** El panel "Planos generados" del
navegador ofrece **planta, frontal y lateral**: proyecta las aristas de lo que está encendido —esa
es la selección, no hay diálogo aparte—, arma el dibujo con su viewport, y lo exporta a **DXF en A3
y milímetros**, que es lo que se pide cuando alguien quiere un plano imprimible. Las aristas ocultas
se generan y se dejan apagadas, porque en un plano de arquitectura son la mitad del ruido.

**El ensamblaje es de la librería**, como decía la nota de esta fase: `EdgeProjector` proyecta,
`TechnicalDrawing` sostiene el dibujo y sus viewports, `DxfExporter` serializa. Lo propio es qué se
proyecta, con qué nombre, en qué papel y con qué avisos.

> **No se pudo verificar en el navegador de pruebas**, y esta vez el motivo es claro: `EdgeProjector`
> usa el renderizador para descartar lo tapado, y en un panel que no compone fotogramas la
> proyección **no arranca** — ni siquiera emite su primer aviso de avance.

#### Medido el 2026-08-26: el cuelgue ahora se dice

Se escribió el modo `planos` del diagnóstico —`/diag.html?modo=planos&ifc=…`— y **confirmó el
diagnóstico con precisión**: en las tres vistas, `projector.get()` **no resuelve nunca y no emite un
solo aviso**; la promesa se queda pendiente para siempre.

Eso, mirado de frente, **es un defecto del producto y no solo del entorno**: quien pulsara «Planta»
en un equipo sin aceleración —o con la pestaña de fondo— veía «Proyectando las aristas del modelo…»
indefinidamente. Había un botón «Dejar de esperar», pero solo limpiaba el aviso: no explicaba nada y
la promesa seguía colgada. Es la misma clase de fallo que el WASM multihilo, y ese ya costó una
sesión.

**Ahora hay un corte por falta de latido**, y la distinción importa: **no es un tope al tiempo
total** —proyectar un modelo grande puede tardar minutos con razón— sino a **veinte segundos sin un
solo aviso de avance**. Lo que llega por `onProgress` es el latido. Al cortar, el mensaje dice qué
pasó y por qué:

> _«La proyección de aristas no respondió en 20 s y se dio por colgada. Suele ser que el navegador no
> está dibujando la escena: EdgeProjector lee la escena dibujada, así que en una pestaña oculta o sin
> aceleración no avanza.»_

Comprobado en las tres vistas: las tres cortan con ese mensaje, la interfaz vuelve y el aviso de
avance se limpia. **Un cuelgue se convirtió en algo que se puede contar.**

### `F7.5` — ✅ La lámina en PDF, y el reparto navegador/servidor

**Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** El visor ya sacaba
el DXF; esto cubre el caso más común de todos, que es mandarle la planta a alguien que no tiene
AutoCAD. Sale en **Carta con el membrete de J.E.J.**, igual que el informe.

**El navegador proyecta y el servidor compone el papel**, y ese reparto no es una comodidad:

- **Proyectar aristas necesita un renderizador**, y en un servidor sin pantalla es justo lo que no
  hay. Mandar el modelo para proyectarlo allí significaría además convertir el IFC dos veces y tener
  `web-ifc` en el servidor.
- **El membrete ya vive en el servidor**, medido del formato de la oficina. Y es la decisión que el
  usuario tomó para el informe: «la meta es desde el servidor, así buscamos que sea interno».

Lo que viaja son **los segmentos y los textos ya situados en coordenadas del dibujo** —lo mismo que
se escribe en el DXF—, así que el PDF y el DXF dibujan el mismo plano. Solo las capas encendidas: el
papel tiene que decir lo mismo que la pantalla.

Tres decisiones del papel:

- **La misma escala en los dos ejes**, y escrita en la hoja. Escalar cada eje por su cuenta llenaría
  más el papel y **deformaría el plano**, que es lo peor que le puede pasar a un dibujo del que
  alguien va a medir. No se redondea a 1:50 ni a 1:100 —eso obligaría a recortar o a dejar media hoja
  vacía— pero la que salió se dice: «Escala aproximada 1:64».
- **Trazo de 0,3 pt.** Una planta con trazo de un punto se convierte en una mancha negra en cuanto
  hay dos muros cerca; 0,3 es lo que usa un CAD para la capa de proyección.
- **Tope de 60.000 segmentos, y cuando se recorta se dice en el propio papel.** Una lámina que calla
  lo que dejó fuera hace creer que el plano está completo, y de ahí salen decisiones sobre lo que no
  se ve. Por encima de ese tope lo que se quiere es el DXF, que es geometría y no papel.

> **El oráculo, y uno de sus asertos no es de texto.** `pypdf` lee el archivo: página Carta —612 ×
> 792 pt—, el sello con el código de la obra, el contacto copiable, la escala. Pero **un PDF con
> membrete y sin una sola línea pasaría cualquier prueba de texto y sería una hoja en blanco con
> sello**, así que se cuentan los operadores de trazo del flujo de contenido.
>
> Costó mirar el flujo de verdad para acertar: reportlab escribe la ruta entera **en una sola
> línea** —`n x y m x y l … S`—, así que anclar la búsqueda a principio de renglón no encontraba
> nada; y las cadenas de texto van entre paréntesis en el mismo flujo, así que hay que quitarlas o
> una `l` dentro de «Planta» cuenta como un trazo.
>
> Y hay una prueba de que **el dibujo no se deforma**: un dibujo de 40 × 1 m tiene que salir a una
> escala del orden de 1:260, no llenando la hoja.

> **El membrete se extrajo a `membrete.py` y lo usan las dos salidas.** Con una copia en cada una, la
> segunda se queda atrás en el primer cambio —el logotipo nuevo, otro teléfono— y el producto manda
> dos papeles distintos con el mismo nombre. Las pruebas del informe que comprobaban el membrete
> apuntan ahora al módulo nuevo, y las 24 del informe siguen pasando: eso es lo que prueba que la
> extracción no cambió el papel.

> **Y un error propio que hay que dejar escrito.** Al escribir `membrete.py` **inventé el bloque de
> contacto** —una dirección y un teléfono que no son los de la oficina— en vez de copiar el que
> había. Lo destaparon las pruebas del informe, que comprueban «jej.cl» en el PDF, y se recuperó de
> `git show HEAD:…`. Mover código es copiar, no reescribir de memoria: si el original está a un
> comando de distancia, se lee.

**Lo que queda fuera, y por qué:** las cotas de `F7.3` **no salen en el PDF**, solo en el DXF. Sus
líneas y su número los construye la librería dentro de sus propios grupos, y sacarlos de ahí sería
leer sus entrañas y romperse en su siguiente versión. Para el PDF hace falta el mismo camino que las
tablas: calcular su trazo nosotros. Queda dicho en el código, en `DrawingMaker.sheet`.

### `F7.3` — ✅ El acotado sale del modelo, y no se mide dos veces

**Las cotas, primero**: las que ya se midieron sobre el modelo —con el
ajuste a vértice, que es lo que hace que dos personas midan lo mismo— **se llevan a la lámina** y
salen en el DXF con su número. El botón está en la ficha de cada plano generado: «Acotar con las 3
mediciones».

Acotar encima del dibujo, que es la otra forma de hacerlo, sería **medir dos veces la misma cosa** y
arriesgarse a que los dos números no coincidan. Midiendo una vez sobre el modelo, el número del plano
es el número del modelo por construcción.

Tres cosas que se ven poco:

- **Los puntos se llevan a coordenadas del dibujo y se aplasta la Y.** Un dibujo es un plano en el
  espacio, así que una cota entre dos puntos a distinta altura **se proyecta acortada** — igual que
  la geometría, y es lo correcto: en una planta, una diagonal que sube se dibuja más corta.
- **Una cota que se proyecta a un punto no es una cota.** Una medición vertical en una planta se
  aplasta a cero: se salta, y la ficha dice **cuántas entraron** en vez de «hecho». Un «hecho»
  dejaría a alguien buscando en el DXF una cota que no está.
- **Solo las encendidas.** Una medición apagada es una que quien mide decidió no mostrar, y el plano
  tiene que decir lo mismo que la pantalla.

> **El oráculo.** `diag.html?modo=dxf` acota el lado de 10 m del rectángulo de prueba, exporta, y lee
> el DXF con nuestro lector: entre los textos está **`10.00 m`**, la medida exacta. Es lo que importa
> de una cota — la línea y las marcas son geometría que el exportador ya escribía; **una cota que no
> escribe su número no es una cota**.

**Y las otras tres, cerradas el 2026-09-03**, cada una con su decisión:

- **Los ángulos se llevan igual que las cotas**: un ángulo medido tiene tres puntos —dos extremos y
  el vértice— y el del plano también, así que la traducción es directa y no hay que inventar nada.
- **La pendiente no se mide: ya está medida.** El visor no tiene herramienta de pendiente y no hace
  falta, porque **una cota entre dos puntos a distinta altura la lleva dentro**: es la diferencia de
  altura partida por el recorrido en horizontal. Añadir una herramienta para pedir otra vez lo que
  ya se sabe sería preguntar dos veces lo mismo. Va cuesta abajo, que es la convención —la flecha
  apunta a donde corre el agua— y se salta lo que está a nivel con un umbral **en milímetros y no en
  cero**: dos puntos ajustados a vértices distintos de la misma losa difieren en décimas de
  milímetro, y anotar «0,02 %» en una planta es ruido que hace dudar de la que sí importa.
- **Las llamadas son el punto de la fase entera**: señalan **dónde cayó el elemento de cada
  hallazgo** en el plano. Un plano que dice «aquí falta la cota del vano V-03» es un plano con el
  que se va a obra; sin ellas, el plano y la lista de hallazgos son dos papeles que hay que cruzar a
  mano.

> **Y la posición de un hallazgo no se estima, se lee del propio dibujo.** `EdgeProjector` devuelve,
> junto a la geometría, **a qué elemento pertenece cada grupo de vértices**, y la geometría lleva un
> atributo `group` por vértice. Así que la posición de un elemento en la lámina es el centro de sus
> vértices **proyectados** — dónde está dibujado de verdad, no dónde estaría su caja del modelo, que
> en una planta puede caer fuera del dibujo. Ese mapa **se guarda al proyectar o se pierde**: no hay
> forma de reconstruirlo después.

> **Un solo botón para las tres primeras**, y no tres. Quien acota un plano no quiere elegir «ahora
> las cotas, ahora los ángulos»: quiere que lo que midió aparezca. Y las tres salen del mismo sitio
> —las mediciones encendidas—, así que separarlas sería inventar una decisión que nadie tiene. Las
> llamadas sí van aparte porque salen de otro sitio: los hallazgos de la obra.

> **El oráculo: las cuatro escriben su valor en el DXF.** Medido con `diag.html?modo=dxf`, leyendo
> el archivo con nuestro propio lector: **`10.00 m`, `90.00°`, `15.00 %`** y **«Falta la cota del
> vano V-03»**. Es lo que importa de una anotación —las líneas y las marcas son geometría que el
> exportador ya escribía— y **una cota que no escribe su número no es una cota**.

> **Y lo que no se pudo comprobar en pantalla, dicho:** el botón está tipado, compilado y con lint y
> formato limpios, pero **no se ha pulsado**, porque para eso hay que generar un plano y `F7.1`
> necesita un navegador que componga fotogramas — la misma limitación de siempre, la que hizo falta
> el corte por falta de latido. Lo comprobado es el camino de datos completo hasta el DXF.

### `F7.2` — ✅ Capas con nombre, y el viewport que se llevaba la mitad del plano

**Dos cosas, y la segunda no se buscaba.**

**Las capas.** Todo salía en la capa `0` del DXF, y eso es lo que hace inútil un plano en una oficina
técnica: quien lo abre no puede apagar las aristas ocultas, ni darles otro grosor, ni congelarlas
para acotar encima. Un dibujo en el que todo es la misma capa no es un entregable. La causa era que
el código colgaba las líneas a mano —`drawing.three.add()` y `layers.set(1)`— en vez de pasarlas por
`addProjectionLines()`, que es lo que asigna la capa: **la librería tenía la API desde el principio y
no se estaba usando.** Ahora salen `AB-VISIBLE` y `AB-OCULTA`, con prefijo para no mezclarse con las
capas de la oficina al insertar el plano en otro archivo.

**Y el viewport, que era un defecto serio.** Al comprobar el reparto por capas salieron **4 de 5
segmentos**, y de ahí tiró el hilo:

- El exportador escribe cada segmento como `(x, z)` del dibujo, pasado por su transformación.
- `DrawingViewport.bbox` se construye como `Z ∈ [-top, -bottom]`, y el eje Y local de la librería
  está documentado como **«world −Z»**. O sea: `top` y `bottom` **son coordenadas de papel, no Z**.
- `drawings.ts` pasaba las Z tal cual, así que la caja de recorte quedaba **al otro lado del
  dibujo**: para un plano con z de 0 a 6 aceptaba `z ≤ margen` y tiraba el resto.

Medido sobre un rectángulo de 10 × 6 m con diagonal: el borde superior **desaparecía entero** y la
diagonal se cortaba en x = 1,3, justo donde cruza el borde de la caja mala. Con las coordenadas de
papel salen los cinco segmentos, y los dos de la otra capa, y el testigo.

> **Por qué no lo veía nadie, que es la parte que importa.** La comprobación con la que se cerró
> `F7.4` miraba **la extensión del DXF y el número de trazos**. Y la extensión la marca el recuadro
> del viewport, no el dibujo: cuadraba igual con el plano recortado que con el entero. Un oráculo que
> mide el marco no puede ver que falta el cuadro.
>
> Ahora se comparan **las coordenadas**, capa por capa y segmento por segmento, contra una geometría
> de medidas conocidas. Es la diferencia entre «el exportador escribió algo» y «escribió esto».

**Lo que queda de la fila, dicho:** el grosor de trazo. El exportador **no escribe el código 370**,
así que las tres capas salen con «por defecto» y la jerarquía de grosores —muro gordo, oculta fina—
habría que ponerla en el CAD. Se mide y se dice en el diagnóstico en vez de suponerlo; darlo por
hecho sería repetir el error de arriba.

#### `F7.4` cerrada aparte: el exportador **no depende del proyector** (2026-08-26)

**Es una descomposición que no se había hecho, y cambia lo que se puede afirmar.** `F7.1` y `F7.4`
estaban las dos en 🟡 «por el mismo motivo», y no era el mismo: proyectar necesita un navegador que
componga fotogramas, pero **exportar recibe un dibujo con su viewport y lo serializa**. Así que se le
arma un dibujo de **medidas conocidas** —un rectángulo de 10 × 6 m— y se comprueba lo suyo, en
`/diag.html?modo=dxf`.

El oráculo es doble y no hay que creerle a nadie:

| Qué                              | Resultado                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| Sin papel, en unidades del mundo | **11,00 × 7,00** — el rectángulo más su margen de 0,5 por lado  |
| En A3 y milímetros               | **420,00 × 297,00 mm**, el 100 % del ancho del papel            |
| Lo lee **nuestro propio lector** | 8 y 16 trazos, **nada sin dibujar** en ninguno de los dos casos |

La segunda fila es la que importa: 10 m son 10 000 mm, así que un exportador que pusiera el dibujo
tal cual **no cabría en la hoja**. Que la extensión sea exactamente la del A3 dice que el dibujo se
escala al papel, que es lo que hace falta para imprimirlo.

> **Lo que sigue sin confirmarse de `F7.4`**: que **AutoCAD** lo abra. Que nuestro lector lo lea es
> evidencia independiente y fuerte —es otra implementación— pero no es la misma afirmación. Y lo que
> se exporta aquí es un dibujo armado a mano, no uno **proyectado**: eso es `F7.1`.

> **`F7.1` sigue en 🟡 a propósito.** Lo que está comprobado es el camino del fallo, no el del acierto.
> **Falta confirmar en un navegador de verdad**: que la planta sale con las aristas del modelo,
> cuánto tarda con el IFC de 23,6 MB, y que el DXF abre en AutoCAD con su escala. El modo `planos`
> ya lleva el oráculo puesto para ese día: **exporta el DXF y lo vuelve a leer con nuestro propio
> lector**, y compara los trazos que salen con los segmentos proyectados y la extensión con el A3
> declarado. Ahí no hace falta creer a nadie.

> **Por qué esta fase es sobre todo integración.** `TechnicalDrawings`, `DrawingViewports`,
> `DrawingLayers`, `DxfExporter` y la familia de anotaciones —lineales, de ángulo, de
> pendiente, de llamada— **ya existen en `@thatopen/components`**. El trabajo es
> ensamblarlas y darles interfaz, no construir un motor de dibujo. Conviene revisar qué
> resuelven antes de escribir una línea.
>
> Ese descubrimiento vale para más fases: los cortes (`F1.3`) tienen `Clipper`, las vistas
> guardadas (`F1.6`) tienen `Views` y `Viewpoints`, la validación IDS (`F3.5`) tiene
> `IDSSpecifications`, y el BCF de la Fase 4 tiene `BCFTopics`. **Antes de construir, mirar
> si ya está hecho.**

---

## FASE 9 — Sistema de diseño y accesibilidad

**Agregada el 2026-09-01 a pedido del usuario**, después de una revisión de diseño que midió
los contrastes sobre el código en vez de estimarlos. El detalle vive en
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

**El hallazgo de fondo:** AeroBim tiene **dos sistemas de diseño y solo uno está hecho**. El
portal lleva tokens con nombre, el ratio anotado al lado de cada color, tema claro y oscuro,
`:focus-visible` y estilos de impresión; el visor tiene veinte pasos de `white/NN`, ningún
token, ningún foco y ningún tema. Son dos vocabularios y el usuario cruza la costura cada vez
que abre un modelo desde su expediente.

**Objetivo de salida:** que las dos mitades se pinten con el mismo juego de tokens, que ningún
texto de la aplicación quede por debajo de AA, y que se pueda usar el visor entero con el
teclado sabiendo dónde se está.

| #      | Tarea                                                                                                 | Estado       |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------ |
| `F9.1` | **Los tokens en `index.css`**: superficies, texto, marca/acción/acento y estado, con su ratio anotado | ✅ ver abajo |
| `F9.2` | **La escala tipográfica** y fuera el `font-size: 110%`: suelo de 11 px, y la densidad intacta         | ✅ ver abajo |
| `F9.3` | **`:focus-visible` global** y los **230** usos de `white/NN` reemplazados por papel con nombre        | ✅ ver abajo |
| `F9.4` | **Las acciones dejan de esconderse**: fuera `opacity-0 group-hover`, áreas de toque a 44 px           | ⬜           |
| `F9.5` | **Estados vacíos con puerta de entrada**, y escala de radio y elevación compartida con el portal      | ⬜           |
| `F9.6` | **Reordenar el shell del visor** — _bloqueada: contradice `docs/UX.md`, la decide el usuario_         | ⛔           |

**Oráculo:** ningún par texto/fondo de la aplicación por debajo de 4,5:1 medido con la fórmula
de WCAG 2.1 (los rótulos deshabilitados quedan exentos, con suelo propio de 3:1); recorrer el
visor entero con `Tab` sin perder de vista el foco; y `grep` de `white/` en `apps/web/src`
devolviendo cero.

**`F9.1` a `F9.5` no mueven un solo componente de sitio.** Son defectos, no rediseño, y por eso
van primero: cada una deja la aplicación entera y usable, y ninguna depende de que se resuelva
la discusión de `F9.6`.

### Dos cifras de la revisión, corregidas al ir a ejecutarlas (2026-09-02)

**`F9.3` conflacionaba dos medidas distintas**, y las dos importan por separado:

| Qué se cuenta                                                | Cuántos                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Usos de **texto por debajo de AA**                           | **123** — 89 de `white/30`–`45`, 24 de `text-brand` y 10 de blanco sobre `bg-brand` |
| Apariciones de `white/NN` **en total**, texto, borde y fondo | **230**, en 17 archivos y 180 líneas                                                |

Los 123 son el problema de accesibilidad; los 230 son el trabajo. El oráculo que la propia fase
declara —`grep` de `white/` devolviendo cero— exige los 230, así que la fila dice ese número y la
tabla de `DESIGN_SYSTEM.md` conserva el otro, que es el que explica **por qué** hay que hacerlo.

**Y `F9.2` tenía una consecuencia que no estaba dicha.** [index.css:40-46](apps/web/src/index.css)
ya dejó escrito que **toda la escala de Tailwind está en `rem`**: bajar la raíz de 110% a 100%
encogería también los paddings, los altos y los huecos **un 10%**, con la letra casi igual. Eso
deshace la densidad que el usuario fijó midiendo en su pantalla —dijo que al tamaño de fábrica
«pedía zoom para leerse», y que al 120% «se ve muy cerca»—, y esa medición no se tira porque el
documento de diseño no la conociera.

La salida no es elegir entre las dos cosas: **la raíz vuelve a 16 y `--spacing` sube un 10%**
(0,25rem → 0,275rem), así que la unidad de espaciado sigue midiendo los mismos 4,4 px. Con eso se
cumplen las dos: el suelo de 11 px que pide el sistema, y la densidad que pidió quien lo usa. La
tabla de mapeo está en la propia `F9.2`, más abajo.

### `F9.1`–`F9.3` cerradas: el visor tiene tokens, escala y foco (2026-09-02)

**Lo que había:** cinco tokens, ninguna regla de foco —**cero** coincidencias de `focus` en todo
`apps/web/src`— y el color jerárquico conseguido bajando la opacidad del blanco hasta que el texto
dejaba de leerse. `text-white/30` daba 2,67:1 y era el rótulo de grupo de la cinta, a 9,9 px.

**Lo que hay:** dieciocho tokens con su papel, la escala calibrada sobre una raíz de 16 y un anillo
de foco global. **230 clases traducidas en 17 archivos**, y ni un componente movido de sitio.

**El oráculo dejó de ser una afirmación y pasó a ser una prueba**, que es lo que más aporta de esta
pasada. `packages/bim-core/src/color/contraste.ts` implementa la fórmula de WCAG 2.1 —fijada con los
vectores conocidos de la norma: 21:1 blanco sobre negro, y el 4,48 de `#777777` sobre blanco, que es
el que distingue el umbral `0,03928` del `0,04045`— y su prueba hermana **lee `index.css`** en vez de
una copia. Comprueba quince cosas, entre ellas:

- los tres niveles de texto y los cuatro de estado, sobre las **cuatro** superficies, por encima de
  4,5:1;
- el blanco sobre los tres rellenos de acción —el botón `Abrir` daba **4,13:1** con el violeta de
  marca, o sea que la acción principal de la aplicación no pasaba AA—;
- que la marca **siga sin pasar** AA (3,96:1), porque es la razón de que exista un acento aparte y
  no se puede «simplificar» volviendo atrás;
- que el visor no pueda volver a escribir `white/NN`, ni un color de la paleta de Tailwind haciendo
  de estado, ni un `font-size` en porcentaje.

**Y corrigió un número del propio documento de diseño**: `--ab-disabled-fg` declaraba 3,1:1 y son
**3,6:1**. Los otros nueve ratios de la tabla estaban exactos.

**Comprobado en el navegador**, que es donde se ve si la compensación de densidad funcionó:

| Medida                  | Antes (raíz 110%) | Ahora (raíz 16 + `--spacing` 0,275) |
| ----------------------- | ----------------- | ----------------------------------- |
| Barra de estado (`h-7`) | 30,8 px           | **30,8 px** — idéntica              |
| Botón de la cinta       | 40,1 px           | 41,5 px                             |
| Cabecera de sección     | 35,0 px           | 36,6 px                             |
| Cinta desplegada        | 96,4 px           | 100 px                              |

**El espaciado quedó idéntico** —la barra de estado no lleva texto que la estire y mide exactamente
lo mismo— y lo que creció uno o cuatro píxeles son las cajas cuyo alto lo pone el texto más pequeño,
porque `micro` subió de 9,9 a 11 px y `nota` de 10,9 a 12. **Eso es el arreglo, no una regresión**:
era el texto que no se podía leer.

El foco, recorrido con `Tab`: cuatro paradas seguidas con `:focus-visible` casando y el anillo en
`2px solid rgb(195, 166, 240)` —que es `--color-accent` resuelto— con 2 px de separación.

**Lo que sigue sin comprobarse es el aspecto.** El panel del agente no compone fotogramas y la
captura se agota, así que esto está medido leyendo el DOM y los estilos calculados. Que los colores
nuevos **gusten** pide la pantalla del usuario, y se suma a las pantallas que ya esperaban su
mirada.

### `F9.4` y `F9.5` cerradas: la fase entera, menos la bloqueada (2026-09-02)

**`F9.4` — lo que se escondía y lo que no se podía tocar.**

Cinco acciones aparecían solo al pasar el ratón: cerrar un modelo, borrar una vista, borrar una
cota, quitar una vista compartida y el ojo del árbol. La intención estaba escrita y era buena —
cerrar un modelo cuesta volver a convertir el archivo— pero **la herramienta era la equivocada**:
esconder algo no lo hace menos pulsable por accidente, lo hace **imposible** con el teclado y en
una pantalla táctil, donde no existe «pasar por encima». Ahora están siempre a la vista en el gris
más apagado que todavía pasa AA, y el rojo llega al acercarse.

**El área de toque sale de una sola regla, y se engancha a `aria-label`.** Cuarenta y cuatro
píxeles es lo que pide una revisión de accesibilidad para algo que se toca con el dedo, y había
veinte botones por debajo: los iconos de lista miden 11 × 17 dentro de filas de 26. Agrandarlos
habría hinchado la interfaz, que es justo lo que `F9.2` acababa de proteger — así que el botón se
queda del tamaño que se ve y **crece solo su zona sensible**, con un pseudoelemento centrado que no
pinta nada.

Que la regla sea `button[aria-label]` no es un atajo: **un botón cuyo nombre accesible sale de un
atributo en vez de un texto visible es un botón de icono** —por eso necesita el atributo— y es
exactamente el que se queda pequeño. Así el que se escriba mañana lo hereda sin que nadie se
acuerde, que es la única forma de que una regla así sobreviva.

**Y tuvo un precio que solo se vio midiendo.** Un botón de 11 px pegado al borde derecho de un
panel deja su zona sensible sobresaliendo, y eso **le daba barra de desplazamiento horizontal** al
árbol (8 px) y a los modelos abiertos (3 px). Comprobado apagando el pseudoelemento y volviendo a
medir: sin él, cero. Las listas llevan ahora `overflow-x-clip` —que el navegador computa como
`hidden`, porque la norma lo manda cuando el otro eje se desplaza— y **ninguna barra aparece**.
Queda un residuo dicho en el código: esos dos contenedores admiten 8 y 3 px de desplazamiento por
código, invisible y sin perder contenido.

**`F9.5` — el radio, la elevación y las dos listas que no decían cómo llenarse.**

| Qué              | Antes                                         | Ahora                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------- |
| Radio de control | `rounded` a secas: 4 px fijos, sin token      | `--radius-sm` **6 px**, y la clase lo nombra      |
| Radio de tarjeta | `rounded-md` 6 px                             | `--radius-md` **10 px**                           |
| Radio del portal | —                                             | `--radius-lg` **12 px**, el `--ab-radius` de allá |
| Elevación        | La de fábrica: negro al 10%, para fondo claro | Tres oscuras, que sobre un panel **se ven**       |

`rounded` a secas es un alias heredado con valor fijo: **no lee el token**, así que las 38
apariciones pasaron a `rounded-sm` y el radio dejó de ser un número escrito en cuatro sitios.
`--shadow-lg` se deja como está a propósito: lo usa la hoja del documento, que es blanca sobre un
fondo claro, y ahí una sombra oscura sería la equivocada.

**Los dos estados vacíos sin puerta** eran justamente los primeros que se ven al abrir el visor: el
árbol decía «Todavía no hay ningún modelo abierto» y los modelos abiertos, «Ninguno». Ahora los dos
dicen el gesto — arrastrar, `Abrir`, o sacar uno del registro; y para qué sirve la lista de modelos,
que es apagar uno para mirar el otro. Los otros seis estados vacíos ya lo hacían desde que el
usuario preguntó «cómo puedo cargar una observación, no está claro eso» teniendo el botón delante.

**El oráculo creció con la fase**: 19 comprobaciones, y ahora también que no quede un solo
`opacity-0`, que la regla del área de toque exista con sus 44 px, que la escala de radio sea 6/10/12
y que las tres elevaciones sean oscuras.

**Con esto la Fase 9 está cerrada salvo `F9.6`**, que es una decisión del usuario y son tres.

### `F9.2`: la escala se **mapea**, no se borra

Quitar el `font-size: 110%` y dejar que cada clase caiga donde caiga encogería la interfaz. Las
cifras, con la raíz de hoy (17,6 px) contra la de destino (16 px):

| Token          | Hoy               | Pasa a             | Y en el sistema es |
| -------------- | ----------------- | ------------------ | ------------------ |
| `--text-micro` | 0,56rem = 9,9 px  | 0,6875rem = **11** | `--fs-micro`       |
| `--text-nota`  | 0,62rem = 10,9 px | 0,75rem = **12**   | `--fs-xs`          |
| `--text-xs`    | 0,75rem = 13,2 px | 0,8125rem = **13** | `--fs-sm`          |
| `--text-sm`    | 0,875rem = 15,4   | 0,9375rem = **15** | `--fs-base`        |
| `--text-base`  | 1rem = 17,6 px    | 1,0625rem = **17** | `--fs-lg`          |
| `--spacing`    | 0,25rem = 4,4 px  | **0,275rem** = 4,4 | —                  |

**Ningún tamaño baja más de medio píxel**, los dos que estaban por debajo del suelo de 11 px suben,
y padding, altos y huecos quedan idénticos. La raíz vuelve a 16, que es la mitad buena del 110%:
así vuelve a respetar a quien haya cambiado el tamaño de letra de su navegador — que es justamente
quien más lo necesita, y lo que el propio comentario de `index.css` daba como razón.

**Los nombres `nota` y `micro` se quedan** en vez de renombrarse a `--fs-*`: ya son semánticos, ya
están documentados, y renombrarlos serían noventa y siete ediciones que no cambian un píxel. La
equivalencia queda en la tabla de arriba.

### `F9.6`: por qué está bloqueada y no simplemente pendiente

La revisión propuso además reordenar el shell: barra de aplicación con migas compartida con el
portal, **rail de siete secciones** en vez del acordeón del navegador, **herramientas flotando
sobre el lienzo** con las opciones de la activa desplegándose debajo, y **propiedades como
tarjeta anclada a la selección** en vez de panel fijo.

Eso choca de frente con tres decisiones ya escritas en [docs/UX.md](docs/UX.md):

| Lo que dice UX.md hoy                                                                     | Lo que propone la revisión                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| «Nada flota sobre el modelo salvo el cubo de vistas»                                      | Herramientas, propiedades y controles de cámara flotan        |
| El navegador de la derecha es «el contenido del proyecto, todo junto»                     | Se reparte en siete destinos de un rail, uno visible a la vez |
| «Una capacidad nueva es una sección del navegador y, como mucho, un grupo en una pestaña» | Una capacidad nueva es un destino del rail                    |

**Y una cifra que hay que corregir antes de discutirla.** La revisión anunció que el shell nuevo
gana alto de lienzo. No es cierto en el caso que importa: la cinta de hoy **ya se pliega a
34 px**, y contra eso la barra nueva (48 + 32) pierde. La ganancia real es de **ancho**: los dos
paneles anclados suman 588 px irrecuperables y el rail más un panel suman 372, o sea **+216 px**.
Lo que sí mejora siempre, y no se mide en píxeles, es que **medir deja de exigir un cambio de
pestaña y la vuelta**.

Con eso sobre la mesa, la decisión es del usuario, y son tres separadas: si el navegador se
reparte, si algo puede flotar sobre el modelo, y si propiedades se ancla al elemento. Se puede
decir que sí a una y que no a las otras dos. **Si alguna se acepta, se reescribe UX.md primero
y el ticket después** — no al revés, porque UX.md es la fuente de esa decisión.

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

## FASE 10 — Etiquetas, informes y tablas en el plano

**La abrió el usuario el 2026-09-02**, y esto es lo que dijo, sin traducir:

> «lo importante ademas sumar a las decisiones poder poner etiquetas notas y sacar informes o
> reportes de los mismos para tener impreso o poder implmentar planos con tablas para sacar desde el
> software seria un buen camino interno»

**Es la salida de todo lo anterior, y hasta ahora no existía.** Las nueve fases construyen la
coordinación entera —detectar, agrupar, repartir, descartar, distinguir lo nuevo, exportar e
importar BCF— y **todo eso vive dentro de la aplicación**. El único papel que sale hoy es el BCF, y
un BCF no se lleva a una reunión de obra ni se archiva en una carpeta: se abre en otro software. Lo
que falta es lo que se imprime, se firma y se cuelga.

| #       | Tarea                                                                                  | Estado                                                |
| ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `F10.1` | Etiquetas de proyecto: vocabulario controlado, asignables a un hallazgo, y se filtra   | ✅ ver abajo                                          |
| `F10.2` | La nota de la decisión: qué se guarda además del hilo de comentarios                   | ✅ decidida por el usuario: **no era un campo nuevo** |
| `F10.3` | Informe de coordinación imprimible, con la foto del hallazgo y las mismas cifras       | ✅ ver abajo                                          |
| `F10.4` | Tablas en el plano: el cuadro de hallazgos o de elementos dentro de la lámina que sale | ✅ ver abajo                                          |
| `F10.5` | Tablas desde el modelo: cuadros por categoría con sus psets, y su exportación          | ✅ ver abajo                                          |

**Oráculo de la fase, y es exigente a propósito:** un informe **impreso en A4** que alguien lleva a
una reunión de obra y con el que puede trabajar sin abrir la aplicación. Si hay que volver a la
pantalla para entender una fila, el informe no sirve.

> **`F10.3` salió en Carta y no en A4**, porque el formato de la casa es Carta. El oráculo se
> escribió antes de tener el formato; lo que pide sigue valiendo, el tamaño lo puso el membrete.

### `F4.11` — Mirar el BCF antes de importarlo (cerrada el 2026-09-02)

**Importar era a ciegas**: se subía el archivo y se escribía. El usuario lo preguntó así —«los BCF,
dónde podré visualizar o ver directamente, ¿será todo interno? la idea que todo el proceso esté
diseñado para la interacción»— y la respuesta honesta era: sí, todo es interno, pero **no se podía
mirar**.

Para un ZIP que llega por correo desde otra oficina eso no es una decisión: no se sabe cuántos temas
trae, cuáles son nuevos, cuáles tocan algo que ya está, ni si el que se esperaba viene con foto.

Ahora la subida **enseña y no escribe**: la lista de temas con su miniatura, su prioridad, su estado
y su autor, y cada uno marcado como **nueva**, **ya estaba** o **se saltará**. El «confirmar» es lo
único que escribe; el «dejarlo» suelta el archivo del disco y de la sesión.

Tres decisiones que no son obvias:

- **Lo que enseña sale de la misma regla que después aplica** —el GUID del tema es la identidad— así
  que la pantalla y lo que ocurre no pueden discrepar. Si discreparan, la revisión previa sería peor
  que no tenerla.
- **La miniatura se reduce a 160 px y viaja como `data:`**, porque todavía no está guardada en
  ninguna parte: una captura de visor ronda el megabyte, y veinte temas incrustados tal cual serían
  veinte megas de página.
- **La clave del temporal vive en la sesión y no en la URL.** Un parámetro lo escribe cualquiera; y
  la sesión guarda además **a qué obra pertenece**, porque con dos pestañas abiertas en dos
  proyectos el «confirmar» de una podría escribir en la otra. Tiene su prueba.

### `F10.4` — ✅ El cuadro dentro de la lámina, y el texto era el problema

Un plano con el modelo dibujado y sin cuadro obliga a llevar dos papeles a la obra, y el segundo se
pierde. Ahora la lámina sale **con su tabla dentro**: título, cabecera y filas, debajo del dibujo,
en el mismo DXF.

**Lo que costó averiguar fue cómo escribir texto.** El exportador de DXF escribe líneas de toda la
geometría del dibujo, pero **texto solo de los sistemas de anotación** — y una tabla sin texto son
cuadrículas vacías. La salida es `registerSystemExporter`, que la librería expone justo para esto: se
declara un `AnnotationSystem` propio —pide tres miembros, `enabled`, `_buildGroup` y `pickHandle`— y
su exportador recibe un contexto con `writeText`. De paso sale gratis lo demás: la tabla se dibuja
**también en pantalla** dentro del plano.

Cuatro decisiones:

- **La aritmética de la tabla vive en una sola función.** `trazarTabla` dice dónde cae cada línea y
  cada texto, y la consumen la pantalla y el DXF. Con dos cálculos, el cuadro del papel y el de la
  pantalla se separan en la primera columna que cambie de ancho — y el que se imprime es el que
  nadie mira antes de mandarlo.
- **La tabla del papel no es la de la pantalla.** En pantalla hay veinticuatro columnas y se puede
  desplazar; en una lámina, veinticuatro columnas son ilegibles a cualquier escala. Se quedan **las
  seis que más filas llevan** y cuarenta filas, y el título dice lo que no cupo.
- **Las celdas se recortan a 22 caracteres con `…`.** En el modelo del usuario hay valores de
  sesenta —`43248*716-LCD-ME-ISUP-D-TEST!Design Model - Base`— y sin tope una tabla de esas mide
  cuarenta metros de papel.
- **El viewport crece para incluirla**, aplicando la lección de `F7.2` antes de que muerda: sin eso
  el recorte se come la tabla igual que se comía el dibujo.

> **El oráculo.** `diag.html?modo=dxf` pone una tabla con los dos casos que rompen una tabla escrita
> a mano —una celda con punto y coma y otra larguísima—, exporta, y lee el DXF con **nuestro** lector:
> **13 textos, todos en `AB-CUADRO-TEXTO`**, y se comprueban las cadenas una por una —el título, una
> cabecera con unidad, `HEB 200; laminado` intacto, el número— porque un exportador que escriba trece
> textos vacíos pasaría un conteo.

> **Y un fallo de la primera ejecución que conviene dejar escrito**: `AnnotationSystem` no trae
> ningún estilo, así que `_getMaterial` revienta con `Cannot read properties of undefined (reading
'color')`. La traza señala a la librería y lo que falta es de aquí — el estilo por defecto se
> registra en el constructor.

### `F10.5` — ✅ Cuadros desde el modelo, y las columnas se descubren

Es el cuadro de carpinterías o de pilares de una oficina: **todos los elementos de una categoría con
sus propiedades, en filas**. El visor ya sabía enseñar las propiedades de un elemento al clicarlo; lo
que faltaba es verlas de todos a la vez, que es cuando se ve lo que falta — el perfil sin nombre, los
diez muros sin material.

Medido sobre el modelo de 32 MB del usuario: `IFCMEMBER` da **300 filas de 805 y 24 columnas en
155 ms**, con los psets de cantidades de acero y sus unidades leídas del archivo —peso en kg,
volumen en m³, superficie en m², alto y ancho en mm—.

Cuatro decisiones, y las cuatro salieron de medir:

- **Las columnas se descubren, no se declaran.** Un IFC no tiene un juego fijo de propiedades:
  dependen del exportador y de lo que el modelador rellenó. Una lista escrita a mano enseñaría
  columnas vacías y esconderia las que ese modelo sí trae. Y se **ordenan por cuántas filas las
  llevan de verdad**: una propiedad presente en 2 de 300 muros no es una columna, es una excepción.
- **Solo las categorías con geometría**, y esto era un defecto de la primera versión: las tres
  categorías más numerosas de ese archivo son `IFCPROPERTYSINGLEVALUE` (**23.946**), `IFCPROPERTYSET`
  (839) e `IFCSIUNIT` (10) — fontanería del formato, no cosas del edificio. La categoría por defecto
  era la primera de esa lista, así que lo primero que se veía era basura. El filtro es «tener
  geometría» y no una lista negra de clases: un cuadro es de cosas que se ven y se cuentan, y esa es
  la definición.
- **La tabla va flotando sobre el modelo, no en el panel.** El panel mide unos 320 px y el cuadro
  trae veinticuatro columnas: ahí dentro no es una tabla, es una lista de celdas cortadas. Mismo
  reparto que la nota flotante.
- **El nombre de cada fila lleva al elemento.** Es lo que convierte el cuadro en una herramienta de
  revisión y no en una tabla: se ve el perfil raro entre trescientos y se va a mirarlo donde está.

> **El oráculo, y es el que importa de un cuadro.** Lo que hay que comprobar no es que salga, es que
> **diga lo mismo que la ficha**: el cuadro lee trescientos elementos y la ficha uno, y si las dos
> rutas discreparan en un valor o en una unidad, el cuadro sería una tabla bonita con datos que no
> son los del modelo. `diag.html?modo=cuadros` elige una fila y la compara **celda por celda** con la
> ficha de ese mismo elemento: **21 de 21**. Por eso el cuadro reusa `describeItemById` en vez de
> leer por su cuenta.
>
> Y el CSV se lee de vuelta con un lector mínimo escrito aparte —otra implementación, que es lo que
> lo hace oráculo—: 300 filas, 26 columnas, todas con el mismo número de celdas.

> **Y una prueba que pasaba sin comprobar nada.** El cruce con la ficha decía «0 de 0 celdas iguales
> — cuadra (bien)» cuando el elemento no traía propiedades, que es el caso de casi todo `Piso 5.ifc`.
> Cero celdas comparadas no es verde, es que no se miró: ahora lo dice y sugiere una categoría que sí
> las traiga.

> **Y un defecto propio, encontrado ordenando en pantalla.** La ordenación numérica limpiaba el punto
> como separador de miles, así que «98.1597» se convertía en 981597 y ordenar por peso daba 98,16 ·
> 9,15 · 91,07 — el orden de texto disfrazado de numérico. **El punto no se puede dar por separador
> de miles**: si hay coma, la coma es el decimal; si no, el punto lo es. Se ve mirando los cinco
> primeros valores, y no se ve leyendo el código.

**Lo que queda fuera, y por qué:** el tope de 300 filas. Leer las propiedades de un elemento con sus
relaciones es una consulta, así que un cuadro de cinco mil congela la pestaña; trescientas alcanzan
para comprobar un cuadro y ver qué falta, y el total sale de una consulta barata y se dice al lado.
Subirlo pide leer en segundo plano, que es otra tarea.

### `F10.1` — ✅ Etiquetas, y por qué **no** son texto libre

Un campo de texto libre se fragmenta a la tercera semana: «estructura», «Estructura», «estruct» y
«EE» son cuatro etiquetas para una cosa, y entonces **filtrar por etiqueta deja de encontrar** lo que
hay. Así que el vocabulario lo define el proyecto —como las disciplinas, que ya funcionan así— y el
hallazgo elige de esa lista.

Lo que esto desbloquea, y es la razón de que vaya primero: **el informe se pide por etiqueta.**
«Todo lo de instalaciones que sigue abierto» era la consulta que no se podía escribir. Medido sobre
la obra de desarrollo: el informe completo trae **9 hallazgos** y el de «Instalaciones», **3**.

**Y no es lo mismo que una disciplina**, aunque se parezcan y compartan la regla del color. La
disciplina dice **de quién es** el entregable y sale del código del documento; la etiqueta es **lo
transversal** y la pone quien coordina: «obra ejecutada», «pendiente de mandante», «afecta a
presupuesto». Un hallazgo tiene una disciplina y puede llevar tres etiquetas — de ahí el
`ManyToMany`: con un campo de una sola opción habría que elegir cuál se pierde.

Cuatro decisiones que se ven poco y sostienen lo demás:

- **El nombre es la identidad**, así que no hay código: una disciplina se reconoce por «AR», dos
  letras que caben en una tabla de cuarenta filas, y una etiqueta por su palabra. Por eso lleva su
  propia marca (`{% marca_etiqueta %}`) en vez de reutilizar el distintivo, que pintaría un «—»
  donde tiene que ir el nombre. Lo que sí comparten es **la regla de la tinta**: la letra se elige
  midiendo la luminancia del fondo, y esa regla vive en un solo sitio.
- **Etiquetar pide `change_observacion` y no `add_etiqueta`.** Quien coordina clasifica lo que ve
  **sin poder inventar vocabulario**, que es justo lo que evita que se fragmente por el camino.
- **Una etiqueta de otra obra se ignora, no filtra.** Filtrar con ella devolvería cero filas, y un
  informe que dice «no hay nada abierto» sobre una obra con treinta hallazgos es la peor de las
  respuestas. El identificador se resuelve **acotado al proyecto** antes de llegar a la consulta.
- **El encabezado escribe el nombre de la etiqueta**, no la palabra «filtrado»: a los tres días
  nadie recuerda por qué ese informe traía doce hallazgos y no treinta.

**El oráculo es el mismo de `F10.3`, `pypdf`**, que lee lo que reportlab escribió: el PDF filtrado
trae el hallazgo etiquetado, **no** trae el otro, y el nombre de la etiqueta sale en la cabecera. Y
el CSV se comprueba contra la misma pregunta, porque las dos salidas no pueden discrepar.

**Lo que queda fuera a propósito:** la pantalla para crear y editar el vocabulario. Hoy se define
por el admin de Django, igual que las disciplinas, y hasta que una obra real pida cambiarlo a
menudo, una pantalla más es una pantalla más que mantener.

### `F10.2` — ✅ La nota no era un campo nuevo, y preguntar lo ahorró

**Se preguntó antes de construir, y la respuesta fue que ya existía.** El usuario, el 2026-09-02:

> «con respecto a una nota, comentarios es eso basicamente; poder ir ordenando que imprimir dentro
> de la impresion o informe»

Así que lo que faltaba **no era un modelo más**: era **elegir qué entra en el papel**. Un hallazgo ya
guarda tres textos escritos por personas —el hilo de comentarios, la resolución al cerrar y el
motivo al descartar— y las tres se exportan en el BCF. La fila se cierra sin una migración, y con
una lección: **la pregunta valía más que el desarrollo que se habría hecho sin hacerla.**

### `F10.3` — ✅ El informe, en Carta y con el membrete de la casa

**La decisión del usuario fue el servidor**, el mismo día:

> «el informe la meta es desde el servidor asi buscamos que sea interno»

Y abrió la puerta a cualquier herramienta libre, LibreOffice incluido. Lo medido antes de elegir:

| Opción               | Paquetes | Licencia | ¿Corre donde corre el gate? | Medido                                    |
| -------------------- | -------- | -------- | --------------------------- | ----------------------------------------- |
| **reportlab**        | **2**    | BSD-3    | sí                          | 8 págs A4 en **171 ms**                   |
| fpdf2                | 3        | LGPL-3   | sí                          | tablas más pobres                         |
| xhtml2pdf            | **29**   | Apache   | sí                          | trae cryptography, aiohttp, lxml, pyhanko |
| WeasyPrint           | + GTK    | BSD      | **no importa en Windows**   | el informe no se probaría aquí            |
| LibreOffice headless | ~500 MB  | MPL-2    | no instalado                | proceso externo que serializa             |

**Gana reportlab por tres cosas y no por una**: dos paquetes, licencia sin condiciones, y es el
único que corre en la máquina donde corre el gate — con GTK o con LibreOffice el informe solo se
generaría en la VM, o sea **sin oráculo**. Y es además el que hará falta para dibujar la lámina de
`F10.4` y el PDF de `F7.5`: una librería y no dos.

**Lo que LibreOffice daría de verdad —un informe editable— se cubre con la salida CSV**, que abre en
Calc y en Excel sin ninguna dependencia en el servidor. Va con `;` y con BOM, que es lo que necesita
un Excel en configuración castellana para no partir las tildes.

**El membrete es el de la casa, y sale de su propio formato.** El usuario entregó
`Formato Carta 2023 Nuevo Logo.docx`, y de ahí se leyó todo:

| Lo que dice el formato | Valor                  | Consecuencia                                    |
| ---------------------- | ---------------------- | ----------------------------------------------- |
| Tamaño de página       | 215,9 × 279,4 mm       | Es **Carta, no A4**. El informe estaba en A4    |
| Márgenes               | 52,4 / 30 / 25 / 30 mm | El de arriba es alto porque ahí va el logotipo  |
| Tipografía             | Helvetica              | Que reportlab trae de serie: nada que incrustar |
| Azul del logotipo      | `#1F428D`              | **9,45:1** sobre papel: sirve para texto        |
| Azul claro del arco    | `#68B8E5`              | **2,19:1**: decoración y **nunca** texto        |
| Gris del contacto      | `#585756`              | 7,21:1                                          |

Tres cosas que salieron de mirar el papel y no el código:

1. **Los gráficos venían en EMF**, que reportlab no lee. Los dos que son dibujo se convirtieron a
   PNG a cuatro veces su tamaño de colocación; el primer intento **los recortaba por la derecha**
   porque el marco del metarchivo es más estrecho que su contenido.
2. **El bloque de contacto se compone como texto y no como imagen**: sale nítido a cualquier
   resolución, se puede seleccionar del PDF —que es lo que hace quien quiere el teléfono— y así el
   recorte del EMF deja de existir.
3. **El margen de arriba es 38 y no 52,4.** En una carta ese margen deja sitio al destinatario y a
   la referencia, que en un informe no hay: con 52,4 quedaban **24 mm de papel en blanco** entre la
   línea del membrete y el título.

**Y el ancho útil pasó de 186 a 155,9 mm** —Carta menos dos márgenes de 30—, así que las columnas de
la tabla se recalcularon: con los anchos de A4 la tabla se salía del papel, y un PDF no avisa de
eso, recorta.

**El oráculo es `pypdf`, que es otra implementación**: lee la estructura del archivo y extrae el
texto. Comprobar un PDF de reportlab con reportlab solo diría que es consistente consigo mismo — la
misma regla que ya usa el BCF con `bcf-client`.

### `F10.4` y `F10.5` — Las tablas, que se apoyan en la Fase 7

**`F10.4` no se puede cerrar antes que `F7.2`**: una tabla en una lámina necesita que la lámina
exista, con sus viewports y su cajetín. Va después, y va dicho para que no se prometa antes.

`F10.5` es la otra mitad y **el camino más corto a algo que se usa hoy**: un cuadro de elementos por
categoría con sus psets es exactamente lo que `F3.10` ya sabe leer del modelo —la cobertura de psets
lo recorre entero— así que la consulta está resuelta y lo que falta es la tabla y su salida.

---

## FASE 11 — El portal se ve plano

**La abrió el usuario el 2026-09-02, mirando la pantalla**, y lo dijo así:

> «en general el problema es que cada etapa es plano como se visualiza crear o generar un diseño
> mas llamativo interactivo y que sea mas moderno en cada hoja, lo mso con las figuras y lso
> colores jugar ahi con eso hacer que sea mas llamativo, ordenar mejor el portal hacerlo mas
> divertido moderno»

Y señaló, una por una, las pantallas concretas: la portada, el portal, las disciplinas, las
observaciones abiertas y los cuadros de modelos que se pueden abrir.

**Es una fase y no un arreglo, y la diferencia importa.** La `FASE 9` llevó el sistema de diseño al
**visor** —tokens, escala, foco, contraste con su oráculo en el gate— y el portal se quedó con lo
que ya tenía: un sistema correcto y sin vida. Todo pasa AA, todo es legible, y todo pesa lo mismo:
nueve tarjetas idénticas de icono, título y dos líneas grises. **El defecto no es de contraste, es
de jerarquía**, y por eso no lo cazó el oráculo de la `FASE 9`.

| #        | Tarea                                                                           | Estado       |
| -------- | ------------------------------------------------------------------------------- | ------------ |
| `F11.1`  | Distintivo de disciplina: su código sobre su color, y la letra elegida midiendo | ✅ ver abajo |
| `F11.2`  | Fichas con nombre: «A» pasa a «A · Publicado y autorizado»                      | ✅ ver abajo |
| `F11.3`  | La marca sin placa: variante de trazo claro para las superficies oscuras        | ✅ ver abajo |
| `F11.4`  | La portada: dos mitades, para qué sirve esto, y un mensaje para el equipo       | ✅ ver abajo |
| `F11.5`  | El portal reordenado, y la tarjeta de obra con datos y no con texto             | ✅ ver abajo |
| `F11.6`  | «Observaciones abiertas»: prioridad, antigüedad y responsable de un vistazo     | ✅ ver abajo |
| `F11.7`  | Una sección de ayuda con el recorrido de cómo se usa                            | ✅ ver abajo |
| `F11.8`  | Botones, campos y migas: los controles dejaron de ser los del sistema           | ✅ ver abajo |
| `F11.9`  | La ficha de un hallazgo en dos columnas: la conversación y la ficha             | ✅ ver abajo |
| `F11.10` | El portal: nombres de sección, líneas de ayuda, iconos y los cinco acentos      | ✅ ver abajo |

### `F11.5` — El portal, que es la página que más pesa

**El violeta es la marca, no el uniforme.** Pintar con violeta también los cinco grupos dejaba una
página de un solo color, y un solo color es lo que se lee como plano. Cada grupo lleva ahora el
suyo, los cinco medidos sobre las dos superficies del sistema: violeta 8,26 / 7,46 · turquesa
5,89 / 8,77 · ámbar 5,93 / 8,47 · verde 5,29 / 8,49 · acero 7,30 / 7,52. El icono va sobre una
baldosa de su acento, que es lo que deja reconocer la tarjeta sin leerla.

Y la tarjeta de obra decía «Edificio corporativo · Anteproyecto · avance 1», que es la etapa y un
número sin unidad. Lleva ahora la barra de avance con su porcentaje y las cifras que deciden dónde
entrar —vencidas, de prioridad alta, abiertas—, cada una con su palabra y no solo con su color.
**El cero no se dibuja**: «0 vencidas» es ruido en una puerta, y hace que una obra limpia parezca
tener problemas.

> **El gesto de pasar por encima ya existía y no se tocó.** Estaba escrito como `a.tarjeta` a
> propósito, para que una tarjeta sin enlace no prometa nada; lo único añadido es que el borde tome
> el acento de su grupo. Estuve a punto de deshacer esa decisión con una regla más general.

### `F11.6` y `F11.8` — Donde se perdía el hilo

**Se pinchaba un hallazgo en la lista de la obra y se caía en una página que no decía dónde estás ni
en qué punto va.** El usuario lo dijo así: «al momento de pinchar lleva al comentario y no se
entiende el seguimiento; el flujo se pierde». Tres cosas lo arreglan:

1. **Las migas** —Portal › obra › Observaciones › esta—, porque la única salida era el botón atrás
   del navegador.
2. **El paso a paso**: `Abierta → Respondida → Cerrada`, con el actual marcado. Sale de
   `StatusFlowMixin`, que **no añade campos** —así que no costó una migración— y no se puede separar
   de los estados reales: si mañana se añade un estado, el dibujo lo trae solo. **`Descartada` va
   como estado detenido y no como cuarto paso**, porque un falso positivo no «avanzó» hasta ahí.
3. **Los controles dejaron de ser los del sistema** (`F11.8`), y eso era media explicación de «se ve
   plano»: `button` sin estilo sale con el gris de Windows sobre una pantalla oscura, y los campos
   eran **cajas blancas** en tema oscuro. Los tokens ya existían; faltaba usarlos.

> **Y una trampa al adoptar el mixin:** `Observacion` llama a su campo `estado` y los otros tres
> modelos que avanzan lo llaman `status`, así que el método del mixin daba `AttributeError` al
> pintar la ficha. Se sobreescribe el método en vez de renombrar el campo: renombrarlo serían una
> migración y cuarenta usos por delante, y no arreglaría nada que se vea.

**Y la otra mitad de `F11.6`, la tabla.** Era texto plano: la prioridad como palabra gris del mismo
peso que todo lo demás, nueve títulos subrayados compitiendo entre sí, y «Vence» como una columna de
rayas porque casi nada tiene fecha. Cinco cambios, y **ninguno añade un dato que no estuviera**:

- **La prioridad como píldora**, con su color y su palabra. El componente ya existía en `app.css` y
  solo lo usaba la pantalla de cobertura. Solo «Alta» toma el color de alarma —8,79:1—; media y baja
  van en gris: si las tres gritaran, ninguna gritaría.
- **El título sin subrayar**, y subrayado y en el acento al pasar por encima. La fila entera se
  resalta, así que el subrayado permanente solo añadía ruido.
- **De dónde viene**, con la palabra que ya calcula el modelo: choque, modelo o documento. Un choque
  lo encontró una máquina y una nota la escribió alguien.
- **La antigüedad donde no hay vencimiento**, que es el caso normal: «abierta hace 3 horas» dice algo
  y una raya no. Lo vencido sigue en rojo con su palabra.
- **Las dos barras de herramientas, debajo de la tabla.** Estaban entre el rótulo y los datos, así
  que para ver la lista había que pasar por encima de dos formularios: un rótulo de sección va
  seguido de lo que nombra. Es de lo que el usuario se quejaba como «mal distribuido».

> **Una unidad y no dos.** El filtro `timesince` de Django dice «3 horas, 43 minutos», y en una
> columna de apoyo eso resultaba **más largo que el título del hallazgo de al lado**. El filtro
> `antiguedad` es el mismo `timesince` con `depth=1`, así que el redondeo y las traducciones siguen
> siendo los de Django: no se reimplementa nada, y su prueba lo compara contra la función original.

> **Y un empate de reloj que era un hueco real.** Al correr el gate, una prueba de `F5.5` falló una
> vez de veinte: la marca de «ya lo vi» se crea al leer la lista y la observación se escribía
> inmediatamente después, y el reloj del sistema devolvió **el mismo instante** para las dos. Con la
> comparación estricta que había, el hallazgo nacía ya visto. Pasa a `>=` —el empate cuenta como
> nueva— y la prueba fuerza el empate en vez de esperarlo. De los dos errores posibles, **mostrar de
> más se corrige mirando y perder un hallazgo no se corrige nunca.**

**El oráculo de la fase, y es el que falta hoy:** el contraste ya está comprobado en el gate para el
visor; lo que no está comprobado es **la jerarquía**. La forma medible de decirlo: en una pantalla,
cuántos pesos y tamaños distintos de texto hay, y si el elemento más importante es el más marcado.
Se escribe cuando `F11.5` y `F11.6` estén, para no fijar un número antes de saber qué mide.

### ❓ El fantasma al pasar a ortográfica — dos arreglos, y una pregunta que este entorno no puede cerrar

> «Sigue el fantasma al pasar a ortográfica.»
>
> «Al momento de mover y cambiar de órbita a ortográfica pasaba eso.»

**El segundo mensaje fue el que hizo avanzar esto**, porque nombra el gesto: el cambio de proyección
ocurre **con el movimiento en marcha**. La primera medición no lo reproducía porque esperaba y
emitía `rest` antes de cambiar, y con la cámara descansada el repintado ya había corrido.

**Lo que se encontró midiendo el gesto de verdad**, con el modelo encuadrado antes de cada pasada
para no confundir «la escena se quedó vacía» con «la cámara mira a otro lado»: al cambiar de
proyección en medio de un movimiento, **la escena se queda sin mallas** y sigue así dos segundos
después sin que nadie toque nada. Con `rest` emitido a mano vuelve a dibujar. O sea: el visor
esperaba un aviso que **nadie iba a dar**, porque camera-controls emite `rest` al terminar un
movimiento y el cambio de proyección interrumpió el que estaba en marcha.

Eso está arreglado: el refresco ya no se cuelga solo del evento, se pide **también** un poco después
a ciegas (`refrescarAlAsentarse`, 400 ms medidos). Y de camino se cerró la otra asimetría real:
**entrar** en la vista fantasma tenía un bucle que insiste hasta que no queda geometría sin pintar y
**salir** no tenía nada equivalente, así que una malla creada por el nivel de detalle después de
despintar nacía translúcida y nadie la devolvía a sólido.

**Y lo que queda abierto, dicho con precisión**: en el arnés, la pasada que va a **Perspective**
termina con cero mallas incluso con la cámara descansada, mientras las de **Orthographic** dibujan 53. Eso puede ser un defecto —perder el encuadre al volver de ortográfica a perspectiva— o un
artefacto del entorno: **el panel del navegador no corre el bucle de dibujo**, y `paintAudit` cuenta
mallas que Fragments crea _al dibujar_, así que un cero puede significar «no se compuso ningún
fotograma para esa cámara» y no «la escena está vacía». Este arnés no puede distinguir las dos
cosas, y por eso no se cierra aquí.

**Cómo cerrarlo, para quien siga**: `diag.html?modo=fantasma` deja la receta ejecutable —encuadrar,
ensuciar con fantasma, mover y cambiar de proyección sin `rest`—; lo que falta es mirarlo en una
pantalla de verdad con el modelo del usuario y decir si lo que queda es dibujo de línea, nada, o el
modelo entero.

**Y la pintura del fantasma sale limpia en todas las mediciones** —cero mallas pintadas en las seis
pasadas, sobre los dos modelos de muestra y también con el barrido desactivado a propósito—, así que
lo que se ve en la captura del usuario **no es la pintura**: es lo que la escena deja de dibujar.

### El visor no podía escribir en ningún navegador, y el gate no lo veía

**Es el defecto más grave que ha aparecido hasta ahora**, y estuvo dentro desde que el visor
empezó a escribir. Cuatro capacidades enteras —dejar una nota sobre un elemento, descartar un
conflicto, marcar la coordinación como vista y guardar una vista compartida— devolvían **403 en
cualquier navegador** y funcionaban perfectamente en las pruebas.

La causa es una línea: `CSRF_COOKIE_HTTPONLY = True`. El visor lee el testigo de `document.cookie`
—que es de donde Django espera que se lea— y con `HttpOnly` ahí no hay nada que leer, así que
mandaba la cabecera vacía. Django contestaba `403 CSRF Failed: CSRF token missing`.

**Y el mensaje del visor tapaba la causa.** Un 403 se traducía a «tu sesión caducó o tu rol no puede
abrir observaciones», que son dos cosas y ninguna era esta. El usuario lo vivió con un rol que sí
tiene `add_observacion`:

> «En mi sesión no puedo modificar en las pruebas?»

Tres lecciones, y la del medio es la que vale para lo que venga:

1. **El cliente de pruebas de Django no comprueba CSRF.** Es lo que dejó pasar 613 pruebas en verde
   sobre cuatro escrituras que no funcionaban. Ahora hay pruebas con `enforce_csrf_checks` que
   mandan el testigo **leído de la cookie**, o sea que hacen lo que hace el navegador y solo eso.
2. **Una capacidad que solo se ejerce desde las pruebas no está probada, está simulada.** La regla
   de la Fase 5 —«no cuenta como hecha si solo se alcanza por la línea de comandos»— aplica igual
   aquí: si el único cliente que la ejerce es el de pruebas, no está hecha.
3. **Un mensaje de error que enumera causas posibles no es un mensaje, es una lista de sospechosos.**
   DRF distingue las tres en el cuerpo de la respuesta; solo había que leerlo, y ahora se lee.

`HttpOnly` en la cookie de CSRF no aporta protección real —lo dice la documentación de Django—
porque lo que el testigo evita es que **otro sitio** mande la petición, y para eso no necesita
leerlo: le basta con no tenerlo. La cookie de sesión sigue siendo `HttpOnly`, y hay una prueba que
comprueba las dos cosas a la vez.

### El orden por prioridad era alfabético, y estaba en el informe

**`ORDER BY prioridad` devuelve alta, baja, media.** Los valores guardados son palabras, así que la
base los ordena por letra y la prioridad baja se colaba entre la alta y la media. Lo mismo con el
estado: por letra, lo cerrado salía antes que lo que espera respuesta, o sea al revés del camino que
recorre un hallazgo.

**Estaba en el informe desde que se escribió** y no se notó por una razón que conviene recordar: la
obra de desarrollo no tenía ni un hallazgo de prioridad baja. Los datos de prueba que no cubren
todos los valores de un `choices` esconden exactamente esta clase de defecto.

El peso vive ahora en `apps/documents/orden.py`, una sola vez, y lo usan la pantalla de la obra, la
lista general y el informe. Hay una prueba que **compara las dos salidas**: si un día vuelven a
discrepar, falla ahí y no en una reunión con el PDF delante.

### Ordenar y filtrar la lista, que era lo que faltaba para triarla

> «Además, poder ordenarlos por columna como yo quiera, filtrarlos.»

Cada cabecera ordena por su columna y volver a pincharla le da la vuelta; la que manda lleva su
flecha y su `aria-sort`. Filtros por prioridad, estado y obra.

Tres decisiones que no son obvias:

- **Va por URL y no ordenando la tabla en el navegador.** La lista está paginada, así que ordenar
  las cincuenta filas visibles daría un orden falso —el hallazgo más urgente puede estar en la
  página tres—. Y con el orden en la URL, una vista se guarda en favoritos y se manda por correo.
- **Ordenar no se lleva por delante el filtro**, que es el defecto clásico de una tabla ordenable:
  se filtra, se ordena, vuelve la lista entera y el filtro parece no funcionar. Tiene su prueba.
- **Cada columna lleva su desempate y el criterio termina en `pk`.** Sin un orden total, dos filas
  iguales pueden bailar entre páginas y una de ellas no aparecer nunca.

### `F11.9` — La ficha de un hallazgo: la conversación a un lado, los datos al otro

**El usuario se quejó dos veces de la misma pantalla**, y la segunda ya con las migas y el paso a
paso puestos:

> «Este flujo no es práctico ni comprensible y se ve mal distribuido.»

Y tenía razón. Era **una columna con cuatro secciones apiladas** —hilo, responder, etiquetas,
cerrar—, las cuatro con el mismo peso y el mismo aspecto, en un monitor de 1900 px donde sobraban
mil. Quien entra a un hallazgo hace una de dos cosas: **leer de qué va** o **hacer algo con él**, y
las dos estaban mezcladas en la misma cola vertical.

La pantalla se parte en esas dos, que es lo que hacen los gestores de incidencias que se usan de
verdad —y `OpenProject BIM` en particular, la referencia que el usuario pidió mirar:

- **A la izquierda, la conversación**: de qué va, qué se ha dicho y responder. Una sola columna de
  lectura, con la medida de una columna de lectura: **68 caracteres**, no 1400 píxeles.
- **A la derecha, la ficha**: en qué punto va, de quién es, sobre qué está, cómo está clasificado y
  cómo se cierra. Son **datos y acciones**, no lectura, y por eso dejan de meterse en medio del
  hilo. Son 320 px fijos y no un porcentaje: lo que llevan son pares dato/valor, que tienen un
  ancho natural y no ganan nada estirándose.

Cuatro cosas más, y ninguna es de estructura:

- **El hilo pasa a ser conversación y no tabla.** Eran dos celdas —autor a la izquierda, texto a la
  derecha— y una respuesta de dos líneas dejaba media fila vacía al lado. Y ahora **se distingue lo
  que escribió quien está mirando**: sus mensajes van al otro lado y con el color de la marca.
- **El rótulo del campo va encima de la caja.** `as_p` de Django pone `<label>` y `<textarea>` en la
  misma línea, así que con una caja de tres filas el «Comentario:» quedaba flotando a media altura a
  su izquierda. Es literalmente lo que el usuario llamó «mal distribuido», y no se arreglaba
  moviendo bloques: se arregla pintando el campo.
- **Cerrar deja de tener el mismo aspecto que responder.** Responder se hace todos los días y cerrar
  una vez; con los dos como bloques iguales, el último parecía el principal por estar abajo. Ahora
  cerrar va al final del lateral y con el borde punteado.
- **La miga dice «Observaciones» y no «Hallazgos».** Estuve a punto de dejarla con el segundo
  nombre, y una miga que no coincide con el título de la pantalla a la que lleva es peor que no
  tenerla. «Hallazgo» se queda donde es una palabra de columna, no de sección.

Se apila en una columna por debajo de 980 px, y **el cuerpo va primero**: de qué va antes que qué
hacer.

### `F11.10` — El portal: los nombres, la ayuda, los iconos y un violeta que no se iba

> «Mejorar las etiquetas de ayuda y los logos, ponerlos más precisos y claros, y buscar los mejores
> nombres para cada sección; y mejorar el tema de los logos y colores.»

**Lo primero que salió de mirarlo fue un defecto, no una preferencia.** Los cinco acentos del portal
estaban medidos y aplicados desde la pasada anterior, y aun así los doce iconos salían violetas. La
causa: `.icono` tenía **el `stroke` clavado en el violeta de la marca**, y los dibujos son de trazo y
no de relleno, así que el `color: var(--acento)` de la tarjeta solo pintaba la baldosa de detrás.

Y engaña al medirlo: `getComputedStyle(icono).color` devuelve el acento correcto mientras **lo que
se ve en pantalla es el `stroke`**. Medí la propiedad equivocada y por poco doy el color por bueno.
Peor: el comentario de `generic/_iconos.html` afirmaba desde el primer día que los iconos «heredan
el color con `currentColor`». Estaba escrito y no era verdad — ahora lo es, y la advertencia queda
en el archivo.

**El tono también se mide, no solo el contraste.** Tener cinco colores distintos no basta si dos se
parecen: el cian del modelo (`#5fd3d8`) y el verde de coordinación (`#5fd3ae`) estaban a **21 grados
de tono**, o sea el mismo color a 18 px. Es lo que el usuario venía diciendo como «todo del mismo
tono». El modelo pasa a azul y la coordinación a verde de verdad, y el par más cercano queda a **63
grados**; administración baja a **11 % de saturación** a propósito, porque no es una etapa del
trabajo. Los diez valores siguen pasando AA sobre las dos superficies: la tabla está en `app.css`.

**Los nombres de sección dicen de qué tratan, no qué clase de objeto son.** «Proyecto», «Modelo» y
«Documentos» son nombres de tablas; **«Las obras», «El modelo» y «El registro documental»** son
sitios a los que se va, y la lista se lee como una tabla de contenidos. Las tres reglas que salieron
de la revisión quedan escritas en `_definicion()`, porque valen para lo que se añada después.

**Y «Lo mío» cambia de grupo**: lista observaciones y actividades, o sea coordinación, y estaba en
documentos porque el permiso que pide es de observaciones. **El permiso no es el sitio.**

Las líneas de ayuda se reescribieron enteras con un criterio: **contestar «qué encuentro ahí» sin
repetir el título y sin prometer lo que no hay** —el transmittal no dice «con acuse de recibo»,
porque no lo tiene—. Y tres iconos que eran la misma mancha a 18 px se rehicieron: organización era
el mismo cubo que el visor; entregable, requisito y observación eran tres hojas casi iguales. Una
observación no es un documento: es una conversación abierta sobre algo.

### `F11.1` — El distintivo de disciplina, y por qué la letra se mide

La tabla de disciplinas ensenaba un cuadrado de color y **el hexadecimal en texto**: `#5b3a9e` al
lado de «Arquitectura». Es el valor de un campo, no información — y a quien lo lee no le sirve de
nada.

Ahora cada especialidad tiene su distintivo: **el código sobre su propio color**. Y el color de la
letra **se calcula**, no se supone: el color lo elige una persona en un formulario, así que puede
ser un violeta oscuro o un amarillo casi blanco, y «AR» en blanco sobre amarillo no se lee. Vive en
`apps/projects/color.py`, con la fórmula de WCAG 2.1 fijada por sus vectores conocidos.

**Y no hay umbral.** Se comparan los dos contrastes de verdad —blanco y tinta— y gana el mayor, que
es lo que acierta también en los colores medios: un umbral en 0,5 de luminancia se equivoca justo
donde caen los azules y los verdes de una paleta de disciplinas. La prueba lo recorre con siete
colores, incluido el gris exacto de en medio.

**El código va escrito y no solo el color**: uno de cada doce hombres no distingue rojo de verde, y
un cuadrado suelto no identifica nada para él.

### `F11.2` — «A · AR» no le dice nada a nadie

Los cuadros de modelos que se pueden abrir decían `716-LCD-AGR-B rev. A1` y debajo
`interferencias-a-proposito.ifc · A · AR`. Los dos códigos sueltos, sin decir de qué hablaban — y
los dos son decisiones con consecuencias: la idoneidad dice **qué autoriza** esa revisión y la
disciplina **de quién es**.

Ahora la disciplina va en su distintivo y la idoneidad en una ficha con **su significado escrito**,
que el modelo ya tenía (`A · Publicado y autorizado`). El nombre del archivo baja a la segunda
línea, que es su sitio: dice de qué formato es, no qué se puede hacer con él.

### `F11.3` — La marca sin placa, y la placa que duró una tarde

El relleno del dibujo es `#1B2A4A`, que es **el mismo hexadecimal** que la barra del portal: 1,00:1.
El primer intento fue ponerlo sobre una placa blanca — resolvía el contraste y creaba algo peor, un
parche blanco que no pertenece a la paleta. Lo dijo el usuario mirándolo: «que la imagen coincida
con los colores, en general no se ve bien».

La solución es una **variante para fondo oscuro**: rellenos transparentes —así se adapta a cualquier
superficie, porque lo transparente no tiene color con el que chocar— y el trazo en el acento del
sistema. Medido sobre las tres superficies donde aparece: **6,79 / 7,80 / 7,46:1** contra 3,45 /
3,96 / 3,79 del violeta de marca.

> **Y una trampa de XML que costó una imagen rota:** un comentario de SVG **no puede contener dos
> guiones seguidos**, así que escribir el nombre de un token con sus dos guiones delante deja el
> archivo inválido y la marca sale como icono roto. El navegador no dice «SVG inválido», dice nada.

### `F11.4` — La portada, y el mensaje para el equipo

Era un formulario flotando en el medio de la pantalla. Ahora tiene dos mitades: a la derecha la
puerta, a la izquierda **para qué sirve esto** —tres cosas, cada una empezando por un verbo, y las
tres son cosas que el producto ya hace de punta a punta— y un mensaje para el equipo, que lo pidió
el usuario:

> «dejar un mensaje para el equipo motivandolo, que sea llamativo, buena onda»

Se apila en una columna por debajo de 860 px, y **el formulario va primero en el HTML**: así en el
móvil se entra sin bajar, y en el escritorio la rejilla lo coloca a la derecha.

### `F11.7` — ✅ La ayuda: un recorrido generado, no un recorrido pintado encima

> «una seccion de ayuda como usar el software con un recorrido o como usarlo»

**La decisión se dejó al usuario dos veces y pidió avanzar, así que se tomó y queda escrita.** Las
dos formas eran un recorrido con globos sobre la pantalla —el patrón de `intro.js`— o una ayuda
generada de lo que el producto sabe hacer. Se eligió la segunda por dos razones:

1. **El recorrido con globos se rompe con cada cambio de interfaz**, y esta interfaz cambia: se
   ancla a selectores o a posiciones, y el día que un botón se mueve de panel el globo apunta a otro
   sitio y la ayuda **miente sin avisar**. Es la peor clase de documentación: la que parece correcta.
2. **No cubre las dos mitades del producto.** El portal es Django y el visor es una aplicación de
   una página; habría que escribirlo dos veces, con dos librerías, y mantenerlo en dos sitios.

**Lo que hay: nueve pasos en el orden en que se trabaja**, no por módulos — y ese orden es la mitad
del valor, porque lo que no sabe quien abre esto la primera vez es por dónde se empieza. Entrar en
la obra, abrir el modelo, mirar y medir, dejar una nota, cruzar los modelos, repartir y seguir, sacar
el papel, mandar y recibir BCF, sacar los planos. Cada paso dice **para qué sirve** —que es lo que
casi nunca está escrito en una ayuda y lo único que hace falta para decidir si te interesa—, **qué
hacer**, y lleva a la pantalla de verdad. Está en la barra de todas las pantallas: se busca desde
donde uno se ha atascado, no volviendo a la puerta.

**Y enseña el flujo entero marcando lo que no te toca**, que es la diferencia con el portal y es
deliberada. El portal **esconde** lo que tu rol no puede abrir —un botón que termina en 403 enseña a
probar puertas— y aquí eso sería mentir por omisión: quien lee esto no entendería de dónde le llegan
las observaciones que tiene que contestar. Medido con el rol de mandante: **3 de los 9 pasos salen
marcados, con quién los hace** —«lo hace quien coordina»— y sin botón que acabaría en 403. El portal
es una puerta; esto es una explicación.

> **El oráculo es lo que impide que se desfase**, y es lo que una ayuda escrita a mano no puede
> tener: cada destino **resuelve** con el enrutador de Django, cada destino **está además en el
> catálogo del portal** —si un módulo se quita, el gate lo dice en vez de dejar la ayuda llevando a
> una pantalla que ya nadie ofrece— y **cada permiso que nombra existe de verdad**. Ese último no es
> teórico: un permiso mal escrito no falla, **calla** —`has_perm` devuelve `False` siempre— así que
> el paso saldría marcado como ajeno para todo el mundo y nadie sabría por qué.

> **Y una decisión de idioma que va contra la convención del portal, dicha:** el texto del recorrido
> es **español literal, sin `gettext`**. El catálogo va de msgid en inglés a msgstr en español, así
> que marcar prosa que ya está en español obligaría a treinta y cinco traducciones de sí misma. El
> visor entero ya es literal en español, así que esto es lo consistente. Lo destapó además una
> prueba que el proyecto ya tenía —`test_ninguna_traduccion_repite_el_original`— cuando una de esas
> cadenas se colgó del catálogo. Si algún día hay un segundo idioma, `ayuda.py` es el archivo que se
> revisa.

---

## La competencia abierta, y qué se le puede mirar

**El usuario trajo la lista el 2026-09-02** —Bonsai, That Open Engine, OpenProject BIM y FreeCAD—
con el encargo de «tomar cómo funciona la competencia, que es abierta de revisar, para implementar y
mejorar». Lo primero que hay que decir es lo que ya pasó:

| Herramienta                   | Dónde está respecto a AeroBim                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **That Open Engine**          | **Ya es el visor.** `@thatopen/components` y `@thatopen/fragments` con `web-ifc` son lo que abre el IFC en el navegador desde `F0.4`                                         |
| **Bonsai** (antes BlenderBIM) | **Su motor ya es el servidor.** Bonsai es la interfaz de Blender sobre IfcOpenShell, y AeroBim usa esa misma familia: `ifcopenshell`, `ifctester`, `ifcclash` y `bcf-client` |
| **FreeCAD BIM**               | Lee IFC por la misma vía. Como referencia de producto no aporta: es modelado paramétrico, no coordinación                                                                    |
| **OpenProject BIM**           | **Es la única que hay que estudiar de verdad.** Es un CDE con seguimiento de incidencias y BCF, o sea el competidor directo de las fases 4, 5 y 8                            |

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
