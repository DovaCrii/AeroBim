import { describe, expect, it } from "vitest";
import { parseSavedViews, readSavedView, type SavedView } from "./savedView.js";

/** Una vista completa y válida, como la que guarda el visor. */
const VISTA: SavedView = {
  id: "v1",
  name: "Cubierta desde el sur",
  savedAt: "2026-08-19T15:00:00.000Z",
  camera: {
    position: [10, 8, 12],
    target: [0, 1.5, 0],
    projection: "Perspective",
    navigation: "Orbit",
  },
  hiddenByModel: { "Piso 5.ifc": [12, 34] },
  sections: [{ normal: [0, 1, 0], origin: [0, 3, 0] }],
};

describe("readSavedView", () => {
  it("lee una vista completa sin cambiarla", () => {
    expect(readSavedView(JSON.parse(JSON.stringify(VISTA)))).toEqual(VISTA);
  });

  it("acepta una vista sin cortes y sin nada oculto: eso no es estar corrupta", () => {
    const minima = { name: "Vista general", camera: VISTA.camera };
    const leida = readSavedView(minima);

    expect(leida?.name).toBe("Vista general");
    expect(leida?.sections).toEqual([]);
    expect(leida?.hiddenByModel).toEqual({});
  });

  it("rechaza lo que no tiene nombre o no tiene cámara: sin eso no es una vista", () => {
    expect(readSavedView({ camera: VISTA.camera })).toBeNull();
    expect(readSavedView({ name: "   ", camera: VISTA.camera })).toBeNull();
    expect(readSavedView({ name: "Sin cámara" })).toBeNull();
    expect(readSavedView(null)).toBeNull();
    expect(readSavedView("una cadena")).toBeNull();
  });

  it("rechaza una cámara con coordenadas que no son puntos", () => {
    const mala = { ...VISTA, camera: { ...VISTA.camera, position: [1, 2] } };
    expect(readSavedView(mala)).toBeNull();

    const conNaN = { ...VISTA, camera: { ...VISTA.camera, target: [0, Number.NaN, 0] } };
    expect(readSavedView(conNaN)).toBeNull();
  });

  it("rechaza una proyección o una navegación que no existen", () => {
    expect(
      readSavedView({ ...VISTA, camera: { ...VISTA.camera, projection: "Isometrica" } }),
    ).toBeNull();
    expect(
      readSavedView({ ...VISTA, camera: { ...VISTA.camera, navigation: "Volando" } }),
    ).toBeNull();
  });

  it("descarta los cortes mal formados y conserva los buenos", () => {
    const mezcla = {
      ...VISTA,
      sections: [
        { normal: [1, 0, 0], origin: [0, 0, 0] },
        { normal: "arriba", origin: [0, 0, 0] },
        { origin: [0, 0, 0] },
      ],
    };

    expect(readSavedView(mezcla)?.sections).toEqual([{ normal: [1, 0, 0], origin: [0, 0, 0] }]);
  });

  it("limpia lo oculto: solo identificadores enteros", () => {
    const sucio = { ...VISTA, hiddenByModel: { "a.ifc": [1, "dos", 3.5, 4], "b.ifc": "nada" } };
    expect(readSavedView(sucio)?.hiddenByModel).toEqual({ "a.ifc": [1, 4] });
  });
});

describe("parseSavedViews", () => {
  it("lee la colección guardada", () => {
    const guardado = JSON.stringify([VISTA, { ...VISTA, id: "v2", name: "Planta baja" }]);
    expect(parseSavedViews(guardado).map((v) => v.name)).toEqual([
      "Cubierta desde el sur",
      "Planta baja",
    ]);
  });

  it("no lanza con un texto que no es JSON: lo de fuera puede venir roto", () => {
    // Es lo que hay en el almacenamiento del navegador tras una escritura interrumpida.
    expect(parseSavedViews('[{"name":"a medio')).toEqual([]);
    expect(parseSavedViews("")).toEqual([]);
    expect(parseSavedViews("null")).toEqual([]);
    expect(parseSavedViews('{"no":"es una lista"}')).toEqual([]);
  });

  it("conserva las vistas legibles y descarta las que no lo son", () => {
    const mezcla = JSON.stringify([VISTA, { name: "sin cámara" }, 42, null]);
    expect(parseSavedViews(mezcla)).toHaveLength(1);
  });
});
