import { describe, expect, it } from "vitest";

import {
  avisoDeRespuesta,
  haceCuanto,
  idsMencionados,
  insertarMencion,
  mencionEnCurso,
  partirPorMenciones,
  sugerencias,
} from "./hilo.js";

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

  it("un mencionado avisado cuenta: no se dice «no había a quién» habiéndolo avisado", () => {
    expect(avisoDeRespuesta([], ["marcos@obra.cl"])).toBeNull();
    expect(avisoDeRespuesta([], [])).toMatch(/No había a quién avisar/);
  });

  it("si falló el aviso de la mención se dice, aunque el del hilo saliera", () => {
    expect(avisoDeRespuesta(["ana@obra.cl"], null)).toMatch(/a quien mencionaste/);
  });
});

const GENTE = [
  { id: 1, nombre: "Ana Soto" },
  { id: 2, nombre: "Mariana Díaz" },
  { id: 3, nombre: "Marcos Ríos" },
  { id: 4, nombre: "Luis Soto" },
];

describe("mencionEnCurso", () => {
  it("detecta la mención que se está escribiendo justo antes del cursor", () => {
    expect(mencionEnCurso("hola @Mar", 9)).toEqual({ inicio: 5, termino: "Mar" });
    expect(mencionEnCurso("@", 1)).toEqual({ inicio: 0, termino: "" });
    expect(mencionEnCurso("hola @", 6)).toEqual({ inicio: 5, termino: "" });
  });

  it("no hay mención si hay un espacio entre la @ y el cursor, o si la @ está dentro de una palabra", () => {
    expect(mencionEnCurso("hola @Ana y", 11)).toBeNull();
    expect(mencionEnCurso("escribe a ana@obra.cl", 21)).toBeNull();
    expect(mencionEnCurso("sin arroba", 10)).toBeNull();
  });

  it("solo mira lo que hay antes del cursor", () => {
    expect(mencionEnCurso("hola @Mar y más", 9)).toEqual({ inicio: 5, termino: "Mar" });
  });
});

describe("sugerencias", () => {
  it("los que empiezan por lo escrito van antes que los que lo contienen", () => {
    expect(sugerencias(GENTE, "mar").map((p) => p.id)).toEqual([2, 3]);
    expect(sugerencias(GENTE, "soto").map((p) => p.id)).toEqual([1, 4]);
  });

  it("no distingue mayúsculas ni acentos", () => {
    expect(sugerencias(GENTE, "RIOS").map((p) => p.id)).toEqual([3]);
    expect(sugerencias(GENTE, "diaz").map((p) => p.id)).toEqual([2]);
  });

  it("con la arroba sola salen los primeros, y respeta el máximo", () => {
    expect(sugerencias(GENTE, "", 2).map((p) => p.id)).toEqual([1, 2]);
  });

  it("sin coincidencias no ofrece nada", () => {
    expect(sugerencias(GENTE, "zzz")).toEqual([]);
  });
});

describe("insertarMencion", () => {
  it("reemplaza lo escrito desde la @ por el nombre, y deja el cursor tras el espacio", () => {
    const enCurso = mencionEnCurso("hola @Mar y más", 9)!;
    const r = insertarMencion("hola @Mar y más", 9, enCurso, "Mariana Díaz");
    expect(r.texto).toBe("hola @Mariana Díaz  y más");
    expect(r.cursor).toBe("hola @Mariana Díaz ".length);
  });
});

describe("idsMencionados", () => {
  const elegidos = new Map([
    [1, "Ana Soto"],
    [3, "Marcos Ríos"],
  ]);

  it("solo cuentan los que siguen escritos en el mensaje", () => {
    expect(idsMencionados("@Ana Soto, mira esto", elegidos)).toEqual([1]);
    expect(idsMencionados("@Ana Soto y @Marcos Ríos", elegidos)).toEqual([1, 3]);
  });

  it("si se borra la mención, ya no se avisa", () => {
    expect(idsMencionados("mira esto", elegidos)).toEqual([]);
  });
});

describe("partirPorMenciones", () => {
  it("separa las menciones conocidas del resto del texto", () => {
    expect(partirPorMenciones("hola @Ana Soto, ¿puedes?", ["Ana Soto"])).toEqual([
      { texto: "hola ", mencion: false },
      { texto: "@Ana Soto", mencion: true },
      { texto: ", ¿puedes?", mencion: false },
    ]);
  });

  it("la larga gana a la corta: «Ana Soto» no se queda en «Ana»", () => {
    const trozos = partirPorMenciones("@Ana Soto", ["Ana", "Ana Soto"]);
    expect(trozos).toEqual([{ texto: "@Ana Soto", mencion: true }]);
  });

  it("un nombre con caracteres de regex no rompe", () => {
    expect(partirPorMenciones("@J. (Pepe)", ["J. (Pepe)"])).toEqual([
      { texto: "@J. (Pepe)", mencion: true },
    ]);
  });

  it("lo que parece mención pero no es de nadie conocido queda como texto", () => {
    expect(partirPorMenciones("hola @Desconocido", ["Ana Soto"])).toEqual([
      { texto: "hola @Desconocido", mencion: false },
    ]);
  });

  it("sin gente conocida todo es texto", () => {
    expect(partirPorMenciones("hola @Ana", [])).toEqual([{ texto: "hola @Ana", mencion: false }]);
  });
});
