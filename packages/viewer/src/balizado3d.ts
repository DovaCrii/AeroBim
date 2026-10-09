/**
 * **El eje de un perfil dibujado sobre el modelo, con su balizado.**
 *
 * La línea del trazado, un marcador numerado en cada vértice (1, 2, 3…) y una baliza con su PK
 * («PK 0+005») cada tantos metros. Qué PK llevan baliza lo decide `balizasDelEje` de `bim-core`;
 * aquí solo se dibuja.
 *
 * ## Tamaño constante en pantalla
 *
 * Los rótulos y marcadores son `Sprite` que, **antes de cada fotograma**, ajustan su escala a los
 * metros que ocupan los píxeles que se quieren (en ortográfica, por el encuadre; en perspectiva, por
 * la distancia). Es el mismo criterio que `mantenerTamanoEnPantalla` de `etiquetas.ts`, que no sirve
 * tal cual porque aquel pone el texto tendido en el plano de la planta y estos tienen que mirar a la
 * cámara en una vista 3D. La línea gruesa es `Line2`, con su ancho en píxeles.
 *
 * Las coordenadas son las de la escena, en metros (`sistema: "escena"` del eje).
 */

import { balizasDelEje, type BalizaDeEje, type PuntoEnPlantaM } from "@aerobim/bim-core";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import { textoDeBaliza } from "./perfiles.js";

/** Color del trazado: un naranja que contrasta con el gris de un IFC y con el fondo claro y oscuro. */
const COLOR_EJE = 0xff7a00;
const COLOR_HALO = 0x14161c;
const ORDEN = 1000;

const TAMANO = new THREE.Vector2();

/** Metros que mide un píxel de pantalla en `punto`, para la cámara que dibuja. */
function metrosPorPixel(
  renderer: THREE.WebGLRenderer,
  camara: THREE.Camera,
  punto: THREE.Vector3,
): number {
  const alturaPx = renderer.getSize(TAMANO).y || 1;
  if ((camara as THREE.OrthographicCamera).isOrthographicCamera === true) {
    const orto = camara as THREE.OrthographicCamera;
    return (orto.top - orto.bottom) / (orto.zoom || 1) / alturaPx;
  }
  const perspectiva = camara as THREE.PerspectiveCamera;
  const distancia = perspectiva.position.distanceTo(punto);
  return (2 * distancia * Math.tan(((perspectiva.fov || 60) * Math.PI) / 360)) / alturaPx;
}

/** Un sprite que conserva `anchoPx` × `altoPx` en pantalla, venga la cámara de donde venga. */
function spriteDeTamanoFijo(
  textura: THREE.CanvasTexture,
  anchoPx: number,
  altoPx: number,
  posicion: THREE.Vector3,
  centro: readonly [number, number],
  /** Si devuelve `true`, este fotograma no se dibuja (escala cero): lo usa quien decide qué cabe. */
  oculto: () => boolean = () => false,
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textura,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.position.copy(posicion);
  sprite.center.set(centro[0], centro[1]);
  sprite.renderOrder = ORDEN + 1;
  sprite.frustumCulled = false;
  sprite.scale.set(anchoPx, altoPx, 1);
  sprite.onBeforeRender = (renderer, _escena, camara) => {
    const m = oculto() ? 0 : metrosPorPixel(renderer, camara, sprite.position);
    sprite.scale.set(anchoPx * m, altoPx * m, 1);
    // Las matrices de este fotograma ya están hechas: sin esto la escala nueva llegaría al siguiente.
    sprite.updateMatrixWorld();
  };
  return sprite;
}

const ESCALA_LIENZO = 2;

function lienzo(anchoPx: number, altoPx: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(anchoPx * ESCALA_LIENZO);
  canvas.height = Math.ceil(altoPx * ESCALA_LIENZO);
  const pincel = canvas.getContext("2d")!;
  pincel.scale(ESCALA_LIENZO, ESCALA_LIENZO);
  return [canvas, pincel];
}

function textura(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * **El rótulo de una baliza es HTML y no una textura** (2026-10-09). Como `Sprite` pasaba por la
 * postproducción del visor —ambiente y contornos—, que oscurecía y remarcaba los bordes de las letras:
 * el PK se veía como una mancha gris con un doble contorno. Un elemento del DOM se pinta **después** de
 * la escena, con el texto nítido del navegador, y se coloca cada fotograma proyectando su punto.
 *
 * Se conserva un `Sprite` invisible por rótulo: es quien recibe `onBeforeRender` con la cámara de ese
 * fotograma y por eso lo coloca. Mide su pastilla con el mismo tamaño que usa `decidirRotulosQueCaben`.
 */
function rotuloDeBaliza(
  texto: string,
  posicion: THREE.Vector3,
  oculto: () => boolean,
  nodos: HTMLElement[],
): { sprite: THREE.Sprite; anchoPx: number; altoPx: number } {
  const [, medidor] = lienzo(10, 10);
  medidor.font = "700 13px system-ui, sans-serif";
  const anchoPx = Math.ceil(medidor.measureText(texto).width) + 16;
  const altoPx = 22;

  let nodo: HTMLElement | null = null;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.position.copy(posicion);
  sprite.frustumCulled = false;
  sprite.scale.set(1e-6, 1e-6, 1);
  const punto = new THREE.Vector3();
  sprite.onBeforeRender = (renderer, _escena, camara) => {
    const lienzoDom = renderer.domElement;
    const contenedor = lienzoDom.parentElement;
    if (contenedor === null) return;
    if (nodo === null) {
      nodo = document.createElement("div");
      nodo.className = "baliza-pk";
      nodo.textContent = texto;
      nodo.setAttribute("aria-hidden", "true");
      nodo.style.cssText =
        "position:absolute;left:0;top:0;z-index:5;pointer-events:none;white-space:nowrap;" +
        "font:700 13px/20px system-ui,sans-serif;letter-spacing:.01em;color:#fff;" +
        "background:#14161c;border:2px solid #ff7a00;border-radius:6px;padding:0 6px;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.55);will-change:transform;";
      if (getComputedStyle(contenedor).position === "static")
        contenedor.style.position = "relative";
      contenedor.appendChild(nodo);
      nodos.push(nodo);
    }
    const tamano = renderer.getSize(TAMANO);
    punto.copy(sprite.position).project(camara);
    const fuera =
      punto.z <= -1 || punto.z >= 1 || Math.abs(punto.x) > 1.2 || Math.abs(punto.y) > 1.2;
    if (oculto() || fuera) {
      nodo.style.display = "none";
      return;
    }
    nodo.style.display = "";
    const x = Math.round(((punto.x + 1) / 2) * tamano.x);
    const y = Math.round(((1 - punto.y) / 2) * tamano.y);
    // Centrado sobre su baliza y un poco por encima, para no tapar la línea.
    nodo.style.transform = `translate(${x}px, ${y}px) translate(-50%, -135%)`;
  };
  return { sprite, anchoPx, altoPx };
}

/** El círculo numerado de un vértice del trazado. */
function marcadorDeVertice(numero: number, posicion: THREE.Vector3): THREE.Sprite {
  const diametroPx = 22;
  const [canvas, pincel] = lienzo(diametroPx, diametroPx);
  pincel.beginPath();
  pincel.arc(diametroPx / 2, diametroPx / 2, diametroPx / 2 - 1.5, 0, Math.PI * 2);
  pincel.fillStyle = "#ff7a00";
  pincel.fill();
  pincel.lineWidth = 2;
  pincel.strokeStyle = "#ffffff";
  pincel.stroke();
  pincel.font = "700 12px system-ui, sans-serif";
  pincel.fillStyle = "#14161c";
  pincel.textAlign = "center";
  pincel.textBaseline = "middle";
  pincel.fillText(String(numero), diametroPx / 2, diametroPx / 2 + 0.5);
  const sprite = spriteDeTamanoFijo(textura(canvas), diametroPx, diametroPx, posicion, [0.5, 0.5]);
  sprite.renderOrder = ORDEN + 2;
  return sprite;
}

function lineaGruesa(puntos: readonly THREE.Vector3[], anchoPx: number, color: number): Line2 {
  const geometria = new LineGeometry();
  geometria.setPositions(puntos.flatMap((p) => [p.x, p.y, p.z]));
  const material = new LineMaterial({
    color,
    linewidth: anchoPx,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const linea = new Line2(geometria, material);
  linea.frustumCulled = false;
  linea.raycast = () => {};
  // `LineMaterial` convierte su ancho de píxeles con el tamaño del lienzo.
  linea.onBeforeRender = (renderer) => {
    renderer.getSize(TAMANO);
    material.resolution.set(TAMANO.x, TAMANO.y);
  };
  return linea;
}

/**
 * El grupo que se cuelga de la escena: línea (con halo oscuro para que contraste), balizas con su PK
 * y vértices numerados.
 *
 * `yM` es la altura de la escena a la que va el trazado: es una polilínea en planta y no tiene cota.
 */
export function construirBalizado(
  verticesM: readonly PuntoEnPlantaM[],
  yM: number,
  /** Lista ya calculada de balizas; si falta, se calcula con el intervalo por defecto. */
  balizas?: readonly BalizaDeEje[],
): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = "eje-de-perfil";
  const puntos = verticesM.map(([x, z]) => new THREE.Vector3(x, yM, z));

  if (puntos.length >= 2) {
    const halo = lineaGruesa(puntos, 7, COLOR_HALO);
    halo.renderOrder = ORDEN;
    const linea = lineaGruesa(puntos, 4, COLOR_EJE);
    linea.renderOrder = ORDEN + 0.5;
    grupo.add(halo, linea);

    const lista = balizas ?? balizasDelEje({ sistema: "escena", verticesM });
    const marcas = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        lista.map((b) => new THREE.Vector3(b.puntoM[0], yM, b.puntoM[1])),
      ),
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 7,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      }),
    );
    marcas.renderOrder = ORDEN + 0.7;
    marcas.frustumCulled = false;
    grupo.add(marcas);

    // Qué rótulos caben: los que se montarían unos sobre otros no se dibujan. Se decide antes de cada
    // fotograma, con la cámara de ese momento, y cada rótulo lo consulta al ajustar su tamaño.
    const ocultos: boolean[] = lista.map(() => false);
    const nodos: HTMLElement[] = [];
    grupo.userData["nodosDom"] = nodos;
    const rotulos = lista.map((baliza, i) =>
      rotuloDeBaliza(
        textoDeBaliza(baliza.pkM, baliza.esFinal),
        new THREE.Vector3(baliza.puntoM[0], yM, baliza.puntoM[1]),
        () => ocultos[i] === true,
        nodos,
      ),
    );
    for (const rotulo of rotulos) grupo.add(rotulo.sprite);
    marcas.onBeforeRender = (renderer, _escena, camara) => {
      decidirRotulosQueCaben(renderer, camara, rotulos, ocultos);
    };
  }
  puntos.forEach((punto, i) => grupo.add(marcadorDeVertice(i + 1, punto)));
  return grupo;
}

/**
 * Marca en `ocultos` los rótulos que taparían a otro ya aceptado.
 *
 * El primero y el último —el PK 0 y el final— tienen prioridad; el resto, por orden. Se mide en
 * píxeles de pantalla con la pastilla colocada sobre su baliza, que es donde se dibuja.
 */
function decidirRotulosQueCaben(
  renderer: THREE.WebGLRenderer,
  camara: THREE.Camera,
  rotulos: readonly { sprite: THREE.Sprite; anchoPx: number; altoPx: number }[],
  ocultos: boolean[],
): void {
  const tamano = renderer.getSize(TAMANO);
  const orden = rotulos.map((_, i) => i);
  if (orden.length > 2) orden.splice(0, orden.length, 0, orden.length - 1, ...orden.slice(1, -1));
  const aceptados: { x: number; y: number; ancho: number; alto: number }[] = [];
  const punto = new THREE.Vector3();
  for (const i of orden) {
    const rotulo = rotulos[i]!;
    punto.copy(rotulo.sprite.position).project(camara);
    const visible =
      punto.z > -1 && punto.z < 1 && Math.abs(punto.x) <= 1.2 && Math.abs(punto.y) <= 1.2;
    // La pastilla está sobre la baliza: su centro, casi un alto por encima de ella.
    const caja = {
      x: ((punto.x + 1) / 2) * tamano.x,
      y: ((1 - punto.y) / 2) * tamano.y - rotulo.altoPx * 0.95,
      ancho: rotulo.anchoPx + 4,
      alto: rotulo.altoPx + 2,
    };
    const choca = aceptados.some(
      (otra) =>
        Math.abs(otra.x - caja.x) < (otra.ancho + caja.ancho) / 2 &&
        Math.abs(otra.y - caja.y) < (otra.alto + caja.alto) / 2,
    );
    ocultos[i] = !visible || choca;
    if (!ocultos[i]) aceptados.push(caja);
  }
}
/** Libera geometrías, materiales y texturas de un grupo hecho por {@link construirBalizado}. */
export function liberarBalizado(grupo: THREE.Group): void {
  for (const nodo of (grupo.userData["nodosDom"] as HTMLElement[] | undefined) ?? []) nodo.remove();
  grupo.traverse((objeto) => {
    const dibujable = objeto as Partial<THREE.Mesh>;
    dibujable.geometry?.dispose();
    const material = dibujable.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}
