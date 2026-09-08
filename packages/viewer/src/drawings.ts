/**
 * Planos generados **desde el modelo**: la otra mitad de la Fase 7.
 *
 * La mitad de entrada trae el CAD que ya existe y lo compara con el IFC. Esta saca del modelo un
 * dibujo 2D que alguien pueda imprimir, firmar o seguir trabajando en su CAD — que para una oficina
 * técnica suele valer más que un modo de visualización.
 *
 * **Casi todo esto ya existe en `@thatopen/components` y aquí solo se ensambla**, que es la regla
 * del repositorio: `EdgeProjector` proyecta las aristas del modelo sobre un plano, `TechnicalDrawing`
 * es el dibujo con sus viewports, y `DxfExporter` lo serializa. Lo propio es decidir **qué se
 * proyecta, con qué nombre y con qué papel**, y no perder de vista lo que cuesta.
 */

import * as OBC from "@thatopen/components";
import * as THREE from "three";
import {
  CuadrosEnPlano,
  type MedidasDeTabla,
  registrarExportador,
  type TablaDeCuadro,
  trazarTabla,
} from "./cuadro-en-plano.js";

/** Un plano ya generado, con lo que la interfaz necesita para listarlo y exportarlo. */
export interface GeneratedDrawing {
  readonly id: string;
  readonly name: string;
  /** Desde dónde se proyectó. */
  readonly view: DrawingView;
  /** Cuántos segmentos tiene el dibujo visible, que es el tamaño real del plano. */
  readonly segments: number;
  /** Cuántos segmentos quedaron ocultos por el propio modelo. */
  readonly hiddenSegments: number;
  /** Cuánto mide el dibujo, en metros. */
  readonly sizeM: readonly [number, number];
  /** Cuánto costó generarlo. Es la cifra que decide si esto se puede usar o no. */
  readonly elapsedMs: number;
}

/** Desde dónde se mira el modelo para dibujarlo. */
export type DrawingView = "plan" | "front" | "side";

/**
 * Las capas del plano, con el nombre que llevan **en el DXF**. `F7.2`.
 *
 * **Antes todo salía en la capa `0`**, y eso es lo que hace inútil un DXF en una oficina técnica:
 * quien lo abre no puede apagar las aristas ocultas, ni darles otro grosor de trazo, ni congelarlas
 * para acotar encima. Un plano en el que todo es la misma capa es un dibujo, no un entregable.
 *
 * La causa era que el código montaba las líneas a mano —`drawing.three.add()` y `layers.set(1)`—
 * en vez de pasarlas por `addProjectionLines()`, que es lo que asigna la capa. La librería tenía la
 * API desde el principio; lo que faltaba era usarla.
 *
 * **Los nombres van cortos y con prefijo.** En un CAD estos planos se insertan en un archivo que ya
 * tiene sus capas, así que `VISIBLE` a secas se mezclaría con las de la oficina; `AB-` dice de dónde
 * salió sin ocupar media línea en el desplegable de capas.
 */
export const CAPAS = {
  visibles: "AB-VISIBLE",
  ocultas: "AB-OCULTA",
} as const;

/** Una capa de un plano generado, para poder listarla y apagarla desde la interfaz. */
export interface DrawingLayerInfo {
  /** El nombre que lleva en el DXF. */
  readonly name: string;
  readonly visible: boolean;
  /** Cuántos segmentos hay en esta capa. */
  readonly segments: number;
}

/** Hacia dónde proyecta cada vista. */
const DIRECCIONES: Record<DrawingView, readonly [number, number, number]> = {
  plan: [0, -1, 0],
  front: [0, 0, -1],
  side: [-1, 0, 0],
};

/** Cómo se llama cada vista en el nombre del plano. */
const NOMBRES: Record<DrawingView, string> = {
  plan: "Planta",
  front: "Alzado frontal",
  side: "Alzado lateral",
};

/**
 * Cuánto se espera **sin un solo aviso de avance** antes de darlo por colgado.
 *
 * **No es un tope al tiempo total**, y la diferencia es todo: proyectar las aristas de un modelo
 * grande puede tardar minutos legítimamente, y cortarlo a los treinta segundos rompería el caso
 * bueno. Lo que no puede pasar es que no ocurra *nada*: `EdgeProjector` informa de su avance, así
 * que veinte segundos de silencio absoluto significan que se quedó.
 *
 * **Existe porque el fallo se reprodujo.** En un navegador que no compone fotogramas —el panel del
 * entorno de trabajo— `projector.get()` **no resuelve nunca y no emite un solo aviso**: la promesa
 * se queda pendiente. Sin este corte, la interfaz mostraba «Proyectando las aristas del modelo…»
 * para siempre, sin error y sin salida, que es la misma clase de fallo que ya costó una sesión con
 * el WASM multihilo. Un mensaje claro no arregla la proyección, pero convierte un cuelgue en algo
 * que se puede contar.
 */
const SIN_AVANCE_MS = 20_000;

/**
 * Desde cuanto desnivel se considera que una cota tiene pendiente, en metros.
 *
 * **Va en milimetros y no en cero a proposito.** Dos puntos ajustados a vertices distintos de la
 * misma losa difieren en decimas de milimetro por la propia geometria del IFC, y anotar «0,02 %» en
 * una planta es ruido que ademas hace dudar de la que si importa. Cinco milimetros en un recorrido
 * de un metro son el 0,5 %, que es la pendiente minima de un desague: por debajo de eso no hay nada
 * que anotar.
 */
const DESNIVEL_MINIMO_M = 0.005;

/** Lo que se guarda de cada plano generado. */
interface PlanoGenerado {
  readonly info: GeneratedDrawing;
  readonly drawing: OBC.TechnicalDrawing;
  readonly viewport: OBC.DrawingViewport;
  /** La caja que ocupa el dibujo, para poder colocar una tabla debajo. Ver {@link DrawingMaker.addTable}. */
  readonly caja: THREE.Box3;
  /**
   * De qué elemento es cada grupo de vértices de la proyección, o `null`.
   *
   * **Es lo que permite saber dónde cayó un elemento en el plano** —ver
   * {@link DrawingMaker.addCallouts}— y no se puede reconstruir después: lo devuelve `EdgeProjector`
   * junto a la geometría y no hay otra forma de recuperarlo.
   */
  readonly grupos: Record<number, { modelId: string; localId: number }> | null;
  /** Las posiciones proyectadas, para promediar las de un elemento. */
  readonly posiciones: THREE.BufferAttribute | null;
  /** El atributo `group` por vértice, que indexa {@link grupos}. */
  readonly deGrupo: THREE.BufferAttribute | null;
}

/** Lo que hace falta de un hallazgo para poder señalarlo en el plano. `F7.3`. */
export interface HallazgoParaLlamada {
  /** El identificador del elemento **en este modelo**, ya resuelto desde su GUID. */
  readonly localId: number;
  readonly titulo: string;
}

/**
 * Los planos que se generan desde el modelo, y su exportación.
 *
 * Vive aparte del visor por lo mismo que los planos 2D y los ejes: es un trabajo con entrada y
 * salida claras —qué elementos, qué vista, qué papel— que no necesita saber nada del resto.
 */
export class DrawingMaker {
  private readonly planos = new Map<string, PlanoGenerado>();
  private siguiente = 1;
  /** El sistema de tablas, creado la primera vez que se pide una. Ver {@link addTable}. */
  private cuadros: CuadrosEnPlano | null = null;
  /** El sistema de cotas lineales, creado la primera vez que se acota. Ver {@link addDimensions}. */
  private cotas: OBC.LinearAnnotations | null = null;
  /** El de ángulos. Ver {@link addAngles}. */
  private angulos: OBC.AngleAnnotations | null = null;
  /** El de pendientes. Ver {@link addSlopes}. */
  private pendientes: OBC.SlopeAnnotations | null = null;
  /** El de llamadas. Ver {@link addCallouts}. */
  private llamadas: OBC.CalloutAnnotations | null = null;
  /**
   * Las tablas puestas, con lo que hace falta para volver a trazarlas. Ver {@link sheet}.
   *
   * **Se apuntan aquí y no se leen del sistema de anotación**: la lámina del PDF necesita los
   * textos ya situados, y `trazarTabla` los calcula de la tabla y sus medidas. Ir a buscarlos
   * dentro de los grupos que dibuja la librería sería leer sus entrañas.
   */
  private readonly tablas: { tabla: TablaDeCuadro; medidas: MedidasDeTabla }[] = [];

  constructor(private readonly components: OBC.Components) {}

  /**
   * Pone una tabla en un plano generado, dentro de la lámina. `F10.4`.
   *
   * **Se coloca debajo del dibujo y no encima**, y con el ancho del propio dibujo como referencia:
   * una tabla puesta en el medio tapa justamente lo que el plano dibuja. El alto de fila y el ancho
   * de carácter se derivan del tamaño del plano, así que un cuadro en una lámina de un edificio y
   * otro en una de un detalle salen los dos legibles y no uno microscópico.
   *
   * Y **el viewport se agranda para que quepa**, porque el recorte del exportador es implacable: sin
   * esto la tabla queda fuera de la caja y se escribe a medias o no se escribe. Es la misma lección
   * de `F7.2`, y aquí se aplica antes de que muerda.
   */
  /**
   * Pasa las cotas medidas sobre el modelo a la lámina, como acotado del plano. `F7.3`.
   *
   * **Es el flujo que una oficina hace de verdad**: se mide sobre el modelo —con el ajuste a vértice,
   * que es lo que hace que dos personas midan lo mismo—, se genera la planta, y las cotas van dentro.
   * La alternativa sería acotar otra vez encima del dibujo, que es medir dos veces la misma cosa y
   * arriesgarse a que los dos números no coincidan.
   *
   * **Los puntos se llevan a coordenadas del dibujo y se aplasta la Y.** Un dibujo es un plano en el
   * espacio: una cota tomada entre dos puntos a distinta altura se proyecta sobre él, igual que la
   * geometría. Eso significa que **la cota del plano puede ser más corta que la del modelo**, y es
   * correcto: en una planta, una diagonal que sube se dibuja acortada. Lo mide el propio dibujo.
   *
   * Solo se llevan las de **distancia entre dos puntos**: un área no es una cota y un ángulo tiene su
   * propio sistema. Devuelve cuántas se pusieron, que es lo que la interfaz puede decir.
   */
  addDimensions(id: string, mediciones: readonly MedicionParaAcotar[]): number {
    const plano = this.planos.get(id);
    if (plano === undefined) return 0;

    this.cotas ??= this.components.get(OBC.TechnicalDrawings).use(OBC.LinearAnnotations);

    // El desplazamiento de la línea de cota respecto al segmento medido: una fracción del plano, así
    // que en una planta de 40 m no se solapa con el dibujo y en un detalle de 2 m no se va lejos.
    const [ancho, alto] = plano.info.sizeM;
    const separacion = Math.max(0.3, Math.max(ancho, alto) * 0.04);

    let puestas = 0;
    for (const medicion of mediciones) {
      if (medicion.puntos.length < 2) continue;

      const a = aEspacioDelDibujo(medicion.puntos[0]!, plano.drawing);
      const b = aEspacioDelDibujo(medicion.puntos[1]!, plano.drawing);
      // Dos puntos que se proyectan al mismo sitio no son una cota: en una planta, una medición
      // vertical se aplasta a un punto. Se salta en vez de dibujar una cota de longitud cero.
      if (a.distanceTo(b) < 1e-4) continue;

      this.cotas.add(plano.drawing, { pointA: a, pointB: b, offset: separacion, style: "default" });
      puestas += 1;
    }
    return puestas;
  }

  /**
   * Pasa los ángulos medidos sobre el modelo a la lámina. `F7.3`.
   *
   * **Un ángulo medido tiene tres puntos y el del plano también**: los dos extremos y el vértice,
   * que es donde se cruzan las dos rectas. Así que la traducción es directa y no hay que inventar
   * nada — al contrario que la pendiente, que se deriva.
   *
   * El radio del arco sale del tamaño del plano: en una planta de 40 m un arco de 20 cm no se ve, y
   * en un detalle de 2 m uno de 2 m tapa el dibujo.
   */
  addAngles(id: string, mediciones: readonly MedicionParaAcotar[]): number {
    const plano = this.planos.get(id);
    if (plano === undefined) return 0;

    this.angulos ??= this.components.get(OBC.TechnicalDrawings).use(OBC.AngleAnnotations);

    const [ancho, alto] = plano.info.sizeM;
    const radio = Math.max(0.3, Math.max(ancho, alto) * 0.05);

    let puestos = 0;
    for (const medicion of mediciones) {
      // Tres puntos: la librería del visor los guarda en el orden en que se clicaron, y el vértice
      // es el del medio — es el punto que las dos rectas comparten.
      if (medicion.puntos.length < 3) continue;

      const a = aEspacioDelDibujo(medicion.puntos[0]!, plano.drawing);
      const vertice = aEspacioDelDibujo(medicion.puntos[1]!, plano.drawing);
      const b = aEspacioDelDibujo(medicion.puntos[2]!, plano.drawing);
      // Un ángulo cuyos tres puntos se proyectan a lo mismo no es un ángulo: pasa con un ángulo
      // medido en un plano vertical cuando la lámina es una planta.
      if (a.distanceTo(vertice) < 1e-4 || b.distanceTo(vertice) < 1e-4) continue;

      this.angulos.add(plano.drawing, {
        pointA: a,
        vertex: vertice,
        pointB: b,
        arcRadius: radio,
        style: "default",
      });
      puestos += 1;
    }
    return puestos;
  }

  /**
   * Deriva las pendientes de las cotas medidas y las pone en la lámina. `F7.3`.
   *
   * **La pendiente no se mide: ya está medida.** El visor no tiene una herramienta de pendiente, y
   * no hace falta — una cota entre dos puntos a distinta altura **lleva la pendiente dentro**: es la
   * diferencia de altura partida por el recorrido en horizontal. Añadir una herramienta para pedir
   * otra vez lo que ya se sabe sería preguntar dos veces lo mismo.
   *
   * Es además lo que se anota de verdad en una planta: la pendiente de un desagüe, de una rampa, de
   * una cubierta. Y va **cuesta abajo**, que es la convención: la flecha apunta a donde corre el
   * agua.
   *
   * Se salta lo que está a nivel —una cota horizontal no tiene pendiente que anotar— con un umbral
   * en milímetros y no en cero: dos puntos ajustados a vértices distintos de la misma losa difieren
   * en décimas de milímetro, y anotar «0,02 %» en un plano es ruido.
   */
  addSlopes(id: string, mediciones: readonly MedicionParaAcotar[]): number {
    const plano = this.planos.get(id);
    if (plano === undefined) return 0;

    this.pendientes ??= this.components.get(OBC.TechnicalDrawings).use(OBC.SlopeAnnotations);

    let puestas = 0;
    for (const medicion of mediciones) {
      if (medicion.puntos.length < 2) continue;

      const [ax, ay, az] = medicion.puntos[0]!;
      const [bx, by, bz] = medicion.puntos[1]!;
      const subida = by - ay;
      const recorrido = Math.hypot(bx - ax, bz - az);
      // Sin recorrido en horizontal no hay pendiente, hay un poste; y a nivel no hay nada que
      // anotar. Ver el docstring: el umbral va en milímetros, no en cero.
      if (recorrido < 1e-3 || Math.abs(subida) < DESNIVEL_MINIMO_M) continue;

      // Cuesta abajo: si el segundo punto está más bajo, la dirección es de A a B; si no, al revés.
      const bajaHaciaB = subida < 0;
      const desde = bajaHaciaB ? medicion.puntos[0]! : medicion.puntos[1]!;
      const hasta = bajaHaciaB ? medicion.puntos[1]! : medicion.puntos[0]!;

      const inicio = aEspacioDelDibujo(desde, plano.drawing);
      const fin = aEspacioDelDibujo(hasta, plano.drawing);
      const direccion = fin.clone().sub(inicio);
      direccion.y = 0;
      if (direccion.lengthSq() < 1e-8) continue;

      this.pendientes.add(plano.drawing, {
        position: inicio,
        direction: direccion.normalize(),
        slope: Math.abs(subida) / recorrido,
        style: "default",
      });
      puestas += 1;
    }
    return puestas;
  }

  /**
   * Pone una llamada por cada hallazgo, señalando **dónde cayó su elemento en el plano**. `F7.3`.
   *
   * **Es lo que conecta la lámina con la coordinación**, y es el punto de toda la Fase 7: un plano
   * que dice «aquí falta la cota del vano V-03» es un plano con el que se va a obra. Sin esto, el
   * plano y la lista de hallazgos son dos papeles que hay que cruzar a mano.
   *
   * La posición sale del **mapa de grupos de la proyección**: `EdgeProjector` devuelve, junto a la
   * geometría, a qué elemento pertenece cada grupo de vértices, y la geometría lleva un atributo
   * `group` por vértice. Así que la posición de un elemento en el plano es el centro de sus propios
   * vértices proyectados — no una estimación, sino dónde está dibujado de verdad.
   *
   * **Un hallazgo cuyo elemento no está en el plano no se dibuja**, y eso pasa a menudo: la planta
   * proyecta lo que estaba encendido, así que un hallazgo de la estructura no cabe en un plano de
   * arquitectura. Devuelve cuántas entraron para poder decirlo.
   */
  addCallouts(id: string, hallazgos: readonly HallazgoParaLlamada[]): number {
    const plano = this.planos.get(id);
    if (plano === undefined || plano.grupos === null) return 0;

    this.llamadas ??= this.components.get(OBC.TechnicalDrawings).use(OBC.CalloutAnnotations);

    const [ancho, alto] = plano.info.sizeM;
    const escala = Math.max(ancho, alto);
    // La caja de la llamada y su brazo, en proporción al plano: en una planta de 40 m una caja de
    // 30 cm no se lee, y en un detalle de 2 m una de 2 m tapa el dibujo.
    const medioAncho = Math.max(0.6, escala * 0.06);
    const medioAlto = Math.max(0.2, escala * 0.018);
    const brazo = Math.max(0.5, escala * 0.05);

    let puestas = 0;
    for (const hallazgo of hallazgos) {
      const donde = this.posicionEnElPlano(plano, hallazgo.localId);
      if (donde === null) continue;

      // El brazo sale en diagonal hacia arriba y a la derecha, y la caja se apoya al final: es la
      // colocación de un CAD, y evita que la llamada tape justo el elemento que señala.
      const codo = new THREE.Vector3(donde.x + brazo, 0, donde.z - brazo);
      const fin = new THREE.Vector3(codo.x + brazo, 0, codo.z);

      this.llamadas.add(plano.drawing, {
        center: new THREE.Vector3(fin.x + medioAncho, 0, fin.z),
        halfW: medioAncho,
        halfH: medioAlto,
        elbow: codo,
        extensionEnd: fin,
        text: hallazgo.titulo.slice(0, 60),
        style: "default",
      });
      puestas += 1;
    }
    return puestas;
  }

  /**
   * Dónde cayó un elemento en el plano, o `null` si no está dibujado.
   *
   * El centro de sus vértices proyectados: **dónde está dibujado de verdad**, no una estimación a
   * partir de su caja en el modelo —que en una planta daría un punto que puede no estar ni sobre el
   * dibujo—.
   */
  private posicionEnElPlano(plano: PlanoGenerado, localId: number): THREE.Vector3 | null {
    if (plano.grupos === null || plano.posiciones === null || plano.deGrupo === null) return null;

    let sumaX = 0;
    let sumaZ = 0;
    let cuantos = 0;
    for (let i = 0; i < plano.deGrupo.count; i += 1) {
      const grupo = plano.grupos[plano.deGrupo.getX(i)];
      if (grupo === undefined || grupo.localId !== localId) continue;
      sumaX += plano.posiciones.getX(i);
      sumaZ += plano.posiciones.getZ(i);
      cuantos += 1;
    }
    return cuantos === 0 ? null : new THREE.Vector3(sumaX / cuantos, 0, sumaZ / cuantos);
  }

  addTable(id: string, tabla: TablaDeCuadro): boolean {
    const plano = this.planos.get(id);
    if (plano === undefined) return false;

    this.cuadros ??= this.components.get(OBC.TechnicalDrawings).use(CuadrosEnPlano);
    // El exportador se registra con el sistema: sin él el DXF sale con la rejilla y sin texto.
    registrarExportador(this.components);

    const [anchoPlano, altoPlano] = plano.info.sizeM;
    // El alto de fila es una fracción del lado mayor, con un mínimo: en un plano de 40 m, filas de
    // 4 cm no se leen ni impresas ni en pantalla.
    const rowHeight = Math.max(0.25, Math.max(anchoPlano, altoPlano) * 0.02);
    const medidas = {
      x: plano.caja.min.x,
      // Debajo del dibujo, separada un par de filas: pegada al plano se lee como parte de él.
      z: plano.caja.max.z + rowHeight * 2,
      rowHeight,
      charWidth: rowHeight * 0.62,
    };

    this.cuadros.add(plano.drawing, { tabla, medidas });
    this.tablas.push({ tabla, medidas });

    // **Y el viewport crece para incluirla.** `top`/`bottom` van en coordenadas de papel —la Y del
    // papel es `−Z`, ver el comentario de `create`— así que la tabla, que cae por debajo del dibujo
    // en Z, baja el `bottom`.
    const trazo = trazarTabla(tabla, medidas);
    const margen = Math.max(0.5, Math.max(anchoPlano, altoPlano) * 0.03);
    plano.viewport.left = Math.min(plano.viewport.left, medidas.x - margen);
    plano.viewport.right = Math.max(plano.viewport.right, medidas.x + trazo.width + margen);
    plano.viewport.bottom = Math.min(plano.viewport.bottom, -(medidas.z + trazo.height) - margen);
    return true;
  }

  /**
   * Proyecta los elementos indicados y arma el plano.
   *
   * **Las aristas ocultas se generan pero no se dibujan de entrada.** En un plano de arquitectura
   * son la mitad del ruido y solo se quieren en algunos casos; se guardan en el dibujo apagadas y
   * se encienden con {@link setHiddenVisible}.
   */
  async create(
    world: OBC.World,
    modelIdMap: OBC.ModelIdMap,
    view: DrawingView,
    onProgress?: (mensaje: string, avance?: number) => void,
  ): Promise<GeneratedDrawing | null> {
    const empezado = performance.now();

    const projector = this.components.get(OBC.EdgeProjector);
    projector.projectionDirection.set(...DIRECCIONES[view]);

    // **El aviso de avance es también el latido.** Cada vez que la proyección informa se anota la
    // hora; si pasan `SIN_AVANCE_MS` sin un solo aviso, se da por colgada. Ver {@link SIN_AVANCE_MS}.
    let ultimoAvance = performance.now();
    const conLatido = (mensaje: string, avance?: number) => {
      ultimoAvance = performance.now();
      onProgress?.(mensaje, avance);
    };

    // El aviso se pasa siempre, aunque quien llame no quiera oírlo: hace falta para el latido.
    const proyeccion = await conCorte(
      projector.get(modelIdMap, world, { onProgress: conLatido }),
      () => performance.now() - ultimoAvance,
      `La proyección de aristas no respondió en ${SIN_AVANCE_MS / 1000} s y se dio por colgada. ` +
        `Suele ser que el navegador no está dibujando la escena: EdgeProjector lee la escena ` +
        `dibujada, así que en una pestaña oculta o sin aceleración no avanza.`,
    );

    const visibles = contarSegmentos(proyeccion.visible);
    if (visibles === 0) return null;

    const drawing = this.components.get(OBC.TechnicalDrawings).create(world);
    const id = `plano-generado-${this.siguiente++}`;

    // **Nace apagado en la vista 3D.** El dibujo se coloca en el plano de proyección, o sea encima
    // del modelo: encendido de entrada, lo que se ve es una maraña de líneas superpuestas a la
    // geometría y la escena parece rota. Se enciende desde su ficha, cuando se quiere mirar.
    drawing.three.visible = false;

    // **Las capas se crean antes de colgar nada** — `F7.2`. `addProjectionLines` avisa y cae a la
    // capa `0` si el nombre no existe, así que sin esto el DXF volvería a salir con todo junto.
    drawing.layers.create(CAPAS.visibles, {
      material: new THREE.LineBasicMaterial({ color: 0xe8e8ef }),
    });
    drawing.layers.create(CAPAS.ocultas, {
      // Discontinua y más apagada: en un plano las aristas ocultas se leen como referencia, no como
      // el trazo del dibujo. `LineDashedMaterial` es un `LineBasicMaterial`, así que la capa lo toma.
      material: new THREE.LineDashedMaterial({ color: 0x8fa2c8, dashSize: 0.2, gapSize: 0.1 }),
      visible: false,
    });

    // Y se cuelgan **por la API de capas** y no a mano: es ella la que asigna la capa del DXF y la
    // capa 1 de Three.js —la que dibujan las cámaras del plano—, que antes se ponía aquí a pulso.
    const lineas = new THREE.LineSegments(proyeccion.visible);
    lineas.name = CAPAS.visibles;
    drawing.addProjectionLines(lineas, CAPAS.visibles);

    const ocultas = new THREE.LineSegments(proyeccion.hidden);
    ocultas.name = CAPAS.ocultas;
    drawing.addProjectionLines(ocultas, CAPAS.ocultas);
    // El patrón de guiones necesita las distancias calculadas, y hay que hacerlo **después** de que
    // la capa le ponga su material: sin esto la línea discontinua se dibuja continua.
    ocultas.computeLineDistances();

    // El viewport encuadra lo dibujado: sin márgenes el plano sale pegado al borde del papel.
    const caja = new THREE.Box3().setFromBufferAttribute(
      proyeccion.visible.getAttribute("position") as THREE.BufferAttribute,
    );
    const margen = Math.max(0.5, Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) * 0.03);

    // **`top` y `bottom` son coordenadas de papel, no coordenadas Z**, y confundirlas costaba la
    // mitad del plano.
    //
    // La librería define la Y del papel como **−Z**: su `DrawingViewport.bbox` se construye como
    // `Z ∈ [-top, -bottom]` y su eje Y local está documentado como «world −Z». Pasando las Z tal
    // cual, como se hacía aquí, la caja de recorte quedaba **al otro lado del dibujo**: para un
    // plano con z de 0 a 6 aceptaba `z ≤ margen` y tiraba todo lo demás.
    //
    // Medido con `diag.html?modo=dxf` sobre un rectángulo de 10 × 6 m con diagonal: salían **4 de 5
    // segmentos**, el borde superior desaparecía entero y la diagonal se cortaba justo donde cruza
    // el borde de la caja. Con las coordenadas de papel salen los cinco.
    //
    // **Y no lo veía nadie**: la comprobación de `F7.4` miraba la extensión del DXF —que la marca el
    // recuadro del viewport, no el dibujo— y el número de trazos. La extensión cuadraba con el
    // plano recortado igual que con el entero. Ahora se comparan **las coordenadas**.
    const viewport = drawing.viewports.create({
      left: caja.min.x - margen,
      right: caja.max.x + margen,
      top: -caja.min.z + margen,
      bottom: -caja.max.z - margen,
    });

    const info: GeneratedDrawing = {
      id,
      name: NOMBRES[view],
      view,
      segments: visibles,
      hiddenSegments: contarSegmentos(proyeccion.hidden),
      sizeM: [caja.max.x - caja.min.x, caja.max.z - caja.min.z],
      elapsedMs: performance.now() - empezado,
    };

    // **El mapa de grupos se guarda ahora o se pierde**: lo devuelve la proyección y no hay forma
    // de reconstruirlo después. Es lo que permite señalar un hallazgo en el plano — `addCallouts`.
    this.planos.set(id, {
      info,
      drawing,
      viewport,
      caja,
      grupos: proyeccion.groups ?? null,
      posiciones: (proyeccion.visible.getAttribute("position") as THREE.BufferAttribute) ?? null,
      deGrupo: (proyeccion.visible.getAttribute("group") as THREE.BufferAttribute) ?? null,
    });
    return info;
  }

  /**
   * Enciende o apaga las aristas ocultas de un plano generado.
   *
   * **Va por la capa y no por el objeto** — `F7.2`: apagar el `LineSegments` a mano dejaba la capa
   * del dibujo diciendo que estaba visible, así que la interfaz y el DXF podían discrepar.
   */
  setHiddenVisible(id: string, visible: boolean): void {
    this.setLayerVisible(id, CAPAS.ocultas, visible);
  }

  /** Enciende o apaga una capa por su nombre. */
  setLayerVisible(id: string, layer: string, visible: boolean): void {
    const plano = this.planos.get(id);
    plano?.drawing.layers.setVisibility(layer, visible);
  }

  /**
   * Las capas de un plano generado, con cuántos segmentos hay en cada una.
   *
   * Es lo que permite que la ficha del plano diga **qué va a salir en el DXF** antes de exportarlo,
   * en vez de una casilla suelta de «aristas ocultas» que no dice dónde acaban.
   */
  layersOf(id: string): readonly DrawingLayerInfo[] {
    const plano = this.planos.get(id);
    if (plano === undefined) return [];

    const porCapa = new Map<string, number>();
    plano.drawing.three.traverse((objeto) => {
      const lineas = objeto as THREE.LineSegments;
      if (!lineas.isLineSegments) return;
      const capa = lineas.name;
      porCapa.set(capa, (porCapa.get(capa) ?? 0) + contarSegmentos(lineas.geometry));
    });

    const capas: DrawingLayerInfo[] = [];
    for (const [nombre, capa] of plano.drawing.layers) {
      // La capa `0` existe siempre en cualquier dibujo y aquí no se usa: enseñarla vacía en la
      // ficha solo invita a preguntar qué hay dentro.
      const segmentos = porCapa.get(nombre) ?? 0;
      if (segmentos === 0) continue;
      capas.push({ name: nombre, visible: capa.visible, segments: segmentos });
    }
    return capas;
  }

  /** Enciende o apaga el plano entero en la vista 3D. */
  setVisible(id: string, visible: boolean): void {
    const plano = this.planos.get(id);
    if (plano !== undefined) plano.drawing.three.visible = visible;
  }

  /** La caja que ocupa un plano generado, para poder encuadrarlo al encenderlo. */
  boxOf(id: string): THREE.Box3 | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const caja = new THREE.Box3().setFromObject(plano.drawing.three);
    return caja.isEmpty() ? null : caja;
  }

  /**
   * Serializa un plano a DXF.
   *
   * **Con papel, el DXF sale en milímetros y con el dibujo colocado en la hoja**; sin papel, en
   * unidades del mundo. Se ofrece con papel porque lo que se pide es un plano imprimible, y un DXF
   * en metros obliga a escalarlo a mano en el CAD.
   */
  exportDxf(
    id: string,
    paper?: { widthMm: number; heightMm: number; margin: number },
  ): string | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    return this.components
      .get(OBC.DxfManager)
      .exporter.export(
        [{ drawing: plano.drawing, viewports: [{ viewport: plano.viewport }] }],
        paper,
      );
  }

  /**
   * La lámina lista para que el servidor la dibuje en PDF. `F7.5`.
   *
   * **Lo que sale es lo mismo que se escribe en el DXF**, y por eso el PDF y el DXF dibujan el
   * mismo plano: los segmentos de las capas **encendidas** —el papel tiene que decir lo mismo que
   * la pantalla— y los textos de las tablas ya situados por `trazarTabla`.
   *
   * **Las cotas no salen aquí, y es una carencia que conviene decir.** Sus líneas y su número los
   * construye la librería dentro de sus propios grupos, y sacarlos de ahí sería leer sus entrañas y
   * romperse en su siguiente versión. En el DXF sí van, porque el exportador de la librería las
   * conoce. Para el PDF hace falta el mismo camino que las tablas: calcular su trazo nosotros.
   */
  sheet(id: string): { nombre: string; segmentos: number[][]; textos: unknown[][] } | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const apagadas = new Set(
      [...plano.drawing.layers].filter(([, capa]) => !capa.visible).map(([nombre]) => nombre),
    );

    const segmentos: number[][] = [];
    plano.drawing.three.traverse((objeto) => {
      const lineas = objeto as THREE.LineSegments;
      if (!lineas.isLineSegments || !lineas.visible) return;
      if (apagadas.has(lineas.name)) return;

      const posiciones = lineas.geometry.getAttribute("position");
      if (posiciones === undefined) return;
      // Se leen X y Z, que es el plano del dibujo: la misma pareja que escribe el exportador.
      for (let i = 0; i + 1 < posiciones.count; i += 2) {
        segmentos.push([
          posiciones.getX(i),
          posiciones.getZ(i),
          posiciones.getX(i + 1),
          posiciones.getZ(i + 1),
        ]);
      }
    });

    const textos: unknown[][] = [];
    for (const puesta of this.tablas) {
      const trazo = trazarTabla(puesta.tabla, puesta.medidas);
      for (const texto of trazo.texts) textos.push([texto.x, texto.z, texto.height, texto.text]);
    }

    return { nombre: plano.info.name, segmentos, textos };
  }

  /** Cierra un plano generado y libera su geometría. */
  remove(id: string): void {
    const plano = this.planos.get(id);
    if (plano === undefined) return;

    plano.drawing.three.traverse((objeto) => {
      const conGeometria = objeto as Partial<THREE.Mesh>;
      conGeometria.geometry?.dispose();
      const material = conGeometria.material;
      for (const uno of Array.isArray(material) ? material : material ? [material] : []) {
        uno.dispose();
      }
    });
    this.components.get(OBC.TechnicalDrawings).list.delete(plano.drawing.uuid);
    this.planos.delete(id);
  }

  /** Los planos generados, en el orden en que se hicieron. */
  get list(): readonly GeneratedDrawing[] {
    return [...this.planos.values()].map((plano) => plano.info);
  }
}

/** Lo que hace falta de una medición para poder acotarla en el plano. `F7.3`. */
export interface MedicionParaAcotar {
  /** Los puntos que se clicaron, en coordenadas de la escena. */
  readonly puntos: readonly (readonly [number, number, number])[];
}

/**
 * Un punto de la escena, en coordenadas del dibujo y aplastado sobre su plano.
 *
 * **La Y se pone a cero, que es lo que hace de esto una proyección.** El dibujo es un plano en el
 * espacio y su Y local es la normal: dejarla puesta colocaría la cota flotando delante o detrás del
 * papel, y el exportador —que lee X y Z— la escribiría en el sitio equivocado.
 */
function aEspacioDelDibujo(
  punto: readonly [number, number, number],
  drawing: OBC.TechnicalDrawing,
): THREE.Vector3 {
  const local = drawing.three.worldToLocal(new THREE.Vector3(punto[0], punto[1], punto[2]));
  local.y = 0;
  return local;
}

/** Cuántos segmentos tiene una geometría de líneas: dos vértices, un segmento. */
function contarSegmentos(geometria: THREE.BufferGeometry): number {
  const posiciones = geometria.getAttribute("position");
  return posiciones === undefined ? 0 : Math.floor(posiciones.count / 2);
}

/**
 * Espera una promesa pero **se rinde si deja de haber señales de vida**.
 *
 * `silencio()` devuelve cuántos milisegundos han pasado desde la última señal, así que quien llama
 * decide qué cuenta como una: aquí es el aviso de avance de la proyección. **No es un tope al
 * tiempo total** —lo que tarda puede tardar— sino a la falta de noticias.
 *
 * El vigilante se limpia en los dos caminos: sin eso, un `setInterval` cada segundo sobrevive a la
 * proyección y sigue corriendo hasta recargar la página.
 */
async function conCorte<T>(
  promesa: Promise<T>,
  silencio: () => number,
  mensaje: string,
): Promise<T> {
  let vigilante: ReturnType<typeof setInterval> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_resolver, rechazar) => {
        vigilante = setInterval(() => {
          if (silencio() > SIN_AVANCE_MS) rechazar(new Error(mensaje));
        }, 1000);
      }),
    ]);
  } finally {
    if (vigilante !== undefined) clearInterval(vigilante);
  }
}
