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
  parseDxf,
  suggestMetresPerUnit,
  type DxfDrawing,
  type DxfHatch,
  type DxfLayer,
  type DxfPolyline,
  type DxfText,
} from "@aerobim/bim-core";
import * as THREE from "three";

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
}

/**
 * Los siete colores fijos de AutoCAD, los que se ven en cualquier plano.
 *
 * Del 10 al 249 la paleta es una rueda de 24 tonos con diez variantes cada uno, y esa parte se
 * calcula: ver {@link aciAColor}. Los grises del 250 al 255 son una rampa aparte.
 */
const ACI_BASICOS: Readonly<Record<number, number>> = {
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  // **El 7 es el color "por defecto" y depende del fondo**: negro sobre papel, blanco sobre una
  // pantalla oscura. Acá el fondo es oscuro, así que va claro — pintarlo negro sería dibujar un
  // plano invisible, que es exactamente el error clásico al llevar un DXF a un visor.
  7: 0xe8e8ef,
  8: 0x808080,
  9: 0xc0c0c0,
};

/**
 * El color **real** de un índice de AutoCAD, calculado con la regla de la paleta ACI.
 *
 * La paleta no es una rueda de fantasía y no vale aproximarla: el plano de remodelación usa el
 * color para decir qué se construye y qué se demuele, y un tono inventado convierte esa
 * información en decoración. La regla, comprobada contra la tabla oficial:
 *
 * - **1 a 9**: los colores fijos (rojo, amarillo, verde, cian, azul, magenta, el "por defecto" y
 *   dos grises).
 * - **10 a 249**: `24 tonos × 10 variantes`. El tono avanza de 15 en 15 grados; las variantes van
 *   en cinco niveles de claridad —255, 165, 127, 76 y 38— y cada nivel tiene su versión **pálida**,
 *   que sube los componentes apagados hasta la mitad del nivel. Así el 11 es `(255,127,127)` y el
 *   21 es `(255,159,127)`, exactamente como en AutoCAD.
 * - **250 a 255**: la rampa de grises.
 */
function aciAColor(colorIndex: number): number {
  const basico = ACI_BASICOS[colorIndex];
  if (basico !== undefined) return basico;

  if (colorIndex >= 250 && colorIndex <= 255) {
    return [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff][colorIndex - 250]!;
  }

  if (colorIndex < 10 || colorIndex > 249) return ACI_BASICOS[7]!;

  const indice = colorIndex - 10;
  const grados = Math.floor(indice / 10) * 15;
  const variante = indice % 10;
  const nivel = [255, 165, 127, 76, 38][Math.floor(variante / 2)]!;
  const palida = variante % 2 === 1;

  // El tono puro, con saturación y valor al máximo: los componentes salen en 0…1.
  const base = new THREE.Color().setHSL(grados / 360, 1, 0.5);

  const componente = (fraccion: number) => {
    const lleno = fraccion * nivel;
    // La versión pálida levanta lo apagado hasta la mitad del nivel, que es lo que hace que los
    // impares de la paleta se vean lavados en vez de simplemente más oscuros.
    return Math.round(palida ? lleno + (1 - fraccion) * (nivel / 2) : lleno);
  };

  return (componente(base.r) << 16) | (componente(base.g) << 8) | componente(base.b);
}

/** El color con el que se dibuja algo del plano; sin índice, el del "por defecto". */
function colorDeCapa(colorIndex: number | null): number {
  return colorIndex === null ? ACI_BASICOS[7]! : aciAColor(colorIndex);
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
 * Cuánto mide una letra de rótulo en la escena, en metros.
 *
 * **El alto del archivo no sirve para decidirlo.** Los planos anotativos escriben la altura de
 * papel —en el plano real del usuario, un centímetro de modelo— y esos rótulos no se ven; otros
 * escriben altura de modelo y tapan el dibujo. Se dibuja todo a la misma altura y la interfaz la
 * cambia: 15 cm se lee acercándose a un recinto y no ahoga la planta completa.
 */
const ALTO_ETIQUETA_M = 0.15;

/** El lado del atlas de rótulos, en píxeles. Uno por capa, no uno por texto. */
const ATLAS_PX = 2048;

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

    for (const capa of dibujo.layers) {
      const grupoCapa = new THREE.Group();
      grupoCapa.name = `capa:${capa.name}`;

      // **Un dibujo por color y por trazo, no uno por capa.** El color puede venir de la entidad y
      // no de su capa, y en un plano de remodelación eso *es* la información: lo nuevo y lo que se
      // demuele conviven en la misma capa con colores distintos. Con el trazo pasa igual: la línea
      // discontinua distingue un eje o lo que se bota de un muro que se queda.
      const porEstilo = new Map<
        string,
        { color: number; dash: readonly [number, number] | null; puntos: number[] }
      >();
      for (const linea of dibujo.polylines) {
        if (linea.layer !== capa.name) continue;

        const color = colorDeCapa(linea.colorIndex ?? capa.colorIndex);
        const dash = linea.dash;
        const clave = `${color}|${dash === null ? "llena" : `${dash[0]}:${dash[1]}`}`;
        const grupo = porEstilo.get(clave) ?? { color, dash, puntos: [] };
        empujarSegmentos(linea, centrado, grupo.puntos);
        porEstilo.set(clave, grupo);
      }

      for (const { color, dash, puntos } of porEstilo.values()) {
        if (puntos.length === 0) continue;

        const geometria = new THREE.BufferGeometry();
        geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));

        // El plano va **debajo** del modelo y no debe taparlo, pero tampoco desaparecer bajo la
        // losa: se dibuja sin escribir profundidad, así que se ve a través sin pelearse con ella.
        const comun = { color, depthWrite: false, transparent: true, opacity: 0.9 };
        const patron = dash === null ? null : patronLegible(dash, unidades.metresPerUnit);
        const material =
          patron === null
            ? new THREE.LineBasicMaterial(comun)
            : new THREE.LineDashedMaterial({ ...comun, dashSize: patron[0], gapSize: patron[1] });

        const linea = new THREE.LineSegments(geometria, material);
        // Una línea discontinua necesita saber cuánto lleva recorrido en cada vértice; sin esto se
        // dibuja llena y el patrón no aparece por ninguna parte.
        if (patron !== null) linea.computeLineDistances();
        linea.frustumCulled = false;
        grupoCapa.add(linea);
      }

      for (const relleno of dibujo.hatches) {
        if (relleno.layer !== capa.name) continue;

        const malla = mallaDeRelleno(relleno, centrado, capa.colorIndex);
        if (malla !== null) grupoCapa.add(malla);
      }

      etiquetasPuestas += ponerRotulos(
        grupoCapa,
        dibujo,
        capa,
        centrado,
        unidades.metresPerUnit,
        ALTO_ETIQUETA_M,
        LIMITE_ETIQUETAS - etiquetasPuestas,
      );

      if (grupoCapa.children.length === 0) continue;
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
      labelHeightM: ALTO_ETIQUETA_M,
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

  /** La caja que ocupa un plano ya colocado, para poder encuadrarlo. */
  boxOf(id: string): THREE.Box3 | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const caja = new THREE.Box3().setFromObject(plano.grupo);
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

  /** La caja de todos los planos juntos, para poder encuadrarlos con el modelo. */
  boxAll(): THREE.Box3 | null {
    const union = new THREE.Box3();
    for (const plano of this.planos.values()) {
      if (!plano.grupo.visible) continue;
      union.union(new THREE.Box3().setFromObject(plano.grupo));
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
    let mejor: { hit: PlanHit; distancia: number } | null = null;

    for (const plano of this.planos.values()) {
      if (!plano.grupo.visible) continue;

      for (const [nombreCapa, grupoCapa] of plano.capas) {
        if (!grupoCapa.visible) continue;

        for (const objeto of grupoCapa.children) {
          if (!(objeto instanceof THREE.LineSegments)) continue;

          const escalaMundo = plano.transform.metresPerUnit;
          const distanciaCamara = camara.position.distanceTo(plano.grupo.position);
          rayo.params.Line = { threshold: Math.max(0.05, distanciaCamara * 0.004) / escalaMundo };

          const impactos = rayo.intersectObject(objeto, false);
          const impacto = impactos[0];
          if (impacto === undefined) continue;
          if (mejor !== null && impacto.distance >= mejor.distancia) continue;

          // El índice del vértice dice qué segmento se tocó: con él salen sus dos extremos, que
          // son el largo del trazo y —lo que más importa para revisar— los puntos a los que se
          // engancha una medición.
          const tramo = extremosDelSegmento(objeto, impacto.index ?? null);

          mejor = {
            distancia: impacto.distance,
            hit: {
              planId: plano.id,
              planName: plano.name,
              layer: nombreCapa,
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

  const rotulos = atlasDeEtiquetas(suyos, centro, capa.colorIndex, metrosPorUnidad, altoM);
  if (rotulos === null) return 0;

  grupoCapa.add(rotulos.malla);
  return rotulos.cuantos;
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
  colorCapa: number | null,
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
  pincel.lineWidth = letra * 0.18;
  pincel.lineJoin = "round";
  pincel.strokeStyle = "rgba(6, 10, 20, 0.9)";

  const posiciones: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
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
    pincel.fillStyle = `#${new THREE.Color(colorDeCapa(texto.colorIndex ?? colorCapa)).getHexString()}`;
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

    // Las cuatro esquinas, con el giro del texto ya aplicado: se hornea acá porque la malla es una
    // sola y no puede girar por rótulo.
    const esquina = (dx: number, dy: number) => {
      posiciones.push(px + dx * cos - dy * sen, 0, -(py + dx * sen + dy * cos));
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
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);

  const malla = new THREE.Mesh(
    geometria,
    new THREE.MeshBasicMaterial({
      map: textura,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  malla.name = "rotulos";
  // Los rótulos se dibujan **encima** de los trazos: compartiendo plano con las líneas, parpadean
  // contra ellas al orbitar.
  malla.renderOrder = 2;
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
  colorCapa: number | null,
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

  const color = colorDeCapa(relleno.colorIndex ?? colorCapa);

  if (!relleno.solid) {
    // Un rayado: solo su borde, en la misma línea que el resto del plano.
    const puntos: number[] = [];
    for (const contorno of contornos) {
      for (let i = 0; i < contorno.length; i++) {
        const a = contorno[i]!;
        const b = contorno[(i + 1) % contorno.length]!;
        puntos.push(a.x, 0, a.y, b.x, 0, b.y);
      }
    }
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    const linea = new THREE.LineSegments(
      geometria,
      new THREE.LineBasicMaterial({ color, depthWrite: false, transparent: true, opacity: 0.5 }),
    );
    linea.frustumCulled = false;
    return linea;
  }

  const forma = new THREE.Shape(borde);
  for (const hueco of contornos.slice(1)) forma.holes.push(new THREE.Path(hueco));

  const geometria = new THREE.ShapeGeometry(forma);
  // `ShapeGeometry` dibuja en XY y el plano vive en XZ: se tumba, igual que los rótulos.
  geometria.rotateX(-Math.PI / 2);
  // Y se sube un pelo para que no pelee contra las líneas del propio contorno.
  geometria.translate(0, 0.0005, 0);

  const malla = new THREE.Mesh(
    geometria,
    new THREE.MeshBasicMaterial({
      color,
      // Translúcido a propósito: el relleno no puede tapar ni el modelo que hay debajo ni las
      // líneas del propio plano, que son las que se miden.
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  malla.renderOrder = 0;
  malla.frustumCulled = false;
  return malla;
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
