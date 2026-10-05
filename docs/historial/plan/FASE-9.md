# Fase 9 — Sistema de diseño y accesibilidad

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 9 — Sistema de diseño y accesibilidad

**Agregada el 2026-09-01 a pedido del usuario**, después de una revisión de diseño que midió
los contrastes sobre el código en vez de estimarlos. El detalle vive en
[docs/DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md).

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
| `F9.4` | **Las acciones dejan de esconderse**: fuera `opacity-0 group-hover`, áreas de toque a 44 px           | ✅ ver abajo |
| `F9.5` | **Estados vacíos con puerta de entrada**, y escala de radio y elevación compartida con el portal      | ✅ ver abajo |
| `F9.6` | **Reordenar el shell del visor** — _decidida y escrita en `docs/UX.md` el 2026-09-07_                 | ✅           |

### `F9.4` y `F9.5` cerradas el 2026-09-03, y la mitad ya estaba hecha

**Las dos filas llevaban cifras de agosto que no se sostenían.** Medido hoy:

- **`opacity-0 group-hover`: cero apariciones.** La fila decía cinco; desaparecieron con `F9.1`–
  `F9.3`. No había nada que arreglar.
- **Los estados vacíos ya enseñan el gesto**, comprobado abriendo los paneles en el navegador:
  «Todavía no hay ningún modelo abierto. Arrastra un IFC aquí, usa Abrir arriba, o saca uno de Del
  registro», «Ninguno. Con dos modelos abiertos, esta lista es donde se apaga uno para mirar el
  otro — que es en lo que consiste coordinar». Eso es una puerta de entrada, no un «no hay nada».

> **Y una trampa que casi me hace informar treinta y un defectos inexistentes.** La primera medición
> de áreas de toque dio «31 de 31 por debajo de 44 px, cinco de solo 18 px de ancho». Eran falsas:
> **el panel del navegador tenía el viewport a 0 × 0**, así que el diseño estaba colapsado y los
> botones salían recortados a 18 px. Con un tamaño en píxeles forzado, la foto es otra. Es la misma
> trampa del lienzo de `diag.html`, y la lección se repite: **medir sobre un viewport de cero mide el
> cero**.

**Lo que sí había, medido con 1600 × 900 de verdad:**

|                                         | Antes       | Ahora        |
| --------------------------------------- | ----------- | ------------ |
| Por debajo de **24 px** (WCAG 2.5.8 AA) | **0**       | 0            |
| Por debajo de 44 px                     | 31 de 31    | **16 de 31** |
| Las quince herramientas de la cinta     | 62 × **42** | 62 × **48**  |
| Las tres pestañas                       | × 33        | × 40         |
| Los dos botones de panel                | × 27        | × 35         |
| Plegar la cinta                         | 24 × 24     | 35 × 35      |

**La norma AA ya se cumplía entera**; lo que faltaba era el objetivo de 44, y la mejora más barata
costaba **dos píxeles**: los quince botones de herramienta estaban a 42.

> **Lo que NO se subió a 44, y es una decisión que puede revisar el usuario:** las nueve cabeceras de
> sección del navegador (345 × 31) y el enlace del logo (109 × 31). Son objetivos **anchos** —hay 345
> píxeles donde pinchar— y llevarlos a 44 de alto añadiría **117 px de cromo** en un panel donde lo
> que importa es el contenido, contra la densidad que el usuario fijó midiendo en su pantalla. Si
> prefiere el 44 estricto, es un cambio de una línea.

**Y la escala compartida, que era el resto de `F9.5`:** el visor ya tenía `--radius-sm/md/lg` y
`--shadow-sm/md/xl`; **el portal tenía siete radios a mano** —2, 3, 4, 6, 7, 8 y 9 px en dieciséis
sitios— junto al token de 12. Nadie eligió que una etiqueta tuviera 3 px y otra 4. Ahora hay cuatro
escalones, los mismos del visor, y **cero valores sueltos**: comprobado en el navegador, el portal
solo pinta 10 px, 12 px y la píldora de 999.

Y de paso, un defecto que apareció al tokenizar: **la sombra de la tarjeta levantada estaba escrita a
mano con el azul del tema claro**, así que en tema oscuro no se veía. Ahora es `--ab-shadow-alto`,
con su valor en cada tema.

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

**Y `F9.2` tenía una consecuencia que no estaba dicha.** [index.css:40-46](../../../apps/web/src/index.css)
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

**Con esto la Fase 9 quedó cerrada salvo `F9.6`**, que era una decisión del usuario y eran tres.
**Las contestó el 2026-09-07** y la fase cierra entera: ver más abajo.

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

### `F9.6`: estaba bloqueada, y el 2026-09-07 se decidió

> **Las tres decisiones, tomadas.** El usuario las respondió al aprobar el plan de la Fase 12:
>
> | Propuesta                             | Decisión                                                               |
> | ------------------------------------- | ---------------------------------------------------------------------- |
> | Herramientas flotando sobre el lienzo | **Rechazada** — sigue en pie «nada permanente flota»                   |
> | Propiedades como tarjeta anclada      | **Rechazada** — sigue siendo panel fijo                                |
> | El navegador repartido en un rail     | **Aceptada como estado plegado** del mismo navegador, no como destinos |
>
> La tercera es la que cambia algo, y lo cambia poco: el rail **no** reparte el contenido en siete
> sitios, es el mismo acordeón a 44 px. Así que la regla de crecimiento —«una capacidad nueva es una
> sección del navegador»— **se conserva**, que era lo que la propuesta original rompía.
>
> **Y cerrada el 2026-09-07**, escribiéndolo donde tenía que escribirse: `docs/UX.md` recoge las
> tres decisiones, reescribe la regla 3 —lo permanente no flota, lo transitorio sí, con sus cuatro
> condiciones—, agrupa las doce secciones del navegador en cuatro, y añade «Qué pesa cada
> herramienta» y «Tema». La regla del propio documento era que si se acepta alguna **se reescribe
> ahí primero y se toca el código después**; eso es lo que se ha hecho, y por eso `F9.6` cierra
> antes de que el bloque 3 toque una línea de `apps/web`.

Lo que la revisión había propuesto: barra de aplicación con migas compartida con el
portal, **rail de siete secciones** en vez del acordeón del navegador, **herramientas flotando
sobre el lienzo** con las opciones de la activa desplegándose debajo, y **propiedades como
tarjeta anclada a la selección** en vez de panel fijo.

Eso choca de frente con tres decisiones ya escritas en [docs/UX.md](../../../docs/UX.md):

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
