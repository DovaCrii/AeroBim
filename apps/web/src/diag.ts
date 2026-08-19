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

/**
 * Estado de la cámara paso a paso.
 *
 * Con esta prueba se encontró por qué los comandos de cámara parecían no surtir efecto, y
 * eran dos cosas: camera-controls **solo mueve la cámara dentro de `update(delta)`**, y
 * `fitToBox` **pisa los ángulos**, así que hay que encuadrar primero y rotar después. Se
 * conserva porque separa "el comando no llegó" de "el comando llegó y algo lo revirtió",
 * que a ojo son indistinguibles.
 */
export async function camara(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const controls = viewer.camera.controls;
  const estado = (etiqueta: string) => {
    const grados = (radianes: number) => ((radianes * 180) / Math.PI).toFixed(1);
    const p = viewer.camera.three.position;
    log(
      `  ${etiqueta}: azimuth=${grados(controls.azimuthAngle)}° ` +
        `polar=${grados(controls.polarAngle)}° ` +
        `pos=(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`,
    );
  };

  estado("tras cargar");

  await controls.rotateTo(Math.PI / 4, Math.PI / 3, false);
  estado("tras rotateTo(45°, 60°)");

  controls.update(1 / 60);
  estado("tras update(1/60) a mano");

  log(`\n  enabled=${controls.enabled}`);
  log(`  camara del mundo === camara de los controles: ${viewer.camera.three === controls.camera}`);
  log(`  currentWorld asignado: ${viewer.camera.currentWorld !== null}`);

  // `fitToItems` es la API propia de SimpleCamera. Si funciona, el encuadre a mano con
  // `fitToBox` sobra.
  await viewer.camera.fitToItems();
  estado("tras fitToItems()");
  controls.update(1 / 60);
  estado("tras fitToItems() + update");
}

/**
 * Qué devuelve un clic sobre el modelo.
 *
 * Lanza varios rayos en una rejilla sobre el lienzo, porque el primer punto que se elija a
 * ciegas puede caer en el vacío. Sirve para ver la forma real de los datos que entrega el
 * modelo antes de construir la interfaz encima.
 */
export async function seleccion(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  const loaded = await viewer.loadIfc(bytes, ifcUrl);

  const rect = container.getBoundingClientRect();
  let encontrados = 0;

  // Volcado crudo del primer elemento que se toque, con varias configuraciones: es la
  // única forma de saber qué claves entrega realmente el modelo en vez de suponerlas.
  const volcarCrudo = async (localId: number) => {
    for (const [etiqueta, config] of [
      ["solo por defecto", { attributesDefault: true }],
      [
        "con relaciones",
        {
          attributesDefault: true,
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
            DefinesOcurrence: { attributes: true, relations: false },
          },
        },
      ],
    ] as const) {
      const [crudo] = await loaded.model.getItemsData([localId], config);
      // Las relaciones de IFC tienen ciclos (`IsDefinedBy` → `ObjectTypeOf` → vuelta al
      // elemento), así que un `JSON.stringify` directo lanza.
      const vistos = new WeakSet<object>();
      const sinCiclos = (_clave: string, valor: unknown) => {
        if (typeof valor === "object" && valor !== null) {
          if (vistos.has(valor)) return "[ciclo]";
          vistos.add(valor);
        }
        return valor;
      };
      log(`\n### crudo (${etiqueta}) ###\n${JSON.stringify(crudo, sinCiclos, 1)?.slice(0, 2200)}`);
    }
  };

  for (const fx of [0.5, 0.4, 0.6, 0.35, 0.65]) {
    for (const fy of [0.5, 0.45, 0.55]) {
      const item = await viewer.pickAt(rect.left + rect.width * fx, rect.top + rect.height * fy);
      if (!item) continue;

      encontrados += 1;
      if (encontrados === 1) await volcarCrudo(item.localId);
      log(`\n--- clic en (${(fx * 100).toFixed(0)}%, ${(fy * 100).toFixed(0)}%) ---`);
      log(`categoria: ${item.category ?? "sin categoria"}`);
      log(`nombre: ${item.name ?? "sin nombre"}`);
      log(`GUID: ${item.guid ?? "sin GUID valido"}`);
      log(`atributos (${item.attributes.length}):`);
      for (const a of item.attributes.slice(0, 12)) log(`  ${a.name} = ${a.value}`);
      log(`grupos (${item.groups.length}):`);
      for (const g of item.groups.slice(0, 6)) {
        log(`  ${g.name}`);
        for (const prop of g.properties.slice(0, 8)) log(`    ${prop.name} = ${prop.value}`);
      }
      if (encontrados >= 2) return;
    }
  }

  if (encontrados === 0) log("\nningun rayo toco geometria");
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
