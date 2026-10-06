/**
 * Lo que rodea a un perfil y no es geometría: cómo se escribe un PK, y la tabla que lo acompaña.
 *
 * La geometría del perfil la monta `DrawingMaker.createProfile` y el dominio —tramos, franjas,
 * recortes— vive en `@aerobim/bim-core`. Aquí queda lo que se **lee**: el texto de un PK y la tabla
 * de referencias que va debajo del dibujo.
 *
 * ## Por qué hay una tabla y no etiquetas sobre el dibujo
 *
 * Las etiquetas sobre el dibujo las tendría que pintar un sistema de anotación, y los que trae la
 * librería —cotas, ángulos, pendientes, llamadas— no son una regla graduada. El sistema de tablas de
 * `cuadro-en-plano.ts` sí existe, sale en el DXF **y** en el PDF, y dice lo que una regla diría: en
 * qué PK está cada vértice del trazado y cada transversal, y con qué coordenadas.
 */

import { escenaAIfc, puntoEn, tramosDelEje, type EjeDePerfil } from "@aerobim/bim-core";
import type { TablaDeCuadro } from "./cuadro-en-plano.js";

/** Cuántas filas como máximo lleva la tabla: más allá, no se lee ni cabe en la lámina. */
export const MAXIMO_FILAS_DE_REFERENCIAS = 40;

/**
 * Un PK escrito como se lee en un trazado: kilómetros, un `+`, y metros con dos decimales.
 * `1234.5` es `1+234.50`.
 *
 * Se redondea a centímetros **antes** de partir en kilómetros: partiendo primero, `999.996` salía
 * como `0+1000.00` en vez de `1+000.00`.
 */
export function textoDePk(pkM: number, decimales = 2): string {
  const unidad = 10 ** decimales;
  // En unidades del último decimal, enteras: así `999.996` no sale como `0+1000.00`.
  const enteras = Math.round(pkM * unidad);
  const km = Math.floor(enteras / (1000 * unidad));
  const metros = (enteras - km * 1000 * unidad) / unidad;
  const ancho = decimales === 0 ? 3 : 4 + decimales;
  return `${km}+${metros.toFixed(decimales).padStart(ancho, "0")}`;
}

/**
 * La tabla de referencias de un perfil: cada vértice del trazado y cada transversal, con su PK y sus
 * coordenadas **del IFC** (Este, Norte).
 *
 * `origenM` es el desplazamiento que Fragments quitó al recentrar el modelo, en ejes de la escena:
 * sin sumarlo, las coordenadas serían las de una escena recentrada y no las del archivo, y no
 * coincidirían con nada que se mida en otra herramienta.
 */
export function tablaDePk(
  eje: EjeDePerfil,
  estacionesM: readonly number[],
  origenM: readonly [number, number, number],
): TablaDeCuadro {
  const filas: { pkM: number; que: string; xM: number; zM: number }[] = [];

  const tramos = tramosDelEje(eje);
  tramos.forEach((tramo, i) => {
    filas.push({
      pkM: tramo.pkInicialM,
      que: i === 0 ? "Inicio" : `Vértice ${i}`,
      xM: tramo.desdeM[0],
      zM: tramo.desdeM[1],
    });
  });
  const ultimo = tramos[tramos.length - 1];
  if (ultimo !== undefined) {
    filas.push({
      pkM: ultimo.pkInicialM + ultimo.largoM,
      que: "Fin",
      xM: ultimo.hastaM[0],
      zM: ultimo.hastaM[1],
    });
  }
  for (const pkM of estacionesM) {
    const sitio = puntoEn(eje, pkM);
    if (sitio === null) continue;
    filas.push({ pkM, que: "Transversal", xM: sitio.puntoM[0], zM: sitio.puntoM[1] });
  }
  filas.sort((a, b) => a.pkM - b.pkM);

  const visibles = filas.slice(0, MAXIMO_FILAS_DE_REFERENCIAS);
  const rows = visibles.map((fila) => {
    // De la escena al IFC: sumar el origen que se quitó y cambiar de ejes. La cota no se escribe
    // aquí —el eje es una polilínea en planta y no tiene altura—, por eso la `y` va en cero.
    const [este, norte] = escenaAIfc([fila.xM + origenM[0], origenM[1], fila.zM + origenM[2]]);
    return [textoDePk(fila.pkM), fila.que, este.toFixed(2), norte.toFixed(2)];
  });
  if (filas.length > visibles.length) {
    rows.push(["…", `${filas.length - visibles.length} más`, "", ""]);
  }

  return {
    title: "Referencias del eje",
    headers: ["PK", "Punto", "Este (m)", "Norte (m)"],
    rows,
  };
}

/**
 * Desde dónde hay que mirar una lámina generada para verla **de frente** (2026-10-05).
 *
 * Un dibujo se orienta según su vista: la **planta** queda tumbada y mira hacia arriba; el **alzado
 * frontal**, el **lateral** y el **perfil** —que se orienta como un alzado frontal— quedan **de pie**.
 * Mirarlos todos desde arriba, como se hacía al encenderlos, dejaba los de pie **de canto**: una sola
 * línea en vez de un dibujo. Lo descubrió el visor 2D de láminas, al abrir un perfil por primera vez.
 */
export function vistaDeFrenteDeLaLamina(
  vista: "plan" | "front" | "side" | "profile",
): "top" | "front" | "side" {
  if (vista === "plan") return "top";
  if (vista === "side") return "side";
  return "front";
}
