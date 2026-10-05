# Fase 11 — El portal se ve plano (y qué formatos entran)

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

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

| #        | Tarea                                                                            | Estado       |
| -------- | -------------------------------------------------------------------------------- | ------------ |
| `F11.1`  | Distintivo de disciplina: su código sobre su color, y la letra elegida midiendo  | ✅ ver abajo |
| `F11.2`  | Fichas con nombre: «A» pasa a «A · Publicado y autorizado»                       | ✅ ver abajo |
| `F11.3`  | La marca sin placa: variante de trazo claro para las superficies oscuras         | ✅ ver abajo |
| `F11.4`  | La portada: dos mitades, para qué sirve esto, y un mensaje para el equipo        | ✅ ver abajo |
| `F11.5`  | El portal reordenado, y la tarjeta de obra con datos y no con texto              | ✅ ver abajo |
| `F11.6`  | «Observaciones abiertas»: prioridad, antigüedad y responsable de un vistazo      | ✅ ver abajo |
| `F11.7`  | Una sección de ayuda con el recorrido de cómo se usa                             | ✅ ver abajo |
| `F11.8`  | Botones, campos y migas: los controles dejaron de ser los del sistema            | ✅ ver abajo |
| `F11.9`  | La ficha de un hallazgo en dos columnas: la conversación y la ficha              | ✅ ver abajo |
| `F11.10` | El portal: nombres de sección, líneas de ayuda, iconos y los cinco acentos       | ✅ ver abajo |
| `F11.11` | El vocabulario BIM, y qué hace AeroBim con cada una de las dieciséis palabras    | ✅ ver abajo |
| `F11.12` | El vocabulario del levantamiento: nube de puntos, MDT y MDS, ortofoto, el geoide | ✅ ver abajo |
| `F11.13` | El vocabulario de gestión y costos: CAPEX, OPEX, valor ganado y los KPI          | ✅ ver abajo |

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

### `F11.13` — ✅ El vocabulario de gestión y costos

**Lo pidió el usuario el 2026-09-11**, el tercero del mismo día: «se puede sumar al glosario el tema
de CAPEX y OPEX y los KPI». Diecinueve términos en tres grupos: _el dinero de la obra_ · _cómo se
mide el avance_ · _los indicadores_.

**Y es el que más tiene que decir que no: quince de diecinueve.** Esa proporción es el dato, no un
defecto de la pantalla — **AeroBim no es una herramienta de costos**. No hay presupuesto, no hay
partidas, no hay valor ganado y no hay un campo de CAPEX en ninguna parte. Decirlo en la pantalla que
alguien abre buscando la palabra sale más barato que descubrirlo en la reunión donde se prometió un
informe de costos.

**Las cuatro que sí están**, y que son las que alimentan a la herramienta que sí lleva el dinero:

| Está                            | Qué es exactamente                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cantidades del modelo (QTO)** | Los cuadros por categoría con sus cantidades, sus unidades y sus psets, en CSV. Es lo que la gente quiere decir cuando dice «5D»                                   |
| **Avance documental**           | La barra de cada tarjeta de obra: suma ponderada de entregables por el avance de su revisión vigente, **sumada del registro y no tecleada**                        |
| **Tiempo de ciclo**             | Días entre abrir y cerrar un hallazgo, de `metricas_piloto`, que además avisa aparte de las resueltas sin fecha de cierre en vez de dejarlas caer                  |
| **KPI**                         | Los pocos y concretos que salen de lo que la base ya guarda: abiertos, cerrados y descartados por rango; contexto de los abiertos; reparto por pantalla y por tipo |

**El aviso que da nombre a la pantalla, y sale del propio código:** el campo se llama `avance_fisico`
y **no mide avance físico**. Es una suma ponderada de entregables por el avance de su revisión
vigente, o sea avance **documental**. Que el 80 % de los planos esté emitido no dice nada del
hormigón vertido, y confundir los dos es de los errores que se firman. Por eso hay dos términos
separados —«avance físico y avance financiero», que no está, y «avance documental», que sí— en vez de
uno solo que se leería como si el producto midiera obra.

Y el resto del vocabulario no se queda en definiciones: cada ausente dice **qué rastro deja AeroBim
que sirve para calcularlo fuera**. El de la orden de cambio —«un choque detectado y cerrado antes de
construir es una orden de cambio que no se emitió»— y el del ROI del BIM —«la mitad que le falta no
es técnica, son los precios; la otra mitad sí está y es la que nadie suele tener»— son los dos que
contestan la pregunta de fondo.

**Entró sin escribir una prueba**, que es lo que `F11.12` dejó preparado: las pruebas están
parametrizadas sobre los vocabularios, y lo único escrito a mano es la lista de los quince ausentes
—para que acortarla sin construir nada rompa el gate.

### `F11.12` — ✅ El vocabulario del levantamiento

**Lo pidió el usuario el 2026-09-11**, el mismo día y justo después del de BIM: «glosario topográfico
para entender en general las diferentes especialidades… principalmente explicando el tema de nube de
puntos, DEM, ortofotos, esa es la línea».

**El motivo le da la forma a la tarea:** aquí no se hablan dos idiomas sino tres —el de quien vuela,
el de quien topografía y el de quien modela— y las palabras que más se usan son justo las que cada
oficio entiende de otra manera. Un modelador oye «cota» y piensa en el nivel del proyecto; un
topógrafo pregunta si es elipsoidal u ortométrica, y la diferencia son decenas de metros.

**Veinte términos en tres grupos**, en el orden en que se encuentra uno con ellos: _cómo se captura_
(nube de puntos, fotogrametría, LiDAR, densidad, GSD) · _dónde cae_ (sistema de referencia, cota
elipsoidal y ortométrica, precisión y exactitud, RTK y PPK, puntos de apoyo y de chequeo, calce) ·
_qué productos salen_ (LAS y LAZ, COPC, clasificación, intensidad, MDT y MDS, ortofoto, curvas y TIN,
cubicación, desviación).

**Los tres avisos que esta pantalla existe para dar**, cada uno en el término que le toca, y los tres
de los que cuestan una obra:

1. **Cota elipsoidal y cota ortométrica no son la misma cota.** Si el modelo está en cota de proyecto
   y la nube llega en elipsoidal, AeroBim mide la desviación, la calcula bien y **da un número
   correcto sobre datos incomparables**: decenas de metros de sesgo constante, que es justo la clase
   de error que no parece un error.
2. **Precisión no es exactitud.** Un vuelo RTK repite milímetros y puede estar corrido un metro si la
   base estaba mal puesta. El punto de chequeo —el que se deja fuera del ajuste a propósito— es la
   única medida honesta, y es la misma idea que el residuo del calce por tres pares.
3. **La fotogrametría no ve el suelo bajo la vegetación** y el LiDAR sí, por los retornos múltiples.
   De ahí que el mismo terreno dé dos MDT distintos según con qué se voló.

**Once de los veinte no están en el producto**, y con eso la proporción de este vocabulario es más
dura que la del BIM — que es lo honesto: AeroBim abre, calza y mide la nube, pero **no genera MDT ni
MDS, no hace ortofotos, no clasifica, no saca curvas de nivel y no cubica**. La distinción que más
vale de las que dice: la desviación contesta «¿está donde debía?» y la cubicación «¿cuánto material
hay?», y la segunda pide dos superficies, no una nube y un modelo.

**La maquinaria se sacó a `glosario.py`** al añadir el segundo: `Termino`, `Vocabulario`, la
resolución de enlaces y las dos reglas de escritura. Los contenidos viven en `vocabulario_bim.py` y
`vocabulario_levantamiento.py`, y las pruebas van parametrizadas sobre los dos — **un tercer
vocabulario entra sin escribir una prueba**. La URL lleva la clave (`/ayuda/vocabulario/bim/`), y una
clave desconocida da **404 y no cae al primero**: devolver otra pantalla en silencio hace que nadie
se entere de que su enlace está roto.

### `F11.11` — ✅ El vocabulario BIM, y qué hace AeroBim con cada palabra

**La trajo el usuario el 2026-09-11**, con una lámina de dieciséis conceptos BIM: «incorporar la idea
por lo menos como informativo, se ve interesante». Las dieciséis están.

**Lo que no se hizo fue copiar la lámina**, y eso es toda la tarea. Definiciones de CDE, LOD o
clash detection hay en veinte sitios de internet y quien abre esto no necesita la vigesimoprimera. Lo
que **no** puede encontrar en ninguno es si la herramienta que tiene delante hace esa cosa. Así que
cada término lleva un campo más —`en_aerobim`— que contesta exactamente eso, con enlace a la pantalla
cuando la hay.

**Y dice que no la mitad justa de las veces: ocho de dieciséis.** LOD, BEP, el modelado paramétrico,
4D, 5D, COBie, AIM y el gemelo digital no están, y cada uno explica **qué hay en su lugar** o qué
haría falta:

| No está                  | Qué hay en su lugar                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LOD**                  | El código de idoneidad de la revisión —S0 a S7, A, B—, que es otro eje: la idoneidad habla del documento y el LOD del elemento. Por elemento pediría un pset propio y un requisito IDS |
| **BEP**                  | Es un documento, y se archiva como cualquier entregable. Lo que decide sí se aplica —correlativos, roles, qué se publica— pero se configura a mano                                     |
| **Modelado paramétrico** | Nada, y no es carencia: AeroBim lee y coordina modelos, no los crea                                                                                                                    |
| **4D**                   | Actividades con fecha y una línea de tiempo, **sin vincular a elementos**, que es lo que lo haría 4D                                                                                   |
| **5D**                   | Los cuadros sacan las cantidades con sus unidades y salen en CSV. Falta el precio y la partida                                                                                         |
| **COBie**                | Los psets se leen y su cobertura se mide, pero las hojas y columnas obligatorias de COBie no están escritas                                                                            |
| **AIM**                  | Nada: empieza donde acaba la etapa de proyecto                                                                                                                                         |
| **Gemelo digital**       | Nada: lo que lo distingue de un modelo es el dato en vivo, y aquí no entra ninguno                                                                                                     |

`test_glosario.py` **fija esos ocho por nombre**. Pasar uno a «sí» sin construirlo rompe el gate, que
es justo lo que se quiere: un glosario que promete las dieciséis cosas convierte la ayuda en un
folleto, y quien lo lee lo descubre buscando un botón que no existe. Se comprueba además que ninguno
de los ausentes lleve un «Ir ahí» —sería la contradicción más cara de la pantalla— y que cada destino
esté en el catálogo del portal, el mismo guardián que sujeta a `F11.7`.

**Dos cosas que salieron mirando la pantalla y no leyendo el código:**

- **Las negritas salían con asteriscos.** La casa escribe en Markdown y aquí no hay Markdown: la
  plantilla de Django imprime el texto tal cual. Con dieciséis fichas el error se cuela sin que nadie
  lo relea, así que hay una prueba de que ningún texto lleva `**`.
- **Las cadenas nuevas no estaban en el catálogo**, así que la pantalla salía a medias en inglés para
  quien la lee en español. `makemessages`, las cinco entradas traducidas y `compilemessages`.

La ficha ausente se **apaga y no se esconde**, con la misma forma que el paso que no te toca en la
ayuda —comparten las reglas de CSS a propósito—, con una diferencia: aquí el «en AeroBim» conserva su
tono, porque es justo la frase que se vino a leer.

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

## Qué formatos entran, decidido el 2026-09-03

El usuario preguntó si el visor puede abrir **DWG** y **DGN de Bentley**. La respuesta, con su
argumento y con la lista de lo que hay que pedir a quien entrega archivos, está en
[`docs/FORMATOS.md`](../../../docs/FORMATOS.md). En resumen:

**AeroBim lee IFC, DXF y COPC. No lee DWG ni DGN, y es una decisión, no una carencia.** DWG y DGN v8
son formatos cerrados y el único lector completo de los dos es el de la Open Design Alliance, que es
comercial; la alternativa abierta para DWG —LibreDWG— es **GPL-3 y contagiaría la licencia del
producto entero**.

**Y para Bentley hay una respuesta mejor que convertir, ya probada aquí**: AeroBim abre el IFC de
32,7 MB exportado por **ProStructures 24** que está documentado más abajo — el mismo que destapó el
defecto de los `IFCPROXY`. El camino Bentley → IFC → AeroBim está comprobado con un modelo de obra
real.

> **Y de paso, lo que conviene pedir junto al IFC: `IfcMapConversion` con su EPSG.** No es un
> capricho — si el modelo trae su emplazamiento, **la nube se calza sola**, sin señalar un punto y
> sin residuo. Está medido en `F12.2`.

Si algún día hay que aceptar DWG o DGN igualmente, el camino es **ODA File Converter** —gratuito— en
el servidor, normalizando al entrar al expediente, como ya se hace con las nubes. Queda decidido y
**no hecho a propósito**: hoy no hay ni un archivo que lo necesite.

---
