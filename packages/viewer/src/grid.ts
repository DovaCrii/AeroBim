/**
 * Los ejes de replanteo del modelo, dibujados.
 *
 * **El conversor no los dibuja.** Fragments trata el `IfcGrid` como un producto sin geometría: sale
 * en el árbol y no se ve. Pero los ejes son con lo que se habla en obra —"el pilar del eje C con el
 * 4"— y aquí, además, son **el par de puntos con el que se calza un plano CAD sobre el modelo**: el
 * DXF trae su capa de ejes y el IFC los suyos.
 *
 * Se dibujan como en un plano: la línea discontinua de lado a lado y **la burbuja con su letra en
 * los dos extremos**, que es donde uno la busca.
 */

import type { IfcGridAxis } from "@aerobim/bim-core";
import * as THREE from "three";

/** El color de los ejes: gris azulado, para que no compitan con el modelo ni con el plano. */
const COLOR_EJES = 0x8fa2c8;

/** Cuánto mide la burbuja de un eje, en metros de la escena. */
const BURBUJA_M = 0.9;

/** Los ejes dibujados de un modelo. */
interface EjesDibujados {
  readonly grupo: THREE.Group;
  readonly axes: readonly IfcGridAxis[];
}

/**
 * Los ejes de replanteo en la escena, uno por modelo.
 *
 * Vive aparte del visor por la misma razón que los planos: entra geometría de dominio y sale
 * geometría de Three.js, sin nada de IFC de por medio.
 */
export class GridOverlay {
  private readonly porModelo = new Map<string, EjesDibujados>();
  private visible = true;

  constructor(private readonly escena: THREE.Object3D) {}

  /**
   * Dibuja los ejes de un modelo a una cota dada.
   *
   * La cota es la base del modelo: un eje es una referencia en planta, y dibujarlo a la altura del
   * suelo lo deja donde se lee sin taparse con la estructura.
   */
  add(modelId: string, axes: readonly IfcGridAxis[], elevationM: number): void {
    this.remove(modelId);
    if (axes.length === 0) return;

    const grupo = new THREE.Group();
    grupo.name = `ejes:${modelId}`;
    grupo.position.y = elevationM;
    grupo.visible = this.visible;

    const puntos: number[] = [];
    for (const eje of axes) {
      for (let i = 0; i + 1 < eje.points.length; i++) {
        const a = eje.points[i]!;
        const b = eje.points[i + 1]!;
        // Del sistema del IFC —XY con Z arriba— al de la escena, igual que el plano.
        puntos.push(a[0], 0, -a[1], b[0], 0, -b[1]);
      }
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    const lineas = new THREE.LineSegments(
      geometria,
      new THREE.LineDashedMaterial({
        color: COLOR_EJES,
        dashSize: 0.6,
        gapSize: 0.25,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    lineas.computeLineDistances();
    lineas.frustumCulled = false;
    grupo.add(lineas);

    const burbujas = this.burbujas(axes);
    if (burbujas !== null) grupo.add(burbujas);

    this.escena.add(grupo);
    this.porModelo.set(modelId, { grupo, axes });
  }

  /** Enciende o apaga todos los ejes. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const { grupo } of this.porModelo.values()) grupo.visible = visible;
  }

  /** `true` si los ejes están encendidos. */
  get shown(): boolean {
    return this.visible;
  }

  /** Cuántos ejes hay dibujados, sumando todos los modelos. */
  get count(): number {
    let total = 0;
    for (const { axes } of this.porModelo.values()) total += axes.length;
    return total;
  }

  /** Los ejes de un modelo, para poder listarlos o buscar uno por su letra. */
  axesOf(modelId: string): readonly IfcGridAxis[] {
    return this.porModelo.get(modelId)?.axes ?? [];
  }

  /** Quita los ejes de un modelo y libera lo suyo. */
  remove(modelId: string): void {
    const dibujado = this.porModelo.get(modelId);
    if (dibujado === undefined) return;

    this.escena.remove(dibujado.grupo);
    dibujado.grupo.traverse((objeto) => {
      const conGeometria = objeto as Partial<THREE.Mesh>;
      conGeometria.geometry?.dispose();
      const material = conGeometria.material;
      for (const uno of Array.isArray(material) ? material : material ? [material] : []) {
        (uno as THREE.MeshBasicMaterial).map?.dispose();
        uno.dispose();
      }
    });
    this.porModelo.delete(modelId);
  }

  /**
   * Las burbujas con la letra de cada eje, en sus dos extremos y en una sola malla.
   *
   * Una textura para todas, como los rótulos del plano: son pocas, pero la lección de las
   * cuatrocientas texturas de un DXF vale igual aquí.
   */
  private burbujas(axes: readonly IfcGridAxis[]): THREE.Mesh | null {
    const lienzo = document.createElement("canvas");
    const celda = 128;
    const columnas = Math.min(8, Math.max(1, axes.length));
    lienzo.width = columnas * celda;
    lienzo.height = Math.ceil(axes.length / columnas) * celda;

    const pincel = lienzo.getContext("2d");
    if (pincel === null) return null;

    const posiciones: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let puestas = 0;

    axes.forEach((eje, indice) => {
      const columna = indice % columnas;
      const fila = Math.floor(indice / columnas);
      const x = columna * celda;
      const y = fila * celda;

      pincel.strokeStyle = `#${new THREE.Color(COLOR_EJES).getHexString()}`;
      pincel.lineWidth = 6;
      pincel.beginPath();
      pincel.arc(x + celda / 2, y + celda / 2, celda / 2 - 8, 0, Math.PI * 2);
      pincel.stroke();
      pincel.fillStyle = "rgba(6, 10, 20, 0.75)";
      pincel.fill();
      pincel.fillStyle = `#${new THREE.Color(COLOR_EJES).getHexString()}`;
      pincel.font = `600 ${Math.round(celda * 0.5)}px system-ui, sans-serif`;
      pincel.textAlign = "center";
      pincel.textBaseline = "middle";
      pincel.fillText(eje.label.slice(0, 3), x + celda / 2, y + celda / 2);

      const u0 = x / lienzo.width;
      const u1 = (x + celda) / lienzo.width;
      const v0 = 1 - (y + celda) / lienzo.height;
      const v1 = 1 - y / lienzo.height;

      // Una burbuja en cada punta, un poco por fuera del trazado: es donde va en un plano.
      const primero = eje.points[0];
      const ultimo = eje.points[eje.points.length - 1];
      if (primero === undefined || ultimo === undefined) return;

      for (const [punta, hacia] of [
        [primero, ultimo],
        [ultimo, primero],
      ] as const) {
        const dx = punta[0] - hacia[0];
        const dy = punta[1] - hacia[1];
        const largo = Math.hypot(dx, dy) || 1;
        const cx = punta[0] + (dx / largo) * BURBUJA_M * 0.7;
        const cy = punta[1] + (dy / largo) * BURBUJA_M * 0.7;
        const medio = BURBUJA_M / 2;

        posiciones.push(
          cx - medio,
          0,
          -(cy - medio),
          cx + medio,
          0,
          -(cy - medio),
          cx + medio,
          0,
          -(cy + medio),
          cx - medio,
          0,
          -(cy + medio),
        );
        uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
        const base = puestas * 4;
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        puestas++;
      }
    });

    if (puestas === 0) return null;

    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.minFilter = THREE.LinearMipmapLinearFilter;

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
    malla.name = "burbujas";
    malla.renderOrder = 2;
    malla.frustumCulled = false;
    return malla;
  }
}
