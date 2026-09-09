/**
 * Abrir una nube COPC en la misma escena que el modelo, y mantenerla: `F2.1` y `F2.3`.
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
 * de puntos con color son 1,5 GB, así que **nunca se carga entera**: se piden los nodos que más
 * aportan hasta el techo que se dé, y **se dice cuántos quedaron fuera** en vez de cargar hasta
 * colgar la pestaña. Sobre la nube del proyecto —15,4 millones de puntos— eso son 440 MB si
 * entrara toda, y con 256 MB de techo entra el 58 %.
 *
 * **3. Y se trae solo lo que se está mirando**, que es lo que aporta `F2.3`: cada nodo ocupa una
 * caja conocida, así que antes de bajarlo se puede preguntar si se ve y cuántos píxeles ocupa. La
 * decisión es aritmética pura y vive en `nubes/octree.ts` de `bim-core`, probada sin navegador; acá
 * queda el ir y venir.
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

import { Copc, Las, type Getter, type Hierarchy } from "copc";
import * as THREE from "three";

import {
  cajaAArchivo,
  desplazamientoLocal,
  escenaAArchivo,
  planoAArchivo,
  nodosVisibles,
  presupuesto,
  type Atributo,
  type Caja,
  type ClaveDeNodo,
  type Cubo,
  type NodoDelArbol,
  type Plano,
} from "@aerobim/bim-core";

/**
 * Dónde se sirve el WASM de `laz-perf`. Local, y por las razones del encabezado.
 *
 * **Es solo el valor de reserva, y quien monta la aplicación tiene que pasar el suyo.** Esta ruta
 * es absoluta desde la raíz, así que sirve donde la aplicación vive en `/` —el servidor de Vite— y
 * **da 404 bajo `/visor/`**, que es como la sirve Django. Medido: `GET /wasm/laz-perf.wasm → 404`
 * con `Aborted(Both async and sync fetching of the wasm failed)`, o sea que la nube no se abría
 * desde el portal aunque los tramos ya respondieran 206.
 *
 * Se queda como reserva y no se borra porque las pruebas y `diag.html` viven en la raíz; lo que la
 * aplicación pasa es `rutaWasm` (ver {@link OpcionesDeNube}), calculado con `import.meta.env.BASE_URL`.
 */
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

/**
 * Cuántos nodos se piden a la vez.
 *
 * Ocho, y no uno ni mil: en serie el fixture de 371 nodos tardaba 1,7 s esperando peticiones de
 * rango una detrás de otra; todos a la vez sumaría el pico de memoria de mil nodos descomprimidos y
 * el navegador los encolaría igual, porque mantiene del orden de seis conexiones por origen.
 */
const TANDA_DE_NODOS = 8;

/**
 * Cuántos píxeles tiene que ocupar un nodo para valer la pena bajarlo.
 *
 * **Dieciséis, y no uno.** Con uno —el mínimo teórico— la selección se queda con casi todo el árbol:
 * sobre la nube del proyecto, `refrescar` traía 6 378 nodos y tardaba 19 s en algo que a esa
 * distancia se ve idéntico. Un nodo que ocupa dieciséis píxeles de alto en pantalla aporta, como
 * mucho, dieciséis píxeles de detalle; su padre ya los cubre.
 *
 * Es un valor por omisión y se puede cambiar por criterio: quien quiera exprimir el detalle lo baja,
 * y quien tenga un equipo justo lo sube.
 */
export const PIXELES_MINIMOS = 16;

/**
 * Cuántos puntos trae la apertura, antes de que la cámara diga qué se ve.
 *
 * Un millón y medio: sobre la nube del proyecto son unos **1,3 s** contra los 7,8 s de llenar el
 * presupuesto entero, y a esa altura ya se ve la forma del levantamiento. El detalle lo sube
 * `refreshPointCloud` en cuanto hay cámara, que es lo único que sabe qué está en pantalla.
 */
export const PUNTOS_DEL_PRIMER_PINTADO = 1_500_000;

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
  /**
   * La nube viva, para seguir refrescándola cuando la cámara se mueva y para los controles de
   * `F2.3`: tamaño de punto, densidad, recorte y color.
   */
  nube: NubeEnEscena;
  /** El objeto para añadir a la escena. Sus coordenadas son **locales**: ver `desplazamiento`. */
  objeto: THREE.Group;
  /** Qué pasó al cargarla: nodos traídos, descartados y por qué. */
  informe: InformeDeRefresco;
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
 * Cuántos niveles de gris tiene que recorrer la intensidad para que se vea algo.
 *
 * Veinticuatro de doscientos cincuenta y seis. Por debajo, la nube entera cae en una franja de
 * grises que el ojo lee como un color plano — y un modo que no distingue nada es indistinguible de
 * una carga fallida. Es el mismo umbral que usa `resumenDelColor` en el diagnóstico, a propósito:
 * dos números distintos para la misma pregunta acabarían discrepando.
 */
const RECORRIDO_MINIMO = 24;

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

/** Lo que se guarda de cada nodo ya cargado, para no volver a pedirlo. */
interface NodoCargado {
  objeto: THREE.Points;
  puntos: number;
  /**
   * Los datos de origen del color, **solo los que el archivo trae**.
   *
   * Se guardan en JavaScript y **no se suben a la tarjeta**: nada del sombreador los lee, así que
   * subirlos sería pagar memoria de vídeo por nada. Están para poder **recolorear sin volver a
   * descargar** — cambiar de «por altura» a «por clase» es recorrer un arreglo, no pedir el nodo
   * otra vez—. La altura no está aquí porque ya vive en la posición.
   */
  clase?: Uint8Array;
  intensidad?: Uint16Array;
  rgb?: Uint8Array;
}

/** Cómo se quiere ver la nube ahora mismo. Todo opcional: lo que no se diga, no cambia. */
export interface CriterioVisual {
  /** El techo de puntos. Es la «densidad»: menos puntos, menos detalle y más soltura. */
  puntosMaximos?: number;
  /** Los seis planos del tronco de visión de la cámara, para no bajar lo que no se ve. */
  planos?: readonly Plano[];
  /** Dónde está la cámara, en coordenadas **de la escena**. */
  camara?: readonly [number, number, number];
  /** `altoDeLaVentana / (2·tan(fov/2))` de la cámara. */
  factorDeProyeccion?: number;
  /** Cuántos píxeles tiene que ocupar un nodo para valer la pena bajarlo. */
  pixelesMinimos?: number;
  /** Hasta qué nivel del octree, si se quiere limitar a mano. */
  profundidadMaxima?: number;
}

/** Qué pasó en el último refresco. Se devuelve entero para poder enseñarlo y depurarlo. */
export interface InformeDeRefresco {
  /** Nodos que están en la escena ahora. */
  nodos: number;
  /** Puntos en la escena ahora. */
  puntos: number;
  /** Nodos que se han descargado en este refresco. */
  nuevos: number;
  /** Nodos que se han soltado por no hacer falta. */
  soltados: number;
  fueraDeVista: number;
  fueraDelRecorte: number;
  demasiadoPequenos: number;
  sinPresupuesto: number;
  /** Bytes ocupados: la tarjeta, JavaScript y las fuentes del color. */
  bytes: number;
  ms: number;
}

/**
 * Una nube abierta y viva en la escena: `F2.3`.
 *
 * ## Un objeto por nodo, y no un búfer con todo
 *
 * `F2.1` metía la nube entera en un `BufferGeometry`. Funciona para abrirla y **no sirve para
 * mantenerla**: en cuanto la cámara se mueve hay que quitar unos nodos y traer otros, y con un búfer
 * único eso es rehacerlo completo cada vez —descargar de nuevo lo que ya estaba—. Con un objeto por
 * nodo, traer detalle es añadir, y soltarlo es quitar.
 *
 * El precio es una llamada de dibujo por nodo en vez de una. Se acepta porque el alternativo es
 * volver a descargar, que cuesta órdenes de magnitud más, y porque los nodos que se dibujan a la vez
 * son decenas: es lo que hace cualquier visor de nubes.
 *
 * ## Y el color se cambia sin volver a pedir nada
 *
 * Los datos de los que sale el color —clase, intensidad, RGB— se guardan por nodo en JavaScript, sin
 * subirlos a la tarjeta. Cambiar de modo recorre esos arreglos y reescribe el atributo de color. Sin
 * eso, pasar de «por altura» a «por clase» volvería a descargar la nube entera, que es lo que hace
 * que nadie toque el control.
 */
export class NubeEnEscena {
  /** El grupo que va a la escena. Dentro, un `THREE.Points` por nodo cargado. */
  readonly objeto = new THREE.Group();
  readonly ficha: FichaDeNube;
  /** El desplazamiento restado, **en coordenadas del archivo**. Ver {@link NubeCargada}. */
  readonly desplazamiento: [number, number, number];

  private readonly material: THREE.PointsMaterial;
  private readonly cargados = new Map<string, NodoCargado>();
  private readonly candidatos: NodoDelArbol[];
  private readonly porClave = new Map<string, Hierarchy.Node>();
  private readonly cubo: Cubo;
  private modo: ModoDeColor;
  private caja: Caja | null = null;
  private ultimo: CriterioVisual = {};

  private constructor(
    private readonly getter: Getter,
    private readonly copc: Copc,
    private readonly lazPerf: unknown,
    ficha: FichaDeNube,
    nodos: Hierarchy.Node.Map,
    modo: ModoDeColor,
  ) {
    this.ficha = ficha;
    this.desplazamiento = desplazamientoLocal(ficha.minimo);
    this.modo = modo;
    this.objeto.name = "nube-de-puntos";
    this.objeto.userData.desplazamiento = this.desplazamiento;
    this.objeto.userData.wkt = ficha.wkt;

    // **El cubo se queda en coordenadas del ARCHIVO, y esto fue un defecto.**
    //
    // La primera version lo convertia a la escena, y estaba mal: la clave de un nodo —`(d, x, y,
    // z)`— indexa las celdas en los ejes **del archivo**, con la cota en Z. Con el cubo convertido,
    // el indice del norte se aplicaba sobre la altura, y las cajas de los nodos salian en sitios
    // que no existen.
    //
    // Y no fallaba de forma visible: el recorte seguia dando cuentas verosimiles —«597 fuera de
    // vista»— solo que eran los nodos equivocados. Lo que se convierte ahora es **la camara**, con
    // `planoAArchivo` y `cajaAArchivo`, que estan probados.
    this.cubo = [...this.copc.info.cube] as Cubo;

    this.candidatos = [];
    for (const [clave, nodo] of Object.entries(nodos)) {
      if (nodo === undefined) continue;
      const partes = clave.split("-").map(Number);
      if (partes.length !== 4 || partes.some((v) => !Number.isFinite(v))) continue;
      const [d, x, y, z] = partes as [number, number, number, number];
      this.candidatos.push({ clave: { d, x, y, z }, puntos: nodo.pointCount });
      this.porClave.set(clave, nodo);
    }

    this.material = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
    });
  }

  /** Abre la nube: lee la cabecera y la jerarquía, y prepara el WASM. No descarga puntos. */
  static async abrir(url: string, opciones: OpcionesDeNube): Promise<NubeEnEscena> {
    const getter = lectorPorRango(url);
    const copc = await Copc.create(getter);
    const ficha = await fichaDeNube(url);
    const pagina = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);
    // El WASM se crea una vez y se le pasa a cada nodo: si no, `copc` crea el suyo buscandolo donde
    // no esta. Ver el encabezado del modulo.
    const lazPerf = await Las.PointData.createLazPerf({
      locateFile: () => opciones.rutaWasm ?? RUTA_WASM_LAZ,
    });
    return new NubeEnEscena(getter, copc, lazPerf, ficha, pagina.nodes, opciones.color ?? "altura");
  }

  /** El tamaño del punto en píxeles. Sin atenuación por distancia: ver {@link tamanoDePunto}. */
  get tamanoDePunto(): number {
    return this.material.size;
  }

  /**
   * Cambia el tamaño del punto, en píxeles.
   *
   * **Sin atenuación por distancia, a propósito.** Con atenuación los puntos lejanos se hacen
   * subpíxel y la nube se deshilacha justo donde ya hay menos detalle por el nivel del octree: los
   * dos efectos se suman y el fondo desaparece. Un tamaño fijo en pantalla mantiene la superficie
   * legible a cualquier distancia, que es lo que se necesita para comparar contra el modelo.
   */
  set tamanoDePunto(pixeles: number) {
    this.material.size = Math.max(1, pixeles);
  }

  /** El modo de color actual. */
  get color(): ModoDeColor {
    return this.modo;
  }

  /**
   * Cambia de qué sale el color, **sin volver a descargar**.
   *
   * Si el archivo no trae lo que se pide —RGB en un levantamiento láser, por ejemplo— se cae a la
   * altura y el modo devuelto lo dice: pintarla de negro porque no hay color sería enseñar una nube
   * vacía y dejar a quien mira pensando que falla la carga.
   *
   * **Y «lo trae» dejó de significar «la dimensión existe», el 2026-09-09.** El usuario lo dijo
   * así: «poder cargar bien la intensidad y el RGB de la nube de puntos». Medido sobre el
   * levantamiento del Camino Agrícola —15,4 millones de puntos— con `diag.html?modo=nube`, los
   * cuatro modos se aplicaban y **uno pintaba un solo color**:
   *
   * | Modo        | Lo que llegaba al atributo de color                       |
   * | ----------- | --------------------------------------------------------- |
   * | altura      | 200+ colores                                              |
   * | clase       | **R 160–160 · G 160–160 · B 160–160 · un solo color**     |
   * | intensidad  | 200+ colores                                              |
   * | rgb         | 200+ colores                                              |
   *
   * O sea que la intensidad y el RGB **sí cargaban**: lo que estaba plano era la clasificación, y
   * el selector estaba justo ahí. Este levantamiento trae la dimensión `Classification` con un solo
   * valor en todos los puntos, así que `colorDeClase` devuelve su gris de «clase desconocida» para
   * los quince millones — y la comprobación de antes daba el visto bueno, porque la dimensión
   * **existía**.
   *
   * Un modo que no distingue nada es indistinguible de una carga fallida para quien mira, que es
   * exactamente lo que este método existe para evitar. Así que ahora se pregunta si el dato
   * **sirve**, no si está. Ver {@link distingueAlgo}.
   */
  colorear(modo: ModoDeColor): ModoDeColor {
    this.modo = this.distingueAlgo(modo) ? modo : "altura";
    for (const cargado of this.cargados.values()) this.pintar(cargado);
    return this.modo;
  }

  /**
   * Si ese modo pintaría algo que se distingue, sobre lo que hay cargado ahora.
   *
   * **Se mira el dato de origen y no el color ya pintado**, que es lo que permite contestar antes de
   * pintar. Y se muestrea uno de cada `SALTO`: con quince millones de puntos recorrerlos enteros
   * cuesta décimas por cada cambio de modo, y la respuesta no cambia — lo que se busca es si hay
   * dos valores distintos, no cuántos.
   *
   * La altura siempre sirve: la cota está en la posición y una nube plana de verdad es un dato
   * legítimo, no un modo roto.
   */
  private distingueAlgo(modo: ModoDeColor): boolean {
    if (modo === "altura") return true;

    /** Uno de cada cuantos puntos se mira. Primo, para no caer siempre en la misma rejilla. */
    const SALTO = 37;

    if (modo === "clase") {
      const vistos = new Set<number>();
      for (const cargado of this.cargados.values()) {
        const clase = cargado.clase;
        if (clase === undefined) continue;
        for (let i = 0; i < clase.length; i += SALTO) {
          vistos.add(clase[i] as number);
          if (vistos.size > 1) return true;
        }
      }
      return false;
    }

    if (modo === "intensidad") {
      let minimo = Infinity;
      let maximo = -Infinity;
      for (const cargado of this.cargados.values()) {
        const intensidad = cargado.intensidad;
        if (intensidad === undefined) continue;
        for (let i = 0; i < intensidad.length; i += SALTO) {
          const v = intensidad[i] as number;
          if (v < minimo) minimo = v;
          if (v > maximo) maximo = v;
        }
      }
      // **El umbral es en bytes y no en crudo**, porque es lo que se ve: la intensidad se mapea
      // dividiendo por 257, así que un recorrido de 6 000 en crudo son 23 niveles de gris y en
      // pantalla es una masa. `RECORRIDO_MINIMO` es el mismo número que usa el diagnóstico.
      return maximo > -Infinity && (maximo - minimo) / 257 >= RECORRIDO_MINIMO;
    }

    // RGB: basta con que haya dos colores. Un archivo con la terna a cero en todos los puntos
    // —pasa, cuando el exportador rellena el campo sin tener color— pintaría la nube de negro.
    const vistos = new Set<number>();
    for (const cargado of this.cargados.values()) {
      const rgb = cargado.rgb;
      if (rgb === undefined) continue;
      for (let i = 0; i + 2 < rgb.length; i += 3 * SALTO) {
        vistos.add(
          ((rgb[i] as number) << 16) | ((rgb[i + 1] as number) << 8) | (rgb[i + 2] as number),
        );
        if (vistos.size > 1) return true;
      }
    }
    return false;
  }

  /**
   * Recorta por una caja, en coordenadas **de la escena**, o `null` para no recortar.
   *
   * Actúa en dos sitios y los dos hacen falta: los nodos que no tocan la caja **no se descargan**
   * —eso lo decide `nodosVisibles`— y los que la tocan a medias se recortan **punto por punto en la
   * tarjeta**, con los seis planos del material. Solo lo primero dejaría bordes de nodo asomando,
   * que se ven como escalones rectos; solo lo segundo descargaría la nube entera para tirar la mayor
   * parte.
   *
   * El recorte del material es exacto y no cuesta memoria: lo hace el sombreador. Requiere que el
   * renderizador tenga el recorte local encendido, y de eso se encarga el visor al añadir la nube.
   */
  recortar(caja: Caja | null): void {
    this.caja = caja;
    this.material.clippingPlanes =
      caja === null
        ? null
        : [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), -caja[0]),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), caja[3]),
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -caja[1]),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), caja[4]),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -caja[2]),
            new THREE.Plane(new THREE.Vector3(0, 0, -1), caja[5]),
          ];
    this.material.needsUpdate = true;
  }

  /** La caja de recorte, o `null`. */
  get recorte(): Caja | null {
    return this.caja;
  }

  /**
   * Trae lo que hace falta y suelta lo que no, según el criterio.
   *
   * Es idempotente: llamarlo dos veces con el mismo criterio no descarga nada la segunda. Eso es lo
   * que permite llamarlo al soltar la cámara sin pensar si hace falta.
   */
  async refrescar(criterio: CriterioVisual = {}): Promise<InformeDeRefresco> {
    const t0 = performance.now();
    this.ultimo = { ...this.ultimo, ...criterio };
    const c = this.ultimo;

    // El criterio se arma campo a campo porque `exactOptionalPropertyTypes` distingue «ausente» de
    // «presente y `undefined`», y ahi la diferencia importa: `planos: undefined` tendria que
    // significar «no recortes por vista», y pasarlo explicito deja al lector adivinandolo.
    // La camara viene en coordenadas de la escena y el octree vive en las del archivo, asi que se
    // convierte **la camara** —no el octree—. Es un movimiento rigido, asi que las distancias y por
    // tanto el tamano en pantalla no cambian.
    const planos = c.planos?.map((p) => planoAArchivo(p, this.desplazamiento));
    const camara =
      c.camara !== undefined ? escenaAArchivo(c.camara, this.desplazamiento) : undefined;
    const recorte = this.caja !== null ? cajaAArchivo(this.caja, this.desplazamiento) : null;

    const seleccion = nodosVisibles(this.candidatos, {
      cubo: this.cubo,
      puntosMaximos: c.puntosMaximos ?? Number.POSITIVE_INFINITY,
      ...(planos !== undefined ? { planos } : {}),
      ...(camara !== undefined ? { camara } : {}),
      ...(c.factorDeProyeccion !== undefined ? { factorDeProyeccion: c.factorDeProyeccion } : {}),
      pixelesMinimos: c.pixelesMinimos ?? PIXELES_MINIMOS,
      ...(c.profundidadMaxima !== undefined ? { profundidadMaxima: c.profundidadMaxima } : {}),
      ...(recorte !== null ? { recorte } : {}),
    });

    const quiere = new Set(seleccion.elegidos.map((n) => textoDeClave(n.clave)));

    // Primero se suelta lo que ya no hace falta, y luego se trae lo nuevo. En ese orden y no al
    // reves: al reves el pico de memoria es la suma de las dos, que es justo cuando revienta.
    let soltados = 0;
    // Se recorre una lista de las claves y no el mapa: borrar de un `Map` mientras se itera es
    // legal en JavaScript, pero deja el codigo apoyado en un detalle del recorrido que nadie
    // recuerda al leerlo.
    for (const clave of Array.from(this.cargados.keys())) {
      const cargado = this.cargados.get(clave);
      if (cargado === undefined) continue;
      if (quiere.has(clave)) continue;
      this.objeto.remove(cargado.objeto);
      cargado.objeto.geometry.dispose();
      this.cargados.delete(clave);
      soltados += 1;
    }

    // **Los nodos que faltan se piden en paralelo, y con un tope.**
    //
    // En serie, 371 nodos del fixture tardaban 1,7 s: cada uno es una petición de rango y el
    // navegador se pasa el tiempo esperando, no descomprimiendo. Con la nube real serían miles y
    // el visor parecería colgado.
    //
    // Y con tope y no todos a la vez, por dos razones medibles: un navegador solo mantiene unas
    // seis peticiones por origen —lanzar mil las encola igual, pero además ocupa memoria con mil
    // promesas— y el pico de RAM sería la suma de todos los nodos descomprimidos a la vez.
    const pendientes = seleccion.elegidos
      .map((e) => textoDeClave(e.clave))
      .filter((clave) => !this.cargados.has(clave) && this.porClave.has(clave));

    let nuevos = 0;
    for (let i = 0; i < pendientes.length; i += TANDA_DE_NODOS) {
      const tanda = pendientes.slice(i, i + TANDA_DE_NODOS);
      const traidos = await Promise.all(
        tanda.map(async (clave) => {
          const nodo = this.porClave.get(clave);
          if (nodo === undefined) return null;
          return [clave, await this.descargar(nodo)] as const;
        }),
      );
      // El orden de inserción en la escena es el de la selección, no el de llegada: así el nivel
      // grueso queda antes que el fino y el dibujo es estable entre refrescos.
      for (const traido of traidos) {
        if (traido === null) continue;
        const [clave, cargado] = traido;
        this.cargados.set(clave, cargado);
        this.objeto.add(cargado.objeto);
        nuevos += 1;
      }
    }

    let puntos = 0;
    let bytes = 0;
    for (const cargado of this.cargados.values()) {
      puntos += cargado.puntos;
      bytes += presupuesto(cargado.puntos, ATRIBUTOS).total;
      // Y las fuentes del color, que viven solo en JavaScript.
      bytes +=
        (cargado.clase?.byteLength ?? 0) +
        (cargado.intensidad?.byteLength ?? 0) +
        (cargado.rgb?.byteLength ?? 0);
    }

    return {
      nodos: this.cargados.size,
      puntos,
      nuevos,
      soltados,
      fueraDeVista: seleccion.fueraDeVista,
      fueraDelRecorte: seleccion.fueraDelRecorte,
      demasiadoPequenos: seleccion.demasiadoPequenos,
      sinPresupuesto: seleccion.sinPresupuesto,
      bytes,
      ms: performance.now() - t0,
    };
  }

  /** Cuántos nodos hay en el árbol del archivo, cargados o no. */
  get nodosDelArbol(): number {
    return this.candidatos.length;
  }

  /** El nivel más profundo que está cargado ahora, o `-1` si no hay nada. */
  get nivelCargado(): number {
    let maximo = -1;
    for (const clave of this.cargados.keys()) {
      const d = Number(clave.split("-")[0]);
      if (Number.isFinite(d) && d > maximo) maximo = d;
    }
    return maximo;
  }

  /** La caja de todo lo cargado, en coordenadas de la escena, o `null` si no hay nada. */
  cajaDeLoCargado(): THREE.Box3 | null {
    const union = new THREE.Box3();
    let hay = false;
    for (const cargado of this.cargados.values()) {
      const caja = cargado.objeto.geometry.boundingBox;
      if (caja === null) continue;
      union.union(caja);
      hay = true;
    }
    return hay ? union : null;
  }

  /** Suelta todo: los nodos, sus geometrías y el material. */
  dispose(): void {
    for (const cargado of this.cargados.values()) {
      this.objeto.remove(cargado.objeto);
      cargado.objeto.geometry.dispose();
    }
    this.cargados.clear();
    this.material.dispose();
  }

  /** Descarga un nodo y lo deja listo, con sus fuentes de color guardadas. */
  private async descargar(nodo: Hierarchy.Node): Promise<NodoCargado> {
    const vista = await Copc.loadPointDataView(this.getter, this.copc, nodo, {
      lazPerf: this.lazPerf as never,
    });
    const n = vista.pointCount;
    const leerX = vista.getter("X");
    const leerY = vista.getter("Y");
    const leerZ = vista.getter("Z");
    const d = this.desplazamiento;

    const posiciones = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      // Dos cosas de una vez, y las dos **antes** de que el numero toque el `Float32Array`:
      //
      // 1. Restar el desplazamiento. Hacerlo despues —moviendo el objeto— no recupera la precision,
      //    porque ya se perdio al guardar.
      // 2. Convertir los ejes: `(x, z, -y)`. La cota del archivo es Z y el arriba de la escena es
      //    Y. Ver la tabla del encabezado.
      posiciones[i * 3] = leerX(i) - d[0];
      posiciones[i * 3 + 1] = leerZ(i) - d[2];
      posiciones[i * 3 + 2] = -(leerY(i) - d[1]);
    }

    const cargado: NodoCargado = {
      objeto: new THREE.Points(new THREE.BufferGeometry(), this.material),
      puntos: n,
    };

    const tiene = (nombre: string) =>
      Object.prototype.hasOwnProperty.call(vista.dimensions, nombre);

    if (tiene("Classification")) {
      const leer = vista.getter("Classification");
      const arreglo = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) arreglo[i] = leer(i);
      cargado.clase = arreglo;
    }
    if (tiene("Intensity")) {
      const leer = vista.getter("Intensity");
      const arreglo = new Uint16Array(n);
      for (let i = 0; i < n; i += 1) arreglo[i] = leer(i);
      cargado.intensidad = arreglo;
    }
    if (tiene("Red") && tiene("Green") && tiene("Blue")) {
      const r = vista.getter("Red");
      const g = vista.getter("Green");
      const b = vista.getter("Blue");
      const arreglo = new Uint8Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        // LAS guarda el color en 16 bits y el atributo es de 8. Se divide por 257 y no por 256:
        // 65535/257 es exactamente 255, con lo que el blanco sigue siendo blanco.
        arreglo[i * 3] = Math.round(r(i) / 257);
        arreglo[i * 3 + 1] = Math.round(g(i) / 257);
        arreglo[i * 3 + 2] = Math.round(b(i) / 257);
      }
      cargado.rgb = arreglo;
    }

    const geometria = cargado.objeto.geometry;
    geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
    geometria.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(n * 3), 3, true));
    geometria.computeBoundingBox();
    geometria.computeBoundingSphere();
    this.pintar(cargado);
    return cargado;
  }

  /** Rellena el atributo de color de un nodo según el modo actual. */
  private pintar(cargado: NodoCargado): void {
    const geometria = cargado.objeto.geometry;
    const color = geometria.getAttribute("color") as THREE.BufferAttribute;
    const destino = color.array as Uint8Array;
    const n = cargado.puntos;

    // La decision de si el modo sirve **la toma `colorear` para la nube entera**, no este metodo
    // por nodo: un nodo sin la dimension haria caer el modo de toda la nube al pintarlo, y con
    // los nodos llegando de a poco eso deja el desplegable cambiando solo. Aqui queda el respaldo
    // por nodo -un nodo al que le falte el arreglo se pinta por altura- sin tocar el modo anotado.
    let modo = this.modo;
    if (modo === "rgb" && cargado.rgb === undefined) modo = "altura";
    if (modo === "clase" && cargado.clase === undefined) modo = "altura";
    if (modo === "intensidad" && cargado.intensidad === undefined) modo = "altura";

    if (modo === "rgb" && cargado.rgb !== undefined) {
      destino.set(cargado.rgb);
    } else if (modo === "clase" && cargado.clase !== undefined) {
      for (let i = 0; i < n; i += 1) {
        const [r, g, b] = colorDeClase(cargado.clase[i] as number);
        destino[i * 3] = r;
        destino[i * 3 + 1] = g;
        destino[i * 3 + 2] = b;
      }
    } else if (modo === "intensidad" && cargado.intensidad !== undefined) {
      for (let i = 0; i < n; i += 1) {
        const v = Math.round((cargado.intensidad[i] as number) / 257);
        destino[i * 3] = v;
        destino[i * 3 + 1] = v;
        destino[i * 3 + 2] = v;
      }
    } else {
      // Por altura, que es lo que siempre se puede: la cota ya esta en la posicion, asi que no
      // cuesta memoria. El rango es el de la nube ENTERA y no el del nodo: si cada nodo se
      // normalizara por su cuenta, dos nodos vecinos saldrian con rampas distintas y la nube
      // quedaria a parches.
      const posiciones = geometria.getAttribute("position").array as Float32Array;
      const minY = this.ficha.minimo[2] - this.desplazamiento[2];
      const rango = this.ficha.maximo[2] - this.ficha.minimo[2];
      for (let i = 0; i < n; i += 1) {
        const t = rango > 0 ? ((posiciones[i * 3 + 1] as number) - minY) / rango : 0.5;
        const [r, g, b] = rampaDeAltura(t);
        destino[i * 3] = r;
        destino[i * 3 + 1] = g;
        destino[i * 3 + 2] = b;
      }
    }

    color.needsUpdate = true;
  }
}

/**
 * Abre la nube y la deja cargada de una vez, sin cámara: el camino corto.
 *
 * Sirve para abrir y encuadrar —y es lo que usa el visor al soltar un archivo—, y devuelve la nube
 * viva para poder seguir refrescándola cuando la cámara se mueva. Sin planos de vista trae los nodos
 * que quepan, empezando por los que más aportan.
 */
export async function abrirNube(url: string, opciones: OpcionesDeNube): Promise<NubeCargada> {
  const nube = await NubeEnEscena.abrir(url, opciones);
  // **El primer pintado no llena el presupuesto, y eso se midio.** Sin camara la seleccion no
  // puede descartar nada por tamano, asi que llenar 256 MB son 8,9 millones de puntos y **7,8
  // segundos** en los que la pantalla esta vacia. Con el tope del primer pintado aparece la nube
  // en cerca de un segundo, y el refresco con la camara —que si sabe que se ve— sube el detalle
  // donde hace falta. Es lo mismo que hace cualquier visor de nubes: ensenar algo y afinar.
  const informe = await nube.refrescar({
    puntosMaximos: Math.min(
      puntosQueCabenAqui(opciones.presupuestoBytes),
      PUNTOS_DEL_PRIMER_PINTADO,
    ),
  });

  return {
    ficha: nube.ficha,
    nube,
    objeto: nube.objeto,
    cargados: informe.puntos,
    fuera: nube.ficha.puntos - informe.puntos,
    nivelMaximo: nube.nivelCargado,
    desplazamiento: nube.desplazamiento,
    bytes: informe.bytes,
    informe,
  };
}

/** Cuántos puntos caben en ese presupuesto, con los atributos que se suben de verdad. */
function puntosQueCabenAqui(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  // 15 bytes por punto -posicion y color-, y se pagan dos veces.
  return Math.floor(bytes / 30);
}

/** La clave de un nodo como texto, que es como la indexa `copc`. */
function textoDeClave(clave: ClaveDeNodo): string {
  return `${clave.d}-${clave.x}-${clave.y}-${clave.z}`;
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
