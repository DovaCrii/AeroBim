import { describe, expect, it } from "vitest";
import {
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
