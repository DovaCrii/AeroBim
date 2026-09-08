/**
 * GUID de IFC (`IfcGloballyUniqueId`): la identidad de todo elemento del dominio.
 *
 * Un GUID de IFC es un UUID de 128 bits comprimido a 22 caracteres con un alfabeto
 * base64 propio del estándar — que **no** es el base64 de RFC 4648: usa `_` y `$`
 * como últimos dos símbolos y ordena los dígitos primero.
 *
 * Por qué esto vive en el dominio y no en la capa del visor: cada motor de IFC
 * inventa sus propios identificadores efímeros (`expressID`, índices de array,
 * posiciones en el árbol) y todos cambian entre versiones del modelo y entre
 * librerías. Un tema de coordinación que apunte a uno de ellos queda huérfano en la
 * siguiente exportación. El GUID es lo único estable, y viaja en el BCF.
 *
 * Referencia del algoritmo: buildingSMART, `IfcGloballyUniqueId`. La implementación
 * es propia — no se portó código de ningún proyecto GPL/LGPL.
 */

/** Alfabeto del estándar. El orden importa: cambiarlo produce GUIDs que nadie más lee. */
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

const GUID_LENGTH = 22;
const UUID_HEX_LENGTH = 32;

/**
 * GUID de IFC en su forma comprimida de 22 caracteres, como aparece en el archivo.
 * Tipo nominal: obliga a pasar por {@link parseIfcGuid} en vez de aceptar cualquier
 * string de 22 caracteres.
 */
export type IfcGuid = string & { readonly __brand: "IfcGuid" };

/** UUID canónico en minúsculas con guiones, p. ej. `0e2b1e0a-...`. */
export type CanonicalUuid = string & { readonly __brand: "CanonicalUuid" };

function requireByte(bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) {
    throw new Error(`ifcGuid: se esperaban 16 bytes, falta el indice ${index}`);
  }
  return value;
}

/** Codifica `value` en `length` caracteres del alfabeto IFC, del más significativo al menos. */
function encodeGroup(value: number, length: number): string {
  let out = "";
  for (let position = length - 1; position >= 0; position -= 1) {
    const digit = Math.floor(value / 64 ** position) % 64;
    out += CHARSET.charAt(digit);
  }
  return out;
}

/** Decodifica un grupo de caracteres del alfabeto IFC a su valor entero. */
function decodeGroup(chunk: string): number {
  let value = 0;
  for (const char of chunk) {
    const digit = CHARSET.indexOf(char);
    if (digit < 0) {
      throw new Error(`ifcGuid: caracter fuera del alfabeto IFC: ${JSON.stringify(char)}`);
    }
    value = value * 64 + digit;
  }
  return value;
}

/** Quita guiones y llaves, y valida que queden 32 dígitos hexadecimales. */
function normalizeUuidHex(uuid: string): string {
  const hex = uuid.replace(/[{}-]/g, "").toLowerCase();
  if (hex.length !== UUID_HEX_LENGTH || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`ifcGuid: UUID invalido: ${JSON.stringify(uuid)}`);
  }
  return hex;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = normalizeUuidHex(uuid);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Comprime un UUID a la forma de 22 caracteres que guarda el archivo IFC.
 *
 * El reparto de bits no es uniforme y esa es la parte que se implementa mal: el
 * primer byte va en **2** caracteres y los 15 restantes en cinco grupos de 3 bytes,
 * cada uno en 4 caracteres. Total 2 + 20 = 22.
 */
export function compressUuidToIfcGuid(uuid: string): IfcGuid {
  const bytes = uuidToBytes(uuid);

  let out = encodeGroup(requireByte(bytes, 0), 2);
  for (let group = 0; group < 5; group += 1) {
    const offset = 1 + group * 3;
    const value =
      (requireByte(bytes, offset) << 16) |
      (requireByte(bytes, offset + 1) << 8) |
      requireByte(bytes, offset + 2);
    out += encodeGroup(value, 4);
  }

  return out as IfcGuid;
}

/** Expande un GUID de IFC al UUID canónico en minúsculas con guiones. */
export function expandIfcGuidToUuid(guid: string): CanonicalUuid {
  if (guid.length !== GUID_LENGTH) {
    throw new Error(`ifcGuid: se esperaban ${GUID_LENGTH} caracteres, llegaron ${guid.length}`);
  }

  const firstByte = decodeGroup(guid.slice(0, 2));
  if (firstByte > 0xff) {
    // Dos caracteres codifican hasta 4095, pero solo un byte cabe en el UUID. Un
    // valor mayor significa que el string no proviene de un UUID: es un GUID falso.
    throw new Error(`ifcGuid: el primer grupo desborda un byte (${firstByte})`);
  }

  const bytes = new Uint8Array(16);
  bytes[0] = firstByte;
  for (let group = 0; group < 5; group += 1) {
    const value = decodeGroup(guid.slice(2 + group * 4, 6 + group * 4));
    const offset = 1 + group * 3;
    bytes[offset] = (value >> 16) & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = value & 0xff;
  }

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const canonical = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");

  return canonical as CanonicalUuid;
}

/**
 * `true` si el string puede ser un GUID de IFC: 22 caracteres del alfabeto y un
 * primer grupo que cabe en un byte.
 */
export function isIfcGuid(candidate: string): candidate is IfcGuid {
  if (candidate.length !== GUID_LENGTH) return false;
  for (const char of candidate) {
    if (CHARSET.indexOf(char) < 0) return false;
  }
  return decodeGroup(candidate.slice(0, 2)) <= 0xff;
}

/** Valida y marca un string como {@link IfcGuid}. Lanza si no lo es. */
export function parseIfcGuid(candidate: string): IfcGuid {
  if (!isIfcGuid(candidate)) {
    throw new Error(`ifcGuid: no es un GUID de IFC valido: ${JSON.stringify(candidate)}`);
  }
  return candidate;
}
