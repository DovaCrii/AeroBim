/**
 * Qué punto de la nube se señala. `F2.2`, `F12.14`.
 *
 * **La prueba existe por un defecto que el usuario notó y el diagnóstico tenía medido sin llamarlo
 * defecto:** «está fallando al pickear el punto al que quiero dejar» la nota, y en el registro del
 * modo `nube`, «devolvió un punto a 0 mm del rayo **y a 18,10 m del punto al que se apuntó**» con la
 * nota «lo segundo es normal». No era normal.
 *
 * El primer caso de esta prueba es exactamente esa situación, en pequeño.
 */

import { describe, expect, it } from "vitest";
import { masCercanoAlCursor, RADIO_EN_PIXELES, type Candidato } from "./senalar.js";

/** Un candidato, escrito corto: dónde cae en pantalla, a qué profundidad, y cómo se llama. */
const c = (px: number, py: number, profundidad: number, nombre: string): Candidato<string> => ({
  pixel: [px, py],
  profundidad,
  golpe: nombre,
});

describe("el punto que se señala", () => {
  it("**no es el de delante si no está debajo del cursor** — el defecto", () => {
    // El de delante, pero a treinta píxeles del cursor: es el punto suelto que rozaba la línea de
    // visión y ganaba por estar más cerca de la cámara. Con el criterio de antes salía este.
    const suelto = c(130, 100, 12, "suelto a 18 m por delante");
    // Y el que se estaba mirando: justo bajo el cursor, más lejos.
    const mirado = c(101, 100, 30, "el que se apuntaba");

    expect(masCercanoAlCursor([suelto, mirado], [100, 100])?.golpe).toBe("el que se apuntaba");
  });

  it("y entre dos que sí están debajo del cursor, el de delante", () => {
    // Esta mitad del criterio anterior era correcta y se conserva: dos puntos en la misma dirección
    // de mirada son una superficie delante de otra, y se señala la de delante.
    const delante = c(102, 101, 10, "la superficie de delante");
    const detras = c(100, 100, 40, "el fondo");

    expect(masCercanoAlCursor([delante, detras], [100, 100])?.golpe).toBe(
      "la superficie de delante",
    );
  });

  it("acepta hasta el radio y no más", () => {
    const justo = c(100 + RADIO_EN_PIXELES, 100, 50, "en el borde del radio");
    expect(masCercanoAlCursor([justo], [100, 100])?.golpe).toBe("en el borde del radio");

    // Uno a un pixel mas alla del radio ya no cuenta como «debajo del cursor»: entra por el otro
    // camino, el de la holgura, y por eso sigue saliendo. Lo que no puede es ganarle a uno que si
    // este dentro.
    const fuera = c(100 + RADIO_EN_PIXELES + 1, 100, 1, "fuera del radio y muy delante");
    const dentro = c(100, 100, 99, "dentro del radio y al fondo");
    expect(masCercanoAlCursor([fuera, dentro], [100, 100])?.golpe).toBe(
      "dentro del radio y al fondo",
    );
  });

  it("en zona rala estira el radio, y ahí manda la distancia al cursor", () => {
    // **La parte que hace usable un levantamiento.** Donde los puntos están a más de seis píxeles
    // unos de otros, exigir el radio devolvería `null` y el clic se perdería sin decir nada.
    const cerca = c(112, 100, 80, "a doce pixeles");
    const lejos = c(118, 100, 5, "a dieciocho pixeles, pero delante");

    // Aquí gana la distancia al cursor y **no** la profundidad: ya no se pregunta «cuál de los que
    // veo debajo» sino «a qué apuntaba».
    expect(masCercanoAlCursor([cerca, lejos], [100, 100])?.golpe).toBe("a doce pixeles");
  });

  it("y pasada la holgura no devuelve nada, en vez de inventar", () => {
    // Devolver un punto que está a cien píxeles sería poner la nota en otro sitio y no avisar, que
    // es peor que no ponerla: quien mira vuelve a pinchar.
    const muyLejos = c(200, 200, 1, "a cien pixeles");
    expect(masCercanoAlCursor([muyLejos], [100, 100])).toBeNull();
  });

  it("sin candidatos, nada", () => {
    expect(masCercanoAlCursor([], [100, 100])).toBeNull();
  });
});
