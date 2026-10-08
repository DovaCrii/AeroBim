import { describe, expect, it } from "vitest";
import {
  buscar,
  numeroDeTema,
  ordenar,
  pasa,
  pasoDeSeguimiento,
  plano,
  type ObservacionDelModelo,
} from "./temas.js";

describe("numeroDeTema", () => {
  it("es la posición desde 1, con tres cifras", () => {
    expect(numeroDeTema(0)).toBe("001");
    expect(numeroDeTema(3)).toBe("004");
    expect(numeroDeTema(98)).toBe("099");
  });

  it("no se trunca cuando pasa de tres cifras", () => {
    expect(numeroDeTema(999)).toBe("1000");
  });
});

function tema(parcial: Partial<ObservacionDelModelo> & { id: string }): ObservacionDelModelo {
  return {
    titulo: "Sin título",
    guid: "0000000000000000000000",
    prioridad: "media",
    prioridadTexto: "Media",
    estado: "abierta",
    estadoTexto: "Abierta",
    responsable: "Ana Pérez",
    vence: null,
    vencida: false,
    camara: null,
    visibilidad: null,
    esInterferencia: false,
    contra: null,
    esMia: false,
    esNueva: false,
    url: "/documentos/observaciones/x/",
    ...parcial,
  };
}

const A = tema({
  id: "a",
  titulo: "Muro cortina × Conducto",
  prioridad: "alta",
  vence: "2026-10-20",
});
const B = tema({ id: "b", titulo: "Losa sin armadura", prioridad: "baja", vence: null });
const C = tema({
  id: "c",
  titulo: "Viga V-12",
  prioridad: "media",
  vence: "2026-10-10",
  esInterferencia: true,
  contra: "Conducto de extracción",
  esMia: true,
  esNueva: true,
  responsable: "Óscar Díaz",
});
const TODOS = [A, B, C];

describe("los filtros", () => {
  it("cada uno separa lo que dice", () => {
    expect(TODOS.filter((t) => pasa(t, "todas"))).toHaveLength(3);
    expect(TODOS.filter((t) => pasa(t, "nuevas")).map((t) => t.id)).toEqual(["c"]);
    expect(TODOS.filter((t) => pasa(t, "mias")).map((t) => t.id)).toEqual(["c"]);
    expect(TODOS.filter((t) => pasa(t, "interferencias")).map((t) => t.id)).toEqual(["c"]);
    expect(TODOS.filter((t) => pasa(t, "notas")).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("el texto sin tildes", () => {
  it("«Mías» y «mias» son la misma palabra", () => {
    expect(plano("Óscar DÍAZ")).toBe("oscar diaz");
  });
});

describe("la búsqueda", () => {
  it("una búsqueda vacía devuelve todo, y no copia: devuelve la misma lista", () => {
    expect(buscar(TODOS, "")).toBe(TODOS);
    expect(buscar(TODOS, "   ")).toBe(TODOS);
  });

  it("busca por palabras sueltas, en cualquier orden y sin tildes", () => {
    expect(buscar(TODOS, "conducto muro").map((t) => t.id)).toEqual(["a"]);
    expect(buscar(TODOS, "oscar").map((t) => t.id)).toEqual(["c"]);
  });

  it("encuentra por el otro elemento de una interferencia", () => {
    // El título de C no dice «extracción»; la pareja sí. Es lo que alguien recuerda del choque.
    expect(buscar(TODOS, "extraccion").map((t) => t.id)).toEqual(["c"]);
  });

  it("encuentra por GUID, que es lo que se pega desde otra herramienta", () => {
    const con = tema({ id: "g", guid: "3cUkl32yn9qRSPvBJVyWYp" });
    expect(buscar([A, con], "3cukl32yn9").map((t) => t.id)).toEqual(["g"]);
  });

  it("todas las palabras tienen que estar: una que no esté descarta el tema", () => {
    expect(buscar(TODOS, "muro viga")).toEqual([]);
  });
});

describe("el orden", () => {
  it("por prioridad, lo urgente primero; al revés, lo último primero", () => {
    expect(ordenar(TODOS, "prioridad", "asc").map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(ordenar(TODOS, "prioridad", "desc").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sin vencimiento va siempre al final, en los dos sentidos", () => {
    expect(ordenar(TODOS, "vence", "asc").map((t) => t.id)).toEqual(["c", "a", "b"]);
    // Al invertir, el que no tiene fecha **sigue** al final: no sube a ser el primero.
    expect(ordenar(TODOS, "vence", "desc").map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("por título, con las tildes y las mayúsculas sin molestar", () => {
    const raros = [
      tema({ id: "1", titulo: "árbol" }),
      tema({ id: "2", titulo: "Zócalo" }),
      tema({ id: "3", titulo: "Baño" }),
    ];
    expect(ordenar(raros, "titulo", "asc").map((t) => t.id)).toEqual(["1", "3", "2"]);
  });

  it("por tipo, las notas antes que los choques, y no toca la lista de entrada", () => {
    const entrada = [C, A, B];
    // Las dos notas empatan en el tipo y se desempata por título: «Losa…» antes que «Muro…».
    expect(ordenar(entrada, "tipo", "asc").map((t) => t.id)).toEqual(["b", "a", "c"]);
    expect(entrada.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("el empate se rompe por el título, así que el orden es estable", () => {
    const x = tema({ id: "x", titulo: "Beta", prioridad: "alta" });
    const y = tema({ id: "y", titulo: "Alfa", prioridad: "alta" });
    expect(ordenar([x, y], "prioridad", "asc").map((t) => t.id)).toEqual(["y", "x"]);
  });

  it("una prioridad desconocida va detrás de las conocidas", () => {
    const rara = tema({ id: "r", prioridad: "urgentisima" });
    expect(ordenar([rara, B], "prioridad", "asc").map((t) => t.id)).toEqual(["b", "r"]);
  });
});

describe("pasoDeSeguimiento", () => {
  it("abierta, respondida y cerrada son los pasos 1, 2 y 3", () => {
    expect(pasoDeSeguimiento("abierta")).toBe(1);
    expect(pasoDeSeguimiento("respondida")).toBe(2);
    expect(pasoDeSeguimiento("cerrada")).toBe(3);
  });

  it("una descartada o un estado desconocido no avanzan: 0", () => {
    expect(pasoDeSeguimiento("descartada")).toBe(0);
    expect(pasoDeSeguimiento("otra-cosa")).toBe(0);
  });
});
