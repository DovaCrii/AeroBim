import { describe, expect, it } from "vitest";
import {
  countIfcEntities,
  emptyElementClasses,
  isElementClass,
  missingElementClasses,
} from "./ifcClasses.js";

/**
 * El oráculo es el propio archivo: se escribe un IFC con clases conocidas y se comprueba que el
 * informe señala exactamente las que un visor dejaría fuera.
 */
const IFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('0PROJECT00000000000000',$,'Planta',$,$,$,$,(#30),#23);
#2= IFCSITE('0SITE00000000000000000',$,$,$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#10= IFCCARTESIANPOINT((0.,0.,0.));
#11= IFCCARTESIANPOINT((1.,0.,0.));
#12= IFCDIRECTION((0.,0.,1.));
#20= IFCBEAM('0BEAM00000000000000001',$,$,$,$,$,$,$);
#21= IFCBEAM('0BEAM00000000000000002',$,$,$,$,$,$,$);
#30= IFCPIPESEGMENT('0PIPE00000000000000001',$,$,$,$,$,$,$);
#31= IFCPIPESEGMENT('0PIPE00000000000000002',$,$,$,$,$,$,$);
#32= IFCPIPESEGMENT('0PIPE00000000000000003',$,$,$,$,$,$,$);
#40= IFCPIPESEGMENTTYPE('0PIPETYPE0000000000001',$,$,$,$,$,$,$,$,$);
#50= IFCMECHANICALFASTENER('0BOLT00000000000000001',$,$,$,$,$,$,$);
#60= IFCRELAGGREGATES('0AGG00000000000000001',$,$,$,#1,(#2));
ENDSEC;
END-ISO-10303-21;`;

describe("countIfcEntities", () => {
  it("cuenta las entidades por clase", () => {
    const cuentas = countIfcEntities(IFC);
    expect(cuentas.get("IFCPIPESEGMENT")).toBe(3);
    expect(cuentas.get("IFCBEAM")).toBe(2);
    expect(cuentas.get("IFCCARTESIANPOINT")).toBe(2);
    expect(cuentas.get("IFCNOEXISTE")).toBeUndefined();
  });

  it("no cuenta las líneas de la cabecera, que no son entidades", () => {
    expect(countIfcEntities(IFC).get("FILE_SCHEMA")).toBeUndefined();
  });
});

describe("missingElementClasses", () => {
  it("señala las clases de elemento que el visor no cargó, de más a menos", () => {
    // Es el caso real: un modelo de planta industrial donde el visor solo trae la estructura.
    const cargadas = new Map([["IFCBEAM", 2]]);
    const faltantes = missingElementClasses(countIfcEntities(IFC), cargadas);

    expect(faltantes).toEqual([
      { ifcClass: "IFCPIPESEGMENT", inFile: 3, loaded: 0, count: 3 },
      { ifcClass: "IFCMECHANICALFASTENER", inFile: 1, loaded: 0, count: 1 },
    ]);
  });

  it("**detecta una clase cargada a medias**, que es el caso difícil de ver", () => {
    // Del modelo real de planta: la clase aparece entre las cargadas, así que una comparación por
    // nombre no diría nada. Si de tres tuberías llegan dos, falta una y hay que decirlo.
    const cargadas = new Map([
      ["IFCBEAM", 2],
      ["IFCPIPESEGMENT", 2],
      ["IFCMECHANICALFASTENER", 1],
    ]);

    expect(missingElementClasses(countIfcEntities(IFC), cargadas)).toEqual([
      { ifcClass: "IFCPIPESEGMENT", inFile: 3, loaded: 2, count: 1 },
    ]);
  });

  it("no acusa a la geometría, las relaciones ni los tipos", () => {
    const faltantes = missingElementClasses(countIfcEntities(IFC), new Map([["IFCBEAM", 2]]));
    const clases = faltantes.map((f) => f.ifcClass);

    expect(clases).not.toContain("IFCCARTESIANPOINT");
    expect(clases).not.toContain("IFCDIRECTION");
    expect(clases).not.toContain("IFCRELAGGREGATES");
    // Un `…TYPE` describe un elemento pero no es uno: no se dibuja y no se echa de menos.
    expect(clases).not.toContain("IFCPIPESEGMENTTYPE");
  });

  it("no acusa al armazón espacial, que no es geometría que se mire", () => {
    const clases = missingElementClasses(countIfcEntities(IFC), new Map()).map((f) => f.ifcClass);
    expect(clases).not.toContain("IFCPROJECT");
    expect(clases).not.toContain("IFCSITE");
  });

  it("no señala nada cuando el visor cargó todo lo que había", () => {
    const cargadas = new Map([
      ["IFCBEAM", 2],
      ["IFCPIPESEGMENT", 3],
      ["IFCMECHANICALFASTENER", 1],
    ]);
    expect(missingElementClasses(countIfcEntities(IFC), cargadas)).toEqual([]);
  });

  it("no se queja si el modelo trae más de los que el archivo declara", () => {
    // No es geometría que falte, y este informe no puede explicarlo: se calla.
    const cargadas = new Map([["IFCBEAM", 99]]);
    const clases = missingElementClasses(countIfcEntities(IFC), cargadas).map((f) => f.ifcClass);
    expect(clases).not.toContain("IFCBEAM");
  });

  it("ignora los huecos: un IfcOpeningElement es la ausencia de material, no un cuerpo", () => {
    const conHueco = new Map([
      ["IFCWALL", 1],
      ["IFCOPENINGELEMENT", 12],
    ]);
    expect(missingElementClasses(conHueco, new Map([["IFCWALL", 1]]))).toEqual([]);
  });
});

describe("isElementClass", () => {
  it("reconoce como elemento lo que se dibuja", () => {
    expect(isElementClass("IFCBEAM")).toBe(true);
    expect(isElementClass("IFCPIPESEGMENT")).toBe(true);
    expect(isElementClass("IFCBUILDINGELEMENTPROXY")).toBe(true);
    // Una clase que no está en ninguna tabla se da por elemento, que es el lado seguro del error.
    expect(isElementClass("IFCCLASEQUENOEXISTE")).toBe(true);
  });

  it("descarta lo que sostiene el modelo pero no se ve", () => {
    expect(isElementClass("IFCCARTESIANPOINT")).toBe(false);
    expect(isElementClass("IFCPROPERTYSET")).toBe(false);
    expect(isElementClass("IFCBEAMTYPE")).toBe(false);
    expect(isElementClass("IFCBUILDINGSTOREY")).toBe(false);
    expect(isElementClass("NOEMPIEZAPORIFC")).toBe(false);
  });
});

describe("emptyElementClasses", () => {
  it("cuenta por clase los elementos que se cargaron sin geometría", () => {
    // Es el otro caso de geometría que falta: el elemento existe, se puede seleccionar y tiene sus
    // propiedades, pero no se dibuja porque el motor no pudo generar su malla.
    const sinGeometria = [
      "IFCPIPESEGMENT",
      "IFCPIPESEGMENT",
      "IFCBUILDINGELEMENTPROXY",
      "IFCPIPESEGMENT",
    ];

    expect(emptyElementClasses(sinGeometria)).toEqual([
      { ifcClass: "IFCPIPESEGMENT", inFile: 3, loaded: 3, count: 3 },
      { ifcClass: "IFCBUILDINGELEMENTPROXY", inFile: 1, loaded: 1, count: 1 },
    ]);
  });

  it("ignora lo que nunca tuvo geometría: psets, materiales, unidades y el armazón", () => {
    const sinGeometria = [
      "IFCPROPERTYSET",
      "IFCMATERIAL",
      "IFCSIUNIT",
      "IFCBUILDINGSTOREY",
      "IFCBEAMTYPE",
      null,
    ];

    expect(emptyElementClasses(sinGeometria)).toEqual([]);
  });
});
