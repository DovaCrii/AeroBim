/**
 * **El índice de un `.ifczip`, leído sin descomprimir nada** (2026-09-28).
 *
 * Un `.ifczip` —el IFC comprimido de buildingSMART— soltado en el visor iba a parar a `web-ifc` tal
 * cual: bytes de zip donde el lector espera texto STEP, y el WebAssembly se caía con `memory access
 * out of bounds`, el mismo fallo que ya se había cerrado para los DWG. Esto decide **qué hay dentro
 * y dónde**, y el visor descomprime solo ese tramo con el `DecompressionStream` del navegador.
 *
 * Vive aquí y no en el visor porque es aritmética sobre bytes: se prueba en Node con un zip escrito
 * a mano, sin navegador. Solo lee el formato ZIP clásico —el que escriben Revit, Tekla y ArchiCAD
 * para un IFC—; un ZIP64 se rechaza con su motivo en vez de leerse mal.
 *
 * La misma regla que el servidor (`services/api/apps/documents/ifczip.py`): **un solo `.ifc`**.
 */

/** Una entrada del índice central de un zip. */
export interface EntradaZip {
  readonly nombre: string;
  /** 0 = guardado sin comprimir, 8 = deflate. Cualquier otro no se sabe leer aquí. */
  readonly metodo: number;
  readonly bytesComprimidos: number;
  readonly bytesDescomprimidos: number;
  /** Dónde empieza la cabecera local de la entrada; los datos van detrás de ella. */
  readonly desplazamientoCabecera: number;
  readonly cifrada: boolean;
}

/** Dónde están los datos comprimidos del modelo y cuánto ocupará al salir. */
export interface ModeloEnZip {
  readonly nombre: string;
  readonly metodo: number;
  readonly inicio: number;
  readonly fin: number;
  readonly bytesDescomprimidos: number;
}

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
/** El fin del índice mide 22 bytes, más un comentario de hasta 65 535. */
const LARGO_FIN = 22;
const COMENTARIO_MAXIMO = 0xffff;

/** `true` si los bytes empiezan como un zip. Es lo que distingue un `.ifczip` de un IFC. */
export function esZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && leer32(bytes, 0) === FIRMA_LOCAL;
}

/** Las entradas del índice central, en orden. Lanza con un motivo legible si no se puede leer. */
export function indiceZip(bytes: Uint8Array): EntradaZip[] {
  const fin = buscarFin(bytes);
  const cuantas = leer16(bytes, fin + 10);
  const desde = leer32(bytes, fin + 16);
  // `0xFFFFFFFF` en el desplazamiento es la marca de ZIP64: el de verdad va en otra estructura.
  if (desde === 0xffffffff || cuantas === 0xffff) {
    throw new Error("El zip usa el formato ZIP64, que el visor no lee. Súbelo al registro.");
  }

  const entradas: EntradaZip[] = [];
  let cursor = desde;
  for (let i = 0; i < cuantas; i++) {
    if (cursor + 46 > bytes.length || leer32(bytes, cursor) !== FIRMA_CENTRAL) {
      throw new Error("El índice del zip está dañado.");
    }
    const banderas = leer16(bytes, cursor + 8);
    const largoNombre = leer16(bytes, cursor + 28);
    const largoExtra = leer16(bytes, cursor + 30);
    const largoComentario = leer16(bytes, cursor + 32);
    // **Byte a carácter y no `TextDecoder`**, que es del navegador y `bim-core` no lo tiene. Para lo
    // que se usa el nombre —reconocer `.ifc` y la carpeta del Finder— bastan los bytes ASCII; un
    // acento en el nombre de la carpeta sale raro y no cambia la decisión.
    const nombre = String.fromCharCode(...bytes.subarray(cursor + 46, cursor + 46 + largoNombre));
    entradas.push({
      nombre,
      metodo: leer16(bytes, cursor + 10),
      bytesComprimidos: leer32(bytes, cursor + 20),
      bytesDescomprimidos: leer32(bytes, cursor + 24),
      desplazamientoCabecera: leer32(bytes, cursor + 42),
      cifrada: (banderas & 0x1) !== 0,
    });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

/**
 * El `.ifc` que trae el zip, **uno y solo uno**, con el tramo exacto de sus datos.
 *
 * `bytesMaximos` es el tope al descomprimir, el mismo número que el servidor: un IFC mayor no lo
 * abre ningún navegador —`web-ifc` es WebAssembly de 32 bits— y mejor decirlo antes de intentarlo.
 */
export function modeloDelZip(bytes: Uint8Array, bytesMaximos: number): ModeloEnZip {
  const modelos = indiceZip(bytes).filter(
    (entrada) =>
      entrada.nombre.toLowerCase().endsWith(".ifc") &&
      !entrada.nombre.endsWith("/") &&
      !entrada.nombre.startsWith("__MACOSX/"),
  );
  if (modelos.length !== 1) {
    throw new Error(
      `Un .ifczip tiene que traer exactamente un archivo .ifc; este trae ${modelos.length}.`,
    );
  }
  const modelo = modelos[0]!;
  if (modelo.cifrada) {
    throw new Error("El .ifczip está protegido con contraseña: el visor no lo puede abrir.");
  }
  if (modelo.metodo !== 0 && modelo.metodo !== 8) {
    throw new Error(
      `El .ifczip está comprimido con un método que el visor no lee (${modelo.metodo}).`,
    );
  }
  if (modelo.bytesDescomprimidos > bytesMaximos) {
    throw new Error(
      `Descomprimido, el modelo pasa de ${Math.round(bytesMaximos / 1024 / 1024)} MB: ` +
        "es demasiado grande para abrirlo en un navegador.",
    );
  }

  const cabecera = modelo.desplazamientoCabecera;
  if (cabecera + 30 > bytes.length || leer32(bytes, cabecera) !== FIRMA_LOCAL) {
    throw new Error("El zip está dañado: la entrada del modelo no está donde dice el índice.");
  }
  // **Los largos se leen de la cabecera local y no del índice**: los dos campos «extra» pueden
  // medir distinto, y usar el del índice desplazaría el inicio de los datos unos bytes.
  const inicio = cabecera + 30 + leer16(bytes, cabecera + 26) + leer16(bytes, cabecera + 28);
  const fin = inicio + modelo.bytesComprimidos;
  if (fin > bytes.length) {
    throw new Error("El zip está cortado: el modelo no llega entero.");
  }
  return {
    nombre: modelo.nombre,
    metodo: modelo.metodo,
    inicio,
    fin,
    bytesDescomprimidos: modelo.bytesDescomprimidos,
  };
}

function buscarFin(bytes: Uint8Array): number {
  const ultimo = bytes.length - LARGO_FIN;
  const primero = Math.max(0, ultimo - COMENTARIO_MAXIMO);
  for (let i = ultimo; i >= primero; i--) {
    if (leer32(bytes, i) === FIRMA_FIN) return i;
  }
  throw new Error("No es un zip válido, o está cortado: falta su índice.");
}

function leer16(bytes: Uint8Array, en: number): number {
  return (bytes[en] ?? 0) | ((bytes[en + 1] ?? 0) << 8);
}

function leer32(bytes: Uint8Array, en: number): number {
  return (
    ((bytes[en] ?? 0) |
      ((bytes[en + 1] ?? 0) << 8) |
      ((bytes[en + 2] ?? 0) << 16) |
      ((bytes[en + 3] ?? 0) << 24)) >>>
    0
  );
}
