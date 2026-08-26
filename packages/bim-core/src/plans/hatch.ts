/**
 * El rayado de un relleno: las líneas de un patrón de `HATCH`, recortadas por su contorno.
 *
 * **Por qué vive en el dominio y no en el visor.** Es aritmética, y de la que falla en silencio: la
 * regla de paridad que resuelve los huecos se equivoca por un caso de borde —una raya que pasa
 * exactamente por un vértice— y el resultado no es un error, es **el negativo del relleno**, que a
 * primera vista parece un rayado válido. Eso se prueba en Node, igual que `segmentIntersection`.
 *
 * Lo que **no** entra aquí es de dónde sale la separación: eso depende de la escala a la que se está
 * mirando el plano y lo decide el visor. Aquí se recibe medida.
 */

/** Un punto del plano del dibujo: `[x, y]` en unidades del dibujo. */
export type PlanPoint = readonly [number, number];

/** Un contorno cerrado. El último punto se une con el primero; no hace falta repetirlo. */
export type PlanLoop = readonly PlanPoint[];

/**
 * Las líneas de un rayado, recortadas por los contornos.
 *
 * Se recorre el contorno en el sistema del propio rayado —girado tanto como diga el ángulo— y se
 * cortan líneas horizontales contra sus aristas. **La paridad es la que resuelve los huecos**: los
 * cruces de una raya se ordenan y se emparejan de dos en dos, así que un contorno interior deja su
 * hueco sin tener que decidir por adelantado quién es borde y quién agujero. Es la misma regla con la
 * que un CAD decide si un punto está dentro de una figura con islas.
 *
 * @param loops Todos los contornos, exteriores e interiores, sin distinguirlos.
 * @param anglesDeg Los ángulos del patrón, en grados. Uno para un rayado simple, dos para una malla.
 * @param spacing Separación entre rayas, en unidades del dibujo. Ya decidida.
 * @param maxLines Tope de rayas. Al llegar, la separación se ensancha en vez de recortar: un relleno
 *   rayado a medias se ve como un error, y uno con la trama más abierta se ve como un rayado.
 */
export function hatchLines(
  loops: readonly PlanLoop[],
  anglesDeg: readonly number[],
  spacing: number,
  maxLines: number,
): readonly (readonly [PlanPoint, PlanPoint])[] {
  if (loops.length === 0 || anglesDeg.length === 0) return [];
  if (!Number.isFinite(spacing) || spacing <= 0) return [];

  const rayas: (readonly [PlanPoint, PlanPoint])[] = [];
  const topePorAngulo = Math.max(1, Math.floor(maxLines / anglesDeg.length));

  for (const grados of anglesDeg) {
    const th = (grados * Math.PI) / 180;
    const cos = Math.cos(th);
    const sen = Math.sin(th);

    const aristas: { u0: number; v0: number; u1: number; v1: number }[] = [];
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const contorno of loops) {
      if (contorno.length < 3) continue;
      for (let i = 0; i < contorno.length; i++) {
        const a = contorno[i]!;
        const b = contorno[(i + 1) % contorno.length]!;
        const u0 = a[0] * cos + a[1] * sen;
        const v0 = -a[0] * sen + a[1] * cos;
        const u1 = b[0] * cos + b[1] * sen;
        const v1 = -b[0] * sen + b[1] * cos;
        if (!Number.isFinite(u0) || !Number.isFinite(v0)) continue;
        if (!Number.isFinite(u1) || !Number.isFinite(v1)) continue;

        aristas.push({ u0, v0, u1, v1 });
        if (v0 < vMin) vMin = v0;
        if (v1 < vMin) vMin = v1;
        if (v0 > vMax) vMax = v0;
        if (v1 > vMax) vMax = v1;
      }
    }
    if (!Number.isFinite(vMin) || vMax <= vMin) continue;

    const alto = vMax - vMin;
    const paso = alto / spacing > topePorAngulo ? alto / topePorAngulo : spacing;

    // Se arranca a media separación del borde: una raya justo sobre el borde se confunde con él.
    for (let v = vMin + paso / 2; v < vMax; v += paso) {
      const cruces: number[] = [];
      for (const { u0, v0, u1, v1 } of aristas) {
        // **Regla semiabierta.** Sin ella, una raya que pasa por un vértice cuenta el cruce dos
        // veces, la paridad se invierte a partir de ahí y sale el negativo del relleno.
        if (v0 <= v === v1 <= v) continue;
        cruces.push(u0 + ((v - v0) / (v1 - v0)) * (u1 - u0));
      }
      if (cruces.length < 2) continue;

      cruces.sort((uno, otro) => uno - otro);
      for (let i = 0; i + 1 < cruces.length; i += 2) {
        const ua = cruces[i]!;
        const ub = cruces[i + 1]!;
        if (ub - ua < 1e-9) continue;
        rayas.push([
          [ua * cos - v * sen, ua * sen + v * cos],
          [ub * cos - v * sen, ub * sen + v * cos],
        ]);
      }
    }
  }
  return rayas;
}

/**
 * Los ángulos con los que raya cada patrón del CAD, en grados.
 *
 * **Solo el nombre, y no los números del archivo.** El ángulo y la separación de un `HATCH` viven en
 * los códigos 52 y 41, que **también aparecen dentro de sus contornos**: buscarlos sueltos lee tan a
 * menudo el radio de una arista como una separación de rayado. El nombre del patrón es inequívoco y
 * dice lo mismo, que es lo que dibuja un plano de arquitectura.
 *
 * Lo que no esté en la tabla se raya a 45°, que es con lo que se dibuja un macizo cortado.
 */
const ANGULOS_DE_PATRON: Readonly<Record<string, readonly number[]>> = {
  ANSI31: [45],
  ANSI32: [45],
  ANSI33: [45],
  ANSI34: [45],
  ANSI35: [45],
  ANSI36: [45],
  ANSI37: [45, 135],
  ANSI38: [45],
  NET: [0, 90],
  NET3: [0, 60, 120],
  SQUARE: [0, 90],
  CROSS: [0, 90],
  LINE: [0],
  DOTS: [0],
};

/** Los ángulos de un patrón por su nombre; 45° para lo que no está en la tabla. */
export function hatchAngles(pattern: string | null): readonly number[] {
  return ANGULOS_DE_PATRON[(pattern ?? "").toUpperCase()] ?? [45];
}
