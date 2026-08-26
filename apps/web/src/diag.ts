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
import * as OBF from "@thatopen/components-front";
import { parseDxf, suggestMetresPerUnit } from "@aerobim/bim-core";
import { BimViewer } from "@aerobim/viewer";

type Log = (linea: string) => void;

const WASM = { path: "/wasm/", absolute: true } as const;

/**
 * Informe de fidelidad de un plano: qué se leyó, qué se dibujó y qué no.
 *
 * **Es la respuesta a "el 2D no se ve como en el CAD".** Esa frase no se puede depurar: hay que
 * poder preguntarle al archivo qué trae y al visor qué hizo con cada cosa. El informe dice, por tipo
 * de entidad, cuántas entraron y cuántas quedaron fuera; y por capa, su color con **de dónde salió**,
 * su grosor y si el CAD la tiene apagada.
 *
 * Uso: `/diag.html?modo=plano&dxf=/samples/fidelidad-2d.dxf`
 *
 * El fixture `fidelidad-2d.dxf` está escrito a mano con un caso por cada defecto que se corrigió, así
 * que este modo es la comprobación de que ninguno vuelve. Los planos reales del usuario no se
 * versionan —regla de `AGENTS.md`—, pero el mismo modo los lee si están en `public/samples/`.
 */
export async function plano(
  container: HTMLElement,
  dxfUrl: string,
  log: Log,
  esperaMs = 0,
): Promise<void> {
  const t0 = performance.now();
  const texto = await (await fetch(dxfUrl)).text();
  log(
    `descargado: ${Math.round(texto.length / 1024)} KB en ${Math.round(performance.now() - t0)} ms`,
  );

  const t1 = performance.now();
  const dibujo = parseDxf(texto);
  const msLectura = Math.round(performance.now() - t1);
  const unidades = suggestMetresPerUnit(dibujo);

  log(
    `\nlectura: ${msLectura} ms — ${dibujo.polylines.length} trazos, ${dibujo.texts.length} textos, ` +
      `${dibujo.hatches.length} rellenos`,
  );
  log(`unidad: ${unidades.metresPerUnit} m/unidad (${unidades.unitName})`);
  log(`  ${unidades.reason}`);
  if (dibujo.bounds !== null) {
    const ancho = (dibujo.bounds.maxX - dibujo.bounds.minX) * unidades.metresPerUnit;
    const alto = (dibujo.bounds.maxY - dibujo.bounds.minY) * unidades.metresPerUnit;
    log(`extension de lo dibujado: ${ancho.toFixed(2)} x ${alto.toFixed(2)} m`);
  }
  log(`grosor por defecto del archivo: ${dibujo.defaultLineweightMm} mm`);

  // **Lo que no se dibuja va primero.** Es lo único que hace que el visor mienta sobre el plano.
  const omitidas = Object.entries(dibujo.skipped).sort((uno, otro) => otro[1] - uno[1]);
  log(
    `\nsin dibujar: ${omitidas.length === 0 ? "nada" : omitidas.map(([tipo, n]) => `${tipo}=${n}`).join("  ")}`,
  );
  log(`espacio papel (fuera a proposito): ${dibujo.paperSpaceCount}`);

  const porProcedencia = new Map<string, number>();
  const porGrosor = new Map<number, number>();
  for (const trazo of dibujo.polylines) {
    porProcedencia.set(trazo.color.source, (porProcedencia.get(trazo.color.source) ?? 0) + 1);
    porGrosor.set(trazo.lineweightMm, (porGrosor.get(trazo.lineweightMm) ?? 0) + 1);
  }
  log(
    `\ncolor por procedencia: ${[...porProcedencia].map(([donde, n]) => `${donde}=${n}`).join("  ")}`,
  );
  log(
    `grosores (mm): ${[...porGrosor]
      .sort((uno, otro) => otro[1] - uno[1])
      .map(([mm, n]) => `${mm}=${n}`)
      .join("  ")}`,
  );

  const porPatron = new Map<string, number>();
  for (const relleno of dibujo.hatches) {
    const clave = relleno.pattern ?? "(macizo)";
    porPatron.set(clave, (porPatron.get(clave) ?? 0) + 1);
  }
  log(
    `rellenos por patron: ${[...porPatron].map(([p, n]) => `${p}=${n}`).join("  ") || "ninguno"}`,
  );

  const porAlineacion = new Map<string, number>();
  for (const texto of dibujo.texts) {
    const clave = `${texto.hAlign}/${texto.vAlign}`;
    porAlineacion.set(clave, (porAlineacion.get(clave) ?? 0) + 1);
  }
  const multilinea = dibujo.texts.filter((uno) => uno.text.includes("\n")).length;
  log(`textos por alineacion: ${[...porAlineacion].map(([a, n]) => `${a}=${n}`).join("  ")}`);
  log(`textos de varias lineas: ${multilinea}`);

  log("\ncapas (n = trazos + textos + rellenos):");
  for (const capa of dibujo.layers) {
    log(
      `  ${capa.off ? "APAGADA" : "       "} ${String(capa.count).padStart(6)}  ` +
        `aci=${String(capa.colorIndex).padStart(4)}  lw=${String(capa.lineweightMm).padStart(5)}  ${capa.name}`,
    );
  }

  // Y ahora por el visor, que es donde el dibujo se convierte en escena.
  const viewer = await BimViewer.create(container);
  const t2 = performance.now();
  const cargado = await viewer.loadPlan(texto, dxfUrl.split("/").pop() ?? "plano");
  log(`\nescena: ${Math.round(performance.now() - t2)} ms — ${cargado.vertexCount} vertices`);
  log(
    `rotulos: ${cargado.labelCount} renglones dibujados, ${cargado.labelsDropped} sin sitio, ` +
      `de ${cargado.textCount} textos`,
  );
  log(`alto de rotulo: ${cargado.labelHeightM.toFixed(3)} m`);
  const apagadas = cargado.layers.filter((capa) => capa.off).map((capa) => capa.name);
  log(`capas que arrancan apagadas: ${apagadas.join(", ") || "ninguna"}`);

  if (esperaMs > 0) await new Promise((listo) => setTimeout(listo, esperaMs));
}

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
 * La vista fantasma mientras la cámara se mueve, para `F1.15`.
 *
 * El usuario lo dijo así: **"el modo fantasma se cae al mover"**. Eso no se depura mirando, y en
 * este entorno tampoco se puede mirar —el panel del navegador no compone fotogramas—, así que la
 * prueba es la escena misma: se cuenta cuántos materiales del modelo llevan la pintura translúcida
 * y cuántos siguen opacos, se mueve la cámara para que Fragments traiga otro nivel de detalle, y se
 * vuelve a contar. **Si aparecen sólidos donde antes no había, el defecto está.**
 *
 * Uso: `/diag.html?modo=fantasma&ifc=/samples/Piso%205.ifc`
 */
export async function fantasma(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const cuenta = (etiqueta: string) => {
    const { ghosted, solid, translucent } = viewer.paintAudit;
    const total = ghosted + solid;
    const porcentaje = total === 0 ? 0 : Math.round((ghosted / total) * 100);
    log(
      `  ${etiqueta}: ${ghosted} fantasma / ${solid} opacos / ${translucent} translucidos — ` +
        `${porcentaje} % de las caras pintado`,
    );
    return solid;
  };

  log(`estilo inicial: ${viewer.style}`);
  cuenta("solido");

  await viewer.setRenderStyle("wireframe");
  log(`\nestilo: ${viewer.style}`);
  const tras = cuenta("recien pintado");

  // Mover la cámara es lo que hace que Fragments cambie el nivel de detalle y traiga mallas
  // nuevas. Se hace en varios pasos y se cuenta en cada uno: el defecto no aparece siempre en
  // el primer movimiento, porque depende de qué nivel tocaba.
  // El movimiento va **sin transición y con `rest` emitido a mano**. Las transiciones de
  // camera-controls solo avanzan dentro de `update(delta)`, y en este entorno el panel del
  // navegador no corre el bucle de dibujo: esperar una transición cuelga la prueba (comprobado).
  // Emitir `rest` es exactamente lo que hace camera-controls cuando alguien suelta el ratón, así
  // que se mide el camino que el visor tiene de verdad y no uno inventado.
  const controls = viewer.camera.controls;
  const descansar = () =>
    (controls as unknown as { dispatchEvent: (evento: { type: string }) => void }).dispatchEvent({
      type: "rest",
    });

  let peor = tras;
  for (const [i, angulo] of [Math.PI / 6, Math.PI / 3, Math.PI / 2].entries()) {
    await controls.rotateTo(angulo, Math.PI / 3, false);
    await controls.dolly(i % 2 === 0 ? 8 : -5, false);
    controls.update(1 / 60);
    await new Promise((listo) => setTimeout(listo, 1200));
    peor = Math.max(peor, cuenta(`tras mover ${i + 1}`));
    descansar();
    await new Promise((listo) => setTimeout(listo, 1200));
    cuenta(`  y tras descansar ${i + 1}`);
  }

  await new Promise((listo) => setTimeout(listo, 2000));
  const final = cuenta("tras dejarla quieta");

  log(
    `\nveredicto: ${peor === 0 ? "el fantasma aguanta el movimiento" : `${peor} materiales se quedaron solidos al mover`}`,
  );
  log(`  y al detenerse: ${final === 0 ? "se recupera" : `siguen ${final} solidos`}`);

  const clases = Object.entries(viewer.paintAudit.solidKinds).sort((uno, otro) => otro[1] - uno[1]);
  if (clases.length > 0) {
    log("\nlos que se quedan solidos, por malla y material:");
    for (const [clase, n] of clases) log(`  ${String(n).padStart(4)}  ${clase}`);
  }

  // **Las dos regresiones que este arreglo puede causar**, y por eso se miden acá y no a ojo.
  // La pintura se aplica sobre materiales de la librería, así que salir tiene que devolverlos; y
  // la selección es opaca a propósito, así que completar la pintura no debe tragársela.
  log("\nvolver a solido:");
  await viewer.setRenderStyle("solid");
  for (const espera of [800, 1500, 1500]) {
    await new Promise((listo) => setTimeout(listo, espera));
    descansar();
    const vuelta = viewer.paintAudit;
    log(
      `  ${vuelta.ghosted} fantasma / ${vuelta.solid} opacos / ${vuelta.translucent} translucidos — ` +
        `${vuelta.ghosted === 0 ? "limpio" : "queda pintura"}`,
    );
  }

  // **La selección se mide en los dos estilos, y el sólido es la línea base.**
  //
  // Se conserva aunque el resultado sea negativo, porque el resultado *es* el dato: medido el
  // 2026-08-26, seleccionar no añade **ningún** material a la escena, ni en sólido ni en fantasma.
  // Fragments dibuja el elemento elegido por dentro de su propia pasada y no colgando una malla con
  // material nuevo, así que **este auditor es ciego a la selección**. Sin la línea base en sólido,
  // el cero en fantasma se leía como "el fantasma se tragó la selección" y no era verdad.
  //
  // Queda anotado para el siguiente que venga: si la selección dentro del fantasma da problemas,
  // hay que comprobarla mirando la pantalla, no con `paintAudit`.
  const centro = () =>
    viewer.pickAt(
      container.clientWidth / 2,
      container.getBoundingClientRect().top + container.clientHeight / 2,
    );

  for (const estilo of ["solid", "wireframe"] as const) {
    log(`\nseleccionar en estilo ${estilo}:`);
    await viewer.setRenderStyle(estilo);
    await new Promise((listo) => setTimeout(listo, 800));
    const antes = viewer.paintAudit;

    const elegido = await centro();
    if (elegido === null) {
      log("  el rayo no dio con nada al centro: no se puede medir aca");
      continue;
    }
    await new Promise((listo) => setTimeout(listo, 800));
    const despues = viewer.paintAudit;

    log(`  seleccionado: ${elegido.category ?? "?"} ${elegido.name ?? ""}`);
    log(
      `  antes ${antes.ghosted}/${antes.solid} · despues ${despues.ghosted}/${despues.solid} ` +
        `(fantasma/opacos)`,
    );
    log(
      `  materiales nuevos: ${despues.ghosted + despues.solid - antes.ghosted - antes.solid} — ` +
        `${despues.solid > antes.solid ? "aparecio uno opaco" : "el auditor es ciego a la seleccion (esperado)"}`,
    );
    await viewer.clearSelection();
  }
}

/**
 * Si las sombras están puestas de verdad, para `F1.16`.
 *
 * El usuario lo dijo así: **"no está renderizando con mejor información de sombras o realista"**.
 * Y la maquinaria está montada —`ShadowedScene`, `setup({shadows})`, postproducción
 * `COLOR_PEN_SHADOWS`—, o sea que el código dice que sí. Este modo pregunta pieza por pieza, que
 * es la única forma de separar "está apagado" de "está encendido y no llega a las mallas".
 *
 * Uso: `/diag.html?modo=sombras&ifc=/samples/Piso%205.ifc`
 */
export async function sombras(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const informe = (etiqueta: string) => {
    const a = viewer.shadowAudit;
    log(`\n${etiqueta}:`);
    log(`  mapa de sombras del renderizador: ${a.shadowMap ? "encendido" : "APAGADO"}`);
    log(`  postproduccion: ${a.postproduction ? "encendida" : "apagada"}`);
    log(`  lado mayor del modelo: ${a.modelSpanM.toFixed(1)} m`);
    log(`  luces: ${a.lights}, de ellas proyectando: ${a.lightsCasting}`);
    for (const luz of a.lightsDetail) log(`    ${luz}`);
    log(`  mallas dibujadas: ${a.meshes}`);
    log(`    proyectan sombra: ${a.casting}`);
    log(`    reciben sombra:   ${a.receiving}`);
    return a;
  };

  informe("recien cargado");

  // Se mueve la cámara para que Fragments traiga otro nivel de detalle: si las banderas se
  // ponen una sola vez al cargar, la geometría que entra después llega sin ellas.
  const controls = viewer.camera.controls;
  await controls.rotateTo(Math.PI / 5, Math.PI / 3, false);
  await controls.dolly(8, false);
  controls.update(1 / 60);
  (controls as unknown as { dispatchEvent: (e: { type: string }) => void }).dispatchEvent({
    type: "rest",
  });
  await new Promise((listo) => setTimeout(listo, 2000));
  const despues = informe("tras mover la camara");

  log("");
  if (!despues.shadowMap) log("veredicto: el renderizador no tiene sombras encendidas.");
  else if (despues.lightsCasting === 0) log("veredicto: ninguna luz proyecta sombra.");
  else if (despues.casting === 0)
    log(
      "veredicto: todo esta encendido y **ninguna malla proyecta sombra** — las banderas no llegan a la geometria.",
    );
  else if (despues.casting < despues.meshes)
    log(`veredicto: solo ${despues.casting} de ${despues.meshes} mallas proyectan sombra.`);
  else log("veredicto: las sombras estan puestas en todo lo que se dibuja.");
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
 * Las cuatro mediciones, de punta a punta y sin interfaz.
 *
 * **Esto se puede escribir desde el 2026-08-26 y antes no.** Hasta entonces la distancia, el
 * ángulo y el área las colocaba `components-front`, cuyo ajuste **lee píxeles de la escena
 * dibujada**: no había forma de comprobarlas en un entorno que no compone fotogramas, que es
 * justamente donde estaban fallando. Ahora las cuatro pasan por el rayo de la CPU, así que las
 * cuatro se pueden ejercitar acá.
 *
 * Cada una se comprueba en tres cosas distintas, que fallan por separado: que **el clic al vacío
 * se diga** (`false`), que **el valor** salga de las funciones probadas del dominio, y que **la
 * cota quede dibujada** en la lista.
 *
 * Uso: `/diag.html?modo=medidas&ifc=/samples/Piso%205.ifc`
 */
export async function medidas(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);

  const rect = container.getBoundingClientRect();
  const punto = (fx: number, fy: number) =>
    [rect.left + rect.width * fx, rect.top + rect.height * fy] as const;

  /**
   * **Una medida por carga de página, y no es una comodidad.**
   *
   * `fragments.raycast` se degrada con el uso en un panel que no compone fotogramas: medido, las
   * mismas quince coordenadas dan quince puntos, luego seis, luego ninguno, y en la práctica el
   * presupuesto son dos o tres llamadas por carga. Es la limitación que `HANDOFF.md` ya tenía
   * anotada —«ningún rayo encuentra geometría después de un par de refrescos»— y no un defecto del
   * visor: en un navegador de verdad el rayo responde.
   *
   * Así que cada medida se ejercita en su propia carga, con el rayo fresco:
   *
   * ```
   * /diag.html?modo=medidas&medida=distancia&ifc=/samples/Piso%205.ifc
   * /diag.html?modo=medidas&medida=angulo&ifc=...
   * /diag.html?modo=medidas&medida=area&ifc=...
   * /diag.html?modo=medidas&medida=perpendicular&ifc=...
   * /diag.html?modo=medidas&medida=vacio&ifc=...      ← esta no necesita rayo
   * ```
   */
  const cual = new URLSearchParams(globalThis.location?.search ?? "").get("medida") ?? "distancia";

  const clic = async (fx: number, fy: number) => {
    const [x, y] = punto(fx, fy);
    return await viewer.addMeasurePoint(x, y);
  };

  let ultimo: Record<string, unknown> | null = null;
  viewer.onMeasurement((resultado) => {
    ultimo = resultado as Record<string, unknown> | null;
  });

  const informar = (que: string, entraron: number, pedidos: number, cotas: number) => {
    if (entraron < pedidos) {
      log(`  ${entraron} de ${pedidos} clics encontraron geometria — el rayo ya no responde aqui`);
      return;
    }
    log(`  resultado: ${JSON.stringify(ultimo)}`);
    log(`  cotas dibujadas: ${cotas} ${cotas === 1 ? "(bien)" : "(MAL)"}`);
    if (ultimo === null) log(`  ${que}: NO EMITIO RESULTADO (mal)`);
  };

  // Cuatro puntos repartidos sobre el centro del lienzo, que es donde queda el modelo tras
  // encuadrar. Se reusan para las cuatro medidas: lo que se comprueba es el mecanismo.
  const cuatro = [
    [0.42, 0.45],
    [0.58, 0.45],
    [0.58, 0.58],
    [0.42, 0.58],
  ] as const;

  log(`medida = ${cual}`);

  // **El color del marcador de ajuste, comprobado y no supuesto** (`F1.12`). Venía en el mismo
  // violeta que la selección, y un punto violeta que salta de vértice en vértice se lee como una
  // selección. Se comprueba acá porque es un estático de la librería: si una versión nueva cambia
  // el nombre de la propiedad, el recolorado deja de aplicarse **en silencio**.
  const estilos = (
    OBF as unknown as {
      GraphicVertexPicker: {
        baseSnappingStyle: { borderColor?: string };
        snappingStyles: Record<string, { borderColor?: string }>;
      };
    }
  ).GraphicVertexPicker;
  const colores = [
    estilos.baseSnappingStyle.borderColor,
    ...Object.values(estilos.snappingStyles).map((uno) => uno.borderColor),
  ];
  const violeta = colores.filter((c) => /122, *75, *209|9b5de5/i.test(c ?? ""));
  log(
    `marcador de ajuste: ${colores.join(", ")} — ` +
      `${violeta.length === 0 ? "ninguno es el violeta de la seleccion (bien)" : "TODAVIA VIOLETA (mal)"}`,
  );

  let antes = viewer.measurementCount;
  let entraron = 0;

  // **El ángulo y el área se ejercitan por coordenadas del mundo, no por clics.** El rayo se agota
  // en un par de llamadas en este panel y ellos piden tres y cuatro puntos: por el clic no hay
  // forma de llegar al final. Los puntos son un triángulo rectángulo y un cuadrado de 4 m de lado,
  // elegidos porque su ángulo y su área **se saben de antemano**: 90° y 16 m². Una prueba que
  // acepta cualquier número no comprueba nada.
  const ANGULO_RECTO = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 3],
  ] as const;
  const CUADRADO = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 4],
    [0, 0, 4],
  ] as const;

  if (cual === "distancia") {
    log("\ndistancia (2 clics):");
    viewer.setMeasureMode("distance");
    ultimo = null;
    antes = viewer.measurementCount;
    entraron = 0;
    for (const [fx, fy] of cuatro.slice(0, 2)) if (await clic(fx, fy)) entraron += 1;
    informar("distancia", entraron, 2, viewer.measurementCount - antes);
  }

  if (cual === "angulo") {
    log("\nangulo (3 puntos, un triangulo rectangulo: tiene que dar 90 grados):");
    viewer.setMeasureMode("angle");
    ultimo = null;
    antes = viewer.measurementCount;
    // El vértice va en medio, que es el orden que pide la barra de estado.
    const [a, vertice, c] = ANGULO_RECTO;
    for (const p of [a, vertice, c]) viewer.addMeasurePointAt(p);
    log(`  resultado: ${JSON.stringify(ultimo)}`);
    const grados = (ultimo as { angleDeg?: number } | null)?.angleDeg;
    log(
      `  angulo: ${grados?.toFixed(2) ?? "sin resultado"} — ` +
        `${grados !== undefined && Math.abs(grados - 90) < 0.01 ? "90 grados (bien)" : "NO SON 90 (mal)"}`,
    );
    log(`  cotas dibujadas: ${viewer.measurementCount - antes}`);
  }

  if (cual === "area") {
    log("\narea (contorno de 4 puntos, un cuadrado de 4 m: 16 m2 y 16 m de perimetro):");
    viewer.setMeasureMode("area");
    ultimo = null;
    antes = viewer.measurementCount;

    for (const p of CUADRADO.slice(0, 2)) viewer.addMeasurePointAt(p);
    // **Con dos vertices no se cierra**, y eso es lo que hay que comprobar: un area de dos puntos
    // vale cero y su perimetro es el doble del segmento — un numero que existe y no dice nada.
    log(
      `  con ${viewer.areaPointCount} vertices, cerrar -> ${
        viewer.finishMeasurement() ? "CERRO (mal)" : "no cierra (bien)"
      }`,
    );
    for (const p of CUADRADO.slice(2, 4)) viewer.addMeasurePointAt(p);
    log(`  vertices puestos: ${viewer.areaPointCount}`);
    log(`  cerrar -> ${viewer.finishMeasurement() ? "cierra (bien)" : "NO CIERRA (mal)"}`);
    log(`  resultado: ${JSON.stringify(ultimo)}`);
    const medida = ultimo as { areaM2?: number; perimeterM?: number; vertices?: number } | null;
    log(
      `  area ${medida?.areaM2?.toFixed(2) ?? "?"} m2 · perimetro ${medida?.perimeterM?.toFixed(2) ?? "?"} m · ` +
        `${medida?.vertices ?? "?"} vertices — ` +
        `${
          medida?.areaM2 !== undefined &&
          Math.abs(medida.areaM2 - 16) < 0.01 &&
          medida.perimeterM !== undefined &&
          Math.abs(medida.perimeterM - 16) < 0.01
            ? "16 y 16 (bien)"
            : "NO CUADRA (mal)"
        }`,
    );
    log(`  cotas dibujadas: ${viewer.measurementCount - antes}`);
  }

  if (cual === "perpendicular") {
    // **La perpendicular no se puede ejercitar por coordenadas**, y no es una omisión: su primer
    // punto no es un punto, es una **cara** —hace falta la normal para tener plano de referencia—
    // y eso no viaja como una terna de números. Depende del rayo, con el presupuesto que haya.
    // Su comprobación propia está en `?modo=perpendicular`, que la mide con un solo par de clics.
    log("\nperpendicular (2 clics, depende del rayo — ver tambien ?modo=perpendicular):");
    viewer.setMeasureMode("perpendicular");
    ultimo = null;
    antes = viewer.measurementCount;
    entraron = 0;
    for (const [fx, fy] of cuatro.slice(0, 2)) if (await clic(fx, fy)) entraron += 1;
    informar("perpendicular", entraron, 2, viewer.measurementCount - antes);

    // **Lo que no depende del rayo va al final**, y es la mitad que antes se callaba: un clic donde
    // no hay geometria tiene que devolver `false` en los cuatro modos. Esto no se degrada, porque la
    // respuesta correcta es justamente "no hay nada".
  }

  if (cual === "vacio") {
    log("\nel clic al vacio, en los cuatro modos:");
    for (const modo of ["distance", "angle", "area", "perpendicular"] as const) {
      viewer.setMeasureMode(modo);
      const registrado = await clic(0.02, 0.02);
      log(`  ${modo} -> ${registrado ? "REGISTRADO (mal)" : "no cuenta (bien)"}`);
    }

    // Por coordenadas del mundo, no por clic: acá el rayo ya está agotado y lo que se comprueba
    // es que cancelar **suelte los puntos**, no que el rayo los encuentre.
    log("\ncancelar deja el contorno a cero:");
    viewer.setMeasureMode("area");
    for (const p of CUADRADO.slice(0, 3)) viewer.addMeasurePointAt(p);
    const antesDeCancelar = viewer.areaPointCount;
    viewer.cancelMeasurement();
    log(
      `  vertices antes ${antesDeCancelar}, despues ${viewer.areaPointCount} — ` +
        `${antesDeCancelar === 3 && viewer.areaPointCount === 0 ? "bien" : "MAL"}`,
    );

    // Y **cambiar de modo también los suelta**: quedarse con los vértices de un área a medias al
    // pasar a medir una distancia mezclaría dos medidas en una.
    viewer.setMeasureMode("area");
    for (const p of CUADRADO.slice(0, 2)) viewer.addMeasurePointAt(p);
    const antesDeCambiar = viewer.areaPointCount;
    viewer.setMeasureMode("distance");
    viewer.setMeasureMode("area");
    log(
      `  al cambiar de modo: antes ${antesDeCambiar}, despues ${viewer.areaPointCount} — ` +
        `${antesDeCambiar === 2 && viewer.areaPointCount === 0 ? "bien" : "MAL"}`,
    );
  }

  log(`\ntotal de cotas en la lista: ${viewer.measurementCount}`);
}

/**
 * La perpendicular a una cara, de punta a punta.
 *
 * Se conserva aparte de {@link medidas} porque comprueba algo que ninguna otra medición tiene: que
 * el primer clic devuelva **la normal de la cara**, que es lo que define el plano de referencia.
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
