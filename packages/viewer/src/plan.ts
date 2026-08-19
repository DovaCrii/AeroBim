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
  /** Cuánto mide el plano ya escalado, en metros. */
  readonly sizeM: readonly [number, number];
  readonly vertexCount: number;
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
 * El color real de un índice de AutoCAD.
 *
 * **Reproduce la paleta ACI, no una aproximación de fantasía.** El plano de remodelación del
 * usuario usa el color para decir qué se construye y qué se demuele; con tonos inventados, esa
 * información se pierde justo en el archivo donde más importa.
 *
 * La rueda va del 10 al 249: **24 tonos** de 15 grados y, dentro de cada uno, cinco niveles de
 * claridad en dos saturaciones. Los grises finales (250-255) son una rampa de negro a casi blanco.
 */
function aciAColor(colorIndex: number): number {
  const basico = ACI_BASICOS[colorIndex];
  if (basico !== undefined) return basico;

  if (colorIndex >= 250 && colorIndex <= 255) {
    const gris = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff][colorIndex - 250]!;
    return gris;
  }

  if (colorIndex < 10 || colorIndex > 249) return ACI_BASICOS[7]!;

  const indice = colorIndex - 10;
  const tono = Math.floor(indice / 10) * 15;
  const variante = indice % 10;
  // Pares (claridad, saturación) de la paleta: los impares son la versión desaturada del par
  // anterior, que es lo que hace que 11, 13, 15… se vean "lavados" en AutoCAD.
  const claridad = [1, 1, 0.8, 0.8, 0.62, 0.62, 0.45, 0.45, 0.3, 0.3][variante]!;
  const saturacion = variante % 2 === 0 ? 1 : 0.5;

  return new THREE.Color().setHSL(tono / 360, saturacion, claridad / 2 + 0.06).getHex();
}

/** El color con el que se dibuja algo del plano; sin índice, el del "por defecto". */
function colorDeCapa(colorIndex: number | null): number {
  return colorIndex === null ? ACI_BASICOS[7]! : aciAColor(colorIndex);
}

/**
 * Cuántos rótulos se dibujan como mucho.
 *
 * Cada uno lleva su propia textura, y un plano de instalaciones puede traer decenas de miles: sin
 * tope, abrirlo se lleva la memoria de la pestaña. Con este, los planos de obra corrientes —unos
 * cientos de textos— entran enteros.
 */
const LIMITE_ETIQUETAS = 3000;

/** Lo que se guarda de cada plano dibujado. */
interface PlanoDibujado {
  readonly id: string;
  readonly name: string;
  readonly grupo: THREE.Group;
  /** Un grupo por capa, para poder apagarlas una por una. */
  readonly capas: Map<string, THREE.Group>;
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

      // **Un dibujo por color, no uno por capa.** El color puede venir de la entidad y no de su
      // capa, y en un plano de remodelación eso *es* la información: lo nuevo y lo que se demuele
      // conviven en la misma capa con colores distintos.
      const porColor = new Map<number, number[]>();
      for (const linea of dibujo.polylines) {
        if (linea.layer !== capa.name) continue;

        const color = colorDeCapa(linea.colorIndex ?? capa.colorIndex);
        const destino = porColor.get(color) ?? [];
        empujarSegmentos(linea, centrado, destino);
        porColor.set(color, destino);
      }

      for (const [color, posiciones] of porColor) {
        if (posiciones.length === 0) continue;

        const geometria = new THREE.BufferGeometry();
        geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
        const material = new THREE.LineBasicMaterial({
          color,
          // El plano va **debajo** del modelo y no debe taparlo, pero tampoco desaparecer bajo la
          // losa: se dibuja sin escribir profundidad, así que se ve a través sin pelearse con ella.
          depthWrite: false,
          transparent: true,
          opacity: 0.9,
        });
        const linea = new THREE.LineSegments(geometria, material);
        linea.frustumCulled = false;
        grupoCapa.add(linea);
      }

      for (const texto of dibujo.texts) {
        if (texto.layer !== capa.name) continue;
        if (etiquetasPuestas >= LIMITE_ETIQUETAS) break;

        const malla = etiqueta(texto, centrado, capa.colorIndex);
        if (malla === null) continue;
        grupoCapa.add(malla);
        etiquetasPuestas++;
      }

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

    const plano: PlanoDibujado = { id, name, grupo, capas, transform };
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
      vertexCount: dibujo.polylines.reduce((n, p) => n + p.points.length / 2, 0),
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

          mejor = {
            distancia: impacto.distance,
            hit: {
              planId: plano.id,
              planName: plano.name,
              layer: nombreCapa,
              point: [impacto.point.x, impacto.point.y, impacto.point.z],
              // El índice del vértice dice qué segmento se tocó: con él se mide su largo, que es
              // el dato que alguien busca al clicar una línea de un plano.
              segmentLengthM: largoDelSegmento(objeto, impacto.index ?? null, escalaMundo),
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
  /** El largo del tramo tocado, en metros. `null` si no se pudo determinar. */
  readonly segmentLengthM: number | null;
}

/** El largo del segmento tocado, ya en metros de la escena. */
function largoDelSegmento(
  objeto: THREE.LineSegments,
  indice: number | null,
  metrosPorUnidad: number,
): number | null {
  if (indice === null) return null;

  const posiciones = objeto.geometry.getAttribute("position");
  // Los segmentos van de dos en dos: el índice que devuelve el rayo es el del primer vértice.
  const a = indice - (indice % 2);
  const b = a + 1;
  if (b >= posiciones.count) return null;

  const largo = Math.hypot(
    posiciones.getX(b) - posiciones.getX(a),
    posiciones.getY(b) - posiciones.getY(a),
    posiciones.getZ(b) - posiciones.getZ(a),
  );
  return largo * metrosPorUnidad;
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
 * Un rótulo del plano, dibujado en un lienzo y pegado sobre su sitio.
 *
 * **Tumbado en el plano, no de cara a la cámara.** Un texto que gira para mirar al observador se
 * lee siempre, pero en planta se ve torcido respecto al dibujo y deja de parecer parte del plano;
 * en un CAD el texto vive en el plano y así es como se espera verlo.
 *
 * La textura se dibuja al doble del tamaño que ocupa en pantalla para que no se vea borrosa al
 * acercarse, y el fondo queda transparente: es un rótulo sobre el modelo, no una etiqueta pegada.
 */
function etiqueta(
  texto: DxfText,
  [cx, cy]: readonly [number, number],
  colorCapa: number | null,
): THREE.Mesh | null {
  const contenido = texto.text.slice(0, 120);
  if (contenido === "" || texto.height <= 0) return null;

  const lienzo = document.createElement("canvas");
  const pixelesPorLetra = 32;
  lienzo.width = Math.min(2048, Math.max(64, Math.ceil(contenido.length * pixelesPorLetra * 0.62)));
  lienzo.height = pixelesPorLetra * 2;

  const pincel = lienzo.getContext("2d");
  if (pincel === null) return null;

  const color = new THREE.Color(colorDeCapa(texto.colorIndex ?? colorCapa));
  pincel.font = `${pixelesPorLetra}px system-ui, sans-serif`;
  pincel.textAlign = "center";
  pincel.textBaseline = "middle";
  pincel.fillStyle = `#${color.getHexString()}`;
  pincel.fillText(contenido, lienzo.width / 2, lienzo.height / 2);

  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearFilter;

  const alto = texto.height;
  const ancho = (alto * lienzo.width) / lienzo.height;
  const malla = new THREE.Mesh(
    new THREE.PlaneGeometry(ancho, alto),
    new THREE.MeshBasicMaterial({
      map: textura,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  malla.position.set(texto.x - cx, 0, -(texto.y - cy));
  malla.rotateX(-Math.PI / 2);
  malla.rotateZ((texto.rotationDeg * Math.PI) / 180);
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
