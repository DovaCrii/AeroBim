# Fase 12 — La interfaz

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 12 — La interfaz no está: hay capacidades sin puerta

**Encargada por el usuario el 2026-09-03**, mirando el visor y el portal:

> «hoy no tiene herramientas tampoco visible y todo es plano sin interfaz inexistente» · «lo mismo
> aplicable al calce o en general unir todo con el portal» · «el portal, mejorar el ingreso sobre
> todo; portal como está escrito y representado en la página, mejorar el título de este y cómo
> muestra los módulos»

### Lo primero, porque cambia el orden de todo lo demás

**La Fase 2 está marcada como cerrada y no se puede usar.** Cargar una nube, calzarla con el modelo y
medir la desviación funcionan —medido, en un navegador de verdad, sobre el levantamiento del Camino
Agrícola— **y solo existen en `diag.html`**. Comprobado: en `apps/web/src` no hay una sola aparición
de `loadPointCloud` fuera del diagnóstico. **No hay ningún botón que abra una nube.**

Las filas decían «cargar una nube en la escena del visor» y eso es cierto como capacidad y falso como
producto. Es la misma distancia que hay entre que el motor arranque y que el coche tenga volante, y
la conclusión es que **`F12.1` es lo más valioso del tablero ahora mismo**: hay trabajo hecho que
nadie puede alcanzar.

### Lo medido, para no discutir impresiones

| Qué                                         | Medido el 2026-09-03                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Los nombres de las herramientas de la cinta | **3,56:1** de contraste. La norma pide **4,5:1** para texto                    |
| La nube de puntos en la aplicación          | **0 referencias** fuera del diagnóstico                                        |
| El lienzo sin modelo                        | Un rectángulo de ~900 × 700 px con **una frase** centrada                      |
| El navegador                                | **9 secciones plegadas**, todas del mismo peso, sin nada que diga cuál importa |
| El cubo de vistas                           | «FRONTAL» y «LATERAL» a **2 px** — se leían como una palabra ✅ _arreglado_    |
| La marca del visor servido por Django       | **404** ✅ _arreglado_                                                         |
| Los radios del portal                       | Siete valores a mano ✅ _arreglado en `F9.5`_                                  |

### Las tareas

| #       | Tarea                                                                                         | Estado |
| ------- | --------------------------------------------------------------------------------------------- | ------ |
| `F12.1` | **La nube de puntos tiene puerta**: abrirla, verla en el navegador, y sus controles           | ✅     |
| `F12.2` | **El calce y la desviación son pantalla, no registro**: señalar puntos, ver el residuo, medir | 🔶     |
| `F12.3` | **Las herramientas se ven**: contraste, tamaño e importancia relativa en la cinta             | ✅     |
| `F12.4` | **El lienzo vacío es una puerta de entrada**, no un vacío con una frase                       | ✅     |
| `F12.5` | **El navegador tiene jerarquía**: nueve secciones iguales no dicen por dónde empezar          | ✅     |
| `F12.6` | **La entrada al portal**: es la primera pantalla del producto y hoy es un formulario          | ✅     |
| `F12.7` | **«Portal» deja de titular la portada**, y los módulos se presentan por lo que resuelven      | ✅     |
| `F12.8` | **La costura**: el visor y el portal se leen como un producto, no como dos                    | ✅     |
| `F12.9` | **La cota lleva su número encima**, en la escena y no en la barra de abajo                    | ✅     |

Y cuatro que salieron al planificar el piloto del CC 741 (plan del 2026-09-07): son huecos de
producto, no de estilo, y **bloquean que personas reales usen esto**.

| #        | Tarea                                                                                 | Estado |
| -------- | ------------------------------------------------------------------------------------- | ------ |
| `F12.10` | **Repartir un hallazgo**: dueño, fecha y prioridad desde la ficha, no solo al crearla | ✅     |
| `F12.11` | **Una captura adjunta al comentario**: hoy una queja del portal no lleva imagen       | ✅     |
| `F12.12` | **Métricas del piloto**: comando de solo lectura sobre lo que ya guarda la base       | ✅     |
| `F12.13` | **El levantamiento entra al expediente**: la nube como revisión, y servida por tramos | ✅     |
| `F12.14` | **Coordinar sobre la nube sin esperar al modelo**: medir, encuadrar y anotar un punto | ✅     |

**Oráculo de la fase:** el usuario abre las dos mitades y **no dice «está plano»**. No hay medida que
sustituya eso, y decir lo contrario sería inventarse un número. Lo que sí se mide y entra en el gate:
el contraste de cada texto, que ninguna capacidad quede sin puerta, y que los tokens sean los mismos
en las dos mitades.

### Cómo va la Fase 12, por bloques

El plan del 2026-09-07 la reparte en tres, en este orden: **primero lo que bloquea el piloto,
después el portal, después el visor**.

| Bloque                        | Pasos                                                                                                                           | Estado       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **1 · Desbloquear el piloto** | `F12.10` · `preparar_piloto` · timer y respaldo · `F12.13` · `PILOTO.md` · `F12.12`                                             | ✅ los seis  |
| **2 · El portal**             | tokens y gate · catálogo · rail · cabecera · «Mi trabajo» · bandeja · observaciones · la puerta · docs                          | ✅ los nueve |
| **3 · El visor**              | `UX.md` ✅ · gate ✅ · movimiento ✅ · `F12.9` ✅ · `F12.4` ✅ · `F12.3` ✅ · `F12.5` ✅ · rail ✅ · tema claro ✅ · `F12.8` ✅ | ✅ los diez  |

**El bloque 2 cerró el 2026-09-07**, en la rama `codex/portal-asana`. Lo que dejó, además de las
nueve tareas:

- **Un gate que lee `app.css`** (`apps/core/tests/test_sistema_de_diseno.py`), que hasta entonces no
  existía: ninguna prueba leía ese archivo. Encontró cuatro cosas en su primera corrida, y una en sí
  mismo — un token declarado solo en el bloque oscuro pasaba la prueba de «todo `var()` está
  declarado» mientras la pista de la barra de avance seguía sin pintarse en tema claro.
- **Tres reglas de plantilla comprobadas** (`apps/core/tests/test_plantillas.py`): ningún `<h1>`
  dentro de `contenido`, ninguna pantalla sin título, y **ningún manejador en línea** — la CSP los
  bloquea en producción y funcionan en desarrollo, que es la forma de desplegar algo roto sin un
  mensaje. Cazó los tres `onchange` de los filtros de observaciones.
- **Un vocabulario común de tarea** (`apps/documents/tareas.py`), para que la portada y la bandeja no
  puedan discrepar sobre qué está pendiente.
- **`docs/UX.md` cubre el portal**, que era el hueco de fondo: no lo mencionaba en ninguna línea, y
  por eso el portal creció sin una regla escrita de dónde entra lo que llegue — la navegación acabó
  siendo la portada porque nunca se decidió que hubiera otra.

Y una deuda que el bloque destapó y pagó: **la pasada de la cabecera reindentó los
`blocktranslate`**, y el `msgid` de un `blocktranslate` incluye los espacios literales. Veintiuna
entradas dejaron de encontrarse y salían en inglés, sin que nada fallara. Lo cazó
`test_traducciones.py` al correr `makemessages`.

**El bloque 3 cerró el 2026-09-08**, en la rama `codex/visor-asana`, con los diez pasos. Lo que
dejó, además de las cinco tareas (`F12.9`, `F12.4`, `F12.3`, `F12.5`, `F12.8`):

- **Un descriptor de secciones** (`SECCIONES` en `ProjectBrowser.tsx`), que es lo que hace que el
  acordeón y el rail no puedan discrepar: añadir una capacidad sigue siendo añadir una fila.
- **`--color-sobre-accion`**, y con él el defecto que destapó: los **doce** botones primarios del
  visor escribían `text-fg` sobre un relleno que no cambia con el tema, o sea **1,92:1 en claro**,
  el botón «Abrir» incluido. Con el gate en verde, porque medía los textos contra las superficies y
  un relleno no es una superficie.
- **El tema claro mirado**, no solo medido por tokens: dieciséis pasadas de barrido en el navegador
  —tres pestañas, el navegador desplegado, el rail, un cuadro flotante, midiendo, y la escena
  vacía— con cero por debajo del suelo. Y con la trampa escrita: `bg-action/30` se resuelve en
  `oklab` con alfa, así que el fondo efectivo lo tiene que componer el navegador y no una
  expresión regular.
- ~~**Una pregunta abierta cerrada**: el lienzo **sí** sigue al tema, porque el renderizador va con
  `alpha` y lo que se ve detrás es la superficie del tema.~~

> **Esa última conclusión era falsa, y es la raíz de tres defectos. Corregida el 2026-09-09.**
>
> **El lienzo no sigue al tema.** El renderizador va con `alpha`, sí, y todas las capas de CSS
> detrás del `<canvas>` están a `rgba(0, 0, 0, 0)` —comprobado en el navegador—, pero lo que se ve
> **no** es la superficie del tema: es el fondo de la **escena**, que lo pone `SimpleScene` de la
> librería en `#202932` y no consulta nada nuestro. Con `data-theme="light"` puesto, el lienzo sigue
> siendo azul oscuro; está en las capturas de los dos temas.
>
> Y creer lo contrario tiene una consecuencia directa: **si el lienzo se aclarara con el tema,
> escribir encima con `text-fg` sería correcto**. Por eso el barrido de las dieciséis pasadas —que
> midió bien lo que midió— no miró esto: la pregunta ya estaba «cerrada». Los tres defectos que
> salieron el 2026-09-09 al mirarlo con el tema claro puesto:
>
> | Qué                                                | Medido sobre el lienzo `#202932`                |
> | -------------------------------------------------- | ----------------------------------------------- |
> | La puerta de entrada, con `text-fg` / `-2` / `-3`  | **1,08 / 2,16 / 2,90:1**                        |
> | Los tres rótulos del cubo de vistas, con `fill-fg` | **1,08:1** — invisibles                         |
> | El recuadro de la suelta, con `border-accent/70`   | **1,79:1**, y menos al 70 % — no llega a 1.4.11 |
>
> En la captura la primera pantalla del producto se leía «Un modelo \_\_\_, el plano \_\_\_ del
> proyecto, o el \_\_\_ de la obra»: **IFC**, **DXF** y **levantamiento** habían desaparecido.
>
> El arreglo es un token, `--color-sobre-lienzo` en tres niveles, que **no cambia con el tema** —
> igual que `--color-sobre-accion`, que nació del mismo error un piso más arriba— y da
> **13,1 / 8,1 / 5,6:1**. El recuadro de la suelta pasa a la marca, que tampoco cambia y da 3,57.
> Y el gate gana el lienzo como **cuarta superficie**: los tres niveles pasan AA encima de él,
> ninguno está redeclarado en el bloque claro, y los archivos que pintan sobre el lienzo no pueden
> fijar color de texto sin fijar fondo. Comprobado que **falla al revertir** el `<h2>` de la puerta.

Y tres decisiones que se tomaron mirándolas y quedaron en `docs/UX.md`: la cinta con la escena vacía
—pestañas y pliegue apagados, y el pliegue recordado cediendo ante «no hay nada abierto»—, el
pequeño de la cinta a 24 px en vez de los 22 que el plan razonó como área, y el rail que **pliega**
en vez de ocultar porque el navegador es el contenido del proyecto.

---

### `F12.1` — La nube de puntos tiene puerta

Hoy hay que escribir una URL de diagnóstico. Lo que falta:

1. **Una sección «Nubes de puntos» en el navegador**, que `docs/UX.md` ya tiene reservada — la regla
   de crecimiento del propio documento es «una capacidad nueva es una sección del navegador».
2. **Abrir un `.copc.laz`** por el mismo botón «Abrir» y el mismo arrastrar y soltar que ya toman el
   IFC y el DXF. La extensión decide, como ya decide entre modelo y plano.
3. **Que se abra desde el expediente**, como el IFC: una nube es un documento del registro, y ese es
   el argumento por el que se eligió COPC —un archivo, no un directorio—.
4. **La ficha antes de cargar**: cuántos puntos, qué extensión, qué sistema de referencia. Se lee en
   8 ms y es lo que permite decir «son 130 millones, entra el 12 %» **antes** de esperar.
5. **Los controles de `F2.3`**, que existen y no tienen mando: densidad, tamaño de punto, recorte por
   caja y los cuatro colores.

> **Y un aviso que la interfaz tiene que dar, porque el formato no perdona:** si el archivo **no
> declara sistema de referencia**, la nube no se puede cruzar con nada. Hoy eso solo se ve en una
> línea del diagnóstico.

### `F12.2` — El calce y la desviación son pantalla

**Hecho el 2026-09-03, y comprobado desde la aplicación:** la sección «Calce y desviación» del
navegador, con el calce automático y el informe de las seis cifras. Cargando `muro-en-utm.ifc` y el
levantamiento del Camino Agrícola por el botón «Abrir» y pulsando **Calzar automáticamente**:
`Calzada: movida 1,30 · -3,47 · 0,78 m` — los mismos números que daba el diagnóstico.

> **Y esa frase se retiró de la pantalla el 2026-09-09, porque se lee como lo que no es.** «Movida
> 1,30 · −3,47 · 0,78 m» se entiende como «el levantamiento estaba a metro y medio del modelo», que
> es una afirmación sobre la obra. No lo es: `alignPointCloudToModel` devuelve la diferencia entre
> **dos orígenes internos** —el que la nube resta para no perder precisión en `float32` y el que
> Fragments resta al recentrar el modelo—, así que su magnitud no dice nada de nadie. Se vio al
> tener dos levantamientos del mismo muro: uno da `1,30 · −3,47 · 0,78` y el otro
> `−6,70 · −3,47 · 8,78` —**el mismo −3,47 en los dos**, y las otras dos difiriendo en exactamente
> 8,00 m, que es medio lado de la segunda nube—. Queda el aviso, que es lo que hacía falta: calzar
> mal y medir encima da una desviación creíble y falsa.

Y con **la vuelta al ciclo del producto**: el informe lleva un botón que abre una observación sobre
ese elemento **con las cifras ya escritas en el detalle**. Medir y tener que copiar seis números a
mano es donde se pierden los hallazgos, o donde se transcriben mal, que es peor.

**Tres decisiones que tomó esta pantalla:**

1. **La tolerancia la pone quien mide**, con un control, y por omisión 20 mm. El programa no opina
   sobre qué es un defecto: cinco centímetros son tolerancia en una excavación y un problema grave
   en un pilar.
2. **La medición se borra al cambiar de elemento.** Dejarla puesta sería lo peor que puede hacer
   esta pantalla: seis cifras junto al nombre de otro elemento se leen como suyas, y quien abra una
   observación con ellas estaría anotando la desviación de una viga sobre un pilar.
3. **Cuando el modelo no trae emplazamiento, se dice por qué** en vez de no hacer nada. El motivo
   —que el modelo no sabe dónde está— es además lo que hay que pedirle a quien modela.

**Y el 2026-09-03, más tarde, el calce a mano** — que es el camino corriente, porque la mayoría de
los IFC de obra no traen emplazamiento. El gesto es: se pulsa «Empezar a señalar», y el panel **dice
qué se espera de cada clic** —«pincha el punto en el MODELO», «ahora el MISMO punto en la NUBE»—.
Con tres pares aparece el residuo, **y aparece mientras se señala y no al final**: es lo que dice si
los puntos que se están marcando son de verdad el mismo sitio.

**Cuatro decisiones de ese gesto:**

1. **El punto del modelo se toma con `pointOnModel`, que ya existía y viene con el ajuste a
   vértices** del medidor. Escribí un segundo camino con un rayo propio antes de encontrarlo, y era
   **peor además de duplicado**: sin ajuste, marcar la esquina de un muro es marcar un punto
   cualquiera cerca de la esquina.
2. **Se dice cuál es el par que peor calza.** `calzarConPuntos` ya lo devolvía y nadie lo enseñaba;
   sin eso, un residuo alto obliga a borrarlos todos y empezar de cero.
3. **Los pares se guardan en coordenadas del archivo**, no de la escena: es el sistema de los datos,
   y guardarlos en el del renderizador los ataría a la convención de hoy.
4. **Calzar se come el clic**, igual que alinear un plano: con seleccionar y medir escuchando, un
   clic entraba en las tres cosas.

> **Un defecto de React que solo se ve en pantalla, y así se vio.** `onCanvasClick` no llevaba
> `clicDeCalce` en sus dependencias, así que se quedaba con la primera versión —la de cuando el
> calce estaba apagado— y **el clic caía en seleccionar**. En la pantalla: el muro quedaba
> seleccionado y el panel seguía pidiendo «pincha el punto en el MODELO» para siempre. Ninguna
> prueba de Node lo habría encontrado.

> **Lo que queda sin comprobar en la aplicación, y por eso `F12.2` sigue en 🔶.** Con clics
> simulados, **la mitad del modelo funciona** —el paso avanza de «modelo» a «nube»— y **la mitad de
> la nube no se pudo ejercer**: el panel se queda esperando el punto del levantamiento. La función
> de señalar sobre la nube **sí está comprobada** en `/diag.html?modo=nube` —devuelve un punto a 0 mm
> del rayo y su conversión al archivo es exacta—, así que lo que falta por verificar es el gesto
> entero seguido, con la cámara donde una persona la pondría.
>
> Y hay una razón por la que cuesta aquí: **el panel del agente deja el lienzo a 0 de alto**, así que
> hay que forzarle el tamaño a mano antes de poder pinchar nada. Es la misma trampa que ya está
> escrita para las áreas de toque y para `diag.html`. **Esto lo cierra el usuario mirándolo**, y es
> honesto decirlo en vez de dar por bueno lo que no se pudo ver.
>
> **El 2026-09-08 el hueco se estrechó, y conviene decir hasta dónde.** Con `F12.14` quedó
> comprobado que **el clic sobre la nube sí funciona en la aplicación real**: dos clics seguidos
> dieron una cota —`Directa 26,403 m`— y un clic dio la ficha del punto con su coordenada UTM. O sea
> que la duda de esta nota —«el panel se queda esperando el punto del levantamiento»— **no es del
> rayo contra la nube**, que responde.
>
> Lo que sigue sin ejercerse es **la pareja seguida**, y el obstáculo resultó ser el otro lado: en
> `muro-en-utm.ifc` el muro ocupa una traza de pocos píxeles a cualquier encuadre que incluya el
> levantamiento, y dieciocho clics en una rejilla sobre él no dieron ni uno en el modelo — todos
> cayeron en la nube o al vacío. Con un IFC grande al lado la unión de cajas se va a kilómetros y no
> se ve nada. **Sigue siendo del usuario**, y ahora se sabe qué le hace falta: un modelo y un
> levantamiento del mismo sitio, que es justo lo que tendrá en el piloto y no hay en el repositorio.
>
> #### El 2026-09-09: **el par ya está en el repositorio**, y lo que destapó
>
> «Un modelo y un levantamiento del mismo sitio» no tenía que esperar a la obra: el muro de
> `muro-en-utm.ifc` está completamente determinado por el archivo —perfil de 4 000 × 200 mm,
> extruido 3 000, en E 349 723,696 / N 6 292 883,878 / H 561,466—, así que se puede **generar su
> levantamiento**. `apps/web/scripts/nube-del-muro.py` lo hace: el suelo, las dos caras, las testas
> y el coronamiento, como los vería un escáner puesto al lado, y **corrido 0,240 / −0,150 / +0,075 m
> a propósito**. Traslación pura y sin giro, las dos cosas decididas y escritas: corrido porque una
> nube que ya calza no ejercita nada, y sin giro porque quien señala tres pares con un ratón
> convertiría unos centímetros de puntería en grados.
>
> **Con el par, los dos caben en pantalla a la vez y el muro ocupa media escena** — que es
> exactamente lo que faltaba. Comprobado en la aplicación: los dos abiertos, «Todo» encuadra los
> dos, la ficha de la nube dice `16,0 × 16,0 × 3,0 m` y `declarado · UTM 19S`, y «Empezar a
> señalar» llega a pedir «Pincha el punto en el MODELO».
>
> **Y el corrimiento conocido convirtió la desviación en algo comprobable a mano, que es lo que
> `F2.4` esperaba.** Midiendo el muro contra su levantamiento, tres de las seis cifras caen sobre
> el corrimiento sin margen:
>
> | Cifra   | Vale       | Por qué es esa                                                              |
> | ------- | ---------- | --------------------------------------------------------------------------- |
> | Mediana | **150 mm** | \|ΔN\|: la normal de las dos caras largas, que son la mayoría de los puntos |
> | Sesgo   | **+72 mm** | ≈ ΔH = 75 mm, el coronamiento. Positivo: lo construido por fuera            |
>
> **Y la máxima, 361 mm, pasaba de los 293 que mide la norma del corrimiento.** Quedó escrita como
> pregunta y no como cierre —un punto del levantamiento no puede estar más lejos del muro que lo que
> se corrió la nube, así que o faltaba entender algo o había un defecto—. **Contestada, y faltaba
> entender algo:** en `measureDeviation` la caja se agranda **30 cm a propósito**, porque «lo
> construido se sale de lo modelado», y con ese margen entran a la cuenta puntos **del suelo**, que
> no son del muro. Uno a 30 cm de la esquina está a `√(0,30² + 0,30²) = 424 mm` del triángulo más
> cercano.
>
> Reproducido en Node —`desviacion.test.ts`, midiendo los mismos puntos por separado— y al milímetro:
>
> | Qué se mide | Puntos | Mediana | Máxima     |
> | ----------- | ------ | ------- | ---------- |
> | solo muro   | 10 287 | 150 mm  | **293 mm** |
> | solo suelo  | 288    | 150 mm  | **361 mm** |
> | los dos     | 10 575 | 150 mm  | **361 mm** |
>
> `293` es exactamente la norma del corrimiento y `361` exactamente lo que dijo la aplicación. **La
> medida es correcta y el número invita a leerlo mal**: «máxima 361 mm» sobre un muro se entiende
> como «el muro está 36 cm fuera de sitio», cuando son 288 puntos del suelo de al lado frente a diez
> mil del muro. Es la misma familia que la cifra del calce que se dejó de enseñar el mismo día.
>
> > **Y de paso se corrige una lectura de esta misma nota que era casualidad.** Decía que el
> > percentil 95 —240 mm— «era `|ΔE|`, las testas». No lo es: con otro muestreo de los mismos planos
> > el p95 sale **168 mm**. Depende de **la mezcla de puntos** —cuántos de cada cara entran, y con la
> > nube real eso lo decide el nivel de detalle cargado—, así que no es una constante de la
> > geometría. La mediana y la máxima sí, y son las que la prueba fija.
>
> **Lo que sigue siendo del usuario, y ahora es solo esto:** señalar los tres pares con un ratón. El
> par existe, la pantalla llega a pedir el primer punto, y lo que falta es puntería sobre una
> pantalla de verdad — no un archivo.

Lo que falta:

1. **Señalar pares de puntos** —uno en el modelo, uno en la nube— con la marca dibujada donde se
   pinchó, y poder quitar el último.
2. **El residuo a la vista mientras se señala**: medio y máximo, y **cuál es el punto que peor
   calza**. `calzarConPuntos` ya lo devuelve; nadie lo enseña.
3. **El calce automático cuando se puede**: si el IFC trae emplazamiento, un botón y ya. Y decir por
   qué no se puede cuando no se puede.
4. **La desviación como informe**: elegir un elemento, dar una tolerancia, y ver las seis cifras y la
   nube pintada. Con **la vuelta al ciclo del producto**: abrir una observación sobre ese elemento
   desde ahí, con su desviación dentro.

### `F12.3` — Las herramientas se ven ✅

**Hecha en dos mitades: la primera con `F12.4` el 2026-09-08 y la segunda el mismo día.**

El diagnóstico eran dos cosas, y la primera resultó no ser lo que parecía. **El contraste medía
3,56:1 donde la norma pide 4,5** — pero ese 3,56 era `--color-apagado-fg`, o sea el color de lo
**deshabilitado**, y con la escena vacía los treinta y seis botones lo estaban. Aclararlo habría
hecho más legible una pantalla en la que ninguna herramienta se podía usar; lo que hacía falta era
que la cinta vacía dejara de ofrecer treinta y seis imposibles, que es lo que hizo `F12.4` con el
grupo **«Empezar»**. Con un modelo abierto las etiquetas dan **8,98:1** medidos.

La segunda sí era de forma: **las herramientas pesaban todas lo mismo**. «Órbita» y «Todo» ocupaban
lo que «Sólido» y «Fantasma», y quien abría el programa no tenía por dónde empezar. Ahora hay dos
tamaños, con el criterio de [UX.md](../../../docs/UX.md) —es grande la que abre el modo de trabajo de su
pestaña o es la vuelta segura, como mucho tres por pestaña— y **siete grandes**: Todo · Modo 2D ·
Órbita · Seleccionar · Distancia · Horizontal · Ver todo. Las otras veintinueve son pequeñas **por
defecto**, así que hacer una grande obliga a justificarla contra esa lista.

**Y la altura de la cinta no cambia**, que era la condición: 137,1 → 136,8 px a 830 px de ancho, y
122,1 → 121,8 a 1440. Comparado con `git stash` contra la versión de antes, no contra lo que decía
el documento. El grupo pasó de una fila `flex` a una rejilla de dos filas que fluyen en columnas.

Un número del plan se corrigió midiendo: el pequeño iba a ser de **22 px** de alto —razonado como
22 × 88 = 1 936 = 44²— y **22 incumple el mínimo de 24 × 24 de WCAG 2.5.8**. A 24 × 88 son 2 322 px²
medidos y el alto deja de depender de un razonamiento sobre áreas.

### `F12.4` — El lienzo vacío es una puerta ✅

**Hecha el 2026-09-08.** Eran novecientos por setecientos píxeles con una frase en medio. Los paneles
del navegador **ya lo hacían bien** —«Arrastra un IFC aquí, usa Abrir arriba, o saca uno de Del
registro»— y el lienzo, que es la mayor superficie de la pantalla, decía menos que ellos: nombraba
dos gestos y no ofrecía ninguno, porque el arrastre no se puede pulsar y «Abrir» era un rótulo
apuntando a otro sitio.

Ahora los gestos **son** los controles, y en los dos sitios que tienen que decir lo mismo:
`components/PuertaDeEntrada.tsx` en el lienzo —título a 24 px, **Del registro** primario y **Abrir
del disco**, con el arrastre como texto porque es un gesto y no un botón— y en la cinta un solo
grupo **«Empezar»** con los dos mismos en grande, que es la primera mitad de `F12.3`.

**Lo que solo apareció al probarlo**, y es la parte que valió la tarea:

| Lo que no funcionaba                                           | Por qué                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| La cinta plegada **escondía «Empezar» entero** (46 px, alto 0) | El pliegue se recuerda en el navegador. Existe para dejarle el lienzo al modelo, y sin modelo no protege nada |
| Soltar un archivo **sobre los botones** no cargaba nada        | Los botones son `pointer-events-auto` y están fuera del `canvasHost`: el objetivo era `BUTTON`                |
| «Del registro» abría la sección **dentro de un panel plegado** | Son dos cosas: destapar el panel y desplegar la sección                                                       |
| Pedir la sección **dos veces** solo funcionaba la primera      | La propiedad no cambiaba de valor. Lleva un `sello` que sube en cada petición                                 |

Y una que no era de esta tarea y salió midiendo su botón: **los doce botones primarios del visor
llevaban `text-fg`**, que cambia con el tema, sobre un relleno que no cambia. Con el tema claro
puesto, **1,92:1** — el botón «Abrir» incluido. Ver `--color-sobre-accion` en
[DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md); medido después, 8,26:1 en claro y 6,12:1 en oscuro.

### `F12.5` — El navegador tiene jerarquía ✅

**Hecha el 2026-09-08**, y con ella el rail plegado que `F9.6` había aceptado.

Eran doce secciones plegadas, del mismo tamaño, el mismo color y el mismo peso, todas `h2` en
mayúsculas: DEL REGISTRO, COORDINACIÓN, ESTRUCTURA, CUADROS, MODELOS ABIERTOS, NUBE DE PUNTOS, CALCE,
PLANOS 2D, PLANOS GENERADOS, VISTAS GUARDADAS, VISTAS DEL PROYECTO, MEDICIONES. **Una lista de doce
cosas iguales no es una lista, es un muro** — y con un lector de pantalla eran doce hermanas, o sea
una lista plana de doce.

| Lo que hay ahora                                                                 | Medido                                                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Cuatro grupos —Empezar · Lo abierto · El modelo · Lo guardado—, un `h2` cada uno | 4 `h2` y 12 `h3`: la jerarquía que el ojo ve             |
| Cabecera en caja de frase, con icono a la izquierda y cifra a la derecha         | 35,2 px de alto, las doce iguales                        |
| **Tres tonos**: con contenido, vacía, y sin cifra que se pueda saber             | 14,53:1 · 6,16:1 con «vacío» · 8,98:1                    |
| Rótulo de grupo                                                                  | 6,77:1                                                   |
| **Se abre sola la que acaba de llenarse**                                        | Se suelta un IFC → se abre solo «Estructura»             |
| **Rail plegado** con los doce iconos, su nombre en `aria-label` y su punto       | 49,4 px de ancho · toque 48 × 48 · **+301 px** de lienzo |

**El grupo no es un destino**, que es lo que hace que esto no contradiga `docs/UX.md`: las cuatro
listas siguen a la vez en la misma columna, porque la razón de que estén juntas —comparar el plano
con el modelo encendiendo y apagando de los dos— se rompería al repartirlas.

`SECCIONES` describe cada una **una sola vez**, y de ahí salen el acordeón y el rail. El precio de
los doce bloques a mano no era la repetición: era que añadir una capacidad significaba escribirlo
otra vez, y que no había forma de pintar la misma lista en dos sitios.

**Tres cosas que solo aparecieron mirándolo:**

1. Una sección abierta se encogía a **25,8 px** —menos que su propia cabecera— y su nombre se
   dibujaba encima de la lista vecina.
2. La columna necesita **474 px donde hay 353** y no tenía `overflow`: la última sección se salía
   sin aviso. Que se quede corta es justamente lo que el rail resuelve.
3. Abrir sola **la que se llena** abría dos a la vez con un modelo —«Modelos abiertos» y
   «Estructura»—, y las dos apretadas a su mínimo. Se abre la que se va a mirar.

Y dos números del plan que la pantalla corrigió, los dos por lo mismo: `--spacing` de este proyecto
vale **0,275rem** desde que `F9.2` quitó el `font-size: 110%` de la raíz sin apretar la escala. Así
que `h-4` son 17,6 px y no 16, y el rail mide 49,4 y no 44 — por encima del área de toque, que es lo
que el número protegía. Se deja en la unidad de la escala en vez de escribir píxeles a mano.

#### El 2026-09-09: **los cuatro grupos también se pliegan**

Lo pidió el usuario mirando la columna llena: _«poder colapsar también la sección Empezar, Lo
abierto, para disminuir y tener todo con mayor facilidad… o buscar una forma que ese panel lateral
aproveche la mayor cantidad del espacio y no se vea tan lleno»_.

Y tenía razón con un número detrás: el grupo era **un rótulo y no un botón** —el código lo decía
así, «no se pliega, no lleva `aria-expanded` y no es un destino»—, con lo que las dieciséis filas
del índice eran fijas. Medido en la aplicación con un modelo y un levantamiento abiertos: **308 px
de cabeceras en una columna de 627**, o sea que casi la mitad del panel era índice. Con los cuatro
plegados, **104 px**.

| Decisión                                                       | Por qué                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| El rótulo plegado **lleva la cuenta** — «LO ABIERTO 2»         | Es lo que hace que plegar no sea esconder: se sabe si merece la pena abrirlo sin abrirlo                           |
| **Se recuerda** entre sesiones, al contrario que las secciones | Qué sección hace falta depende de lo que se esté haciendo ahora; plegar un grupo es decir «de esto no me ocupo»    |
| Un grupo **con una sección abierta se dibuja desplegado**      | Sin eso, con «El modelo» plegado abrir un IFC no se vería y «se abre sola la que se llena» sería una promesa vacía |
| Al plegar un grupo **se cierran sus secciones**                | Por la regla anterior, si no, pulsar el rótulo no haría nada visible y parecería roto                              |
| `min-h-6`                                                      | Los 24 px que pide WCAG 2.5.8 para un área de toque; como rótulo costaba 20 y ahora se pulsa                       |

**Comprobado en la aplicación, y no solo el alto:** con los cuatro plegados y recargando, el
navegador arranca en cuatro filas y cero secciones; al soltar el modelo y su levantamiento se
destapan **solo** «Lo abierto» y «El modelo», con sus siete secciones, y «Empezar» y «Lo guardado»
siguen plegados.

**Y un defecto que la medición cazó al momento**, del que una persona pulsando de uno en uno no se
habría enterado: la primera versión calculaba el conjunto nuevo desde el valor del render en vez de
desde el anterior de React, así que dos pulsaciones en el mismo turno partían del mismo conjunto y
la segunda pisaba a la primera. Plegando los cuatro de una vez se plegó **solo el último**.

### `F12.6` — La entrada al portal

Es **la primera pantalla del producto** y la que ve alguien que aún no sabe qué es esto. Hoy tiene el
formulario y, al lado, un panel que explica bien la propuesta —«El modelo, los planos y la obra en la
misma pantalla», con tres pasos numerados—. El texto está; lo que falta es que **entrar** se sienta
como entrar a una herramienta de trabajo.

### `F12.7` — «Portal» no es un título

La portada se titula **`Portal`** y se subtitula «Solo aparece lo que tu rol puede abrir». Eso es el
programa hablando de su propia estructura: nombra el contenedor, no lo que la persona viene a hacer.
Quien entra no viene «al portal», viene a mirar su obra.

Y los módulos se presentan **por lo que son** —una rejilla de tarjetas con su nombre— y no **por lo
que resuelven**. La ayuda de `F11.7` ya tiene escrito el recorrido bueno —«entrar en la obra, abrir
el modelo, mirar y medir, dejar una nota…»— y la portada no lo usa.

> **El nombre lo decide el usuario**, como los tres de `F1.13`. Lo que este plan aporta es el
> argumento: un título dice para qué está la pantalla, y «Portal» dice dónde está el usuario dentro
> del software.

### `F12.9` — La cota lleva su número encima ✅

**Hecha el 2026-09-08.** La trajo el usuario el 2026-09-03 con una captura de **Cyclone 3DR**
midiendo sobre una nube: dos puntos señalados en un pretil, un marcador numerado, y **pegado a la
medida** un recuadro con `Distance 2,693 · Horizontal 2,692 · Vertical 0,071`. «Sumar una opción así
de acotado en general».

**El defecto, dicho en una frase: con tres medidas en el mismo puente, los números de la barra de
abajo no dicen a cuál pertenecen.** Una cota de CAD lleva su valor encima justamente por eso — es lo
que la hace una cota y no una medición suelta. Y en un levantamiento se miden diez cosas seguidas.

Lo que se decidió al hacerla, mirándolo y no razonándolo:

| Decisión                                                    | Por qué                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Dos estados**: corto `#1 · 3,000 m`, largo de tres líneas | Tres líneas en cada cota tapan la nube. Expandida va **solo la última tomada**                                             |
| El ordinal delante con `#`, y **sin reusar huecos**         | Es la convención del CAD y lo que permite decir «la 3» en voz alta. Renumerar rompería una observación que la cite         |
| **Sin `Δ` cuando no hay desnivel** (umbral 1 mm)            | Medir dos puntos del mismo suelo da `1e-7` por el `float32` de la geometría: «Δ 0,000 m» sugiere un dato donde hay un cero |
| Coma decimal y tres decimales                               | El producto está en español y lo que se replantea es el milímetro                                                          |
| Fondo `#1b2a4a` con borde de marca, no fondo violeta        | Blanco sobre `#9b5de5` medía **4,13:1** a 11 px: no pasa AA. Medido ahora: **14,22:1**                                     |

**El texto se escribe en un atributo, no en `textContent`.** La librería de OBF reescribe el
`textContent` de su etiqueta después de cada intento —comprobado de tres maneras—, así que
`packages/viewer/src/index.ts` inyecta una hoja una vez y pinta `data-cota` con un `::after`:
reescribir texto no toca atributos ni pseudoelementos. El texto de la librería queda de respaldo
escondido a `font-size: 0`.

**Cuatro trampas que costaron la tarde, por si vuelven:** para una distancia la etiqueta cuelga de
`line.label.three.element` y no del visual; `onItemAdded` dispara antes de que la librería escriba;
`nextFrame()` no resuelve en la página de diagnóstico porque no hay bucle de render; y **el paquete
se consume desde `dist/`**, así que ningún cambio en el fuente llega al navegador sin
`npm run build --workspace=@aerobim/viewer` — esto escondía los otros tres.

La forma pura está aparte en `packages/viewer/src/cotas.ts` con 14 pruebas
(`metros`, `textoDeCota`, `siguienteOrdinal`), y lo pintado se verifica en
`diag.html?modo=medidas&medida=cotas`, que coloca los puntos por coordenada de mundo en vez de por
clic.

### `F12.8` — La costura ✅

**Hecha el 2026-09-08.** El portal es claro y el visor oscuro, y eso está decidido y bien; lo que no
puede pasar es que se lean como dos programas. `F9.1`–`F9.5` ya habían unificado los tokens de
color, la escala de radios y la de elevación. Faltaba lo que se ve sin medir.

**Y la costura tiene un sitio concreto, que es lo que hizo la tarea corta:** `Origen`, la miga del
visor, es **el único elemento que existe a los dos lados** — el resto del visor no tiene equivalente
en el portal ni al revés. Ahí se leían como dos programas por cuatro detalles, y ninguno era una
decisión: eran dos personas escribiendo lo mismo dos veces.

| Hacía el visor                        | Hace el portal (`.migas`)               |
| ------------------------------------- | --------------------------------------- |
| Separador `/`                         | Separador `›`                           |
| Enlaces en gris con subrayado gris    | Enlaces en el violeta de acción         |
| La revisión, gris y sin papel         | La pantalla actual, `aria-current`, 600 |
| `aria-label` «De dónde viene lo que…» | `aria-label` «Dónde estás»              |

Manda el portal: llegó primero, y su versión es la convención — **una miga termina en dónde estás**,
que es justo lo que le faltaba a ésta. La revisión estaba escrita como una nota al margen cuando es
el nombre de lo que se está mirando.

Y lo que **no** se copió: la primera miga. En el portal la lista empieza en «Portal»; en el visor la
marca está pegada a la izquierda y ya lleva ahí, así que un «Portal» al lado serían dos enlaces al
mismo sitio en la misma línea.

Medido, `CC 741 › 716-LCD-ES-M-001 › rev. A1` a 13 px: enlace 7,80 en oscuro y 8,26 en claro,
«rev. A1» 14,53 y 15,88, separador 6,16 y 5,08. Los tres pasan AA en los dos temas.

**El resto del lenguaje ya había convergido**: los botones, los estados vacíos que enseñan el gesto
y las cabeceras salieron iguales de los bloques 2 y 3 sin tocarse aquí — el portal ganó su cabecera
de página en el bloque 2 y el visor su puerta de entrada y sus cifras por sección en el 3, y las dos
mitades usan el mismo violeta de acción con el mismo texto encima desde `--color-sobre-accion`.

---

### `F12.11` — Una captura adjunta al comentario ✅

**Hecha el 2026-09-08.** El caso que la pide es el del piloto: alguien de la obra encuentra que una
pantalla no hace lo que espera, abre una observación y tiene que **contarla con palabras**. Este
plan dejaba escrito el sorteo mientras no existiera —un entregable `PILOTO-CAPTURAS` con los PNG
sueltos y el correlativo citado a mano en el texto— y eso no es un hilo, son dos sitios.

`Comentario.imagen` guarda **la clave del almacén y nunca los bytes**, igual que
`Observacion.instantanea` y por el mismo motivo. Se acepta **PNG y JPEG** —una captura de pantalla
es PNG y una foto de obra es JPEG— con tope propio de **8 MB**, y **la firma manda** sobre la
extensión y sobre el tipo que declara el navegador, que los escribe quien manda.

| Lo que se decidió                           | Por qué                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ni PDF ni SVG                               | El SVG lleva scripts; un PDF es un **documento**, o sea un entregable con su código |
| El texto sigue obligatorio y la imagen no   | Un comentario es un mensaje y la imagen su prueba                                   |
| `FileField` y no `ImageField`               | `ImageField` pide Pillow y valida más flojo que la firma                            |
| Un adjunto malo **sí se dice**              | Al contrario que la cámara: aquí el archivo lo eligió una persona                   |
| La imagen se sirve por el id del comentario | Una clave de almacenamiento en una URL invita a probar otras                        |

**Y el permiso de esa vista lo corrigió una prueba que falló.** Es `view_observacion` y no
`view_comentario`, aunque lo que se sirve cuelgue de un comentario: la ficha del hallazgo dibuja el
hilo entero a quien puede ver la observación, sin pedir `view_comentario` por separado, así que con
el permiso más estricto esa misma persona vería el hilo con **las imágenes roras**. Una vista más
severa que la pantalla que la usa no protege nada.

Medido contra el servidor real, mandando el `multipart` de verdad: `POST 200`, la observación pasa
de «Abierta» a «Respondida», la imagen sale dentro del mensaje a 478 × 165 de 520 × 180 naturales
con tope de 220 px de alto, y el `GET` de la imagen devuelve `image/png` sin `Content-Disposition`.
En los dos temas.

**Lo que no hace, y lo dice la propia pantalla:** el adjunto **no viaja en el BCF**. Un BCF lleva la
imagen del _tema_ y no las del hilo, así que la nota debajo del campo lo advierte en vez de que
alguien lo descubra cuando el mandante no la encuentre.

### `F12.14` — Coordinar sobre la nube sin esperar al modelo ✅

**La trajo el usuario el 2026-09-08**, y el argumento es el que decide la tarea: «la nube de puntos
nos servirá o se podrá realizar el tema de coordinación, dejar notas y hacer todo el flujo, también
la nube de puntos, **debido que el IFC o el avance siempre es un paso más adelante**».

O sea: **en obra el levantamiento llega antes que el modelo.** Se vuela y se mide lo construido
semanas antes de que exista el IFC de esa etapa. Un visor que exige un modelo para hacer algo deja
la nube en «abrirla para mirarla», y eso es lo que había — medido con la nube sola en la escena:
**los quince botones de la pestaña Vista apagados, cero vivos.**

Cuatro huecos, y los tres primeros eran el mismo: «hay algo en la escena» estaba escrito como «hay
un modelo o un plano», que es la tercera vez que ese hueco aparece —ya había pasado con el DXF—.

| Lo que no se podía       | Por qué                                                                        | Medido después                                              |
| ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Usar ninguna herramienta | `enabled` no contaba la nube                                                   | 10 vivos y 5 apagados, los cinco que sí necesitan otra cosa |
| Encuadrar                | `frameAll` unía modelos y planos, no la nube                                   | El cubo estaba encendido y ahora además mueve               |
| Medir                    | `snapAt` va contra `fragments`; `pickPointCloud` existía y no lo llamaba nadie | `Directa 26,403 m` con dos clics, sin modelo                |
| Anotar                   | `sePuedeAnotar` exigía `selected.guid`                                         | Ficha del punto y nota anclada a la coordenada              |

**El ancla la decidió el usuario: la cámara, la foto y la coordenada, las tres.** Se guarda en tres
columnas propias —`ancla_nube_x/y/z`— y no en las del PDF más una: aquellas son la posición dentro
de una hoja y éstas son metros del sistema del archivo. Y son las **del archivo** y no las de la
escena, que es el dato del topógrafo y el que se puede volver a replantear.

`ancla` gana el valor `"nube"`, y el GUID le gana al punto: una observación de desviación nace sobre
un elemento _y_ tiene un punto medido, y lo que la identifica es el elemento.

**Dos cosas que valieron la tarea:**

1. **El tope que casi descartó cada punto real.** `punto.py` no reusa `camara.LEJOS_M` —mil
   kilómetros— porque el eje norte de UTM en Chile ronda los 6,3 millones de metros: reusarlo habría
   descartado en silencio cada punto de cada levantamiento, con la nota guardándose «bien» y sin
   decir dónde. Hay una prueba que lo fija.
2. **El punto viaja en el BCF aunque el BCF no sepa decirlo.** Un `Viewpoint` dice una cámara, una
   foto y unos GUID seleccionados; para un punto de una nube no hay elemento al que apuntar. Así que
   la coordenada se escribe también en el `Description` —`E 345.678,90 · N 6.298.123,45 · Z 412,30`,
   detrás del texto de la persona y sin tocarlo— y entonces llega a Solibri, a Navisworks y a un PDF.

**Lo que queda para el piloto:** el ciclo completo contra el servidor real. Aquí están comprobados
los dos lados por separado —el visor manda lo correcto, el registro lo acepta— y los dos con
pruebas, pero el POST se interceptó para leerlo porque no hay Django delante.

#### El 2026-09-11: **el punto que se anclaba no era un punto de la nube**

El usuario lo dijo el 2026-09-10 —«está fallando al pickear el punto al que quiero dejar» la nota— y
se contestó a medias. Se arregló un defecto de criterio cierto (se tomaba el más cercano a la cámara
de entre los que rozan la línea de visión, no el que está bajo el cursor) y se dejó escrito que la
relación con el síntoma **no estaba reproducida**: revirtiendo el arreglo, el diagnóstico daba lo
mismo, «0,0 px del cursor» con los dos criterios.

**Esa coincidencia era el síntoma.** `THREE.Points.raycast` devuelve en `point` el pie de la
perpendicular **sobre el rayo** —`_ray.closestPointToPoint(vertice, intersectPoint)` en `testPoint`—
y el vértice solo se recupera por `golpe.index`. Dos consecuencias:

1. **La coordenada que guardaba la nota no pertenecía al levantamiento**, corrida hacia la línea de
   visión tanto como permitiera el umbral. Sobre el Camino Agrícola, **0,5915 m**. No se ve de
   frente, porque por construcción cae bajo el cursor; se ve al orbitar y se ve en la coordenada.
2. **El criterio de píxeles recibía datos degenerados.** En un ensayo de tres puntos a 20 m, los tres
   candidatos proyectaban a `(800,0 · 450,0)` —el cursor exacto— mientras sus vértices caían a 800,
   819,5 y 846,8 px. Con todo a cero, el filtro degeneraba en «el de delante». Por eso revertir no
   cambiaba nada.

Arreglado con `verticeDelGolpe`, usado para las dos cosas. Medido sobre los 15 366 674 puntos reales,
con el arreglo y revirtiéndolo:

|             | distancia al vértice más cercano | px del cursor |
| ----------- | -------------------------------- | ------------- |
| Como estaba | **0,5915 m — NO (mal)**          | 0,0           |
| Arreglado   | **0,0000 m — sí**                | 5,9           |

**Y las dos lecciones de oráculo, que son lo que se lleva a la próxima:**

- El modo `nube` medía **píxeles del cursor**, y esa cifra no podía ver el defecto: un punto sobre la
  línea de visión siempre da cero. La pregunta que sí lo ve es de metros y contra los datos —**¿lo
  devuelto ES un punto de la nube?**—, y ya está en el modo.
- La prueba de unidad del criterio usaba candidatos **escritos a mano**, así que un criterio correcto
  alimentado con datos degenerados le pasaba por delante. El bloque nuevo de `senalar.test.ts` lanza
  el rayo de verdad de Three sobre una nube de verdad.

### `F12.13` — El levantamiento entra al expediente ✅

**Hecho el 2026-09-07.** Hasta hoy la nube solo se abría arrastrando un archivo al lienzo: el
levantamiento —que es un entregable de obra, con su topógrafo y su fecha— quedaba fuera del
registro, sin correlativo, sin idoneidad y sin nadie que pudiera decir cuál es la versión vigente.

Tres cosas, y las tres medidas sobre el COPC real del CC 741 (`camino-agricola.copc.laz`,
**130.795.022 bytes**):

1. **Entra.** `.las` y `.laz` se aceptan con la firma `LASF`, la que declara la especificación y
   llevan las tres variantes. Se acepta el `.las` original y no solo el COPC porque **es lo que
   entrega un topógrafo**: rechazarlo obligaría a archivar solo la copia convertida. El tope de
   200 MB **se revisó y se mantiene**: el COPC diezmado a 3 cm son 124,7 MB y cabe; los 3,37 GB del
   original no, y eso es correcto —`nginx` lleva el mismo tope (`docs/DEPLOY.md:167`)—.
2. **Se ofrece abrir solo lo que el visor sabe leer.** Un `.copc.laz` sí, un `.laz` suelto no: el
   visor lee COPC, y un LAZ normal no lleva el octree dentro. Y **no se distinguen por la
   extensión** —`Path("x.copc.laz").suffix` es `.laz`—, así que se mira el nombre entero. El
   original se archiva y se descarga igual; lo que no se ofrece es abrirlo.
3. **Se sirve por tramos.** `apps/documents/rangos.py`: `Range` → `206`, con `Accept-Ranges` en las
   dos respuestas y `416` con el tamaño real cuando se pide más allá del final. Sin esto el diseño
   del COPC se caía del lado del servidor: `FileResponse(iter([contenido]))` tenía el archivo
   **entero en memoria** y el navegador descargaba 124,7 MB antes de ver el primer punto.

**Medido en el navegador, con la nube abierta desde el expediente** (`/documentos/entregables/…` →
«Abrir en el visor», lienzo de 739 × 754 px):

| Qué                     | Medida                                                  |
| ----------------------- | ------------------------------------------------------- |
| Peticiones de tramo     | 62, todas `206`                                         |
| Bytes traídos           | 33,6 MB = **26,9 %** del archivo                        |
| Primer tramo respondido | 617 ms                                                  |
| Ficha de la nube        | 97,4 × 143,5 × 17,0 m · UTM 19S **declarado** dentro    |
| Nodos                   | 45 en escena · 439 fuera de vista · 803 sin presupuesto |

**Y un fallo que esto sacó, que no era de este requisito.** `laz-perf` se pedía en
`/wasm/laz-perf.wasm`, absoluto desde la raíz: eso funciona en el servidor de Vite, donde la
aplicación vive en `/`, y **daba 404 bajo `/visor/`**. O sea que la nube **nunca se había abierto
desde el portal** — solo desde el disco en desarrollo. `GET /wasm/laz-perf.wasm → 404` y
`Aborted(Both async and sync fetching of the wasm failed)` en la barra, con los tramos ya
respondiendo `206`. Es **la misma trampa que ya costó una sesión con `web-ifc`** y que `App.tsx:201`
tiene documentada: la nube se quedó sin arreglar. Ahora pasa `rutaWasm` calculado con
`import.meta.env.BASE_URL`, y se sirve de `/static/visor/wasm/laz-perf.wasm`.

29 pruebas del rango (la aritmética por tabla, y los tramos seguidos pegados contra el archivo
original) + 13 de la nube en el expediente.

---
