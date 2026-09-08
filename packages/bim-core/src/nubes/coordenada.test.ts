/**
 * La coordenada del levantamiento, escrita para leerla. `F12.14`.
 *
 * Lo que se fija aquí es lo que puede salir mal **sin dar error**: los separadores al revés en un
 * producto en español, o los dos separadores iguales por hacer el intercambio en dos pasos.
 */

import { describe, expect, it } from "vitest";
import { coordenadaComoTexto, numeroDeReplanteo } from "./coordenada.js";

/** Un punto real de la obra, en UTM 19S: lo que declara el COPC del CC 741. */
const EN_LA_OBRA: readonly [number, number, number] = [345678.9, 6298123.45, 412.3];

describe("el número de un replanteo", () => {
  it("lleva coma decimal y punto de miles", () => {
    expect(numeroDeReplanteo(6298123.45)).toBe("6.298.123,45");
  });

  it("y los dos separadores no salen iguales", () => {
    // **Es el defecto que este archivo existe para impedir.** Cambiar `,` por `.` y después `.` por
    // `,` deja «6,298,123,45», porque el segundo reemplazo pisa lo que hizo el primero.
    const escrito = numeroDeReplanteo(1234.5);

    expect(escrito).toBe("1.234,50");
    expect(escrito.split(",")).toHaveLength(2);
  });

  it("son siempre dos decimales, el centímetro", () => {
    expect(numeroDeReplanteo(412.3)).toBe("412,30");
    expect(numeroDeReplanteo(7)).toBe("7,00");
  });

  it("redondea al centímetro y no trunca", () => {
    expect(numeroDeReplanteo(0.126)).toBe("0,13");
  });

  it("un número negativo conserva su signo", () => {
    // Una cota bajo el nivel de referencia es negativa, y en obra eso es un socavón.
    expect(numeroDeReplanteo(-3.5)).toBe("-3,50");
  });
});

describe("la coordenada entera", () => {
  it("va con sus letras, no como tres números sueltos", () => {
    // Una terna sin etiquetas no se puede comprobar: quien recibe la observación tiene que poder
    // decir «ese norte no es de esta obra» sin adivinar en qué orden vinieron.
    expect(coordenadaComoTexto(EN_LA_OBRA)).toBe("E 345.678,90 · N 6.298.123,45 · Z 412,30");
  });

  it("y dice lo mismo que la versión de Python", () => {
    // **Hay dos implementaciones de esta regla**, una aquí y otra en `apps/documents/punto.py`, que
    // es la que escribe el `Description` del BCF. Esta prueba fija la cadena exacta que las dos
    // tienen que producir; la de allá fija la misma. Si alguien cambia una, la otra lo dice.
    expect(coordenadaComoTexto(EN_LA_OBRA)).toBe("E 345.678,90 · N 6.298.123,45 · Z 412,30");
  });
});
