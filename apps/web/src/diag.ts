/**
 * Diagnóstico A/B del pipeline de carga, para `F0.4`.
 *
 * Sirve para responder una pregunta concreta: cuando un IFC no termina de abrir, ¿es el
 * pipeline de That Open o es nuestra envoltura? Ejecuta el mismo flujo por los dos
 * caminos con **idéntica resolución de módulos**, que es la variable que confunde el
 * diagnóstico si se compara contra un import hecho a mano desde la consola.
 *
 * Se usa desde `public/diag.html`, no desde la aplicación.
 */

import * as OBC from "@thatopen/components";
import { BimViewer } from "@aerobim/viewer";

type Log = (linea: string) => void;

const WASM = { path: "/wasm/", absolute: true } as const;

/** Flujo mínimo, sin nuestra envoltura: solo componentes de That Open. */
export async function manual(
  container: HTMLElement,
  ifcUrl: string,
  log: Log,
  esperaMs = 0,
): Promise<void> {
  const t0 = performance.now();
  const marca = (etapa: string) => log(`  ${etapa}: ${Math.round(performance.now() - t0)} ms`);

  const components = new OBC.Components();
  const world = components
    .get(OBC.Worlds)
    .create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
  world.scene = new OBC.SimpleScene(components);
  world.renderer = new OBC.SimpleRenderer(components, container);
  world.camera = new OBC.SimpleCamera(components);
  world.scene.setup();
  components.init();
  marca("mundo");

  const fragments = components.get(OBC.FragmentsManager);
  fragments.init(await OBC.FragmentsManager.getWorker());
  marca(`fragments.init (initialized=${fragments.initialized})`);

  if (esperaMs > 0) {
    await new Promise((r) => setTimeout(r, esperaMs));
    marca(`espera de ${esperaMs} ms`);
  }

  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({ autoSetWasm: false, wasm: WASM });
  marca("ifcLoader.setup");

  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  marca(`descarga (${(bytes.byteLength / 1024).toFixed(0)} KB)`);

  const model = await ifcLoader.load(bytes, true, ifcUrl);
  marca("ifcLoader.load");

  const categorias = await model.getCategories();
  marca(`getCategories (${categorias.length})`);
}

/** Mismo flujo, a través de `@aerobim/viewer`. */
export async function clase(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const t0 = performance.now();
  const marca = (etapa: string) => log(`  ${etapa}: ${Math.round(performance.now() - t0)} ms`);

  const viewer = await BimViewer.create(container);
  marca("BimViewer.create");

  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  marca(`descarga (${(bytes.byteLength / 1024).toFixed(0)} KB)`);

  const loaded = await viewer.loadIfc(bytes, ifcUrl, (etapa) => marca(`etapa ${etapa}`));
  log(`\n${JSON.stringify(loaded.metrics, null, 2)}`);

  // Estado de la cámara tras el encuadre: sirve para verificar que la vista isométrica
  // quedó aplicada, que a ojo es difícil de distinguir de un alzado.
  const controls = viewer.camera.controls;
  const posicion = viewer.camera.three.position;
  log(
    `\ncamara: azimuth=${((controls.azimuthAngle * 180) / Math.PI).toFixed(1)}° ` +
      `polar=${((controls.polarAngle * 180) / Math.PI).toFixed(1)}° ` +
      `pos=(${posicion.x.toFixed(1)}, ${posicion.y.toFixed(1)}, ${posicion.z.toFixed(1)})`,
  );
}
