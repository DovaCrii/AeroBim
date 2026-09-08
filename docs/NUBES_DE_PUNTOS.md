# Nubes de puntos: qué formato entra, y cómo se convierte

> **Creado:** 2026-09-03 · Cierra `F2.5` del `MASTER_PLAN.md`
>
> **Límite explícito de la fase, heredado de AeroPlanner:** AeroBim **no procesa ni clasifica** nubes
> de puntos. Abre lo que otro generó. La conversión ocurre **fuera de la aplicación**, con
> herramientas de línea de comandos, y este documento la deja escrita.

## Qué se decidió

**El visor abre COPC** (`.copc.laz`), y la conversión desde lo que entregue el topógrafo se hace con
**PDAL**, fuera de la aplicación.

Y un requisito que no es una recomendación: **el visor resta el desplazamiento de la cabecera antes
de tocar un `Float32Array`**. El porqué está más abajo, y es el hallazgo más caro de esta fase.

## Lo que importa de verdad: cruzar la nube con el IFC

Esa es la razón de ser de la Fase 2 —`F2.4` mide la desviación entre lo construido y lo modelado— y
es lo que decidió el formato. Tres cosas hacen falta para que el cruce sea posible, y las tres se
comprobaron sobre un archivo escrito y leído de vuelta, con una nube sintética en UTM 19S (Santiago:
E 345 000, N 6 298 000, H 560) que lleva un plano y **un muro de 3 m** de geometría conocida:

| Lo que hace falta para cruzar con el IFC              | Medido sobre un COPC de verdad                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Saber **en qué coordenadas** está la nube             | El WKT viaja dentro del archivo: 411 caracteres, con `AUTHORITY["EPSG","32719"]` presente al leerlo de vuelta                  |
| Pedir **solo los puntos que rodean un elemento**      | `GetPointsWithinBox` sobre una caja de 10 × 4 × 6 m devolvió **260 puntos en 17 ms**, con sus clases (104 suelo, 156 edificio) |
| Ver algo **antes** de haber descargado la nube entera | Pidiendo solo el nodo raíz: **977 puntos en 4 ms**, el **18 %** del archivo — y el muro ya aparece en esa muestra              |
| Que los milímetros **sobrevivan** al viaje            | La ida y vuelta conserva la escala declarada; el problema está en el `float32`, y se resuelve restando (abajo)                 |

Que se pueda pedir la caja de un elemento **es** el cruce: se toma la caja del elemento del IFC, se
le piden a la nube los puntos de dentro, y la desviación es la distancia de esos puntos a la cara
modelada. Un formato que obligue a cargar la nube entera para eso no sirve para este producto.

## El hallazgo que decide el pipeline: `float32` pierde 20 cm en UTM

Three.js guarda las posiciones en `Float32Array` —es lo que acepta WebGL— y un `float32` tiene 24
bits de mantisa: unas **siete cifras significativas**. La coordenada norte de Santiago en UTM 19S ya
gasta siete en la parte entera.

Medido sobre 62 500 puntos, comparando el valor real con el mismo valor pasado por `float32`:

| Eje                     | Error máximo | Escalón del `float32` a esa magnitud |
| ----------------------- | ------------ | ------------------------------------ |
| Este (345 000 m)        | **12,5 mm**  | 31,25 mm                             |
| **Norte (6 298 000 m)** | **200 mm**   | **500 mm**                           |
| Altura (560 m)          | 0,0 mm       | 0,06 mm                              |

Y los **mismos puntos**, restando primero el desplazamiento de la cabecera: **0,003 mm** en los dos
ejes horizontales. Un factor de sesenta y cinco mil.

**Veinte centímetros hacen imposible el cruce con el IFC.** `F2.4` promete medir desviaciones entre
lo construido y lo modelado; una desviación de 5 mm no se mide con una regla que se equivoca en 200.
Y lo peor es cómo falla: el error **no es ruido**, es un escalonado —los puntos se pegan a los
valores representables—, así que **la nube se ve perfectamente bien y miente con dos decimales**.

De ahí sale el requisito del formato, y por eso no es negociable: **el archivo tiene que traer el
desplazamiento dentro**. LAS, LAZ y COPC lo traen —es el campo `offset` de la cabecera, y se lee sin
tocar un solo punto—. Un PLY o un XYZ con coordenadas absolutas, no: la información se perdió antes
de llegar.

La aritmética está probada en `packages/bim-core/src/nubes/precision.ts`, con los vectores medidos en
Python como oráculo (`errorEnFloat32(6_298_012.345)` = 155,00 mm). Si alguien cambia el cálculo y
vuelve a perder precisión, **falla el gate**.

## Cuánto pesa una nube, y por qué hace falta un octree

Medido escribiendo y leyendo archivos de verdad (2 millones de puntos, formato de punto 3, escala de
1 mm):

| Medida                      | Valor                                      |
| --------------------------- | ------------------------------------------ |
| LAS sin comprimir           | **34,0 bytes por punto** (68,0 MB los 2 M) |
| LAZ, nube regular           | 0,23 B/punto — comprime **150×**           |
| LAZ, nube con ruido en todo | 14,8 B/punto — comprime **2,3×**           |
| Leer la cabecera entera     | **1,1 ms**, sin tocar un punto             |

**Las dos cifras de compresión son los dos extremos, y ninguna es representativa.** El 150× es una
rejilla perfecta con color e intensidad constantes —el mejor caso que existe— y el 2,3× es ruido puro
en las tres coordenadas —el peor—. Una nube de obra cae en medio; el rango se da así, acotado, en vez
de citar un número que engañaría.

En la tarjeta gráfica la cuenta es otra, y es exacta. Verificada contra Three.js r185 leyendo
`BufferAttribute.array.byteLength`:

| Atributo         | Tipo           | Bytes por punto |
| ---------------- | -------------- | --------------- |
| `position`       | `Float32Array` | 12              |
| `color`          | `Uint8Array`   | 3               |
| `intensity`      | `Uint16Array`  | 2               |
| `classification` | `Uint8Array`   | 1               |

Y **cada punto se paga dos veces**: el `TypedArray` en el montón de JavaScript y su copia subida a la
tarjeta, porque `BufferAttribute` guarda la referencia al arreglo mientras el objeto esté en la
escena. Contar solo la tarjeta subestima el consumo a la mitad — el error que hace que una nube «que
cabía» cuelgue la pestaña.

Con eso, **una nube de 50 millones de puntos con color consume 1,5 GB**. Un levantamiento de una obra
mediana son 50 a 200 millones de puntos. **No cabe, y no es cuestión de esperar equipos mejores**:
hace falta un formato con niveles de detalle. El cálculo está en
`packages/bim-core/src/nubes/presupuesto.ts`, probado, y `F2.3` lo usará para su control de densidad.

## Por qué COPC y no las otras tres opciones

### Potree — descartado por versiones, y es medible

Es el formato más conocido, y los tres cargadores que existen para Three.js **no se pueden usar con
el visor de hoy** (three 0.185.1, vite 8):

| Paquete                     | Lo que declara                                                                       | Veredicto                                   |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `@pnext/three-loader` 1.0.0 | `peerDependencies: { three: "~0.160.0" }`                                            | Incompatible: pin exacto, dos menores atrás |
| `potree-loader` 1.10.4      | construido contra three **0.138.3**, y **`vite ^2.8.6` como dependencia de runtime** | Dos generaciones atrás en las dos cosas     |
| Potree entero               | Es un visor completo, con su propia escena y su propia cámara                        | No se empotra en la escena que ya existe    |

Y hay una razón de producto por encima de las versiones: **PotreeConverter produce un directorio con
miles de archivos**. El registro documental de AeroBim guarda **un archivo por documento**. Una nube
convertida a Potree no es un documento del expediente, es una carpeta que hay que alojar aparte —y el
producto es local-first—.

### 3D Tiles `pnts` — compatible, pero no ahora

`3d-tiles-renderer` 0.5.2 (Apache-2.0) declara `three: ">=0.167.0"` y **todos** sus pares como
opcionales: es el único cargador con octree que hoy funciona con nuestra versión. Y serviría dos
veces, porque 3D Tiles es el formato nativo de Cesium y la **Fase 6** es geo + BIM.

No se elige ahora por dos razones: sigue siendo **un directorio de teselas** —el mismo problema del
expediente— y **CloudCompare no lo abre**, con lo que se perdería el oráculo de la fase. Queda
anotado como el candidato de la Fase 6 si su parte de Cesium lo necesita; entonces la conversión
sería una segunda salida del mismo LAZ, no un cambio de este formato.

### PLY o PCD binarios — los abre Three.js hoy, y no sirven

`three` 0.185.1 trae `PLYLoader`, `PCDLoader` y `XYZLoader` en `examples/jsm/loaders`, así que
cargarlos no costaría una dependencia. Pero **ninguno tiene niveles de detalle** —se carga la nube
entera o nada, y ya vimos que 50 M de puntos son 1,5 GB— y **ninguno de los tres formatos guarda un
desplazamiento**, así que la nube llegaría en coordenadas absolutas y con ella los 200 mm de error.
Sirven para escanear una habitación, no para una obra.

### COPC — lo elegido

**Cloud Optimized Point Cloud** es un LAZ 1.4 corriente con el octree guardado dentro y una VLR que
dice dónde está cada nodo. Las razones, en orden de peso:

1. **Es un archivo.** Cabe en el expediente como cualquier otro documento, se copia, se respalda y se
   versiona como un PDF. Ni Potree ni 3D Tiles pueden decir esto.
2. **CloudCompare lo abre**, y también QGIS y PDAL. El oráculo de la fase —«la misma nube en
   CloudCompare»— sigue funcionando, y el topógrafo puede comprobar en su herramienta lo mismo que
   ve el mandante en el navegador.
3. **Trae el desplazamiento y el WKT dentro**, medido arriba. Es lo que hace posible el cruce.
4. **Se lee por partes por HTTP**, con peticiones de rango: el nodo raíz son 1 KB de un archivo de 7,
   y en una nube real la proporción es mucho mejor. Eso es exactamente lo que un navegador necesita.
5. **Los lectores no dependen de Three.js**: `copc` 0.0.9 (MIT) sobre `laz-perf` 0.0.7 (Apache-2.0)
   entregan puntos y nada más. No puede repetirse la trampa de versiones de Potree, porque no hay
   versión que casar.

**Lo que cuesta, dicho claro:** el recorrido del octree —qué nodos pedir según dónde mira la cámara—
lo escribimos nosotros. `copc` da el árbol y los nodos; decidir cuáles bajar es trabajo de `F2.1` y
`F2.3`, y no es poco. Con `3d-tiles-renderer` vendría hecho. Se acepta el costo porque las cinco
razones de arriba son de producto y esta es de comodidad.

**Y lo que no está verificado**, para que `F2.1` no lo dé por hecho: los archivos COPC de esta fase
se escribieron y leyeron con **`copclib` 2.6.3 en Python**, no con los paquetes de JavaScript. Que
`copc` + `laz-perf` lean este mismo archivo en un navegador **está sin comprobar**, y es lo primero
que tiene que hacer `F2.1` — antes de escribir una línea de cargador.

## El pipeline de conversión

> **Ninguno de estos comandos se ejecutó aquí.** Están escritos a partir de la documentación de PDAL,
> y se comprobó que **PDAL no está instalado** en la máquina de desarrollo (ni `pdal`, ni
> `PotreeConverter`, ni `untwine`, ni `entwine`). Van marcados así porque la regla del repositorio es
> que un comando sin ejecutar no se presenta como medido. **Antes de darlos por buenos hay que
> correrlos** sobre un archivo del usuario.

PDAL 3.5.5 está en PyPI con licencia BSD, pero los bindings de Python necesitan la biblioteca C++
aparte; la vía corriente en Windows es conda-forge.

### 1. Mirar el archivo antes de convertirlo

```bash
pdal info --summary levantamiento.las
```

Lo que hay que leer de esa salida, y por qué cada cosa:

- **`count`** — cuántos puntos son. Con la tabla de arriba, decide si la nube cabe o hay que diezmar.
- **`bounds`** y **`offset`** — la magnitud de las coordenadas. Es lo que dice si se van a perder
  200 mm.
- **`scale`** — la precisión que declara el levantamiento. Un `0.01` significa que el topógrafo no
  promete milímetros, y entonces medir al milímetro contra el IFC es inventar precisión.
- **`srs`** — el sistema de referencia. **Si viene vacío, la conversión para y se le pregunta al
  topógrafo.** Una nube sin CRS no se puede cruzar con nada, y adivinarlo es peor que no tenerlo.

### 2. Convertir a COPC

```bash
pdal translate levantamiento.las levantamiento.copc.laz --writer copc
```

Si el CRS falta en el original y se conoce de verdad, se declara al leer —nunca se supone:

```bash
pdal translate levantamiento.las levantamiento.copc.laz --writer copc --readers.las.override_srs=EPSG:32719
```

### 3. Comprobar que la conversión no perdió nada

```bash
pdal info --summary levantamiento.copc.laz
```

`count`, `bounds` y `srs` tienen que coincidir con los del paso 1. **Es la única comprobación que
importa** y se hace en un segundo: una conversión que pierde puntos o cambia la extensión se detecta
aquí o no se detecta nunca.

### 4. Y el oráculo, fuera de la aplicación

Abrir el `.copc.laz` en **CloudCompare** junto al IFC. Es el oráculo de la fase entera: lo que mida
AeroBim tiene que coincidir con lo que mida CloudCompare dentro de la tolerancia del levantamiento.

### Diezmar, si hace falta

Si la nube no cabe ni con niveles de detalle —o si se quiere una versión ligera para revisar—, PDAL
diezma antes de convertir:

```bash
pdal translate levantamiento.las ligera.copc.laz --writer copc sample --filters.sample.radius=0.05
```

`filters.sample` guarda un punto por cada esfera del radio dado, que reparte la pérdida por el
espacio en vez de por el orden del archivo. **Un diezmado no es un nivel de detalle**: pierde detalle
donde importa igual que donde no. Sirve para poder ver la nube, **no para medir sobre ella**, y una
nube diezmada no debería usarse en `F2.4`.

## Lo que este documento deja decidido para las tareas que siguen

| Tarea  | Qué queda fijado                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `F2.1` | Se carga COPC. **Primero se comprueba que `copc` + `laz-perf` abren en el navegador el archivo que escribe PDAL**        |
| `F2.2` | El desplazamiento se resta **antes** de llenar el `Float32Array`, y sale de la cabecera. `desplazamientoLocal()` ya está |
| `F2.3` | El control de densidad usa `saltoParaCaber()` y `puntosQueCaben()`, con el presupuesto del equipo como argumento         |
| `F2.4` | Se mide sobre la nube **sin diezmar**, y no se promete más precisión que la `scale` que declare el archivo               |
| `F2.6` | Un splat es otra captura de la realidad: hereda la alineación de `F2.2`, no la reinventa                                 |
