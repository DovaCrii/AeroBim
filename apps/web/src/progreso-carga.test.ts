import { describe, expect, it } from "vitest";

import {
  DescargaAtascada,
  DescargaCancelada,
  DescargaHttp,
  descargarConProgreso,
  formatoDuracion,
  formatoMb,
  formatoVelocidad,
  fraccionDeDescarga,
  resumenDeCarga,
  segundosRestantes,
  textoDeDescarga,
  textoDeEtapa,
  totalCreible,
} from "./progreso-carga.js";

const MB = 1024 * 1024;

describe("formatos", () => {
  it("MB con coma decimal", () => {
    expect(formatoMb(12.3 * MB)).toBe("12,3 MB");
    expect(formatoMb(34.1 * MB)).toBe("34,1 MB");
    expect(formatoMb(250 * MB)).toBe("250 MB");
  });
  it("velocidad", () => {
    expect(formatoVelocidad(8 * MB, 10_000)).toBe("0,8 MB/s");
    expect(formatoVelocidad(10 * 1024, 10_000)).toBe("1 KB/s");
    expect(formatoVelocidad(0, 10_000)).toBeNull();
    expect(formatoVelocidad(MB, 100)).toBeNull();
  });
  it("duración", () => {
    expect(formatoDuracion(41_200)).toBe("41 s");
    expect(formatoDuracion(125_000)).toBe("2 min 5 s");
    expect(formatoDuracion(120_000)).toBe("2 min");
  });
});

describe("estimaciones", () => {
  it("segundos restantes al ritmo medio", () => {
    expect(segundosRestantes(10 * MB, 30 * MB, 10_000)).toBe(20);
    expect(segundosRestantes(10 * MB, null, 10_000)).toBeNull();
    expect(segundosRestantes(10 * MB, 5 * MB, 10_000)).toBeNull();
  });
  it("con compresión manda el tamaño declarado, no el Content-Length", () => {
    expect(totalCreible(5 * MB, 34 * MB, true, 0)).toBe(34 * MB);
    expect(totalCreible(34 * MB, null, false, 0)).toBe(34 * MB);
    expect(totalCreible(null, 34 * MB, false, 0)).toBe(34 * MB);
    expect(totalCreible(10 * MB, null, false, 11 * MB)).toBeNull();
  });
  it("fracción", () => {
    expect(fraccionDeDescarga(5, 10)).toBe(0.5);
    expect(fraccionDeDescarga(5, null)).toBeNull();
  });
});

describe("textos", () => {
  it("descarga con total", () => {
    const t = textoDeDescarga({
      recibidos: 8 * MB,
      total: 32 * MB,
      transcurridoMs: 10_000,
      sinAvanceMs: 0,
    });
    expect(t).toBe("Descargando 8,0 de 32,0 MB · 0,8 MB/s · quedan ~30 s");
  });
  it("sin total avisa si no avanza", () => {
    const t = textoDeDescarga({
      recibidos: 2 * MB,
      total: null,
      transcurridoMs: 30_000,
      sinAvanceMs: 20_000,
    });
    expect(t).toContain("Descargando 2,0 MB");
    expect(t).toContain("sin avance hace 20 s");
  });
  it("etapa con tiempo", () => {
    expect(textoDeEtapa("Convirtiendo", 1000, 24_000)).toBe("Convirtiendo… 23 s");
    expect(textoDeEtapa("Dibujando", null, 5)).toBe("Dibujando…");
  });
  it("resumen de la tarjeta", () => {
    expect(
      resumenDeCarga(
        {
          origen: "red",
          descargaMs: 41_000,
          bytes: 34.1 * MB,
          comprimido: false,
        },
        23_000,
      ),
    ).toBe("descarga 41 s · conversión 23 s · 34,1 MB (comprimido: no)");
    expect(
      resumenDeCarga(
        {
          origen: "cache",
          descargaMs: null,
          bytes: null,
          comprimido: null,
        },
        1200,
      ),
    ).toBe("desde la caché local · carga 1 s");
  });
});

function respuesta(trozos: Uint8Array[], cabeceras: Record<string, string> = {}): Response {
  let i = 0;
  const cuerpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < trozos.length) c.enqueue(trozos[i++]!);
      else c.close();
    },
  });
  return new Response(cuerpo, { headers: cabeceras });
}

describe("descargarConProgreso", () => {
  it("junta los trozos y avisa del avance", async () => {
    const avances: number[] = [];
    const r = await descargarConProgreso("/x", {
      controlador: new AbortController(),
      fetchFn: () =>
        Promise.resolve(
          respuesta([new Uint8Array([1, 2]), new Uint8Array([3])], { "Content-Length": "3" }),
        ),
      onProgreso: (e) => avances.push(e.recibidos),
    });
    expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(r.total).toBe(3);
    expect(r.comprimido).toBe(false);
    expect(avances.at(-1)).toBe(3);
  });
  it("detecta Content-Encoding", async () => {
    const r = await descargarConProgreso("/x", {
      controlador: new AbortController(),
      tamanoDeclarado: 3,
      fetchFn: () =>
        Promise.resolve(respuesta([new Uint8Array([1, 2, 3])], { "Content-Encoding": "gzip" })),
    });
    expect(r.comprimido).toBe(true);
    expect(r.total).toBe(3);
  });
  it("un 403 es DescargaHttp", async () => {
    await expect(
      descargarConProgreso("/x", {
        controlador: new AbortController(),
        fetchFn: () => Promise.resolve(new Response("no", { status: 403 })),
      }),
    ).rejects.toBeInstanceOf(DescargaHttp);
  });
  it("un cuerpo que no avanza se da por atascado", async () => {
    const colgada = new Response(
      new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) }),
    );
    await expect(
      descargarConProgreso("/x", {
        controlador: new AbortController(),
        limiteSinAvanceMs: 80,
        fetchFn: () => Promise.resolve(colgada),
      }),
    ).rejects.toBeInstanceOf(DescargaAtascada);
  });
  it("cancelar aborta", async () => {
    const controlador = new AbortController();
    const p = descargarConProgreso("/x", {
      controlador,
      fetchFn: (_u, init) =>
        new Promise((_ok, no) => {
          init?.signal?.addEventListener("abort", () => no(new DOMException("a", "AbortError")));
        }),
    });
    controlador.abort();
    await expect(p).rejects.toBeInstanceOf(DescargaCancelada);
  });
});
