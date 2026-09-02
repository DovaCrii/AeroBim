/**
 * Contraste de color según WCAG 2.1, para que el sistema de diseño se pueda comprobar.
 *
 * **Existe porque una tabla de ratios escrita a mano se desactualiza en silencio.**
 * `docs/DESIGN_SYSTEM.md` declara el ratio al lado de cada color —que es lo mejor que tiene ese
 * documento— y hasta hoy nadie lo comprobaba: cambiar un hexadecimal por gusto podía bajar un texto
 * por debajo del mínimo sin que nada fallara, y eso se descubre en una auditoría de accesibilidad,
 * que es el peor sitio y el más tarde.
 *
 * Con esto, la tabla del documento **es una prueba**. Si alguien retoca un color y el par deja de
 * pasar AA, falla el gate.
 *
 * **Por qué vive en el dominio y no en la aplicación.** Es aritmética sobre números: no toca el DOM,
 * no mide nada de la pantalla y se prueba en Node. Y no es la primera vez que el color entra acá —
 * `aciColor` calcula la paleta de AutoCAD con su regla real en [plans/dxf.ts](../plans/dxf.ts).
 *
 * **La fórmula es la de la norma, con su umbral literal.** El punto de corte de la linealización es
 * `0,03928`, que es el que publica WCAG 2.1; se ven implementaciones con `0,04045` —el valor de la
 * especificación de sRGB— y la diferencia es de centésimas, pero un número de la norma se copia de
 * la norma. Los vectores conocidos de la prueba lo fijan.
 */

/** Un color en `#rrggbb`. No se aceptan otras formas: el sistema de diseño está escrito así. */
export type Hex = string;

/** Mínimo de AA para texto normal. */
export const AA_TEXTO = 4.5;

/**
 * Mínimo de AA para texto grande y para el contorno de un control (WCAG 1.4.11).
 *
 * Es también el suelo de lo **deshabilitado**: no tiene que pasar AA —declara que no se puede
 * usar— pero sí tiene que leerse, o nadie sabe qué dice el botón que no puede pulsar.
 */
export const AA_NO_TEXTO = 3;

/** `[r, g, b]` en 0–255. */
export type Rgb = readonly [number, number, number];

/**
 * Lee `#rrggbb`. Lanza si no lo es.
 *
 * **Acá sí se lanza, al contrario que casi todo en este paquete.** Lo demás lee datos de fuera —un
 * DXF, el almacenamiento del navegador— y ahí lo ilegible se descarta. Esto lee **una constante del
 * repositorio**: un color mal escrito es un error de programación, y devolver negro en silencio
 * convertiría la prueba de contraste en una prueba de que el negro contrasta.
 */
export function parseHex(hex: Hex): Rgb {
  const limpio = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(limpio)) {
    throw new Error(`"${hex}" no es un color #rrggbb`);
  }
  const n = Number.parseInt(limpio.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Un canal de 0–255 llevado a luz lineal, como pide la norma. */
function lineal(canal: number): number {
  const v = canal / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa, de 0 (negro) a 1 (blanco). Los pesos son los de la norma. */
export function relativeLuminance(color: Hex | Rgb): number {
  const [r, g, b] = (typeof color === "string" ? parseHex(color) : color).map(lineal) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ratio de contraste entre dos colores, de 1 a 21.
 *
 * **El orden no importa**: la norma pone el más claro arriba, así que se ordenan acá y quien llama
 * no tiene que acordarse de cuál es el fondo.
 */
export function contrastRatio(a: Hex | Rgb, b: Hex | Rgb): number {
  const uno = relativeLuminance(a);
  const otro = relativeLuminance(b);
  const claro = Math.max(uno, otro);
  const oscuro = Math.min(uno, otro);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** `true` si el par sirve para texto normal. */
export function pasaAA(texto: Hex | Rgb, fondo: Hex | Rgb): boolean {
  return contrastRatio(texto, fondo) >= AA_TEXTO;
}
