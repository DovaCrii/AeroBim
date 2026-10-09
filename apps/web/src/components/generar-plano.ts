/**
 * Lógica pura de «Generar plano»: qué se dice antes de proyectar y qué se dice de la lámina ya hecha.
 *
 * Vive aparte del componente para poder probarse sin DOM. La regla de fondo: **nadie pulsa «Generar»
 * sin saber qué va a salir**, y nadie recibe una lámina sin saber de qué salió.
 */
import type { DrawingView, GeneratedDrawing } from "@aerobim/viewer";

/** Desde cuántos elementos la proyección de aristas deja de ser cosa de segundos. */
export const LIMITE_DE_ELEMENTOS_DEL_AVISO = 20_000;

export interface EntradaDePlano {
  readonly elementos: number;
  readonly modelos: number;
}

export interface DescripcionDeVista {
  readonly vista: DrawingView;
  /** Cómo se llama en la interfaz. */
  readonly nombre: string;
  /** Qué mira, en una frase. */
  readonly frase: string;
}

export const VISTAS_DE_PLANO: readonly DescripcionDeVista[] = [
  {
    vista: "plan",
    nombre: "Planta",
    frase: "Mira desde arriba: muros y pilares vistos de planta, como un plano de piso.",
  },
  {
    vista: "front",
    nombre: "Frontal",
    frase: "Alzado de frente: fachadas y alturas vistas de frente, sin la profundidad.",
  },
  {
    vista: "side",
    nombre: "Lateral",
    frase: "Alzado de costado: la altura de los pisos vista desde el lado, sin la profundidad.",
  },
];

export function nombreDeVista(vista: DrawingView): string {
  return VISTAS_DE_PLANO.find((una) => una.vista === vista)?.nombre ?? vista;
}

const entero = new Intl.NumberFormat("es-CL");

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${entero.format(n)} ${n === 1 ? singular : pluralTexto}`;
}

/** «412 elementos de 2 modelos», «1 elemento de 1 modelo», «Ningún elemento». */
export function describirEntrada(entrada: EntradaDePlano): string {
  if (entrada.elementos === 0) return "Ningún elemento";
  return `${plural(entrada.elementos, "elemento", "elementos")} de ${plural(
    entrada.modelos,
    "modelo",
    "modelos",
  )}`;
}

export type AvisoDeEntrada =
  | { readonly nivel: "vacio"; readonly texto: string }
  | { readonly nivel: "mucho"; readonly texto: string }
  | null;

/** El aviso que se da antes de generar: nada que proyectar, o tanto que va a tardar. */
export function avisoDeEntrada(
  entrada: EntradaDePlano,
  alcance: "visible" | "seleccion",
): AvisoDeEntrada {
  if (entrada.elementos === 0) {
    return {
      nivel: "vacio",
      texto:
        alcance === "seleccion"
          ? "El elemento seleccionado no está encendido o no hay ninguno seleccionado: no hay nada que proyectar."
          : "No hay nada encendido que proyectar. Enciende un modelo o una disciplina.",
    };
  }
  if (entrada.elementos > LIMITE_DE_ELEMENTOS_DEL_AVISO) {
    return {
      nivel: "mucho",
      texto: `Son muchos elementos (más de ${entero.format(
        LIMITE_DE_ELEMENTOS_DEL_AVISO,
      )}): puede tardar minutos. Apaga lo que no necesites, o genera solo la selección.`,
    };
  }
  return null;
}

/**
 * El nombre por defecto de la lámina: «Planta · Piso 5 · 3 elementos». La referencia es el nombre del
 * modelo (o del elemento, si se genera solo la selección); sin ella se omite.
 */
export function nombrePorDefecto(
  vista: DrawingView,
  referencia: string | null,
  entrada: EntradaDePlano,
): string {
  const partes = [nombreDeVista(vista)];
  const limpia = referencia?.replace(/\.ifc$/i, "").trim() ?? "";
  if (limpia !== "") partes.push(limpia);
  if (entrada.elementos > 0) partes.push(plural(entrada.elementos, "elemento", "elementos"));
  return partes.join(" · ");
}

/** «1:200 en A3». */
export function textoDeEscala(escalaA3: number): string {
  return `1:${entero.format(escalaA3)} en A3`;
}

/** «09-10 14:32», en hora local. */
export function textoDeFecha(epochMs: number): string {
  const d = new Date(epochMs);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Lo que se dice de una lámina ya generada, en dos líneas: **qué es** (vista, qué entró, escala) y
 * **cuánto dibujo hay** (trazos, aristas ocultas, tamaño, tiempo, fecha). Cada dato falta si la lámina
 * no lo trae —un perfil no tiene «entrada»— en vez de inventarse.
 */
export function fichaDeLamina(lamina: GeneratedDrawing): readonly [string, string] {
  const queEs: string[] = [lamina.view === "profile" ? "Perfil" : nombreDeVista(lamina.view)];
  if (lamina.entrada !== undefined) queEs.push(describirEntrada(lamina.entrada));
  if (lamina.escalaA3 !== undefined) queEs.push(textoDeEscala(lamina.escalaA3));

  const cuanto: string[] = [
    `${lamina.sizeM[0].toFixed(1)} × ${lamina.sizeM[1].toFixed(1)} m`,
    `${entero.format(lamina.segments)} trazos`,
    `${entero.format(lamina.hiddenSegments)} aristas ocultas`,
    `${(lamina.elapsedMs / 1000).toFixed(1)} s`,
  ];
  if (lamina.generadoEn !== undefined) cuanto.push(textoDeFecha(lamina.generadoEn));
  return [queEs.join(" · "), cuanto.join(" · ")];
}
