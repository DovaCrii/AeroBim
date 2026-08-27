import { describe, expect, it } from "vitest";
import type { Point3 } from "../measure/geometry.js";
import {
  camaraBcfDesdeEscena,
  escenaAIfc,
  ifcAEscena,
  type SceneCameraState,
} from "./viewpoint.js";

/** Una cámara en perspectiva mirando al origen desde el nordeste y desde arriba. */
const OBLICUA: SceneCameraState = {
  // Escena: 10 al este, 10 arriba, 10 al sur.
  position: [10, 10, 10],
  target: [0, 0, 0],
  // El «arriba» real de una cámara que mira hacia abajo en diagonal: ya girado.
  up: [-0.408248, 0.816497, -0.408248],
  kind: "perspectiva",
  fieldOfViewDeg: 60,
};

function cerca(a: readonly number[], b: readonly number[], tolerancia = 1e-5) {
  expect(a).toHaveLength(b.length);
  a.forEach((valor, i) => expect(Math.abs(valor - (b[i] as number))).toBeLessThan(tolerancia));
}

describe("escenaAIfc", () => {
  it("manda la altura de la escena a la cota del IFC", () => {
    // Es el único punto de todo esto que puede estar mal y no verse: una cota que va a otro eje
    // pone la cámara bajo tierra.
    expect(escenaAIfc([1, 2, 3])).toEqual([1, -3, 2]);
  });

  it("es la inversa exacta de ifcAEscena", () => {
    const puntos: Point3[] = [
      [0, 0, 0],
      [1, 2, 3],
      [-7.5, 0.25, 1000],
    ];
    for (const punto of puntos) {
      expect(ifcAEscena(escenaAIfc(punto))).toEqual(punto);
      expect(escenaAIfc(ifcAEscena(punto))).toEqual(punto);
    }
  });

  it("coincide con la transformación que dibuja los ejes de replanteo", () => {
    // `grid.ts` pone un punto del IFC `(x, y)` a la cota `e` en la escena como `(x, e, -y)`. Esta
    // es la misma regla mirada al revés, y es la que está comprobada contra el modelo real: si no
    // fuera esta, las letras de los ejes caerían a noventa grados del edificio.
    const enElIfc: Point3 = [12, 34, 5];
    const enLaEscena = ifcAEscena(enElIfc);
    expect(enLaEscena).toEqual([12, 5, -34]);
  });
});

describe("camaraBcfDesdeEscena", () => {
  it("convierte posición, dirección y arriba al sistema del IFC", () => {
    const camara = camaraBcfDesdeEscena(OBLICUA);

    expect(camara).not.toBeNull();
    // Escena (10, 10, 10) → IFC (10, -10, 10): la altura pasa a la cota.
    cerca(camara!.punto, [10, -10, 10]);
    // Mira al origen desde ahí: dirección normalizada hacia el (0,0,0).
    cerca(camara!.direccion, [-0.57735, 0.57735, -0.57735]);
    expect(camara!.tipo).toBe("perspectiva");
    expect(camara!.campoVisual).toBe(60);
  });

  it("el arriba queda perpendicular a la dirección", () => {
    // **Es un requisito de BCF**, no una elegancia: un lector estricto rechaza un viewpoint cuyo
    // `CameraUpVector` no lo sea, y uno permisivo dibuja la imagen girada.
    const camara = camaraBcfDesdeEscena(OBLICUA)!;
    const producto =
      camara.arriba[0] * camara.direccion[0] +
      camara.arriba[1] * camara.direccion[1] +
      camara.arriba[2] * camara.direccion[2];

    expect(Math.abs(producto)).toBeLessThan(1e-5);
  });

  it("ortogonaliza un arriba que llega con residuo numérico", () => {
    // El `up` de una cámara real vuelve con ruido de coma flotante y no es exactamente
    // perpendicular. Copiarlo tal cual dejaría un viewpoint inválido.
    const camara = camaraBcfDesdeEscena({
      position: [0, 10, 0],
      target: [0, 0, 0],
      // Casi el eje -Z de la escena, con un residuo en la dirección de vista.
      up: [0, 0.05, -1],
      kind: "perspectiva",
    })!;

    const producto =
      camara.arriba[0] * camara.direccion[0] +
      camara.arriba[1] * camara.direccion[1] +
      camara.arriba[2] * camara.direccion[2];
    expect(Math.abs(producto)).toBeLessThan(1e-5);
    // Y sigue siendo unitario.
    expect(Math.abs(Math.hypot(...camara.arriba) - 1)).toBeLessThan(1e-5);
  });

  it("la vista en planta sale mirando hacia abajo en el IFC, no de lado", () => {
    // **El caso más común y el que más se nota**: el Modo 2D deja la cámara mirando recto hacia
    // abajo. En la escena eso es -Y; en el IFC tiene que ser -Z. Si se exportara sin convertir,
    // el BCF abriría mirando al horizonte.
    const camara = camaraBcfDesdeEscena({
      position: [5, 40, 5],
      target: [5, 0, 5],
      // Mirando hacia abajo, el «arriba» de la imagen es horizontal: acá, el -Z de la escena.
      up: [0, 0, -1],
      kind: "ortogonal",
      viewHeightM: 25,
    })!;

    cerca(camara.direccion, [0, 0, -1]);
    cerca(camara.punto, [5, -5, 40]);
    // Y el arriba de la imagen es el +Y del IFC: la convención con la que se dibuja una planta.
    cerca(camara.arriba, [0, 1, 0]);
  });

  it("la ortogonal lleva su alto de vista, que es lo que dice cuánto se ve", () => {
    const camara = camaraBcfDesdeEscena({
      position: [0, 40, 0],
      target: [0, 0, 0],
      up: [0, 0, -1],
      kind: "ortogonal",
      viewHeightM: 32.5,
    })!;

    expect(camara.tipo).toBe("ortogonal");
    expect(camara.escala).toBe(32.5);
    expect(camara.campoVisual).toBeUndefined();
  });

  it("una ortogonal sin alto de vista no se exporta", () => {
    // La posición diría desde dónde se mira y nada diría cuánto se ve: el otro extremo tendría que
    // inventar el encuadre. Mejor sin cámara.
    expect(
      camaraBcfDesdeEscena({
        position: [0, 40, 0],
        target: [0, 0, 0],
        up: [0, 0, -1],
        kind: "ortogonal",
      }),
    ).toBeNull();
  });

  it("no exporta nada si la cámara y su objetivo son el mismo punto", () => {
    expect(
      camaraBcfDesdeEscena({
        position: [3, 3, 3],
        target: [3, 3, 3],
        up: [0, 1, 0],
        kind: "perspectiva",
      }),
    ).toBeNull();
  });

  it("no exporta nada si el arriba es paralelo a la dirección", () => {
    // Es una cámara imposible, y casi siempre significa que quien la leyó pasó el eje vertical del
    // mundo en vez del giro real de la cámara. Inventar un arriba taparía ese error.
    expect(
      camaraBcfDesdeEscena({
        position: [0, 10, 0],
        target: [0, 0, 0],
        up: [0, 1, 0],
        kind: "perspectiva",
      }),
    ).toBeNull();
  });

  it("redondea la posición al milímetro y no arrastra ruido del float", () => {
    const camara = camaraBcfDesdeEscena({
      ...OBLICUA,
      position: [10.000000123456, 2.0004999, 3.1234567],
    })!;

    expect(camara.punto).toEqual([10, -3.123, 2]);
  });

  it("un campo visual imposible se omite en vez de exportarse", () => {
    // Un `FieldOfView` de 0 o de 200 grados no lo puede reproducir nadie; omitirlo deja que el
    // lector use el suyo, que es un encuadre razonable en vez de uno absurdo.
    for (const fov of [0, -10, 180, 400, Number.NaN]) {
      const camara = camaraBcfDesdeEscena({ ...OBLICUA, fieldOfViewDeg: fov })!;
      expect(camara.campoVisual).toBeUndefined();
    }
  });
});
