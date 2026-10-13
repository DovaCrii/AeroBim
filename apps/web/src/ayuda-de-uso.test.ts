import { describe, expect, it } from "vitest";
import { ayudaDeUso, type EstadoDeAyuda } from "./ayuda-de-uso.js";

const base: EstadoDeAyuda = { modelos: 1, medida: null };
const gestos = (estado: EstadoDeAyuda) => ayudaDeUso(estado).map((a) => a.gesto);
const efectoDe = (estado: EstadoDeAyuda, gesto: string) =>
  ayudaDeUso(estado).find((a) => a.gesto === gesto)?.efecto;

describe("ayudaDeUso", () => {
  it("sin nada abierto invita a arrastrar un archivo", () => {
    const lista = ayudaDeUso({ modelos: 0, medida: null });
    expect(lista[0]).toMatchObject({ gesto: "Arrastrar un archivo" });
    expect(gestos({ modelos: 0, medida: null })).toContain("Abrir");
  });

  it("con un plano abierto y sin modelo ya no pide un archivo", () => {
    expect(gestos({ modelos: 0, medida: null, hayOtroContenido: true })).not.toContain(
      "Arrastrar un archivo",
    );
  });

  it("seleccionar: clic, doble clic, girar y rueda", () => {
    expect(gestos(base)).toEqual(["Clic izq.", "Doble clic", "Arrastrar", "Rueda"]);
    expect(efectoDe(base, "Doble clic")).toBe("Propiedades y acerca");
    expect(efectoDe({ ...base, seleccion: true }, "Clic izq.")).toBe("Cambia la selección");
  });

  it("arrastrar depende del modo de navegación de la cinta", () => {
    expect(efectoDe(base, "Arrastrar")).toBe("Gira la vista");
    expect(efectoDe({ ...base, navegacion: "Plan" }, "Arrastrar")).toBe("Desplaza la vista");
    expect(efectoDe({ ...base, navegacion: "FirstPerson" }, "Arrastrar")).toBe("Mira alrededor");
  });

  it("distancia y ángulo dicen cuántos puntos y cierran con Esc", () => {
    expect(efectoDe({ ...base, medida: "distance" }, "Clic izq.")).toContain("dos");
    expect(efectoDe({ ...base, medida: "angle" }, "Clic izq.")).toContain("tres");
    expect(gestos({ ...base, medida: "perpendicular" })).toContain("Esc");
  });

  it("área: Intro o doble clic cierra el contorno y Esc sale", () => {
    const lista = gestos({ ...base, medida: "area" });
    expect(lista).toContain("Intro o doble clic");
    expect(lista).toContain("Esc");
  });

  it("cortar: arrastrar el plano mueve el corte", () => {
    expect(gestos({ ...base, cortes: true })[0]).toBe("Arrastrar el plano");
  });

  it("trazando un perfil: clic pone punto, Generar termina y Esc cancela", () => {
    const lista = ayudaDeUso({ ...base, trazandoPerfil: true });
    expect(lista.map((a) => a.gesto).slice(0, 3)).toEqual(["Clic izq.", "Generar", "Esc"]);
    expect(lista[2]!.efecto).toBe("Cancela el trazado");
  });

  it("lámina 2D: rueda, arrastrar, flechas y medida de lámina", () => {
    const lista = gestos({ ...base, laminaEnVisor: true });
    expect(lista).toEqual(["Rueda", "← →", "Arrastrar", "Medir", "Esc"]);
  });

  it("modo 2D o planta: mueve la vista en vez de girarla", () => {
    const lista = gestos({ ...base, modo2D: true });
    expect(lista).toContain("Arrastrar");
    expect(efectoDe({ ...base, modo2D: true }, "Arrastrar")).toBe("Mueve la vista");
  });

  it("calzando un plano: Esc sale", () => {
    expect(gestos({ ...base, calzando: true })).toContain("Esc");
  });

  it("la lámina y el perfil mandan sobre la medida y el modo 2D", () => {
    expect(gestos({ ...base, medida: "distance", laminaEnVisor: true })).toContain("← →");
    expect(gestos({ ...base, modo2D: true, trazandoPerfil: true })).toContain("Generar");
  });

  it("toda herramienta activa muestra Esc entre los tres primeros, para que no se pliegue", () => {
    for (const medida of ["distance", "angle", "area", "perpendicular"] as const) {
      expect(gestos({ ...base, medida }).slice(0, 3)).toContain("Esc");
    }
    expect(gestos({ ...base, calzando: true }).slice(0, 3)).toContain("Esc");
    expect(gestos({ ...base, trazandoPerfil: true }).slice(0, 3)).toContain("Esc");
  });

  it("ningún gesto ni efecto va vacío ni en mayúsculas de título", () => {
    const estados: EstadoDeAyuda[] = [
      { modelos: 0, medida: null },
      base,
      { ...base, medida: "area" },
      { ...base, cortes: true },
      { ...base, trazandoPerfil: true },
      { ...base, laminaEnVisor: true },
      { ...base, modo2D: true },
      { ...base, calzando: true },
    ];
    for (const estado of estados) {
      for (const { gesto, efecto } of ayudaDeUso(estado)) {
        expect(gesto.length).toBeGreaterThan(0);
        expect(efecto.length).toBeGreaterThan(0);
        // sentence case: nada de «Sale De La Herramienta».
        expect(efecto).not.toMatch(/^\S+( [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){2,}/);
      }
    }
  });
});
