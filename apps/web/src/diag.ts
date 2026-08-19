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

  // `camera.fitToItems()` **no se llama acá aunque exista**: verificado el 2026-08-19, su
  // promesa no resuelve en este entorno y dejaba colgada la propia herramienta de
  // diagnóstico. El encuadre se hace con `fitToBox` más un `update` explícito, que sí es
  // determinista.

  // Proyección: el tipo del objeto de cámara es la evidencia objetiva de que cambió, que a
  // ojo cuesta distinguir en un modelo pequeño.
  const tipo = () => viewer.camera.three.type;
  log(`\nproyeccion inicial: ${viewer.projection} · camara ${tipo()}`);
  await viewer.setProjection("Orthographic");
  log(`tras Orthographic: ${viewer.projection} · camara ${tipo()}`);
  await viewer.setProjection("Perspective");
  log(`tras Perspective: ${viewer.projection} · camara ${tipo()}`);
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
      // La unidad va en el volcado, y con una marca cuando se deduce del nombre en vez de
      // venir declarada: es la diferencia entre un dato del archivo y una ayuda de lectura.
      const conUnidad = (prop: { value: string; unit: string | null; unitInferred: boolean }) =>
        prop.unit === null
          ? prop.value
          : `${prop.value} ${prop.unit}${prop.unitInferred ? "?" : ""}`;

      log(`atributos (${item.attributes.length}):`);
      for (const a of item.attributes.slice(0, 12)) log(`  ${a.name} = ${conUnidad(a)}`);
      log(`grupos (${item.groups.length}):`);
      for (const g of item.groups) {
        log(`  ${g.name}`);
        for (const prop of g.properties.slice(0, 10)) log(`    ${prop.name} = ${conUnidad(prop)}`);
      }
      if (encontrados >= 2) return;
    }
  }

  if (encontrados === 0) log("\nningun rayo toco geometria");
}

/**
 * Las propiedades de un elemento **elegido por categoría**, con sus unidades.
 *
 * Existe porque buscar un elemento con el ratón es un juego de puntería: en un modelo de planta el
 * centro de la pantalla es siempre maquinaria, y los perfiles de acero —los que traen los psets de
 * cantidades— hay que ir a buscarlos. Acá se piden por categoría y se lee el primero.
 *
 * Es la forma de comprobar la lectura de unidades sobre un modelo real sin depender de dónde caiga un
 * clic. La categoría se pasa en la URL: `?modo=psets&categoria=IFCMEMBER`.
 */
export async function psets(
  container: HTMLElement,
  ifcUrl: string,
  log: Log,
  _espera = 0,
  categoria = "IFCMEMBER",
): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  const loaded = await viewer.loadIfc(bytes, ifcUrl);

  log(`unidades declaradas: ${JSON.stringify(loaded.units)}`);

  const porCategoria = await loaded.model.getItemsOfCategories([new RegExp(`^${categoria}$`)]);
  const ids = Object.values(porCategoria).flat();
  log(`${categoria}: ${ids.length} elementos`);

  const primero = ids[0];
  if (primero === undefined) {
    log(`no hay ningún ${categoria} en el modelo`);
    return;
  }

  const item = await viewer.describeItemById(loaded.id, primero);
  if (item === null) {
    log("el elemento no devolvió datos");
    return;
  }

  log(`\ncategoria: ${item.category} · nombre: ${item.name ?? "sin nombre"}`);
  // El tipo declarado va al lado del valor: es lo que explica por qué una unidad aparece o no.
  const linea = (p: {
    name: string;
    value: string;
    unit: string | null;
    unitInferred: boolean;
    ifcType: string | null;
  }) =>
    `    ${p.name} = ${p.value}${p.unit === null ? "" : ` ${p.unit}`}` +
    `${p.unitInferred ? " (deducida)" : ""}   [${p.ifcType ?? "sin tipo"}]`;

  log(`atributos (${item.attributes.length}):`);
  for (const a of item.attributes) log(linea(a));
  for (const grupo of item.groups) {
    log(`\n  ${grupo.name}`);
    for (const p of grupo.properties) log(linea(p));
  }
}

/** El árbol espacial completo, para ver cómo viene estructurado el modelo. */
export async function arbol(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const trees = await viewer.getSpatialTrees();
  for (const tree of trees) {
    log(`\n=== ${tree.modelId} ===`);
    const imprimir = (nodo: (typeof tree)["root"], nivel: number) => {
      const sangria = "  ".repeat(nivel);
      log(
        `${sangria}${nodo.label}  [cat=${nodo.category ?? "null"} id=${nodo.localId ?? "null"} n=${nodo.count} ids=${nodo.localIds.length}]`,
      );
      for (const hijo of nodo.children) imprimir(hijo, nivel + 1);
    };
    imprimir(tree.root, 0);
  }
}

/**
 * `pickAt` contra `snapAt` en los mismos puntos.
 *
 * Sirve para separar "el rayo no toca nada" de "el rayo toca pero el ajuste lo descarta":
 * si `pickAt` devuelve elemento y `snapAt` no devuelve punto, el problema está en las
 * clases de ajuste.
 */
export async function medir(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const rect = container.getBoundingClientRect();
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.45, 0.6],
  ] as const) {
    const x = rect.left + rect.width * fx;
    const y = rect.top + rect.height * fy;
    const item = await viewer.pickAt(x, y);
    const punto = await viewer.snapAt(x, y);
    log(
      `(${(fx * 100).toFixed(0)}%, ${(fy * 100).toFixed(0)}%)  pickAt=${item?.category ?? "null"}  ` +
        `snapAt=${punto ? `(${punto.x.toFixed(2)}, ${punto.y.toFixed(2)}, ${punto.z.toFixed(2)})` : "null"}`,
    );
  }
}

/**
 * La perpendicular a una cara, de punta a punta.
 *
 * Existe porque **es la única medición que se puede comprobar sin interfaz**: las otras tres las
 * dibuja `components-front`, cuyo ajuste lee píxeles de la escena y por tanto necesita un navegador
 * que esté pintando. La perpendicular usa el rayo de la CPU, así que corre igual acá.
 *
 * Hace lo mismo que dos clics del usuario: busca un punto de la pantalla donde haya geometría, lo
 * usa como cara de referencia, y luego mide desde otro punto. Informa el valor y si la cota quedó
 * dibujada, que son las dos cosas que pueden fallar por separado.
 */
export async function perpendicular(
  container: HTMLElement,
  ifcUrl: string,
  log: Log,
): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const medidas: string[] = [];
  const desuscribir = viewer.onMeasurement((medida) => {
    if (medida?.mode === "perpendicular") medidas.push(`${medida.distanceM.toFixed(3)} m`);
  });

  const rect = container.getBoundingClientRect();
  const enPantalla = (fx: number, fy: number) =>
    [rect.left + rect.width * fx, rect.top + rect.height * fy] as const;

  // Se buscan dos puntos donde el rayo toque geometría: a ciegas, la mitad de la pantalla es vacío.
  const conGeometria: (readonly [number, number])[] = [];
  for (const fx of [0.5, 0.4, 0.45, 0.35, 0.55, 0.3]) {
    const [x, y] = enPantalla(fx, 0.5);
    if ((await viewer.pickAt(x, y)) !== null) conGeometria.push([x, y]);
    if (conGeometria.length === 2) break;
  }
  log(`puntos con geometria encontrados: ${conGeometria.length}`);
  if (conGeometria.length < 2) {
    log("no hay dos puntos con geometria: la camara no encuadra el modelo en este contenedor");
    desuscribir();
    return;
  }

  await viewer.clearSelection();
  viewer.setMeasureMode("perpendicular");

  const [caraReferencia, punto] = conGeometria as [
    readonly [number, number],
    readonly [number, number],
  ];

  const primero = await viewer.addMeasurePoint(...caraReferencia);
  log(`clic 1 (cara de referencia) registrado: ${primero}`);

  // Se vuelve a lanzar el rayo por los dos caminos justo antes del segundo clic: si `pickAt` toca y
  // `snapAt` no, el problema es del ajuste; si ninguno toca, algo entre medias dejó el rayo ciego.
  //
  // **En un navegador que no pinta cuadros, acá los dos dan `false`** y no es un fallo del código:
  // cada `core.update(true)` deja la geometría en un estado que el rayo no encuentra hasta que se
  // dibuja un fotograma. Este modo solo dice la verdad en un navegador a la vista.
  log(`antes del clic 2 — pickAt: ${(await viewer.pickAt(...punto)) !== null}`);
  log(`antes del clic 2 — snapAt: ${(await viewer.snapAt(...punto)) !== null}`);

  const segundo = await viewer.addMeasurePoint(...punto);
  log(`clic 2 (punto medido) registrado: ${segundo}`);

  log(`\nperpendicular medida: ${medidas.join(", ") || "ninguna"}`);
  log(`cotas dibujadas: ${viewer.measurementCount}`);

  desuscribir();
  viewer.setMeasureMode(null);
}

/** Cortes: comprueba que los planos se crean y que se quitan. */
export async function cortes(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  log(`planos al empezar: ${viewer.sectionCount}`);

  for (const eje of ["horizontal", "longitudinal", "transversal"] as const) {
    await viewer.addSection(eje);
    log(`tras corte ${eje}: ${viewer.sectionCount} plano(s)`);
  }

  await viewer.clearSections();
  log(`tras quitar los cortes: ${viewer.sectionCount}`);
}

/**
 * La respuesta de `F0.6`: cuánto bloquea la conversión, con worker y sin él.
 *
 * **La cifra que importa no es cuánto tarda, es cuánto congela.** El tiempo de conversión es
 * parecido en los dos casos —es el mismo `web-ifc` haciendo el mismo trabajo—; lo que cambia es que
 * en el hilo principal el navegador no puede hacer nada más mientras dura, y eso es lo que el
 * usuario ve como una aplicación colgada.
 *
 * Se mide con un latido: un temporizador cada 25 ms que anota el hueco más grande entre dos
 * llamadas. Si el hilo principal está bloqueado, el hueco es el bloqueo. Es la única forma honesta
 * de medirlo, porque un cronómetro alrededor de la conversión da el mismo número en los dos casos.
 */
export async function conversion(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  log(`archivo: ${(bytes.byteLength / 1024).toFixed(0)} KB`);

  // **Primero se mide el latido sin hacer nada.** En una pestaña oculta o en segundo plano, el
  // navegador limita los temporizadores a un segundo, y entonces todos los huecos miden un segundo
  // sin que nada esté bloqueado. Sin esta referencia, la medición diría lo contrario de la verdad.
  const enReposo = await mayorHuecoDelLatido(600);
  log(`latido en reposo: ${enReposo.toFixed(0)} ms de hueco máximo`);
  if (enReposo > 100) {
    log(
      "\n⚠ MEDICIÓN NO VÁLIDA EN ESTA PESTAÑA: el navegador está limitando los temporizadores, " +
        "así que el bloqueo medido es ese límite y no el de la conversión. Hay que abrir esta " +
        "página en una pestaña **a la vista** para que las cifras signifiquen algo.",
    );
  }
  log("");

  for (const donde of ["main", "worker"] as const) {
    // Un contenedor propio por medición: un visor no se puede recrear en el mismo contenedor.
    const propio = document.createElement("div");
    propio.style.height = "1px";
    container.appendChild(propio);

    // El mismo `new URL` que usa la aplicación: es el que Vite reconoce para emitir el worker.
    const viewer = await BimViewer.create(
      propio,
      donde === "worker"
        ? {
            convertWorker: new Worker(new URL("./convert.worker.ts", import.meta.url), {
              type: "module",
            }),
          }
        : {},
    );

    let mayorHueco = 0;
    let anterior = performance.now();
    const latido = setInterval(() => {
      const ahora = performance.now();
      mayorHueco = Math.max(mayorHueco, ahora - anterior);
      anterior = ahora;
    }, 25);

    // Cada visor necesita su propia copia: los bytes se transfieren al convertir y quedan vacíos.
    const copia = new Uint8Array(bytes);
    const t0 = performance.now();
    const cargado = await viewer.loadIfc(copia, `${ifcUrl}#${donde}`);
    const total = performance.now() - t0;
    clearInterval(latido);

    log(
      `${donde.padEnd(7)} → conversión ${cargado.metrics.convertMs.toFixed(0)} ms · ` +
        `hasta verlo ${total.toFixed(0)} ms · **mayor bloqueo del hilo ${mayorHueco.toFixed(0)} ms**`,
    );
  }

  log(
    "\nEl bloqueo es la cifra de F0.6: es el tiempo que la interfaz no responde. " +
      "Con el worker debe caer a decenas de milisegundos aunque la conversión tarde lo mismo.",
  );
  log(
    "La primera conversión del worker incluye su arranque —cargar el módulo e inicializar el " +
      "WASM—, así que sale más lenta que las siguientes. Eso no bloquea el hilo principal.",
  );
}

/**
 * El hueco más grande entre dos latidos de un temporizador, durante `duracionMs`.
 *
 * Es la forma de medir si el hilo principal está ocupado: un temporizador que debía saltar cada
 * 25 ms y tardó 900 en volver es un hilo bloqueado 900 ms. Un cronómetro alrededor del trabajo no
 * sirve para esto, porque da el mismo número esté bloqueado o no.
 */
function mayorHuecoDelLatido(duracionMs: number): Promise<number> {
  return new Promise((resolve) => {
    let mayor = 0;
    let anterior = performance.now();
    const latido = setInterval(() => {
      const ahora = performance.now();
      mayor = Math.max(mayor, ahora - anterior);
      anterior = ahora;
    }, 25);

    setTimeout(() => {
      clearInterval(latido);
      resolve(mayor);
    }, duracionMs);
  });
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

  // Las unidades declaradas por el archivo. Es lo primero que hay que mirar si un número del
  // panel de propiedades parece estar a escala equivocada.
  log(`\nunidades declaradas: ${JSON.stringify(loaded.units)}`);

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
