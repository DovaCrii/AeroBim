# Fase 4 — Coordinación (BCF)

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

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
[grid.ts:61](../../../packages/viewer/src/grid.ts) dibuja los ejes de replanteo leyendo el IFC y
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
