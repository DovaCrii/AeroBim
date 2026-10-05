# Fase 1 — Visor IFC usable (y la Fase 2 de nubes, que vive dentro)

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 1 — Visor IFC usable

**Objetivo de salida:** alguien de oficina técnica revisa un modelo sin abrir
software de escritorio ni pedir una licencia.

| #       | Tarea                                                                                                                                 | Estado                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `F1.1`  | Árbol espacial navegable (proyecto → sitio → edificio → planta → elemento) con aislar y ocultar                                       | ✅ ver abajo                                                                              |
| `F1.2`  | Panel de propiedades y **psets** del elemento seleccionado                                                                            | ✅ ver abajo                                                                              |
| `F1.3`  | Planos de corte y secciones                                                                                                           | ✅ ver abajo                                                                              |
| `F1.4`  | Mediciones: distancia, área y ángulo                                                                                                  | ✅ ver abajo                                                                              |
| `F1.5`  | Cargar **varios modelos IFC a la vez** (arquitectura + estructura + instalaciones) y alternarlos                                      | ✅ ver abajo                                                                              |
| `F1.6`  | Vistas guardadas: cámara, visibilidad y cortes, recuperables por nombre                                                               | ✅ ver abajo                                                                              |
| `F1.7`  | **Modos de vista**: proyección perspectiva/ortográfica, navegación (órbita, planta, primera persona) y representación (sólido, malla) | ✅ ver abajo                                                                              |
| `F1.8`  | **Barra de herramientas y panel de modelos** — reubicar y agrupar las herramientas; ordenar, activar y desactivar lo cargado          | ✅ ver abajo                                                                              |
| `F1.9`  | **Unidades de las propiedades** — cada número con la unidad que declara el archivo                                                    | ✅ ver abajo                                                                              |
| `F1.10` | **Geometría que no se carga** — el conversor dejaba fuera `IfcProxy`: 433 elementos de 1.274                                          | ✅ ver abajo                                                                              |
| `F1.11` | **El picker caía desviado** el ancho del panel izquierdo: se seleccionaba otro elemento                                               | ✅ ver abajo                                                                              |
| `F1.12` | **Preselección al pasar el cursor** — se selecciona sin clicar y el usuario lo llama «poco práctico»                                  | ✅ ver abajo                                                                              |
| `F1.13` | **El panel de abajo no se entiende** — reubicar y agrupar las herramientas, mirando cómo lo resuelven Revit y AutoCAD                 | ✅ siete desajustes cerrados y los tres nombres decididos el 2026-09-23 (#64) — ver abajo |
| `F1.14` | **La medición de distancia no funciona** en uso real, con el modelo del usuario                                                       | ✅ ver abajo                                                                              |
| `F1.15` | **El modo fantasma se cae al mover** la cámara                                                                                        | ✅ ver abajo                                                                              |
| `F1.16` | **El renderizado no da profundidad** — sin sombras creíbles, el modelo se lee peor de lo que debería                                  | ✅ ver abajo                                                                              |

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

> **~~Pendiente honesto: las cantidades de longitud salen sin unidad.~~ Resuelto, y esta nota
> llevaba desde entonces sin borrarse.** Decía que el panel no podía saber la unidad porque los
> metadatos de Fragments no traen `IfcUnitAssignment`. Se resolvió leyendo las unidades **del texto
> del IFC antes de convertirlo** y guardándolas por modelo (`unitsByModel`). Comprobado hoy
> —2026-09-03— sobre `muro-con-psets.ifc`, que declara milímetros:
>
> ```
> unidades declaradas: {"length":"mm","area":"m²","volume":"m³",…}
>   Length      = 4000 mm  [IFCLENGTHMEASURE]
>   NetSideArea = 12 m²    [IFCAREAMEASURE]
>   NetVolume   = 2.4 m³   [IFCVOLUMEMEASURE]
> ```

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

El documento entero está en **[`docs/NUBES_DE_PUNTOS.md`](../../../docs/NUBES_DE_PUNTOS.md)**: qué formato
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
