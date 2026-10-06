import { describe, expect, it } from "vitest";

import {
  cuentas,
  diasEntre,
  fechaCorta,
  filtrar,
  numerar,
  textoDePlazo,
  type ObservacionDeDocumento,
} from "./observaciones-panel.js";

function obs(id: string, parte: Partial<ObservacionDeDocumento> = {}): ObservacionDeDocumento {
  return {
    id,
    titulo: `Observación ${id}`,
    estado: "abierta",
    estadoTexto: "Abierta",
    prioridad: "media",
    responsable: "Ana",
    pagina: 1,
    x: 0.5,
    y: 0.5,
    url: `/documentos/observaciones/${id}/`,
    creada: "2026-10-01T10:00:00Z",
    vence: null,
    vencida: false,
    comentarios: 0,
    forma: null,
    x2: null,
    y2: null,
    ...parte,
  };
}

describe("numerar", () => {
  it("ordena por página, luego de arriba abajo y de izquierda a derecha", () => {
    const lista = [
      obs("c", { pagina: 2, y: 0.1 }),
      obs("a", { pagina: 1, y: 0.8 }),
      obs("b", { pagina: 1, y: 0.2, x: 0.9 }),
      obs("d", { pagina: 1, y: 0.2, x: 0.1 }),
    ];
    const n = numerar(lista);
    expect([n.get("d"), n.get("b"), n.get("a"), n.get("c")]).toEqual([1, 2, 3, 4]);
  });

  it("no depende del orden en que llegan", () => {
    const lista = [obs("a", { y: 0.1 }), obs("b", { y: 0.9 })];
    expect(numerar([...lista].reverse())).toEqual(numerar(lista));
  });
});

describe("filtrar y cuentas", () => {
  const lista = [
    obs("1"),
    obs("2", { estado: "respondida", estadoTexto: "Respondida" }),
    obs("3", { vencida: true, vence: "2026-09-30" }),
    obs("4", { estado: "cerrada", estadoTexto: "Cerrada" }),
    obs("5", { estado: "descartada", estadoTexto: "Descartada" }),
  ];

  it("abiertas es todo lo que no está cerrado ni descartado", () => {
    expect(filtrar(lista, "abiertas").map((o) => o.id)).toEqual(["1", "2", "3"]);
  });

  it("cerradas incluye las descartadas: tampoco piden nada a nadie", () => {
    expect(filtrar(lista, "cerradas").map((o) => o.id)).toEqual(["4", "5"]);
  });

  it("vencidas se fía de lo que dice el servidor", () => {
    expect(filtrar(lista, "vencidas").map((o) => o.id)).toEqual(["3"]);
  });

  it("las cuentas cuadran con los filtros", () => {
    expect(cuentas(lista)).toEqual({ todas: 5, abiertas: 3, vencidas: 1, cerradas: 2 });
  });
});

describe("fechas y plazo", () => {
  it("escribe la fecha corta sin mover el día por la zona horaria", () => {
    expect(fechaCorta("2026-10-01")).toBe("1 oct 2026");
    expect(fechaCorta("2026-12-31")).toBe("31 dic 2026");
    expect(fechaCorta("basura")).toBe("basura");
  });

  it("cuenta los días de calendario entre dos fechas", () => {
    expect(diasEntre("2026-09-30", "2026-10-05")).toBe(5);
    expect(diasEntre("2026-10-05", "2026-10-05")).toBe(0);
    expect(diasEntre("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("sin plazo no dice nada", () => {
    expect(textoDePlazo({ vence: null, vencida: false }, "2026-10-06")).toBeNull();
  });

  it("con plazo por venir dice solo la fecha", () => {
    expect(textoDePlazo({ vence: "2026-10-12", vencida: false }, "2026-10-06")).toBe(
      "vence 12 oct 2026",
    );
  });

  it("vencida dice cuántos días de atraso, y un día es «día»", () => {
    expect(textoDePlazo({ vence: "2026-10-05", vencida: true }, "2026-10-06")).toBe(
      "vence 5 oct 2026 · 1 día de atraso",
    );
    expect(textoDePlazo({ vence: "2026-09-30", vencida: true }, "2026-10-06")).toBe(
      "vence 30 sep 2026 · 6 días de atraso",
    );
  });
});
