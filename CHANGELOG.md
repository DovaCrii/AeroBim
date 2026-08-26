# Changelog — AeroBim

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Corregido — La medición de distancia no fallaba, mentía (`F1.14`, 2026-08-26)

Lo reportó el usuario: «las opciones de medida de distancia no está funcionando». El defecto
tenía dos mitades, y la segunda es la que lo hacía indistinguible de «no funciona».

- El ajuste de `LengthMeasurement` **no usa el rayo de la CPU: lee los píxeles de la escena
  dibujada.** Cuando esa lectura no resuelve, `create()` no coloca nada.
- Y `addMeasurePoint` **devolvía `true` de todas formas** —con su propio comentario admitiéndolo—,
  así que la interfaz avanzaba el contador y el aviso pasaba a pedir el segundo punto. Un clic que
  no hizo nada se veía **igual** que uno que sí.

El arreglo usa el rayo propio, que ya estaba escrito: `snapAt` va por `fragments.raycast` con las
mismas clases de ajuste y es el mismo mecanismo que la selección, que sí funciona en uso real.
Devuelve el punto o `null`, así que el valor de retorno deja de mentir. Y `addPlanMeasurePoint`,
que ya dibujaba una cota de dos clics con coordenadas propias, se generaliza y sirve para los dos.

**Y ahora el clic al vacío se dice**: la barra de estado avisa en ámbar en vez de callarse. El
silencio es lo que se lee como «no funciona».

**De paso salió gratis lo que `docs/UX.md` tenía pedido**: medir del plano al modelo en un mismo
gesto, porque los dos puntos entran por la misma función.

Comprobado en el navegador con `Piso 5.ifc` y `ACAD-Piso 5_Base.dxf` cargados a la vez: clic al
vacío devuelve `false`, dos clics sobre el modelo dan **13,066 m** (13,064 en planta, 0,179 de
desnivel), y del plano al modelo **8,948 m**. Sin errores en consola.

El ángulo y el área siguen con el medidor de la librería y siguen sin informar del clic vacío. Va
dicho en el código: son las dos que quedan.

### Buscado y no encontrado — la preselección al pasar el ratón (`F1.12`, 2026-08-26)

«Al acercar el mouse sin clickear selecciona solo elementos, lo cual es poco práctico.»
**No está en nuestro código**: `pickAt` se llama solo desde `onClick`, y no hay un solo
`addEventListener` de movimiento del ratón en todo `packages/viewer`. Lo único que escucha el
puntero son los controles de cámara y los medidores de la librería cuando están encendidos.

El único candidato es el **marcador de ajuste** de `LengthMeasurement`: un punto de 10 px **del
mismo violeta que la selección** que sigue al cursor mientras se está en modo medición. Antes de
cambiar el comportamiento de la selección hace falta confirmar con el usuario si eso es lo que vio.

### Añadido — El visor y el registro dejan de ser dos herramientas (2026-08-26)

**El hueco no estaba en ninguna lista, y era el más grande.** El visor abría archivos del disco
de quien lo usaba y no sabía nada de proyectos; el registro guardaba revisiones —DXF e IFC
incluidos— y no podía mostrarlas. Así que «visualizar y subir documentos todo junto» **no
estaba**: se podían las dos cosas, pero no con el mismo archivo.

- **El SPA se sirve detrás del login**, en el mismo origen (`/visor/`). Con la aplicación en
  otro origen harían falta CORS, un token en el navegador y una segunda configuración de CSP;
  en el mismo origen la cookie de sesión ya sirve y las dos trampas del despliegue —COOP/COEP y
  el `'wasm-unsafe-eval'`— se resuelven una vez.
- **Y pasa por una vista, no por whitenoise**: un archivo estático no se puede poner detrás de
  `LoginRequiredMixin`, porque se entrega antes de que Django mire quién pregunta.
- **«Abrir en el visor» desde el expediente de la revisión.** La extensión decide qué se
  ofrece, que es la misma regla que ya usa la aplicación al soltar un archivo.
- **Una API de dos peticiones**: primero los metadatos —qué entregable, qué revisión, qué código
  de idoneidad— y después los bytes. Así el visor dice qué está abriendo antes de descargar
  veinte megas, y el nombre del archivo no hay que sacarlo de una cabecera del binario.
- **Las tres reglas de acceso se aplican también en la API**, no solo en la pantalla:
  `view_revision` explícito, acotado por organización —y aquí a mano, porque una `Revision` no
  lleva el campo y cuelga de su entregable—, y solo lo publicado para quien no escribe.

**Comprobado en el navegador, con el servidor corriendo:** el plano real del usuario
(`ACAD-Piso 5_Base.dxf`, 1,5 MB) abre desde el registro y aparece como «PLANOS 2D (1)» con sus
capas; el IFC (`Piso 5.ifc`) abre con sus 551 elementos en el árbol. Sin autenticar, `/visor/`
redirige y la API responde 401. Un `mandante` abre el visor pero tiene **cero revisiones
abribles** y 404 en la `S3` en curso.

### Corregido — Los modelos del cliente quedaron accesibles sin autenticar (2026-08-26)

**Defecto introducido por el cambio anterior, encontrado midiendo.** Publicar `apps/web/dist`
como estático dejó los IFC y DXF reales de la organización descargables **sin autenticar**:
`HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc` devolvía **200 y 34 MB**. Vite copia
todo lo que hay en `public/`, y ahí viven los archivos de prueba.

`AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era: no
están confirmados. Lo que faltaba decir es lo otro: **lo que se pone en `public/` se publica**,
y publicar no es lo mismo que confirmar.

El arreglo es `apps/web/scripts/limpiar-dist.mjs`, que corre en cada `npm run build` y es una
**lista blanca y no una lista negra**: una lista de lo prohibido habría funcionado hoy y se
habría quedado atrás con lo siguiente que alguien deje en `public/`. Y hay una prueba que falla
si alguien salta el paso.

### Corregido — La marca no cargaba con el visor servido por Django (2026-08-26)

**Vite reescribe las rutas del `index.html` y no las cadenas dentro del JSX.** El favicon salió
bien en el build y el `<img>` de la cinta se quedó pidiendo `/aerobim-mark.svg`, que bajo
`/static/visor/` no existe. Ahora la ruta sale de `import.meta.env.BASE_URL`, igual que la del
WASM — y esa es la que importaba de verdad: pedirla mal habría dado `Unexpected token '<'`
**dentro del worker**, o sea sin error visible.

### Añadido — Control documental y seguimiento (2026-08-26)

La Fase 8, a pedido del usuario y tomando la idea de **MineDoc** —el que ya usa la empresa—
construida aquí: MIT y local-first.

- **El registro**: proyecto, disciplina, WBS, entregable, revisión, transmittal, observación,
  comentario y actividad. **El vocabulario es el de ISO 19650**: un código `S3` o `A1` significa
  lo mismo en las tres oficinas, y un estado llamado «en revisión» significa lo que cada uno
  entienda. Las `S` no son contractuales y las `A`/`B` sí.
- **El entregable no tiene archivo, la revisión sí.** Existe desde que se planifica, mucho antes
  de su primer archivo: un registro que necesita un archivo para existir no puede decir que
  falta.
- **El avance físico es una suma auditable**, del peso de cada entregable por el código de
  idoneidad de su revisión vigente. Y una `B` no es el 100 %: queda la obligación de resolver
  los comentarios.
- **Nunca se sobreescribe una revisión: se emite otra**, para poder contestar qué decía el plano
  cuando se aprobó la etapa.
- **La observación tiene un ciclo de vida y dos anclas** —documento (revisión, página,
  coordenada) y modelo (GUID de IFC + viewpoint)—, así que este registro es la mitad ya
  construida de la Fase 4. Y **no se cierra sin decir cómo**.
- **Quien abre una observación es quien la cierra.** El `Proyectista` sube y responde; si
  cerrara, el registro sería «yo mismo declaro que lo arreglé».
- **Subir es entrada hostil**: extensión, **firma real** de los primeros bytes y tamaño, y **el
  nombre del cliente nunca llega al sistema de archivos** — la clave se construye con el sha256 y
  el nombre original vive en la base de datos.
- **Avisar es la función.** Correo al asignar con el enlace, la fecha y la descripción; resumen
  por tramos (vencido, 7, 15, 30 días) desde un comando con su fila en `JobRun`. **No se manda un
  resumen vacío** —enseña a archivar el remitente— y **un responsable sin correo se registra**.
- **El expediente**, copiado del `dossier.py` de AeroControl: contesta «¿esto está completo y
  documentado?» nombrando cada fila que falta con el atajo que la cierra, y omitiendo los botones
  que el usuario no puede ejecutar.
- **La matriz de roles queda completa**, y un `Mandante` **no ve lo que está en curso**: eso no
  lo puede decir un permiso —`view_revision` no distingue una `S0` de una `A1`— así que lo pone
  la vista, con la regla en un solo sitio.

**Comprobado en el navegador con el servidor corriendo:** un ejecutable renombrado a `plano.pdf`
se rechaza con 400 y nada llega al disco; el PDF real queda en el disco como
`716-LCD/716-LCD-AR-P-001/14fb1bb0a3f7….pdf` —el nombre con guiones largos y acentos no lo
tocó— y la pantalla lo devuelve tal cual; el expediente se actualiza solo; la observación se
crea con su responsable y su aviso; y **la auditoría registró todo con acciones con nombre,
incluidos los intentos rechazados**.

**122 pruebas, 92 % de cobertura**, con el ciclo completo de un entregable automatizado.

### Corregido — Tres defectos del validador de archivos, encontrados por sus propias pruebas (2026-08-26)

- **`latin-1` nunca falla.** Asigna un carácter a cada uno de los 256 bytes, así que un
  ejecutable renombrado a `.dxf` pasaba el filtro entero. Ahora se comprueba lo que sí distingue
  un texto de un binario: que no lleve bytes nulos y que casi todo sea imprimible.
- **`carpeta//doble.pdf` no se rechazaba.** Partiendo el separador con `[/\\]+`, un `//` se
  colapsaba en uno y el tramo vacío desaparecía sin que nadie lo viera.
- **`../../etc` salía como `..-..-etc`.** No es una fuga —no queda separador— pero es un nombre
  de carpeta que parece una, y hace perder el tiempo a quien audite el disco.

### Pendiente conocido — Control documental

- **`F8.6`: ver y comentar el PDF en el navegador** con **EmbedPDF** (MIT). Es el «comentar en
  línea sin descargar» de MineDoc. Hoy la observación sobre un documento guarda su página y su
  coordenada y **no hay quien las dibuje**.
- **`F8.7`: emitir el transmittal desde la pantalla.** El modelo está y se prueba —no se emite
  vacío ni sin destinatario—, pero la pantalla solo lista.

### Añadido — Portal de ingreso y credenciales (2026-08-26)

`services/api` existe: Django 6 + uv, con la **forma** de AeroControl y base de datos propia. Se
portó lo que esa aplicación ya tenía probado en producción —1440 pruebas con datos reales de la
DGAC— y no su dominio.

- **El portal de ingreso.** `django.contrib.auth` endurecido: axes **delante** del backend real
  para cortar un intento bloqueado antes de comprobar la contraseña, bloqueo **por nombre de
  usuario** —detrás de un proxy toda petición llega de la misma dirección, así que una clave por IP
  sería inútil o falsificable—, sesión con tope de 12 h y expiración deslizante, y **un solo
  mensaje de error, genérico**: distinguir «no existe ese usuario» de «esa no es la contraseña» le
  regala a quien prueba credenciales la mitad del trabajo.
- **Sin auto-registro.** El primer usuario sale de `createsuperuser` y el resto los crea un
  administrador. Una aplicación de control documental donde cualquiera se da de alta no controla
  nada. El cambio de contraseña vive **dentro** de la aplicación, para que nadie tenga que entrar
  al `/admin/` técnico a rotar su propia credencial.
- **`/api-token/` con throttle propio.** `ObtainAuthToken` de DRF viene con
  `throttle_classes = ()`, o sea que deja fuera del límite global justo al único endpoint que
  acepta pares usuario/contraseña sin autenticar: sin esto es un oráculo de contraseñas.
- **Los roles como dato** (`apps/accounts/roles.py`): Administrador, Coordinador BIM, Proyectista,
  Revisor y Mandante, más **Dirección**, que no es un rol sino un grupo de notificación con cero
  permisos. Un nombre de permiso mal escrito **para** el comando `bootstrap_roles`.
- **El contrato de permisos, en `AGENTS.md`.** Toda superficie de lectura pide un `view_*`
  explícito; `LoginRequiredMixin` solo no alcanza; un modelo acotado por organización acota el
  queryset y no solo comprueba el permiso; y **cada vista nueva trae su prueba de 403**. Es lo que
  de verdad hizo robusto a AeroControl, y es agnóstico del stack.
- **El rol de lectura es una lista blanca, nunca un patrón.** El `Viewer` de AeroControl era «todo
  permiso que empiece por `view_`», y eso le entregaba en silencio los tokens de API, la lista de
  usuarios, las sesiones y la auditoría. Hay una prueba que falla si aparece uno de esos en
  `Mandante`.
- **Piezas portadas con su historia:** `BaseModel` (archivar, no borrar), `AuditEvent` de solo
  agregar con `sequence` —porque `created_at` no basta para ordenar dos filas del mismo instante—,
  el middleware de auditoría y CSP, `mail.py` (no decir «enviado» cuando el correo solo se
  imprimió), `jobs.py` con la fila que nace en `running`, la exportación CSV que neutraliza
  fórmulas, y el acotado por organización.
- **SQLite en WAL.** La auditoría escribe en cada petición que muta, y con los 5 s por defecto
  AeroControl tuvo «database is locked» intermitentes que su propio `except` se tragaba: eventos
  perdidos en silencio.

**Comprobado contra un servidor corriendo:** un `Mandante` ve en el portal solo Organizaciones y el
visor, y pedir a mano `/administracion/usuarios-y-roles/` le devuelve **403**, no la página; un
`Coordinador BIM` ve además Trabajos programados y puede abrirlo; un `Administrador` lo ve todo. Y
el bloqueo por intentos es real: al quinto fallo la respuesta pasa a **429** y **la contraseña
correcta también recibe 429** mientras dura el enfriamiento, mientras otro usuario sigue entrando.

**Gate propio** (`services/api/scripts/verify.ps1`), el mismo que AeroControl: `check`,
`check --deploy`, `makemigrations --check`, `pytest --cov`, `ruff`, `bandit` y `pip-audit`. **64
pruebas, 89 % de cobertura.**

### Corregido — Un gate que decía «verde» estando rojo (2026-08-26)

La primera versión de `verify.ps1` imprimió «Gate en verde» con `ruff format` fallando:
`$ErrorActionPreference = "Stop"` **no cubre a un ejecutable nativo** que devuelve un código
distinto de cero. Cada paso pasa ahora por una función que mira `$LASTEXITCODE`. Es la misma clase
de defecto que la `F7.13` marcada cerrada, y por eso va escrito.

### Pendiente conocido — Portal

- **El catálogo de traducciones (`locale/es/`) no existe todavía**, así que la interfaz muestra las
  cadenas fuente en inglés donde Django no traduce por su cuenta. La convención está puesta —el
  código escribe en inglés y el español vive en el catálogo— pero el catálogo hay que generarlo.
- **La matriz de roles solo cubre los modelos que existen hoy.** Se completa con los entregables.
- `services/worker` no existe: los jobs pesados de `ifcopenshell` siguen pendientes (`F3.4`).

### Corregido — Fidelidad del plano 2D (2026-08-26)

`F7.13` estaba marcada cerrada y la pantalla decía otra cosa: el usuario volvió con «el 2D no
representa los colores, las formas ni las figuras como se esperaba». Medido contra
`ACAD-Piso 5_Base.dxf` y `Base1.dxf` no era una brecha, eran **quince**.

**El color, resuelto donde el CAD lo pone** (`F7.15`):

- **La capa `0` dentro de un bloque no es la capa `0`**: AutoCAD la sustituye por la capa del
  `INSERT`. Eran 116 entidades en `Base` y 140 en `Base1` que se quedaban en la capa `0` literal
  y salían casi blancas. Era la brecha de color más grande.
- **`62 = 0` es «por bloque»**, no «por capa» (37 entidades), y el trazo `BYBLOCK` tampoco es
  `BYLAYER` (54, que se dibujaban llenas).
- **El signo negativo del código 62 es «capa apagada»**, y se descartaba con un valor absoluto:
  `0-AREA UTIL` (`62 = -201`) está apagada en AutoCAD y el visor la pintaba violeta encima del
  dibujo. Se lee también el congelado y `Defpoints`. La geometría se conserva y la capa arranca
  oculta, con el ojo cerrado en la lista.
- **Color verdadero (420) y transparencia (440)**, que se ignoraban del todo.
- El color pasa a ser un `DxfColor` con su valor, su índice ACI y **de dónde salió** — entidad,
  capa, bloque o por defecto. Sin la procedencia, «por qué esto se ve de este color» solo se
  contesta leyendo el archivo a mano. Y el visor deja de resolver color: se le quitó el
  `?? capa.colorIndex` que no sabía nada de bloques.

**La forma** (`F7.16`):

- **El grosor de trazo (código 370) no se leía en ninguna parte**, y `LineBasicMaterial` ignora
  su `linewidth` en WebGL: todo salía a un píxel y un muro pesaba lo mismo que una cota. Se
  siguen la cadena entidad → capa → `$LWDEFAULT` y se dibuja con `LineSegments2`.
- **Los rayados se rayan.** Los 23 `HATCH` del plano real son `ANSI31` y se dibujaban solo con
  su contorno: 23 recuadros vacíos donde el CAD dibuja un muro rayado.
- **El espacio papel (código 67) no es el dibujo.** El marco de la lámina es la _causa_ del plano
  de 480 metros que antes se rodeaba midiendo el trazo más largo.
- El `bulge` del contorno de un relleno se leía y se tiraba, así que un macizo de muro curvo se
  cerraba con la cuerda.

**Lo que no se dibujaba** (`F7.17`): las 12 cotas y las 11 llamadas —o sea **todo el acotado**—,
los atributos de bloque, las 10 elipses de `Base1`, la `POLYLINE` clásica (cuyos `VERTEX` se
descartaban en silencio), las matrices de `INSERT` (de una reja de veinte pilares se dibujaba
uno) y la extrusión hacia −Z, que sale espejada.

**El texto** (`F7.18`): los 433 textos salían **todos centrados** cuando 398 van arriba a la
izquierda; un texto justificado se coloca con su segundo punto y no con el primero; un `MTEXT`
de cuatro renglones se aplastaba a uno y se cortaba a 60 caracteres; y con 433 textos el plano
**arrancaba sin un solo rótulo**, porque el tope era un conteo de 150 en vez de una densidad.

**Y el plano se dibuja opaco.** Las opacidades estaban inventadas entre 0,35 y 0,9 y el CAD es
opaco; lo que evita que un macizo tape el contorno del muro que rellena es el orden de dibujo,
no la transparencia. La postproducción `COLOR_PEN_SHADOWS` **se apaga en Modo 2D**: está para que
se lea un modelo, y sobre un dibujo de líneas filtra los colores.

### Medido al cerrar (2026-08-26, sobre `ACAD-Piso 5_Base.dxf`, 1,5 MB)

| Qué                 | Antes                  | Ahora                                        |
| ------------------- | ---------------------- | -------------------------------------------- |
| Trazos              | 5.608                  | **5.711**, con las cotas y las llamadas      |
| Textos              | 380                    | **433**, con los atributos de bloque         |
| Renglones dibujados | **0** (arrancaba mudo) | **498 de 498**, ninguno descartado           |
| Rellenos            | 23 contornos vacíos    | **23 rayados `ANSI31`**                      |
| Grosores            | todo a 1 px            | **242 trazos a 0,30 mm** contra 5.469 a 0,25 |
| Espacio papel       | dentro del dibujo      | **10 entidades fuera**, contadas aparte      |
| Texturas de rótulos | 7 por plano            | **8 en la escena** con los dos planos        |
| Carga en la escena  | —                      | **137 ms**, sin un error en consola          |

Y `Base1.dxf` pasa de 27 × 82 m a **27 × 25 m** —un edificio creíble— porque las capas apagadas
dejaron de contar para la extensión, y sigue deduciendo centímetros como estaba documentado.

**El clic no se rompió**, que era el riesgo: `LineSegments2` es una malla y su geometría ya no son
pares de vértices, de los que dependen el clic con el largo del tramo (`F7.10`) y el ajuste al
cruce (`F7.11`). Donde hace falta grosor se dibujan dos objetos: la malla, y la línea de siempre
con el material apagado —que no se dibuja, no cuesta una pasada y sigue contestando—. Comprobado
en el navegador: un clic sobre `0-MUROS` devuelve 0,71 m, el largo exacto del segmento.

### Añadido — Que la fidelidad del 2D sea reproducible (2026-08-26)

- **`apps/web/public/samples/fidelidad-2d.dxf`**: fixture sintético escrito a mano con un caso
  por cada defecto corregido. Nada de esto era comprobable en CI —`.gitignore` excluía `*.dxf`
  sin excepción y no había un solo plano versionado—, y los planos del usuario no se confirman.
- **Modo `plano` en `diag.html`**: el informe de fidelidad que la frase «el 2D no se ve como en
  el CAD» necesita para poder depurarse. Por tipo de entidad, cuántas entraron y cuántas
  quedaron fuera; por capa, su color **con su procedencia**, su grosor y si está apagada.
- **`hatchLines` en `bim-core`, con 8 pruebas.** El recorte por paridad de un rayado falla en
  silencio: una raya que pasa por un vértice invierte la paridad y sale **el negativo del
  relleno**, que a primera vista parece un rayado válido. Vive en el dominio por la misma razón
  que `segmentIntersection`.

**182 pruebas** en `bim-core`, contra 139. Las nuevas cubren lo que no tenía ninguna: capa
apagada, congelada y `Defpoints`, capa `0` en bloque, `BYBLOCK`, espacio papel, color verdadero,
grosor, matriz de `INSERT`, `POLYLINE` con `bulge`, atributos, cota por su bloque anónimo,
elipse, `MULTILEADER` con sus dos trampas de códigos, extrusión negativa, y el rayado entero.

### Pendiente conocido

- **`POINT` y `WIPEOUT` no se dibujan, y se cuentan.** Un punto se dibuja como un punto
  —invisible a escala de plano, y los 36 del plano real están en `Defpoints`, que no se imprime—
  y un enmascaramiento **tapa** lo de abajo, que es un efecto y no un trazo. Son 492 en el plano
  real: en un visor cuyo objeto es cruzar plano y modelo, una máscara opaca taparía el modelo.
- **`SPLINE`, `MLINE`, `XLINE`, `RAY` y `ACAD_TABLE`** siguen contados sin dibujar. No aparecen
  en los planos del usuario.
- **La caja para clicar un rótulo girado sigue siendo alineada a los ejes.** Ya lo era antes; con
  la alineación real se nota algo más en rótulos muy girados.
- **Los cinco pedidos de la nota del 2026-08-19** entran al plan como `F1.12` a `F1.16` y no se
  tocaron: la preselección al pasar el cursor, el panel de abajo, la medición de distancia en uso
  real, el modo fantasma al mover y las sombras del renderizado.

### Añadido — Fase 0, andamiaje y mediciones (2026-08-19)

- **Monorepo npm** con tres paquetes: `packages/bim-core` (dominio puro, sin React ni
  Three.js), `packages/viewer` (envoltura de That Open, para aislar su API) y
  `apps/web` (React 19 + Vite 8 + Tailwind 4). Build, lint, formato y pruebas verdes.
- **GUID de IFC** (`IfcGloballyUniqueId`) en `bim-core`: compresión, expansión y
  validación, con 49 pruebas. **Verificado contra un oráculo externo**: los 579 GUID
  únicos de un modelo real exportado por BricsCAD sobreviven el round-trip sin una sola
  diferencia. Una muestra quedó como test de regresión.
- **Unidades de longitud** en `bim-core`: prefijos SI y unidades imperiales con sus
  factores exactos. Ante una unidad desconocida devuelve `null` en vez de asumir metros,
  porque asumir ahí coloca un modelo en el lugar equivocado sin que nadie se entere.
- **Visor** con carga de IFC, encuadre automático y panel de métricas, más el WASM de
  `web-ifc` servido localmente (sin CDN, coherente con el local-first).
- **Página de diagnóstico** `apps/web/public/diag.html`, que ejecuta el pipeline sin la
  interfaz para separar problemas del visor de problemas de integración.
- **Fixture** `muro-minimo.ifc`: un IFC2X3 sintético de 2 KB en milímetros, que además
  delata errores de conversión de unidades.

### Medido sobre un modelo real (IFC2X3 de BricsCAD, 1,52 MB, en milímetros)

| Qué                    | Resultado                                  |
| ---------------------- | ------------------------------------------ |
| Abrir y ver el modelo  | **0,6 a 1,2 s** en la aplicación           |
| Tamaño del `.frag`     | 113 KB — **13,7× más chico** que el IFC    |
| Contenido reconocido   | 548 elementos con geometría, 15 categorías |
| Dimensiones informadas | 21,8 × 3,0 × 22,7 m                        |

Las dimensiones son la comprobación de unidades: el modelo viene en milímetros y el visor
informa metros plausibles. `F0.4` y `F0.5` quedan cumplidas.

### Corregido

- **La conversión no terminaba nunca, y sin emitir error.** La causa era el aislamiento de
  origen: con `crossOriginIsolated` en `true`, `web-ifc` elige su WASM **multihilo**, que
  no funciona empaquetado —los workers de pthreads arrancan con una URL `undefined` y
  mueren con `Unexpected token '<'`—. Se quitaron las cabeceras COOP/COEP, que además
  habían sido agregadas creyendo que hacían falta: eran justo lo que activaba el camino
  roto. El visor ahora **falla al arrancar con un mensaje explícito** si detecta
  aislamiento de origen, en vez de colgarse.
- **`IfcLoader.load` quedó fuera** en favor de `FRAGS.IfcImporter` + `core.load`: dos pasos
  explícitos, medibles por separado, y alineados con `F0.6`.
- **El tamaño del Fragments se reportaba como 0 B.** `core.load` transfiere el búfer al
  worker y lo deja con `byteLength = 0`; ahora se anota antes de cargar.

### Corregido tras la primera prueba de uso (2026-08-19)

- **Cargar un segundo IFC fallaba** con `Aborted(both async and sync fetching of the wasm
failed)`. Se creaba un `IfcImporter` por carga, y el primero libera el WASM de `web-ifc`
  —que vive en una variable de módulo— dejando al segundo sin nada que cargar. Ahora se
  reutiliza. **Con eso `F1.5` pasa a funcionar**: dos modelos abiertos a la vez, cada uno con
  su árbol y sus métricas.
- **Al orbitar se seleccionaban elementos sin querer.** Un arrastre termina en `click`, así
  que cada giro de cámara seleccionaba lo que hubiera bajo el cursor y, en modo medición,
  consumía puntos. Ahora se compara dónde se pulsó con dónde se soltó, con 4 px de margen.

### Cambiado — el render ya no es plano

`SimpleScene` y `SimpleRenderer` dieron paso a **`ShadowedScene`** con
**`PostproductionRenderer`** en modo `COLOR_PEN_SHADOWS`: sombras proyectadas, oclusión
ambiental y **aristas dibujadas**. La referencia es BricsCAD, donde las líneas de los
elementos están siempre presentes y son las que dejan leer el modelo; sin ellas todo era el
mismo blanco plano.

### Medido — un modelo de 32,7 MB, para `F0.6`

| Modelo           | Conversión | Hasta verlo | Fragments            |
| ---------------- | ---------- | ----------- | -------------------- |
| Piso 5 (1,5 MB)  | 1,11 s     | 2,20 s      | 113 KB — 13,7× menos |
| Grande (32,7 MB) | **9,53 s** | **9,82 s**  | 1,5 MB — 22,3× menos |

La conversión corre en el hilo principal, así que esos 9,5 s son de interfaz congelada. La
respuesta se inclina a un **Web Worker** antes que a un backend: sigue siendo cliente y
respeta el local-first.

### Añadido — psets verificados, y el corte con captura (2026-08-19)

- **Fixture `muro-con-psets.ifc`**, escrito a mano con un `Pset_WallCommon` y unas
  `BaseQuantities`. Cierra `F1.2` sin depender de un reexport: el panel muestra los siete
  valores con sus tipos bien traducidos (booleanos como "sí"/"no", real `0.35`, etiqueta
  `F-60`).
- **El corte quedó verificado también en imagen**, sobre el modelo real: se ve el plano con
  su manija de arrastre y el edificio seccionado mostrando el interior.

### Corregido — el panel mostraba once bloques donde debía mostrar dos

Solo se vio con psets de verdad. Las relaciones de IFC son de doble sentido, así que cada
propiedad reaparecía como bloque propio y el elemento se listaba a sí mismo. Ahora las
relaciones ya leídas (`HasProperties`, `Quantities`) no se recorren otra vez, el propio
elemento se excluye de sus relacionados, y un pset se titula con su nombre en vez de
`IFCPROPERTYSET · nombre`. De paso entraron las cantidades, que antes no se leían: viven en
`Quantities`, no en `HasProperties`.

### Pendiente conocido — las cantidades de longitud salen en las unidades del modelo

`Length 4000` son 4000 mm, pero el panel no lo dice porque **no sabe la unidad**: los
metadatos que expone Fragments traen esquema, nombres y CRS, no `IfcUnitAssignment`.
Convertir exige leer las unidades del IFC crudo durante la carga; `bim-core` ya tiene
`parseLengthUnit` y `toMeters` para eso. Hasta entonces el valor se muestra tal como está en
el archivo, sin inventar una unidad. Áreas y volúmenes no tienen el problema: el IFC los
declara en metros.

### Añadido — cortes y mediciones completas, `F1.3` y `F1.4` (2026-08-19)

- **Cortes por tres ejes**, con el plano arrastrable y un botón para quitarlos. Verificado con
  el contador de planos: 0 → 1 → 2 → 3 y de vuelta a 0. El efecto visual **no se pudo
  capturar** porque el panel de vista previa dejó de componer.
- **Ángulo y área**, que faltaban para cerrar `F1.4`. El área se recalcula con cada vértice,
  así que se ve crecer mientras se recorre el contorno. Medido sobre el modelo real: 1,131 m,
  19,4° y 1,92 m² con 6,88 m de perímetro.
- **La geometría de las mediciones se mudó a `bim-core`**, donde tiene 18 pruebas contra casos
  elementales: el cuadrado unitario mide 1 m², el triángulo 3-4-5 mide 6 m², el ángulo recto
  da 90°. Son números con consecuencias —alguien pide material con un área— y no deben vivir
  sin pruebas en la capa de dibujo. Dos casos que delatan una mala implementación: un polígono
  a 300 m del origen debe medir lo mismo, y **un faldón inclinado mide su superficie real
  (√2 m²), no su sombra en planta (1 m²)**.

### Corregido — el árbol mentía sobre lo que estaba oculto

El estado de visibilidad vivía dentro de cada fila del árbol, así que **Ver todo** restauraba
el modelo pero los iconos seguían marcando lo oculto. Ahora el estado vive fuera y el icono
dice la verdad; aislar también lo limpia, porque aislar deja todo lo demás oculto y los
iconos dejarían de corresponder.

### Añadido — modos de vista y medición, `F1.7` y `F1.4` (2026-08-19)

A pedido del usuario. Una barra bajo el modelo agrupa lo que cambia **cómo** se mira,
separado del árbol, que cambia **qué** se mira:

| Grupo          | Opciones                   | Verificado                                                   |
| -------------- | -------------------------- | ------------------------------------------------------------ |
| Proyección     | Perspectiva · Ortográfica  | La cámara pasa de `PerspectiveCamera` a `OrthographicCamera` |
| Navegación     | Órbita · Planta · Interior | Los tres modos se activan sin error                          |
| Representación | Sólido · Fantasma          | ✅                                                           |
| Medir          | Distancia entre dos puntos | Midió 0,858 m sobre el modelo real                           |

- **La cámara pasó a `OrthoPerspectiveCamera`.** La ortográfica es la que importa para una
  oficina técnica: sin fuga, dos muros del mismo largo se ven del mismo largo.
- **"Fantasma", no "wireframe", y a propósito.** Se logra con materiales translúcidos, no
  dibujando aristas. Fragments tiene una representación de alambre (`CurrentLod.WIRES`) pero
  la reserva para su nivel de detalle automático y no la expone. Llamarlo wireframe sería
  vender otra cosa.
- **La medición es propia.** Las anotaciones de That Open están atadas a los planos 2D, así
  que medir en 3D usa el raycast con ajuste a vértice, arista y cara **en ese orden**. Sin la
  cara como respaldo, medir es un juego de puntería contra las esquinas.
- **Falta área y ángulo** para cerrar `F1.4`.

### Corregido — dos copias de Three.js en la página

El navegador avisaba "Multiple instances of Three.js being imported": los paquetes de That
Open están fuera del pre-bundling y resolvían `three` por su ruta de archivo, mientras la
aplicación usaba la copia pre-empaquetada. Dos copias son dos jerarquías de clases, y un
`instanceof` puede fallar sobre un objeto que sí es de ese tipo — la clase de fallo que
aparece meses después y no se entiende. `resolve.dedupe` no basta: hay que excluir `three`
del pre-bundling.

### Añadido — árbol espacial, `F1.1` (2026-08-19)

- **Panel de estructura** que recorre el modelo, con **aislar** en un clic, **ocultar** por
  nodo y **Ver todo** para restaurar. Verificado sobre el modelo real: aislar `IFCDOOR (10)`
  deja exactamente las diez puertas en pantalla.
- Los nombres se resuelven en **una sola consulta por modelo** (con `LongName` de respaldo,
  que es donde muchos exportadores ponen el nombre de plantas y edificios).
- **Los grupos de más de 30 elementos no se listan**: el modelo de prueba tiene 470
  `IfcBuildingElementProxy` y listarlos da un árbol que nadie recorre. El grupo sigue siendo
  aislable completo.

Lo que costó entender: **Fragments ya agrupa por categoría**. Un nodo con `category` y sin
`localId` es un grupo; uno con `localId` es el elemento, y hereda la categoría del grupo.
Reagrupar por encima producía niveles fantasma etiquetados "sin categoría".

### Añadido — selección con propiedades, `F1.2` (2026-08-19)

- **Un clic sobre el modelo abre la ficha del elemento**: categoría, GUID, tipo y material,
  con el elemento resaltado en el violeta de la marca. Sobre el modelo de prueba, clicar
  una viga informa `IFCBEAM`, su tipo `Concrete, Plain 510.29` y su material.
- **El GUID se valida con `bim-core` antes de mostrarlo.** Un GUID mal formado no sirve
  como identidad, y es mejor detectarlo al seleccionar que al exportar un BCF.
- **Vista inicial isométrica** y botón **Encuadrar**.

Lo que el modelo real enseñó, y quedó en el código: el GUID vive en `_guid` (no en
`GlobalId`), la categoría en `_category`, y las relaciones de IFC **tienen ciclos**
—`IsDefinedBy` → tipo → `ObjectTypeOf` devuelve todos los elementos del mismo tipo—, así
que esa relación se ignora y el recorrido se limita a dos niveles.

### Corregido — la cámara no obedecía

Eran dos causas encadenadas: camera-controls **solo mueve la cámara dentro de
`update(delta)`**, y **`fitToBox` pisa los ángulos**, así que girar antes de encuadrar no
dejaba rastro. Con el orden invertido —encuadrar primero, rotar después— y un `update`
explícito, la vista inicial es la isométrica esperada.

### Pendiente conocido

- **Los psets no se han verificado contra un archivo real.** El código los lee, pero el
  modelo de prueba se exportó sin ellos (`IfcExportBaseQuantities: Off` en su cabecera), así
  que hace falta un IFC que los traiga para cerrar ese punto. Mientras tanto el panel
  muestra tipo y material, que es la información que sí llega.

### Añadido — arranque del repositorio (2026-08-18)

- **Arranque del repositorio** (2026-08-18). AeroBim se separa de AeroPlanner como
  producto propio: visor y coordinador BIM en el navegador — modelos IFC, nubes de
  puntos, temas de coordinación en BCF y detección de interferencias.
- `MASTER_PLAN.md` con siete fases, cada una con criterio de salida y oráculo de
  verificación, más los riesgos abiertos. `F0.4` (abrir un IFC real y medir el
  rendimiento) queda marcada como la tarea que puede invalidar el stack elegido.
- `AGENTS.md` con las convenciones obligatorias: el GUID de IFC como única identidad,
  unidades explícitas en los nombres, CRS declarado en toda coordenada, y
  `packages/bim-core` sin dependencias de interfaz.
- `docs/REFERENCES.md` con el estudio de alternativas open-source y **las licencias
  verificadas** contra la API de GitHub, npm y PyPI.
- `docs/ARCHITECTURE.md`, `docs/MVP.md` y `docs/INTEGRATION_AEROPLANNER.md`.
- Marca `assets/aerobim-mark.svg`: el dron común de la familia —mismos brazos, mismos
  cuatro rotores, mismo fuselaje— con un cubo isométrico como motivo propio, en
  violeta `#9B5DE5`. Es el cuarto color de la familia, junto al turquesa de
  AeroControl, el ámbar de AeroPlanner y el amarillo de AeroLink.

### Decisiones registradas

- **That Open Company para el visor** (MIT / MPL-2.0), no xeokit. xeokit es superior en
  varios puntos —doble precisión para coordenadas globales, IFC y nube de puntos en una
  misma escena listos para usar— pero es AGPL-3.0: servir la aplicación obligaría a
  liberarla completa o a pagar licencia comercial. La decisión es legal, no técnica, y
  queda registrada como tal para no reabrirla con información incompleta.
- **El backend llega en la Fase 3**, no antes. Las fases 0 a 2 corren enteras en el
  navegador: un visor que exige servidor para abrir un archivo local contradice el
  local-first de la familia.
- **Speckle queda como referencia**, no como dependencia: adoptarlo condicionaría toda
  la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo.
- **Lo geoespacial se queda en AeroPlanner.** Ortofoto, DEM, curvas de nivel y la nube
  del vuelo cierran allá el ciclo de planificación. Las nubes de puntos se reparten por
  propósito: producto del vuelo en AeroPlanner, as-built contra modelo en AeroBim.
