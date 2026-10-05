import { describe, expect, it } from "vitest";
import {
  ESPACIOS,
  GRUPOS_OCULTOS,
  SECCIONES_OCULTAS,
  botonDe,
  elOtro,
  espacioDeUnArchivo,
  espacioParaVerSeccion,
  espacioPedido,
  seccionVisible,
} from "./espacios.js";

describe("los dos espacios", () => {
  it("el otro de uno es el otro, y dos veces es el mismo", () => {
    expect(elOtro("modelo")).toBe("planos");
    expect(elOtro("planos")).toBe("modelo");
    for (const e of ESPACIOS) expect(elOtro(elOtro(e))).toBe(e);
  });

  it("toda sección se ve al menos en un espacio: ninguna capacidad queda sin sitio", () => {
    // Es la razón de declarar lo oculto: si una clave estuviera oculta en los dos, esa capacidad
    // desaparecería de la aplicación sin que nada fallara.
    const enLosDos = SECCIONES_OCULTAS.modelo.filter((c) => SECCIONES_OCULTAS.planos.includes(c));
    expect(enLosDos).toEqual([]);
  });

  it("Planos y perfiles conserva lo que sirve para comparar con el modelo", () => {
    expect(seccionVisible("planos", "modelos")).toBe(true);
    expect(seccionVisible("planos", "generados")).toBe(true);
    expect(seccionVisible("planos", "cotas")).toBe(true);
    expect(seccionVisible("planos", "estructura")).toBe(false);
  });

  it("Modelo 3D deja fuera los planos 2D y los generados, y conserva el resto", () => {
    expect(seccionVisible("modelo", "planos")).toBe(false);
    expect(seccionVisible("modelo", "generados")).toBe(false);
    expect(seccionVisible("modelo", "estructura")).toBe(true);
    expect(seccionVisible("modelo", "nubes")).toBe(true);
  });

  it("los cortes y observar son del 3D", () => {
    expect(GRUPOS_OCULTOS.planos).toContain("Cortes");
    expect(GRUPOS_OCULTOS.planos).toContain("Coordinar");
  });

  it("documentar —generar un plano, trazar un eje— es del espacio de planos", () => {
    expect(GRUPOS_OCULTOS.modelo).toContain("Documentar");
    expect(GRUPOS_OCULTOS.planos).not.toContain("Documentar");
  });

  it("Modo 2D y Comparar se ocultan en el 3D por su botón y no por el grupo, que conserva los ejes", () => {
    expect(GRUPOS_OCULTOS.modelo).toContain(botonDe("Modo 2D"));
    expect(GRUPOS_OCULTOS.modelo).toContain(botonDe("Comparar"));
    expect(GRUPOS_OCULTOS.modelo).not.toContain("Referencias");
    expect(GRUPOS_OCULTOS.planos).not.toContain(botonDe("Comparar"));
  });

  it("ningún grupo ni botón queda oculto en los dos espacios: no desaparece una herramienta", () => {
    const enLosDos = GRUPOS_OCULTOS.modelo.filter((g) => GRUPOS_OCULTOS.planos.includes(g));
    expect(enLosDos).toEqual([]);
  });
});

describe("a qué espacio hay que ir para ver una sección", () => {
  it("si ya se ve donde se está, no se mueve a nadie", () => {
    expect(espacioParaVerSeccion("modelo", "estructura")).toBe("modelo");
    expect(espacioParaVerSeccion("planos", "generados")).toBe("planos");
    // «Modelos abiertos» se ve en los dos: quien está en planos se queda en planos.
    expect(espacioParaVerSeccion("planos", "modelos")).toBe("planos");
  });

  it("si no se ve donde se está, va al otro", () => {
    expect(espacioParaVerSeccion("modelo", "generados")).toBe("planos");
    expect(espacioParaVerSeccion("modelo", "planos")).toBe("planos");
    expect(espacioParaVerSeccion("planos", "calce")).toBe("modelo");
  });

  it("una sección que no existe se queda donde está", () => {
    // Una clave desconocida se ve en los dos (nada la oculta), así que tampoco hay cambio.
    expect(espacioParaVerSeccion("modelo", "no-existe")).toBe("modelo");
    expect(espacioParaVerSeccion("planos", "no-existe")).toBe("planos");
  });
});

describe("el espacio que pide la dirección", () => {
  it("?espacio=planos abre Planos y perfiles", () => {
    expect(espacioPedido("?espacio=planos")).toBe("planos");
    expect(espacioPedido("?revision=abc&espacio=planos")).toBe("planos");
  });

  it("sin parámetro, o con uno que no se entiende, es el 3D", () => {
    expect(espacioPedido("")).toBe("modelo");
    expect(espacioPedido("?espacio=modelo")).toBe("modelo");
    expect(espacioPedido("?espacio=otra-cosa")).toBe("modelo");
    expect(espacioPedido("?espacio=PLANOS")).toBe("modelo");
  });
});

describe("el espacio de un archivo que se abre", () => {
  it("un DXF es un plano y lleva a Planos y perfiles, con cualquier mayúscula", () => {
    expect(espacioDeUnArchivo("ACAD-Piso 5_Base.dxf")).toBe("planos");
    expect(espacioDeUnArchivo("PLANTA.DXF")).toBe("planos");
  });

  it("un IFC, una nube o un archivo raro no mueven a nadie", () => {
    expect(espacioDeUnArchivo("Piso 5.ifc")).toBeNull();
    expect(espacioDeUnArchivo("camino.copc.laz")).toBeNull();
    expect(espacioDeUnArchivo("dxf")).toBeNull();
  });
});
