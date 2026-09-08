# UX de AeroBim — cómo se reparte la pantalla y por qué

> **Qué es esto.** La estructura de la interfaz: qué zonas hay, qué entra en cada una y con qué
> regla crece. Escrito el 2026-08-19 a pedido del usuario, después de la primera prueba con un plano
> DXF y un IFC abiertos a la vez — cuando las nubes de puntos, el BCF y las interferencias todavía
> no existían. **Las tres entraron después donde esta regla decía que entrarían**, y esa es la razón
> de que el documento siga mandando.
>
> **Dos referencias, y cada una manda en lo suyo** (decidido el 2026-09-07).
>
> **CAD —AutoCAD, Revit y los modeladores de Bentley— manda en _dónde_ están las herramientas y
> cómo se comportan**: la cinta con pestañas por tipo de trabajo, el cubo de vistas arriba a la
> derecha, la barra de estado al pie, la ficha densa, el amarillo del ajuste. De ahí vienen quienes
> van a usar esto, y no se copia por gusto: se copia para que nadie tenga que aprender otra
> pantalla.
>
> **Asana manda en _cómo se ve y se lee_**: superficies limpias separadas por borde, aire, dos
> niveles tipográficos en vez de cinco, navegación lateral que se pliega a rail, acciones visibles,
> estados con color suave **y texto**, y tema claro además del oscuro.
>
> Y lo que **no** se toma de Asana, dicho para no discutirlo después: acciones escondidas en hover,
> tarjetas ancladas a la selección, herramientas flotando sobre el lienzo, y la densidad de página
> de una herramienta de gestión — aquí el lienzo se lleva la pantalla.
>
> **Los colores, los tamaños de letra y los estados están en
> [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** (2026-09-01). Este documento dice qué zonas hay y qué
> entra en cada una; aquel dice con qué se pintan. Donde los dos hablen de lo mismo, manda este.
>
> **Y desde el 2026-09-07 este documento cubre las dos mitades.** Hasta entonces solo hablaba del
> visor —cero menciones al portal, medidas— y el portal creció sin una regla escrita de dónde entra
> lo que llegue: la consecuencia fue que la navegación acabó siendo la portada, porque nunca se
> decidió que hubiera otra. La sección **«El portal»** está al final.

## La regla de fondo

**El modelo manda; todo lo demás cede.** Cada píxel de interfaz permanente hay que justificarlo
frente a lo único que no se puede sustituir: ver el modelo. De ahí salen las tres decisiones que
gobiernan el resto:

1. **Una sola barra arriba.** La marca, las pestañas, el estado y `Abrir` viven en la misma fila.
   Antes eran dos filas —cabecera de aplicación y pestañas— y sumaban 196 px con la cinta; ahora son
   **90 px desplegada y 34 px plegada**, y se pliega volviendo a pulsar la pestaña abierta, como en
   Revit y en Office. La preferencia se recuerda.
2. **Los paneles laterales se mueven.** Ancho arrastrable por su borde y **alto de cada sección
   arrastrable por su separador**. Revisar capas de un plano pide panel; medir pide lienzo, y la
   elección cambia cada diez minutos: no puede estar cableada.
3. **Nada _permanente_ flota sobre el modelo** salvo el cubo de vistas. Los avisos van a la barra de
   estado, que es donde ya mira quien viene de un CAD.

   **Lo _transitorio_ sí flota** —reescrito el 2026-09-07— y esto es una corrección, no un cambio
   de opinión: la regla decía «nada flota» y el código ya tenía dos cosas flotando desde antes
   (`NotaFlotante` y `CuadroFlotante`, las dos `absolute z-20` sobre el lienzo, comprobado). Un
   documento normativo que contradice al código no gobierna nada: o se borra el código o se corrige
   la regla, y aquí lo correcto es corregir la regla, porque las dos cosas que flotan **están
   bien**.

   Lo transitorio es la nota mientras se escribe, el cuadro mientras se consulta y la puerta
   mientras no hay nada abierto. Y lleva sus condiciones, que es lo que lo separa de «todo puede
   flotar»:

   - **se arrastra** a donde no moleste;
   - **se cierra con Esc**;
   - **no sobrevive a su tarea** — al guardar la nota, desaparece;
   - **no lleva herramientas dentro.** Una herramienta flotante es permanente por definición: se usa
     una y otra vez, así que su sitio es la cinta.

## Las cinco zonas

| Dónde     | Componente                       | Qué hay                                                                        |
| --------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Arriba    | `components/Ribbon.tsx`          | Marca · pestañas Vista/Medición/Modelo · estado · **Abrir**                    |
| Izquierda | `PropertiesPanel` / `Plan2DCard` | La ficha de lo seleccionado: elemento IFC **o** elemento 2D                    |
| Centro    | El lienzo + `ViewCube`           | El modelo, el plano y la nube; el cubo arriba a la derecha                     |
| Derecha   | `ProjectBrowser`                 | **El contenido del proyecto**: estructura, modelos, planos, vistas, mediciones |
| Al pie    | `StatusBar`                      | Modo, qué falta para medir, resultado, avisos de visibilidad                   |

### Arriba: una barra, no una cabecera y una cinta

`Abrir` es **uno solo para todo lo que la aplicación sabe leer**: la extensión decide si el archivo
entra como modelo o como plano, y lo mismo hace arrastrar y soltar. Un botón por formato envejece
mal — con las nubes de puntos serían tres.

Las pestañas agrupan **por tipo de trabajo, no por tipo de control**: se pasa un rato mirando, otro
midiendo, y se cambia de contenido pocas veces.

### Derecha: el contenido del proyecto, todo junto

Es la zona que más va a crecer, y por eso tiene una regla explícita: **cada fuente de datos es una
sección de la misma lista**, no una pestaña aparte.

**Y desde el 2026-09-07 las secciones van en cuatro grupos**, porque doce seguidas con la misma
cabecera son un muro: la lista dejó de decir por dónde empezar en cuanto pasó de siete.

```
EMPEZAR       Del registro · Coordinación
LO ABIERTO    Modelos abiertos · Planos 2D · Nube de puntos · Calce y desviación
EL MODELO     Estructura · Cuadros · Planos generados
LO GUARDADO   Vistas guardadas · Vistas del proyecto · Mediciones tomadas
```

**Por qué juntas y no en pestañas.** La pregunta que trae a alguien aquí es "¿esto que dice el plano
está modelado?", y responderla es encender y apagar de dos fuentes distintas. Con pestañas, cada
comparación cuesta dos clics de ida y dos de vuelta; en la misma columna cuesta uno.

Cada sección se pliega y **se le puede fijar el alto**; las que no tienen alto fijo se reparten lo
que sobra. Así doce secciones conviven sin que ninguna empuje a las demás fuera de la pantalla.

**El grupo no es un destino.** Es un rótulo que separa, y las cuatro listas están a la vez en la
misma columna: repartirlas en cuatro sitios rompería la razón de que estén juntas.

#### El rail: el navegador plegado, no un menú aparte

`F9.6`, decidido el 2026-09-07. El navegador se pliega a **44 px de iconos** y se despliega con un
clic, con la sección de ese icono abierta. Recupera **302 px de lienzo** medidos.

**Y es un estado, no una navegación**, que es la diferencia que hace que esto no contradiga la regla
de arriba: el rail no reparte el contenido en doce destinos con uno visible a la vez —eso era la
propuesta original y por eso estaba bloqueada—; es el mismo acordeón con los rótulos escondidos. La
regla de crecimiento se conserva entera: **una capacidad nueva sigue siendo una sección**, ahora con
su icono y en el grupo que le toca.

### Qué pesa cada herramienta

**No todas las herramientas de una pestaña valen lo mismo, y hasta el 2026-09-07 se dibujaban
iguales**: 36 botones del mismo tamaño en 12 grupos, así que nada decía cuál se usa treinta veces al
día y cuál una vez por proyecto.

El criterio, para que no se decida botón por botón:

**Es grande la herramienta que (a) abre el modo de trabajo de su pestaña, o (b) es la vuelta
segura.** Como mucho **tres por pestaña** — con cinco, «grande» deja de significar algo. Y las que
duplican al cubo de vistas son siempre pequeñas: el cubo ya está ahí y es más rápido.

| Pestaña     | Grandes                  |
| ----------- | ------------------------ |
| **Empezar** | Del registro · Del disco |
| Vista       | Todo · Modo 2D · Órbita  |
| Medición    | Seleccionar · Distancia  |
| Modelo      | Horizontal · Ver todo    |

**La altura de la cinta no cambia.** Lo pequeño va con icono de 16 y su nombre a la derecha, **dos
por columna**, no tres: tres apilados bajan de los 44 px de área mínima, que es una regla del
sistema y no una preferencia.

### La cinta con la escena vacía

**Es el único caso en que la cinta no es la cinta**, y se decidió el 2026-09-08 al hacer `F12.4`.
Con la escena vacía —ni modelo, ni plano, ni levantamiento— hay un solo grupo, **«Empezar»**, con
los dos gestos que sí se pueden hacer. Es lo que hace Revit sin documento abierto.

Tres reglas que van juntas y no se pueden separar:

1. **Las pestañas y el botón de plegar se apagan.** Dejarlos vivos sería un control que responde y
   no cambia nada visible: se pulsa «Medición» y sigue el mismo grupo delante. Se **ven** —dicen qué
   trabajo hay dentro del programa— y vuelven en cuanto haya algo que mirar.
2. **La escena vacía gana al pliegue recordado.** El pliegue existe para dejarle el lienzo al
   modelo; sin modelo no protege nada, y respetarlo dejaba la cinta en una fila de tres pestañas
   apagadas y nada más. Se recupera intacto en cuanto se abre algo.
3. **La cinta y el lienzo dicen lo mismo, con la misma condición.** La puerta de entrada del lienzo
   ofrece los dos mismos gestos, y las dos mitades se pintan con «la escena está vacía» y no con
   «las herramientas de cámara no tienen dónde aplicarse», que **no** son lo mismo: un levantamiento
   solo cumple la segunda. Si discreparan, se vería la cinta ofreciendo «Empezar» con un modelo
   delante.

Y lo que **no** era el problema: el color. `--color-apagado-fg` está a 3,6:1 a propósito —WCAG exime
lo inactivo y el gate lo fija para que nadie lo suba—, así que aclararlo habría hecho _más legible_
una pantalla donde ninguna de las treinta y seis herramientas se podía usar.

#### Y una idea que se midió y se descartó

**«Plegada, que la cinta deje el grupo esencial de la pestaña en una fila de iconos.»** Suena bien
—daría la economía de un rail sin cambiar de paradigma— y **no se paga**. Medido el 2026-09-07 sobre
la cinta real, escribiéndolo y quitándolo:

| Estado                                           | Alto de la cinta | Devuelve  |
| ------------------------------------------------ | ---------------- | --------- |
| Desplegada                                       | 115 px           | —         |
| Plegada como está hoy (solo pestañas)            | 34 px            | **81 px** |
| Plegada con la fila de iconos del grupo esencial | 99 px            | 16 px     |

**El suelo es el área de toque.** El botón mide 48 px de alto por `F9.4`, así que una fila de
iconos usable no baja de ahí más el relleno del contenedor: quitar los rótulos ahorra 16 px y cuesta
los otros 65. O sea que la fila compacta **convierte plegar en un gesto que ya no sirve para nada**,
que era justo lo que venía a arreglar.

Así que plegada sigue mostrando solo las pestañas. Quien necesita una herramienta la despliega —un
clic, y la preferencia se recuerda—, y quien quiere el modelo entero lo tiene entero.

### Tema

**Oscuro por defecto en el visor**, porque el lienzo es oscuro y una interfaz clara alrededor de un
modelo oscuro obliga a la pupila a adaptarse en cada mirada. **Claro disponible**, porque hay
oficinas con ventanal al sur.

**La clave es la misma que el portal** (`localStorage["aerobim:tema"]`), y eso es la costura: quien
elige claro en el portal entra en un visor claro. Con dos claves distintas, cruzar del expediente al
modelo cambiaría de tema a mitad de un gesto.

### 2D y 3D: una sola ventana, con un modo para cada trabajo

La pregunta se planteó como "¿dos instancias, una para el CAD y otra para el modelo?", y la
respuesta es **una sola**: lo que trae a alguien aquí es cruzar los dos —lo que dice el plano, ¿está
modelado?—, y eso no se puede hacer con dos ventanas.

Lo que sí hace falta es poder **mirar solo el plano**, porque revisar un CAD con el modelo encima es
imposible. Para eso está **Modo 2D** (pestaña Vista, grupo Trabajo): apaga los modelos, pone la
cámara en planta y la proyección en ortográfica —que es como se mira un plano— y vuelve a pulsarlo
para recuperar el modelo. **No cierra nada**: los modelos quedan apagados y "Ver todo" también los
devuelve.

| Trabajo                 | Cómo se hace                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| Revisar el plano        | **Modo 2D**: el CAD solo, en planta y ortográfica                 |
| Comparar plano y modelo | Los dos encendidos; se apagan capas del plano y elementos del IFC |
| Calzar el plano         | "Calzar con 2 puntos" en la ficha del plano                       |
| Medir sobre el plano    | Medición → distancia, con **Al plano** encendido                  |

### Centro: el cubo de vistas

Está donde lo pone AutoCAD —arriba a la derecha— y hace las dos cosas que hace el de AutoCAD:
**dice hacia dónde se está mirando** y **cambia la vista con un clic**. La cara activa va en color
de marca, y **se apaga en cuanto alguien orbita a mano**: un cubo que sigue diciendo "Planta" con la
cámara en otro sitio miente.

Está dibujado en SVG y no en una escena aparte: un cubo con su propio render cuesta una cámara y un
fotograma por cuadro para cuatro respuestas útiles —planta, frontal, lateral, isométrica—, y las
caras dibujadas llevan su nombre escrito, que uno con texturas no siempre consigue.

### Izquierda: dos fichas, no una con huecos

Un elemento IFC tiene GUID, tipo, material y psets. Un trazo de un DXF tiene **capa, plano de
origen, largo y posición**, y nada más. Son dos fichas distintas porque mezclarlas obligaría a
llenar media pantalla de guiones en cada una.

La ficha del elemento IFC lleva además **apagar** y **aislar/salir del aislamiento**, que es donde
uno los busca: en el elemento, no en una pestaña de la cinta.

## Visibilidad: una sola regla para todo lo que se ve

Modelos, elementos, planos y capas de plano se apagan igual —el ojo— y **"Ver todo" enciende todo lo
que hay**, incluidos los planos. Aparte va **salir del aislamiento**, que no es lo mismo: devuelve la
escena a como estaba antes de aislar, con lo que se había apagado a mano todavía apagado.

Las dos salidas viven en la barra de estado, visible en las tres pestañas, porque aislar se hace
desde la ficha o desde el árbol y el camino de vuelta tiene que estar a la vista desde donde sea.

## Escalabilidad: qué se añade y dónde

**Esta tabla ya se cumplió**, y se conserva porque su valor es haber acertado: las tres capacidades
grandes que llegaron después entraron **donde estaba escrito que entrarían**, sin rediseñar nada.

| Lo que llegó                           | Dónde entró, como estaba previsto                                      | ¿Se cumplió? |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------ |
| Nubes de puntos (Fase 2)               | Sección propia en el navegador + grupo "Nube" en la pestaña Modelo     | ✅           |
| Temas BCF (Fase 4)                     | Sección propia + pestaña "Coordinación" en la cinta                    | ✅           |
| Interferencias (Fase 5)                | Sección propia; el resultado lleva la cámara y aísla los dos elementos | ✅           |
| Herramientas CAD de revisión (`F7.11`) | Grupo nuevo en la pestaña Medición, con los ajustes de snap            | ✅           |
| Más de un plano a la vez               | La lista crece y cada uno lleva su ajuste y sus capas                  | ✅           |

**La regla para crecer:** una capacidad nueva es _una sección del navegador_ —con su icono y en el
grupo que le toca— y, como mucho, _un grupo en una pestaña existente_. Una pestaña nueva solo se
justifica cuando aparece un modo de trabajo entero —coordinar no es medir—, y nunca para un solo
botón.

## Lo que falta, dicho en voz alta

- ~~**Hay una propuesta de reordenar el shell que contradice tres decisiones de este
  documento**~~ — **decidida el 2026-09-07, y escrita arriba.** `F9.6` cierra aquí, que es donde
  tenía que cerrar: la regla de este documento era que si se acepta alguna se reescribe esto primero
  y se toca el código después.

  | Lo que proponía la revisión del 2026-09-01 | Decisión                                                |
  | ------------------------------------------ | ------------------------------------------------------- |
  | Herramientas flotando sobre el lienzo      | **Rechazada.** Sigue en pie «nada permanente flota»     |
  | Propiedades como tarjeta anclada           | **Rechazada.** Sigue siendo panel fijo a la izquierda   |
  | El navegador repartido en un rail          | **Aceptada como estado plegado**, no como doce destinos |

  La tercera es la única que cambia algo, y lo cambia poco a propósito: como estado plegado, la
  regla de crecimiento —«una capacidad nueva es una sección del navegador»— **se conserva**. Era
  justo lo que la propuesta original rompía, y el motivo de que estuviera bloqueada en vez de
  pendiente.

- **Herramientas CAD de revisión** (`F7.11`): snap a extremo/medio/intersección sobre el plano,
  medir del plano al modelo, y marcar sobre el plano. Hoy se puede seleccionar un trazo y leer su
  largo, que es el primer paso.
- **Intersección de dos trazos** como punto de ajuste. El extremo y el punto medio ya enganchan.
- ~~Medir del plano al modelo en un mismo gesto~~ — **hecho el 2026-08-26**, y salió gratis: al
  pasar la medición de distancia al rayo propio, los dos puntos entran por la misma función, así
  que uno puede engancharse a un trazo del CAD y el otro a un vértice del modelo. Comprobado en
  el navegador: 8,948 m entre un trazo del plano y un punto del `Piso 5.ifc`.
- **Llevar la selección al árbol**: seleccionar en el modelo y que el árbol se despliegue hasta el
  elemento.
- **Textos del plano en 3D**: se dibujan tumbados sobre el plano, con su color y **con la
  alineación que declara el CAD** (2026-08-26 — antes se centraban todos, y 398 de los 433 del
  plano real van arriba a la izquierda). Queda pendiente decidir si además se pueden apagar por
  separado de su capa.
- **Las cinco cosas que el usuario pidió el 2026-08-19** y que ahora están en `MASTER_PLAN.md`
  como `F1.12` a `F1.16`. Queda una: el **panel de abajo que no se entiende**, cuyo ticket pide
  palabra por palabra lo mismo que `F1.8`, que está cerrada — hace falta que el usuario diga si lo
  que no se entiende sigue ahí. Las otras cuatro están cerradas.
- **El marcador de ajuste es amarillo, no violeta** (2026-08-26). El violeta es de la selección y de
  las cotas; una tercera cosa del mismo color se lee como una de ellas. El amarillo para las marcas
  de referencia es la convención de AutoCAD y de BricsCAD, que es la referencia declarada arriba.
- **La vista fantasma conserva el color de cada elemento** (2026-08-26). Antes blanqueaba el modelo
  entero, porque la pintaba el resaltado de la librería; ahora se pinta por cuenta propia al 30 %
  de opacidad sobre el color que ya tenía cada cosa. Mirando detrás de un muro se sigue
  distinguiendo una viga de una losa, que es para lo que se enciende el modo.

---

## El portal

> **Escrito el 2026-09-07**, y con tres semanas de retraso: este documento no mencionaba el portal
> en ninguna línea, así que el portal creció sin una regla escrita de dónde entra lo que llegue. La
> consecuencia se vio al medirlo: **la navegación acabó siendo la portada**, porque nunca se decidió
> que hubiera otra. La barra superior llevaba marca, tema, usuario, ayuda, clave y salir — cero
> enlaces a módulos.

### Dos referencias, cada una para lo suyo

**CAD manda en el visor** —eso no cambia, es la cabecera de este documento— **y Asana manda en el
portal.** No es una preferencia estética: son dos poblaciones distintas de pantalla. El visor es un
lienzo con herramientas alrededor, como AutoCAD; el portal es una lista de trabajo con navegación
al lado, como cualquier gestor de tareas que la gente ya sabe usar.

De Asana se toma:

- **«Mi trabajo» como punto de partida**: lo pendiente de uno, primero, antes de cualquier menú.
- **Barra lateral persistente**, con los módulos agrupados y el activo marcado.
- **Cada cosa es una tarea** con dueño, fecha y estado — las observaciones ya lo eran.
- **Vista lista y vista tablero** sobre los mismos datos.
- **Jerarquía tipográfica clara, aire, superficies limpias separadas por borde.**

Y no se toma:

| Lo que no se copia                    | Por qué                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| **Acciones escondidas en hover**      | No existen para el teclado ni en táctil. Ver `DESIGN_SYSTEM.md`                |
| **Arrastrar tarjetas entre columnas** | Pide JavaScript y una vista POST que no existe: el estado se cambia con motivo |
| Los proyectos como listas genéricas   | Aquí una obra es un expediente ISO 19650, con su vocabulario                   |
| El buscador global como centro        | No hay volumen que lo justifique todavía                                       |
| Superficies blancas en el visor       | Ahí el modelo manda y el lienzo es oscuro                                      |

### Las cuatro zonas

```
┌─────────────────────────────────────────────────────────┐
│ barra   marca · tema · usuario · Ayuda · Clave · Salir  │  navy, en las dos
├──────────────┬──────────────────────────────────────────┤
│ rail         │ cabecera   migas · título · sub · acciones│
│ Mi trabajo   ├──────────────────────────────────────────┤
│ [grupos]     │ contenido                                 │
│ Cómo se usa  │                                           │
└──────────────┴──────────────────────────────────────────┘
```

**1 · La barra** es identidad y sesión, nunca navegación de contenido: lo que se pone aquí está en
todas las pantallas y no cambia nunca. El interruptor de tema y la ayuda viven aquí porque se
buscan desde la pantalla en la que uno se atascó, no volviendo a la puerta.

**2 · El rail** es la navegación, y **es la única**. Sale del catálogo de
`apps/accounts/modulos.py`, así que añadir un módulo es añadir una fila de datos — no tocar una
plantilla. Tres anchos, **sin una línea de JavaScript** porque la CSP lo prohíbe: 248 px con rótulo,
64 px solo iconos, y tira horizontal en el teléfono. El rótulo se escribe siempre, aunque no se vea.

**3 · La cabecera** es del sistema y no de cada plantilla: migas, título, subtítulo y acciones, en
ese orden. Antes cada una de las treinta plantillas ponía su propio `<h1>` con su propio margen, y
el hueco entre título y subtítulo era distinto según la pantalla — no porque nadie lo eligiera, sino
porque era la suma de tres márgenes escritos en tres sitios.

**4 · El contenido** es de cada pantalla. Y **la fila de tarea es compartida**
(`generic/_fila_tarea.html`): la portada y la bandeja pintan la misma, así que no pueden divergir.

### La regla para crecer

| Lo que llegue                       | Dónde entra sin rediseñar nada                                       |
| ----------------------------------- | -------------------------------------------------------------------- |
| Un módulo nuevo                     | Una fila en `CATALOGO`, con su grupo, su permiso y su icono          |
| Una vista nueva de los mismos datos | Un segmento más en el conmutador, y **la misma fuente de datos**     |
| Una acción de pantalla              | `{% block acciones %}` de la cabecera; uno primario, el resto sordos |
| Un filtro rápido                    | Un segmento en el control segmentado, con su valor en la URL         |
| Un dato en una tarea                | Un campo en `Tarea` (`apps/documents/tareas.py`), y sale en las dos  |

**Tres reglas cerradas**, y las tres se pueden comprobar:

1. **Una capacidad nueva es una fila del catálogo**, igual que en el visor es una sección del
   navegador. Un grupo nuevo del rail solo se justifica con un ámbito de trabajo entero.
2. **Dos vistas de lo mismo salen de la misma consulta.** No es una preferencia: una tarea que sale
   en una vista y no en la otra se lee como que ya está hecha, y quien lo note sospecha de su
   memoria antes que de la pantalla. `test_bandeja.py` compara los conjuntos.
3. **Nada se aplica con JavaScript que no funcione sin él.** La CSP sirve `script-src 'self'` sin
   `'unsafe-inline'`, así que un `onclick` **funciona en desarrollo y no en producción** — ya pasó
   con tres `onchange` de los filtros. El comportamiento va en `static/js/`, y siempre con un camino
   que no lo necesita: el botón «Filtrar» se queda al lado del desplegable que se autoenvía.

### Lo que falta en el portal, dicho en voz alta

- **El detalle lateral de una observación** (`?abrir=<pk>` reutilizando `.hallazgo`): abrir un
  hallazgo sin perder la lista. Planteado y pospuesto a la segunda pasada.
- **La captura adjunta en un comentario** (`F12.11`): hoy una queja del portal no lleva imagen.
- **`--ab-surface-3`**, una tercera superficie para el tablero. No entra hasta que algo la use: el
  gate falla con un token declarado sin un `var()`, y eso es a propósito.
- **`base_puerta.html`**, una base mínima para pantallas anónimas. Hoy solo existiría para el login,
  que no la necesita — entra cuando haya una segunda, un 404 por ejemplo.
