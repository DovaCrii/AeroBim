/**
 * **Qué cruza un perfil**, y en qué tramo de PK y de cota (2026-10-05).
 *
 * Una lámina de perfil no es solo el dibujo: una persona que lo lee pregunta **«¿qué hay aquí?»** —qué
 * muro, qué losa, qué viga cruza el trazado en el PK 0+120— y los perfiles de topografía lo contestan con
 * una **banda de datos bajo el dibujo**. Esto es lo que hace falta para esa banda, sin Three.js ni DOM: de
 * la caja de cada elemento a su intervalo de PK y de cota, y de la lista de cruces a lo que cruza un PK
 * o a las filas de la banda.
 *
 * ## Lo que se afirma y lo que no
 *
 * El intervalo sale de la **caja envolvente** del elemento, no de su geometría: un elemento diagonal puede
 * figurar en un tramo que no ocupa del todo. Es el mismo lado seguro de `cajaTocaFranja` —sobra un cruce
 * antes que faltar uno— y la interfaz lo dice.
 *
 * Las unidades van en el nombre: `desdeM` y `hastaM` son **PK en metros** del trazado desarrollado;
 * `cotaMinM` y `cotaMaxM` son **cotas** en metros, las del IFC y no las de la escena recentrada.
 */

import { rangoDeS, sDe, type CajaDeEscenaM, type Franja } from "./eje.js";

/** Un elemento que cruza el perfil, con el tramo que ocupa. */
export interface CruceDePerfil {
  /** La clase IFC tal como la da el motor, en mayúsculas: `IFCWALL`, `IFCSLAB`… */
  readonly categoria: string;
  /** El nombre del elemento, o `null` si no lo trae. */
  readonly nombre: string | null;
  /** El GUID de IFC —la identidad—, o `null` si no lo trae o no es válido. */
  readonly guid: string | null;
  /** Dónde empieza a cruzar, en metros de PK. */
  readonly desdeM: number;
  /** Dónde deja de cruzar, en metros de PK. */
  readonly hastaM: number;
  /** La cota más baja que ocupa, en metros. */
  readonly cotaMinM: number;
  /** La cota más alta que ocupa, en metros. */
  readonly cotaMaxM: number;
}

/**
 * El tramo de PK y de cota que ocupa una caja respecto a una franja, o `null` si queda fuera.
 *
 * `s` se mide proyectando las **ocho esquinas** de la caja sobre la dirección de la franja: con un giro
 * la caja ya no está alineada con ella, y mirar solo dos esquinas daría un intervalo más corto de lo
 * que ocupa. El resultado se **recorta al largo de la franja**: un muro de 30 m que entra 2 m en un
 * tramo solo cuenta esos 2 m en ese tramo, y el resto se cuenta en el siguiente.
 *
 * `cotaBaseM` es el desplazamiento vertical que se quitó al recentrar el modelo: sumado a la `y` de la
 * escena da la cota del archivo, la misma que lleva el dibujo.
 */
export function intervaloDeCaja(
  franja: Franja,
  caja: CajaDeEscenaM,
  cotaBaseM: number,
): {
  readonly desdeM: number;
  readonly hastaM: number;
  readonly cotaMinM: number;
  readonly cotaMaxM: number;
} | null {
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const x of [caja.min[0], caja.max[0]]) {
    for (const z of [caja.min[2], caja.max[2]]) {
      const s = sDe(franja, [x, 0, z]);
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
    }
  }
  const [desdeFranja, hastaFranja] = rangoDeS(franja);
  const desdeM = Math.max(sMin, desdeFranja);
  const hastaM = Math.min(sMax, hastaFranja);
  // Un intervalo vacío o invertido: la caja cae fuera del largo de esta franja.
  if (hastaM < desdeM) return null;
  return {
    desdeM,
    hastaM,
    cotaMinM: caja.min[1] + cotaBaseM,
    cotaMaxM: caja.max[1] + cotaBaseM,
  };
}

/**
 * Lo que cruza **un punto del perfil**: los cruces cuyo tramo contiene ese PK y, si se da la cota,
 * cuya altura la contiene.
 *
 * Con solo el PK se contesta «qué hay a lo largo de esta vertical»; con la cota, «qué hay **justo
 * aquí**». Los extremos cuentan como dentro: un elemento que empieza exactamente en el PK sí cruza ahí.
 */
export function crucesEn(
  cruces: readonly CruceDePerfil[],
  pkM: number,
  cotaM?: number,
): CruceDePerfil[] {
  return cruces.filter(
    (cruce) =>
      cruce.desdeM <= pkM &&
      pkM <= cruce.hastaM &&
      (cotaM === undefined || (cruce.cotaMinM <= cotaM && cotaM <= cruce.cotaMaxM)),
  );
}

/** Una fila de la banda: una clase y los tramos de PK donde hay algo de ella. */
export interface FilaDeBanda {
  readonly categoria: string;
  /** Cuántos elementos distintos de esta clase cruzan el perfil. */
  readonly cuantos: number;
  /** Los tramos de PK que ocupan, **ya unidos**: dos muros pegados son un solo tramo. */
  readonly tramos: readonly (readonly [number, number])[];
}

/**
 * Las filas de la banda de datos: una por clase, con los tramos de PK que ocupa.
 *
 * Los tramos se **unen** cuando se tocan o se solapan: en la banda importa **dónde hay muro y dónde
 * no**, y veinte muros pegados dibujados por separado serían una hilera de rayas que no dice nada. Las
 * filas van **de más a menos cuantos**, y a igualdad por nombre: la clase que más cruza es la que más
 * pesa en la lectura.
 */
export function filasDeBanda(cruces: readonly CruceDePerfil[]): FilaDeBanda[] {
  const porClase = new Map<string, CruceDePerfil[]>();
  for (const cruce of cruces) {
    const lista = porClase.get(cruce.categoria) ?? [];
    lista.push(cruce);
    porClase.set(cruce.categoria, lista);
  }
  const filas: FilaDeBanda[] = [];
  for (const [categoria, lista] of porClase) {
    const ordenados = [...lista].sort((a, b) => a.desdeM - b.desdeM);
    const tramos: [number, number][] = [];
    for (const cruce of ordenados) {
      const ultimo = tramos.at(-1);
      if (ultimo !== undefined && cruce.desdeM <= ultimo[1]) {
        ultimo[1] = Math.max(ultimo[1], cruce.hastaM);
      } else {
        tramos.push([cruce.desdeM, cruce.hastaM]);
      }
    }
    filas.push({ categoria, cuantos: lista.length, tramos });
  }
  return filas.sort(
    (a, b) => b.cuantos - a.cuantos || a.categoria.localeCompare(b.categoria, "es"),
  );
}

/** Cómo se llaman en cristiano las clases IFC que más aparecen en una obra. */
const NOMBRES_DE_CLASE: Readonly<Record<string, string>> = {
  IFCWALL: "Muro",
  IFCWALLSTANDARDCASE: "Muro",
  IFCCURTAINWALL: "Muro cortina",
  IFCSLAB: "Losa",
  IFCCOLUMN: "Pilar",
  IFCBEAM: "Viga",
  IFCMEMBER: "Elemento estructural",
  IFCPLATE: "Placa",
  IFCFOOTING: "Fundación",
  IFCPILE: "Pilote",
  IFCDOOR: "Puerta",
  IFCWINDOW: "Ventana",
  IFCSTAIR: "Escalera",
  IFCSTAIRFLIGHT: "Tramo de escalera",
  IFCRAMP: "Rampa",
  IFCRAMPFLIGHT: "Tramo de rampa",
  IFCROOF: "Cubierta",
  IFCCOVERING: "Revestimiento",
  IFCRAILING: "Baranda",
  IFCSPACE: "Espacio",
  IFCFURNISHINGELEMENT: "Mobiliario",
  IFCBUILDINGELEMENTPROXY: "Elemento genérico",
  IFCPIPESEGMENT: "Tubería",
  IFCDUCTSEGMENT: "Ducto",
  IFCCABLECARRIERSEGMENT: "Bandeja",
  IFCFLOWSEGMENT: "Conducción",
  IFCFLOWTERMINAL: "Terminal",
  IFCFLOWFITTING: "Pieza de conducción",
  IFCDISTRIBUTIONELEMENT: "Elemento de distribución",
  IFCPROXY: "Elemento genérico",
};

/**
 * El nombre de una clase IFC para mostrar: «Muro» y no `IFCWALL`.
 *
 * Una clase que no está en la lista **no se inventa**: se muestra sin el prefijo `IFC` y con la
 * primera letra en mayúscula —`IFCTRANSPORTELEMENT` → «Transportelement»—, que es feo pero verdadero.
 * Traducir a ojo una clase que no se conoce es afirmar algo que nadie comprobó.
 */
export function nombreDeClase(categoria: string): string {
  const conocido = NOMBRES_DE_CLASE[categoria.toUpperCase()];
  if (conocido !== undefined) return conocido;
  const sinPrefijo = categoria.replace(/^IFC/i, "").toLowerCase();
  return sinPrefijo === "" ? categoria : sinPrefijo.charAt(0).toUpperCase() + sinPrefijo.slice(1);
}

/**
 * Cada cuántos metros poner una marca en un eje de PK, para que haya **como mucho** `marcasMaximas` y
 * el paso sea de los que se leen: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000…
 *
 * Es el paso de una regla de topografía: nadie gradúa un trazado de 340 m cada 37,8 m. Se toma la
 * primera de la serie 1-2-5 que no pase de `marcasMaximas`; con un largo de cero o negativo no hay nada
 * que graduar y devuelve 1.
 */
export function pasoDeGraduacion(largoM: number, marcasMaximas: number): number {
  if (!(largoM > 0) || !(marcasMaximas > 0)) return 1;
  const minimo = largoM / marcasMaximas;
  let decada = 10 ** Math.floor(Math.log10(minimo));
  for (let vuelta = 0; vuelta < 40; vuelta += 1) {
    for (const factor of [1, 2, 5]) {
      if (factor * decada >= minimo) return factor * decada;
    }
    decada *= 10;
  }
  return decada;
}
