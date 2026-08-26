# UX de AeroBim — cómo se reparte la pantalla y por qué

> **Qué es esto.** La estructura de la interfaz: qué zonas hay, qué entra en cada una y con qué
> regla crece cuando lleguen las nubes de puntos, el BCF y las interferencias. Escrito el
> 2026-08-19 a pedido del usuario, después de la primera prueba con un plano DXF y un IFC abiertos
> a la vez.
>
> La referencia declarada es **AutoCAD, Revit y los modeladores de Bentley**, porque de ahí vienen
> quienes van a usar esto. No se copia por gusto: se copia para que nadie tenga que aprender otra
> pantalla.

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
3. **Nada flota sobre el modelo** salvo el cubo de vistas. Los avisos van a la barra de estado, que
   es donde ya mira quien viene de un CAD.

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

```
ESTRUCTURA DEL MODELO   ← el árbol espacial del IFC
MODELOS ABIERTOS        ← los IFC, con orden, apagado y cierre
PLANOS 2D               ← los DXF, con sus capas y su ajuste     (hoy)
NUBES DE PUNTOS         ← el levantamiento                        (Fase 2)
VISTAS GUARDADAS        ← cámara + visibilidad + cortes
MEDICIONES TOMADAS      ← aparece sola cuando hay alguna
TEMAS BCF               ← coordinación                            (Fase 4)
INTERFERENCIAS          ← resultados navegables                   (Fase 5)
```

**Por qué juntas y no en pestañas.** La pregunta que trae a alguien aquí es "¿esto que dice el plano
está modelado?", y responderla es encender y apagar de dos fuentes distintas. Con pestañas, cada
comparación cuesta dos clics de ida y dos de vuelta; en la misma columna cuesta uno.

Cada sección se pliega y **se le puede fijar el alto**; las que no tienen alto fijo se reparten lo
que sobra. Así siete secciones conviven sin que ninguna empuje a las demás fuera de la pantalla.

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

| Lo que llegue                          | Dónde entra sin rediseñar nada                                         |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Nubes de puntos (Fase 2)               | Sección propia en el navegador + grupo "Nube" en la pestaña Modelo     |
| Temas BCF (Fase 4)                     | Sección propia + pestaña "Coordinación" en la cinta                    |
| Interferencias (Fase 5)                | Sección propia; el resultado lleva la cámara y aísla los dos elementos |
| Herramientas CAD de revisión (`F7.11`) | Grupo nuevo en la pestaña Medición, con los ajustes de snap            |
| Más de un plano a la vez               | Ya funciona: la lista crece y cada uno lleva su ajuste y sus capas     |

**La regla para crecer:** una capacidad nueva es _una sección del navegador_ y, como mucho, _un
grupo en una pestaña existente_. Una pestaña nueva solo se justifica cuando aparece un modo de
trabajo entero —coordinar no es medir—, y nunca para un solo botón.

## Lo que falta, dicho en voz alta

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
  como `F1.12` a `F1.16`. Quedan tres: la **preselección al pasar el cursor** sin clicar —«poco
  práctico», y se cruza con el picking del plano—, el **panel de abajo que no se entiende** (la
  referencia declarada arriba, AutoCAD y Revit, es justo la que hay que mirar) y las **sombras del
  renderizado**. La **medición de distancia** y el **modo fantasma** están cerradas.
- **La vista fantasma conserva el color de cada elemento** (2026-08-26). Antes blanqueaba el modelo
  entero, porque la pintaba el resaltado de la librería; ahora se pinta por cuenta propia al 30 %
  de opacidad sobre el color que ya tenía cada cosa. Mirando detrás de un muro se sigue
  distinguiendo una viga de una losa, que es para lo que se enciende el modo.
