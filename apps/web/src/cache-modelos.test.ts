import { describe, expect, it } from "vitest";

import {
  hayEntradasDeOtroUsuario,
  huellaDeArchivo,
  NOMBRE_DB,
  planificarExpulsion,
  TOPE_MAXIMO_BYTES,
  topeDeCache,
  type EntradaDeIndice,
} from "./cache-modelos.js";

const e = (revisionId: string, bytes: number, ultimoUso: number): EntradaDeIndice => ({
  revisionId,
  huella: "h",
  nombre: revisionId,
  bytes,
  ultimoUso,
});

describe("hayEntradasDeOtroUsuario", () => {
  const de = (usuarioId?: string): EntradaDeIndice => ({
    ...e("r", 1, 1),
    ...(usuarioId === undefined ? {} : { usuarioId }),
  });
  it("una caché vacía o toda del mismo usuario se conserva", () => {
    expect(hayEntradasDeOtroUsuario([], "7")).toBe(false);
    expect(hayEntradasDeOtroUsuario([de("7"), de("7")], "7")).toBe(false);
  });
  it("una entrada de otro usuario, o sin dueño, obliga a vaciar", () => {
    expect(hayEntradasDeOtroUsuario([de("7"), de("8")], "7")).toBe(true);
    expect(hayEntradasDeOtroUsuario([de()], "7")).toBe(true);
  });
});

describe("guion de salida del portal", () => {
  it("borra la misma base que usa la caché y no depende de nada externo", async () => {
    const { readFileSync } = await import("node:fs");
    const ruta = new URL(
      "../../../services/api/static/js/vaciar-cache-al-salir.js",
      import.meta.url,
    );
    const guion = readFileSync(ruta, "utf-8");
    expect(guion).toContain(`var NOMBRE_DB = "${NOMBRE_DB}";`);
    expect(guion).toContain("deleteDatabase");
    expect(guion).not.toMatch(/https?:\/\//);
  });
});

describe("huellaDeArchivo", () => {
  it("une sha256 y tamaño; sin alguno de los dos no hay huella", () => {
    expect(huellaDeArchivo("abc", 10)).toBe("abc:10");
    expect(huellaDeArchivo(undefined, 10)).toBeNull();
    expect(huellaDeArchivo("", 10)).toBeNull();
    expect(huellaDeArchivo("abc", undefined)).toBeNull();
    expect(huellaDeArchivo("abc", 0)).toBeNull();
  });
});

describe("topeDeCache", () => {
  it("1 GB, o la mitad de la cuota si es menor", () => {
    expect(topeDeCache(null)).toBe(TOPE_MAXIMO_BYTES);
    expect(topeDeCache(100 * 1024 ** 3)).toBe(TOPE_MAXIMO_BYTES);
    expect(topeDeCache(600 * 1024 * 1024)).toBe(300 * 1024 * 1024);
    expect(topeDeCache(0)).toBe(TOPE_MAXIMO_BYTES);
  });
});

describe("planificarExpulsion", () => {
  it("no expulsa nada si cabe", () => {
    expect(planificarExpulsion([e("a", 10, 1)], "n", 10, 100)).toEqual([]);
  });
  it("expulsa del más antiguo al más nuevo hasta que quepa", () => {
    const indice = [e("nuevo", 40, 30), e("viejo", 40, 10), e("medio", 40, 20)];
    expect(planificarExpulsion(indice, "x", 50, 100)).toEqual(["viejo", "medio"]);
  });
  it("no cuenta la entrada que se reemplaza", () => {
    expect(planificarExpulsion([e("a", 90, 1)], "a", 90, 100)).toEqual([]);
  });
  it("si la nueva sola no cabe, no se guarda", () => {
    expect(planificarExpulsion([], "n", 101, 100)).toBeNull();
  });
});
