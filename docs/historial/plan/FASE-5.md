# Fase 5 — Detección de interferencias

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

## FASE 5 — Detección de interferencias

**Objetivo de salida:** las interferencias entre disciplinas se encuentran solas y
llegan a la coordinación como temas, no como una lista en una planilla.

| #      | Tarea                                                                                  | Estado                                                                 |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `F5.1` | Definir grupos de comparación (A vs B) por filtros de tipo, disciplina o planta        | ✅ la obra entera desde su pantalla; los selectores finos, por comando |
| `F5.2` | Ejecutar `ifcclash` como job de backend, con tolerancia de holgura configurable        | ✅ ver abajo                                                           |
| `F5.3` | Resultados navegables: la lista lleva la cámara al conflicto y aísla los dos elementos | ✅ **sale de la Fase 4** — ver abajo                                   |
| `F5.4` | Convertir un resultado en tema BCF de la Fase 4, con su viewpoint ya apuntado          | ✅ ver abajo                                                           |
| `F5.5` | Agrupar y silenciar falsos positivos, y conservarlos entre corridas                    | ✅ las dos mitades, ver abajo                                          |

**Oráculo:** un conjunto de prueba con interferencias conocidas y colocadas a
propósito; se cuentan las encontradas y las perdidas. Contra software comercial si
hay acceso a una licencia.

`F5.5` decide si la funcionalidad se usa o se abandona. Una detección cruda sobre
dos disciplinas reales devuelve cientos de conflictos, la mayoría irrelevantes; si
cada corrida vuelve a mostrar los mismos falsos positivos ya descartados, nadie
abre la herramienta una segunda vez.

### La Fase 5, medida y con el oráculo escrito (2026-09-02)

**Primero el oráculo, que es lo que el plan pedía.**
[`interferencias-a-proposito.ifc`](../../../apps/web/public/samples/interferencias-a-proposito.ifc) —un muro
y cuatro pilares, con las coordenadas de cada uno escritas dentro del propio archivo— y **los cuatro
casos, no solo el que choca**, porque un detector que encuentra la interferencia buena y además tres
falsas es peor que ninguno:

| Elemento       | Debe salir                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `PILAR-CHOCA`  | **Sí** — cruza el muro de verdad                                                      |
| `PILAR-LEJOS`  | No — tres metros al este                                                              |
| `PILAR-ARRIBA` | No — **misma huella en planta, otro nivel**. Delata a un detector que compara plantas |
| `PILAR-ROZA`   | Solo admitiendo el roce — apoya contra la cara sin penetrar                           |

**`ifcclash` acierta los cuatro**: encuentra uno con el roce descartado y dos admitiéndolo. Se usa
**como librería y sin copiar una línea**, que es lo que `AGENTS.md` permite con LGPL-3.0.

**`F5.2`: y tarda de verdad.** Es el primer trabajo de este repositorio que se acerca al umbral que
dejó escrito `F3.4`:

| Comparación                                      | Tiempo     | Encontradas |
| ------------------------------------------------ | ---------- | ----------- |
| El fixture (1 muro vs 4 pilares)                 | 30 ms      | 1           |
| `Piso 5`: 470 proxies vs 10 puertas              | 431 ms     | 6           |
| El grande: 805 `IfcMember` vs 34 `IfcColumn`     | **15,7 s** | 3           |
| Cruzando los dos: 470 proxies vs 805 `IfcMember` | **20,0 s** | 35          |

Veinte segundos dentro de una petición no se sostienen, así que la corrida entra por un **comando de
gestión** que deja su fila en `JobRun` — porque un trabajo que deja de correr no da error, y la fila
es la única forma de notarlo. **El disparador desde la pantalla es lo que reabre `F3.4`**, y ahora
con un número y no con una intuición.

**`F5.3` y `F5.4` salieron de la Fase 4 sin escribir una pantalla.** Es la mejor consecuencia del
orden en que se hizo el trabajo: un conflicto **no es una lista aparte, es una observación**, y el
visor ya sabe abrirlas desde `F4.8`.

| Lo que pedía `F5.3`           | De dónde sale                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Llevar la cámara al conflicto | El GUID es el ancla y el visor encuadra el elemento — **sin inventar una cámara**: nadie eligió un punto de vista |
| Aislar los dos elementos      | La visibilidad de `F4.7`: `DefaultVisibility="false"` con dos excepciones                                         |
| Ver de qué se habla           | El marcado de `F4.5`: el segmento entre los dos puntos de contacto                                                |
| Repartirlo                    | Prioridad, responsable y estado, que ya trae `F4.2`                                                               |

**`F5.5`: las dos mitades, cerradas el 2026-09-02.** La mitad que decide si la herramienta
se usa dos veces está hecha, y sale de una sola idea: **la identidad de un conflicto es la pareja de
GUID sin orden**.

- El punto de choque **no sirve** como identidad: cambia con la malla, con la tolerancia y con la
  versión de la librería.
- El orden tampoco: comparar A contra B y B contra A da el mismo conflicto al revés, y con el orden
  contando aparecería dos veces.

Con esa pareja, **descartar un falso positivo es dejar su observación en `descartada`, y la corrida
siguiente no la vuelve a abrir**. `F5.5` sale de `F4.2` sin una tabla nueva.

### La otra mitad: agrupar por proximidad

**Veinte tornillos contra la misma viga son un problema, no veinte.** Silenciar decide si la
herramienta se usa una segunda vez; agrupar decide si la primera corrida se tría en vez de
abandonarse. Una lista de treinta y cinco filas cuando hay trece problemas no se reparte.

**La regla tiene tres cláusulas, y las tres salieron de un caso que rompía la anterior:**

1. **La misma pareja de GUID es siempre el mismo problema, y la distancia no opina.** Lo encontró el
   propio fixture del oráculo: `ifcclash` informa el mismo conflicto **dos veces** cuando los dos
   modelos comparten GUID —A contra B y B contra A— y **cada informe trae una cara distinta del
   contacto**. Medido: los dos centros del mismo muro contra el mismo pilar caen a **1,95 m** uno
   del otro. Con la proximidad sola quedaban como dos problemas.
2. **Comparten un elemento.** Sin esto, un conducto que cruza un muro y, medio metro más allá, una
   tubería que cruza otro se colapsan en uno. Son dos problemas y los resuelven dos personas.
3. **Sus puntos de contacto están cerca**, medidos en el **punto medio** del segmento: los dos
   extremos son la cara de cada elemento, así que el medio es el único que no depende de cuál se
   leyó primero. Sin esta cláusula, un muro de cuarenta metros que choca con ocho instalaciones
   repartidas por la planta sería una fila, y cada choque está en un sitio distinto de la obra.

**El radio es un metro, y sale de medirlo sobre el par real** —470 `IfcBuildingElementProxy` de
`Piso 5.ifc` contra 805 `IfcMember`, la corrida de veinte segundos que devuelve 35 interferencias:

| Radio  | Cúmulos | El mayor | Lo que dice                                    |
| ------ | ------- | -------- | ---------------------------------------------- |
| 0,00 m | 35      | 1        | sin agrupar: es de donde se viene              |
| 0,25 m | 22      | 6        |                                                |
| 0,50 m | 20      | 6        |                                                |
| 1,00 m | **13**  | **6**    | **el elegido**                                 |
| 2,00 m | 8       | 17       | un cúmulo se come la mitad de la corrida       |
| 5,00 m | 5       | 22       | y de ahí ya no baja: 22 de 35 en una sola fila |

**De 35 a 13 filas, y el cúmulo mayor sigue siendo de 6.** Y la razón de no subir el radio no es que
la curva se aplane: **es que se derrumba.** La unión es transitiva —si A y B son vecinas y B y C
también, las tres caen en el mismo cúmulo aunque A y C estén lejos—, así que pasado un punto los
cúmulos se encadenan por la obra entera. El metro está justo antes de ese salto.

**Agrupar no cuesta nada**: 0,1 ms sobre esas 35 interferencias, contra los veinte segundos de la
detección. Por eso no hay que decidir si esto entra en la petición o en una cola.

**Lo que se abre es el cúmulo, no la interferencia**: se aísla el problema entero —los veintiún
elementos, no los dos del representante— y se dibuja **un segmento por conflicto distinto**. El
título dice por dónde empezar: «V-12 × 20 elementos» cuando hay un elemento compartido, «A × B y 6
más» cuando no lo hay. Y se cuentan **parejas y no informes**: titular «A × B y 1 más» un conflicto
informado dos veces sería contarlo dos veces delante de quien lo resuelve.

**La identidad la presta la pareja que ordena primero**, no la de mayor separación: la separación es
un `float` que se mueve con la malla y con la versión de la librería, y un representante que baila
abre una observación nueva en cada corrida.

**Y un caso que no se resuelve bien, dicho y no escondido.** El cúmulo se reconoce en la corrida
siguiente porque **alguna** de sus parejas ya tiene observación. Si se corrige justo la pareja
representante y el resto sigue chocando, el cúmulo nuevo no coincide con nada y se abre por segunda
vez, mientras la primera queda apuntando a una pareja que ya no choca. Es el precio de no guardar
las parejas del cúmulo en una tabla propia; la alternativa —un modelo más y su migración— no se paga
hasta que el caso aparezca sobre una obra de verdad.

**El camino a `descartada` ya existe, y hasta el 2026-09-02 no existía.** El estado estaba en el
modelo y **nada lo ponía**: la mitad que decide si la herramienta se usa una segunda vez estaba
escrita y no se podía usar. Lo que se añadió:

| Pieza                                                  | Qué resuelve                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `Observacion.descartar(por, motivo)`                   | Exige el motivo. Es permanente —la pareja de GUID impide que la corrida siguiente reabra—, así que es lo único que queda |
| `POST /api/observaciones/<id>/descartar/`              | Se tría **sin salir del visor**. Abrir la ficha de cada conflicto en otra pestaña no lo hace nadie                       |
| `ChangeModelPermissions`                               | Descartar es **cambiar**, no crear. Ver abajo                                                                            |
| Filtros «Todas / Mías / Choques / Notas» con su cuenta | Una corrida abre decenas y las mezcla con las pocas que escribió una persona                                             |

**El permiso iba en la dirección mala, y lo descubrió su propia prueba de 403.**
`DjangoModelPermissions` asume que `POST` es crear, y eso vale en una API de recursos pero no en una
de acciones: «descartar» llega por `POST` y lo que pide es `change_observacion`. Con el mapa de
fábrica, un rol que puede **abrir** hallazgos podría descartar los ajenos, y uno que puede
cambiarlos no podría. `ChangeModelPermissions` es la clase que lo corrige, y queda para el siguiente
endpoint de acción.

**Un defecto de la lista, medido y no opinado.** Con los 35 conflictos en pantalla, las dos acciones
de cada fila caían a **43,8 px de su propio título y a 11 px del título siguiente**: por proximidad
—la única pista que había— «no es un problema» pertenecía cuatro veces más a la fila de abajo que a
la suya. En una lista de triaje donde descartar es permanente, eso es descartar el conflicto
equivocado. Y no se arregla con proximidad, porque tres líneas de alto parecido no se agrupan solas:
se arregla **dibujando el grupo**. Cada hallazgo es ahora una tarjeta con su papel propio, con las
acciones dentro y 6,6 px de aire entre tarjetas.

**Dos trampas de `ifcclash` que no dan un error legible**, y las dos tienen su prueba:

1. **Un grupo vacío la hace reventar** con `TypeError: Attribute of type AGGREGATE OF STRING needs a
python sequence of strs`, que no menciona ni los grupos ni los selectores. Y pasa fácil:
   **`Piso 5.ifc` no tiene un solo `IfcWall`** —son 470 `IfcBuildingElementProxy`—, así que el
   selector obvio no encuentra nada. El envoltorio lo comprueba antes y dice **cuál** de los dos
   lados está vacío, con su selector dentro.
2. **El modo `intersection` exige `check_all`** y sin esa clave lanza un `AssertionError` **sin
   mensaje**, desde un `assert` de la librería.

### `F5.1` cerrada y `F3.4` decidida: «Revisar interferencias» en la pantalla de la obra (2026-09-02)

**Era el hueco que separaba «la coordinación funciona» de «se está usando».** La detección existía,
estaba probada contra su oráculo, y se alcanzaba escribiendo dos UUID en una terminal.

**«Comparar dos revisiones» no es como se coordina una obra.** Un coordinador no elige dos UUID:
pregunta «¿choca algo?». Así que el botón toma **la revisión vigente de cada entregable que trae un
modelo** y las cruza todas contra todas. El comando de gestión se queda con el caso dirigido
—«estructura contra instalaciones, con esta tolerancia»—, que es el que necesita elegir los
selectores a mano.

**Y no hay pantalla de resultados, que es lo mejor que tiene.** Lo que encuentra cae donde ya vive
la coordinación: entre las observaciones abiertas de la propia pantalla del proyecto, y desde ahí el
visor ya sabe abrirlas —aislando los dos elementos y dibujando el segmento entre ellos—. Una lista
aparte habría que mantenerla sincronizada con el estado de las observaciones.

**Lo que entra en una comparación, y las tres exclusiones que evitan ruido de entrada.** El selector
por defecto es `IfcElement` menos tres clases, y cada una tiene su motivo medido:

| Fuera                  | Por qué                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `IfcOpeningElement`    | **Choca con todo por definición**: es el volumen que se resta del muro                                                |
| `IfcFurnishingElement` | Una silla que atraviesa un tabique no es un problema de obra. **59 de 548** en `Piso 5` — un diez por ciento de ruido |
| `IfcAnnotation`        | No es geometría construida                                                                                            |

**Y `F3.4` quedó decidida por el usuario**, que es de quien era la decisión: **la petición espera.**
Veinte segundos caben de sobra en los ciento veinte del servidor, y una cola traería una forma nueva
de fallar en silencio —un trabajo encolado que nadie procesa no da error— que no hace falta pagar
todavía. El botón **avisa de que tarda antes de pulsarlo**, no después: uno que deja la pantalla
quieta sin explicación se pulsa dos veces. Si un par federado se pasa del minuto, ahí se monta la
cola con el número en la mano.

**Un hallazgo de la propia prueba, que conviene tener escrito.** Cruzando dos modelos que comparten
GUID —el mismo archivo dos veces, que es lo que pasa comparando dos revisiones del mismo
entregable— la detección devuelve **la pareja espejada**: muro × pilar y pilar × muro. La identidad
sin orden las colapsa **dentro de la misma corrida**, no solo entre corridas, y eso salió medido:
`encontradas: 2, abiertas: 1, repetidas: 1`.

**Lo que queda de la fase:** el agrupado por proximidad —veinte tornillos contra la misma viga son un
problema, no veinte—, que pide ver una corrida real sobre dos disciplinas de verdad.
**501 pruebas en la API con 94,18 %** y 306 en `bim-core`.

---
