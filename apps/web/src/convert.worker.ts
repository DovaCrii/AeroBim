/**
 * Conversión IFC → Fragments **fuera del hilo principal**.
 *
 * Es la respuesta a `F0.6`. Convertir un IFC de 32,7 MB tarda unos **9,5 segundos**, y en el hilo
 * principal esos 9,5 segundos son de interfaz congelada: no se puede mover la cámara, no se puede
 * cancelar, y el navegador ni siquiera repinta el aviso de "convirtiendo". Acá dentro el mismo
 * trabajo no bloquea nada.
 *
 * **Se queda del lado del cliente.** No es un backend: es el mismo `web-ifc` con el mismo WASM
 * local, en otro hilo del mismo navegador. El local-first de la familia no se toca — un modelo se
 * sigue abriendo sin servidor y sin subir el archivo a ninguna parte.
 *
 * **Por qué vive en la aplicación y no en `@aerobim/viewer`.** Crear un worker es cosa del
 * empaquetador, y el empaquetador es de la aplicación. Se intentó tenerlo en el paquete y falla de
 * la peor manera: Vite trató el archivo como un recurso cualquiera y, por pesar menos de 4 KB, lo
 * incrustó como URL `data:`, donde sus `import` no resuelven. Funcionaba en desarrollo y no
 * empaquetado. El protocolo y la fila de peticiones sí viven en el paquete, en `converter.ts`.
 *
 * Lo que **no** se mueve acá es `core.load`: cargar el Fragments en la escena tiene que ocurrir
 * donde vive la escena, y Fragments ya usa su propio worker para eso.
 */

import type { ConvertRequest, ConvertResponse } from "@aerobim/viewer";
import { IfcImporter } from "@thatopen/fragments";
import { IFCPROXY } from "web-ifc";

/**
 * El importador, creado una sola vez.
 *
 * **Crear uno por conversión rompe la segunda.** El primero inicializa el WASM de `web-ifc`, que
 * vive en una variable de módulo, y al terminar lo libera; el siguiente encuentra el módulo liberado
 * y aborta con `both async and sync fetching of the wasm failed`. Es la misma trampa que había en el
 * hilo principal, y acá vuelve a aplicar porque el worker también es un módulo con su propio estado.
 */
let importer: IfcImporter | null = null;

function importadorPara(wasmPath: string): IfcImporter {
  if (importer === null) {
    importer = new IfcImporter();
    importer.wasm = { path: wasmPath, absolute: true };

    // **`IfcProxy` se añade a mano**, porque el conjunto de clases del importador no lo trae y sin
    // él sus elementos no se importan —ni al árbol—. Un modelo de planta de ProStructures declara
    // cientos: es lo que faltaba en `716-LCD-ME-ISUP-D-TEST.ifc`.
    //
    // No se llama a `prepareImporter` de `@aerobim/viewer` aunque exista y haga esto mismo:
    // importarlo desde acá arrastraría three.js y los componentes al worker, que solo necesita el
    // conversor. **Si esa lista crece, hay que crecerla en los dos sitios** — ver `converter.ts`.
    importer.classes.elements.add(IFCPROXY);
  }
  return importer;
}

/** Responde con transferencia: son megabytes, y copiarlos costaría otra vez su tamaño. */
function responder(respuesta: ConvertResponse, transferibles: Transferable[]): void {
  self.postMessage(respuesta, { transfer: transferibles });
}

self.addEventListener("message", (event: MessageEvent<ConvertRequest>) => {
  const { id, bytes, wasmPath } = event.data;

  void (async () => {
    try {
      const fragments = await importadorPara(wasmPath).process({ bytes });
      responder({ id, ok: true, fragments }, [fragments.buffer]);
    } catch (error: unknown) {
      responder(
        {
          id,
          ok: false,
          message: error instanceof Error ? error.message : "Error desconocido al convertir el IFC",
        },
        [],
      );
    }
  })();
});
