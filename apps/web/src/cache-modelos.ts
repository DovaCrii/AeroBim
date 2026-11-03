/**
 * Caché local de modelos ya convertidos (IndexedDB).
 *
 * **Para qué:** abrir un IFC del registro cuesta descargarlo y convertirlo a Fragments cada vez
 * —en la VM, más de dos minutos para 34 MB—. Tras la primera conversión se guardan los bytes de
 * Fragments en el navegador de quien lo abrió; la siguiente apertura de **la misma revisión** los
 * carga directo, sin red ni conversión.
 *
 * **Los datos no viajan a ningún sitio:** IndexedDB es del navegador y del origen, y esto no sube
 * nada. La identidad de los elementos sigue siendo el GUID: la caché guarda los mismos bytes que
 * produjo la conversión, no propiedades aparte.
 *
 * **La clave es la revisión y la huella del archivo** (`sha256` + tamaño que declara el registro).
 * Una revisión nueva es otro id; si el archivo de una revisión cambiara, cambia la huella y la
 * entrada se descarta. También se descarta si cambió `HUELLA_DEL_CONVERSOR` del visor, que llega
 * como parámetro para que este módulo no arrastre el visor entero a las pruebas.
 *
 * **Toda llamada a IndexedDB va en `try/catch` y degrada a «no hay caché»**: modo privado, cuota
 * llena o un navegador sin IndexedDB abren el modelo como siempre, sin romper nada.
 */

import type { ModeloConvertido } from "@aerobim/viewer";

/**
 * Nombre de la base de IndexedDB. **Lo repite `services/api/static/js/vaciar-cache-al-salir.js`**,
 * que la borra al pulsar «Salir» desde el portal (que no carga este módulo): una prueba fija que
 * los dos nombres coincidan.
 */
export const NOMBRE_DB = "aerobim-cache-modelos";
const VERSION_DB = 1;
const INDICE = "indice";
const DATOS = "datos";

/** Tope absoluto de la caché: 1 GB. */
export const TOPE_MAXIMO_BYTES = 1024 * 1024 * 1024;

/** Entrada del índice: lo pequeño, para decidir qué expulsar sin leer los Fragments. */
export interface EntradaDeIndice {
  readonly revisionId: string;
  readonly huella: string;
  readonly nombre: string;
  readonly bytes: number;
  /** `Date.now()` del último guardado o uso. */
  readonly ultimoUso: number;
  /**
   * Quién llenó esta entrada (el id que da el registro). Una entrada sin él —de antes de que se
   * guardara— cuenta como de otra persona: no se sabe de quién es.
   */
  readonly usuarioId?: string;
}

/**
 * Si el índice tiene algo que no es de `usuarioId`. Un navegador compartido no debe enseñar a quien
 * entra los modelos de una obra a la que quizá no tiene acceso: ante cualquier entrada ajena o sin
 * dueño, se vacía todo.
 */
export function hayEntradasDeOtroUsuario(
  indice: readonly EntradaDeIndice[],
  usuarioId: string,
): boolean {
  return indice.some((e) => e.usuarioId !== usuarioId);
}

/** La huella del archivo de una revisión, o `null` si el registro no da una estable. */
export function huellaDeArchivo(sha256: string | undefined, tamanoBytes: number | undefined) {
  if (sha256 === undefined || sha256 === "" || tamanoBytes === undefined || tamanoBytes <= 0) {
    return null;
  }
  return `${sha256}:${tamanoBytes}`;
}

/**
 * El tope de la caché: 1 GB o, si el navegador dice cuánto cabe, la mitad de la cuota.
 * `null` en la cuota (no se pudo consultar) deja el tope absoluto.
 */
export function topeDeCache(cuotaBytes: number | null): number {
  if (cuotaBytes === null || !Number.isFinite(cuotaBytes) || cuotaBytes <= 0) {
    return TOPE_MAXIMO_BYTES;
  }
  return Math.min(TOPE_MAXIMO_BYTES, Math.floor(cuotaBytes / 2));
}

/**
 * Qué entradas expulsar para que quepa una nueva de `nuevoBytes` bajo `topeBytes`: las de uso más
 * antiguo primero. `null` si la nueva sola ya no cabe (no se guarda). Una entrada con el mismo id
 * que la nueva se reemplaza, así que no cuenta.
 */
export function planificarExpulsion(
  indice: readonly EntradaDeIndice[],
  nuevaRevisionId: string,
  nuevoBytes: number,
  topeBytes: number,
): readonly string[] | null {
  if (nuevoBytes > topeBytes) return null;
  const otras = indice
    .filter((e) => e.revisionId !== nuevaRevisionId)
    .sort((a, b) => a.ultimoUso - b.ultimoUso);
  let total = otras.reduce((suma, e) => suma + e.bytes, 0) + nuevoBytes;
  const fuera: string[] = [];
  for (const entrada of otras) {
    if (total <= topeBytes) break;
    fuera.push(entrada.revisionId);
    total -= entrada.bytes;
  }
  return fuera;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    if (typeof indexedDB === "undefined") {
      no(new Error("IndexedDB no disponible"));
      return;
    }
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(INDICE)) {
        db.createObjectStore(INDICE, { keyPath: "revisionId" });
      }
      if (!db.objectStoreNames.contains(DATOS)) {
        db.createObjectStore(DATOS, { keyPath: "revisionId" });
      }
    };
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => no(peticion.error ?? new Error("No se pudo abrir IndexedDB"));
    peticion.onblocked = () => no(new Error("IndexedDB bloqueada"));
  });
}

function pedir<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((ok, no) => {
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => no(peticion.error ?? new Error("Fallo de IndexedDB"));
  });
}

function terminada(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, no) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => no(tx.error ?? new Error("Fallo de la transacción"));
    tx.onabort = () => no(tx.error ?? new Error("Transacción abortada"));
  });
}

async function cuotaDelNavegador(): Promise<number | null> {
  try {
    const estimacion = await navigator.storage?.estimate?.();
    return estimacion?.quota ?? null;
  } catch {
    return null;
  }
}

interface RegistroDeDatos {
  readonly revisionId: string;
  readonly modelo: ModeloConvertido;
}

/**
 * Los Fragments guardados de una revisión, o `null` si no hay, la huella no coincide, la versión
 * del conversor cambió o IndexedDB falla. Anota el uso para la expulsión.
 */
export async function leerDeCache(
  revisionId: string,
  huella: string,
  huellaConversor: string,
): Promise<ModeloConvertido | null> {
  try {
    const db = await abrirDb();
    try {
      const tx = db.transaction([INDICE, DATOS], "readwrite");
      const indice = (await pedir(tx.objectStore(INDICE).get(revisionId))) as
        EntradaDeIndice | undefined;
      if (indice === undefined) return null;
      const registro = (await pedir(tx.objectStore(DATOS).get(revisionId))) as
        RegistroDeDatos | undefined;
      if (
        registro === undefined ||
        indice.huella !== huella ||
        registro.modelo.huellaConversor !== huellaConversor
      ) {
        // Obsoleta: se tira para no guardar bytes que ya no sirven.
        tx.objectStore(INDICE).delete(revisionId);
        tx.objectStore(DATOS).delete(revisionId);
        await terminada(tx);
        return null;
      }
      tx.objectStore(INDICE).put({ ...indice, ultimoUso: Date.now() });
      await terminada(tx);
      return registro.modelo;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Guarda un modelo convertido; expulsa los más antiguos si no cabe. `false` si no se guardó. */
export async function guardarEnCache(
  revisionId: string,
  huella: string,
  nombre: string,
  modelo: ModeloConvertido,
  usuarioId?: string,
): Promise<boolean> {
  try {
    const bytes = modelo.fragments.byteLength;
    const tope = topeDeCache(await cuotaDelNavegador());
    const db = await abrirDb();
    try {
      const antes = (await pedir(
        db.transaction(INDICE, "readonly").objectStore(INDICE).getAll(),
      )) as EntradaDeIndice[];
      const fuera = planificarExpulsion(antes, revisionId, bytes, tope);
      if (fuera === null) return false;
      const tx = db.transaction([INDICE, DATOS], "readwrite");
      for (const id of fuera) {
        tx.objectStore(INDICE).delete(id);
        tx.objectStore(DATOS).delete(id);
      }
      const entrada: EntradaDeIndice = {
        revisionId,
        huella,
        nombre,
        bytes,
        ultimoUso: Date.now(),
        ...(usuarioId === undefined ? {} : { usuarioId }),
      };
      tx.objectStore(DATOS).put({ revisionId, modelo } satisfies RegistroDeDatos);
      tx.objectStore(INDICE).put(entrada);
      await terminada(tx);
      return true;
    } finally {
      db.close();
    }
  } catch {
    // Cuota llena, modo privado, etc.: el modelo ya está abierto, solo no se recuerda.
    return false;
  }
}

/** Descarta la entrada de una revisión (p. ej. una copia que no se pudo cargar). */
export async function borrarDeCache(revisionId: string): Promise<void> {
  try {
    const db = await abrirDb();
    try {
      const tx = db.transaction([INDICE, DATOS], "readwrite");
      tx.objectStore(INDICE).delete(revisionId);
      tx.objectStore(DATOS).delete(revisionId);
      await terminada(tx);
    } finally {
      db.close();
    }
  } catch {
    // Sin caché no hay nada que borrar.
  }
}

/** Cuántos modelos y cuántos bytes hay en la caché; `null` si no se puede consultar. */
export async function resumenDeCache(): Promise<{ modelos: number; bytes: number } | null> {
  try {
    const db = await abrirDb();
    try {
      const todas = (await pedir(
        db.transaction(INDICE, "readonly").objectStore(INDICE).getAll(),
      )) as EntradaDeIndice[];
      return { modelos: todas.length, bytes: todas.reduce((s, e) => s + e.bytes, 0) };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Vacía la caché si la llenó otra persona (o no se sabe quién). Se llama al abrir del registro, con
 * el id del usuario actual, **antes** de leer: así quien entra después en el mismo navegador no
 * hereda ni usa lo de quien salió sin pulsar «Salir». `true` si vació.
 */
export async function vaciarSiEsDeOtroUsuario(usuarioId: string): Promise<boolean> {
  try {
    const db = await abrirDb();
    let ajena: boolean;
    try {
      const todas = (await pedir(
        db.transaction(INDICE, "readonly").objectStore(INDICE).getAll(),
      )) as EntradaDeIndice[];
      ajena = hayEntradasDeOtroUsuario(todas, usuarioId);
    } finally {
      db.close();
    }
    return ajena ? await vaciarCache() : false;
  } catch {
    return false;
  }
}

/** Borra todo lo guardado. `false` si falló. */
export async function vaciarCache(): Promise<boolean> {
  try {
    const db = await abrirDb();
    try {
      const tx = db.transaction([INDICE, DATOS], "readwrite");
      tx.objectStore(INDICE).clear();
      tx.objectStore(DATOS).clear();
      await terminada(tx);
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
