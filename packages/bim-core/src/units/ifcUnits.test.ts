import { describe, expect, it } from "vitest";
import { NO_IFC_UNITS, parseIfcUnits } from "./ifcUnits.js";

/**
 * Cabecera mínima de un IFC. No se parsea, pero los archivos reales la traen y así el fixture
 * se parece a la entrada verdadera.
 */
const CABECERA = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
`;

describe("parseIfcUnits", () => {
  it("lee las unidades del modelo de arquitectura típico: milímetros, m² y m³", () => {
    // Es exactamente lo que declara `muro-con-psets.ifc`, y lo que declaran los IFC que
    // exporta BricsCAD: geometría en milímetros, cantidades en metros.
    const ifc = `${CABECERA}
#20= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#21= IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#22= IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#23= IFCUNITASSIGNMENT((#20,#21,#22));
#40= IFCPROJECT('0PSETPROJECT0000000000',#5,'AeroBim psets',$,$,$,$,(#30),#23);
ENDSEC;`;

    expect(parseIfcUnits(ifc)).toEqual({
      length: "mm",
      area: "m²",
      volume: "m³",
      angle: null,
      mass: null,
      time: null,
    });
  });

  it("no asume unidades cuando el archivo no las declara", () => {
    expect(parseIfcUnits(`${CABECERA}#1= IFCWALL('x',$,$,$,$,$,$,$);\nENDSEC;`)).toEqual(
      NO_IFC_UNITS,
    );
  });

  it("aplica el prefijo SI al símbolo compuesto: MILLI sobre SQUARE_METRE es mm²", () => {
    const ifc = `${CABECERA}
#1= IFCSIUNIT(*,.AREAUNIT.,.MILLI.,.SQUARE_METRE.);
#2= IFCUNITASSIGNMENT((#1));
ENDSEC;`;

    expect(parseIfcUnits(ifc).area).toBe("mm²");
  });

  it("resuelve las unidades imperiales, que llegan como IfcConversionBasedUnit", () => {
    const ifc = `${CABECERA}
#1= IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#2= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#3= IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(304.8),#2);
#4= IFCCONVERSIONBASEDUNIT(#1,.LENGTHUNIT.,'FOOT',#3);
#5= IFCCONVERSIONBASEDUNIT(#1,.PLANEANGLEUNIT.,'DEGREE',#3);
#6= IFCUNITASSIGNMENT((#4,#5));
ENDSEC;`;

    const unidades = parseIfcUnits(ifc);
    expect(unidades.length).toBe("ft");
    expect(unidades.angle).toBe("°");
  });

  it("muestra tal cual el nombre de una unidad de conversión que no está en la tabla", () => {
    // Es más honesto que dejarla sin unidad: el archivo sí la declaró, aunque no se reconozca.
    const ifc = `${CABECERA}
#1= IFCCONVERSIONBASEDUNIT(#9,.LENGTHUNIT.,'VARA CASTELLANA',#8);
#2= IFCUNITASSIGNMENT((#1));
ENDSEC;`;

    expect(parseIfcUnits(ifc).length).toBe("VARA CASTELLANA");
  });

  it("prefiere la asignación a la que apunta IfcProject sobre una huérfana anterior", () => {
    // Pasa en modelos federados por una herramienta que dejó la asignación de otro proyecto.
    const ifc = `${CABECERA}
#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2= IFCUNITASSIGNMENT((#1));
#3= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#4= IFCUNITASSIGNMENT((#3));
#5= IFCPROJECT('0PROJECT00000000000000',$,'Federado',$,$,$,$,(#30),#4);
ENDSEC;`;

    expect(parseIfcUnits(ifc).length).toBe("mm");
  });

  it("ignora una unidad de magnitud que no se muestra, sin perder las demás", () => {
    const ifc = `${CABECERA}
#1= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2= IFCSIUNIT(*,.SOLIDANGLEUNIT.,$,.STERADIAN.);
#3= IFCSIUNIT(*,.THERMODYNAMICTEMPERATUREUNIT.,$,.DEGREE_CELSIUS.);
#4= IFCUNITASSIGNMENT((#1,#2,#3));
ENDSEC;`;

    expect(parseIfcUnits(ifc).length).toBe("mm");
  });

  it("no se pierde con comas ni paréntesis dentro de un texto entre comillas", () => {
    // `IfcProject` con un nombre que trae una coma y un apóstrofo escapado: si el troceado de
    // argumentos no respeta las comillas, la referencia a las unidades se lee del argumento
    // equivocado y el modelo queda sin unidades.
    const ifc = `${CABECERA}
#1= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2= IFCUNITASSIGNMENT((#1));
#3= IFCPROJECT('0PROJECT00000000000000',$,'Edificio B, ala norte (fase 2)',$,$,'O''Higgins',$,(#30),#2);
ENDSEC;`;

    expect(parseIfcUnits(ifc).length).toBe("mm");
  });

  it("devuelve las unidades conocidas aunque el archivo esté truncado a media entidad", () => {
    // Un IFC cortado —una descarga interrumpida— no debe hacer fallar la lectura.
    const ifc = `${CABECERA}
#1= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#2= IFCUNITASSIGNMENT((#1));
#3= IFCWALL('x',$,$,$,$,$`;

    expect(parseIfcUnits(ifc).length).toBe("mm");
  });
});
