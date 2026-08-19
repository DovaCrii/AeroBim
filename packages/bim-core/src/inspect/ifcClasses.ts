/**
 * Qué clases de elemento trae un IFC, contadas sobre el propio archivo.
 *
 * **Para qué sirve.** Un visor puede abrir un modelo, no fallar, y aun así **no mostrar la mitad**:
 * el importador de Fragments procesa un conjunto conocido de clases IFC, y un modelo industrial
 * —una planta exportada desde OpenPlant, por ejemplo— está lleno de clases que no aparecen en un
 * modelo de arquitectura. Cuando eso pasa, el elemento no llega ni al árbol, así que ningún
 * contador del visor lo echa de menos: el hueco es invisible desde dentro.
 *
 * Contar las clases sobre el texto del archivo y compararlas con las que el visor cargó convierte
 * "faltan cosas" en una lista concreta de clases con su número, que es lo que hace falta para
 * saber si el problema es del importador, de la geometría o del archivo.
 *
 * No pretende ser un lector de IFC: cuenta apariciones de `#123= IFCALGO(`, que es información
 * suficiente para responder esa pregunta y no requiere entender el esquema.
 */

/**
 * Clases que no son elementos físicos y por tanto no se esperan en el árbol del modelo.
 *
 * Es la parte del archivo que sostiene la geometría y los datos —puntos, direcciones, relaciones,
 * propiedades, unidades, historial— y en un IFC real es el 95 % de las entidades. Sin filtrarla, el
 * informe se llena de `IFCCARTESIANPOINT` y no se lee.
 *
 * **La lista es deliberadamente incompleta.** Una clase desconocida se informa, y eso está bien:
 * en un diagnóstico, un falso positivo se descarta leyendo su nombre; un falso negativo esconde
 * justo lo que se está buscando.
 */
const NO_SON_ELEMENTOS = new Set([
  // Geometría y representación
  "IFCBOUNDINGBOX",
  "IFCCARTESIANPOINT",
  "IFCCARTESIANPOINTLIST2D",
  "IFCCARTESIANPOINTLIST3D",
  "IFCDIRECTION",
  "IFCVECTOR",
  "IFCVERTEXPOINT",
  "IFCVERTEX",
  "IFCEDGE",
  "IFCEDGECURVE",
  "IFCEDGELOOP",
  "IFCORIENTEDEDGE",
  "IFCFACE",
  "IFCFACEBOUND",
  "IFCFACEOUTERBOUND",
  "IFCFACESURFACE",
  "IFCADVANCEDFACE",
  "IFCPLANE",
  "IFCPLANARBOX",
  "IFCPLANAREXTENT",
  "IFCPOLYLOOP",
  "IFCPOLYLINE",
  "IFCPOLYGONALFACESET",
  "IFCINDEXEDPOLYGONALFACE",
  "IFCINDEXEDPOLYGONALFACEWITHVOIDS",
  "IFCTRIANGULATEDFACESET",
  "IFCCIRCLE",
  "IFCELLIPSE",
  "IFCLINE",
  "IFCTRIMMEDCURVE",
  "IFCCOMPOSITECURVE",
  "IFCCOMPOSITECURVESEGMENT",
  "IFCBSPLINECURVEWITHKNOTS",
  "IFCRATIONALBSPLINESURFACEWITHKNOTS",
  "IFCBSPLINESURFACEWITHKNOTS",
  "IFCCYLINDRICALSURFACE",
  "IFCSURFACEOFLINEAREXTRUSION",
  "IFCSURFACEOFREVOLUTION",
  "IFCEXTRUDEDAREASOLID",
  "IFCREVOLVEDAREASOLID",
  "IFCSWEPTDISKSOLID",
  "IFCSECTIONEDSOLIDHORIZONTAL",
  "IFCFIXEDREFERENCESWEPTAREASOLID",
  "IFCBOOLEANRESULT",
  "IFCBOOLEANCLIPPINGRESULT",
  "IFCHALFSPACESOLID",
  "IFCPOLYGONALBOUNDEDHALFSPACE",
  "IFCBLOCK",
  "IFCRIGHTCIRCULARCYLINDER",
  "IFCRIGHTCIRCULARCONE",
  "IFCSPHERE",
  "IFCCLOSEDSHELL",
  "IFCOPENSHELL",
  "IFCCONNECTEDFACESET",
  "IFCFACETEDBREP",
  "IFCADVANCEDBREP",
  "IFCMANIFOLDSOLIDBREP",
  "IFCSHELLBASEDSURFACEMODEL",
  "IFCFACEBASEDSURFACEMODEL",
  "IFCGEOMETRICCURVESET",
  "IFCGEOMETRICSET",
  "IFCMAPPEDITEM",
  "IFCREPRESENTATIONMAP",
  "IFCSHAPEREPRESENTATION",
  "IFCSHAPEASPECT",
  "IFCPRODUCTDEFINITIONSHAPE",
  "IFCPRODUCTREPRESENTATION",
  "IFCMATERIALDEFINITIONREPRESENTATION",
  "IFCSTYLEDITEM",
  "IFCSTYLEDREPRESENTATION",
  "IFCPRESENTATIONSTYLEASSIGNMENT",
  "IFCSURFACESTYLE",
  "IFCSURFACESTYLERENDERING",
  "IFCSURFACESTYLESHADING",
  "IFCCURVESTYLE",
  "IFCCOLOURRGB",
  "IFCAXIS1PLACEMENT",
  "IFCAXIS2PLACEMENT2D",
  "IFCAXIS2PLACEMENT3D",
  "IFCLOCALPLACEMENT",
  "IFCGRIDPLACEMENT",
  "IFCCARTESIANTRANSFORMATIONOPERATOR2D",
  "IFCCARTESIANTRANSFORMATIONOPERATOR3D",
  "IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM",
  "IFCGEOMETRICREPRESENTATIONCONTEXT",
  "IFCGEOMETRICREPRESENTATIONSUBCONTEXT",
  "IFCPROFILEDEF",
  "IFCRECTANGLEPROFILEDEF",
  "IFCCIRCLEPROFILEDEF",
  "IFCCIRCLEHOLLOWPROFILEDEF",
  "IFCARBITRARYCLOSEDPROFILEDEF",
  "IFCARBITRARYPROFILEDEFWITHVOIDS",
  "IFCARBITRARYOPENPROFILEDEF",
  "IFCISHAPEPROFILEDEF",
  "IFCLSHAPEPROFILEDEF",
  "IFCTSHAPEPROFILEDEF",
  "IFCUSHAPEPROFILEDEF",
  "IFCCSHAPEPROFILEDEF",
  "IFCZSHAPEPROFILEDEF",
  "IFCRECTANGLEHOLLOWPROFILEDEF",
  "IFCDERIVEDPROFILEDEF",
  "IFCCOMPOSITEPROFILEDEF",
  // Relaciones
  "IFCRELAGGREGATES",
  "IFCRELCONTAINEDINSPATIALSTRUCTURE",
  "IFCRELDEFINESBYPROPERTIES",
  "IFCRELDEFINESBYTYPE",
  "IFCRELASSOCIATESMATERIAL",
  "IFCRELASSOCIATESCLASSIFICATION",
  "IFCRELASSOCIATESDOCUMENT",
  "IFCRELVOIDSELEMENT",
  "IFCRELFILLSELEMENT",
  "IFCRELCONNECTSPORTTOELEMENT",
  "IFCRELCONNECTSPORTS",
  "IFCRELCONNECTSELEMENTS",
  "IFCRELCONNECTSPATHELEMENTS",
  "IFCRELSPACEBOUNDARY",
  "IFCRELSPACEBOUNDARY1STLEVEL",
  "IFCRELSPACEBOUNDARY2NDLEVEL",
  "IFCRELNESTS",
  "IFCRELASSIGNSTOGROUP",
  "IFCRELDECLARES",
  // Propiedades, cantidades y clasificación
  "IFCPROPERTYSET",
  "IFCPROPERTYSINGLEVALUE",
  "IFCPROPERTYENUMERATEDVALUE",
  "IFCPROPERTYLISTVALUE",
  "IFCPROPERTYTABLEVALUE",
  "IFCPROPERTYBOUNDEDVALUE",
  "IFCCOMPLEXPROPERTY",
  "IFCELEMENTQUANTITY",
  "IFCQUANTITYLENGTH",
  "IFCQUANTITYAREA",
  "IFCQUANTITYVOLUME",
  "IFCQUANTITYCOUNT",
  "IFCQUANTITYWEIGHT",
  "IFCCLASSIFICATION",
  "IFCCLASSIFICATIONREFERENCE",
  "IFCMATERIAL",
  "IFCMATERIALLIST",
  "IFCMATERIALLAYER",
  "IFCMATERIALLAYERSET",
  "IFCMATERIALLAYERSETUSAGE",
  "IFCMATERIALPROFILE",
  "IFCMATERIALPROFILESET",
  "IFCMATERIALPROFILESETUSAGE",
  "IFCMATERIALCONSTITUENT",
  "IFCMATERIALCONSTITUENTSET",
  // Unidades, contexto y actores
  "IFCSIUNIT",
  "IFCCONVERSIONBASEDUNIT",
  "IFCCONVERSIONBASEDUNITWITHOFFSET",
  "IFCDERIVEDUNIT",
  "IFCDERIVEDUNITELEMENT",
  "IFCDIMENSIONALEXPONENTS",
  "IFCMEASUREWITHUNIT",
  "IFCMONETARYUNIT",
  "IFCUNITASSIGNMENT",
  "IFCOWNERHISTORY",
  "IFCPERSON",
  "IFCORGANIZATION",
  "IFCPERSONANDORGANIZATION",
  "IFCAPPLICATION",
  "IFCPOSTALADDRESS",
  "IFCTELECOMADDRESS",
  "IFCPRESENTATIONLAYERASSIGNMENT",
  "IFCPRESENTATIONLAYERWITHSTYLE",
  "IFCTEXTSTYLE",
  "IFCTEXTSTYLEFONTMODEL",
  "IFCDOCUMENTREFERENCE",
  "IFCDOCUMENTINFORMATION",
  "IFCTABLE",
  "IFCTABLEROW",
  "IFCLOCALTIME",
  "IFCCALENDARDATE",
  "IFCDATEANDTIME",
  // Huecos: son la ausencia de material, no un cuerpo. El conversor los omite a propósito y
  // contarlos como geometría que falta llenaría el aviso de ruido en cualquier modelo de
  // arquitectura, donde hay uno por cada puerta y ventana.
  "IFCOPENINGELEMENT",
  "IFCFEATUREELEMENTSUBTRACTION",
]);

/**
 * Cuenta cuántas entidades de cada clase declara el texto de un IFC.
 *
 * Devuelve las clases tal como aparecen en el archivo, en mayúsculas.
 */
export function countIfcEntities(ifcText: string): ReadonlyMap<string, number> {
  const cuentas = new Map<string, number>();
  const cabecera = /#\d+\s*=\s*([A-Za-z0-9_]+)\s*\(/g;

  let encontrado: RegExpExecArray | null;
  while ((encontrado = cabecera.exec(ifcText)) !== null) {
    const clase = encontrado[1]!.toUpperCase();
    cuentas.set(clase, (cuentas.get(clase) ?? 0) + 1);
  }

  return cuentas;
}

/**
 * Una clase de elemento de la que **falta geometría en pantalla**.
 *
 * Se informan las tres cifras porque cuentan tres historias distintas: `loaded` en cero es una clase
 * que el conversor no procesa; `loaded` a medias es una clase que sí procesa y en la que **algunos
 * elementos fallaron**, que es el caso más difícil de ver y el que aparece en modelos de planta.
 */
export interface MissingClass {
  readonly ifcClass: string;
  /** Cuántos declara el archivo. */
  readonly inFile: number;
  /** Cuántos llegaron al modelo cargado. */
  readonly loaded: number;
  /** Los que faltan: `inFile - loaded`. */
  readonly count: number;
}

/**
 * `true` si la clase es un elemento físico que **debería verse** en pantalla.
 *
 * Deja fuera lo que sostiene el modelo pero no se dibuja: geometría, relaciones, propiedades,
 * unidades, actores, los tipos (`…TYPE`, que describen un elemento pero no son uno) y el armazón
 * espacial. Lo que no reconoce lo da por elemento, que es el lado correcto del error.
 */
export function isElementClass(ifcClass: string): boolean {
  const clase = ifcClass.trim().toUpperCase();
  if (!clase.startsWith("IFC")) return false;
  if (NO_SON_ELEMENTOS.has(clase)) return false;
  // Un `…TYPE` es la definición de un tipo de elemento, no un elemento: no se dibuja.
  if (clase.endsWith("TYPE")) return false;
  return !ARMAZON_ESPACIAL.has(clase);
}

/** El armazón espacial: contiene elementos, pero no es geometría que alguien mire. */
const ARMAZON_ESPACIAL = new Set([
  "IFCPROJECT",
  "IFCSITE",
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
  "IFCSPATIALZONE",
]);

/**
 * Clases de elemento de las que **el modelo tiene menos que el archivo**.
 *
 * **Compara cantidades, no presencia**, y esa es la diferencia que importa: si de quinientas
 * tuberías llegan trescientas, la clase aparece entre las cargadas y una comparación por nombre no
 * diría nada. En un modelo de arquitectura eso casi no pasa; en uno de planta industrial, donde la
 * geometría es de barridos y B-reps que el motor no siempre resuelve, es el caso normal.
 *
 * Ordenadas de más a menos, porque lo que falta en cantidad es lo que se nota al mirar.
 */
export function missingElementClasses(
  inFile: ReadonlyMap<string, number>,
  loaded: ReadonlyMap<string, number>,
): readonly MissingClass[] {
  const cargadas = new Map<string, number>();
  for (const [categoria, cuantos] of loaded) cargadas.set(categoria.toUpperCase(), cuantos);

  const faltantes: MissingClass[] = [];
  for (const [ifcClass, enArchivo] of inFile) {
    if (!isElementClass(ifcClass)) continue;

    const yaCargados = cargadas.get(ifcClass) ?? 0;
    const faltan = enArchivo - yaCargados;
    // Más cargados que declarados no es un error que este informe pueda explicar —serían elementos
    // que el conversor sintetiza— y desde luego no es geometría que falte.
    if (faltan <= 0) continue;

    faltantes.push({ ifcClass, inFile: enArchivo, loaded: yaCargados, count: faltan });
  }

  return faltantes.sort((a, b) => b.count - a.count);
}

/**
 * Cuenta por clase los elementos que el modelo cargó **sin geometría**.
 *
 * Es la otra mitad del diagnóstico, y separa dos causas que en pantalla se ven igual:
 *
 * - una clase que el importador **no procesa**: el elemento no existe en el modelo. Eso lo delata
 *   {@link missingElementClasses}, comparando contra el archivo.
 * - un elemento que **sí se importó y cuya geometría no se pudo generar**: está en el árbol, se
 *   puede seleccionar, tiene sus propiedades, y no se dibuja. Eso es lo que cuenta esta función.
 *
 * La distinción decide el arreglo. La primera causa se resuelve añadiendo clases al importador; la
 * segunda apunta al motor de geometría —`web-ifc` con B-reps avanzados o barridos por trayectoria—
 * y no se arregla desde acá.
 */
export function emptyElementClasses(
  categoriesWithoutGeometry: readonly (string | null)[],
): readonly MissingClass[] {
  const cuentas = new Map<string, number>();

  for (const categoria of categoriesWithoutGeometry) {
    if (categoria === null) continue;
    const clase = categoria.toUpperCase();
    if (!isElementClass(clase)) continue;
    cuentas.set(clase, (cuentas.get(clase) ?? 0) + 1);
  }

  // `inFile` y `loaded` se informan igual para que la forma sea la misma que la del otro caso: acá
  // todos se importaron —`loaded` los cuenta— y todos están sin dibujo, así que faltan todos.
  return [...cuentas]
    .map(([ifcClass, count]) => ({ ifcClass, inFile: count, loaded: count, count }))
    .sort((a, b) => b.count - a.count);
}
