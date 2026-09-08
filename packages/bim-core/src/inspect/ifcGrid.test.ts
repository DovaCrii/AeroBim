import { describe, expect, it } from "vitest";
import { parseIfcGrids } from "./ifcGrid.js";

/**
 * El oráculo es el archivo real del usuario: un `IfcGrid` de OpenBuildings con sus ejes en
 * `IfcIndexedPolyCurve` y las coordenadas en milímetros. Las pruebas reproducen esa forma en
 * pequeño, más la clásica con `IfcPolyline`, que es la que traen los exportadores más viejos.
 */

const MILIMETROS = "#900=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);";

describe("parseIfcGrids", () => {
  it("lee los ejes de una rejilla IFC4 y los devuelve en metros", () => {
    const ifc = `
      ${MILIMETROS}
      #10=IFCGRIDAXIS('A',#20,.F.);
      #11=IFCGRIDAXIS('1',#21,.F.);
      #20=IFCINDEXEDPOLYCURVE(#30,$,.F.);
      #21=IFCINDEXEDPOLYCURVE(#31,$,.F.);
      #30=IFCCARTESIANPOINTLIST2D(((0.,-3000.),(0.,22500.)));
      #31=IFCCARTESIANPOINTLIST2D(((-1500.,0.),(30000.,0.)));
      #22=IFCGRID('0FTvykQGX9q8ZIuTN3vGp8',#1,'BuildingGrid','Orthogonal',$,$,$,(#10),(#11),$,$);
    `;

    const { axes, skipped } = parseIfcGrids(ifc);

    expect(skipped).toBe(0);
    expect(axes).toEqual([
      {
        label: "A",
        direction: "u",
        points: [
          [0, -3],
          [0, 22.5],
        ],
      },
      {
        label: "1",
        direction: "v",
        points: [
          [-1.5, 0],
          [30, 0],
        ],
      },
    ]);
  });

  it("lee también la polilínea clásica de puntos cartesianos", () => {
    const ifc = `
      ${MILIMETROS}
      #10=IFCGRIDAXIS('B',#20,.T.);
      #20=IFCPOLYLINE((#30,#31));
      #30=IFCCARTESIANPOINT((0.,0.));
      #31=IFCCARTESIANPOINT((10000.,0.));
      #22=IFCGRID('guid',#1,'Rejilla',$,$,$,$,(#10),$,$,$);
    `;

    expect(parseIfcGrids(ifc).axes).toEqual([
      {
        label: "B",
        direction: "u",
        points: [
          [0, 0],
          [10, 0],
        ],
      },
    ]);
  });

  it("aplica el desplazamiento y el giro de la colocación de la rejilla", () => {
    // La rejilla está colocada en (1000, 2000) y girada 90°: el eje que iba hacia +X va hacia +Y.
    const ifc = `
      ${MILIMETROS}
      #10=IFCGRIDAXIS('A',#20,.F.);
      #20=IFCPOLYLINE((#30,#31));
      #30=IFCCARTESIANPOINT((0.,0.));
      #31=IFCCARTESIANPOINT((5000.,0.));
      #40=IFCCARTESIANPOINT((1000.,2000.,0.));
      #41=IFCDIRECTION((0.,1.,0.));
      #42=IFCAXIS2PLACEMENT3D(#40,$,#41);
      #43=IFCLOCALPLACEMENT($,#42);
      #22=IFCGRID('guid',#1,'Rejilla',$,$,#43,$,(#10),$,$,$);
    `;

    const eje = parseIfcGrids(ifc).axes[0];

    expect(eje?.points[0]?.[0]).toBeCloseTo(1, 9);
    expect(eje?.points[0]?.[1]).toBeCloseTo(2, 9);
    expect(eje?.points[1]?.[0]).toBeCloseTo(1, 9);
    expect(eje?.points[1]?.[1]).toBeCloseTo(7, 9);
  });

  it("cuenta el eje que no se puede trazar en vez de callarlo", () => {
    // Una `IfcLine` es una recta infinita: no hay hasta dónde dibujarla.
    const ifc = `
      ${MILIMETROS}
      #10=IFCGRIDAXIS('A',#20,.F.);
      #20=IFCLINE(#30,#31);
      #30=IFCCARTESIANPOINT((0.,0.));
      #31=IFCVECTOR(#32,1.);
      #22=IFCGRID('guid',#1,'Rejilla',$,$,$,$,(#10),$,$,$);
    `;

    expect(parseIfcGrids(ifc)).toEqual({ axes: [], skipped: 1 });
  });

  it("no encuentra ejes donde no los hay, y no lanza", () => {
    expect(parseIfcGrids("")).toEqual({ axes: [], skipped: 0 });
    expect(parseIfcGrids("cualquier cosa que no es un ifc")).toEqual({ axes: [], skipped: 0 });
  });
});
