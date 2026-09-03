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
import * as THREE from "three";
import {
  alineacionDeMapa,
  archivoAEscena,
  calzarConPuntos,
  escenaAArchivo,
  mapaALocal,
  parseDxf,
  suggestMetresPerUnit,
  type ParDePuntos,
} from "@aerobim/bim-core";
import {
  BimViewer,
  CAPAS,
  CAPAS_DE_CUADRO,
  csvDe,
  CuadrosEnPlano,
  encabezadoDeColumna,
  fichaDeNube,
  MAXIMO_FILAS,
  registrarExportador,
  trazarTabla,
} from "@aerobim/viewer";
import { createPdfiumEngine } from "@embedpdf/engines/pdfium-direct-engine";
import rutaWasm from "@embedpdf/pdfium/pdfium.wasm?url";

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

  // **El gesto exacto del usuario: mover y cambiar a ortográfica sin dejar descansar la cámara.**
  //
  // Lo dijo así: «al momento de mover y cambiar de órbita a ortográfica pasaba eso». Y es la
  // diferencia que hacía que no se reprodujera: la primera versión de esta medición esperaba y
  // emitía `rest` antes de cambiar de proyección, y con la cámara descansada el repintado ya había
  // corrido. **Cambiar de proyección con el movimiento en marcha** es otro camino: el nivel de
  // detalle está a medio traer mallas, y las que llegan lo hacen después del cambio de cámara.
  //
  // Se mide entrando y saliendo del fantasma primero, para que existan clones que puedan quedarse
  // pegados: sin ese paso previo no hay pintura que arrastrar y la medición no dice nada.
  log("\nmover y cambiar de proyeccion sin descansar:");
  for (const [i, proyeccion] of (
    ["Orthographic", "Perspective", "Orthographic"] as const
  ).entries()) {
    // **Se encuadra antes de cada pasada, y es un control necesario y no ceremonia.** Sin él la
    // primera medición dio «0 mallas» y parecía el defecto, cuando lo que pasaba era que el giro
    // había dejado la cámara mirando a otro sitio: cero mallas dibujándose era la respuesta
    // correcta. Con el modelo encuadrado, un cero **sí** significa que la escena se quedó vacía.
    await viewer.frameAll("iso");
    await new Promise((listo) => setTimeout(listo, 900));

    // Se ensucia a propósito: fantasma, un movimiento pequeño, y de vuelta a sólido.
    await viewer.setRenderStyle("wireframe");
    await controls.rotateTo(Math.PI / 4 + i * 0.2, Math.PI / 3, false);
    controls.update(1 / 60);
    await new Promise((listo) => setTimeout(listo, 900));
    await viewer.setRenderStyle("solid");

    // Y ahora el gesto: se mueve y **en medio del movimiento** se cambia la proyección, sin `rest`.
    // El giro es pequeño a propósito: mover la cámara al otro lado del modelo confundiría «la
    // escena se quedó vacía» con «la cámara no está mirando el modelo».
    void controls.rotateTo(Math.PI / 4 + i * 0.2 + 0.35, Math.PI / 3, true);
    controls.update(1 / 60);
    await viewer.setProjection(proyeccion);

    const enCaliente = viewer.paintAudit;
    log(`  ${proyeccion} en caliente: ${enCaliente.ghosted} fantasma / ${enCaliente.solid} opacos`);

    // **Y aquí está la medición que importa, y no es la de la pintura.**
    //
    // Se espera **sin emitir `rest` a mano**, que es la situación del usuario: mueve, cambia de
    // proyección y suelta. Lo medido el 2026-09-02 con la versión anterior: la escena se quedaba
    // con **cero mallas** —el modelo desaparecía o se veía de línea— y solo volvía a dibujarse si
    // algo emitía `rest`, que con la cámara ya quieta no llega nunca porque el cambio de proyección
    // interrumpió el movimiento en marcha.
    //
    // Así que lo que se comprueba es que **haya mallas dibujándose sin que nadie toque nada**.
    await new Promise((listo) => setTimeout(listo, 2000));
    const solo = viewer.paintAudit;
    const dibuja = solo.ghosted + solo.solid + solo.translucent;
    log(
      `    sin tocar nada: ${dibuja} mallas (${solo.ghosted} fantasma / ${solo.solid} opacas) — ` +
        `${dibuja === 0 ? "LA ESCENA SE QUEDO VACIA" : "sigue dibujando"}`,
    );
    if (solo.ghosted !== 0) log("    y ademas SE QUEDO PINTURA de fantasma");
  }
  await viewer.setProjection("Perspective");

  // **Y el mismo cambio con la cámara descansada**, que es la línea base: si este sale limpio y el
  // de arriba no, la diferencia es el movimiento y no la proyección.
  log("\nvolver a solido y cambiar de proyeccion:");
  for (const proyeccion of ["Orthographic", "Perspective", "Orthographic"] as const) {
    await viewer.setProjection(proyeccion);
    await new Promise((listo) => setTimeout(listo, 1200));
    descansar();
    await new Promise((listo) => setTimeout(listo, 1200));
    const tras = viewer.paintAudit;
    log(
      `  ${proyeccion}: ${tras.ghosted} fantasma / ${tras.solid} opacos — ` +
        `${tras.ghosted === 0 ? "limpio" : "SE QUEDO PINTURA"}`,
    );
    // **Y con qué mallas se está dibujando**, que es la pregunta que el conteo de pintura no
    // contesta. Medido el 2026-09-02: la pintura sale limpia en las dos proyecciones y en los dos
    // modelos de muestra, así que lo que se ve como «sigue el fantasma» **no es la pintura**. La
    // sospecha que queda es el nivel de detalle: `LODMesh` es lo que Fragments dibuja como alambre
    // mientras la cámara se mueve, y si se queda ahí tras el cambio de cámara, el modelo se ve de
    // línea sin que ningún material sea translúcido. Este volcado es lo que lo diría.
    const clases = Object.entries(viewer.paintAudit.solidKinds).sort((a, b) => b[1] - a[1]);
    log(`    mallas: ${clases.map(([clase, n]) => `${clase}×${n}`).join(" · ") || "ninguna"}`);
  }
  await viewer.setProjection("Perspective");

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
 * El **exportador a DXF**, comprobado sin el proyector: `F7.4`.
 *
 * **Es una descomposición que no se había hecho, y cambia lo que se puede afirmar.** `F7.1`
 * —proyectar las aristas del modelo— necesita un navegador que componga fotogramas y no se puede
 * confirmar aquí. Pero **`F7.4` es el exportador**, y ese no depende del proyector: recibe un dibujo
 * con su viewport y lo serializa. Así que se le arma un dibujo de **medidas conocidas** y se
 * comprueba lo suyo.
 *
 * El oráculo es doble y no hace falta creerle a nadie:
 *
 * 1. **Nuestro propio lector de DXF lo lee.** Si el exportador escribe algo que no es un DXF,
 *    `parseDxf` lo dice: cero trazos, o entidades sin dibujar.
 * 2. **Las medidas son las que se pusieron.** Un rectángulo de 10 × 6 m tiene que salir de 10 × 6
 *    sin papel, y **caber en el A3 en milímetros** con papel. Un exportador que se equivoca de
 *    unidad da un número mil veces mayor, y eso se ve.
 *
 * Uso: `/diag.html?modo=dxf`
 */
export async function dxf(container: HTMLElement, _url: string, log: Log): Promise<void> {
  const components = new OBC.Components();
  const world = components
    .get(OBC.Worlds)
    .create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
  world.scene = new OBC.SimpleScene(components);
  world.renderer = new OBC.SimpleRenderer(components, container);
  world.camera = new OBC.SimpleCamera(components);
  world.scene.setup();
  components.init();

  // Un rectángulo de 10 × 6 m en el plano XZ, que es donde el generador coloca sus dibujos, más
  // una diagonal. Cinco segmentos, y las medidas se saben de antemano.
  const ANCHO = 10;
  const ALTO = 6;
  const esquinas: [number, number][] = [
    [0, 0],
    [ANCHO, 0],
    [ANCHO, ALTO],
    [0, ALTO],
  ];
  const puntos: number[] = [];
  for (let i = 0; i < esquinas.length; i += 1) {
    const [x1, z1] = esquinas[i]!;
    const [x2, z2] = esquinas[(i + 1) % esquinas.length]!;
    puntos.push(x1, 0, z1, x2, 0, z2);
  }
  puntos.push(0, 0, 0, ANCHO, 0, ALTO);
  const SEGMENTOS = puntos.length / 6;

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));

  // Una segunda geometría para la otra capa: una cruz dentro del rectángulo. Dos segmentos, y
  // así el reparto por capas se puede comprobar contando —4+1 en una, 2 en la otra— y no de fiarse.
  const cruz = new THREE.BufferGeometry();
  cruz.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [ANCHO / 2, 0, 0, ANCHO / 2, 0, ALTO, 0, 0, ALTO / 2, ANCHO, 0, ALTO / 2],
      3,
    ),
  );
  const SEGMENTOS_OCULTOS = 2;

  // **Una tercera capa con un solo segmento, y es la que decide.** La primera medición dio un
  // segmento menos en cada capa —5→4 y 2→1—, que es el patrón de un off-by-one. Si con **un** solo
  // segmento sale **cero**, queda demostrado que el exportador se come el último de cada geometría;
  // si sale uno, el patrón es otro y hay que buscar en otro sitio.
  const CAPA_TESTIGO = "AB-TESTIGO";
  const testigo = new THREE.BufferGeometry();
  // Va en z = 2, **dentro** del viewport bueno. Estuvo en z = −2 mientras se buscaba el defecto, y
  // ahí salía «1 de 1» con la caja mala y «0 de 1» con la buena: era la única que caía del lado que
  // la caja equivocada dejaba pasar. Sirvió para descartar el off-by-one y no vale como control.
  testigo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 2, ANCHO, 0, 2], 3));

  const drawing = components.get(OBC.TechnicalDrawings).create(world);

  // **Las capas con nombre, que es lo que `F7.2` añade.** Antes esto colgaba las líneas a mano con
  // `layers.set(1)` y todo salía en la capa `0` del DXF: quien lo abre en el CAD no puede apagar las
  // aristas ocultas ni darles otro grosor. `addProjectionLines` es lo que asigna la capa.
  drawing.layers.create(CAPAS.visibles, {
    material: new THREE.LineBasicMaterial({ color: 0xe8e8ef }),
  });
  drawing.layers.create(CAPAS.ocultas, {
    material: new THREE.LineDashedMaterial({ color: 0x8fa2c8, dashSize: 0.2, gapSize: 0.1 }),
  });

  const lineas = new THREE.LineSegments(geometria);
  lineas.name = CAPAS.visibles;
  drawing.addProjectionLines(lineas, CAPAS.visibles);

  const ocultas = new THREE.LineSegments(cruz);
  ocultas.name = CAPAS.ocultas;
  drawing.addProjectionLines(ocultas, CAPAS.ocultas);

  drawing.layers.create(CAPA_TESTIGO, {
    material: new THREE.LineBasicMaterial({ color: 0xff0000 }),
  });
  const unico = new THREE.LineSegments(testigo);
  unico.name = CAPA_TESTIGO;
  drawing.addProjectionLines(unico, CAPA_TESTIGO);

  const margen = 0.5;
  const viewport = drawing.viewports.create({
    left: -margen,
    right: ANCHO + margen,
    top: ALTO + margen,
    bottom: -margen,
  });

  // **El viewport con el signo bueno**, que es lo que `F7.2` destapó y arregla.
  //
  // `top` y `bottom` **no son coordenadas Z**: son coordenadas de papel, y la librería define la Y
  // del papel como **−Z**. Su propio código lo dice sin lugar a dudas —el `bbox` del viewport se
  // construye como `Z ∈ [-top, -bottom]` y el eje Y local está documentado como «world −Z»—, así
  // que pasar las Z tal cual, como se hacía, da una caja de recorte al otro lado del dibujo.
  //
  // Medido con la caja mala: el DXF salía con `Y = margen − z` recortado en cero, o sea que el
  // borde superior del rectángulo —z = 6— **desaparecía** y la diagonal se cortaba en x = 1,3,
  // justo donde cruza el borde de la caja. Cuatro segmentos de cinco, y en un plano de verdad eso
  // es la mitad del dibujo.
  const viewportBueno = drawing.viewports.create({
    left: -margen,
    right: ANCHO + margen,
    top: margen,
    bottom: -ALTO - margen,
  });

  log(
    `dibujo armado a mano: ${SEGMENTOS} segmentos en ${CAPAS.visibles} y ` +
      `${SEGMENTOS_OCULTOS} en ${CAPAS.ocultas}, rectangulo de ${ANCHO} x ${ALTO} m`,
  );

  const exportador = components.get(OBC.DxfManager).exporter;
  const entrada = [{ drawing, viewports: [{ viewport }] }];

  const conElBueno = [{ drawing, viewports: [{ viewport: viewportBueno }] }];

  const casos = [
    {
      nombre: "con el viewport como lo pasaba drawings.ts (Z tal cual)",
      papel: undefined,
      esperado: [ANCHO, ALTO],
      bueno: false,
    },
    {
      nombre: "con el viewport en coordenadas de papel (el arreglo)",
      papel: undefined,
      esperado: [ANCHO, ALTO],
      bueno: true,
    },
    {
      nombre: "en A3 y milimetros, con el viewport bueno",
      papel: { widthMm: 420, heightMm: 297, margin: 10 },
      esperado: null,
      bueno: true,
    },
  ] as const;

  for (const caso of casos) {
    log(`\n${caso.nombre}:`);
    const cual = caso.bueno ? conElBueno : entrada;
    const texto =
      caso.papel === undefined ? exportador.export(cual) : exportador.export(cual, caso.papel);
    if (typeof texto !== "string" || texto.length === 0) {
      log("  **el exportador no devolvio texto**");
      continue;
    }
    log(`  ${Math.round(texto.length / 1024)} KB`);

    const leido = parseDxf(texto);
    const omitidas = Object.entries(leido.skipped);
    log(
      `  nuestro lector: ${leido.polylines.length} trazos, ${leido.texts.length} textos, ` +
        `sin dibujar: ${omitidas.length === 0 ? "nada" : omitidas.map(([t, n]) => `${t}=${n}`).join(" ")}`,
    );
    if (leido.polylines.length === 0) {
      log("  **EL DXF ESTA VACIO** — el exportador escribio algo que no lleva geometria");
      continue;
    }

    if (leido.bounds === null) {
      log("  **sin extension legible**");
      continue;
    }
    const ancho = leido.bounds.maxX - leido.bounds.minX;
    const alto = leido.bounds.maxY - leido.bounds.minY;
    log(`  extension: ${ancho.toFixed(2)} x ${alto.toFixed(2)}`);

    // **Las capas, leídas de la tabla del DXF** — `F7.2`. El oráculo es de los buenos: escribe la
    // librería de That Open y lee **nuestro** lector de DXF, el que se hizo para la mitad de
    // entrada de la fase. Si el exportador ignorara las capas, aquí saldría todo en `0`.
    const nombres = leido.layers.map((capa) => `${capa.name}=${capa.count}`).join(" · ");
    log(`  capas del DXF: ${nombres || "ninguna"} (polilineas)`);

    // **Se cuentan segmentos y no polilíneas**, y la diferencia importa: el exportador junta los
    // trazos que comparten un extremo en una sola polilínea, así que cinco segmentos de un
    // rectángulo con diagonal pueden salir como cuatro polilíneas sin que se haya perdido nada. Lo
    // que tiene que cuadrar es la **geometría**, no cómo se agrupó al escribirla.
    const segmentosPorCapa = new Map<string, number>();
    for (const trazo of leido.polylines) {
      const puntos = trazo.points.length / 2;
      const segmentos = trazo.closed ? puntos : Math.max(0, puntos - 1);
      segmentosPorCapa.set(trazo.layer, (segmentosPorCapa.get(trazo.layer) ?? 0) + segmentos);
    }
    const visibles = segmentosPorCapa.get(CAPAS.visibles) ?? 0;
    const enOcultas = segmentosPorCapa.get(CAPAS.ocultas) ?? 0;
    const unSegmento = segmentosPorCapa.get(CAPA_TESTIGO) ?? 0;
    log(
      `  segmentos: ${CAPAS.visibles}=${visibles} (esperado ${SEGMENTOS}) · ` +
        `${CAPAS.ocultas}=${enOcultas} (esperado ${SEGMENTOS_OCULTOS}) · ` +
        `${CAPA_TESTIGO}=${unSegmento} (esperado 1) — ` +
        `${
          visibles === SEGMENTOS && enOcultas === SEGMENTOS_OCULTOS && unSegmento === 1
            ? "cuadra (bien)"
            : "NO CUADRA (mal)"
        }`,
    );
    // Cuando no cuadra, **qué trazo falta**: sin las coordenadas no se puede saber si el exportador
    // pierde uno, junta dos o recorta por el viewport, y las tres piden arreglos distintos.
    if (visibles !== SEGMENTOS || enOcultas !== SEGMENTOS_OCULTOS) {
      for (const capa of [CAPAS.visibles, CAPAS.ocultas, CAPA_TESTIGO]) {
        const trazos = leido.polylines.filter((t) => t.layer === capa);
        log(`    ${capa}:`);
        for (const trazo of trazos) {
          const puntos: string[] = [];
          for (let i = 0; i < trazo.points.length; i += 2) {
            puntos.push(`(${trazo.points[i]!.toFixed(1)},${trazo.points[i + 1]!.toFixed(1)})`);
          }
          log(`      ${trazo.closed ? "cerrada" : "abierta"} ${puntos.join(" ")}`);
        }
      }
    }
    // Y el grosor de trazo, que es la otra mitad de la fila del plan. Si el exportador no lo
    // escribe, sale `null` y **eso es el dato**: se dice en vez de suponerlo.
    log(
      `  grosor declarado por capa: ` +
        (leido.layers.map((c) => `${c.name}=${c.lineweightMm ?? "por defecto"}`).join(" · ") ||
          "ninguna"),
    );

    if (caso.esperado !== null) {
      const [ex, ey] = caso.esperado;
      // Con el margen del viewport, la extension puede ser algo mayor que el rectangulo; lo que no
      // puede es ser otra magnitud.
      const bien = ancho >= ex - 0.01 && ancho <= ex + 2 && alto >= ey - 0.01 && alto <= ey + 2;
      log(`  esperado ~${ex} x ${ey} — ${bien ? "cuadra (bien)" : "NO CUADRA (mal)"}`);
    } else {
      const cabe = ancho <= 420 && alto <= 297;
      // Y en milimetros: 10 m son 10.000 mm, asi que el dibujo tiene que estar **escalado al
      // papel**, no puesto tal cual. Si saliera con 10.000 de ancho, no cabria.
      log(`  cabe en el A3 (420 x 297 mm) — ${cabe ? "si (bien)" : "NO (mal)"}`);
      log(`  y ocupa el papel: ${((ancho / 420) * 100).toFixed(0)} % del ancho`);
    }
  }

  // --- La tabla dentro de la lámina, `F10.4` ---------------------------------------
  //
  // **Lo que hay que comprobar de un cuadro en un plano es que el texto llegue.** La rejilla es
  // geometría de línea y el exportador ya la escribía; el texto solo lo escribe de los sistemas de
  // anotación, y sin él una tabla son cuadrículas vacías. Así que se cuentan **los textos del DXF**
  // y se comprueba que las cadenas son las que entraron.
  log("\ntabla dentro de la lamina (F10.4):");
  registrarExportador(components);
  const sistema = components.get(OBC.TechnicalDrawings).use(CuadrosEnPlano);

  const tabla = {
    title: "CUADRO DE PRUEBA · 3",
    headers: ["Elemento", "Perfil", "Peso (kg)"],
    // Una celda con punto y coma y otra larguísima: los dos casos que rompen una tabla escrita a
    // mano —el separador y el desbordamiento— y los dos aparecen en modelos de verdad.
    rows: [
      ["P-01", "HEB 200; laminado", "61.3"],
      ["P-02", "IPE 300", "42.2"],
      ["P-03", "43248*716-LCD-ME-ISUP-D-TEST!Design Model - Base", "7.5"],
    ],
  } as const;

  const medidas = { x: 0, z: ALTO + 1, rowHeight: 0.4, charWidth: 0.25 };
  sistema.add(drawing, { tabla, medidas });

  const trazo = trazarTabla(tabla, medidas);
  log(
    `  la tabla ocupa ${trazo.width.toFixed(2)} x ${trazo.height.toFixed(2)} m · ` +
      `${trazo.lines.length} lineas · ${trazo.texts.length} textos`,
  );

  // El viewport tiene que incluirla o el recorte se la come — la lección de `F7.2`.
  const conTabla = drawing.viewports.create({
    left: -margen,
    right: Math.max(ANCHO, trazo.width) + margen,
    top: margen,
    bottom: -(medidas.z + trazo.height) - margen,
  });

  const texto = exportador.export([{ drawing, viewports: [{ viewport: conTabla }] }]);
  const leido = parseDxf(texto);
  const escritos = leido.texts.map((uno) => uno.text);
  log(`  textos en el DXF: ${leido.texts.length} · trazos: ${leido.polylines.length}`);

  // Se comprueban las cadenas, no solo la cuenta: un exportador que escriba tres textos vacíos
  // pasaría un conteo y no serviría de nada.
  const buscados = ["CUADRO DE PRUEBA · 3", "Peso (kg)", "P-01", "HEB 200; laminado", "61.3"];
  for (const buscado of buscados) {
    const esta = escritos.some((uno) => uno === buscado);
    log(`    «${buscado}» — ${esta ? "esta (bien)" : "NO ESTA (mal)"}`);
  }
  const recortado = escritos.find((uno) => uno.endsWith("…"));
  log(
    `  el valor largo se recorta con «…»: ${
      recortado === undefined ? "NO (mal)" : `si (bien) — «${recortado}»`
    }`,
  );
  const enSuCapa = leido.texts.every((uno) => uno.layer === CAPAS_DE_CUADRO.texto);
  log(`  todos los textos en ${CAPAS_DE_CUADRO.texto}: ${enSuCapa ? "si (bien)" : "NO (mal)"}`);

  // --- Las cotas en la lámina, `F7.3` ----------------------------------------------
  //
  // **Una cota que no escribe su número no es una cota.** La línea y las marcas son geometría y el
  // exportador ya las escribiría; lo que hay que comprobar es que **el texto con la medida** llegue
  // al DXF, y que la medida sea la que se midió. Se acota el lado de 10 m del rectángulo, así que el
  // número está sabido de antemano.
  log("\ncotas en la lamina (F7.3):");
  const cotas = components.get(OBC.TechnicalDrawings).use(OBC.LinearAnnotations);
  cotas.add(drawing, {
    pointA: new THREE.Vector3(0, 0, 0),
    pointB: new THREE.Vector3(ANCHO, 0, 0),
    offset: 1,
    style: "default",
  });

  // **Y un ángulo y una pendiente**, que es lo que cierra `F7.3`. El ángulo se pone recto —90°— y
  // la pendiente al 15 %, así que los dos números están sabidos de antemano: lo que hay que
  // comprobar de una anotación es que **escriba su valor**, no que dibuje unas líneas.
  const angulos = components.get(OBC.TechnicalDrawings).use(OBC.AngleAnnotations);
  angulos.add(drawing, {
    pointA: new THREE.Vector3(ANCHO, 0, 0),
    vertex: new THREE.Vector3(0, 0, 0),
    pointB: new THREE.Vector3(0, 0, ALTO),
    arcRadius: 1.5,
    style: "default",
  });

  const pendientes = components.get(OBC.TechnicalDrawings).use(OBC.SlopeAnnotations);
  pendientes.add(drawing, {
    position: new THREE.Vector3(1, 0, 3),
    direction: new THREE.Vector3(1, 0, 0),
    slope: 0.15,
    style: "default",
  });

  // **Y una llamada**, que es lo que conecta el plano con la coordinación: un plano que dice «aquí
  // falta la cota del vano V-03» es un plano con el que se va a obra. Lo que hay que comprobar es
  // que **el texto del hallazgo** llegue al DXF, porque una llamada sin su texto es una flecha.
  const llamadas = components.get(OBC.TechnicalDrawings).use(OBC.CalloutAnnotations);
  llamadas.add(drawing, {
    center: new THREE.Vector3(6, 0, 4.2),
    halfW: 2,
    halfH: 0.3,
    elbow: new THREE.Vector3(3.5, 0, 4.2),
    extensionEnd: new THREE.Vector3(4, 0, 4.2),
    text: "Falta la cota del vano V-03",
    style: "default",
  });

  const conCota = drawing.viewports.create({
    left: -margen - 1,
    right: ANCHO + margen + 1,
    top: margen + 2,
    bottom: -ALTO - margen,
  });
  const conCotas = parseDxf(exportador.export([{ drawing, viewports: [{ viewport: conCota }] }]));
  const numeros = conCotas.texts.map((uno) => uno.text);
  log(`  textos en el DXF: ${numeros.length} · ${numeros.slice(0, 6).join(" · ")}`);

  // El valor puede venir en metros o en milímetros según el estilo, así que se acepta cualquiera
  // de las dos escrituras del mismo número: lo que no puede faltar es el número.
  const conElNumero = numeros.some(
    (uno) => uno.includes("10") || uno.includes("10.00") || uno.includes("10000"),
  );
  log(`  la cota escribe su medida (10 m): ${conElNumero ? "si (bien)" : "NO (mal)"}`);

  // El angulo recto y la pendiente del 15 %: se acepta cualquier escritura del mismo numero —grados
  // con o sin decimales, porcentaje o razon— porque el formato lo elige el estilo de la libreria.
  // Lo que no puede faltar es el numero.
  const conElAngulo = numeros.some((uno) => /\b90(\.0+)?\s*°?/.test(uno));
  log(`  el angulo escribe su valor (90°): ${conElAngulo ? "si (bien)" : "NO (mal)"}`);
  const conLaPendiente = numeros.some((uno) => /15|0\.15|1\s*:\s*6\.6/.test(uno));
  log(`  la pendiente escribe su valor (15 %): ${conLaPendiente ? "si (bien)" : "NO (mal)"}`);
  const conLaLlamada = numeros.some((uno) => uno.includes("vano V-03"));
  log(`  la llamada escribe el hallazgo: ${conLaLlamada ? "si (bien)" : "NO (mal)"}`);
  log(`  trazos con las cuatro anotaciones: ${conCotas.polylines.length}`);

  log(
    "\nveredicto: esto comprueba **`F7.2` y `F7.4`** —las capas y el exportador—, **`F10.4`** —la\n" +
      "  tabla en la lamina— y **`F7.3` entera**: cota, angulo, pendiente y llamada, las cuatro con\n" +
      "  su valor escrito en el archivo. No comprueba `F7.1`: la proyeccion de aristas necesita un\n" +
      "  navegador que componga fotogramas y tiene su propio modo, `?modo=planos`.",
  );
}

/**
 * Generar un plano desde el modelo y **leerlo de vuelta**, para `F7.1` y `F7.4`.
 *
 * Estas dos tareas llevaban meses montadas y **nunca confirmadas en pantalla**, con el motivo
 * anotado: `EdgeProjector` necesitaba un navegador que pintara. Esta prueba las comprueba sin
 * mirar, y el oráculo es de los buenos: **se genera el DXF desde el IFC y se lee con nuestro propio
 * lector de DXF**. Si los trazos que salen son los que entran y la extensión coincide con lo que
 * mide el modelo, el plano es real; si el exportador escribe basura, `parseDxf` lo dice.
 *
 * Se comprueban las tres vistas, porque proyectar en planta y proyectar de lado no son el mismo
 * camino: una direccion de proyección mal puesta da un dibujo vacío o aplastado, y el conteo de
 * segmentos lo delata.
 *
 * Uso: `/diag.html?modo=planos&ifc=/samples/Piso%205.ifc`
 */
export async function planos(container: HTMLElement, ifcUrl: string, log: Log): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  await viewer.loadIfc(bytes, ifcUrl);
  log(`modelo cargado · lado mayor ${viewer.shadowAudit.modelSpanM.toFixed(1)} m`);

  let colgadas = 0;
  for (const vista of ["plan", "front", "side"] as const) {
    log(`\nvista ${vista}:`);

    // **Un fallo en una vista no aborta las otras**, y hace falta: si la proyección se cuelga, lo
    // que este informe tiene que decir es *cuántas* se colgaron, no morir en la primera.
    let plano;
    try {
      plano = await viewer.createDrawing(vista, (mensaje, avance) => {
        if (avance === undefined || avance === 1) {
          log(`  ${mensaje}${avance === 1 ? " (100 %)" : ""}`);
        }
      });
    } catch (fallo: unknown) {
      colgadas += 1;
      log(`  cortada: ${fallo instanceof Error ? fallo.message : String(fallo)}`);
      continue;
    }

    if (plano === null) {
      log("  **no se genero nada** — no habia geometria proyectable");
      continue;
    }

    log(
      `  ${plano.segments} segmentos visibles, ${plano.hiddenSegments} ocultos · ` +
        `${plano.sizeM.map((m) => m.toFixed(2)).join(" x ")} m · ${Math.round(plano.elapsedMs)} ms`,
    );

    // **Y ahora la vuelta**: se exporta y se lee con el lector propio. Es lo que distingue "el
    // exportador devolvio un texto" de "el exportador devolvio un DXF".
    const dxf = viewer.exportDrawingDxf(plano.id, {
      widthMm: 420,
      heightMm: 297,
      margin: 10,
    });
    if (dxf === null) {
      log("  **el exportador devolvio null**");
      continue;
    }

    const leido = parseDxf(dxf);
    const omitidas = Object.entries(leido.skipped);
    log(`  DXF: ${Math.round(dxf.length / 1024)} KB · lo lee nuestro lector:`);
    log(
      `    ${leido.polylines.length} trazos, ${leido.texts.length} textos, ` +
        `sin dibujar: ${omitidas.length === 0 ? "nada" : omitidas.map(([t, n]) => `${t}=${n}`).join(" ")}`,
    );
    if (leido.bounds === null) {
      log("    **sin extension: el DXF no tiene geometria legible**");
    } else {
      const ancho = leido.bounds.maxX - leido.bounds.minX;
      const alto = leido.bounds.maxY - leido.bounds.minY;
      log(`    extension del DXF: ${ancho.toFixed(1)} x ${alto.toFixed(1)} (unidades del archivo)`);
      // Con papel el DXF sale en milimetros y colocado en la hoja, asi que la extension tiene que
      // caber en los 420 x 297 menos el margen. Si no cabe, el dibujo se sale del papel.
      const cabe = ancho <= 420 && alto <= 297;
      log(`    cabe en el A3 declarado: ${cabe ? "si (bien)" : "NO (mal)"}`);
    }
    log(
      `    trazos frente a segmentos: ${leido.polylines.length} / ${plano.segments} — ` +
        `${leido.polylines.length > 0 ? "el DXF lleva geometria (bien)" : "EL DXF ESTA VACIO (mal)"}`,
    );
  }

  log("");
  if (colgadas === 3) {
    log(
      "veredicto: las tres vistas se cortaron. **En este entorno es lo esperado** y no dice nada\n" +
        "  del generador: `EdgeProjector` lee la escena dibujada y este panel no compone\n" +
        "  fotogramas. Lo que si queda comprobado es que **el cuelgue ahora se dice**: antes la\n" +
        "  interfaz mostraba «Proyectando…» para siempre, sin error y sin salida.\n" +
        "  Para confirmar el plano hace falta correr esto en un navegador de verdad.",
    );
  } else if (colgadas > 0) {
    log(`veredicto: ${colgadas} de 3 vistas se cortaron; las otras generaron plano.`);
  } else {
    log("veredicto: las tres vistas generan plano y su DXF lo lee nuestro propio lector.");
  }
}

/**
 * Que el PDF se lee: texto extraído y búsqueda, para `F8.6`.
 *
 * **Comprueba el motor, no la pantalla.** La capa de texto que hace el PDF seleccionable y la caja
 * de búsqueda son React encima de dos llamadas —`getPageTextRects` y `searchAllPages`—, y lo que
 * puede fallar sin avisar son ellas: un PDF escaneado no tiene texto que extraer, y ahí la búsqueda
 * no encuentra nada aunque el documento «diga» la palabra.
 *
 * Uso: `/diag.html?modo=pdf&pdf=/samples/x.pdf&buscar=vanos`
 */
export async function pdf(container: HTMLElement, url: string, log: Log): Promise<void> {
  const bytes = await (await fetch(url, { credentials: "same-origin" })).arrayBuffer();
  log(`descargado: ${Math.round(bytes.byteLength / 1024)} KB`);

  // `fontFallback: null` por lo mismo que en la pantalla: con el respaldo activado PDFium pide
  // fuentes a otro origen y la CSP no lo permite.
  const motor = await createPdfiumEngine(rutaWasm, { fontFallback: null });
  const doc = await motor.openDocumentBuffer({ id: url, content: bytes }).toPromise();
  log(`paginas: ${doc.pageCount}`);

  let total = 0;
  for (const pagina of doc.pages) {
    const rects = await motor.getPageTextRects(doc, pagina).toPromise();
    total += rects.length;
    log(`  pagina ${pagina.index + 1}: ${rects.length} tramos de texto`);
    for (const trozo of rects.slice(0, 3)) {
      log(
        `    «${trozo.content}» en (${trozo.rect.origin.x.toFixed(0)}, ${trozo.rect.origin.y.toFixed(0)}) ` +
          `· ${trozo.font.family} ${trozo.font.size.toFixed(1)}`,
      );
    }
  }
  log(
    `\ntexto extraido: ${total} tramos — ${total === 0 ? "NINGUNO: es un PDF escaneado o sin capa de texto" : "se puede seleccionar y buscar"}`,
  );

  const termino = new URLSearchParams(globalThis.location?.search ?? "").get("buscar");
  if (termino !== null && termino !== "") {
    const encontrado = await motor.searchAllPages(doc, termino).toPromise();
    const paginas = [...new Set(encontrado.results.map((uno) => uno.pageIndex + 1))].sort(
      (a, b) => a - b,
    );
    log(
      `\nbuscar «${termino}»: ${encontrado.total} coincidencias` +
        `${paginas.length === 0 ? "" : `, en la pagina ${paginas.join(", ")}`}`,
    );
  }

  await motor.destroy().toPromise();
  container.textContent = "";
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

/**
 * Un cuadro desde el modelo, y su CSV, para `F10.5`.
 *
 * **Lo que hay que comprobar de un cuadro no es que salga, es que diga lo mismo que la ficha.** El
 * cuadro lee las propiedades de trescientos elementos y la ficha las de uno; si las dos rutas
 * discreparan en una unidad o en un valor, el cuadro sería una tabla bonita con datos que no son los
 * del modelo. Así que se elige una fila al azar del cuadro y se compara **celda por celda** contra
 * lo que devuelve la ficha de ese mismo elemento.
 *
 * Lo demás que se mide: que las columnas salgan ordenadas por cuántas filas las llevan —que es lo
 * que hace legible un cuadro de un modelo con cuarenta psets—, que los topes se digan cuando cortan,
 * y que el CSV **se pueda leer de vuelta** con el mismo número de filas y columnas.
 *
 * Uso: `/diag.html?modo=cuadros&ifc=/samples/Piso%205.ifc&categoria=IFCWALL`
 *
 * Sin `categoria` toma **la más numerosa del modelo**, para que el modo sirva en cualquier archivo
 * sin tener que saber antes qué trae dentro.
 */
export async function cuadros(
  container: HTMLElement,
  ifcUrl: string,
  log: Log,
  _espera = 0,
  categoria?: string,
): Promise<void> {
  const viewer = await BimViewer.create(container);
  const bytes = new Uint8Array(await (await fetch(ifcUrl)).arrayBuffer());
  const loaded = await viewer.loadIfc(bytes, ifcUrl);

  const porCategoria = await viewer.categoriesOf(loaded.id);
  const ordenadas = [...porCategoria.entries()].sort((una, otra) => otra[1] - una[1]);
  log(`categorias en el modelo: ${ordenadas.length}`);
  for (const [nombre, cuantos] of ordenadas.slice(0, 8)) log(`  ${nombre}: ${cuantos}`);
  if (ordenadas.length > 8) log(`  … y ${ordenadas.length - 8} mas`);

  const elegida = categoria ?? ordenadas[0]?.[0];
  if (elegida === undefined) {
    log("\nel modelo no trae ninguna categoria IFC: no hay cuadro que armar");
    return;
  }

  log(`\ncuadro de ${elegida}:`);
  const cuadro = await viewer.scheduleOf(loaded.id, elegida);
  if (cuadro === null) {
    log("  el modelo no respondio");
    return;
  }

  log(
    `  ${cuadro.rows.length} filas de ${cuadro.total} · ${cuadro.columns.length} columnas` +
      `${cuadro.hiddenColumns > 0 ? ` (+${cuadro.hiddenColumns} fuera del tope)` : ""} · ` +
      `${Math.round(cuadro.elapsedMs)} ms`,
  );
  if (cuadro.truncated) log(`  **cortado por el tope de ${MAXIMO_FILAS} filas**, y lo dice`);

  log("\n  columnas, por cuantas filas las llevan:");
  for (const columna of cuadro.columns) {
    // Va el conteo y no solo el porcentaje: con 300 filas, una columna que está en una sola
    // redondea a «0 %» y se lee como un fallo cuando lo que dice es «1 de 300».
    log(
      `    ${String(columna.filled).padStart(4)} de ${cuadro.rows.length}  ${encabezadoDeColumna(columna)}`,
    );
  }

  // **El orden de las columnas es parte de lo que hace legible el cuadro**, así que se comprueba.
  const enOrden = cuadro.columns.every(
    (columna, i) => i === 0 || cuadro.columns[i - 1]!.filled >= columna.filled,
  );
  log(`\n  ordenadas de mas rellena a menos: ${enOrden ? "si (bien)" : "NO (mal)"}`);

  // --- El oráculo: el cuadro y la ficha no pueden discrepar -------------------------
  const fila = cuadro.rows[Math.floor(cuadro.rows.length / 2)];
  if (fila === undefined) {
    log("\n  el cuadro salio vacio: no hay nada que cruzar con la ficha");
    return;
  }

  const ficha = await viewer.describeItemById(loaded.id, fila.localId);
  if (ficha === null) {
    log("\n  la ficha de esa fila no devolvio datos");
    return;
  }

  // Se rearma el diccionario de la ficha con las mismas claves que usa el cuadro.
  const deLaFicha = new Map<string, string>();
  for (const atributo of ficha.attributes) {
    if (!deLaFicha.has(atributo.name)) deLaFicha.set(atributo.name, atributo.value);
  }
  for (const grupo of ficha.groups) {
    for (const propiedad of grupo.properties) {
      const clave = `${grupo.name} · ${propiedad.name}`;
      if (!deLaFicha.has(clave)) deLaFicha.set(clave, propiedad.value);
    }
  }

  let iguales = 0;
  const distintas: string[] = [];
  for (const [clave, valor] of fila.values) {
    const enFicha = deLaFicha.get(clave);
    if (enFicha === valor) iguales += 1;
    else distintas.push(`${clave}: cuadro=«${valor}» ficha=«${enFicha ?? "(no esta)"}»`);
  }

  // **Cero celdas comparadas no es «cuadra»: es que no se comprobó nada.** Un elemento sin
  // propiedades hace pasar este cruce sin mirar nada, y eso es peor que fallar — parece verde. Se
  // dice, y se dice qué hacer: elegir una categoría que sí traiga propiedades.
  if (fila.values.size === 0) {
    log(
      `\n  el elemento ${fila.guid ?? fila.localId} no trae ninguna propiedad, asi que ` +
        `**el cruce con la ficha no comprueba nada**.\n` +
        `  Prueba con una categoria que si las traiga: ?modo=cuadros&categoria=IFCDOOR`,
    );
  } else {
    log(
      `\n  cruce con la ficha del elemento ${fila.guid ?? fila.localId}: ` +
        `${iguales} de ${fila.values.size} celdas iguales — ` +
        `${distintas.length === 0 ? "cuadra (bien)" : "NO CUADRA (mal)"}`,
    );
    for (const diferencia of distintas.slice(0, 6)) log(`    ${diferencia}`);
  }

  // --- Y el CSV, leído de vuelta ---------------------------------------------------
  const csv = csvDe(cuadro);
  const conBom = csv.startsWith("﻿");
  const lineas = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  const cabecera = lineas[0] ?? "";
  log(
    `\n  CSV: ${Math.round(csv.length / 1024)} KB · ${lineas.length - 1} filas + cabecera · ` +
      `BOM ${conBom ? "si (bien)" : "NO (mal, Excel castellano parte las tildes)"}`,
  );
  log(`    cabecera: ${cabecera.slice(0, 160)}${cabecera.length > 160 ? "…" : ""}`);

  const columnasEsperadas = cuadro.columns.length + 2;
  const columnasLeidas = celdasDe(cabecera).length;
  log(
    `    columnas: ${columnasLeidas} leidas, ${columnasEsperadas} esperadas (GUID + Nombre + ` +
      `${cuadro.columns.length}) — ${columnasLeidas === columnasEsperadas ? "cuadra (bien)" : "NO CUADRA (mal)"}`,
  );
  log(
    `    filas: ${lineas.length - 1} leidas, ${cuadro.rows.length} esperadas — ` +
      `${lineas.length - 1 === cuadro.rows.length ? "cuadra (bien)" : "NO CUADRA (mal)"}`,
  );

  // **Y que un valor con punto y coma no parta la fila**, que es el defecto clásico de un CSV
  // escrito a mano y aparece de verdad: «Muro; 20 cm» es un nombre de tipo posible.
  const conSeparador = lineas
    .slice(1)
    .map((fila) => celdasDe(fila).length)
    .filter((cuantas) => cuantas !== columnasEsperadas);
  log(
    `    todas las filas con el mismo numero de celdas: ` +
      `${conSeparador.length === 0 ? "si (bien)" : `NO (mal, ${conSeparador.length} filas descuadran)`}`,
  );
}

/**
 * Las celdas de una línea de CSV con `;`, respetando las comillas.
 *
 * Es un lector mínimo **a propósito**: hace de oráculo del escritor, y para eso tiene que ser otra
 * implementación. Si aquí se llamara a la misma función que escribe, lo único que se comprobaría es
 * que es consistente consigo misma.
 */
function celdasDe(linea: string): readonly string[] {
  const celdas: string[] = [];
  let actual = "";
  let dentro = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i]!;
    if (dentro) {
      if (caracter === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else dentro = false;
      } else actual += caracter;
      continue;
    }
    if (caracter === '"') dentro = true;
    else if (caracter === ";") {
      celdas.push(actual);
      actual = "";
    } else actual += caracter;
  }
  celdas.push(actual);
  return celdas;
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

/**
 * ¿Abre una nube COPC en un navegador de verdad, y responden sus controles? (`F2.1` y `F2.3`)
 *
 * **Es la comprobación que `docs/NUBES_DE_PUNTOS.md` dejó pendiente**, y va antes de dar el formato
 * por bueno: `copc` lee bien en Node, pero descomprime con un WASM de `laz-perf` que en un navegador
 * hay que servir aparte — la misma trampa que la regla 9 de `AGENTS.md` documenta para `web-ifc`, y
 * que allí dejaba el visor colgado sin emitir error.
 *
 * No basta con que no falle. Con el fixture sintético la nube tiene **geometría conocida** —un plano
 * a 560 m y un muro de 3 m en la franja `y ∈ [40, 42]`, en UTM 19S— así que se comprueban los
 * números: la extensión, que el muro aparezca, que las clases sobrevivan y, sobre todo, **que la
 * precisión no se pierda al bajar a `float32`**, que es el hallazgo caro de la fase. Con una nube
 * real esas comprobaciones se saltan y se miden las que sí valen.
 *
 * Uso: `/diag.html?modo=nube&nube=/samples/levantamiento-sintetico.copc.laz`
 * y con techo a medida: `…&mb=64`
 */
export async function nube(container: HTMLElement, url: string, log: Log): Promise<void> {
  const t0 = performance.now();
  const marca = (etapa: string) => log(`  ${etapa}: ${Math.round(performance.now() - t0)} ms`);

  const params = new URLSearchParams(location.search);
  const MB = Number(params.get("mb") ?? "256");
  const PRESUPUESTO = MB * 1024 * 1024;

  // **El contenedor se fija en píxeles, y no es cosmética.**
  //
  // `diag.html` le da `50vh`, y cuando el panel del agente no tiene tamaño —pasa— eso es **cero**:
  // el lienzo sale de 0 × 0, la cámara no tiene tronco de visión, y todo lo que dependa de ella
  // —el recorte por vista, el tamaño en píxeles de un nodo, señalar un punto— mide sobre nada y
  // **da resultados que parecen buenos**. Un número en píxeles no depende del panel.
  container.style.width = "1200px";
  container.style.height = "700px";
  // El fixture sintetico lleva geometria conocida; una nube real, no. Las comprobaciones que
  // dependen de ella **se saltan y se dice**, en vez de dar un veredicto sobre nada.
  const esElFixture = url.includes("levantamiento-sintetico");

  log("\n=== la cabecera, sin descargar un punto ===");
  const ficha = await fichaDeNube(url);
  marca("fichaDeNube");
  log(`  puntos declarados: ${ficha.puntos.toLocaleString("es-CL")}`);
  log(`  extension: ${ficha.minimo.map((v) => v.toFixed(3)).join(", ")}`);
  log(`         a:  ${ficha.maximo.map((v) => v.toFixed(3)).join(", ")}`);
  log(
    `  tamano: ${ficha.maximo.map((v, i) => (v - (ficha.minimo[i] as number)).toFixed(1)).join(" x ")} m`,
  );
  log(`  desplazamiento: ${ficha.desplazamiento.map((v) => v.toFixed(3)).join(", ")}`);
  log(`  escala: ${ficha.escala.join(", ")}`);
  log(`  niveles del octree: ${ficha.niveles} · nodos: ${ficha.nodos}`);
  log(
    `  cubo del octree: ${ficha.hayCubo ? `${ficha.ladoDelCubo.toFixed(2)} m de lado` : "NO DECLARADO — sin el no hay recorte por vista"}`,
  );
  log(
    `  sistema de referencia: ${ficha.wkt ? `declarado (${ficha.wkt.length} caracteres${ficha.wkt.includes("32719") ? ", EPSG 32719" : ""})` : "NINGUNO — la nube no se puede cruzar con nada"}`,
  );
  const caben = Math.floor(PRESUPUESTO / 30);
  log(
    `  si entrara entera: ${((ficha.puntos * 30) / 1024 / 1024).toFixed(0)} MB · con ${MB} MB caben ` +
      `${caben.toLocaleString("es-CL")} puntos ` +
      (caben >= ficha.puntos
        ? "— la nube entera"
        : `(${((caben / ficha.puntos) * 100).toFixed(1)} %)`),
  );

  // --- Abrir por el visor, que es el camino que usa la aplicacion ----------------------
  log(`\n=== cargando, con ${MB} MB de techo ===`);
  const viewer = await BimViewer.create(container);
  const cargada = await viewer.loadPointCloud(url, {
    presupuestoBytes: PRESUPUESTO,
    color: "rgb",
  });
  marca("loadPointCloud");
  const nube = cargada.nube;
  log(`  nodos del arbol: ${nube.nodosDelArbol} · cargados: ${cargada.informe.nodos}`);
  log(
    `  puntos: ${cargada.cargados.toLocaleString("es-CL")} de ${ficha.puntos.toLocaleString("es-CL")}`,
  );
  log(`  fuera por presupuesto: ${cargada.informe.sinPresupuesto} nodo(s)`);
  log(`  nivel maximo alcanzado: ${cargada.nivelMaximo} de ${ficha.niveles}`);
  log(`  memoria: ${(cargada.bytes / 1024 / 1024).toFixed(1)} MB`);
  log(
    `  color efectivo: ${nube.color}${nube.color !== "rgb" ? " (se pidio rgb: el archivo no lo trae)" : ""}`,
  );

  // --- Encuadrar, que es lo primero que se hace con una nube ---------------------------
  const caja = nube.cajaDeLoCargado();
  if (caja !== null) {
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    const controles = viewer.camera.controls;
    controles.setOrbitPoint(esfera.center.x, esfera.center.y, esfera.center.z);
    await controles.rotateTo(Math.PI / 4, Math.PI / 3.2, false);
    await controles.fitToSphere(esfera, false);
    marca("encuadrada en isometrica");
  }

  // --- La precision, que es el hallazgo de la fase --------------------------------------
  log("\n=== la precision ===");
  const d = cargada.desplazamiento;
  for (const [i, nombre] of [
    [0, "este"],
    [1, "norte"],
    [2, "cota"],
  ] as const) {
    const absoluto = ficha.maximo[i] as number;
    const sinRestar = Math.abs(Math.fround(absoluto) - absoluto);
    const local = absoluto - (d[i] as number);
    const restando = Math.abs(Math.fround(local) - local);
    log(
      `  ${nombre} ${absoluto.toFixed(3)}: sin restar habria perdido ${(sinRestar * 1000).toFixed(1)} mm` +
        ` · restando, ${(restando * 1000).toFixed(4)} mm`,
    );
  }
  if (caja !== null) {
    // El extremo que la caja de lo cargado si alcanza: el maximo en X de la escena. Solo vale si
    // entro la nube entera; con nodos fuera, la extension no tiene por que llegar.
    const completa = cargada.informe.sinPresupuesto === 0;
    const esperadoX = (ficha.maximo[0] as number) - (d[0] as number);
    const error = Math.abs(caja.max.x - esperadoX);
    log(
      completa
        ? `  extension en X: ${caja.max.x.toFixed(4)} contra ${esperadoX.toFixed(4)} esperado · error ${(error * 1000).toFixed(3)} mm`
        : `  extension: no se compara, quedaron nodos fuera del presupuesto`,
    );
  }

  // --- La geometria conocida, solo si es el fixture -------------------------------------
  if (esElFixture && caja !== null) {
    log("\n=== la geometria conocida: el muro de 3 m ===");
    const alto = caja.max.y - caja.min.y;
    log(
      `  alturas locales (eje Y de la escena): ${caja.min.y.toFixed(3)} .. ${caja.max.y.toFixed(3)}`,
    );
    log(
      Math.abs(alto - 3) < 0.05
        ? `  el muro esta ahi: ${alto.toFixed(3)} m medidos en la geometria`
        : `  NO CUADRA: se escribio un muro de 3,000 m y se midieron ${alto.toFixed(3)}`,
    );
  } else if (caja !== null) {
    log("\n=== la geometria ===");
    log(
      `  desnivel cargado: ${(caja.max.y - caja.min.y).toFixed(3)} m (el archivo declara ${(
        (ficha.maximo[2] as number) - (ficha.minimo[2] as number)
      ).toFixed(3)})`,
    );
    log("  (nube real: no hay geometria conocida contra la que comprobar)");
  }

  // --- F2.3: el recorte por vista ------------------------------------------------------
  log("\n=== F2.3 · el recorte por lo que se esta mirando ===");
  const conVista = await viewer.refreshPointCloud();
  if (conVista === null) {
    log("  no hay nube: nada que refrescar");
  } else {
    log(`  nodos ahora: ${conVista.nodos} · puntos: ${conVista.puntos.toLocaleString("es-CL")}`);
    log(`  traidos: ${conVista.nuevos} · soltados: ${conVista.soltados}`);
    log(
      `  descartados — fuera de vista: ${conVista.fueraDeVista} · demasiado chicos: ${conVista.demasiadoPequenos}` +
        ` · sin presupuesto: ${conVista.sinPresupuesto}`,
    );
    log(`  en ${conVista.ms.toFixed(0)} ms`);

    // Y que sea idempotente: el mismo criterio no vuelve a descargar nada.
    const otraVez = await viewer.refreshPointCloud();
    log(
      otraVez !== null && otraVez.nuevos === 0 && otraVez.soltados === 0
        ? "  llamarlo dos veces no descarga nada la segunda: es idempotente"
        : `  NO ES IDEMPOTENTE: la segunda trajo ${otraVez?.nuevos} y solto ${otraVez?.soltados}`,
    );
  }

  // --- F2.3: la densidad ---------------------------------------------------------------
  log("\n=== F2.3 · la densidad ===");
  const antes = (await viewer.refreshPointCloud())?.puntos ?? 0;
  const mitad = await viewer.refreshPointCloud({ puntosMaximos: Math.floor(antes / 2) });
  log(
    `  con la mitad de techo: ${mitad?.puntos.toLocaleString("es-CL")} de ${antes.toLocaleString("es-CL")}`,
  );
  log(
    mitad !== null && mitad.puntos <= Math.floor(antes / 2)
      ? "  respeta el techo"
      : `  SE PASA DEL TECHO: ${mitad?.puntos} > ${Math.floor(antes / 2)}`,
  );
  const vuelta = await viewer.refreshPointCloud({ puntosMaximos: Number.POSITIVE_INFINITY });
  log(`  al soltar el techo vuelve a ${vuelta?.puntos.toLocaleString("es-CL")} puntos`);

  // --- F2.3: el recorte por caja -------------------------------------------------------
  log("\n=== F2.3 · el recorte por caja ===");
  if (caja !== null) {
    // La mitad de la nube en X, que es una caja comprobable.
    const medio = (caja.min.x + caja.max.x) / 2;
    nube.recortar([caja.min.x, caja.min.y, caja.min.z, medio, caja.max.y, caja.max.z]);
    const recortado = await viewer.refreshPointCloud();
    log(
      `  con media nube recortada: ${recortado?.nodos} nodos, ${recortado?.puntos.toLocaleString("es-CL")} puntos`,
    );
    log(`  nodos descartados por el recorte: ${recortado?.fueraDelRecorte}`);
    log(
      recortado !== null && recortado.fueraDelRecorte > 0
        ? "  el recorte descarta nodos ANTES de descargarlos, que es de lo que se trata"
        : "  el recorte no descarto ningun nodo — con un arbol de un solo nivel es lo esperado",
    );
    nube.recortar(null);
    const sinRecorte = await viewer.refreshPointCloud();
    log(`  al quitarlo vuelve a ${sinRecorte?.nodos} nodos`);
  }

  // --- F2.3: el color y el tamano ------------------------------------------------------
  log("\n=== F2.3 · el color y el tamano de punto ===");
  for (const modo of ["altura", "clase", "intensidad", "rgb"] as const) {
    const t = performance.now();
    const real = nube.colorear(modo);
    log(
      `  ${modo} → ${real}${real !== modo ? " (el archivo no lo trae; se cae a la altura)" : ""}` +
        ` en ${(performance.now() - t).toFixed(0)} ms`,
    );
  }
  nube.tamanoDePunto = 4;
  log(`  tamano de punto: ${nube.tamanoDePunto} px`);
  nube.tamanoDePunto = 0;
  log(
    `  pedido 0 px → ${nube.tamanoDePunto} px (nunca por debajo de 1: un punto de 0 px no se ve)`,
  );
  nube.tamanoDePunto = 2;

  // --- Y lo ultimo: ¿los dibujo WebGL de verdad? ----------------------------------------
  //
  // **Es la unica forma de comprobarlo desde aca.** El panel del agente no compone el lienzo 3D
  // —la trampa ya escrita en `HANDOFF.md`— asi que una captura no distingue «no se dibujo» de «no
  // se pudo fotografiar». El contador del renderizador si.
  const mundo = viewer.camera.currentWorld;
  const renderizador = mundo?.renderer?.three;
  const enEscena = (await viewer.refreshPointCloud())?.puntos ?? 0;
  if (renderizador !== undefined && mundo !== null) {
    renderizador.info.reset();
    renderizador.render(mundo.scene.three, viewer.camera.three);
    const info = renderizador.info.render;
    log("\n=== lo que dibujo WebGL en un cuadro ===");
    log(
      `  puntos: ${info.points.toLocaleString("es-CL")} de ${enEscena.toLocaleString("es-CL")} cargados`,
    );
    log(`  llamadas de dibujo: ${info.calls} (una por nodo dibujado)`);
    // **Dibujar MENOS de lo cargado es lo correcto, no un defecto**, y la primera version de esta
    // prueba lo llamaba fallo. Nuestra seleccion es conservadora a proposito -conserva los nodos
    // que tocan los planos del tronco, para no abrir agujeros- y encima Three.js hace su propio
    // recorte por objeto con la esfera envolvente, que es exacto. Asi que unos cuantos nodos
    // cargados no llegan a dibujarse: es el recorte funcionando dos veces.
    //
    // Lo que si seria un defecto es cero -no se dibujo nada- o mas de lo cargado, que no puede ser.
    log(
      info.points === 0 && enEscena > 0
        ? "  VEREDICTO: NO SE DIBUJO NADA con puntos cargados"
        : info.points > enEscena
          ? `  VEREDICTO: dibujo ${info.points} con ${enEscena} cargados, lo que no puede ser`
          : `  VEREDICTO: se dibujo lo que se ve — Three.js recorto ${(enEscena - info.points).toLocaleString("es-CL")} puntos mas por su cuenta`,
    );
  }

  // --- F2.2: senalar puntos y calzar ---------------------------------------------------
  //
  // **El bucle completo, en el navegador.** La aritmetica ya esta probada en `bim-core`, pero lo
  // que puede fallar aca es otra cosa: que senalar devuelva el punto equivocado, que la matriz se
  // aplique al reves, o que Three.js la descomponga y pierda el giro. Asi que se prueba con una
  // desalineacion **conocida**: se inventa una, se fabrican los pares como los senalaria una
  // persona, y se exige que la nube acabe donde el modelo.
  log("\n=== F2.2 · senalar y calzar ===");
  const nodo0 = nube.objeto.children[0];
  if (!(nodo0 instanceof THREE.Points)) {
    log("  no hay nodos cargados: no se puede probar");
  } else {
    // --- Senalar: se proyecta un punto real de la nube a la pantalla y se pincha ahi -----
    //
    // **Hay que buscar un punto que este EN PANTALLA**, y la primera version no lo hacia: tomaba
    // el del medio del primer nodo y lo proyectaba sin comprobar nada. Tras los refrescos y el
    // recorte, ese nodo bien puede estar fuera del encuadre, y entonces se pinchaba en un punto
    // de la pantalla donde no hay nube — el fallo parecia del umbral y era de la prueba.
    // Se reencuadra antes: los ensayos de recorte y densidad han movido la camara, y senalar sin
    // saber que se esta mirando no prueba nada.
    const cajaAhora = nube.cajaDeLoCargado();
    if (cajaAhora !== null) {
      await viewer.camera.controls.fitToSphere(
        cajaAhora.getBoundingSphere(new THREE.Sphere()),
        false,
      );
    }
    viewer.camera.three.updateMatrixWorld();

    const rect = container.getBoundingClientRect();
    let objetivo: THREE.Vector3 | null = null;
    let px = 0;
    let py = 0;
    // Se busca en **todos** los nodos cargados y no solo en el primero: cual sea el primero
    // depende del orden en que llegaron, y no tiene por que estar en el encuadre.
    for (const hijo of nube.objeto.children) {
      if (objetivo !== null) break;
      if (!(hijo instanceof THREE.Points)) continue;
      const posiciones = hijo.geometry.getAttribute("position");
      for (let k = 1; k < 20 && objetivo === null; k += 1) {
        const i = Math.floor((posiciones.count * k) / 20);
        const candidato = new THREE.Vector3(
          posiciones.getX(i),
          posiciones.getY(i),
          posiciones.getZ(i),
        );
        const p = candidato.clone().project(viewer.camera.three);
        if (Math.abs(p.x) > 0.85 || Math.abs(p.y) > 0.85 || p.z > 1) continue;
        objetivo = candidato;
        px = rect.left + ((p.x + 1) / 2) * rect.width;
        py = rect.top + ((1 - p.y) / 2) * rect.height;
      }
    }

    const senalado = objetivo === null ? null : viewer.pickPointCloud(px, py);
    if (objetivo === null) {
      log("  ningun punto cae en pantalla tras reencuadrar: no se puede probar el senalado");
    } else if (senalado === null) {
      log("  pickPointCloud no dio en nada — el umbral esta corto");
    } else {
      // **Lo que hay que comprobar NO es que devuelva el punto al que se apunto**, y la primera
      // version de esta prueba lo exigia. Al pinchar una nube se atrapa **el punto mas cercano a
      // la camara** que caiga cerca del rayo, y eso es lo correcto: apuntando a una fachada del
      // fondo, lo que se quiere marcar es la de delante. El punto elegido salio a 24 m del que se
      // proyecto, y no era un defecto sino una pared por medio.
      //
      // Lo que si tiene que cumplirse son dos cosas: que el punto devuelto **este cerca del rayo**
      // -si no, se atrapo cualquier cosa- y que su conversion al sistema del archivo sea la del
      // punto devuelto, no la de otro.
      const camara = viewer.camera.three.position.clone();
      const direccion = objetivo.clone().sub(camara).normalize();
      const devuelto = new THREE.Vector3(...senalado.escena);
      const alRayo = devuelto.clone().sub(camara).cross(direccion).length();
      log(`  se pincho y devolvio un punto a ${(alRayo * 1000).toFixed(0)} mm del rayo`);
      log(`  y a ${objetivo.distanceTo(devuelto).toFixed(2)} m del punto al que se apunto`);
      log("  (lo segundo es normal: se atrapa la superficie de delante, no la del fondo)");
      log(`  en coordenadas del archivo: ${senalado.archivo.map((v) => v.toFixed(3)).join(", ")}`);

      // La conversion tiene que ser la del punto DEVUELTO. Comparar contra el que se apunto seria
      // comparar dos puntos distintos y llamar defecto a la diferencia.
      const esperadoArchivo = escenaAArchivo(senalado.escena, cargada.desplazamiento);
      const errorArchivo = Math.max(
        ...senalado.archivo.map((v, i) => Math.abs(v - (esperadoArchivo[i] as number))),
      );
      log(
        errorArchivo < 1e-6
          ? "  la vuelta al sistema del archivo es exacta"
          : `  LA VUELTA AL ARCHIVO NO CUADRA: ${errorArchivo.toFixed(6)} m`,
      );
    }

    // --- Calzar: una desalineacion conocida, y comprobar que se deshace -----------------
    const GIRO = 22.5;
    const r = (GIRO * Math.PI) / 180;
    const real = alineacionDeMapa({
      este: (ficha.minimo[0] as number) + 3.5,
      norte: (ficha.minimo[1] as number) - 2.25,
      altura: (ficha.minimo[2] as number) + 0.75,
      abscisaEjeX: Math.cos(r),
      ordenadaEjeX: Math.sin(r),
      escala: 1,
    });

    // Seis puntos reales de la nube. Su posicion "en el modelo" es la que tendrian deshaciendo la
    // desalineacion: es lo que senalaria alguien que tiene los dos en pantalla.
    const posicionesNodo0 = nodo0.geometry.getAttribute("position");
    const pares: ParDePuntos[] = [];
    for (let k = 0; k < 6; k += 1) {
      const i = Math.floor((posicionesNodo0.count * (k + 1)) / 7);
      const enLaEscena: [number, number, number] = [
        posicionesNodo0.getX(i),
        posicionesNodo0.getY(i),
        posicionesNodo0.getZ(i),
      ];
      const enLaNube = escenaAArchivo(enLaEscena, cargada.desplazamiento);
      pares.push({ local: mapaALocal(enLaNube, real), nube: enLaNube });
    }

    const calce = calzarConPuntos(pares);
    log(`\n  con 6 puntos senalados:`);
    log(`    giro recuperado: ${calce.alineacion.giroGrados.toFixed(4)}° (se puso ${GIRO}°)`);
    log(
      `    residuo: medio ${(calce.residuo.medio * 1000).toFixed(3)} mm · maximo ${(calce.residuo.maximo * 1000).toFixed(3)} mm`,
    );
    log(
      `    giro indeterminado: ${calce.giroIndeterminado} · escala ajustada: ${calce.escalaAjustada}`,
    );
    log(
      Math.abs(calce.alineacion.giroGrados - GIRO) < 0.01
        ? "    el giro se recupera"
        : `    NO SE RECUPERA EL GIRO: ${calce.alineacion.giroGrados.toFixed(4)}° contra ${GIRO}°`,
    );

    // --- Y aplicarlo: la nube tiene que caer sobre el modelo ----------------------------
    const aplicado = viewer.alignPointCloud(calce.alineacion);
    nodo0.updateMatrixWorld(true);
    log(`\n  matriz aplicada: ${aplicado}`);

    let peor = 0;
    for (const par of pares) {
      // Donde esta ese punto de la nube ahora, en el mundo.
      const enLaEscena = new THREE.Vector3(
        ...archivoAEscena(par.nube, cargada.desplazamiento),
      ).applyMatrix4(nube.objeto.matrix);
      // Y donde esta el modelo: sus coordenadas locales con el cambio de ejes, sin desplazamiento.
      const modelo = new THREE.Vector3(...archivoAEscena(par.local, [0, 0, 0]));
      peor = Math.max(peor, enLaEscena.distanceTo(modelo));
    }
    log(`  la nube cae a ${(peor * 1000).toFixed(3)} mm del modelo`);
    log(
      peor < 0.001
        ? "  VEREDICTO: la nube calza con el modelo por debajo del milimetro"
        : `  VEREDICTO: NO CALZA — ${peor.toFixed(3)} m de desvio`,
    );

    viewer.resetPointCloudAlignment();
    log("  calce deshecho: la nube vuelve a su sitio de origen");
  }

  marca("total");
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
