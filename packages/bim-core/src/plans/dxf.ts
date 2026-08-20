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

/** Una polilínea del plano, ya resuelta a puntos: `[x0, y0, x1, y1, …]` en unidades del dibujo. */
export interface DxfPolyline {
  readonly layer: string;
  readonly points: readonly number[];
  readonly closed: boolean;
  /**
   * El color con el que hay que dibujarla, como índice de AutoCAD.
   *
   * **Ya resuelto**: si la entidad trae color propio es ese, y si dice "por capa" —que es lo
   * normal— es el de su capa. `null` solo cuando nadie lo declara. Sin resolverlo aquí, un plano
   * pintado por capas se ve plano: en un plano de remodelación el color **es** la información,
   * porque separa lo que se construye de lo que se demuele.
   */
  readonly colorIndex: number | null;
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
  readonly colorIndex: number | null;
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
  readonly colorIndex: number | null;
  /** `true` si es un relleno macizo; `false` si es un rayado, que se dibuja solo con su contorno. */
  readonly solid: boolean;
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
  const { colores, tiposDeLinea: tiposPorCapa } = leerTablaDeCapas(pares);
  const patrones = leerPatronesDeLinea(pares);
  const escalaGlobal = numeroDeCabecera(pares, "$LTSCALE") ?? 1;
  const bloques = leerBloques(pares);

  const polylines: DxfPolyline[] = [];
  const texts: DxfText[] = [];
  const hatches: DxfHatch[] = [];
  const skipped: Record<string, number> = {};
  const entidades = entidadesDe(pares, indiceDeSeccion(pares, "ENTITIES"));
  const estilo = { colores, tiposPorCapa, patrones, escalaGlobal };
  for (const entidad of entidades) {
    dibujar(entidad, bloques, { polylines, texts, hatches, estilo }, skipped, IDENTIDAD, 0);
  }

  return {
    polylines,
    texts,
    hatches,
    layers: capasDe(polylines, texts, hatches, colores),
    bounds: extension(polylines, texts),
    declaredUnits,
    skipped,
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

/**
 * La tabla de capas: el color y el tipo de línea de cada una.
 *
 * Es lo que hace que el plano se lea como en el CAD, porque casi todo en un plano dice "por capa":
 * sin esta tabla, el color y el trazo de la inmensa mayoría de las entidades se quedan sin
 * resolver.
 */
function leerTablaDeCapas(pares: readonly Par[]): {
  readonly colores: ReadonlyMap<string, number>;
  readonly tiposDeLinea: ReadonlyMap<string, string>;
} {
  const colores = new Map<string, number>();
  const tiposDeLinea = new Map<string, string>();
  const inicio = indiceDeSeccion(pares, "TABLES");
  if (inicio < 0) return { colores, tiposDeLinea };

  let nombre: string | null = null;
  let dentro = false;
  for (let i = inicio; i < pares.length; i++) {
    const { code, value } = pares[i]!;
    if (code === 0) {
      if (value === "ENDSEC") break;
      dentro = value === "LAYER";
      nombre = null;
      continue;
    }
    if (!dentro) continue;
    if (code === 2) nombre = value;
    // El color negativo es la convención de AutoCAD para una capa apagada: importa el color, no el signo.
    if (code === 62 && nombre !== null) colores.set(nombre, Math.abs(Number(value)));
    if (code === 6 && nombre !== null) tiposDeLinea.set(nombre, value.toUpperCase());
  }
  return { colores, tiposDeLinea };
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
  },
  omitidas: Record<string, number>,
  t: Transformacion,
  profundidad: number,
): void {
  const layer = valor(entidad, 8) ?? "0";
  const colorIndex = colorDe(entidad, layer, salida.estilo.colores);
  const dash = trazoDe(entidad, layer, salida.estilo, t);

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
    salida.polylines.push({ layer, points: planos, closed, colorIndex, dash, width });
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
        colorIndex,
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
      salida.hatches.push({ layer, colorIndex, solid: true, loops: [esquinas] });
      return;
    }

    case "HATCH": {
      const loops = contornosDeRelleno(entidad, t);
      if (loops.length === 0) {
        cuenta(omitidas, "HATCH");
        return;
      }
      salida.hatches.push({
        layer,
        colorIndex,
        // El nombre del patrón dice si es macizo; un rayado se dibuja solo con su contorno, que es
        // lo que se distingue a la escala de un plano.
        solid:
          (valor(entidad, 2) ?? "").toUpperCase() === "SOLID" || (numero(entidad, 70) ?? 0) === 1,
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
      const propia = componer(t, {
        x: numero(entidad, 10) ?? 0,
        y: numero(entidad, 20) ?? 0,
        escalaX: numero(entidad, 41) ?? 1,
        escalaY: numero(entidad, 42) ?? 1,
        giro: ((numero(entidad, 50) ?? 0) * Math.PI) / 180,
      });
      // El punto base del bloque es su origen: lo que se inserta es el bloque **descontado** ese
      // punto, o todo lo que no esté dibujado en el origen aparece desplazado.
      const conBase: Transformacion = {
        ...propia,
        ...(() => {
          const [x, y] = aplicar(propia, -bloque.baseX, -bloque.baseY);
          return { x, y };
        })(),
      };
      for (const hija of bloque.entidades) {
        dibujar(hija, bloques, salida, omitidas, conBase, profundidad + 1);
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
 * El color de una entidad, resuelto.
 *
 * En DXF el color va en el código 62 y tiene dos valores especiales: **256 es "por capa"** —lo
 * normal, y lo que trae casi todo plano— y **0 es "por bloque"**. En los dos casos manda la capa,
 * que es la aproximación correcta salvo para bloques con color propio, algo que un plano de
 * arquitectura casi nunca usa.
 */
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

/** Lo que hace falta para saber de qué color y con qué trazo se dibuja cada entidad. */
interface Estilo {
  readonly colores: ReadonlyMap<string, number>;
  readonly tiposPorCapa: ReadonlyMap<string, string>;
  readonly patrones: ReadonlyMap<string, readonly [number, number]>;
  /** `$LTSCALE`: multiplica el patrón de todo el dibujo. */
  readonly escalaGlobal: number;
}

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
  t: Transformacion,
): readonly [number, number] | null {
  const propio = valor(entidad, 6)?.toUpperCase();
  const nombre =
    propio === undefined || propio === "BYLAYER" || propio === "BYBLOCK"
      ? estilo.tiposPorCapa.get(layer)
      : propio;
  if (nombre === undefined || nombre === "CONTINUOUS") return null;

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
  colores: ReadonlyMap<string, number>,
): number | null {
  const propio = numero(entidad, 62);
  if (propio !== null && propio > 0 && propio < 256) return propio;
  return colores.get(layer) ?? null;
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
  colores: ReadonlyMap<string, number>,
): readonly DxfLayer[] {
  const cuentas = new Map<string, number>();
  for (const linea of polylines) cuentas.set(linea.layer, (cuentas.get(linea.layer) ?? 0) + 1);
  // Los textos y los rellenos cuentan como contenido de su capa: una capa que solo trae rótulos
  // existe, y apagarla tiene que apagarlos.
  for (const texto of texts) cuentas.set(texto.layer, (cuentas.get(texto.layer) ?? 0) + 1);
  for (const relleno of hatches) cuentas.set(relleno.layer, (cuentas.get(relleno.layer) ?? 0) + 1);

  return [...cuentas]
    .map(([name, count]) => ({ name, count, colorIndex: colores.get(name) ?? null }))
    .sort((a, b) => b.count - a.count);
}

function extension(polylines: readonly DxfPolyline[], texts: readonly DxfText[]): DxfBounds | null {
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

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
