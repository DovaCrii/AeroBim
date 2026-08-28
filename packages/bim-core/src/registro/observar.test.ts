import { describe, expect, it } from "vitest";
import {
  nombreDeLoAbierto,
  rutasDeVuelta,
  tituloPropuesto,
  urlDeNuevaObservacion,
  type ObservableElement,
  type RegistryOrigin,
} from "./observar.js";

const ORIGEN: RegistryOrigin = {
  revisionId: "11111111-1111-1111-1111-111111111111",
  entregableId: "22222222-2222-2222-2222-222222222222",
  puedeObservar: true,
};

const VIGA: ObservableElement = {
  guid: "2x9ibDgrvAu8y4Yd$Ug4Qu",
  category: "IFCBEAM",
  name: "Viga H 300x150",
};

describe("urlDeNuevaObservacion", () => {
  it("apunta al formulario del entregable, con la revisión y el GUID", () => {
    const url = urlDeNuevaObservacion(ORIGEN, VIGA);

    expect(url).not.toBeNull();
    const { pathname, searchParams } = new URL(url as string, "https://ejemplo.test");
    // La ruta cuelga del **entregable**: el formulario vive ahí, no bajo la revisión.
    expect(pathname).toBe(`/documentos/entregables/${ORIGEN.entregableId}/observar/`);
    expect(searchParams.get("revision")).toBe(ORIGEN.revisionId);
    expect(searchParams.get("guid")).toBe(VIGA.guid);
  });

  it("usa los nombres de parámetro que el servidor lee, y no otros", () => {
    // **Es el contrato entero de esta función.** `ancla_pedida` en el otro lado lee exactamente
    // estas tres claves; renombrar una acá deja el ancla vacía sin que nada falle.
    const url = urlDeNuevaObservacion(ORIGEN, VIGA) as string;
    const claves = [...new URL(url, "https://ejemplo.test").searchParams.keys()].sort();

    expect(claves).toEqual(["guid", "revision", "titulo"]);
  });

  it("escapa un nombre con caracteres que cortarían la URL a mano", () => {
    // «Muro básico & tabique» es un nombre real de Revit, y con concatenación el `&` inventaría
    // un parámetro nuevo.
    const url = urlDeNuevaObservacion(ORIGEN, {
      guid: VIGA.guid,
      category: "IFCWALL",
      name: "Muro básico & tabique",
    }) as string;

    const parametros = new URL(url, "https://ejemplo.test").searchParams;
    expect(parametros.get("titulo")).toBe("IFCWALL · Muro básico & tabique");
    expect(parametros.get("guid")).toBe(VIGA.guid);
  });

  it("no lleva a ninguna parte si el modelo no vino del registro", () => {
    // Un archivo arrastrado del disco no tiene entregable donde colgar la observación.
    expect(urlDeNuevaObservacion(null, VIGA)).toBeNull();
  });

  it("no lleva a ninguna parte si el rol no puede abrir observaciones", () => {
    expect(urlDeNuevaObservacion({ ...ORIGEN, puedeObservar: false }, VIGA)).toBeNull();
  });

  it("no lleva a ninguna parte si el elemento no trae GUID", () => {
    // **Es el caso que importa.** Sin GUID el ancla no apunta a nada, y la observación quedaría
    // diciendo «algo en este modelo»: ni Solibri ni nadie puede seleccionar eso.
    expect(urlDeNuevaObservacion(ORIGEN, { ...VIGA, guid: null })).toBeNull();
  });

  it("no lleva a ninguna parte sin elemento seleccionado", () => {
    expect(urlDeNuevaObservacion(ORIGEN, null)).toBeNull();
  });
});

describe("tituloPropuesto", () => {
  it("junta categoría y nombre", () => {
    expect(tituloPropuesto(VIGA)).toBe("IFCBEAM · Viga H 300x150");
  });

  it("con solo uno de los dos, no deja un separador colgando", () => {
    expect(tituloPropuesto({ guid: null, category: "IFCBEAM", name: null })).toBe("IFCBEAM");
    expect(tituloPropuesto({ guid: null, category: null, name: "Viga" })).toBe("Viga");
  });

  it("un nombre en blanco cuenta como ausente", () => {
    // Los IFC del usuario traen elementos con `Name` en blanco, y un título « · » no dice nada.
    expect(tituloPropuesto({ guid: null, category: "IFCBEAM", name: "   " })).toBe("IFCBEAM");
  });

  it("sin categoría ni nombre queda vacío, y el enlace lo omite", () => {
    expect(tituloPropuesto({ guid: null, category: null, name: null })).toBe("");

    const url = urlDeNuevaObservacion(ORIGEN, { guid: VIGA.guid, category: null, name: null });
    expect(new URL(url as string, "https://ejemplo.test").searchParams.has("titulo")).toBe(false);
  });

  it("recorta al tope que acepta el formulario", () => {
    // El servidor recorta a 250 de todos modos; hacerlo acá evita mandar una URL de 2 KB por un
    // nombre de pset largo.
    const largo = tituloPropuesto({ guid: null, category: "IFCBEAM", name: "x".repeat(400) });
    expect(largo).toHaveLength(250);
  });
});

describe("urlDeNuevaObservacion con cámara", () => {
  const CAMARA = {
    tipo: "perspectiva" as const,
    punto: [10, -10, 10] as [number, number, number],
    direccion: [-0.57735, 0.57735, -0.57735] as [number, number, number],
    arriba: [-0.408248, 0.408248, 0.816497] as [number, number, number],
    campoVisual: 60,
  };

  it("la lleva como un solo parámetro, y vuelve entera al leerla", () => {
    // **Media cámara no se puede dibujar**: posición sin dirección no es un punto de vista. Va como
    // un dato y no como seis números sueltos para que el servidor no tenga que comprobar que
    // llegaron todos.
    const url = urlDeNuevaObservacion(ORIGEN, VIGA, CAMARA) as string;
    const crudo = new URL(url, "https://ejemplo.test").searchParams.get("camara");

    expect(crudo).not.toBeNull();
    expect(JSON.parse(crudo as string)).toEqual(CAMARA);
  });

  it("sin cámara, el parámetro no existe", () => {
    // Una observación sin cámara sigue valiendo: el BCF sale con el elemento seleccionado.
    const url = urlDeNuevaObservacion(ORIGEN, VIGA) as string;
    expect(new URL(url, "https://ejemplo.test").searchParams.has("camara")).toBe(false);
  });

  it("el GUID y el título siguen intactos con la cámara puesta", () => {
    const url = urlDeNuevaObservacion(ORIGEN, VIGA, CAMARA) as string;
    const parametros = new URL(url, "https://ejemplo.test").searchParams;

    expect(parametros.get("guid")).toBe(VIGA.guid);
    expect(parametros.get("titulo")).toBe("IFCBEAM · Viga H 300x150");
  });
});

describe("rutasDeVuelta", () => {
  const COMPLETO: RegistryOrigin = {
    ...ORIGEN,
    proyectoId: "33333333-3333-3333-3333-333333333333",
    proyectoCodigo: "716-LCD",
    entregableCodigo: "716-LCD-ES-M-001",
    revisionCorrelativo: "A1",
  };

  it("lleva a la obra y al expediente, en ese orden", () => {
    // De lo general a lo concreto: es como se lee una miga de pan, y es el orden en que uno sube
    // — del documento al proyecto.
    const vueltas = rutasDeVuelta(COMPLETO);

    expect(vueltas.map((v) => v.etiqueta)).toEqual(["716-LCD", "716-LCD-ES-M-001"]);
    expect(vueltas[0]!.href).toBe(`/proyectos/${COMPLETO.proyectoId}/`);
    expect(vueltas[1]!.href).toBe(`/documentos/entregables/${COMPLETO.entregableId}/`);
  });

  it("sin origen no hay a dónde volver, y eso no es un enlace roto", () => {
    // Un modelo abierto del disco no vino de ninguna parte: la cabecera no se dibuja.
    expect(rutasDeVuelta(null)).toEqual([]);
  });

  it("con datos a medias ofrece solo lo que puede cumplir", () => {
    // **Es el caso que importa.** Un `href` armado con un id que no llegó lleva a
    // `/proyectos/undefined/`, que es un 404 con aspecto de enlace bueno.
    const vueltas = rutasDeVuelta({ ...ORIGEN, entregableCodigo: "716-LCD-ES-M-001" });

    expect(vueltas.map((v) => v.etiqueta)).toEqual(["716-LCD-ES-M-001"]);
    expect(vueltas.every((v) => !v.href.includes("undefined"))).toBe(true);
  });

  it("sin ningún dato de vuelta no ofrece nada", () => {
    expect(rutasDeVuelta(ORIGEN)).toEqual([]);
  });
});

describe("nombreDeLoAbierto", () => {
  it("junta el entregable y la revisión", () => {
    expect(
      nombreDeLoAbierto({
        ...ORIGEN,
        entregableCodigo: "716-LCD-ES-M-001",
        revisionCorrelativo: "A1",
      }),
    ).toBe("716-LCD-ES-M-001 rev. A1");
  });

  it("con solo uno de los dos no deja un «rev.» colgando", () => {
    expect(nombreDeLoAbierto({ ...ORIGEN, entregableCodigo: "716-LCD-ES-M-001" })).toBe(
      "716-LCD-ES-M-001",
    );
    expect(nombreDeLoAbierto({ ...ORIGEN, revisionCorrelativo: "A1" })).toBe("rev. A1");
  });

  it("sin datos queda vacío, y sin origen también", () => {
    expect(nombreDeLoAbierto(ORIGEN)).toBe("");
    expect(nombreDeLoAbierto(null)).toBe("");
  });
});
