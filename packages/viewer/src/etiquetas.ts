/**
 * Texto y marcas que se leen igual de cerca que de lejos.
 *
 * **El problema que resuelve.** Un rótulo dibujado a su tamaño de plano —veinte centímetros en una
 * planta de veinte metros— ocupa diez píxeles en pantalla: existe y no se lee. Y una burbuja de eje
 * a su tamaño de obra desaparece en cuanto se mira el edificio entero. Es lo mismo que resuelve la
 * anotación **anotativa** de un CAD: el texto conserva su sitio y su tamaño en la hoja, no en el
 * modelo.
 *
 * Cada esquina se aparta de su centro lo que diga un factor que se recalcula antes de cada
 * fotograma, así que la marca **crece y encoge alrededor de su ancla** sin moverse. Tiene que ir en
 * el vértice —con su atributo y su shader— porque escalar la malla sacaría a todas de su posición:
 * comparten una sola malla y una sola textura, que es lo que evita cuatrocientas texturas por plano.
 */

import * as THREE from "three";

/** Hasta cuánto se deja estirar o encoger una marca respecto a su tamaño de dibujo. */
export const FACTOR_MARCA = { minimo: 0.25, maximo: 12 } as const;

/**
 * El material de las marcas: la textura del atlas, con el tamaño puesto por el vértice.
 *
 * Un material corriente no sirve: escalaría la malla entera y las marcas se irían de sitio.
 */
export function materialDeMarcas(textura: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { mapa: { value: textura }, factor: { value: 1 } },
    vertexShader: `
      attribute vec2 corner;
      uniform float factor;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 sitio = position + vec3(corner.x * factor, 0.0, corner.y * factor);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(sitio, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D mapa;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(mapa, vUv);
        if (color.a < 0.02) discard;
        gl_FragColor = color;
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Deja la malla dibujándose siempre del mismo alto en pantalla.
 *
 * `altoBase` es lo que mide la marca en unidades locales de la malla; `altoPx`, lo que tiene que
 * medir en la pantalla. El cálculo cambia según la cámara: en ortográfica el tamaño solo depende
 * del encuadre, y en perspectiva, de la distancia.
 */
export function mantenerTamanoEnPantalla(
  malla: THREE.Mesh,
  material: THREE.ShaderMaterial,
  altoBase: number,
  altoPx: number,
): void {
  malla.onBeforeRender = (renderer, _escena, camara) => {
    const alturaPx = renderer.getSize(new THREE.Vector2()).y || 1;
    const escalaMundo = malla.getWorldScale(new THREE.Vector3()).y || 1;

    let metrosPorPixel: number;
    if ((camara as THREE.OrthographicCamera).isOrthographicCamera === true) {
      const orto = camara as THREE.OrthographicCamera;
      metrosPorPixel = (orto.top - orto.bottom) / (orto.zoom || 1) / alturaPx;
    } else {
      const perspectiva = camara as THREE.PerspectiveCamera;
      const distancia = perspectiva.position.distanceTo(
        malla.getWorldPosition(new THREE.Vector3()),
      );
      metrosPorPixel =
        (2 * distancia * Math.tan(((perspectiva.fov || 60) * Math.PI) / 360)) / alturaPx;
    }

    const deseadoM = altoPx * metrosPorPixel;
    const baseM = altoBase * escalaMundo;
    const factor = baseM === 0 ? 1 : deseadoM / baseM;

    material.uniforms["factor"]!.value = Math.min(
      FACTOR_MARCA.maximo,
      Math.max(FACTOR_MARCA.minimo, Number.isFinite(factor) ? factor : 1),
    );
  };
}

/**
 * El impacto del rayo contra marcas de tamaño variable.
 *
 * La geometría tiene las cuatro esquinas de cada marca en el mismo punto —el tamaño lo pone el
 * material— así que un rayo normal no tocaría nada. Se resuelve cortando el plano de la malla y
 * mirando en qué caja cae, con el mismo factor que se está dibujando.
 */
export function tocarMarcas(
  malla: THREE.Mesh,
  material: THREE.ShaderMaterial,
  cajas: readonly {
    readonly x: number;
    readonly z: number;
    /**
     * Cuánto se aparta el centro de la caja de su ancla, en unidades locales.
     *
     * **No es cero desde que los rótulos se colocan por su alineación.** Un texto alineado a la
     * izquierda crece hacia la derecha de su punto, así que su caja no está centrada en él — y se
     * aparta más cuanto más grande se dibuja, igual que la propia marca.
     */
    readonly dx: number;
    readonly dz: number;
    readonly media: number;
    readonly medioAlto: number;
  }[],
  rayo: THREE.Raycaster,
  impactos: THREE.Intersection[],
): void {
  if (cajas.length === 0) return;

  const inversa = new THREE.Matrix4().copy(malla.matrixWorld).invert();
  const local = new THREE.Ray().copy(rayo.ray).applyMatrix4(inversa);
  // La malla vive en el plano y = 0 de su propio sistema.
  if (Math.abs(local.direction.y) < 1e-9) return;

  const t = -local.origin.y / local.direction.y;
  if (t < 0) return;

  const punto = local.origin.clone().addScaledVector(local.direction, t);
  const factor = (material.uniforms["factor"]?.value as number | undefined) ?? 1;

  for (const caja of cajas) {
    if (Math.abs(punto.x - (caja.x + caja.dx * factor)) > caja.media * factor) continue;
    if (Math.abs(punto.z - (caja.z + caja.dz * factor)) > caja.medioAlto * factor) continue;

    const mundo = punto.clone().applyMatrix4(malla.matrixWorld);
    impactos.push({ distance: rayo.ray.origin.distanceTo(mundo), point: mundo, object: malla });
    return;
  }
}
