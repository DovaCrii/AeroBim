import { describe, expect, it } from "vitest";

import { avisoDeRespuesta, haceCuanto } from "./hilo.js";

const AHORA = Date.parse("2026-10-06T12:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe("haceCuanto", () => {
  it("dice «hace un momento» dentro del primer minuto", () => {
    expect(haceCuanto(hace(20_000), AHORA)).toBe("hace un momento");
  });

  it("cuenta minutos, horas y días", () => {
    expect(haceCuanto(hace(5 * MIN), AHORA)).toBe("hace 5 min");
    expect(haceCuanto(hace(59 * MIN), AHORA)).toBe("hace 59 min");
    expect(haceCuanto(hace(60 * MIN), AHORA)).toBe("hace 1 h");
    expect(haceCuanto(hace(23 * H), AHORA)).toBe("hace 23 h");
    expect(haceCuanto(hace(24 * H), AHORA)).toBe("hace 1 d");
    expect(haceCuanto(hace(29 * D), AHORA)).toBe("hace 29 d");
  });

  it("pasado un mes da la fecha corta", () => {
    expect(haceCuanto("2026-08-20T10:00:00Z", AHORA)).toBe("20 ago 2026");
  });

  it("un mensaje «del futuro» —relojes que no cuadran— no da un número negativo", () => {
    expect(haceCuanto(hace(-5 * MIN), AHORA)).toBe("hace un momento");
  });

  it("una fecha ilegible no rompe: no dice nada", () => {
    expect(haceCuanto("ayer", AHORA)).toBe("");
  });
});

describe("avisoDeRespuesta", () => {
  it("distingue el aviso que falló, el que no tenía a quién y el que salió", () => {
    expect(avisoDeRespuesta(null)).toMatch(/no se pudo enviar/);
    expect(avisoDeRespuesta([])).toMatch(/No había a quién avisar/);
    expect(avisoDeRespuesta(["ana@obra.cl"])).toBeNull();
  });
});
