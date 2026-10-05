# Fase 8 — Control documental y seguimiento

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

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
