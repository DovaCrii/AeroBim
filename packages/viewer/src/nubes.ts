/**
 * Abrir una nube COPC en la misma escena que el modelo: `F2.1`.
 *
 * ## Lo que decidió `F2.5`, y lo que queda por hacer acá
 *
 * El formato es **COPC** —un LAZ 1.4 con el octree guardado dentro— por razones que están medidas en
 * `docs/NUBES_DE_PUNTOS.md`: es **un archivo**, así que cabe en el expediente como cualquier
 * documento; CloudCompare lo abre, con lo que el oráculo de la fase existe; trae dentro el
 * desplazamiento y el sistema de referencia; y se lee por partes.
 *
 * Lo que el formato **no** trae hecho es el recorrido: decidir qué nodos bajar. Eso se escribe acá.
 *
 * ## Las dos cosas que se hacen antes de pintar un punto, y por qué
 *
 * **1. Se resta el desplazamiento.** Es el hallazgo caro de la fase, medido: una coordenada norte de
 * UTM 19S guardada en un `Float32Array` —que es lo único que acepta WebGL— pierde **200 mm**. Los
 * mismos puntos, restando primero el desplazamiento de la cabecera: 0,003 mm. Y falla de la peor
 * manera, porque el error no es ruido sino un escalonado: la nube se ve bien y miente con dos
 * decimales. Así que el desplazamiento se resta **siempre**, y el objeto recuerda cuál era para
 * poder devolver coordenadas de verdad al medir.
 *
 * **2. Se mira si cabe antes de cargar.** `presupuesto()` de `bim-core` dice lo que va a ocupar, y
 * cada punto se paga dos veces —el `TypedArray` y su copia en la tarjeta—. Una nube de 50 millones
 * de puntos con color son 1,5 GB: se carga por niveles hasta el límite que se le dé, y **se dice
 * cuántos puntos quedaron fuera** en vez de cargar hasta colgar la pestaña.
 *
 * ## Y los ejes se convierten, o la nube queda tumbada
 *
 * Un LAS tiene la **cota en Z**, igual que un IFC. La escena de Three.js tiene el **arriba en Y**.
 * Meter los puntos sin convertir deja el levantamiento **de canto** respecto al modelo, y eso no se
 * arregla girando el objeto después: hay que ponerlos donde van.
 *
 * La transformación **no se inventa acá**. Es la misma que ya usan los ejes de replanteo y el plano
 * DXF de referencia, y está documentada y probada en `registro/viewpoint.ts` de `bim-core`:
 *
 * | escena (Three.js) | archivo (LAS o IFC) |
 * | ----------------- | ------------------- |
 * | `x`               | `x`                 |
 * | `y` (arriba)      | `z` (cota)          |
 * | `z`               | `-y`                |
 *
 * Usar otra convención aquí pondría la nube a noventa grados del modelo, que es justo el defecto que
 * la Fase 2 existe para no tener.
 *
 * ## El WASM va local, como el de `web-ifc`
 *
 * `laz-perf` descomprime con un WASM de 214 KB **en un archivo aparte**, y por defecto lo busca al
 * lado de su propio JavaScript — que empaquetado no está donde él cree. Es la misma trampa que la
 * regla cerrada número 9 de `AGENTS.md` ya documenta para `web-ifc`. Así que se crea a mano,
 * diciéndole dónde está, y se sirve desde `public/wasm/`: la aplicación tiene que abrir una nube en
 * una faena sin internet, y la CSP de la página no deja pedirle nada a otro origen.
 */

import { Copc, Las, type Getter } from "copc";
import * as THREE from "three";

import { desplazamientoLocal, presupuesto, type Atributo } from "@aerobim/bim-core";

/** Dónde se sirve el WASM de `laz-perf`. Local, y por las razones del encabezado. */
export const RUTA_WASM_LAZ = "/wasm/laz-perf.wasm";

/**
 * Cómo se leen los trozos del archivo: `fetch` con una cabecera `Range`.
 *
 * **Se escribe a mano en vez de usar `Getter.create` de `copc`, y por un defecto medido.** Ese
 * ayudante decide entre leer del disco con `fs` y pedir por HTTP **mirando si la cadena parece una
 * URL**, y una ruta como `/samples/levantamiento.copc.laz` no se lo parece: en el navegador tomaba el
 * camino de Node y moría con `Cannot read properties of undefined (reading 'access')`. La primera
 * prueba en un navegador de verdad lo encontró, que es justamente para lo que estaba.
 *
 * Y además deja **a la vista lo que importa del formato**: cada nodo del octree es una petición de
 * rango, y por eso una nube de gigas se puede empezar a ver sin descargarla. Un servidor que ignore
 * `Range` y devuelva el archivo entero —contestando `200` en vez de `206`— haría que esto funcione
 * mientras descarga todo, así que el aviso queda escrito acá: hay que mirar el código, no que la
 * imagen aparezca.
 */
export function lectorPorRango(url: string): Getter {
  return async (inicio: number, fin: number): Promise<Uint8Array> => {
    const respuesta = await fetch(url, { headers: { Range: `bytes=${inicio}-${fin - 1}` } });
    if (!respuesta.ok) {
      throw new Error(`no se pudo leer la nube (${respuesta.status}): ${url}`);
    }
    return new Uint8Array(await respuesta.arrayBuffer());
  };
}

/**
 * Los atributos que se suben por punto.
 *
 * Posición y color, y de momento no más: la intensidad y la clase se leen —hacen falta para colorear
 * y para `F2.4`— pero se resuelven a color en la CPU en vez de subir un atributo por cada una. Subir
 * los cuatro serían 18 bytes por punto en vez de 15, un 20 % más de memoria, para pintar lo mismo.
 */
const ATRIBUTOS: Atributo[] = ["posicion", "color"];

/** Lo que dice la cabecera de una nube, leído sin descargar un solo punto. */
export interface FichaDeNube {
  /** Cuántos puntos declara el archivo. */
  puntos: number;
  /** La extensión, en las coordenadas del archivo. */
  minimo: [number, number, number];
  maximo: [number, number, number];
  /** El desplazamiento y la escala que declara la cabecera. */
  desplazamiento: [number, number, number];
  escala: [number, number, number];
  /** El sistema de referencia, si el archivo lo trae. Vacío si no: **no se adivina**. */
  wkt: string;
  /** La profundidad del octree, o sea cuántos niveles de detalle hay. */
  niveles: number;
  /** Cuántos nodos tiene la página raíz de la jerarquía. */
  nodos: number;
  /** El lado del cubo del octree. Cero cuando el archivo no lo declara — ver `hayCubo`. */
  ladoDelCubo: number;
  /**
   * `false` cuando el archivo **no declara el cubo del octree**.
   *
   * Sin cubo no se pueden derivar las cajas de los nodos, así que no hay recorrido por lo que se
   * está mirando: solo se puede cargar por niveles. Se detectó escribiendo esto —el primer COPC de
   * prueba salió con el cubo en cero— y callarlo dejaría creer que el recorte por vista funciona.
   */
  hayCubo: boolean;
}

/** Una nube abierta: la ficha, el objeto de Three.js, y lo que se dejó fuera. */
export interface NubeCargada {
  ficha: FichaDeNube;
  /** El objeto para añadir a la escena. Sus coordenadas son **locales**: ver `desplazamiento`. */
  objeto: THREE.Points;
  /** Cuántos puntos se subieron de verdad. */
  cargados: number;
  /** Cuántos se dejaron fuera por el presupuesto. Cero si entró todo. */
  fuera: number;
  /** Hasta qué nivel del octree se llegó. */
  nivelMaximo: number;
  /**
   * El desplazamiento que se le restó a todo, **en coordenadas del archivo** (Z arriba).
   *
   * Para volver a coordenadas del archivo desde un punto de la escena hay que deshacer las dos
   * cosas: los ejes —`(x, -z, y)` de vuelta— y luego sumar esto. Es lo que tendrá que hacer `F2.4`
   * al informar una desviación, y por eso el orden queda escrito y no a la memoria de nadie.
   */
  desplazamiento: [number, number, number];
  /** Cuántos bytes ocupa, contando las dos copias. */
  bytes: number;
}

/** Cómo se pidió la nube. */
export interface OpcionesDeNube {
  /**
   * El techo de memoria en bytes, contando **las dos copias**. Sin esto no hay techo, y una nube de
   * obra cuelga la pestaña: no hay un valor por omisión porque depende del equipo, y uno inventado
   * acá se leería como medido.
   */
  presupuestoBytes: number;
  /** Dónde está el WASM de `laz-perf`. Por omisión, `RUTA_WASM_LAZ`. */
  rutaWasm?: string;
  /** Cómo se colorean los puntos. Por omisión, por altura. */
  color?: ModoDeColor;
}

/**
 * De qué se saca el color de cada punto.
 *
 * **Por altura es lo que va por omisión, y no es una preferencia estética.** Muchas nubes de
 * levantamiento vienen sin RGB —un escáner láser mide intensidad, no color— y pintarlas de un solo
 * gris deja una masa en la que no se distingue un muro de una losa. La altura siempre está.
 */
export type ModoDeColor = "altura" | "rgb" | "clase" | "intensidad";

/**
 * Lee la cabecera de una nube: cuántos puntos, dónde está y en qué sistema.
 *
 * **Se llama antes de cargar y es lo que permite avisar en vez de colgar.** Cuesta una petición de
 * rango, no la nube, así que con esto se puede decir «son 180 millones de puntos, no caben» sin
 * haber descargado nada.
 */
export async function fichaDeNube(url: string): Promise<FichaDeNube> {
  const getter = lectorPorRango(url);
  const copc = await Copc.create(getter);
  const pagina = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);

  const claves = Object.keys(pagina.nodes);
  let niveles = 0;
  for (const clave of claves) {
    const nivel = Number(clave.split("-")[0]);
    if (Number.isFinite(nivel) && nivel > niveles) niveles = nivel;
  }

  // `info.cube` es la caja del octree como `[minX, minY, minZ, maxX, maxY, maxZ]`, y es un cubo:
  // basta un lado. Cuando el archivo no lo declara sale todo en cero — ver `hayCubo`.
  const cubo = copc.info.cube;
  const lado = (cubo[3] ?? 0) - (cubo[0] ?? 0);

  return {
    puntos: Number(copc.header.pointCount),
    minimo: [...copc.header.min] as [number, number, number],
    maximo: [...copc.header.max] as [number, number, number],
    desplazamiento: [...copc.header.offset] as [number, number, number],
    escala: [...copc.header.scale] as [number, number, number],
    wkt: copc.wkt ?? "",
    niveles,
    nodos: claves.length,
    ladoDelCubo: lado,
    // Un cubo de lado cero no es un cubo: es un archivo que no lo declaro.
    hayCubo: lado > 0,
  };
}

/**
 * Abre la nube y devuelve el objeto listo para la escena.
 *
 * Carga **por niveles y de arriba abajo**: primero la raíz —la muestra gruesa, que ya deja ver la
 * forma— y después cada nivel entero mientras quepa en el presupuesto. Es el orden que hace que
 * aparezca algo pronto y que lo que se deje fuera sea el detalle y no un trozo de la nube.
 *
 * No hace recorte por lo que se está mirando. Eso pide las cajas de los nodos, que salen del cubo
 * del octree, y el cubo **no siempre está declarado** (ver `hayCubo`): se hará en `F2.3`, sobre
 * archivos que lo traigan.
 */
export async function abrirNube(url: string, opciones: OpcionesDeNube): Promise<NubeCargada> {
  const getter = lectorPorRango(url);
  const copc = await Copc.create(getter);
  const ficha = await fichaDeNube(url);
  const pagina = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);

  // El WASM se crea una vez y se le pasa a cada nodo: si no, `copc` crea el suyo buscandolo donde
  // no esta. Ver el encabezado del modulo.
  const lazPerf = await Las.PointData.createLazPerf({
    locateFile: () => opciones.rutaWasm ?? RUTA_WASM_LAZ,
  });

  const caben = puntosQueCabenAqui(opciones.presupuestoBytes);
  const desplazamiento = desplazamientoLocal(ficha.minimo);

  // Los nodos ordenados por nivel: la raiz primero. Dentro de un nivel el orden no importa, porque
  // se cargan todos o se corta el nivel entero.
  const nodos = Object.entries(pagina.nodes)
    .map(([clave, nodo]) => ({ clave, nivel: Number(clave.split("-")[0]), nodo }))
    .sort((a, b) => a.nivel - b.nivel);

  const posiciones: number[] = [];
  const colores: number[] = [];
  let cargados = 0;
  let fuera = 0;
  let nivelMaximo = -1;

  const rangoZ = ficha.maximo[2] - ficha.minimo[2];
  const modo = opciones.color ?? "altura";

  for (const { nivel, nodo } of nodos) {
    if (nodo === undefined) continue;
    // **El nivel se toma entero o no se toma.** Cargar la mitad de un nivel deja la nube con una
    // zona detallada y otra gruesa por un motivo que no tiene nada que ver con el modelo -el orden
    // de la jerarquia-, y eso se ve como un defecto del levantamiento.
    if (cargados + nodo.pointCount > caben) {
      fuera += nodo.pointCount;
      continue;
    }

    const vista = await Copc.loadPointDataView(getter, copc, nodo, { lazPerf });
    const leerX = vista.getter("X");
    const leerY = vista.getter("Y");
    const leerZ = vista.getter("Z");
    const tinta = pintorDe(vista, modo, ficha.minimo[2], rangoZ);

    for (let i = 0; i < vista.pointCount; i += 1) {
      // Dos cosas de una vez, y las dos tienen que pasar **antes** de que el numero toque un
      // `Float32Array`:
      //
      // 1. Restar el desplazamiento. Hacerlo despues —moviendo el objeto— no recupera la precision,
      //    porque ya se perdio al guardar.
      // 2. Convertir los ejes: `(x, z, -y)`. La cota del archivo es Z y el arriba de la escena es
      //    Y. Ver la tabla del encabezado.
      posiciones.push(
        leerX(i) - desplazamiento[0],
        leerZ(i) - desplazamiento[2],
        -(leerY(i) - desplazamiento[1]),
      );
      const [r, g, b] = tinta(i);
      colores.push(r, g, b);
    }

    cargados += vista.pointCount;
    if (nivel > nivelMaximo) nivelMaximo = nivel;
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute("color", new THREE.Uint8BufferAttribute(colores, 3, true));
  geometria.computeBoundingBox();
  geometria.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    size: 1,
    sizeAttenuation: false,
    vertexColors: true,
  });
  const objeto = new THREE.Points(geometria, material);
  objeto.name = "nube-de-puntos";
  // El desplazamiento se le cuelga al objeto: quien mida sobre el tiene que poder volver a las
  // coordenadas del archivo, y buscar la ficha desde otro sitio seria confiar en que nadie la
  // perdio por el camino.
  objeto.userData.desplazamiento = desplazamiento;
  objeto.userData.wkt = ficha.wkt;

  return {
    ficha,
    objeto,
    cargados,
    fuera,
    nivelMaximo,
    desplazamiento,
    bytes: presupuesto(cargados, ATRIBUTOS).total,
  };
}

/** Cuántos puntos caben en ese presupuesto, con los atributos que se suben de verdad. */
function puntosQueCabenAqui(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  // 15 bytes por punto -posicion y color-, y se pagan dos veces.
  return Math.floor(bytes / 30);
}

/** Un color por punto, en tres bytes, según el modo pedido. */
function pintorDe(
  vista: { getter: (n: string) => (i: number) => number; dimensions: Record<string, unknown> },
  modo: ModoDeColor,
  minZ: number,
  rangoZ: number,
): (i: number) => [number, number, number] {
  const tiene = (nombre: string) => Object.prototype.hasOwnProperty.call(vista.dimensions, nombre);

  if (modo === "rgb" && tiene("Red") && tiene("Green") && tiene("Blue")) {
    const rojo = vista.getter("Red");
    const verde = vista.getter("Green");
    const azul = vista.getter("Blue");
    // LAS guarda el color en 16 bits; el atributo de Three.js es de 8. Se divide por 257 y no por
    // 256: 65535/257 es exactamente 255, con lo que el blanco sigue siendo blanco.
    return (i) => [
      Math.round(rojo(i) / 257),
      Math.round(verde(i) / 257),
      Math.round(azul(i) / 257),
    ];
  }

  if (modo === "clase" && tiene("Classification")) {
    const clase = vista.getter("Classification");
    return (i) => colorDeClase(clase(i));
  }

  if (modo === "intensidad" && tiene("Intensity")) {
    const intensidad = vista.getter("Intensity");
    return (i) => {
      const v = Math.round(intensidad(i) / 257);
      return [v, v, v];
    };
  }

  // Por altura, que es lo que siempre se puede. Una nube plana -rango cero- se pinta de un solo
  // color en vez de dividir por cero.
  if (rangoZ <= 0) return () => [200, 200, 200];
  const leerZ = vista.getter("Z");
  return (i) => rampaDeAltura((leerZ(i) - minZ) / rangoZ);
}

/**
 * La rampa de altura: azul abajo, verde en medio, rojo arriba.
 *
 * Es la convención de cualquier programa de nubes —CloudCompare, Potree— y respetarla importa: quien
 * abre el levantamiento aquí ya sabe leerla. Inventar otra obligaría a aprender dos.
 */
function rampaDeAltura(t: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, t));
  if (v < 0.5) {
    const k = v * 2;
    return [0, Math.round(k * 255), Math.round((1 - k) * 255)];
  }
  const k = (v - 0.5) * 2;
  return [Math.round(k * 255), Math.round((1 - k) * 255), 0];
}

/**
 * El color de una clase de LAS, con las que se usan de verdad en obra.
 *
 * Solo las que importan para comparar contra un modelo: suelo, edificio, vegetación, agua y ruido.
 * El resto sale gris en vez de inventarle un color a cada uno de los 256 códigos posibles — un color
 * distinto por clase desconocida haría creer que se sabe qué es cada cosa.
 */
function colorDeClase(clase: number): [number, number, number] {
  switch (clase) {
    case 2:
      return [150, 110, 70]; // suelo
    case 3:
    case 4:
    case 5:
      return [60, 160, 60]; // vegetacion baja, media, alta
    case 6:
      return [200, 90, 90]; // edificio
    case 7:
      return [255, 0, 255]; // ruido: chillon a proposito, para que se vea y se descarte
    case 9:
      return [70, 130, 200]; // agua
    default:
      return [160, 160, 160];
  }
}
