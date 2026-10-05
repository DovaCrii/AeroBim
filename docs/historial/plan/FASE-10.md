# Fase 10 — Etiquetas, informes y tablas

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

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
