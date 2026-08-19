/**
 * Quién convierte un IFC a Fragments, y dónde.
 *
 * Existe separado del visor porque **la conversión no necesita una escena**: recibe bytes y devuelve
 * bytes. Eso la hace medible por sí sola —es lo que pide `F0.6`— y deja la puerta abierta a
 * convertir en un lugar y mostrar en otro, que es lo que hará la Fase 3 si algún día se convierte
 * una vez en el servidor y se reutiliza el `.frag`.
 *
 * **El worker lo crea la aplicación, no este paquete.** Aquí vive el protocolo y la fila de
 * peticiones; el `new Worker(...)` es cosa del empaquetador y por tanto de quien lo tiene. Se probó
 * al revés y falla de la peor manera: Vite resolvió el archivo del worker como un recurso más y,
 * por pesar menos de 4 KB, lo incrustó como URL `data:` — donde sus `import` no resuelven. En
 * desarrollo funcionaba y empaquetado no, que es la clase de diferencia que aparece en producción.
 */

import { IfcImporter } from "@thatopen/fragments";
import { IFCPROXY } from "web-ifc";

/** Dónde corre la conversión. */
export type ConvertLocation = "worker" | "main";

/**
 * Clases IFC que el importador de Fragments no procesa y **sí hay que procesar**.
 *
 * `IfcProxy` es el comodín del estándar: un producto con geometría y sitio propios, para lo que no
 * encaja en una clase concreta. El conjunto de clases del importador no lo incluye —tiene
 * `IfcBuildingElementProxy`, que es otra cosa— y el resultado es que **el elemento no se importa,
 * ni al árbol**.
 *
 * Se descubrió con un modelo real: `716-LCD-ME-ISUP-D-TEST.ifc`, una planta exportada por
 * ProStructures de Bentley, declara 805 `IFCMEMBER`, 34 `IFCCOLUMN` y **433 `IFCPROXY`**. El visor
 * mostraba la estructura de acero y faltaba todo lo demás —la maquinaria, los grandes elementos
 * curvos—: eran esos 433. El mismo modelo en OpenPlant los muestra.
 *
 * **Esta lista se amplía con datos, no con suposiciones.** El aviso de "elementos del archivo que no
 * se cargaron" del panel de modelos es el que dice qué clase falta; cuando aparezca una nueva se
 * añade acá con el modelo que la delató.
 */
const CLASES_QUE_FALTAN: readonly number[] = [IFCPROXY];

/**
 * Deja un importador listo: el WASM local y las clases que el conjunto por defecto se salta.
 *
 * **Vive acá y se usa desde los dos lados** —el conversor del hilo principal y el del worker, que
 * está en la aplicación porque crear un worker es cosa del empaquetador—. Que el worker tenga que
 * repetir esta llamada es el precio de ese reparto, y por eso está en una sola función con nombre.
 */
export function prepareImporter(importer: IfcImporter, wasmPath: string): void {
  importer.wasm = { path: wasmPath, absolute: true };
  for (const clase of CLASES_QUE_FALTAN) importer.classes.elements.add(clase);
}

/** Lo que se le pide al worker de conversión. */
export interface ConvertRequest {
  /** Identificador de la petición, para emparejar la respuesta. */
  readonly id: number;
  /** Bytes del IFC. Llegan **transferidos**, no copiados. */
  readonly bytes: Uint8Array;
  /** Carpeta desde donde se sirve el WASM de `web-ifc`, con barra final. */
  readonly wasmPath: string;
}

/** Lo que el worker de conversión devuelve. */
export type ConvertResponse =
  | { readonly id: number; readonly ok: true; readonly fragments: Uint8Array }
  | { readonly id: number; readonly ok: false; readonly message: string };

/** Un conversor de IFC a Fragments. */
export interface Converter {
  /** Convierte y devuelve los bytes del Fragments. Los de entrada pueden quedar transferidos. */
  convert(bytes: Uint8Array): Promise<Uint8Array>;
  /** Dónde corre. Se informa en las métricas: es el dato de `F0.6`. */
  readonly location: ConvertLocation;
  dispose(): void;
}

/**
 * Conversor en el hilo principal.
 *
 * **Se conserva a propósito, no por compatibilidad.** Es la referencia contra la que se mide el
 * worker: sin las dos cifras del mismo modelo en el mismo equipo, "el worker mejora" es una
 * suposición. `diag.html?modo=conversion` las compara.
 */
export function mainThreadConverter(wasmPath: string): Converter {
  let importer: IfcImporter | null = null;

  return {
    location: "main",
    async convert(bytes) {
      // Un solo importador, reutilizado: el primero libera el WASM de `web-ifc` al terminar y el
      // siguiente lo encontraría vacío.
      if (importer === null) {
        importer = new IfcImporter();
        prepareImporter(importer, wasmPath);
      }
      return importer.process({ bytes });
    },
    dispose() {
      importer = null;
    },
  };
}

/**
 * Conversor sobre un worker ya creado, con las peticiones **en fila de una en una**.
 *
 * La fila no es una precaución: el worker guarda un único `IfcImporter` con el WASM inicializado
 * dentro, y dos conversiones a la vez se pisarían ese estado. Abrir dos modelos seguidos es
 * exactamente lo que hace alguien al coordinar, así que la fila es el caso normal, no el raro.
 */
export function workerConverter(wasmPath: string, worker: Worker): Converter {
  let siguienteId = 1;
  const pendientes = new Map<
    number,
    { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }
  >();

  worker.addEventListener("message", (event: MessageEvent<ConvertResponse>) => {
    const respuesta = event.data;
    const pendiente = pendientes.get(respuesta.id);
    if (pendiente === undefined) return;
    pendientes.delete(respuesta.id);

    if (respuesta.ok) pendiente.resolve(respuesta.fragments);
    else pendiente.reject(new Error(respuesta.message));
  });

  // Un worker que muere —WASM que no carga, memoria agotada— no responde nunca. Sin esto, la
  // interfaz se quedaría esperando para siempre, que es justo el fallo que costó cerrar `F0.4`.
  worker.addEventListener("error", (event: ErrorEvent) => {
    const error = new Error(
      `El worker de conversión falló: ${event.message || "sin mensaje"}. ` +
        "Con el WASM servido en local, esto suele ser un problema de empaquetado del worker.",
    );
    for (const [, pendiente] of pendientes) pendiente.reject(error);
    pendientes.clear();
  });

  let ultima: Promise<unknown> = Promise.resolve();

  return {
    location: "worker",
    convert(bytes) {
      const enFila = ultima.then(
        () =>
          new Promise<Uint8Array>((resolve, reject) => {
            const id = siguienteId++;
            pendientes.set(id, { resolve, reject });
            const peticion: ConvertRequest = { id, bytes, wasmPath };
            // Transferido, no copiado: son megabytes.
            worker.postMessage(peticion, [bytes.buffer]);
          }),
      );

      // La fila avanza tanto si la conversión salió bien como si falló: un IFC roto no debe dejar
      // bloqueadas las siguientes.
      ultima = enFila.catch(() => undefined);
      return enFila;
    },
    dispose() {
      worker.terminate();
      pendientes.clear();
    },
  };
}
