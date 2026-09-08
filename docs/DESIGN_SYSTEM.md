# Sistema de diseño de AeroBim — un solo juego de tokens para las dos mitades

> **Qué es esto.** Los colores, los tamaños de letra, los espaciados y los estados que usan
> el portal y el visor. Escrito el 2026-09-01 después de una revisión de diseño que midió
> los contrastes reales del código, no los estimó.
>
> **Complementa a [UX.md](UX.md), no lo reemplaza.** UX.md dice **qué zonas hay y qué entra
> en cada una**; este documento dice **con qué se pintan**. Donde los dos hablen de lo mismo,
> manda UX.md.

## El hallazgo que lo justifica

**AeroBim tiene hoy dos sistemas de diseño, y solo uno está hecho.**

El portal (`services/api/static/css/app.css`) lleva un sistema cuidado: tokens con nombre
semántico, **el ratio de contraste anotado al lado de cada color**, tema claro y oscuro,
`:focus-visible`, estilos de impresión y píldoras de estado que no dependen solo del color.
Ya distingue el violeta de marca del violeta de acción, y deja escrito por qué.

El visor (`apps/web/src`) no usa nada de eso. En su lugar hay **veinte pasos de
`white/NN`**, ningún token semántico, ningún estilo de foco, ningún tema y ninguna regla de
impresión. Son dos vocabularios distintos, y el usuario cruza la costura cada vez que abre
un modelo desde el expediente.

Casi todo lo demás es consecuencia. La disciplina ya existe en la casa; lo que falta es que
llegue al visor.

## Lo medido, para no discutirlo de nuevo

Contrastes calculados con la fórmula de WCAG 2.1 sobre `#18243c`, que es el fondo real de
los paneles del visor (`bg-ink/50` compuesto sobre `--color-shell`). El mínimo AA para texto
normal es **4,5:1**.

| Clase                   |    Usos | Ratio    | Dónde duele                                                    |
| ----------------------- | ------: | -------- | -------------------------------------------------------------- |
| `text-white/30`         |      31 | **2,67** | Rótulos de grupo de la cinta, a 9,9 px. El peor par posible    |
| `text-white/35`         |      25 | **3,15** | Estados vacíos y notas al pie de cada panel                    |
| `text-white/40`         |      22 | **3,68** | Iconos de lista, rótulos de la barra de estado                 |
| `text-white/45`         |      11 | **4,28** | Se queda a un pelo, y nadie eligió ese pelo a propósito        |
| `text-brand` `#9b5de5`  |      24 | **3,75** | Cabeceras de sección. El portal ya usa otro violeta para texto |
| blanco sobre `bg-brand` |      10 | **4,13** | El botón `Abrir`: la acción principal no pasa AA               |
| `border-white/10`       |      20 | **1,36** | Sostiene la estructura del shell y prácticamente no se ve      |
|                         | **123** |          | usos de texto por debajo del mínimo, en 22 archivos            |

> **Dos cifras y no una** (comprobado el 2026-09-02, al ir a ejecutar la fase). Los **123** de
> arriba son los usos de **texto** que no pasan AA, que es el problema. Las apariciones de
> `white/NN` **en total** —contando bordes y fondos, que no son un problema de contraste pero sí
> hay que traducirlas— son **230**, en 17 archivos. El oráculo de `F9.3` es el segundo número.

Y dos cosas que no son contraste:

- **Cero coincidencias de `focus` en `apps/web`.** Quien navega con tabulador no sabe nunca
  dónde está. El portal sí lo tiene, en `.tarjeta:focus-visible`.
- **`html { font-size: 110% }` es el síntoma, no el arreglo.** Hay dos tokens por debajo de
  11 px (`--text-nota` 0,62rem y `--text-micro` 0,56rem) y la raíz subida para compensarlos.
  Eso agranda también la cinta, que es de lo que menos sobra. La escala está mal calibrada;
  el zoom no la calibra.

  > **Con un matiz que hay que respetar** (2026-09-02). Ese 110% no es un descuido: salió de dos
  > mediciones del usuario en su pantalla, y está documentado en `index.css`. Y **toda la escala de
  > Tailwind está en `rem`**, así que bajar la raíz encoge también paddings, altos y huecos un 10%.
  > Quitar el zoom sin más no calibra la escala: la aprieta. Se quita **y** se sube `--spacing` de
  > 0,25rem a 0,275rem, de forma que la unidad de espaciado siga midiendo los mismos 4,4 px. Ver
  > `F9.2` en `MASTER_PLAN.md`.

## Color

**No es una paleta nueva.** Es la del portal, extendida con las superficies oscuras que el
visor necesita. Los nombres siguen el prefijo `--ab-` que ya usa `app.css`.

### Superficies

Opacas y con nombre, en vez de blanco translúcido. Entre un plano y el siguiente hay 1,1:1,
que es deliberado: **los planos se separan con borde y sombra, no con luminancia**, porque
no compiten por atención — solo se ordenan.

| Token                 | Oscuro    | Claro     | Para qué                                                                                                                                   |
| --------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--ab-shell`          | `#101725` | `#f4f7fb` | El hueco alrededor del lienzo / la página                                                                                                  |
| `--ab-surface`        | `#18202f` | `#ffffff` | Paneles, barras, tarjetas                                                                                                                  |
| `--ab-surface-2`      | `#202939` | `#f8fafc` | Elevado: popover, fila activa, cabecera                                                                                                    |
| `--ab-surface-3`      | `#2a3446` | `#eef2f7` | Hover y campos de texto                                                                                                                    |
| `--ab-border`         | `#2e3a4e` | `#dbe3ee` | Separa bloques del mismo plano                                                                                                             |
| `--ab-border-control` | `#71809c` | `#7f8b9e` | Contorno de campo — 3:1 mínimo, lo pide WCAG 1.4.11 · **el claro decía `#b3bfd0` y daba 1,86:1; corregido el 2026-09-07 al implementarlo** |
| `--ab-track`          | `#2a3446` | `#e6ecf4` | El fondo de una barra de avance                                                                                                            |

### Texto

Tres niveles, y **el más apagado sigue pasando AA**. Sustituyen a los 89 usos de
`white/30` a `white/45`.

| Token         | Oscuro    | Ratio  | Claro     | Ratio  |
| ------------- | --------- | ------ | --------- | ------ |
| `--ab-text`   | `#eef2f8` | 14,5:1 | `#172238` | 15,9:1 |
| `--ab-text-2` | `#b6c1d2` | 9,0:1  | `#4f5b72` | 6,8:1  |
| `--ab-text-3` | `#93a0b4` | 6,2:1  | `#626f85` | 5,1:1  |

### La marca deja de ser el color de acción

Es la regla que `app.css` ya escribió y que el visor nunca aplicó. **El violeta de marca
pinta; el violeta de acción se lee.** Y hay una razón propia del visor: `SELECTION_COLOR`
en `packages/viewer/src/index.ts` es `0x9b5de5`, así que si el botón encendido también es
violeta, el elemento seleccionado compite con el chrome que lo rodea. Es el mismo
razonamiento que ya llevó el marcador de ajuste al amarillo (UX.md, 2026-08-26).

| Papel               | Oscuro                   | Claro                    | Regla                                                                                                               |
| ------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `--ab-brand`        | `#9b5de5`                | `#9b5de5`                | Logo, barra de acento de 2 px, icono decorativo junto a un rótulo, selección en la escena. **Nunca texto** (3,96:1) |
| `--ab-action`       | `#7a3fce` (blanco 6,1:1) | `#5b3a9e` (blanco 8,3:1) | Relleno del botón primario                                                                                          |
| `--ab-action-hover` | `#8b52dd`                | `#472d7d`                |                                                                                                                     |
| `--ab-action-press` | `#6b34bd`                | `#3a2466`                |                                                                                                                     |
| `--ab-accent`       | `#c3a6f0` (7,8:1)        | `#5b3a9e` (8,3:1)        | Enlaces, iconos activos, **el anillo de foco**                                                                      |
| `--ab-accent-hover` | `#d5c2f6`                | `#472d7d`                |                                                                                                                     |
| `--ab-sobre-accion` | `#ffffff`                | `#ffffff` (el mismo)     | **El texto que va encima de los tres rellenos de arriba**, y el único color que no cambia con el tema               |

`--ab-accent` en oscuro no es un color nuevo: es el `--ab-primary` que `app.css` ya define
para su tema oscuro.

**Por qué el texto de la acción es un token y no `--ab-fg`.** Las tres filas de acción decían
«blanco 6,1:1» y «blanco 8,3:1» desde el 2026-09-01, y aun así los doce botones primarios del visor
escribían `text-fg` — que **sí** cambia con el tema. Medido en el navegador el 2026-09-08, con el
tema claro puesto: **1,92:1**, negro sobre violeta oscuro, incluido el botón «Abrir» de la barra. El
relleno es la marca y la marca no se aclara, así que su texto tampoco puede cambiar.

Y es **blanco puro**, no el `#eef2f8` de `--ab-fg`: ese fue el primer valor y da **4,30:1 sobre
`--ab-action-hover`**, o sea que el botón salía de AA justo mientras el ratón está encima. Es el
único blanco puro del sistema.

El gate lo vigila de dos formas, porque el defecto era invisible para la que había: mide
`sobre-accion` contra los tres rellenos **en los dos temas** —el bloque de contraste medía los
textos contra las _superficies_, y un relleno no es una superficie, así que nada los cruzaba— y
prohíbe la forma exacta que tenía el defecto, `bg-action text-fg`. `bg-action/NN` sí lleva `text-fg`:
una tinta al 30 % sobre un panel sigue siendo el panel.

### Estado, con forma además de color

Hoy conviven `red-400`, `rose-300`, `amber-200/80`, `amber-300`, `emerald-300` y tres grises
de Tailwind. Son cuatro, y **siempre llevan texto** — uno de cada doce hombres no distingue
rojo de verde, que es el argumento que `.pildora` ya tiene escrito en `app.css`.

| Token         | Oscuro    | Ratio | Claro     | Ratio |
| ------------- | --------- | ----- | --------- | ----- |
| `--ab-ok`     | `#5fd3ae` | 8,9:1 | `#0f7a5f` | 5,3:1 |
| `--ab-warn`   | `#f0b45e` | 8,9:1 | `#8a5a12` | 5,9:1 |
| `--ab-danger` | `#f08a97` | 6,8:1 | `#c53b4d` | 5,1:1 |
| neutro        | `#93a0b4` | 6,2:1 | `#626f85` | 5,1:1 |

### Deshabilitado, y la tinta del lienzo

| Token              | Valor     | Nota                                                                                                                                                                  |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ab-disabled-bg` | `#232c3d` |                                                                                                                                                                       |
| `--ab-disabled-fg` | `#6b7689` | **3,6:1** —el documento decía 3,1 y la prueba lo corrigió—. No necesita pasar AA —declara que no se puede usar— pero sí leerse                                        |
| `--ab-canvas-ink`  | `#1b2a4a` | 11,5:1 sobre el cielo `#dfe8f5`. Lo que se dibuja **sobre** el modelo: la línea de una cota, la etiqueta de un eje. No es chrome, así que no vive en la escala oscura |

El cielo del lienzo (`#dfe8f5`) y la paleta ACI de los planos **no se tocan**: son la
superficie de trabajo y los colores del CAD, no interfaz.

## Tipografía

**La raíz vuelve a 16 px** y desaparece el `font-size: 110%`. El suelo del sistema son 11 px,
y solo en mayúsculas con tracking.

| Token        | px  | Para qué                                                        |
| ------------ | --- | --------------------------------------------------------------- |
| `--fs-micro` | 11  | Rótulo de grupo, en mayúsculas con `letter-spacing`             |
| `--fs-xs`    | 12  | Barra de estado, metadatos, nombre bajo un icono de herramienta |
| `--fs-sm`    | 13  | Cuerpo de panel, filas de lista, tabla de propiedades y psets   |
| `--fs-base`  | 15  | Cuerpo del portal y cualquier texto que se lea seguido          |
| `--fs-lg`    | 17  | Título de tarjeta y de sección                                  |
| `--fs-2xl`   | 24  | Título de pantalla                                              |

Dos familias, declaradas igual en las dos mitades:

- **Interfaz:** `system-ui, "Segoe UI", sans-serif`. Hoy el visor y el portal difieren en un
  valor de la pila y nadie sabe por qué.
- **Cifras y códigos:** `ui-monospace, "Cascadia Mono", Consolas, monospace` con
  `font-variant-numeric: tabular-nums`. Cotas, áreas, GUID y códigos ISO 19650 se leen en
  columna.

## Espaciado, radio y elevación

- **Espaciado:** 4 · 8 · 12 · 16 · 24 · 32 · 48.
- **Radio:** `--r-sm: 6px` (controles) · `--r-md: 10px` (tarjetas y popovers) ·
  `--r-lg: 12px` (tarjeta del portal — es el `--ab-radius` que ya existe).
- **Elevación:** `e-0` en plano (solo borde) · `e-1` `0 1px 2px rgb(0 0 0 / 30%)` ·
  `e-2` `0 8px 24px -6px rgb(0 0 0 / 45%)` · `e-3` `0 20px 48px -12px rgb(0 0 0 / 60%)`.
  En claro se conserva el `--ab-shadow` del portal.

## La marca, y por qué va sobre placa clara

`aerobim-mark.svg` —el dron sobre el cubo isométrico— está dibujado con trazo `#9B5DE5` y **relleno
`#1B2A4A`**, y ese relleno es el mismo hexadecimal que `--ab-navy` / `--color-ink`. O sea que **está
dibujado para fondo claro y el producto es oscuro**. Medido contra las tres superficies donde
aparece:

| Dónde aparece                        | Trazo violeta | Relleno `#1B2A4A` |
| ------------------------------------ | ------------- | ----------------- |
| Cinta del visor, `#18202f`           | 3,96:1        | **1,15:1**        |
| Barra del portal, `#1b2a4a`          | 3,45:1        | **1,00:1**        |
| Tarjeta de ingreso oscura, `#1b2432` | 3,79:1        | **1,10:1**        |
| Sobre blanco                         | 4,13:1        | 14,22:1           |

**El trazo aguanta —los tres pasan el mínimo de 3:1 de un gráfico no textual— y el relleno
desaparece**: el cuerpo del dron y las caras del cubo quedan como agujeros y llega media marca. En
la cinta del visor eso venía pasando desde el primer día.

**La regla, entonces: la marca va siempre sobre una placa clara** —blanco, radio 6–8 px, 3 px de
aire— en las tres pantallas, para que sea la misma marca y no tres. La placa vive en el CSS de cada
pantalla y **no en el archivo**, porque el archivo lo comparten el portal y el visor: cambiar el SVG
arreglaría un sitio y rompería el otro.

**Y queda una decisión que no es de diseño de pantalla sino de marca**, así que la deja escrita en
vez de tomarla: si el relleno del dibujo pasara a un tono que funcione sobre oscuro, la placa
dejaría de hacer falta y la marca se integraría en la barra en vez de posarse encima. Eso lo decide
quien es dueño de la marca.

## Foco y áreas de toque

**Una regla global, y es la que el portal ya tiene:**

```css
:focus-visible {
  outline: 2px solid var(--ab-accent);
  outline-offset: 2px;
}
```

Áreas de toque: `--control-h: 32px` (denso) · `--control-h-md: 40px` · `--touch-min: 44px`.
Nada pulsable por debajo de 44 px **de área** — un control de 32 px de alto la alcanza con
relleno transparente, así que la densidad no se paga con el dedo. Hoy los botones de la cinta
son 56 × 38 y los iconos de lista 14 px dentro de filas de 26.

**Y las acciones dejan de esconderse.** El patrón `opacity-0 group-hover:opacity-100` de
cerrar modelo, borrar cota y borrar vista no existe para el teclado, no existe en táctil, y
aparece bajo el dedo justo cuando el cursor pasa por encima. Van siempre visibles, apagadas,
y se encienden al acercarse.

> **Y esto es donde no se copia a Asana**, decidido el 2026-09-07 al mirar su interfaz como
> referencia. Asana esconde las acciones de una fila en el hover, y le funciona: tiene una lista por
> pantalla en un monitor ancho. Aquí no — un rol acotado no sabe que existen, y en un táctil nada
> pasa el ratón.
>
> **De Asana se toma la calma, no el escondite**, y se consigue con tres reglas que sí se pueden
> comprobar: **una sola acción por fila**, en tono apagado; las de conjunto a la cabecera; y **nada
> aparece ni cambia de tamaño** al pasar por encima, que es lo que obliga a apuntar dos veces.
> `apps/documents/tests/test_observaciones_lista.py` lo fija sobre la lista de hallazgos.

## Dónde vive esto, y quién lo comprueba

**Este documento es la tabla normativa; el código es su implementación.** La implementan **dos**
archivos: [`apps/web/src/index.css`](../apps/web/src/index.css) en el visor, con los `--color-*` que
Tailwind convierte en utilidades, y
[`services/api/static/css/app.css`](../services/api/static/css/app.css) en el portal, con los
`--ab-*`. Los nombres cambian en dos sitios del visor y solo por legibilidad de la utilidad:

| Aquí                  | En el visor        | Por qué                                    |
| --------------------- | ------------------ | ------------------------------------------ |
| `--ab-text` `-2` `-3` | `--color-fg` …     | `text-text-2` no se puede leer             |
| `--ab-border`         | `--color-borde`    | `border-border` tampoco                    |
| `--ab-disabled-*`     | `--color-apagado*` | Igual                                      |
| `--ab-canvas-ink`     | `--color-ink`      | Ya existía con ese nombre, y con ese valor |

**El portal tiene su propio gate desde el 2026-09-07** (`F12` bloque 2):
`apps/core/tests/test_sistema_de_diseno.py` **lee `app.css`** y lo mide con el oráculo que ya
existía en `apps/projects/color.py` —la misma fórmula de WCAG 2.1 y la misma constante que
`contraste.ts`, escritas para colorear las etiquetas de disciplina—. No se portó nada: **un oráculo
que es código de la prueba mide su propio error.**

> **Lo que encontró en su primera corrida**, y por eso hace falta:
>
> 1. **`--ab-track` se usaba y no estaba declarado.** La pista de la barra de avance no se pintaba
>    —`rgba(0,0,0,0)` medido en el navegador—, y una obra realmente al 0 % no mostraba nada.
> 2. **El contorno de los campos daba 1,24:1 en claro y 1,17:1 en oscuro**, contra los 3:1 de WCAG
>    1.4.11. Este documento lo pedía y el portal no lo cumplía.
> 3. **Tres tokens declarados sin un solo `var()`**: `--ab-control-height`, `--ab-sidebar-width` y
>    `--ab-shell`.
> 4. **Y una costura ya rota**: `--ab-shell` decía en su comentario «= `--color-shell`» y valía
>    `#161f2d` contra el `#101725` del visor. Nadie lo veía porque el token no pintaba nada.
>
> Ese cuarto punto es el motivo de que la duplicación **ya no sea aceptable como estaba escrita**:
> un comentario que promete igualdad no impide que uno de los dos cambie. Ahora hay una prueba que
> compara los hexadecimales de los dos archivos, y `--ab-navy` y `--ab-violet` no pueden separarse
> de `--color-ink` y `--color-brand` sin que el gate lo diga.

**Y los ratios de este documento son una prueba, no una afirmación.**
`packages/bim-core/src/color/contraste.ts` implementa la fórmula de WCAG 2.1 —con los vectores
conocidos de la norma fijándola— y `sistemaDeDiseno.test.ts` **lee `index.css`** y comprueba cada
par: los tres niveles de texto y los cuatro de estado sobre las cuatro superficies, el blanco sobre
los tres rellenos de acción, el contorno de campo contra 3:1, y que la marca **siga sin pasar AA**,
que es la razón de que exista un acento aparte. Comprueba además que el visor no pueda volver a
escribir `white/NN`, ni un color de la paleta de Tailwind haciendo de estado, ni un `font-size` en
porcentaje. Bajar un color por debajo del mínimo **falla el gate**.

El del portal mide lo equivalente sobre `app.css`, y tres cosas más que son suyas: que la **pista**
de la barra de avance deje ver su relleno (3:1, indicador no textual), que los **cinco acentos** de
grupo se lean sobre su superficie **y no se parezcan entre sí** —el par más cercano por encima de 40
grados de tono; ya pasó estar en 21 y el usuario lo dijo como «todo del mismo tono»—, y que ningún
token quede declarado sin usar.

> **Un fallo del propio gate, y cómo se encontró.** El oráculo de aquel paso era «pasa, y **falla al
> revertir `--ab-track`**». Al quitarlo del bloque claro, la prueba de «todo `var()` está
> declarado» **siguió pasando**: miraba el archivo entero y el token seguía declarado en
> `[data-theme="dark"]`. O sea que **un token declarado solo en oscuro pasaba el gate** y la pista
> seguía sin pintarse en claro, que es el tema de partida. Ahora la prueba mira el CSS **como lo ve
> el tema claro**, quitando los bloques oscuros. Un gate que no se muta no se sabe si mide.

### Cómo se comprueba el tema claro, y la trampa que tiene

**El gate mide pares de tokens; una pantalla es una composición.** Puede pasar entero y aun así
tener texto ilegible, porque el color que se ve en un sitio depende de qué hay debajo. Así que el
tema claro se miró además **en el navegador, pantalla por pantalla**, el 2026-09-08.

El barrido recorre cada elemento con texto propio y visible, resuelve **el fondo que de verdad tiene
debajo** y compara contra 4,5:1 —o 3:1 si el texto es grande o el control está deshabilitado, que la
norma exime—. Se salta el lienzo 3D, que lo pinta el visor y no el CSS.

> **La trampa, y me costó un barrido falso.** `bg-action/30` no se resuelve a un color opaco: Chrome
> lo devuelve como **`oklab(0.442007 0.0639623 -0.141039 / 0.3)`**, o sea otro espacio de color y con
> alfa. Leerle los números con una expresión regular y tratarlos como RGB da basura: el primer
> barrido acusó al botón activo de la cinta de estar a **1,32:1** en claro, y estaba a nueve y pico.
>
> La forma que funciona es **no convertir nada a mano**: apilar las capas semitransparentes hasta la
> primera opaca y **dejar que el navegador las componga** en un `<canvas>` de 1 × 1 —`fillStyle` con
> el color de debajo, `fillStyle` con el de encima, `getImageData`—. Sale un `rgb()` exacto, y con la
> conversión de espacios de color hecha por quien la va a pintar. Medido así, `bg-action/30 text-fg`
> en claro compone `rgb(205, 196, 226)` bajo un texto `#172238`, que se lee de sobra.

Estados barridos, con el modelo abierto y en los dos temas: las tres pestañas de la cinta, el
navegador con las doce secciones desplegadas, el rail plegado, un cuadro flotante abierto, una
medición empezada y la escena vacía con la puerta de entrada. **Cero por debajo del suelo en los
dieciséis pasos**, entre 39 y 122 elementos por pasada.

**Lo que el barrido no alcanzó, dicho:** la nota flotante y los paneles de nube y calce con datos
—las tres necesitan el registro de Django y el COPC de 130 MB servidos, y aquí no lo están— y los
estados de error de la insignia de estado. Los colores de esos tres estados sí están medidos como
tokens en los dos temas por el gate.

**Y una cosa que resultó no ser un problema.** Quedaba la pregunta de si el lienzo se queda oscuro
con el tema claro, que se veía así en una captura. No: el renderizador va con `alpha`, el `<canvas>`
y su contenedor son transparentes —comprobado, `rgba(0, 0, 0, 0)` los dos— y lo que se ve detrás es
la superficie del tema. **El lienzo sigue al tema sin que nadie se lo diga, y sin recargar.** La
captura que decía lo contrario era del propio capturador emulando `prefers-color-scheme`.

## Referencia visual

El lienzo de diseño con las trece pantallas —diagnóstico, tokens, componentes con sus
estados, y las seis etapas del visor y las tres del portal— se publicó como artefacto de
Claude el 2026-09-01. Exportable a PDF desde su barra de herramientas.

## Lo que este documento **no** decide

La revisión propuso además **reordenar el shell del visor**: barra de aplicación con migas,
rail de secciones en vez del acordeón del navegador, herramientas flotando sobre el lienzo y
propiedades como tarjeta anclada a la selección.

**Eso contradice tres decisiones escritas en UX.md** y no se aplica sin que el usuario las
revise. Está planteado en `MASTER_PLAN.md` como `F9.6`, bloqueado a propósito.
