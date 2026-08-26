/**
 * El plano 2D dentro de la escena 3D: el DXF puesto bajo el modelo, a escala y en su sitio.
 *
 * **Qué problema resuelve.** Hoy, para saber si lo que dice el plano está modelado, hay que tener
 * el CAD y el visor abiertos al mismo tiempo y comparar a ojo. Con el plano dibujado en la misma
 * escena, la comparación es mirar: los muros del DXF caen sobre los muros del IFC, o no caen.
 *
 * **Por qué líneas y no una imagen.** Un plano rasterizado se ve bien de lejos y miente de cerca:
 * no se puede medir sobre él ni encender una capa. Con `LineSegments` el plano conserva sus capas
 * y su escala, y cuesta lo mismo que dibujar aristas.
 *
 * **La conversión de ejes es la del IFC.** El dibujo vive en XY con Z hacia arriba; la escena de
 * Fragments es Y arriba. Un punto `(x, y)` del plano cae en `(x, cota, -y)`, que es la misma
 * rotación que aplica el conversor al modelo. Si un plano apareciera reflejado —los hay, exportados
 * desde vistas espejadas—, {@link PlanTransform.mirrored} lo arregla; girarlo no puede.
 */

import {
  hatchAngles,
  hatchLines,
  parseDxf,
  segmentIntersection,
  suggestMetresPerUnit,
  type PlanPoint,
  type DxfDrawing,
  type DxfHatch,
  type DxfLayer,
  type DxfPolyline,
  type DxfText,
} from "@aerobim/bim-core";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { mantenerTamanoEnPantalla, materialDeMarcas, tocarMarcas } from "./etiquetas.js";

/**
 * Cómo se coloca el plano respecto al modelo.
 *
 * Son los cinco números que hacen falta para calzar un CAD con un IFC, y **ninguno se adivina
 * bien siempre**: por eso están todos a la vista y se pueden cambiar. La escala se propone
 * midiendo el dibujo (ver `suggestMetresPerUnit` en `bim-core`), y el resto arranca centrando el
 * plano en el modelo, que es el punto de partida más útil para empezar a ajustar.
 */
export interface PlanTransform {
  /** Cuántos metros mide una unidad del dibujo. */
  readonly metresPerUnit: number;
  /** A qué altura se dibuja, en metros de la escena. La planta del modelo, normalmente. */
  readonly elevationM: number;
  /** Desplazamiento en el eje X de la escena, en metros. */
  readonly offsetXM: number;
  /** Desplazamiento en el eje Z de la escena, en metros. */
  readonly offsetZM: number;
  /** Giro alrededor de la vertical, en grados. */
  readonly rotationDeg: number;
  /** `true` si el plano hay que reflejarlo. Un dibujo espejado no se arregla girándolo. */
  readonly mirrored: boolean;
}

/** Un plano cargado, con lo que la interfaz necesita para mostrarlo y ajustarlo. */
export interface LoadedPlan {
  readonly id: string;
  readonly name: string;
  readonly layers: readonly DxfLayer[];
  readonly transform: PlanTransform;
  /** Qué unidad se eligió y por qué. Se muestra tal cual: es una decisión discutible. */
  readonly units: {
    readonly metresPerUnit: number;
    readonly unitName: string;
    readonly reason: string;
    readonly declared: boolean;
  };
  /** Entidades del DXF que no se dibujan, por tipo: textos, rellenos, cotas del CAD. */
  readonly skipped: Readonly<Record<string, number>>;
  /** Cuánto mide el plano ya escalado, en metros, con la unidad propuesta. */
  readonly sizeM: readonly [number, number];
  /**
   * Cuánto mide en **unidades del dibujo**, sin convertir.
   *
   * Es lo que permite a la interfaz decir cuánto mediría con cada unidad **sin volver a leer el
   * archivo**: multiplicar y mostrar. Sin este dato, cambiar la unidad es un salto a ciegas, que es
   * justo donde el plano se iba de la pantalla sin explicación.
   */
  readonly sizeUnits: readonly [number, number];
  readonly vertexCount: number;
  /** Cuántos rótulos se dibujaron. */
  readonly labelCount: number;
  /** Cuántos textos trae el archivo, dibujados o no. */
  readonly textCount: number;
  /** El alto con el que se dibujaron, en metros. `0` si se arrancó sin ellos. */
  readonly labelHeightM: number;
  /** El alto que le corresponde a este plano por su tamaño, para poder ofrecerlo. */
  readonly suggestedLabelHeightM: number;
}

/**
 * En qué orden se dibujan las piezas del plano.
 *
 * **En el CAD el macizo va debajo y el trazo encima.** Todo el plano es coplanar y se dibuja sin
 * escribir profundidad, así que quien manda es este orden y no la geometría: sin él, un relleno
 * tapaba el contorno del propio muro que estaba rellenando.
 */
const ORDEN = { macizos: 0, trazos: 1, rotulos: 2 } as const;

/**
 * Cuánto mide en pantalla, en píxeles, un grosor de trazo en milímetros de papel.
 *
 * **Va en píxeles y no en metros de escena, y es a propósito**: es lo que hace un CAD. El grosor de
 * un trazo es una propiedad de la lámina, no del edificio, así que un muro de 0,30 mm se ve igual de
 * gordo mirando la planta entera que mirando un recinto. Si escalara con el zoom, de cerca sería una
 * mancha y de lejos no existiría.
 *
 * **La rampa se mide desde el grosor por defecto del propio archivo, no desde cero.** El primer
 * intento fue absoluto —un píxel más tres y medio por milímetro— y borraba justo lo que venía a
 * mostrar: los 0,25 mm del `$LWDEFAULT` daban 1,875 px y los 0,30 mm del muro daban 2,05, los dos
 * redondeaban a 2 y el muro volvía a pesar lo mismo que la cota. Y de paso todos los trazos pagaban
 * la malla gruesa sin ganar nada.
 *
 * Con la rampa relativa, **lo que el archivo considera normal es el trazo de un píxel** y solo lo
 * que declara más gordo se dibuja más gordo, que es exactamente la jerarquía que se quería leer. El
 * techo son ocho píxeles: por encima, un plano se convierte en manchas.
 */
const ANCHO_PX = { base: 1, porMmExtra: 12, maximo: 8 } as const;

function anchoEnPixeles(lineweightMm: number, porDefectoMm: number): number {
  const extra = Math.max(0, lineweightMm - porDefectoMm);
  // Se redondea a una décima de píxel para que dos grosores casi iguales compartan malla en vez de
  // abrir una por cada milésima declarada.
  const px = Math.round((ANCHO_PX.base + extra * ANCHO_PX.porMmExtra) * 10) / 10;
  return Math.min(ANCHO_PX.maximo, px);
}

/**
 * A partir de qué ancho conviene pagar la línea gruesa de verdad.
 *
 * Por debajo, `LineBasicMaterial` ya dibuja un píxel y es una malla y una pasada; por encima hace
 * falta `LineSegments2`, que convierte cada segmento en un cuadrilátero instanciado. Ver
 * {@link trazosDe} para por qué eso obliga a dibujar dos objetos.
 */
const ANCHO_QUE_MERECE_MALLA = 1.1;

/** Un grupo de trazos que comparten color, opacidad, patrón y grosor: se dibujan de una pasada. */
interface EstiloDeTrazo {
  readonly color: number;
  readonly opacity: number;
  readonly dash: readonly [number, number] | null;
  readonly anchoPx: number;
  readonly puntos: number[];
}

/**
 * El material de una cara del plano —un macizo, una banda—, con la opacidad que declara el CAD.
 *
 * **Antes iba al 35 % y al 40 % por decisión propia, y el CAD es opaco.** Un plano con los macizos
 * translúcidos se ve lavado y los colores dejan de ser los del CAD, que era la queja. La opacidad
 * ahora viene del código 440 del archivo, y solo se paga mezcla cuando el archivo la pide.
 *
 * Sigue sin escribir profundidad: el plano vive debajo del modelo y no debe pelearse con la losa.
 */
function materialDeCara(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Entre qué medidas, en metros de la escena, una raya se ve como raya y no como otra cosa. */
const RAYA_M = { minima: 0.04, maxima: 3, objetivo: 0.15 } as const;

/**
 * Ajusta el patrón de trazo para que se vea, sin dejar de ser discontinuo.
 *
 * **El tamaño del patrón de un DXF casi nunca sirve tal cual.** Los tipos de línea se definen en
 * unidades de papel y se escalan con `LTSCALE`, un número que en cada oficina vale otra cosa: en el
 * plano real del usuario salen rayas de dos milésimas de milímetro, que no se dibujan —la línea
 * queda parpadeando o desaparece— y también las hay de decenas de metros, que se ven llenas.
 *
 * Se conserva **la proporción entre raya y espacio**, que es lo que distingue un trazo y punto de
 * un trazo largo, y se lleva la raya a una medida legible en la escena. Es lo mismo que hace a mano
 * cualquiera que trae un plano a un modelo: tocar `LTSCALE` hasta que se vea.
 */
function patronLegible(
  dash: readonly [number, number],
  metrosPorUnidad: number,
): readonly [number, number] | null {
  const rayaM = dash[0] * metrosPorUnidad;
  const espacioM = dash[1] * metrosPorUnidad;
  if (!Number.isFinite(rayaM) || !Number.isFinite(espacioM) || espacioM <= 0) return null;

  if (rayaM >= RAYA_M.minima && rayaM <= RAYA_M.maxima) return dash;

  const factor = RAYA_M.objetivo / Math.max(rayaM, 1e-9);
  return [dash[0] * factor, dash[1] * factor];
}

/**
 * Cuántos rótulos se dibujan como mucho.
 *
 * Cada uno lleva su propia textura, y un plano de instalaciones puede traer decenas de miles: sin
 * tope, abrirlo se lleva la memoria de la pestaña. Con este, los planos de obra corrientes —unos
 * cientos de textos— entran enteros.
 */
const LIMITE_ETIQUETAS = 3000;

/**
 * Cuánto mide una letra de rótulo, **en proporción al tamaño del plano**.
 *
 * **El alto del archivo no sirve para decidirlo.** Los planos anotativos escriben la altura de
 * papel —en el plano real del usuario, un centímetro de modelo— y esos rótulos no se ven; otros
 * escriben altura de modelo y tapan el dibujo entero. Tampoco sirve una medida fija: quince
 * centímetros son razonables en una planta de cincuenta metros y enormes en el detalle de un baño.
 *
 * Se toma una fracción del lado mayor del dibujo, acotada por arriba y por abajo. El resultado se
 * puede cambiar desde la interfaz, que es donde esta decisión termina de tomarse.
 */
const ETIQUETA = { fraccion: 0.004, minimaM: 0.06, maximaM: 0.3 } as const;

/**
 * A partir de cuántos rótulos el plano se dibuja **sin ellos**.
 *
 * Un plano de oficinas trae cientos: dibujados todos a la vez sobre una planta completa no se lee
 * ninguno y tapan el dibujo, que es justo lo que se venía a mirar. Se cargan igual y el selector de
 * la ficha los enciende cuando hacen falta.
 */
const ETIQUETAS_DEMASIADAS = 150;

/** El lado del atlas de rótulos, en píxeles. Uno por capa, no uno por texto. */
const ATLAS_PX = 2048;

/**
 * Cuánto mide una letra de rótulo **en la pantalla**, en píxeles.
 *
 * Es lo que hace que se lea. Con el texto dibujado a su tamaño de plano, una etiqueta de veinte
 * centímetros en una planta de veinte metros ocupa diez píxeles: existe y no se lee. Manteniéndola
 * en dieciséis se lee igual mirando la planta entera que mirando un recinto, que es lo que hace la
 * anotación de un CAD.
 */
const ALTO_ETIQUETA_PX = 16;

/**
 * Cuántos trazos se miran como mucho al buscar cruces bajo el cursor.
 *
 * Los cruces se calculan de dos en dos, así que el coste crece con el cuadrado: con un tope bajo,
 * un clic sobre una zona densa —una trama de rayado, un mobiliario— sigue costando lo que un clic.
 */
const LIMITE_CRUCES = 60;

/** Lo que se guarda de cada plano dibujado. */
interface PlanoDibujado {
  readonly id: string;
  readonly name: string;
  readonly grupo: THREE.Group;
  /** Un grupo por capa, para poder apagarlas una por una. */
  readonly capas: Map<string, THREE.Group>;
  /**
   * El dibujo leído, tal cual.
   *
   * Se conserva para poder **rehacer los rótulos** cuando cambia su tamaño: van horneados en una
   * malla con sus posiciones absolutas, así que no se pueden escalar sin sacarlos de su sitio.
   * Ocupa unos megas de memoria normal —no de vídeo— y ahorra volver a leer el archivo.
   */
  readonly dibujo: DxfDrawing;
  /** El centro del dibujo, alrededor del cual gira el plano. */
  readonly centro: readonly [number, number];
  /** Alto de los rótulos en metros; `0` los apaga. */
  labelHeightM: number;
  transform: PlanTransform;
}

/**
 * Los planos dibujados en una escena.
 *
 * Vive aparte del visor porque no tiene nada que ver con IFC: entra texto DXF y sale geometría de
 * líneas. Que se pueda probar y cambiar sin tocar el visor es el punto.
 */
export class PlanOverlay {
  private readonly planos = new Map<string, PlanoDibujado>();
  private siguiente = 1;

  constructor(private readonly escena: THREE.Object3D) {}

  /**
   * Dibuja un DXF y lo deja en la escena.
   *
   * `centro` es dónde plantarlo —el centro del modelo en planta y la cota de su base—, y es solo
   * un punto de partida: el ajuste fino lo hace {@link setTransform}.
   */
  add(
    text: string,
    name: string,
    centro: { readonly xM: number; readonly zM: number; readonly elevationM: number },
  ): LoadedPlan {
    const dibujo = parseDxf(text);
    const unidades = suggestMetresPerUnit(dibujo);

    const id = `plano-${this.siguiente++}`;
    const grupo = new THREE.Group();
    grupo.name = `plano:${name}`;
    // Un plano no proyecta ni recibe sombra: es una referencia dibujada, no un cuerpo.
    grupo.castShadow = false;
    grupo.receiveShadow = false;

    const capas = new Map<string, THREE.Group>();
    const centrado = centroDe(dibujo);
    let etiquetasPuestas = 0;

    // El alto de los rótulos sale del tamaño del propio plano, y **con muchos se arranca sin
    // ellos**: cientos de textos sobre una planta completa no se leen y tapan el dibujo.
    const ladoM =
      dibujo.bounds === null
        ? 0
        : Math.max(
            dibujo.bounds.maxX - dibujo.bounds.minX,
            dibujo.bounds.maxY - dibujo.bounds.minY,
          ) * unidades.metresPerUnit;
    const altoSugerido = Math.min(
      ETIQUETA.maximaM,
      Math.max(ETIQUETA.minimaM, ladoM * ETIQUETA.fraccion),
    );
    const altoEtiqueta = dibujo.texts.length > ETIQUETAS_DEMASIADAS ? 0 : altoSugerido;

    for (const capa of dibujo.layers) {
      const grupoCapa = new THREE.Group();
      grupoCapa.name = `capa:${capa.name}`;

      // **Un dibujo por color y por trazo, no uno por capa.** El color puede venir de la entidad y
      // no de su capa, y en un plano de remodelación eso *es* la información: lo nuevo y lo que se
      // demuele conviven en la misma capa con colores distintos. Con el trazo pasa igual: la línea
      // discontinua distingue un eje o lo que se bota de un muro que se queda.
      const porEstilo = new Map<string, EstiloDeTrazo>();
      // Las polilíneas **con ancho** no son líneas gruesas: son macizos, y van a su propia malla.
      const bandas = new Map<string, { color: number; opacity: number; posiciones: number[] }>();

      for (const linea of dibujo.polylines) {
        if (linea.layer !== capa.name) continue;

        // **El color ya viene resuelto del dominio**, con su procedencia: la entidad, su capa, el
        // bloque que la inserta o el por defecto. Antes se resolvía aquí con un `?? capa.colorIndex`
        // que no sabía nada de bloques, y por eso el contenido de los bloques salía casi blanco.
        const { rgb: color, opacity } = linea.color;

        if (linea.width !== null && linea.width > 0) {
          const clave = `${color}|${opacity}`;
          const destino = bandas.get(clave) ?? { color, opacity, posiciones: [] };
          empujarBanda(linea, centrado, linea.width, destino.posiciones);
          bandas.set(clave, destino);
        }

        // El eje se dibuja igual, en fino: es lo que se engancha al medir y lo que marca el borde
        // donde dos macizos se tocan.
        const dash = linea.dash;
        const anchoPx = anchoEnPixeles(linea.lineweightMm, dibujo.defaultLineweightMm);
        const clave = `${color}|${opacity}|${dash === null ? "llena" : `${dash[0]}:${dash[1]}`}|${anchoPx}`;
        const grupo = porEstilo.get(clave) ?? { color, opacity, dash, anchoPx, puntos: [] };
        empujarSegmentos(linea, centrado, grupo.puntos);
        porEstilo.set(clave, grupo);
      }

      for (const { color, opacity, posiciones } of bandas.values()) {
        if (posiciones.length === 0) continue;

        const geometria = new THREE.BufferGeometry();
        geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
        const malla = new THREE.Mesh(geometria, materialDeCara(color, opacity));
        malla.userData = { tipo: "banda", capa: capa.name };
        malla.renderOrder = ORDEN.macizos;
        malla.frustumCulled = false;
        grupoCapa.add(malla);
      }

      for (const estilo of porEstilo.values()) {
        for (const objeto of trazosDe(estilo, unidades.metresPerUnit)) grupoCapa.add(objeto);
      }

      for (const relleno of dibujo.hatches) {
        if (relleno.layer !== capa.name) continue;

        const malla = mallaDeRelleno(relleno, centrado, unidades.metresPerUnit);
        if (malla !== null) grupoCapa.add(malla);
      }

      etiquetasPuestas += ponerRotulos(
        grupoCapa,
        dibujo,
        capa,
        centrado,
        unidades.metresPerUnit,
        altoEtiqueta,
        LIMITE_ETIQUETAS - etiquetasPuestas,
      );

      if (grupoCapa.children.length === 0) continue;
      // **Una capa apagada en el CAD arranca apagada.** Se dibuja igual —la geometría está ahí y se
      // puede encender— pero de entrada el plano se ve como en AutoCAD, que es la referencia. En el
      // plano real es `0-AREA UTIL`, que el visor pintaba violeta encima del dibujo.
      grupoCapa.visible = !capa.off;
      capas.set(capa.name, grupoCapa);
      grupo.add(grupoCapa);
    }

    const transform: PlanTransform = {
      metresPerUnit: unidades.metresPerUnit,
      elevationM: centro.elevationM,
      offsetXM: centro.xM,
      offsetZM: centro.zM,
      rotationDeg: 0,
      mirrored: false,
    };

    const plano: PlanoDibujado = {
      id,
      name,
      grupo,
      capas,
      dibujo,
      centro: centrado,
      labelHeightM: altoEtiqueta,
      transform,
    };
    aplicar(plano);
    this.escena.add(grupo);
    this.planos.set(id, plano);

    const ancho = dibujo.bounds === null ? 0 : dibujo.bounds.maxX - dibujo.bounds.minX;
    const alto = dibujo.bounds === null ? 0 : dibujo.bounds.maxY - dibujo.bounds.minY;

    return {
      id,
      name,
      layers: dibujo.layers,
      transform,
      units: unidades,
      skipped: dibujo.skipped,
      sizeM: [ancho * unidades.metresPerUnit, alto * unidades.metresPerUnit],
      sizeUnits: [ancho, alto],
      vertexCount: dibujo.polylines.reduce((n, p) => n + p.points.length / 2, 0),
      labelCount: etiquetasPuestas,
      labelHeightM: altoEtiqueta,
      suggestedLabelHeightM: altoSugerido,
      textCount: dibujo.texts.length,
    };
  }

  /** Cambia la colocación del plano. Devuelve la que quedó, o `null` si el plano ya no está. */
  setTransform(id: string, cambios: Partial<PlanTransform>): PlanTransform | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    plano.transform = { ...plano.transform, ...cambios };
    aplicar(plano);
    return plano.transform;
  }

  /**
   * Cambia el alto de los rótulos del plano, en metros. Con `0` se apagan.
   *
   * **Se rehacen, no se escalan.** Los rótulos van horneados en una malla con sus posiciones
   * absolutas —es lo que permite dibujarlos todos de una pasada—, así que escalarlos los sacaría de
   * su sitio. Rehacer el atlas de una capa cuesta unos milisegundos.
   */
  setLabelHeight(id: string, metros: number): number | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    plano.labelHeightM = Math.max(0, metros);

    let puestos = 0;
    for (const [nombre, grupoCapa] of plano.capas) {
      for (const viejo of grupoCapa.children.filter((hijo) => hijo.name === "rotulos")) {
        grupoCapa.remove(viejo);
        liberar(viejo);
      }
      if (plano.labelHeightM === 0) continue;

      const capa = plano.dibujo.layers.find((una) => una.name === nombre);
      if (capa === undefined) continue;

      puestos += ponerRotulos(
        grupoCapa,
        plano.dibujo,
        capa,
        plano.centro,
        plano.transform.metresPerUnit,
        plano.labelHeightM,
        LIMITE_ETIQUETAS - puestos,
      );
    }
    return puestos;
  }

  /** Enciende o apaga una capa del plano. */
  setLayerVisible(id: string, layer: string, visible: boolean): void {
    const linea = this.planos.get(id)?.capas.get(layer);
    if (linea !== undefined) linea.visible = visible;
  }

  /** Enciende o apaga el plano entero. */
  setVisible(id: string, visible: boolean): void {
    const plano = this.planos.get(id);
    if (plano !== undefined) plano.grupo.visible = visible;
  }

  /** Quita el plano de la escena y libera su geometría. */
  remove(id: string): void {
    const plano = this.planos.get(id);
    if (plano === undefined) return;

    this.escena.remove(plano.grupo);
    // Geometrías, materiales **y texturas**: cada rótulo trae la suya, y son lo que de verdad pesa
    // en memoria de vídeo. Un plano cerrado que deja sus texturas colgadas se nota al tercero.
    plano.grupo.traverse((objeto) => {
      const conGeometria = objeto as Partial<THREE.Mesh>;
      conGeometria.geometry?.dispose();

      const material = conGeometria.material;
      for (const uno of Array.isArray(material) ? material : material ? [material] : []) {
        const mapa = (uno as THREE.MeshBasicMaterial).map;
        mapa?.dispose();
        uno.dispose();
      }
    });
    this.planos.delete(id);
  }

  /**
   * La caja que ocupa un plano ya colocado, **contando solo lo encendido**.
   *
   * Que lo apagado no cuente es lo que convierte las capas en una herramienta de encuadre: un DXF
   * suele traer el marco de la lámina y las viñetas en una capa aparte —en el plano real del
   * usuario, esa capa mide 480 m frente a los 20 m del edificio—, y con ella encendida encuadrar
   * deja la planta como un sello en una esquina. Apagarla y encuadrar lleva al edificio.
   */
  boxOf(id: string): THREE.Box3 | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const caja = new THREE.Box3();
    for (const grupoCapa of plano.capas.values()) {
      if (!grupoCapa.visible) continue;

      for (const objeto of grupoCapa.children) {
        if (objeto.visible) caja.expandByObject(objeto);
      }
    }
    return caja.isEmpty() ? null : caja;
  }

  /**
   * Calza el plano sobre el modelo con **dos pares de puntos**.
   *
   * Es el gesto que sustituye a escribir números: se señala un punto del plano y el punto del
   * modelo que le corresponde, y otro par más. Con eso salen las tres cosas que hacen falta —el
   * **giro**, la **escala** y el **desplazamiento**— y el plano cae en su sitio.
   *
   * **Por qué dos pares y no uno.** Con un par solo se puede mover el plano, no orientarlo: la
   * dirección entre dos puntos es lo que dice cuánto hay que girar, y su largo, cuánto hay que
   * escalar. Un par basta cuando el plano ya está orientado, y para eso está el ajuste numérico.
   *
   * La escala se aplica solo si se pide: en un plano cuya unidad ya es correcta, corregirla por dos
   * clics imprecisos empeora lo que estaba bien. Cuando se aplica, la unidad deja de ser una de las
   * de la lista y pasa a ser la medida que hizo calzar los dos puntos, que es un dato legítimo y la
   * interfaz lo dice.
   */
  align(
    id: string,
    puntos: {
      readonly planoA: readonly [number, number, number];
      readonly modeloA: readonly [number, number, number];
      readonly planoB: readonly [number, number, number];
      readonly modeloB: readonly [number, number, number];
    },
    ajustarEscala: boolean,
  ): PlanTransform | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const pA = new THREE.Vector3(...puntos.planoA);
    const pB = new THREE.Vector3(...puntos.planoB);
    const qA = new THREE.Vector3(...puntos.modeloA);
    const qB = new THREE.Vector3(...puntos.modeloB);

    // Todo se resuelve **en planta**: un plano es horizontal y la altura la fija el punto del
    // modelo. Mezclar la componente vertical en el giro daría una rotación que el plano no puede
    // tener.
    // Un punto que no es un punto no calza nada, y aplicado dejaría la colocación en `NaN`: el
    // plano desaparecería sin decir por qué y no habría forma de volver.
    for (const punto of [pA, pB, qA, qB]) {
      if (!Number.isFinite(punto.x) || !Number.isFinite(punto.y) || !Number.isFinite(punto.z)) {
        return null;
      }
    }

    const enPlano = new THREE.Vector2(pB.x - pA.x, pB.z - pA.z);
    const enModelo = new THREE.Vector2(qB.x - qA.x, qB.z - qA.z);
    if (enPlano.length() < 1e-6 || enModelo.length() < 1e-6) return null;

    const giro = enModelo.angle() - enPlano.angle();
    const factor = ajustarEscala ? enModelo.length() / enPlano.length() : 1;

    // Dónde queda el primer punto del plano después de girar y escalar alrededor del origen del
    // grupo: de ahí sale el desplazamiento que lo lleva exactamente sobre el del modelo.
    const desdeOrigen = pA.clone().sub(plano.grupo.position).multiplyScalar(factor);
    // El giro de la escena es alrededor de Y y el ángulo se mide en el plano XZ, donde el sentido
    // es el contrario: por eso entra negado.
    desdeOrigen.applyAxisAngle(new THREE.Vector3(0, 1, 0), -giro);

    const destino = qA.clone().sub(desdeOrigen);
    const grados = (-giro * 180) / Math.PI;

    plano.transform = {
      ...plano.transform,
      metresPerUnit: plano.transform.metresPerUnit * factor,
      rotationDeg: plano.transform.rotationDeg + grados,
      offsetXM: destino.x,
      offsetZM: destino.z,
      elevationM: destino.y,
    };
    aplicar(plano);
    return plano.transform;
  }

  /**
   * Los cruces de trazos que hay cerca de un punto, en coordenadas de la escena.
   *
   * **La intersección es la referencia que más se usa revisando un plano**: la esquina de dos
   * muros, el cruce de dos ejes, el encuentro de un tabique con una fachada. Casi nunca hay un
   * vértice ahí —cada trazo sigue de largo— así que sin calcularla no hay a qué engancharse.
   *
   * Se buscan solo los trazos que pasan cerca y se cruzan entre sí de dos en dos. Con un radio de
   * unos centímetros son un puñado de segmentos, y el coste es de un clic, no de cada fotograma.
   */
  intersectionsNear(id: string, punto: THREE.Vector3, radioM: number): readonly THREE.Vector3[] {
    const plano = this.planos.get(id);
    if (plano === undefined) return [];

    const escala = plano.transform.metresPerUnit || 1;
    const radio = radioM / escala;
    const local = plano.grupo.worldToLocal(punto.clone());

    const cercanos: { ax: number; az: number; bx: number; bz: number }[] = [];
    for (const grupoCapa of plano.capas.values()) {
      if (!grupoCapa.visible) continue;

      for (const objeto of grupoCapa.children) {
        if (!objeto.visible || !(objeto instanceof THREE.LineSegments)) continue;

        const posiciones = objeto.geometry.getAttribute("position");
        for (let i = 0; i + 1 < posiciones.count; i += 2) {
          const ax = posiciones.getX(i);
          const az = posiciones.getZ(i);
          const bx = posiciones.getX(i + 1);
          const bz = posiciones.getZ(i + 1);

          // Descarte barato por caja: el segmento tiene que rozar el entorno del cursor.
          if (Math.min(ax, bx) - radio > local.x || Math.max(ax, bx) + radio < local.x) continue;
          if (Math.min(az, bz) - radio > local.z || Math.max(az, bz) + radio < local.z) continue;

          cercanos.push({ ax, az, bx, bz });
          if (cercanos.length >= LIMITE_CRUCES) break;
        }
      }
    }

    const cruces: THREE.Vector3[] = [];
    for (let i = 0; i < cercanos.length; i++) {
      for (let j = i + 1; j < cercanos.length; j++) {
        const uno = cercanos[i]!;
        const otro = cercanos[j]!;
        const cruce = segmentIntersection(
          [uno.ax, uno.az],
          [uno.bx, uno.bz],
          [otro.ax, otro.az],
          [otro.bx, otro.bz],
        );
        if (cruce === null) continue;
        if (Math.hypot(cruce[0] - local.x, cruce[1] - local.z) > radio) continue;

        cruces.push(plano.grupo.localToWorld(new THREE.Vector3(cruce[0], 0, cruce[1])));
      }
    }
    return cruces;
  }

  /** La caja de todos los planos juntos, contando solo lo encendido. Ver {@link boxOf}. */
  boxAll(): THREE.Box3 | null {
    const union = new THREE.Box3();
    for (const [id, plano] of this.planos) {
      if (!plano.grupo.visible) continue;

      const caja = this.boxOf(id);
      if (caja !== null) union.union(caja);
    }
    return union.isEmpty() ? null : union;
  }

  /**
   * Qué elemento 2D hay bajo el rayo.
   *
   * **El umbral crece con la distancia a la cámara**, y sin eso el plano es imposible de clicar:
   * una línea no tiene grosor, así que a diez metros de distancia el rayo tiene que pasar
   * exactamente por ella. Con el umbral proporcional, apuntar a un muro del plano cuesta lo mismo
   * de cerca que de lejos, que es lo que hace un CAD.
   */
  pick(rayo: THREE.Raycaster, camara: THREE.Camera): PlanHit | null {
    // **La comparación no puede ser por distancia a la cámara**: todo el plano es coplanar, así que
    // un trazo y el rótulo que tiene encima están a la misma distancia. Se compara por **cuán lejos
    // pasó el rayo**: una cara solo acierta si el rayo la atraviesa —error cero— y una línea acierta
    // dentro de su margen. Sin esto ganaba siempre la línea, porque su margen es de centímetros, y
    // los rótulos y los rellenos no había forma de clicarlos.
    let mejor: { hit: PlanHit; distancia: number; error: number } | null = null;

    for (const plano of this.planos.values()) {
      if (!plano.grupo.visible) continue;

      for (const [nombreCapa, grupoCapa] of plano.capas) {
        if (!grupoCapa.visible) continue;

        for (const objeto of grupoCapa.children) {
          // Lo apagado no se puede clicar: apagar una capa y que siga enganchando sería mentir
          // sobre lo que se está mirando.
          if (!objeto.visible) continue;

          const esLinea = objeto instanceof THREE.LineSegments;
          const esMalla = objeto instanceof THREE.Mesh;
          if (!esLinea && !esMalla) continue;

          const escalaMundo = plano.transform.metresPerUnit;
          const distanciaCamara = camara.position.distanceTo(plano.grupo.position);
          rayo.params.Line = { threshold: Math.max(0.05, distanciaCamara * 0.004) / escalaMundo };

          const impactos = rayo.intersectObject(objeto, false);
          const impacto = impactos[0];
          if (impacto === undefined) continue;

          // **El error se mide, no se pregunta.** `distanceToRay` no está en todas las versiones y
          // viene en unidades locales; la distancia del rayo al punto devuelto dice lo mismo, en
          // metros y siempre: cero cuando el rayo atraviesa una cara, y lo que se desvió cuando
          // enganchó una línea por su margen.
          const error = rayo.ray.distanceToPoint(impacto.point);
          const gana =
            mejor === null ||
            error < mejor.error - 1e-6 ||
            (Math.abs(error - mejor.error) <= 1e-6 && impacto.distance < mejor.distancia);
          if (!gana) continue;

          // **Un relleno o un rótulo también son elementos del plano.** Antes solo se podían clicar
          // las líneas, y en un plano con los muros macizos eso deja fuera justo lo que se ve.
          if (esMalla) {
            const datos = objeto.userData as { tipo?: string };
            mejor = {
              distancia: impacto.distance,
              error,
              hit: {
                planId: plano.id,
                planName: plano.name,
                layer: nombreCapa,
                kind: datos.tipo === "rotulos" ? "text" : "fill",
                text: datos.tipo === "rotulos" ? rotuloEn(objeto, impacto.point) : null,
                point: [impacto.point.x, impacto.point.y, impacto.point.z],
                segmentStartM: null,
                segmentEndM: null,
                segmentLengthM: null,
              },
            };
            continue;
          }

          // El índice del vértice dice qué segmento se tocó: con él salen sus dos extremos, que
          // son el largo del trazo y —lo que más importa para revisar— los puntos a los que se
          // engancha una medición.
          const tramo = extremosDelSegmento(objeto, impacto.index ?? null);

          mejor = {
            distancia: impacto.distance,
            error,
            hit: {
              planId: plano.id,
              planName: plano.name,
              layer: nombreCapa,
              kind: "line",
              text: null,
              point: [impacto.point.x, impacto.point.y, impacto.point.z],
              segmentStartM: tramo === null ? null : tramo.a,
              segmentEndM: tramo === null ? null : tramo.b,
              segmentLengthM: tramo === null ? null : tramo.largoM,
            },
          };
        }
      }
    }
    return mejor?.hit ?? null;
  }

  /** Cuántos planos hay dibujados. */
  get count(): number {
    return this.planos.size;
  }
}

/** Lo que devuelve un clic sobre un plano. */
export interface PlanHit {
  readonly planId: string;
  readonly planName: string;
  readonly layer: string;
  /** Qué se tocó: un trazo, un relleno o un rótulo. */
  readonly kind: "line" | "fill" | "text";
  /** Lo que dice el rótulo, cuando se tocó uno. */
  readonly text: string | null;
  /** Dónde cayó el clic, en coordenadas de la escena. */
  readonly point: readonly [number, number, number];
  /** Los dos extremos del tramo tocado, en metros de la escena. Son los puntos de ajuste. */
  readonly segmentStartM: readonly [number, number, number] | null;
  readonly segmentEndM: readonly [number, number, number] | null;
  /** El largo del tramo tocado, en metros. `null` si no se pudo determinar. */
  readonly segmentLengthM: number | null;
}

/**
 * Los extremos del segmento tocado, **en coordenadas de la escena**.
 *
 * Se devuelven en mundo y no en las del dibujo porque es donde sirven: ahí se mide, ahí se compara
 * con el modelo y ahí se engancha una cota. La escala del plano ya está aplicada, así que la
 * distancia entre los dos es directamente metros.
 */
function extremosDelSegmento(
  objeto: THREE.LineSegments,
  indice: number | null,
): {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly largoM: number;
} | null {
  if (indice === null) return null;

  const posiciones = objeto.geometry.getAttribute("position");
  // Los segmentos van de dos en dos: el índice que devuelve el rayo es el del primer vértice.
  const i = indice - (indice % 2);
  if (i + 1 >= posiciones.count) return null;

  objeto.updateWorldMatrix(true, false);
  const a = new THREE.Vector3(
    posiciones.getX(i),
    posiciones.getY(i),
    posiciones.getZ(i),
  ).applyMatrix4(objeto.matrixWorld);
  const b = new THREE.Vector3(
    posiciones.getX(i + 1),
    posiciones.getY(i + 1),
    posiciones.getZ(i + 1),
  ).applyMatrix4(objeto.matrixWorld);

  return { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], largoM: a.distanceTo(b) };
}

/** El centro de la extensión del dibujo: es el punto alrededor del cual gira el plano. */
function centroDe(dibujo: DxfDrawing): readonly [number, number] {
  if (dibujo.bounds === null) return [0, 0];
  return [
    (dibujo.bounds.minX + dibujo.bounds.maxX) / 2,
    (dibujo.bounds.minY + dibujo.bounds.maxY) / 2,
  ];
}

/**
 * Añade los segmentos de una polilínea, en unidades del dibujo y relativos al centro del plano.
 *
 * Se centra acá y no con la posición del grupo porque **el giro tiene que ser alrededor del
 * plano**: con la geometría en las coordenadas originales —decenas de miles de unidades desde el
 * origen— girar un grado manda el dibujo a otro barrio.
 */
function empujarSegmentos(
  linea: DxfPolyline,
  [cx, cy]: readonly [number, number],
  salida: number[],
): void {
  const puntos = linea.points;
  const total = puntos.length / 2;
  const tramos = linea.closed ? total : total - 1;
  for (let i = 0; i < tramos; i++) {
    const a = i * 2;
    const b = ((i + 1) % total) * 2;
    salida.push(puntos[a]! - cx, 0, -(puntos[a + 1]! - cy));
    salida.push(puntos[b]! - cx, 0, -(puntos[b + 1]! - cy));
  }
}

/**
 * Convierte una polilínea con ancho en la banda maciza que dibuja el CAD.
 *
 * Cada tramo se engorda a los dos lados por su perpendicular y sale como dos triángulos. **Las
 * uniones van a tope**, sin inglete: en un plano de obra la diferencia son milímetros en la esquina
 * de un muro, y el inglete exige resolver casos degenerados —tramos casi paralelos, retrocesos— que
 * no cambian nada de lo que se viene a comparar.
 */
function empujarBanda(
  linea: DxfPolyline,
  [cx, cy]: readonly [number, number],
  ancho: number,
  salida: number[],
): void {
  const puntos = linea.points;
  const total = puntos.length / 2;
  const tramos = linea.closed ? total : total - 1;
  const medio = ancho / 2;

  for (let i = 0; i < tramos; i++) {
    const a = i * 2;
    const b = ((i + 1) % total) * 2;
    const ax = puntos[a]! - cx;
    const az = -(puntos[a + 1]! - cy);
    const bx = puntos[b]! - cx;
    const bz = -(puntos[b + 1]! - cy);

    const largo = Math.hypot(bx - ax, bz - az);
    if (largo < 1e-9) continue;

    const nx = (-(bz - az) / largo) * medio;
    const nz = ((bx - ax) / largo) * medio;

    salida.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz);
    salida.push(ax + nx, 0, az + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz);
  }
}

/**
 * Los objetos con los que se dibuja un grupo de trazos.
 *
 * **Por qué puede ser más de uno.** `LineBasicMaterial` no sabe de grosor: WebGL ignora su
 * `linewidth` y todo sale a un píxel, que es por lo que un muro pesaba lo mismo que una cota. La
 * línea gruesa de verdad es `LineSegments2`, que convierte cada segmento en un cuadrilátero
 * instanciado — y ahí está el problema: **es una malla, y su geometría ya no son pares de vértices**.
 *
 * De esos pares dependen dos cosas que ya funcionan y no se pueden romper: el clic que devuelve la
 * capa y el largo del tramo (`extremosDelSegmento`) y el ajuste al cruce de dos trazos
 * (`intersectionsNear`). Así que cuando hace falta grosor se dibujan **dos objetos**: la malla
 * gruesa, que se ve y no se puede clicar, y la línea de siempre con el material apagado, que no se
 * dibuja y sigue siendo la que contesta las preguntas.
 *
 * Un material invisible **no** deja de ser raycastable —lo que se apaga es el dibujo, no el objeto—
 * y por eso el par sale gratis en pasadas de dibujo. Para los trazos finos, que en un plano real son
 * la inmensa mayoría, se sigue dibujando un solo objeto.
 */
function trazosDe(estilo: EstiloDeTrazo, metrosPorUnidad: number): readonly THREE.Object3D[] {
  const { color, opacity, dash, anchoPx, puntos } = estilo;
  if (puntos.length === 0) return [];

  const patron = dash === null ? null : patronLegible(dash, metrosPorUnidad);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));

  const fina = new THREE.LineSegments(
    geometria,
    patron === null
      ? new THREE.LineBasicMaterial({ color, depthWrite: false, transparent: opacity < 1, opacity })
      : new THREE.LineDashedMaterial({
          color,
          depthWrite: false,
          transparent: opacity < 1,
          opacity,
          dashSize: patron[0],
          gapSize: patron[1],
        }),
  );
  // Una línea discontinua necesita saber cuánto lleva recorrido en cada vértice; sin esto se dibuja
  // llena y el patrón no aparece por ninguna parte.
  if (patron !== null) fina.computeLineDistances();
  fina.frustumCulled = false;
  fina.renderOrder = ORDEN.trazos;
  fina.userData = { tipo: "trazos" };

  if (anchoPx <= ANCHO_QUE_MERECE_MALLA) return [fina];

  const gruesa = new LineSegments2(
    new LineSegmentsGeometry().setPositions(puntos),
    new LineMaterial({
      color,
      linewidth: anchoPx,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      dashed: patron !== null,
      ...(patron === null ? {} : { dashSize: patron[0], gapSize: patron[1] }),
    }),
  );
  if (patron !== null) gruesa.computeLineDistances();
  gruesa.frustumCulled = false;
  gruesa.renderOrder = ORDEN.trazos;
  // La malla gruesa se ve y no se clica: quien contesta es la línea fina. Sin esta marca, `pick` la
  // tomaría por un relleno —es una malla— y un clic sobre un muro devolvería "relleno" sin su largo.
  gruesa.userData = { tipo: "grosor" };
  gruesa.raycast = () => {};

  // `LineMaterial` necesita el tamaño del lienzo para convertir su ancho de píxeles a pantalla, y si
  // no se le da dibuja con el que traía por defecto: al redimensionar la ventana los grosores se
  // desajustan. Se pone antes de cada fotograma, que es cuando se sabe.
  const material = gruesa.material;
  gruesa.onBeforeRender = (renderer) => {
    renderer.getSize(TAMANO);
    material.resolution.set(TAMANO.x, TAMANO.y);
  };

  // El orden importa: la fina va después para que sus extremos ganen el clic frente a la malla.
  return [gruesa, fina];
}

/** Reutilizado para no crear un vector por fotograma y por malla. */
const TAMANO = new THREE.Vector2();

/** Cuelga de la capa los rótulos que le tocan y devuelve cuántos entraron. */
function ponerRotulos(
  grupoCapa: THREE.Group,
  dibujo: DxfDrawing,
  capa: DxfLayer,
  centro: readonly [number, number],
  metrosPorUnidad: number,
  altoM: number,
  cupo: number,
): number {
  if (cupo <= 0 || altoM <= 0) return 0;

  const suyos = dibujo.texts.filter((texto) => texto.layer === capa.name).slice(0, cupo);
  if (suyos.length === 0) return 0;

  const rotulos = atlasDeEtiquetas(suyos, centro, metrosPorUnidad, altoM);
  if (rotulos === null) return 0;

  grupoCapa.add(rotulos.malla);
  return rotulos.cuantos;
}

/**
 * Qué rótulo del atlas cayó bajo el clic.
 *
 * Todos comparten malla, así que el rayo devuelve la malla y no el rótulo: se resuelve por el
 * centro más cercano al punto tocado, ya en coordenadas locales del plano.
 */
function rotuloEn(malla: THREE.Mesh, punto: THREE.Vector3): string | null {
  const datos = malla.userData as { etiquetas?: readonly { x: number; z: number; text: string }[] };
  const etiquetas = datos.etiquetas;
  if (etiquetas === undefined || etiquetas.length === 0) return null;

  const local = malla.worldToLocal(punto.clone());
  let mejor: { text: string; distancia: number } | null = null;
  for (const etiqueta of etiquetas) {
    const distancia = Math.hypot(etiqueta.x - local.x, etiqueta.z - local.z);
    if (mejor === null || distancia < mejor.distancia) mejor = { text: etiqueta.text, distancia };
  }
  return mejor?.text ?? null;
}

/** Suelta la geometría, el material y la textura de un objeto que sale de la escena. */
function liberar(objeto: THREE.Object3D): void {
  const conGeometria = objeto as Partial<THREE.Mesh>;
  conGeometria.geometry?.dispose();

  const material = conGeometria.material;
  for (const uno of Array.isArray(material) ? material : material ? [material] : []) {
    (uno as THREE.MeshBasicMaterial).map?.dispose();
    uno.dispose();
  }
}

/**
 * Todos los rótulos de una capa, en **una sola malla con una sola textura**.
 *
 * **Por qué un atlas y no un rótulo por objeto.** La primera versión creaba una textura por texto:
 * con los cuatrocientos rótulos de un plano corriente eso son cuatrocientas texturas, y al abrir
 * después un IFC de veinte megas la pestaña se quedaba sin memoria de vídeo y se caía todo. Con un
 * atlas por capa son siete texturas para el plano entero, y una sola malla que se dibuja de una
 * pasada.
 *
 * **Tumbados en el plano, no de cara a la cámara.** Un texto que gira para mirar al observador se
 * lee siempre, pero en planta se ve torcido respecto al dibujo y deja de parecer parte del plano.
 *
 * El alto es **el mismo para todos** y lo decide la interfaz, no el archivo: los planos anotativos
 * traen alturas de papel —un centímetro de modelo— que no se ven, y los que traen alturas de modelo
 * tapan el dibujo. Ver {@link ALTO_ETIQUETA_M} y `setLabelHeight`.
 */
function atlasDeEtiquetas(
  textos: readonly DxfText[],
  [cx, cy]: readonly [number, number],
  metrosPorUnidad: number,
  altoM: number,
): { readonly malla: THREE.Mesh; readonly cuantos: number } | null {
  const utiles = textos.filter((texto) => texto.text !== "");
  if (utiles.length === 0) return null;

  const lienzo = document.createElement("canvas");
  const pincel = lienzo.getContext("2d");
  if (pincel === null) return null;

  const fila = 64;
  const letra = 40;
  lienzo.width = ATLAS_PX;
  lienzo.height = Math.min(ATLAS_PX, Math.ceil(utiles.length / 2) * fila + fila);
  pincel.font = `600 ${letra}px system-ui, "Segoe UI", sans-serif`;
  pincel.textBaseline = "middle";
  // **Un contorno fino, no una placa.** Con el trazo grueso y opaco de la primera versión, un
  // rótulo corto se veía como un rectángulo negro sobre el dibujo, y varios juntos tapaban la
  // planta. Lo justo para despegar la letra de las líneas que tiene detrás.
  pincel.lineWidth = letra * 0.08;
  pincel.lineJoin = "round";
  pincel.strokeStyle = "rgba(6, 10, 20, 0.55)";

  /** El centro del rótulo, repetido en sus cuatro esquinas: es el ancla que no se mueve. */
  const posiciones: number[] = [];
  /** Lo que se aparta cada esquina de ese centro, ya con el giro del texto aplicado. */
  const esquinas: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  /** El centro de cada rótulo, su media caja y lo que dice: es lo que permite clicarlo. */
  const centros: { x: number; z: number; text: string; media: number; medioAlto: number }[] = [];
  const alto = altoM / metrosPorUnidad;

  let x = 0;
  let y = 0;
  let cuantos = 0;

  for (const texto of utiles) {
    const contenido = texto.text.slice(0, 60);
    const ancho = Math.ceil(pincel.measureText(contenido).width) + letra;
    if (ancho > lienzo.width) continue;

    if (x + ancho > lienzo.width) {
      x = 0;
      y += fila;
    }
    if (y + fila > lienzo.height) break;

    // El color va **dentro** del atlas: así una sola malla lleva rótulos de colores distintos sin
    // un material por color.
    pincel.fillStyle = `#${new THREE.Color(texto.color.rgb).getHexString()}`;
    pincel.strokeText(contenido, x + letra / 2, y + fila / 2);
    pincel.fillText(contenido, x + letra / 2, y + fila / 2);

    const anchoMundo = (alto * ancho) / fila;
    const media = anchoMundo / 2;
    const medioAlto = alto / 2;
    const angulo = (texto.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo);
    const px = texto.x - cx;
    const py = texto.y - cy;

    // **El centro va en `position` y la esquina en su propio atributo.** Así el rótulo puede
    // crecer y encoger alrededor de su ancla sin moverse de sitio, que es lo que hace falta para
    // que se lea igual de cerca que de lejos. El giro del texto se hornea en la esquina, porque la
    // malla es una sola y no puede girar por rótulo.
    const esquina = (dx: number, dy: number) => {
      posiciones.push(px, 0, -py);
      esquinas.push(dx * cos - dy * sen, -(dx * sen + dy * cos));
    };
    esquina(-media, -medioAlto);
    esquina(media, -medioAlto);
    esquina(media, medioAlto);
    esquina(-media, medioAlto);

    const u0 = x / lienzo.width;
    const u1 = (x + ancho) / lienzo.width;
    // La textura se lee de abajo arriba, al revés que el lienzo.
    const v0 = 1 - (y + fila) / lienzo.height;
    const v1 = 1 - y / lienzo.height;
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

    const base = cuantos * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    centros.push({ x: px, z: -py, text: contenido, media, medioAlto });

    x += ancho;
    cuantos++;
  }

  if (cuantos === 0) return null;

  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.anisotropy = 4;

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute("corner", new THREE.Float32BufferAttribute(esquinas, 2));
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);

  const material = materialDeMarcas(textura);
  const malla = new THREE.Mesh(geometria, material);
  malla.name = "rotulos";
  // Los rótulos comparten malla, así que el rayo no puede decir cuál se tocó: se guardan sus
  // centros y su texto para resolverlo por cercanía. Ver {@link rotuloEn}.
  malla.userData = { tipo: "rotulos", etiquetas: centros, altoBase: alto };

  // **El rótulo se dibuja del mismo tamaño mire uno de donde mire**, y el rayo lo encuentra contra
  // su caja y no contra la geometría, que no tiene tamaño propio. Ver `etiquetas.ts`.
  mantenerTamanoEnPantalla(malla, material, alto, ALTO_ETIQUETA_PX);
  malla.raycast = (rayo, impactos) => tocarMarcas(malla, material, centros, rayo, impactos);
  // Los rótulos se dibujan **encima** de los trazos: compartiendo plano con las líneas, parpadean
  // contra ellas al orbitar.
  malla.renderOrder = ORDEN.rotulos;
  malla.frustumCulled = false;
  return { malla, cuantos };
}

/**
 * Un relleno del plano, como cara plana.
 *
 * **Los macizos son la mitad del dibujo.** Un plano de arquitectura dibuja los muros con contorno y
 * relleno; con solo el contorno, lo que se ve es una maraña de líneas y la comparación con el
 * modelo deja de ser inmediata.
 *
 * De los contornos, el de **más área** se toma como borde y los demás como huecos: es lo que
 * acierta en un plano real sin implementar la aritmética de contornos del estándar. Un rayado —no
 * macizo— se dibuja solo con su borde, que a la escala de un plano es lo que se distingue.
 */
function mallaDeRelleno(
  relleno: DxfHatch,
  [cx, cy]: readonly [number, number],
  metrosPorUnidad: number,
): THREE.Object3D | null {
  const contornos = relleno.loops
    .map((puntos) => {
      const planos: THREE.Vector2[] = [];
      for (let i = 0; i + 1 < puntos.length; i += 2) {
        planos.push(new THREE.Vector2(puntos[i]! - cx, -(puntos[i + 1]! - cy)));
      }
      return planos;
    })
    .filter((puntos) => puntos.length >= 3)
    .sort(
      (uno, otro) => Math.abs(THREE.ShapeUtils.area(otro)) - Math.abs(THREE.ShapeUtils.area(uno)),
    );

  const borde = contornos[0];
  if (borde === undefined) return null;

  const color = relleno.color.rgb;

  if (!relleno.solid) {
    // **Un rayado se raya.** Antes se dibujaba solo su borde, y los veintitrés rellenos del plano
    // real son `ANSI31`: se veían como veintitrés contornos vacíos justo donde el CAD dibuja un muro
    // rayado. El borde va igual, porque en el CAD también está.
    const puntos: number[] = [];
    for (const contorno of contornos) {
      for (let i = 0; i < contorno.length; i++) {
        const a = contorno[i]!;
        const b = contorno[(i + 1) % contorno.length]!;
        puntos.push(a.x, 0, a.y, b.x, 0, b.y);
      }
    }
    for (const [a, b] of rayado(contornos, relleno.pattern, metrosPorUnidad)) {
      puntos.push(a[0], 0, a[1], b[0], 0, b[1]);
    }
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    const linea = new THREE.LineSegments(
      geometria,
      new THREE.LineBasicMaterial({
        color,
        depthWrite: false,
        transparent: relleno.color.opacity < 1,
        opacity: relleno.color.opacity,
      }),
    );
    linea.frustumCulled = false;
    linea.renderOrder = ORDEN.trazos;
    return linea;
  }

  const forma = new THREE.Shape(borde);
  for (const hueco of contornos.slice(1)) forma.holes.push(new THREE.Path(hueco));

  const geometria = new THREE.ShapeGeometry(forma);
  // `ShapeGeometry` dibuja en XY y el plano vive en XZ: se tumba, igual que los rótulos.
  geometria.rotateX(-Math.PI / 2);
  // Y se sube un pelo para que no pelee contra las líneas del propio contorno.
  geometria.translate(0, 0.0005, 0);

  // **Opaco, como en el CAD.** Iba al 35 % para no tapar el modelo ni las líneas del propio plano;
  // el precio era un plano lavado, que es justo la queja. Lo que no lo tape ahora es el orden de
  // dibujo —{@link ORDEN}—, que pone los trazos encima del macizo, y no la transparencia.
  const malla = new THREE.Mesh(geometria, materialDeCara(color, relleno.color.opacity));
  malla.renderOrder = ORDEN.macizos;
  malla.frustumCulled = false;
  return malla;
}

/**
 * Cuánto se separan las rayas de un relleno, y cuántas se dibujan como mucho.
 *
 * **La separación del archivo no sirve tal cual**, por lo mismo que no sirve el tamaño del patrón de
 * una línea discontinua: se define en unidades de papel y se escala con un número que en cada oficina
 * vale otra cosa. Se conserva el ángulo, que es lo que distingue un macizo cortado de una zona
 * sombreada, y la separación se lleva a una medida en la que el relleno se lee.
 *
 * **La separación sale del lado menor del propio relleno**, y esto lo decidió medir el plano real:
 * con una separación fija de doce centímetros los veintitrés rellenos salían con **cero o una raya**,
 * porque no son zonas grandes sino jambas y topes de muro de seis por quince centímetros. Con una
 * fracción de su lado menor, un tope de muro sale con una docena de rayas y una zona de cinco metros
 * con unas cuantas decenas — que es la densidad con la que un rayado se distingue de un macizo.
 *
 * Los topes están para las dos puntas: una raya cada cinco milímetros ya es una mancha, y una cada
 * veinte centímetros deja de leerse como rayado. Y el tope por relleno es la red de seguridad: al
 * llegar, la separación se ensancha, porque un relleno rayado a medias se ve como un error.
 */
const RAYADO = {
  fraccionDelLadoMenor: 0.25,
  minimaM: 0.005,
  maximaM: 0.2,
  maximoPorRelleno: 400,
} as const;

/**
 * Las rayas de un relleno, en el sistema local del plano.
 *
 * **La aritmética vive en el dominio** (`hatchLines`, con sus pruebas): el recorte por paridad falla
 * en silencio —una raya que pasa por un vértice invierte la paridad y sale el negativo del relleno—
 * y eso se prueba en Node. Lo que se decide aquí es **la separación**, que depende de a qué escala se
 * está mirando el plano y no del archivo.
 */
function rayado(
  contornos: readonly (readonly THREE.Vector2[])[],
  patron: string | null,
  metrosPorUnidad: number,
): readonly (readonly [PlanPoint, PlanPoint])[] {
  const escala = metrosPorUnidad > 0 ? metrosPorUnidad : 1;

  // La separación se decide con el tamaño del relleno, y por eso se mide antes de girar nada.
  const caja = new THREE.Box2();
  for (const contorno of contornos) for (const punto of contorno) caja.expandByPoint(punto);
  const ladoMenor = Math.min(caja.max.x - caja.min.x, caja.max.y - caja.min.y);
  if (!(ladoMenor > 0)) return [];

  const separacion = Math.min(
    RAYADO.maximaM / escala,
    Math.max(RAYADO.minimaM / escala, ladoMenor * RAYADO.fraccionDelLadoMenor),
  );

  const lazos = contornos.map((contorno) => contorno.map((punto): PlanPoint => [punto.x, punto.y]));
  return hatchLines(lazos, hatchAngles(patron), separacion, RAYADO.maximoPorRelleno);
}

/** Lleva la colocación al objeto de la escena. */
function aplicar(plano: PlanoDibujado): void {
  const t = plano.transform;
  const escala = t.metresPerUnit;
  plano.grupo.scale.set(t.mirrored ? -escala : escala, escala, escala);
  plano.grupo.rotation.set(0, (t.rotationDeg * Math.PI) / 180, 0);
  plano.grupo.position.set(t.offsetXM, t.elevationM, t.offsetZM);
  plano.grupo.updateMatrixWorld(true);
}
