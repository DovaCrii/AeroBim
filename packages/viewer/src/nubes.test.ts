import { afterEach, describe, expect, it, vi } from "vitest";

import { lectorPorRango, PIXELES_MINIMOS, PUNTOS_DEL_PRIMER_PINTADO } from "./nubes.js";

/**
 * **Lo que hace que COPC sirva es que se lea por partes**, y eso vive en una función de seis líneas
 * que nadie estaba comprobando: la única prueba era mirar la pestaña de red del navegador a mano.
 *
 * Un servidor que ignore `Range` y devuelva el archivo entero haría que todo pareciera funcionar
 * mientras descarga gigas, así que el aviso está escrito en el módulo — pero lo que sí se puede fijar
 * en el gate es **que la petición se haga bien**: la cabecera, el rango cerrado, y que un error no
 * pase por bytes buenos.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Un `fetch` de mentira que anota lo que se le pidió. */
function fetchDeMentira(respuesta: Partial<Response> & { ok: boolean; status: number }) {
  const llamadas: { url: string; rango: string | undefined }[] = [];
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const cabeceras = (init?.headers ?? {}) as Record<string, string>;
    llamadas.push({ url: String(url), rango: cabeceras["Range"] });
    return {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      ...respuesta,
    } as Response;
  }) as unknown as typeof fetch;
  return llamadas;
}

describe("lectorPorRango", () => {
  it("pide un rango, y no el archivo entero", () => {
    const llamadas = fetchDeMentira({ ok: true, status: 206 });
    const leer = lectorPorRango("/samples/nube.copc.laz");
    return leer(0, 100).then(() => {
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]?.url).toBe("/samples/nube.copc.laz");
      expect(llamadas[0]?.rango).toBeDefined();
    });
  });

  it("**el rango es cerrado y no cuenta un byte de mas**", async () => {
    // `Range` en HTTP es inclusivo en los dos extremos y `copc` pide `[inicio, fin)`. Pedir
    // `bytes=0-100` cuando se quieren 100 bytes trae 101, y ese byte de más desplaza todo lo que
    // venga detrás: el nodo siguiente se descomprime con basura al principio.
    const llamadas = fetchDeMentira({ ok: true, status: 206 });
    const leer = lectorPorRango("/nube.laz");
    await leer(0, 100);
    expect(llamadas[0]?.rango).toBe("bytes=0-99");

    await leer(1000, 1010);
    expect(llamadas[1]?.rango).toBe("bytes=1000-1009");
  });

  it("devuelve los bytes como Uint8Array", async () => {
    fetchDeMentira({ ok: true, status: 206 });
    const bytes = await lectorPorRango("/nube.laz")(0, 3);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("un error del servidor levanta con el codigo, y no pasa por bytes buenos", async () => {
    // Sin esto, un 404 devolvería el cuerpo de la página de error y `copc` intentaría
    // descomprimirlo: el fallo aparecería como «el archivo esta corrupto», que manda a mirar donde
    // no es.
    fetchDeMentira({ ok: false, status: 404 });
    await expect(lectorPorRango("/no-existe.laz")(0, 10)).rejects.toThrow(/404/);
    await expect(lectorPorRango("/no-existe.laz")(0, 10)).rejects.toThrow(/no-existe\.laz/);
  });

  it("un 416 —rango no satisfacible— tambien levanta", async () => {
    fetchDeMentira({ ok: false, status: 416 });
    await expect(lectorPorRango("/nube.laz")(0, 10)).rejects.toThrow(/416/);
  });
});

describe("los valores que se eligieron midiendo", () => {
  it("el minimo de pixeles no es 1", () => {
    // Con 1 —el mínimo teórico— la selección traía 6 378 nodos para una imagen idéntica y tardaba
    // 19 s. Si alguien lo baja «porque es más correcto», esta prueba dice por qué no.
    expect(PIXELES_MINIMOS).toBeGreaterThan(1);
    expect(PIXELES_MINIMOS).toBe(16);
  });

  it("el primer pintado no llena el presupuesto", () => {
    // Sin tope, abrir la nube del proyecto eran 8,9 millones de puntos y 7,8 s de pantalla vacía.
    expect(PUNTOS_DEL_PRIMER_PINTADO).toBeLessThan(8_000_000);
    expect(PUNTOS_DEL_PRIMER_PINTADO).toBe(1_500_000);
  });
});
