/**
 * Lector de DXF: lo justo para **ver un plano**, no para editarlo.
 *
 * Un DXF trae mucho más de lo que hace falta acá. Lo que se necesita para poner el plano del
 * proyecto debajo del modelo y compararlos es la geometría de líneas —líneas, polilíneas, arcos y
 * círculos, con los bloques desarmados—, **sus colores** y **sus textos**, repartido por capas.
 * Los rellenos, las cotas del CAD y los enmascaramientos se cuentan y se dejan fuera, y el conteo
 * se informa: un plano al que le falta la mitad y no lo dice es peor que uno que no carga.
 *
 * **Por qué a mano y no con una librería.** El formato es un flujo de pares (código, valor) y el
 * subconjunto que dibuja un plano de arquitectura cabe en un archivo; hacerlo acá lo deja en el
 * dominio puro, probado en Node y sin una dependencia más que auditar. Si aparecen splines o
 * geometría 3D de CAD, entonces sí conviene mirar `dxf-parser` (MIT).
 *
 * Todo sale en **unidades del dibujo**, tal cual vienen en el archivo. Convertirlas es otra
 * decisión y tiene su función: ver {@link suggestMetresPerUnit}, y la advertencia de por qué la
 * cabecera no basta.
 */

/**
 * El color con el que hay que dibujar algo del plano, **ya resuelto y con su procedencia**.
 *
 * En DXF el color de una entidad casi nunca está en la entidad: dice "por capa" —lo normal— o "por
 * bloque", y hay que ir a buscarlo. Resolverlo acá y no en el visor es lo que evita que la leyenda
 * del panel y el dibujo digan cosas distintas, que ya pasó una vez.
 *
 * **Por qué además se guarda de dónde salió.** Cuando un plano se ve de un color que no es el del
 * CAD, la pregunta es siempre la misma —¿lo dijo la entidad, su capa o el bloque que la contiene?—
 * y sin este dato hay que leer el archivo a mano para contestarla. Con él, el informe de fidelidad
 * lo dice.
 */
export interface DxfColor {
  /** El valor final, `0xRRGGBB`. Es lo único que necesita el visor para pintar. */
  readonly rgb: number;
  /** El índice ACI del que salió, o `null` si vino como color verdadero (código 420). */
  readonly aci: number | null;
  /** Opacidad de 0 a 1, del código 440. `1` es opaco, que es lo que es casi todo un plano. */
  readonly opacity: number;
  readonly source: "entidad" | "capa" | "bloque" | "defecto";
}

/** Una polilínea del plano, ya resuelta a puntos: `[x0, y0, x1, y1, …]` en unidades del dibujo. */
export interface DxfPolyline {
  readonly layer: string;
  readonly points: readonly number[];
  readonly closed: boolean;
  /** El color, ya resuelto. Ver {@link DxfColor}. */
  readonly color: DxfColor;
  /**
   * El grosor del trazo en **milímetros de papel**, resuelto ya sea de la entidad, de su capa o del
   * `$LWDEFAULT` del archivo.
   *
   * **Un plano de arquitectura se lee por su jerarquía de grosores**: el muro cortado va gordo, la
   * cota y el rayado van finos, y es así como el ojo separa la estructura de la anotación.
   * Dibujando todo al mismo grosor el plano se ve como una maraña — que es exactamente lo que se
   * veía antes de leer esto.
   *
   * Es medida de papel y no de dibujo: no se escala con el plano, igual que en el CAD.
   */
  readonly lineweightMm: number;
  /**
   * El patrón de trazo, como `[raya, espacio]` en unidades del dibujo, o `null` si es continua.
   *
   * **En un plano, la línea discontinua es información**: separa lo que está por encima del corte,
   * los ejes, lo oculto y lo que se demuele. Dibujarlo todo continuo hace que un plano de
   * remodelación mienta. Se resume el patrón del CAD —que puede tener varios tramos— en una raya y
   * un espacio, que es lo que se puede dibujar en una línea de WebGL y lo que se lee igual.
   */
  readonly dash: readonly [number, number] | null;
  /**
   * El ancho del trazo en unidades del dibujo, o `null` si es una línea sin grosor.
   *
   * **Una polilínea con ancho no es una línea gruesa: es un macizo.** Es como se dibujan los muros
   * en buena parte de los planos de CAD, y trazándola como línea fina el plano se ve vacío justo
   * donde tenía que verse lleno.
   */
  readonly width: number | null;
}

/**
 * Un texto del plano: el nombre de un recinto, una cota escrita, una llamada.
 *
 * **Sin los textos, un plano se mira pero no se lee.** Los metros cuadrados de una oficina, el
 * número del eje o la nota de demolición no están en la geometría, y son justo lo que alguien busca
 * al poner el plano al lado del modelo.
 */
export interface DxfText {
  readonly layer: string;
  /** Dónde se inserta, en unidades del dibujo. */
  readonly x: number;
  readonly y: number;
  /** Alto de la letra, en unidades del dibujo. */
  readonly height: number;
  readonly rotationDeg: number;
  readonly text: string;
  readonly color: DxfColor;
}

/**
 * Un relleno del plano: el macizo de un muro, una zona sombreada, un área marcada.
 *
 * **Sin los rellenos, un plano de arquitectura no se reconoce.** Los muros se dibujan como
 * contorno más relleno macizo, y con solo el contorno lo que se ve es una maraña de líneas: la
 * comparación con el modelo deja de ser inmediata, que es justo lo que se venía a hacer.
 */
export interface DxfHatch {
  readonly layer: string;
  readonly color: DxfColor;
  /** `true` si es un relleno macizo; `false` si es un rayado. */
  readonly solid: boolean;
  /**
   * El nombre del patrón del CAD —`ANSI31`, `NET`…— o `null` si es macizo.
   *
   * **Hace falta para poder rayarlo de verdad.** Antes se decidía "macizo o solo contorno", y los
   * veintitrés rellenos del plano real son `ANSI31`: se veían como veintitrés contornos vacíos
   * justo donde el CAD dibuja un muro rayado.
   *
   * Va el nombre y no el ángulo ni la separación, y es a propósito. Esos dos números viven en
   * códigos —41 y 52— que **también aparecen dentro de los contornos** del propio relleno, así que
   * buscarlos sueltos lee tan a menudo un radio de arista como una separación de rayado. El ángulo
   * lo dice el nombre del patrón, y la separación la elige el visor a una medida legible, que es la
   * misma decisión ya tomada con el tamaño de las rayas: ver `patronLegible`.
   */
  readonly pattern: string | null;
  /**
   * Los contornos, cada uno como `[x0, y0, x1, y1, …]` y cerrado.
   *
   * El primero suele ser el borde exterior y los demás, huecos. Quién es quién lo decide el visor
   * por área, que es lo que acierta en un plano real sin implementar la aritmética de contornos
   * completa del estándar.
   */
  readonly loops: readonly (readonly number[])[];
}

/**
 * Los siete colores fijos de AutoCAD, los que se ven en cualquier plano.
 *
 * Del 10 al 249 la paleta se calcula: ver {@link aciColor}. Los grises del 250 al 255 son una rampa
 * aparte.
 */
const ACI_BASICOS: Readonly<Record<number, number>> = {
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  // **El 7 es el color "por defecto" y depende del fondo**: negro sobre papel, blanco sobre una
  // pantalla oscura. Acá el fondo es oscuro, así que va claro — pintarlo negro sería dibujar un
  // plano invisible, que es el error clásico al llevar un DXF a un visor.
  7: 0xe8e8ef,
  8: 0x808080,
  9: 0xc0c0c0,
};

/**
 * El color **real** de un índice de AutoCAD, como entero `0xRRGGBB`.
 *
 * **Vive en el dominio y no en el visor porque lo usan los dos**: la escena para dibujar y el panel
 * para su muestra de color. Con una copia en cada sitio pasó lo que tenía que pasar — la capa
 * `0-AREA UTIL` (índice 201) se dibujaba violeta y la leyenda la pintaba verde, así que la lista
 * mentía sobre el propio dibujo.
 *
 * La regla de la paleta, comprobada contra la tabla oficial:
 *
 * - **1 a 9**: los colores fijos.
 * - **10 a 249**: `24 tonos × 10 variantes`. El tono avanza de 15 en 15 grados; las variantes van
 *   en cinco niveles de claridad —255, 165, 127, 76 y 38— y cada nivel tiene su versión **pálida**,
 *   que sube los componentes apagados hasta la mitad del nivel. Así el 11 es `(255,127,127)` y el
 *   21 es `(255,159,127)`, exactamente como en AutoCAD.
 * - **250 a 255**: la rampa de grises.
 */
export function aciColor(colorIndex: number | null): number {
  if (colorIndex === null) return ACI_BASICOS[7]!;

  const basico = ACI_BASICOS[colorIndex];
  if (basico !== undefined) return basico;

  if (colorIndex >= 250 && colorIndex <= 255) {
    return [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff][colorIndex - 250]!;
  }
  if (colorIndex < 10 || colorIndex > 249) return ACI_BASICOS[7]!;

  const indice = colorIndex - 10;
  const grados = Math.floor(indice / 10) * 15;
  const variante = indice % 10;
  const nivel = [255, 165, 127, 76, 38][Math.floor(variante / 2)]!;
  const palida = variante % 2 === 1;

  const [r, g, b] = tonoPuro(grados);
  const componente = (fraccion: number) => {
    const lleno = fraccion * nivel;
    // La versión pálida levanta lo apagado hasta la mitad del nivel: es lo que hace que los impares
    // de la paleta se vean lavados en vez de simplemente más oscuros.
    return Math.round(palida ? lleno + (1 - fraccion) * (nivel / 2) : lleno);
  };

  return (componente(r) << 16) | (componente(g) << 8) | componente(b);
}

/** El mismo color, como `#rrggbb`, que es lo que necesita el CSS de la leyenda. */
export function aciColorHex(colorIndex: number | null): string {
  return `#${aciColor(colorIndex).toString(16).padStart(6, "0")}`;
}

/** El tono puro de un ángulo del círculo cromático, con saturación y valor al máximo. */
function tonoPuro(grados: number): readonly [number, number, number] {
  const sector = (grados % 360) / 60;
  const x = 1 - Math.abs((sector % 2) - 1);

  if (sector < 1) return [1, x, 0];
  if (sector < 2) return [x, 1, 0];
  if (sector < 3) return [0, 1, x];
  if (sector < 4) return [0, x, 1];
  if (sector < 5) return [x, 0, 1];
  return [1, 0, x];
}

/** Una capa del dibujo, con su color de AutoCAD (índice ACI) cuando lo declara. */
export interface DxfLayer {
  readonly name: string;
  /** Índice de color de AutoCAD, 1 a 255. `null` si la capa no lo declara. */
  readonly colorIndex: number | null;
  /** Cuántas polilíneas quedaron en esta capa, ya desarmados los bloques. */
  readonly count: number;
  /**
   * `true` si el CAD la tiene **apagada, congelada o sin imprimir**.
   *
   * El signo negativo del código 62 es la convención de AutoCAD para una capa apagada, y en el
   * plano real del usuario `0-AREA UTIL` la lleva: el visor la pintaba violeta encima del dibujo
   * cuando en el CAD no se ve. Se lee también el congelado (código 70) y el nombre `Defpoints`, que
   * por convención no se imprime.
   *
   * **La geometría se conserva igual y la capa arranca oculta.** Borrarla sería mentir en la otra
   * dirección: "¿qué hay en esa capa que el proyectista apagó?" es una pregunta legítima, y el
   * plano tiene que poder contestarla encendiéndola.
   */
  readonly off: boolean;
  /** Grosor que declara la capa, en milímetros de papel. `null` si dice "por defecto". */
  readonly lineweightMm: number | null;
}

export interface DxfBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Las unidades que **declara** el archivo en `$INSUNITS`. Declarar no es ser: ver el aviso. */
export interface DxfDeclaredUnits {
  /** El valor crudo de `$INSUNITS`. `0` es "sin unidades", que es tan común como una unidad real. */
  readonly code: number;
  readonly name: string;
  /** Metros por unidad de dibujo según ese código, o `null` si el archivo no lo dice. */
  readonly metresPerUnit: number | null;
}

export interface DxfDrawing {
  readonly polylines: readonly DxfPolyline[];
  /** Los textos del plano, con su sitio y su tamaño. */
  readonly texts: readonly DxfText[];
  /** Los rellenos: los macizos de los muros y las zonas sombreadas. */
  readonly hatches: readonly DxfHatch[];
  readonly layers: readonly DxfLayer[];
  /** La extensión **real** de lo dibujado. `null` si no se pudo dibujar nada. */
  readonly bounds: DxfBounds | null;
  readonly declaredUnits: DxfDeclaredUnits;
  /** Entidades que este lector no dibuja, por tipo. Es lo que falta del plano, dicho en voz alta. */
  readonly skipped: Readonly<Record<string, number>>;
  /**
   * Cuántas entidades se dejaron fuera por estar en **espacio papel**, no por no saber dibujarlas.
   *
   * Va aparte de {@link skipped} a propósito: no es geometría que falte, es geometría que no
   * pertenece al dibujo. El marco de la lámina y su cajetín viven ahí, y meterlos en el modelo es
   * lo que hacía que un plano de veinte metros midiera cuatrocientos ochenta.
   */
  readonly paperSpaceCount: number;
}

/**
 * Códigos de `$INSUNITS`, los que aparecen en planos de obra.
 *
 * Los que faltan —micras, yardas, millas, unidades astronómicas— no se inventan: quedan sin
 * traducción y la unidad se decide midiendo. Ver {@link suggestMetresPerUnit}.
 */
const UNIDADES: Readonly<
  Record<number, { readonly name: string; readonly metresPerUnit: number }>
> = {
  1: { name: "pulgadas", metresPerUnit: 0.0254 },
  2: { name: "pies", metresPerUnit: 0.3048 },
  4: { name: "milímetros", metresPerUnit: 0.001 },
  5: { name: "centímetros", metresPerUnit: 0.01 },
  6: { name: "metros", metresPerUnit: 1 },
  7: { name: "kilómetros", metresPerUnit: 1000 },
  9: { name: "milésimas de pulgada", metresPerUnit: 0.0000254 },
  10: { name: "yardas", metresPerUnit: 0.9144 },
  11: { name: "ángstroms", metresPerUnit: 1e-10 },
  14: { name: "decímetros", metresPerUnit: 0.1 },
};

/** Cuántos grados como mucho abarca cada tramo al convertir un arco en segmentos. */
const GRADOS_POR_TRAMO = 5;

/** Hasta dónde se sigue un bloque dentro de otro. Un DXF corrupto puede referenciarse a sí mismo. */
const PROFUNDIDAD_MAXIMA = 8;

/** Un par (código, valor) del archivo, que es como está escrito un DXF de principio a fin. */
interface Par {
  readonly code: number;
  readonly value: string;
}

/**
 * Lee un DXF ASCII.
 *
 * **Nunca lanza por contenido**: un archivo truncado o con una sección rara devuelve lo que se pudo
 * leer. Un plano medio dibujado con el aviso de lo que faltó sirve; una excepción, no.
 */
export function parseDxf(text: string): DxfDrawing {
  const pares = tokenizar(text);

  const declaredUnits = leerUnidades(pares);
  const capas = leerTablaDeCapas(pares);
  const patrones = leerPatronesDeLinea(pares);
  const escalaGlobal = numeroDeCabecera(pares, "$LTSCALE") ?? 1;
  // `$LWDEFAULT` viene en centésimas de milímetro; sin él, AutoCAD usa 0,25 mm.
  const grosorPorDefectoMm = grosorEnMm(numeroDeCabecera(pares, "$LWDEFAULT") ?? 25) ?? 0.25;
  const bloques = leerBloques(pares);

  const polylines: DxfPolyline[] = [];
  const texts: DxfText[] = [];
  const hatches: DxfHatch[] = [];
  const skipped: Record<string, number> = {};
  const entidades = entidadesDe(pares, indiceDeSeccion(pares, "ENTITIES"));
  const estilo: Estilo = { capas, patrones, escalaGlobal, grosorPorDefectoMm };
  const salida = { polylines, texts, hatches, estilo, paperSpace: 0 };
  for (const entidad of entidades) {
    dibujar(entidad, bloques, salida, skipped, IDENTIDAD, SIN_HEREDAR, 0);
  }

  return {
    polylines,
    texts,
    hatches,
    layers: capasDe(polylines, texts, hatches, capas),
    bounds: extension(polylines, texts, hatches),
    declaredUnits,
    skipped,
    paperSpaceCount: salida.paperSpace,
  };
}

/**
 * Propone cuántos metros mide una unidad del dibujo, **midiendo el plano** y no creyéndole a la
 * cabecera.
 *
 * `$INSUNITS` miente a menudo: el plano real del usuario declara centímetros y está en milímetros,
 * porque el CAD lo hereda de la plantilla y nadie lo corrige. Aplicarlo a ciegas mete el plano al
 * modelo con un factor de diez, y eso se ve como "el plano no calza" sin decir por qué.
 *
 * El criterio es de obra, y va en dos vueltas porque una sola no decide: primero se busca la unidad
 * que deja el plano en **tamaño corriente de planta** (3 a 120 m de lado) y solo si ninguna encaja
 * se acepta el rango ancho (2 a 500 m). Sin la primera vuelta, el plano real se queda en los
 * centímetros que declara —200 metros de oficina, que "cabe" en el rango ancho— en vez de los
 * milímetros que es. Dentro de cada vuelta gana lo que declara el archivo.
 *
 * La respuesta viene con el motivo, para que la interfaz pueda mostrarlo y dejar corregirlo.
 */
export function suggestMetresPerUnit(drawing: DxfDrawing): {
  readonly metresPerUnit: number;
  readonly unitName: string;
  readonly reason: string;
  /** `true` si es la unidad que declara el archivo. */
  readonly declared: boolean;
} {
  const declarada = drawing.declaredUnits;
  const lado = ladoMayor(drawing.bounds);

  // Sin extensión no hay nada que medir: se respeta lo declarado, y si no hay, metros.
  if (lado === null) {
    return {
      metresPerUnit: declarada.metresPerUnit ?? 1,
      unitName: declarada.metresPerUnit === null ? "metros" : declarada.name,
      declared: declarada.metresPerUnit !== null,
      reason: "El plano no trae geometría que medir: se usa lo que declara el archivo.",
    };
  }

  // **Dos medidas, no una.** El tamaño total puede estar dominado por el marco de la lámina o por
  // una entidad suelta lejísimos, y entonces engaña: en un plano real del usuario, el dibujo entero
  // medía 48 m —tamaño creíble— mientras la planta de verdad ocupaba dos metros. El **trazo más
  // largo** no se deja engañar: en un plano de edificio es una fachada, un muro o un eje.
  const trazo = trazoMayor(drawing);

  const candidatas: readonly (readonly [string, number, boolean])[] = [
    ...(declarada.metresPerUnit === null
      ? []
      : ([[declarada.name, declarada.metresPerUnit, true]] as const)),
    ["milímetros", 0.001, false],
    ["centímetros", 0.01, false],
    ["metros", 1, false],
    ["pies", 0.3048, false],
    ["pulgadas", 0.0254, false],
  ];

  let mejor: { nombre: string; metros: number; declarada: boolean; puntos: number } | null = null;
  for (const [nombre, metros, esDeclarada] of candidatas) {
    const totalOk = lado * metros >= 3 && lado * metros <= 600;
    const trazoOk = trazo === null || (trazo * metros >= 3 && trazo * metros <= 120);
    const puntos = (totalOk ? 1 : 0) + (trazoOk ? 1 : 0);

    if (puntos === 0) continue;
    if (mejor === null || puntos > mejor.puntos) {
      mejor = { nombre, metros, declarada: esDeclarada, puntos };
    }
  }

  if (mejor !== null) {
    const medidaTrazo = trazo === null ? null : medida(trazo, mejor.metros);
    if (mejor.declarada) {
      return {
        metresPerUnit: mejor.metros,
        unitName: mejor.nombre,
        declared: true,
        reason: `El archivo declara ${mejor.nombre}: el plano mide ${medida(lado, mejor.metros)} y su trazo más largo ${medidaTrazo ?? "—"}, que es tamaño de edificio.`,
      };
    }

    const declaradoDice =
      declarada.metresPerUnit === null
        ? "El archivo no declara unidades"
        : `El archivo declara ${declarada.name}, y con eso el trazo más largo mediría ${trazo === null ? medida(lado, declarada.metresPerUnit) : medida(trazo, declarada.metresPerUnit)}`;

    return {
      metresPerUnit: mejor.metros,
      unitName: mejor.nombre,
      declared: false,
      reason: `${declaradoDice}. Midiendo el dibujo son ${mejor.nombre}: ${medida(lado, mejor.metros)} de lado y ${medidaTrazo ?? "—"} el trazo más largo.`,
    };
  }

  return {
    metresPerUnit: declarada.metresPerUnit ?? 1,
    unitName: declarada.metresPerUnit === null ? "metros" : declarada.name,
    declared: declarada.metresPerUnit !== null,
    reason:
      "Ninguna unidad habitual deja el plano en un tamaño de edificio: hay que decirla a mano.",
  };
}

/**
 * Cuánto mide el trazo más largo del dibujo, en unidades.
 *
 * Es la medida que no engaña al deducir la unidad: el marco de la lámina o una entidad perdida a
 * kilómetros inflan la extensión total, pero **la línea más larga de un plano de edificio es una
 * fachada, un muro o un eje** — entre tres y cien metros, nunca dos.
 */
function trazoMayor(drawing: DxfDrawing): number | null {
  let mayor = 0;
  for (const linea of drawing.polylines) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < linea.points.length; i += 2) {
      const x = linea.points[i]!;
      const y = linea.points[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (Number.isFinite(minX)) mayor = Math.max(mayor, maxX - minX, maxY - minY);
  }
  return mayor > 0 ? mayor : null;
}

/** El lado mayor de la extensión, en unidades del dibujo. */
function ladoMayor(bounds: DxfBounds | null): number | null {
  if (bounds === null) return null;
  const lado = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return lado > 0 ? lado : null;
}

function medida(lado: number, metros: number): string {
  return `${(lado * metros).toFixed(1)} m`;
}

/**
 * Parte el archivo en pares (código, valor).
 *
 * Los códigos vienen alineados con espacios y los valores pueden traer espacios propios —el nombre
 * de una capa es `AA - COTAS`—, así que se recorta el código y **el valor se deja tal cual** salvo
 * el retorno de carro.
 */
function tokenizar(text: string): readonly Par[] {
  const lineas = text.split("\n");
  const pares: Par[] = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const code = Number(lineas[i]!.trim());
    if (!Number.isFinite(code)) continue;
    pares.push({ code, value: lineas[i + 1]!.replace(/\r$/, "").trim() });
  }
  return pares;
}

/** Dónde empieza una sección: `0/SECTION` seguido de `2/<nombre>`. `-1` si no está. */
function indiceDeSeccion(pares: readonly Par[], nombre: string): number {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i]!.code === 0 && pares[i]!.value === "SECTION") {
      const siguiente = pares[i + 1]!;
      if (siguiente.code === 2 && siguiente.value === nombre) return i + 2;
    }
  }
  return -1;
}

function leerUnidades(pares: readonly Par[]): DxfDeclaredUnits {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i]!.code === 9 && pares[i]!.value === "$INSUNITS") {
      const code = Number(pares[i + 1]!.value);
      const unidad = UNIDADES[code];
      return {
        code: Number.isFinite(code) ? code : 0,
        name: unidad?.name ?? "sin unidades declaradas",
        metresPerUnit: unidad?.metresPerUnit ?? null,
      };
    }
  }
  return { code: 0, name: "sin unidades declaradas", metresPerUnit: null };
}

/** Lo que la tabla `LAYER` declara de una capa. */
interface CapaDeclarada {
  readonly colorIndex: number | null;
  /** Apagada, congelada o no imprimible: en el CAD no se ve. */
  readonly off: boolean;
  readonly linetype: string | null;
  /** Grosor en milímetros de papel, o `null` si dice "por defecto". */
  readonly lineweightMm: number | null;
}

/**
 * Una capa que el archivo no declara: pasa con planos exportados a los que les falta la tabla.
 *
 * No es lo mismo que una capa sin color —esa declara y no dice color—, así que no se cachea: se
 * devuelve al vuelo y quien pregunte resuelve por defecto.
 */
const CAPA_SIN_DECLARAR: CapaDeclarada = {
  colorIndex: null,
  off: false,
  linetype: null,
  lineweightMm: null,
};

/**
 * La tabla de capas: color, tipo de línea, grosor y si está apagada.
 *
 * Es lo que hace que el plano se lea como en el CAD, porque casi todo en un plano dice "por capa":
 * sin esta tabla, el color, el trazo y el grosor de la inmensa mayoría de las entidades se quedan
 * sin resolver.
 */
function leerTablaDeCapas(pares: readonly Par[]): ReadonlyMap<string, CapaDeclarada> {
  const capas = new Map<string, CapaDeclarada>();
  const inicio = indiceDeSeccion(pares, "TABLES");
  if (inicio < 0) return capas;

  let nombre: string | null = null;
  let dentro = false;
  let actual = { ...CAPA_SIN_DECLARAR };

  const guardar = () => {
    if (nombre === null) return;
    // **`Defpoints` no se imprime, por convención de AutoCAD.** Es donde va la geometría auxiliar
    // —los puntos de replanteo del propio dibujante—, y en el plano real son treinta y seis puntos
    // que en el CAD no se ven.
    const auxiliar = nombre.toUpperCase() === "DEFPOINTS";
    capas.set(nombre, { ...actual, off: actual.off || auxiliar });
  };

  for (let i = inicio; i < pares.length; i++) {
    const { code, value } = pares[i]!;
    if (code === 0) {
      guardar();
      if (value === "ENDSEC") break;
      dentro = value === "LAYER";
      nombre = null;
      actual = { ...CAPA_SIN_DECLARAR };
      continue;
    }
    if (!dentro) continue;
    if (code === 2) nombre = value;
    if (code === 62) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      // **El signo negativo del 62 es "capa apagada"**, y descartarlo con un valor absoluto —que es
      // lo que se hacía— dibuja encima del plano justo lo que el proyectista decidió no ver.
      actual = { ...actual, colorIndex: Math.abs(n), off: actual.off || n < 0 };
    }
    // El código 70 son banderas; el bit 1 es "congelada", que en pantalla es lo mismo que apagada.
    if (code === 70) {
      const n = Number(value);
      if (Number.isFinite(n) && (n & 1) === 1) actual = { ...actual, off: true };
    }
    if (code === 6) actual = { ...actual, linetype: value.toUpperCase() };
    if (code === 370) actual = { ...actual, lineweightMm: grosorEnMm(Number(value)) };
  }
  return capas;
}

/**
 * Un grosor del código 370 en milímetros, o `null` si no es una medida.
 *
 * El CAD lo escribe en centésimas de milímetro, y reserva los negativos para "lo dice otro":
 * `-1` por capa, `-2` por bloque, `-3` el del archivo. Traducirlos acá sería adivinar; los resuelve
 * quien sabe de qué capa y de qué bloque se trata.
 */
function grosorEnMm(centesimas: number): number | null {
  if (!Number.isFinite(centesimas) || centesimas < 0) return null;
  return centesimas / 100;
}

/**
 * Los patrones de trazo declarados en la tabla `LTYPE`, resumidos a `[raya, espacio]`.
 *
 * El CAD describe el patrón como una lista de tramos con signo: positivo es raya, negativo es
 * espacio y cero es punto. WebGL solo sabe dibujar una raya y un espacio, así que se promedia cada
 * grupo — un trazo y punto sale como raya media y espacio medio, y a la vista sigue siendo
 * discontinuo, que es lo que hay que distinguir de una línea llena.
 */
function leerPatronesDeLinea(
  pares: readonly Par[],
): ReadonlyMap<string, readonly [number, number]> {
  const patrones = new Map<string, readonly [number, number]>();
  const inicio = indiceDeSeccion(pares, "TABLES");
  if (inicio < 0) return patrones;

  let nombre: string | null = null;
  let tramos: number[] = [];
  let dentro = false;

  const guardar = () => {
    if (nombre === null) return;
    const rayas = tramos.filter((t) => t > 0);
    const espacios = tramos.filter((t) => t < 0).map(Math.abs);
    // Sin espacios no hay discontinuidad: es una línea llena aunque declare patrón.
    if (espacios.length === 0) return;

    const media = (lista: readonly number[], respaldo: number) =>
      lista.length === 0 ? respaldo : lista.reduce((a, b) => a + b, 0) / lista.length;
    const espacio = media(espacios, 1);
    // Un patrón de solo puntos —todos los tramos en cero— se dibuja con una raya corta, o no se
    // vería nada en absoluto.
    patrones.set(nombre.toUpperCase(), [media(rayas, espacio / 2), espacio]);
  };

  for (let i = inicio; i < pares.length; i++) {
    const { code, value } = pares[i]!;
    if (code === 0) {
      guardar();
      if (value === "ENDSEC") break;
      dentro = value === "LTYPE";
      nombre = null;
      tramos = [];
      continue;
    }
    if (!dentro) continue;
    if (code === 2) nombre = value;
    if (code === 49) {
      const tramo = Number(value);
      if (Number.isFinite(tramo)) tramos.push(tramo);
    }
  }
  return patrones;
}

/** Un valor numérico de la cabecera, como `$LTSCALE`. */
function numeroDeCabecera(pares: readonly Par[], clave: string): number | null {
  for (let i = 0; i + 1 < pares.length; i++) {
    if (pares[i]!.code === 9 && pares[i]!.value === clave) {
      const n = Number(pares[i + 1]!.value);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** Una entidad cruda: su tipo y sus pares, en orden. */
interface Entidad {
  readonly type: string;
  readonly pares: readonly Par[];
}

/** Las entidades de una sección, desde `desde` hasta su `ENDSEC`. */
function entidadesDe(pares: readonly Par[], desde: number): readonly Entidad[] {
  if (desde < 0) return [];

  const entidades: Entidad[] = [];
  let actual: { type: string; pares: Par[] } | null = null;
  for (let i = desde; i < pares.length; i++) {
    const par = pares[i]!;
    if (par.code === 0) {
      if (actual !== null) entidades.push(actual);
      actual = null;
      if (par.value === "ENDSEC") break;
      actual = { type: par.value, pares: [] };
      continue;
    }
    actual?.pares.push(par);
  }
  if (actual !== null) entidades.push(actual);
  return entidades;
}

/** Un bloque: su punto base y lo que contiene. Un `INSERT` lo coloca girado y escalado. */
interface Bloque {
  readonly baseX: number;
  readonly baseY: number;
  readonly entidades: readonly Entidad[];
}

function leerBloques(pares: readonly Par[]): ReadonlyMap<string, Bloque> {
  const bloques = new Map<string, Bloque>();
  const inicio = indiceDeSeccion(pares, "BLOCKS");
  if (inicio < 0) return bloques;

  const entidades = entidadesDe(pares, inicio);
  let nombre: string | null = null;
  let base = { x: 0, y: 0 };
  let contenido: Entidad[] = [];

  for (const entidad of entidades) {
    if (entidad.type === "BLOCK") {
      nombre = valor(entidad, 2) ?? null;
      base = { x: numero(entidad, 10) ?? 0, y: numero(entidad, 20) ?? 0 };
      contenido = [];
      continue;
    }
    if (entidad.type === "ENDBLK") {
      if (nombre !== null)
        bloques.set(nombre, { baseX: base.x, baseY: base.y, entidades: contenido });
      nombre = null;
      continue;
    }
    if (nombre !== null) contenido.push(entidad);
  }
  return bloques;
}

/** Una transformación plana: escala, giro y traslación, que es todo lo que aplica un `INSERT`. */
interface Transformacion {
  readonly x: number;
  readonly y: number;
  readonly escalaX: number;
  readonly escalaY: number;
  /** Giro en radianes. */
  readonly giro: number;
}

const IDENTIDAD: Transformacion = { x: 0, y: 0, escalaX: 1, escalaY: 1, giro: 0 };

function aplicar(t: Transformacion, x: number, y: number): readonly [number, number] {
  const ex = x * t.escalaX;
  const ey = y * t.escalaY;
  const cos = Math.cos(t.giro);
  const sen = Math.sin(t.giro);
  return [t.x + ex * cos - ey * sen, t.y + ex * sen + ey * cos];
}

/** Compone la del `INSERT` con la que ya venía, para que un bloque dentro de otro caiga en su sitio. */
function componer(padre: Transformacion, hijo: Transformacion): Transformacion {
  const [x, y] = aplicar(padre, hijo.x, hijo.y);
  return {
    x,
    y,
    escalaX: padre.escalaX * hijo.escalaX,
    escalaY: padre.escalaY * hijo.escalaY,
    giro: padre.giro + hijo.giro,
  };
}

/**
 * Convierte una entidad en polilíneas y las añade a la lista.
 *
 * Lo que no se dibuja se cuenta por tipo: es la única forma de que alguien sepa que el plano que
 * está viendo no trae los textos ni los rellenos.
 */
function dibujar(
  entidad: Entidad,
  bloques: ReadonlyMap<string, Bloque>,
  salida: {
    readonly polylines: DxfPolyline[];
    readonly texts: DxfText[];
    readonly hatches: DxfHatch[];
    readonly estilo: Estilo;
    paperSpace: number;
  },
  omitidas: Record<string, number>,
  t: Transformacion,
  heredado: Heredado,
  profundidad: number,
): void {
  // **El espacio papel no es el dibujo.** El código 67 a 1 marca lo que vive en la lámina —el
  // marco, el cajetín, las viñetas—, y traerlo al modelo es lo que hacía que una planta de veinte
  // metros midiera cuatrocientos ochenta y que la unidad se dedujera mal.
  if (numero(entidad, 67) === 1) {
    salida.paperSpace += 1;
    return;
  }

  const propia = valor(entidad, 8) ?? "0";
  // **La capa `0` dentro de un bloque no es la capa `0`**: AutoCAD la sustituye por la capa del
  // `INSERT`. Es la regla que hace que un bloque se pinte del color de donde se inserta.
  const layer = propia === "0" && heredado.layer !== "0" ? heredado.layer : propia;

  const color = colorDe(entidad, layer, salida.estilo.capas, heredado);
  const dash = trazoDe(entidad, layer, salida.estilo, heredado, t);
  const lineweightMm = grosorDe(entidad, layer, salida.estilo, heredado);

  const anadir = (
    puntos: readonly (readonly [number, number])[],
    closed: boolean,
    width: number | null = null,
  ) => {
    if (puntos.length < 2) return;
    const planos: number[] = [];
    for (const [x, y] of puntos) {
      const [px, py] = aplicar(t, x, y);
      planos.push(px, py);
    }
    salida.polylines.push({ layer, points: planos, closed, color, dash, width, lineweightMm });
  };

  switch (entidad.type) {
    case "TEXT":
    case "MTEXT": {
      const contenido = textoDe(entidad);
      const x = numero(entidad, 10);
      const y = numero(entidad, 20);
      if (contenido === "" || x === null || y === null) {
        cuenta(omitidas, entidad.type);
        return;
      }

      const [px, py] = aplicar(t, x, y);
      // El alto de letra escala con el bloque que lo contiene, o un rótulo dentro de un bloque a
      // media escala saldría del tamaño del original.
      const escala = Math.abs(t.escalaY) || 1;
      salida.texts.push({
        layer,
        x: px,
        y: py,
        height: (numero(entidad, 40) ?? 2.5) * escala,
        rotationDeg: (numero(entidad, 50) ?? 0) + (t.giro * 180) / Math.PI,
        text: contenido,
        color,
      });
      return;
    }
    case "LINE": {
      const x1 = numero(entidad, 10);
      const y1 = numero(entidad, 20);
      const x2 = numero(entidad, 11);
      const y2 = numero(entidad, 21);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return;
      anadir(
        [
          [x1, y1],
          [x2, y2],
        ],
        false,
      );
      return;
    }

    case "LWPOLYLINE": {
      const vertices = verticesDe(entidad);
      const cerrada = (numero(entidad, 70) ?? 0) % 2 === 1;
      // El ancho puede venir constante para toda la polilínea (43) o por vértice (40 y 41). Se
      // resume en uno solo: dibujar una banda que se estrecha es un lujo que no cambia lo que se
      // está comparando, y no tenerla en cuenta sí, porque el muro se ve hueco.
      const constante = numero(entidad, 43);
      const anchos = [numero(entidad, 40), numero(entidad, 41)].filter(
        (uno): uno is number => uno !== null && uno > 0,
      );
      const ancho =
        constante !== null && constante > 0
          ? constante
          : anchos.length > 0
            ? anchos.reduce((a, b) => a + b, 0) / anchos.length
            : null;

      const escala = Math.abs(t.escalaX) || 1;
      anadir(desarrollar(vertices, cerrada), cerrada, ancho === null ? null : ancho * escala);
      return;
    }

    case "CIRCLE": {
      const cx = numero(entidad, 10);
      const cy = numero(entidad, 20);
      const r = numero(entidad, 40);
      if (cx === null || cy === null || r === null || r <= 0) return;
      anadir(arco(cx, cy, r, 0, 360), true);
      return;
    }

    case "ARC": {
      const cx = numero(entidad, 10);
      const cy = numero(entidad, 20);
      const r = numero(entidad, 40);
      const desde = numero(entidad, 50);
      const hasta = numero(entidad, 51);
      if (cx === null || cy === null || r === null || desde === null || hasta === null) return;
      anadir(arco(cx, cy, r, desde, hasta), false);
      return;
    }

    // Un `SOLID` es un triángulo o un cuadrilátero macizo, y en un plano de CAD es media
    // información: con él se pintan los muros cortados, los pilares y los rellenos de detalle.
    // `3DFACE` tiene los mismos cuatro puntos y en un plano se usa igual.
    case "SOLID":
    case "3DFACE": {
      const esquinas: number[] = [];
      // **El orden de los puntos de un `SOLID` no es el del contorno**: el estándar los numera en
      // zigzag, así que el tercero y el cuarto van cruzados. Dibujarlos en su orden crudo da un
      // reloj de arena en vez de un cuadrilátero.
      for (const [cx, cy] of [
        [10, 20],
        [11, 21],
        [13, 23],
        [12, 22],
      ] as const) {
        const x = numero(entidad, cx);
        const y = numero(entidad, cy);
        if (x === null || y === null) continue;
        const [px, py] = aplicar(t, x, y);
        esquinas.push(px, py);
      }
      if (esquinas.length < 6) {
        cuenta(omitidas, entidad.type);
        return;
      }
      salida.hatches.push({
        layer,
        color,
        solid: true,
        pattern: null,
        loops: [esquinas],
      });
      return;
    }

    case "HATCH": {
      const loops = contornosDeRelleno(entidad, t);
      if (loops.length === 0) {
        cuenta(omitidas, "HATCH");
        return;
      }
      const patron = (valor(entidad, 2) ?? "").toUpperCase();
      const solid = patron === "SOLID" || (numero(entidad, 70) ?? 0) === 1;
      salida.hatches.push({
        layer,
        color,
        solid,
        // El nombre del patrón se conserva para poder **rayarlo**. Decidir solo "macizo o contorno"
        // dejaba los veintitrés `ANSI31` del plano real como contornos vacíos.
        pattern: solid || patron === "" ? null : patron,
        loops,
      });
      return;
    }

    case "INSERT": {
      const nombre = valor(entidad, 2);
      const bloque = nombre === undefined ? undefined : bloques.get(nombre);
      if (bloque === undefined || profundidad >= PROFUNDIDAD_MAXIMA) {
        cuenta(omitidas, "INSERT");
        return;
      }
      const x0 = numero(entidad, 10) ?? 0;
      const y0 = numero(entidad, 20) ?? 0;
      const escalaX = numero(entidad, 41) ?? 1;
      const escalaY = numero(entidad, 42) ?? 1;
      const giro = ((numero(entidad, 50) ?? 0) * Math.PI) / 180;

      // **Un `INSERT` puede ser una matriz.** Los códigos 70 y 71 dicen cuántas columnas y filas, y
      // los 44 y 45 su separación: de una reja de veinte pilares se dibujaba **uno**. La separación
      // se mide en el sistema del bloque, así que va antes del giro y de la escala.
      const columnas = Math.max(1, Math.trunc(numero(entidad, 70) ?? 1));
      const filas = Math.max(1, Math.trunc(numero(entidad, 71) ?? 1));
      const pasoX = numero(entidad, 44) ?? 0;
      const pasoY = numero(entidad, 45) ?? 0;

      // Lo que el bloque presta a lo que lleva dentro. Se presta **ya resuelto**: si el `INSERT`
      // dice "por capa", lo que hereda el hijo es el trazo de esa capa, no la palabra "por capa".
      const suyo = valor(entidad, 6)?.toUpperCase();
      const presta: Heredado = {
        layer,
        color,
        linetype:
          suyo === undefined || suyo === "BYLAYER"
            ? (salida.estilo.capas.get(layer)?.linetype ?? null)
            : suyo === "BYBLOCK"
              ? heredado.linetype
              : suyo,
        lineweightMm,
      };

      for (let fila = 0; fila < filas; fila++) {
        for (let columna = 0; columna < columnas; columna++) {
          const propia = componer(t, {
            x: x0 + columna * pasoX * Math.cos(giro) - fila * pasoY * Math.sin(giro),
            y: y0 + columna * pasoX * Math.sin(giro) + fila * pasoY * Math.cos(giro),
            escalaX,
            escalaY,
            giro,
          });
          // El punto base del bloque es su origen: lo que se inserta es el bloque **descontado** ese
          // punto, o todo lo que no esté dibujado en el origen aparece desplazado.
          const [bx, by] = aplicar(propia, -bloque.baseX, -bloque.baseY);
          const conBase: Transformacion = { ...propia, x: bx, y: by };
          for (const hija of bloque.entidades) {
            dibujar(hija, bloques, salida, omitidas, conBase, presta, profundidad + 1);
          }
        }
      }

      return;
    }

    // Marcas de estructura del archivo: no son geometría que falte.
    case "SEQEND":
    case "ENDBLK":
    case "BLOCK":
    case "VERTEX":
      return;

    default:
      cuenta(omitidas, entidad.type);
  }
}

function cuenta(registro: Record<string, number>, clave: string): void {
  registro[clave] = (registro[clave] ?? 0) + 1;
}

/**
 * Los contornos de un `HATCH`, ya transformados y cerrados.
 *
 * **Es la parte más enrevesada del formato** y por eso se lee con una máquina de estados sobre los
 * pares en orden, no buscando códigos sueltos: dentro de un relleno, el código 10 significa una
 * cosa en un contorno de polilínea, otra en una arista y otra más en un punto semilla. Se leen los
 * dos casos que dibujan un plano —contorno de polilínea y aristas de línea o de arco— y se corta al
 * llegar a los objetos de origen o a los datos de degradado, que es donde los códigos se reciclan.
 */
function contornosDeRelleno(entidad: Entidad, t: Transformacion): readonly (readonly number[])[] {
  const contornos: number[][] = [];
  let actual: number[] | null = null;
  let esPolilinea = false;
  let vertice: { x: number | null; bulge: number } = { x: null, bulge: 0 };
  let arista: Record<number, number> = {};
  let tipoArista = 0;

  const punto = (x: number, y: number) => {
    const [px, py] = aplicar(t, x, y);
    actual?.push(px, py);
  };

  const cerrarContorno = () => {
    if (actual !== null && actual.length >= 6) contornos.push(actual);
    actual = null;
  };

  const cerrarArista = () => {
    if (actual === null) return;
    if (tipoArista === 1 && arista[10] !== undefined && arista[20] !== undefined) {
      punto(arista[10], arista[20]);
      if (arista[11] !== undefined && arista[21] !== undefined) punto(arista[11], arista[21]);
    }
    if (
      tipoArista === 2 &&
      arista[10] !== undefined &&
      arista[20] !== undefined &&
      arista[40] !== undefined
    ) {
      // Un arco del contorno se convierte en tramos, igual que en la geometría suelta: sin esto,
      // un muro curvo se rellenaría con la cuerda y el macizo se saldría del muro.
      for (const [x, y] of arco(
        arista[10],
        arista[20],
        arista[40],
        arista[50] ?? 0,
        arista[51] ?? 360,
      )) {
        punto(x, y);
      }
    }
    arista = {};
    tipoArista = 0;
  };

  for (const { code, value } of entidad.pares) {
    const n = Number(value);

    // A partir de acá los códigos son de los objetos de origen, las semillas o el degradado, y
    // volverían a leerse como si fueran geometría.
    if (code === 97 || code === 98 || code >= 450) {
      cerrarArista();
      cerrarContorno();
      break;
    }

    if (code === 92) {
      cerrarArista();
      cerrarContorno();
      actual = [];
      esPolilinea = (n & 2) === 2;
      vertice = { x: null, bulge: 0 };
      continue;
    }
    if (actual === null) continue;

    if (esPolilinea) {
      if (code === 10) vertice = { x: n, bulge: 0 };
      else if (code === 20 && vertice.x !== null) punto(vertice.x, n);
      continue;
    }

    if (code === 72) {
      cerrarArista();
      tipoArista = n;
      continue;
    }
    if ([10, 20, 11, 21, 40, 50, 51].includes(code)) arista[code] = n;
  }

  cerrarArista();
  cerrarContorno();
  return contornos;
}

/** Lo que hace falta para saber de qué color, con qué trazo y con qué grosor se dibuja cada entidad. */
interface Estilo {
  readonly capas: ReadonlyMap<string, CapaDeclarada>;
  readonly patrones: ReadonlyMap<string, readonly [number, number]>;
  /** `$LTSCALE`: multiplica el patrón de todo el dibujo. */
  readonly escalaGlobal: number;
  /** `$LWDEFAULT`, en milímetros: el grosor de todo lo que no declara ninguno. */
  readonly grosorPorDefectoMm: number;
}

/**
 * Lo que un `INSERT` presta a lo que lleva dentro.
 *
 * **Es la pieza que faltaba y la que más se notaba.** Un bloque de AutoCAD se dibuja para poder
 * insertarlo en cualquier capa y de cualquier color, y el formato lo consigue con dos convenciones
 * que hay que resolver desde arriba: lo dibujado en la **capa `0`** toma la capa del `INSERT`, y lo
 * que dice **"por bloque"** toma su color y su trazo. Sin esto, ciento dieciséis entidades del plano
 * real se quedaban en la capa `0` literal y salían casi blancas.
 */
interface Heredado {
  readonly layer: string;
  readonly color: DxfColor | null;
  readonly linetype: string | null;
  readonly lineweightMm: number | null;
}

const SIN_HEREDAR: Heredado = { layer: "0", color: null, linetype: null, lineweightMm: null };

/**
 * El patrón de trazo de una entidad, ya resuelto y escalado.
 *
 * Manda el tipo de línea propio si lo trae; si dice "por capa" —lo habitual— manda el de su capa.
 * El tamaño del patrón se multiplica por `$LTSCALE`, por la escala propia de la entidad (código 48)
 * y por la del bloque que la contenga: un patrón sin escalar dentro de un bloque a la mitad se
 * vería con el doble de raya que el resto del plano.
 */
function trazoDe(
  entidad: Entidad,
  layer: string,
  estilo: Estilo,
  heredado: Heredado,
  t: Transformacion,
): readonly [number, number] | null {
  const propio = valor(entidad, 6)?.toUpperCase();
  const deCapa = estilo.capas.get(layer)?.linetype ?? undefined;
  const nombre =
    propio === undefined || propio === "BYLAYER"
      ? deCapa
      : // **"Por bloque" no es "por capa".** Colapsar los dos dibujaba llenas las cincuenta y cuatro
        // entidades del plano real que heredan el trazo de su bloque.
        propio === "BYBLOCK"
        ? (heredado.linetype ?? deCapa)
        : propio;
  if (nombre === undefined || nombre === null || nombre === "CONTINUOUS") return null;

  const patron = estilo.patrones.get(nombre);
  if (patron === undefined) return null;

  const escalaBloque = Math.abs(t.escalaX) || 1;
  const escala = estilo.escalaGlobal * (numero(entidad, 48) ?? 1) * escalaBloque;
  if (!Number.isFinite(escala) || escala <= 0) return patron;

  return [patron[0] * escala, patron[1] * escala];
}

function colorDe(
  entidad: Entidad,
  layer: string,
  capas: ReadonlyMap<string, CapaDeclarada>,
  heredado: Heredado,
): DxfColor {
  const opacity = opacidadDe(entidad) ?? heredado.color?.opacity ?? 1;

  // **El color verdadero manda sobre el índice.** Es lo que declara un plano moderno, y sin leerlo
  // un rojo de marca cualquiera se dibuja con el rojo puro de la paleta o con el color por defecto.
  const verdadero = numero(entidad, 420);
  if (verdadero !== null && verdadero >= 0) {
    return { rgb: verdadero & 0xffffff, aci: null, opacity, source: "entidad" };
  }

  const propio = numero(entidad, 62);
  // **`0` es "por bloque"**: el color lo pone el `INSERT` que lo contiene, no la capa donde el
  // bloque fue dibujado. Son treinta y siete entidades en el plano real.
  if (propio === 0 && heredado.color !== null) {
    return { ...heredado.color, opacity, source: "bloque" };
  }
  if (propio !== null && propio > 0 && propio < 256) {
    return { rgb: aciColor(propio), aci: propio, opacity, source: "entidad" };
  }

  const deCapa = capas.get(layer)?.colorIndex ?? null;
  if (deCapa !== null) return { rgb: aciColor(deCapa), aci: deCapa, opacity, source: "capa" };
  return { rgb: aciColor(null), aci: null, opacity, source: "defecto" };
}

/**
 * La opacidad de una entidad, del código 440, o `null` si no la declara.
 *
 * El valor trae la marca `0x02` en el byte alto cuando es una transparencia propia, y el byte bajo
 * es el alfa de 0 a 255. `0x01000000` significa "por bloque" y se resuelve heredando.
 */
function opacidadDe(entidad: Entidad): number | null {
  const bruto = numero(entidad, 440);
  if (bruto === null || bruto < 0) return null;
  if ((bruto & 0x02000000) === 0) return null;
  return (bruto & 0xff) / 255;
}

/**
 * El grosor de trazo de una entidad, en milímetros de papel, ya resuelto.
 *
 * El código 370 reserva los negativos para delegar: `-1` en la capa, `-2` en el bloque, `-3` en el
 * `$LWDEFAULT` del archivo. Se sigue la cadena hasta un número, y si nadie lo dice manda el del
 * archivo — nunca se devuelve "no se sabe", porque el visor tendría que inventarlo igual.
 */
function grosorDe(entidad: Entidad, layer: string, estilo: Estilo, heredado: Heredado): number {
  const deCapa = estilo.capas.get(layer)?.lineweightMm ?? null;
  const propio = numero(entidad, 370);

  if (propio !== null && propio >= 0) return propio / 100;
  if (propio === -2) return heredado.lineweightMm ?? deCapa ?? estilo.grosorPorDefectoMm;
  return deCapa ?? estilo.grosorPorDefectoMm;
}

/**
 * El texto de un `TEXT` o de un `MTEXT`, limpio de códigos de formato.
 *
 * Un `MTEXT` viene troceado en varios códigos 3 y termina en el 1, y trae la tipografía, el color y
 * el interlineado incrustados en el propio texto: `{\fArial|b0|i0;\C1;PLANTA}`. Se quitan porque lo
 * que hace falta es **lo que dice**, y porque un rótulo que sale con sus llaves y sus barras es
 * peor que ninguno.
 */
function textoDe(entidad: Entidad): string {
  let crudo = "";
  for (const { code, value } of entidad.pares) {
    if (code === 3) crudo += value;
    else if (code === 1) crudo += value;
  }

  return crudo
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;\\]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\~/g, " ")
    .replace(/%%[cCdDpP]/g, (marca) =>
      marca.toLowerCase() === "%%c" ? "Ø" : marca.toLowerCase() === "%%d" ? "°" : "±",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Un vértice de polilínea, con su curvatura: `bulge` es la tangente de un cuarto del ángulo. */
interface Vertice {
  readonly x: number;
  readonly y: number;
  readonly bulge: number;
}

function verticesDe(entidad: Entidad): readonly Vertice[] {
  const vertices: { x: number; y: number; bulge: number }[] = [];
  for (const { code, value } of entidad.pares) {
    const n = Number(value);
    if (code === 10) vertices.push({ x: n, y: 0, bulge: 0 });
    else if (code === 20 && vertices.length > 0) vertices[vertices.length - 1]!.y = n;
    else if (code === 42 && vertices.length > 0) vertices[vertices.length - 1]!.bulge = n;
  }
  return vertices.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
}

/**
 * Convierte los vértices en puntos, curvando los tramos que traen `bulge`.
 *
 * **El `bulge` no es decorativo**: en un plano de arquitectura son los muros curvos y los aleros.
 * Ignorarlo cierra la curva con una cuerda recta, y lo que se ve es un plano que no calza con el
 * modelo justo donde hay curvas.
 */
function desarrollar(
  vertices: readonly Vertice[],
  cerrada: boolean,
): readonly (readonly [number, number])[] {
  const puntos: (readonly [number, number])[] = [];
  const total = vertices.length;
  if (total === 0) return puntos;

  const tramos = cerrada ? total : total - 1;
  for (let i = 0; i < tramos; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % total]!;
    puntos.push([a.x, a.y]);
    if (a.bulge === 0 || !Number.isFinite(a.bulge)) continue;

    // Geometría del `bulge`: el ángulo abarcado es 4·atan(bulge), y con la cuerda salen radio y
    // centro. El signo del bulge dice hacia qué lado curva.
    const angulo = 4 * Math.atan(a.bulge);
    const cuerdaX = b.x - a.x;
    const cuerdaY = b.y - a.y;
    const cuerda = Math.hypot(cuerdaX, cuerdaY);
    if (cuerda === 0) continue;

    const radio = cuerda / (2 * Math.sin(Math.abs(angulo) / 2));
    const altura = (radio * Math.cos(angulo / 2)) / 1;
    const medioX = (a.x + b.x) / 2;
    const medioY = (a.y + b.y) / 2;
    const normalX = -cuerdaY / cuerda;
    const normalY = cuerdaX / cuerda;
    const signo = angulo > 0 ? 1 : -1;
    const cx = medioX - normalX * altura * signo;
    const cy = medioY - normalY * altura * signo;

    const desde = Math.atan2(a.y - cy, a.x - cx);
    const tramosArco = Math.max(
      1,
      Math.ceil((Math.abs(angulo) * 180) / Math.PI / GRADOS_POR_TRAMO),
    );
    for (let k = 1; k < tramosArco; k++) {
      const th = desde + (angulo * k) / tramosArco;
      puntos.push([cx + radio * Math.cos(th), cy + radio * Math.sin(th)]);
    }
  }
  if (!cerrada) {
    const ultimo = vertices[total - 1]!;
    puntos.push([ultimo.x, ultimo.y]);
  }
  return puntos;
}

/** Un arco en segmentos, de `desde` a `hasta` en grados y en sentido antihorario, como el DXF. */
function arco(
  cx: number,
  cy: number,
  r: number,
  desde: number,
  hasta: number,
): readonly (readonly [number, number])[] {
  let barrido = hasta - desde;
  while (barrido <= 0) barrido += 360;

  const tramos = Math.max(2, Math.ceil(barrido / GRADOS_POR_TRAMO));
  const puntos: (readonly [number, number])[] = [];
  for (let i = 0; i <= tramos; i++) {
    const th = ((desde + (barrido * i) / tramos) * Math.PI) / 180;
    puntos.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return puntos;
}

function valor(entidad: Entidad, code: number): string | undefined {
  return entidad.pares.find((par) => par.code === code)?.value;
}

function numero(entidad: Entidad, code: number): number | null {
  const bruto = valor(entidad, code);
  if (bruto === undefined) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

function capasDe(
  polylines: readonly DxfPolyline[],
  texts: readonly DxfText[],
  hatches: readonly DxfHatch[],
  capas: ReadonlyMap<string, CapaDeclarada>,
): readonly DxfLayer[] {
  const cuentas = new Map<string, number>();
  for (const linea of polylines) cuentas.set(linea.layer, (cuentas.get(linea.layer) ?? 0) + 1);
  // Los textos y los rellenos cuentan como contenido de su capa: una capa que solo trae rótulos
  // existe, y apagarla tiene que apagarlos.
  for (const texto of texts) cuentas.set(texto.layer, (cuentas.get(texto.layer) ?? 0) + 1);
  for (const relleno of hatches) cuentas.set(relleno.layer, (cuentas.get(relleno.layer) ?? 0) + 1);

  return [...cuentas]
    .map(([name, count]) => {
      const declarada = capas.get(name) ?? CAPA_SIN_DECLARAR;
      return {
        name,
        count,
        colorIndex: declarada.colorIndex,
        off: declarada.off,
        lineweightMm: declarada.lineweightMm,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function extension(
  polylines: readonly DxfPolyline[],
  texts: readonly DxfText[],
  hatches: readonly DxfHatch[],
): DxfBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const meter = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const linea of polylines) {
    for (let i = 0; i + 1 < linea.points.length; i += 2)
      meter(linea.points[i]!, linea.points[i + 1]!);
  }
  for (const texto of texts) meter(texto.x, texto.y);
  // **Los rellenos también son dibujo.** Sin contarlos, un plano cuyos macizos salen del recuadro
  // de sus líneas queda descentrado y, peor, la unidad se deduce con una extensión que no es la del
  // plano: ver `suggestMetresPerUnit`.
  for (const relleno of hatches) {
    for (const contorno of relleno.loops) {
      for (let i = 0; i + 1 < contorno.length; i += 2) meter(contorno[i]!, contorno[i + 1]!);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
