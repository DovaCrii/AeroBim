# Fase 3 — Persistencia y backend

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 3 — Persistencia y backend

**Objetivo de salida:** los modelos dejan de vivir en la pestaña del navegador: se
guardan por proyecto, con versiones y con quién subió qué.

| #       | Tarea                                                                                                | Estado                                       |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `F3.1`  | API en Python (Django + DRF, como AeroControl): proyectos, modelos, versiones, usuarios y permisos   | ✅ ver abajo                                 |
| `F3.2`  | Almacenamiento de archivos con validación de tipo, tamaño y nombre — nunca el nombre del cliente     | ✅ ver abajo                                 |
| `F3.3`  | Extracción de metadatos con `ifcopenshell`: esquema, unidades, georreferenciación, conteo por tipo   | ✅ ver abajo                                 |
| `F3.4`  | Jobs asíncronos (Celery) para lo que tarde: conversión, extracción, validación                       | ✅ decidida: no, y con el número — ver abajo |
| `F3.5`  | Validación **IDS** con `ifctester`: el modelo cumple o no el requisito de información del proyecto   | ✅ ver abajo                                 |
| `F3.10` | **El IDS de partida**: qué trae el modelo, medido, y el requisito que sale de esa medición           | ✅                                           |
| `F3.6`  | **Levantar `services/api`**: Django 6 + uv, con la forma de AeroControl y base de datos propia       | ✅                                           |
| `F3.7`  | **Portal de ingreso**: `django.contrib.auth` endurecido con axes, sin auto-registro                  | ✅                                           |
| `F3.8`  | **Roles y el contrato de permisos**: la matriz como dato, el guardián, y la prueba de 403            | ✅                                           |
| `F3.9`  | **Los módulos y cómo se entra a cada uno**: portal por etapa de trabajo, filtrado por permiso        | ✅                                           |
| `F3.11` | **Ponerlo en la VM**: driver de PostgreSQL, servidor de aplicación, `/health/` y unidades de systemd | ✅ ver abajo                                 |
| `F3.12` | **Vistas que se pueden pasar**: la vista del modelo sale del navegador y vive en el proyecto         | ✅ ver abajo                                 |

**Criterio de aceptación:** un modelo subido sobrevive al cierre del navegador, y
la versión anterior sigue recuperable.

### `F3.4` decidida: la petición espera, y con el número delante (2026-09-02)

**La decisión la tomó el usuario** cuando la pantalla de interferencias la forzó: la corrida tarda
**20 s medidos** por par de modelos, y esos veinte segundos **caben de sobra en los ciento veinte**
que da el servidor. Una cola traería un broker, un proceso trabajador, su unidad de systemd y una
forma nueva de fallar callada —un trabajo encolado que nadie procesa no da error— a cambio de
ahorrar una espera que se puede anunciar.

Así que **se anuncia**: el botón dice cuánto tarda **antes** de pulsarlo, porque uno que deja la
pantalla quieta sin explicación se pulsa dos veces. Y la corrida deja su fila en `JobRun`, que es
donde se ve una que murió a mitad.

**Lo que reabriría la cola, escrito para no volver a discutirlo por intuición:** que un par de
modelos reales pase de **60 s** —la mitad del tiempo del servidor— o que una obra tenga tantos
modelos que la corrida completa se acerque a ese tope. Con cuatro modelos son seis pares, unos dos
minutos: **ahí ya conviene la cola**, y el número está.

### Y antes de eso: los tres trabajos «que tardan», medidos — y no tardaban (2026-08-28)

La fila pedía **Celery** para «lo que tarde: conversión, extracción, validación», y esa premisa
nunca se había medido entera. Se midió, sobre los tres modelos y con los tres trabajos que hoy
corren **dentro de la petición**:

| Trabajo           | `muro-con-psets` (2 KB) | `Piso 5` (1,5 MB) | Real (**32,7 MB**) |
| ----------------- | ----------------------- | ----------------- | ------------------ |
| `ifc.extraer`     | 116 ms                  | 81 ms             | **1.397 ms**       |
| `cobertura.medir` | 14 ms                   | 91 ms             | **1.529 ms**       |
| `ids.validar`     | —                       | —                 | **668 ms**         |

**Ninguno llega a dos segundos sobre el modelo real de la organización**, y los tres juntos no
llegan a cuatro. Montar Celery para eso sería pagar un **broker, un proceso trabajador, su unidad de
systemd y una forma nueva de fallar en silencio** —un trabajo encolado que nadie procesa no da
error: simplemente no pasa nada, que es la lección que ya está escrita en `apps/core/jobs.py`— a
cambio de ahorrar segundo y medio.

**Y la «conversión» de la fila ya no vive aquí.** `F0.6` la movió a un **Web Worker del navegador**:
son 9,5 s para el IFC de 32,7 MB y **ninguno de ellos ocurre en el servidor**. La fila se escribió
antes de esa decisión y arrastraba el trabajo más pesado de los tres.

**Qué haría falta para que proceda, dicho como número y no como intuición**: que un trabajo pase de
**30 s** —la cuarta parte del `timeout` de gunicorn— sobre un archivo que la organización recibe de
verdad. Los candidatos son un IFC federado bastante mayor que 32,7 MB, o un IDS de proyecto con
cientos de especificaciones en vez de las que genera `F3.10`. **Ninguno de los dos existe todavía
como archivo que mirar**, y es la misma razón por la que `F4.6` sigue en espera.

Hasta entonces, el `timeout` de 120 s de `config/gunicorn.conf.py` deja de ser un parche con fecha y
pasa a ser holgura: **dos órdenes de magnitud** sobre lo medido.

### `F3.12`: una vista guardada que no se le puede pasar a nadie (2026-08-28)

**Es el objetivo de salida de esta fase aplicado a lo que quedaba dentro de la pestaña.** Las vistas
guardadas sobrevivían a recargar la página y **no salían del equipo** —lo decía el pie de su propia
sección—, así que dos personas revisando el mismo modelo no podían mirar lo mismo. Coordinar es
exactamente eso, y la limitación pasó de aceptable a molesta en cuanto la coordinación se metió
dentro del visor.

**No es «la misma vista, pero en el servidor», y esa es la decisión de fondo.** Una vista local está
escrita en el idioma de **esa sesión**: coordenadas de la escena —con el eje Y hacia arriba, que es
una convención de Three.js— y `localId` de Fragments para lo oculto, que es el identificador del
motor y cambia entre versiones del modelo. `savedView.ts` ya lo dejó anotado hace días: su clave
**no sirve** para un viewpoint. Guardar eso en una base de datos sería meter dos convenciones
internas en un dato que va a durar más que ellas.

Una vista compartida está escrita en el idioma del **modelo**:

| Qué        | Cómo viaja                                                          |
| ---------- | ------------------------------------------------------------------- |
| La cámara  | Ya en el sistema del IFC — lo mismo que escribe `F4.1`              |
| Lo apagado | Por **GUID**, con la forma de un `Visibility` — lo que cerró `F4.7` |
| Los cortes | Normal y origen, también en el sistema del IFC                      |

O sea: **es un viewpoint de BCF con nombre y con cortes**, y eso no es casualidad — es la
consecuencia de exigirle que sobreviva a quien la escribió. **Por eso `F4.7` iba primero**, aunque
en el orden de valor esta estaba antes: sin la visibilidad por GUID, una vista compartida solo
habría podido llevar la cámara.

**Las locales no desaparecen, y las dos secciones conviven a propósito.** Una vista local es de
trabajo —«déjame esto como está mientras almuerzo»— y no cuesta nada: ni viaje al servidor ni
permiso que pedir. Compartir es un acto explícito. Puestas una debajo de la otra en el navegador, la
diferencia se lee sin explicarla.

**Se comparte lo que se está mirando, no una vista local ya guardada.** No es una simplificación: a
una vista local **le faltan dos datos** para armar un viewpoint —el «arriba» real de la imagen y el
alto de la vista ortogonal—, que son justo los que BCF exige y los que una vista de trabajo no
necesita. Convertirla obligaría a inventarlos.

Tres decisiones más que conviene tener escritas:

- **El modo de navegación no viaja.** Es cómo se mueve uno, no lo que se ve, y quien recibe la vista
  está mirando, no recorriendo: ponerlo cambiaría el control del ratón de otra persona sin que nadie
  se lo pidiera. La proyección sí, porque una ortográfica y una perspectiva del mismo sitio **no
  muestran lo mismo**.
- **Los cortes se descartan uno a uno; la cámara, entera.** Son independientes entre sí, y perder
  una vista completa porque un corte venía mal sería peor que aplicarla con los que valen. La cámara
  no admite eso porque media cámara no se dibuja — y una vista sin cámara se rechaza al compartirla,
  en vez de dejar en la lista del otro una fila que se pulsa y no hace nada.
- **La borra quien la compartió, y nadie más.** `delete_vistadeproyecto` dice «puede borrar vistas»,
  no «puede borrar **estas**»: sin la comprobación del autor, cualquiera con el permiso quita la
  vista que otro dejó preparada para una reunión.

El contrato de permisos, sin atajos: `view_vistadeproyecto` está en la lectura del proyecto —también
para el **mandante**, porque una vista es como se le enseña algo a alguien y él es a quien más se le
enseña— y `add_`/`delete_` van con quien trabaja el modelo. Con su prueba de 403 y su prueba de
aislamiento entre organizaciones, que son dos preguntas distintas.

**Comprobado en el navegador sobre `Piso 5.ifc`**, con dos elementos apagados y un corte puesto: se
captura, se deshace todo —modelo entero, sin cortes, cámara en otro sitio— y al aplicar la vista
vuelven los dos ocultos, el corte y la cámara. La posición guardada en el sistema del IFC era
`(13,404, −10,32, 14,863)` y la cámara acabó en `(13,404, 14,863, 10,32)` de la escena, que es
`ifcAEscena` exacta.

**439 pruebas en la API con 94,21 % de cobertura y 251 en `bim-core`**, gate en verde.

### `F3.11`: los tres huecos entre «pasa el gate» y «arranca en la VM» (2026-08-28)

Los tres se habían localizado leyendo el despliegue, no ejecutándolo, y los tres tienen la misma
forma: **la aplicación funciona en el equipo de desarrollo justamente porque ahí no se usan.**

- **`psycopg` no estaba declarado.** `DB_ENGINE=postgresql` reventaba al arrancar, y peor que
  reventar: el mensaje de Django nombra **`psycopg2`** —el paquete anterior—, así que manda a
  instalar el que no es. Ahora psycopg 3 y gunicorn viven en un grupo `deploy` aparte —ninguno de
  los dos pinta nada en un equipo con SQLite, y gunicorn ni siquiera instala en Windows— y
  `base.py` comprueba el driver **al cargar los ajustes**, con el comando exacto en el mensaje. La
  diferencia importa: fallando en la primera consulta, `systemctl start` informa `active` sobre un
  servicio que no sirve.
- **No había servidor de aplicación.** `config/gunicorn.conf.py`, con socket de UNIX en vez de
  puerto —un puerto local deja saltarse el proxy, y con él la terminación TLS y las cabeceras que
  pone— y `timeout` en **120 s**, no en los 30 de fábrica: convertir un IFC grande pasa del minuto
  y con el tiempo por defecto gunicorn mata al worker a mitad y sale un 502 sin explicación. Es un
  parche con fecha: lo que tarde más que eso es trabajo de `F3.4`.
- **No había `/health/` ni unidades.** Ahora hay las dos cosas, y una decisión escrita en cada una.

**`/health/` es la única ruta sin login, y por qué eso no rompe el contrato de `AGENTS.md`.** La
regla del `view_*` explícito se sostiene porque una superficie de lectura entrega **datos de
alguien**; esta no entrega ninguno. Contesta una sola pregunta —¿este proceso puede atender?— y la
tiene que poder hacer quien todavía no puede autenticarse. Por lo mismo **no dice de más**: sin
autenticar la respuesta no lleva rutas, ni versiones, ni el texto de una excepción, y hay una
prueba que lo comprueba con un nombre de carpeta reconocible. El detalle va al journal.

Comprueba las **tres formas en que esta VM se rompe callada**, y no todas pesan igual:

| Comprobación             | Si falla              | Por qué                                                                                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos            | `503`                 | Con `CONN_MAX_AGE` puesto hay que preguntarle de verdad: la conexión puede seguir abierta contra un servidor que ya se fue              |
| Directorio de documentos | `503`                 | **Es el que destruye datos en silencio.** Sin el montaje, Django no falla: escribe en el disco local y lo subido se pierde al reiniciar |
| Visor construido         | `200` con `degradado` | El portal, el registro y la API funcionan sin el SPA. Un 503 sacaría de servicio la aplicación entera por una mitad que no lo está      |

**Las unidades: dos decisiones que se pagan si se hacen de otro modo.** `Type=notify` y no `simple`
—con `simple`, systemd da por arrancado el servicio en cuanto el proceso existe, o sea antes de que
Django cargue los ajustes, y un `SECRET_KEY` que falta se ve como `active`—; y el gunicorn del
entorno en el `ExecStart`, **no `uv run`**, que sincroniza el entorno antes de ejecutar y con
`ProtectSystem=strict` el disco está de solo lectura: el servicio no arrancaría, o peor, arrancaría
a veces.

Todo el procedimiento, con lo que hay que cambiar del `.env` y cómo comprobarlo, en
[docs/DEPLOY.md](../../../docs/DEPLOY.md). **404 pruebas y 94,18 % de cobertura**, gate en verde. Las
líneas 89–101 de `base.py` —la comprobación del driver— salen sin cubrir a propósito: se ejercitan
en un proceso aparte, que es la única forma de probar algo que ocurre al **importar** el módulo de
ajustes, y coverage no sigue subprocesos.

**Lo que queda del bloque y no es código**: qué dominio, si comparte VM con AeroControl y
AeroPlanner, y las copias de seguridad —de las que no hay nada escrito, y son dos cosas separadas a
propósito: la base y el directorio de documentos—.

### `F3.5` cerrada: el modelo cumple o no el requisito del proyecto (2026-08-26)

**Es lo que este plan llamaba «lo que separa un visor de una herramienta de control».** Revisar a
mano si cada elemento trae el pset que el mandante exigió no escala —702 vigas por modelo— y un IDS
lo verifica en segundos.

**IDS es el estándar de buildingSMART**, así que el requisito es **interoperable**: el mismo archivo
lo entiende Solibri, lo entiende BlenderBIM y lo entiende esto. Un requisito escrito en una tabla
nuestra no lo entiende nadie más. `ifctester` (LGPL-3.0) se usa **como librería**, que es lo que
`AGENTS.md` permite.

**Dos modelos, y la separación importa.** `RequisitoIds` es del **proyecto** —el mandante exige lo
mismo a todos los modelos de la obra, y tenerlo por entregable obligaría a copiarlo—. `ValidacionIds`
es **un acto con su fecha**: el requisito cambia a mitad de proyecto, y entonces la misma revisión
cumple ayer y no cumple hoy. Guardar la corrida con su fecha es lo que permite contestar _«cumplía
cuando se aprobó»_.

**Tres decisiones que hacen que el resultado no mienta**, y las tres salieron de mirar el informe
crudo de `ifctester` antes de escribir nada:

1. **«No aplica» no es «cumple».** Una especificación cuyo conjunto de elementos no existe en el
   modelo sale de `ifctester` con `status: True` y `is_skipped: True`. Contarla como cumplida diría
   que el modelo satisface un requisito que **nunca se comprobó**, y es justo el número que alguien
   mira antes de aprobar una etapa. Aquí son **tres estados**: cumple, falla y no aplica.
2. **Si no aplicó ninguna, no se cumple nada.** Un IDS escrito para otra disciplina da cero
   comprobaciones y «todo bien»; lo que corresponde decir es que no se comprobó nada.
3. **El informe crudo no se guarda.** Son **944 KB** para el modelo de 24 MB: `ifctester` incluye la
   línea STEP completa de cada elemento que falla, 702 veces. Se guarda un resumen con un tope de
   fallos por requisito, y **el conteo total va aparte**, así que la cifra que se informa es la
   verdadera aunque la lista esté recortada.

**Y el ciclo se cierra donde tenía que cerrarse.** Cada fallo lleva el **GUID** del elemento —la
identidad estable, la que viaja en un BCF— así que desde el fallo se abre **una observación sobre esa
viga**, con responsable y fecha. Es lo que convierte «702 vigas sin su fase» en trabajo asignado. El
formulario de observación acepta el ancla en el modelo, comprobando la forma del GUID: 22 caracteres,
que es lo que mide uno de verdad.

**Comprobado por HTTP contra el servicio corriendo, con el IFC real de 23,6 MB:**

| Qué                          | Resultado                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Validar el modelo de 23,6 MB | **1,7 s**, incluida la carga del archivo                                            |
| El veredicto en pantalla     | «1 de 2 especificaciones fallan · 1 no aplicaron a este modelo»                     |
| El detalle                   | «Las vigas llevan su fase de obra — 702 de 702», con el motivo                      |
| El enlace a la observación   | Lleva el GUID real: `2x9ibDgrvAu8y4Yd$Ug4Qu`                                        |
| Un **mandante**              | Ve la lista; **sin** enlace de subir, **403** en el formulario y **403** al validar |
| Un IDS que no se puede leer  | **400** al subirlo, y **nada llega al disco**                                       |

23 pruebas nuevas. **Y `F3.4` (Celery) sigue sin hacer falta**: 1,7 s en la propia petición para el
tamaño que recibe un control documental. Queda para los trabajos que de verdad tarden.

> **Un detalle que no se puede arreglar y va dicho**: el motivo de cada fallo —«The required property
> set does not exist»— viene de `ifctester` **en sus palabras**, en inglés. Traducir los mensajes de
> una librería obligaría a mantener un mapa de sus cadenas, que se rompe en su siguiente versión sin
> avisar.

### `F3.3` cerrada: lo que el IFC declara de sí mismo (2026-08-26)

El visor ya leía las unidades para poner el símbolo al lado de un número, y las olvidaba al cerrar
la pestaña. El registro necesita otra cosa: **poder contestar sin abrir nada**. Ahora, al subir un
IFC, la revisión queda sabiendo su **esquema**, el **proyecto** que declara, su **unidad de longitud
con el factor a metros**, si está **georreferenciado y por qué vía**, y **cuántos elementos trae y de
qué tipos**. Se ve en el expediente, al lado del sha.

**Y hay un dato que solo se puede dar aquí**: si el archivo está georreferenciado. Fragments aplica
el factor de unidad a la geometría y **descarta la declaración**, así que después de convertir ya no
se puede preguntar.

`ifcopenshell` es **LGPL-3.0** y se usa **como librería**, que es exactamente lo que `AGENTS.md`
permite. Medido: **1,1 s** para el IFC real de 23,6 MB, así que se lee en la propia subida y no hace
falta un trabajo en segundo plano —`F3.4`— para el tamaño que recibe un control documental. El campo
es un `JSONField`, así que el día que llegue un federado que tarde, lo único que se mueve es dónde
se llama.

**Los dos defectos que encontró la primera pasada sobre los modelos reales**, y ninguno se habría
visto con un solo archivo de muestra:

1. **`IfcMapConversion` no existe en IFC2X3**, y pedirlo allí no devuelve una lista vacía: **levanta**.
   Eso tiraba la extracción entera y convertía «este IFC2X3 no tiene conversión de mapa» —que es lo
   normal— en «no se pudieron leer los metadatos». El archivo de muestra en IFC4 funcionaba y los dos
   en IFC2X3 no, **y la mayoría de los IFC de obra siguen siendo IFC2X3**.
2. **`Piso 5.ifc` declara su sitio en `(0, 0, 0, 0)`** y salía como georreferenciado. Latitud y
   longitud exactamente cero no son una ubicación: son **el marcador de posición** que escriben Revit
   y otros cuando nadie fijó el emplazamiento. Creérselo manda a buscar el edificio a la isla nula,
   en el golfo de Guinea.

Y una tercera que se atajó al escribirlo: en IFC una latitud es una tupla de enteros y **el signo va
solo en el primero**. `(-33, 26, 15)` es 33° 26′ 15″ **sur**; sumar los términos con su signo daría
una coordenada en otro hemisferio, y eso no se ve hasta que el modelo aparece en el mar.

**Lo que se dice en pantalla incluye el «no».** «Sin georreferenciar» va en negrita en el expediente,
porque es la respuesta que hace falta **antes** de prometer una vista sobre el terreno (Fase 6), y
callarla obliga a descubrirlo con el modelo ya cargado en el sitio equivocado.

11 pruebas nuevas, con IFC escritos a mano —uno por caso, incluido el sitio en cero— porque un
archivo real no permite comprobar el caso raro. Y **la extracción nunca levanta**: un IFC que no se
puede leer sigue siendo un entregable válido, se descarga y se emite; rechazar la subida por no
poder leerle los metadatos sería confundir dos cosas.

### `F3.1` y `F3.2` estaban hechas y el tablero decía que no (2026-08-26)

**El tablero miente en las dos direcciones**, que es la lección que `AGENTS.md` ya tenía escrita.
`F3.6`–`F3.9` construyeron el servicio y con él quedaron cubiertas estas dos filas, que nadie
volvió a mirar:

- **`F3.1`** — `services/api` es Django 6 + DRF: **proyectos** (`Proyecto`, `Disciplina`,
  `PaqueteWBS`), **versiones** (`Revision`, que nunca se sobreescribe), **usuarios y permisos**
  (`apps/accounts` con la matriz de roles como dato y el contrato de permisos con su prueba de 403),
  y la API del visor con `ViewModelPermissions` y su `api-token` con throttle propio.
- **`F3.2`** — `apps/documents/storage.py` valida **extensión, firma real del archivo y tamaño**
  (200 MB), y **el nombre del cliente nunca llega al disco**: la clave se compone del proyecto, el
  entregable y el sha256 del contenido.

> **Con un matiz que conviene decir en voz alta.** La fila de `F3.1` nombra «modelos» como entidad
> propia, y no la hay: **un IFC vive como `Revision` de un `Entregable`**. No es una omisión, es la
> forma de ISO 19650 que trajo la Fase 8 — un modelo _es_ un entregable que se emite por revisiones,
> con su código de idoneidad y su responsable— y es lo que permite que abrirlo en el visor sea la
> misma costura que abrir un plano (`F8.8`). La fila se escribió antes de que la Fase 8 existiera.

**Y el criterio de aceptación de la fase no tenía prueba.** «La versión anterior sigue recuperable»
es la que contesta _«¿qué decía el plano cuando se aprobó la etapa?»_, y no estaba comprobada en
ningún sitio. Ahora sí, en `test_versiones.py`, y no por lo obvio: se comprueba que la anterior
**se siga descargando**, que devuelva **sus propios bytes** —si la clave se derivara del entregable
en vez del contenido, la nueva habría pisado a la vieja y las dos descargas darían lo mismo con el
registro diciendo que son distintas— y que **relevar no sea borrar**. Y de paso que subir dos veces
el mismo archivo deje **dos revisiones en el registro y un solo archivo en el disco**, porque la
clave sale del contenido.

`F3.5` es lo que separa un visor de una herramienta de control: revisar a mano si
cada elemento trae el pset que el mandante exigió no escala; un IDS lo verifica en
un paso y dice exactamente qué falta.

### El portal de ingreso, y por qué se portó en vez de escribirse (2026-08-26)

**Lo pidió el usuario junto con la fidelidad del 2D**, y la aplicación hermana ya lo
tenía resuelto: AeroControl lleva 1440 pruebas en producción con datos reales de la
DGAC. Su fuerza no está en código ingenioso sino en un puñado de decisiones que ya
costaron encontrarse, y **eso es lo que se portó** — la forma, no el dominio. La base
de datos es propia: la regla de la familia es que ninguna aplicación comparte base con
otra.

| Qué se portó                                            | Por qué esa pieza y no otra                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `BaseModel`: UUID, marcas de tiempo, `is_active`        | Archivar en vez de borrar. Borrar un entregable se lleva su historial       |
| `AuditEvent` de solo agregar, con `sequence`            | `created_at` **no basta** para ordenar dos filas del mismo instante         |
| `RequestMetricsMiddleware`                              | Auditoría en cada petición que muta, id de correlación y log estructurado   |
| `mail.py`                                               | No decir "enviado" cuando el correo solo se imprimió en el log              |
| `jobs.py` + `JobRun`                                    | La fila nace en `running`: un proceso muerto a mitad deja de ser un éxito   |
| `exports.py`                                            | Una celda que empieza por `=` es una fórmula que se ejecuta en otra máquina |
| `tenancy.py`                                            | El permiso dice qué se puede hacer, no **sobre qué**                        |
| `ModelPermissionRequiredMixin` y `ViewModelPermissions` | El contrato de permisos, cumplido sin depender de que alguien se acuerde    |

**Las decisiones del portal:** `LoginView` con plantilla propia y **un solo mensaje de
error**, genérico —distinguir "no existe ese usuario" de "esa no es la contraseña" le
regala a quien prueba credenciales la mitad del trabajo—; axes **delante** del backend
real, para cortar un intento bloqueado antes de comprobar la contraseña; bloqueo **por
nombre de usuario y no por IP**, porque detrás de un proxy toda petición llega de la
misma dirección; sesión con tope de 12 h y expiración deslizante; **sin auto-registro**,
porque una aplicación de control documental donde cualquiera se da de alta no controla
nada; y `/api-token/` con throttle propio, porque el de DRF viene con
`throttle_classes = ()` y deja fuera del límite justo al único endpoint que acepta
usuario y contraseña sin autenticar.

**Los roles**, con la matriz en `apps/accounts/roles.py`: Administrador, Coordinador
BIM, Proyectista, Revisor y Mandante, más **Dirección**, que no es un rol sino un grupo
de notificación con cero permisos. Un nombre de permiso mal escrito **para el comando**
`bootstrap_roles` en vez de dejar un rol silenciosamente vacío.

> **La lección del `Viewer` de AeroControl, portada con el código.** Su rol de lectura
> era "todo permiso cuyo nombre empiece por `view_`", y eso le entregaba en silencio los
> tokens de API, la lista de usuarios, las sesiones, la auditoría y el historial de
> trabajos. `Mandante` es una **lista blanca explícita**, y hay una prueba que falla si
> alguna vez aparece ahí un permiso de administración.

**Comprobado contra un servidor corriendo**, que es el oráculo que pedía el contrato:

| Usuario             | Ve en el portal               | Pide a mano `/administracion/usuarios-y-roles/` |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| **Mandante**        | Organizaciones y el visor BIM | **403**                                         |
| **Coordinador BIM** | + Trabajos programados        | **403**                                         |
| **Administrador**   | Todo                          | 200                                             |

Y el bloqueo por intentos es real, no cosmético: al quinto fallo la respuesta pasa a
**429**, y **la contraseña correcta también recibe 429** mientras dura el enfriamiento
—si entrara, el bloqueo no estaría haciendo nada— mientras otro usuario sigue pudiendo
entrar, que es lo que distingue un bloqueo por nombre de un bloqueo global.

**El gate propio** (`services/api/scripts/verify.ps1`) replica el de AeroControl:
`check`, `check --deploy`, `makemigrations --check`, `pytest --cov`, `ruff`, `bandit` y
`pip-audit`. **64 pruebas, 89 % de cobertura**, todo en verde.

> **La primera versión del gate dijo «verde» con `ruff format` fallando.** Un ejecutable
> nativo que devuelve un código distinto de cero no dispara el manejo de errores de
> PowerShell, así que cada paso pasa ahora por una función que mira `$LASTEXITCODE`. Un
> gate que miente es peor que no tener gate — y es la misma clase de defecto que la
> `F7.13` marcada cerrada.

**Lo que queda de este frente**, dicho en voz alta: el catálogo de traducciones
(`locale/es/`) todavía no existe, así que la interfaz muestra las cadenas fuente en
inglés donde Django no traduce por su cuenta; y la matriz de roles solo cubre los
modelos que existen hoy — se completa con los entregables en `F8.1`.

---
