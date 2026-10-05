/**
 * **El eje de un perfil, y las franjas que se proyectan a lo largo de él** (2026-10-05).
 *
 * Un metro es lineal, largo y con curvas: su perfil no se hace con una recta A–B, que en un tramo
 * curvo corta en diagonal y da una distancia que no es el PK del trazado. Se hace sobre una
 * **polilínea**, y el perfil se presenta **desarrollado**: cada tramo se mira de lado y se coloca en
 * su PK, de modo que el eje horizontal del dibujo es la distancia acumulada a lo largo del trazado.
 *
 * Todo lo de aquí es aritmética plana sobre la planta —`x` y `z` de la escena, con `y` hacia
 * arriba— y no sabe nada de Three.js ni del navegador: se prueba en Node con respuestas calculables
 * a mano. El visor pone la geometría; esto decide **qué franja es cada cosa y dónde cae**.
 *
 * ## Dos convenciones que conviene tener a la vista
 *
 * - **Coordenadas de la escena, y declaradas** (`sistema: "escena"`). Un IFC vive en coordenadas
 *   locales de proyecto y una nube llega georreferenciada: mezclarlas sin conversión es el error que
 *   pone un modelo en otro continente. El eje lo marca quien mira el modelo, así que son las de la
 *   escena, y el tipo lo dice para que nadie le pase UTM por descuido.
 * - **El PK crece hacia la derecha del dibujo.** Se mira cada tramo de modo que su sentido de avance
 *   caiga a la derecha de la pantalla, que es lo que hace que las cotas y los números no salgan en
 *   espejo.
 */

/** Un punto en la planta de la escena, en metros: `[x, z]`. */
export type PuntoEnPlantaM = readonly [number, number];

/** Un punto de la escena, en metros: `[x, y, z]`, con `y` hacia arriba. */
export type PuntoDeEscenaM = readonly [number, number, number];

/** El eje de un perfil: los vértices que marcó quien mira, en coordenadas de la escena. */
export interface EjeDePerfil {
  /**
   * El sistema en que están los vértices. Un literal y no un texto libre: así un eje armado con
   * coordenadas de otro sistema no compila, en vez de colocar el perfil a cientos de kilómetros.
   */
  readonly sistema: "escena";
  readonly verticesM: readonly PuntoEnPlantaM[];
}

/** Un tramo recto del eje, con dónde empieza su PK. */
export interface TramoDeEje {
  readonly indice: number;
  readonly desdeM: PuntoEnPlantaM;
  readonly hastaM: PuntoEnPlantaM;
  /** El PK en que empieza el tramo: la suma de los largos de los anteriores. */
  readonly pkInicialM: number;
  readonly largoM: number;
  /** El sentido de avance, unitario. */
  readonly direccion: PuntoEnPlantaM;
}

/**
 * Una franja vertical de la que se saca un perfil: un rectángulo en planta, de altura infinita.
 *
 * Se **mira a lo largo de `miraHaciaM`** y lo que cae a la derecha de esa mirada es `derechaM`, el
 * sentido en que crece la coordenada horizontal del dibujo (`s`). El largo va sobre `derechaM` y el
 * espesor sobre `miraHaciaM`: un longitudinal es largo y estrecho; una transversal, al revés.
 */
export interface Franja {
  readonly centroM: PuntoEnPlantaM;
  /** Hacia dónde se mira, unitario. */
  readonly miraHaciaM: PuntoEnPlantaM;
  /** La derecha de quien mira, unitaria: el sentido en que crece `s`. */
  readonly derechaM: PuntoEnPlantaM;
  readonly largoM: number;
  readonly espesorM: number;
  /** El valor de `s` en el centro: el PK del punto medio, o cero en una transversal. */
  readonly sDelCentroM: number;
}

/** Una caja alineada con los ejes de la escena, en metros. */
export interface CajaDeEscenaM {
  readonly min: PuntoDeEscenaM;
  readonly max: PuntoDeEscenaM;
}

/** Los tramos del eje. Se saltan los de largo cero: dos clics en el mismo sitio no son un tramo. */
export function tramosDelEje(eje: EjeDePerfil): TramoDeEje[] {
  const tramos: TramoDeEje[] = [];
  let acumuladoM = 0;
  for (let i = 0; i + 1 < eje.verticesM.length; i += 1) {
    const desde = eje.verticesM[i]!;
    const hasta = eje.verticesM[i + 1]!;
    const dx = hasta[0] - desde[0];
    const dz = hasta[1] - desde[1];
    const largoM = Math.hypot(dx, dz);
    if (largoM === 0) continue;
    tramos.push({
      indice: tramos.length,
      desdeM: desde,
      hastaM: hasta,
      pkInicialM: acumuladoM,
      largoM,
      direccion: [dx / largoM, dz / largoM],
    });
    acumuladoM += largoM;
  }
  return tramos;
}

/** El largo total del eje, que es el PK de su último vértice. */
export function largoDelEjeM(eje: EjeDePerfil): number {
  return tramosDelEje(eje).reduce((suma, tramo) => suma + tramo.largoM, 0);
}

/** La derecha de quien avanza en `direccion`, mirándolo desde arriba con `z` hacia abajo. */
function derechaDe(direccion: PuntoEnPlantaM): PuntoEnPlantaM {
  return [-direccion[1], direccion[0]];
}

/** Hacia dónde hay que mirar para que `direccion` caiga a la derecha del dibujo. */
function miradaPara(direccion: PuntoEnPlantaM): PuntoEnPlantaM {
  return [direccion[1], -direccion[0]];
}

/** Dónde cae un punto respecto al eje: su PK, y a qué distancia lateral. */
export interface PosicionEnElEje {
  readonly pkM: number;
  /** Positiva a la derecha del sentido de avance, negativa a la izquierda. */
  readonly lateralM: number;
  readonly tramo: number;
}

/**
 * El PK de un punto: el del punto más cercano del eje, y a qué lado y cuánto se aparta de él.
 *
 * Más allá de los extremos el PK se queda en el del extremo —no hay PK negativo ni mayor que el
 * largo— y la distancia lateral pasa a ser la distancia al extremo.
 */
export function pkEn(eje: EjeDePerfil, punto: PuntoEnPlantaM): PosicionEnElEje | null {
  let mejor: (PosicionEnElEje & { distancia2: number }) | null = null;
  for (const tramo of tramosDelEje(eje)) {
    const rx = punto[0] - tramo.desdeM[0];
    const rz = punto[1] - tramo.desdeM[1];
    const t = Math.min(
      Math.max(rx * tramo.direccion[0] + rz * tramo.direccion[1], 0),
      tramo.largoM,
    );
    const px = tramo.desdeM[0] + tramo.direccion[0] * t;
    const pz = tramo.desdeM[1] + tramo.direccion[1] * t;
    const ox = punto[0] - px;
    const oz = punto[1] - pz;
    const distancia2 = ox * ox + oz * oz;
    if (mejor === null || distancia2 < mejor.distancia2) {
      const derecha = derechaDe(tramo.direccion);
      mejor = {
        pkM: tramo.pkInicialM + t,
        lateralM: ox * derecha[0] + oz * derecha[1],
        tramo: tramo.indice,
        distancia2,
      };
    }
  }
  return mejor === null ? null : { pkM: mejor.pkM, lateralM: mejor.lateralM, tramo: mejor.tramo };
}

/** El punto del eje en un PK, y hacia dónde apunta el eje ahí. `null` si el PK cae fuera. */
export function puntoEn(
  eje: EjeDePerfil,
  pkM: number,
): { puntoM: PuntoEnPlantaM; direccion: PuntoEnPlantaM; tramo: number } | null {
  const tramos = tramosDelEje(eje);
  const total = tramos.reduce((suma, tramo) => suma + tramo.largoM, 0);
  if (!(pkM >= 0 && pkM <= total)) return null;
  // El último tramo cierra por la derecha: el PK del vértice final le pertenece.
  const tramo = tramos.find((t) => pkM < t.pkInicialM + t.largoM) ?? tramos[tramos.length - 1]!;
  const t = pkM - tramo.pkInicialM;
  return {
    puntoM: [tramo.desdeM[0] + tramo.direccion[0] * t, tramo.desdeM[1] + tramo.direccion[1] * t],
    direccion: tramo.direccion,
    tramo: tramo.indice,
  };
}

/** La franja longitudinal de un tramo: toda su longitud, y `anchoM` de espesor centrado en el eje. */
export function franjaDeTramo(tramo: TramoDeEje, anchoM: number): Franja {
  return {
    centroM: [(tramo.desdeM[0] + tramo.hastaM[0]) / 2, (tramo.desdeM[1] + tramo.hastaM[1]) / 2],
    miraHaciaM: miradaPara(tramo.direccion),
    derechaM: tramo.direccion,
    largoM: tramo.largoM,
    espesorM: anchoM,
    sDelCentroM: tramo.pkInicialM + tramo.largoM / 2,
  };
}

/**
 * La franja de una **transversal** en un PK: perpendicular al eje, de `anchoTotalM` de lado a lado
 * y `espesorM` de grueso a lo largo del eje. Se mira en el sentido de avance, y `s` es el
 * desplazamiento lateral: negativo a la izquierda del eje y positivo a la derecha.
 */
export function franjaTransversal(
  eje: EjeDePerfil,
  pkM: number,
  anchoTotalM: number,
  espesorM: number,
): Franja | null {
  const sitio = puntoEn(eje, pkM);
  if (sitio === null) return null;
  return {
    centroM: sitio.puntoM,
    miraHaciaM: sitio.direccion,
    derechaM: derechaDe(sitio.direccion),
    largoM: anchoTotalM,
    espesorM,
    sDelCentroM: 0,
  };
}

/** La coordenada horizontal del dibujo para un punto de la escena. */
export function sDe(franja: Franja, punto: PuntoDeEscenaM | PuntoEnPlantaM): number {
  const x = punto[0];
  const z = punto.length === 3 ? punto[2] : punto[1];
  return (
    (x - franja.centroM[0]) * franja.derechaM[0] +
    (z - franja.centroM[1]) * franja.derechaM[1] +
    franja.sDelCentroM
  );
}

/** El rango de `s` que cubre la franja: lo que hay fuera se recorta del dibujo. */
export function rangoDeS(franja: Franja): readonly [number, number] {
  return [franja.sDelCentroM - franja.largoM / 2, franja.sDelCentroM + franja.largoM / 2];
}

/**
 * Si el elemento de esta caja toca la franja.
 *
 * Es un solapamiento de un rectángulo orientado contra una caja alineada, por el **teorema del eje
 * separador**: hay cuatro ejes que mirar —los dos de la franja y los dos de la escena—, y si en
 * alguno los intervalos no se tocan, no se tocan. La altura no cuenta: una franja es vertical.
 *
 * Se mira la **caja** del elemento y no su geometría, así que puede dar un falso positivo en un
 * elemento diagonal cuya caja entra en la franja sin que él lo haga. Es el lado seguro: sobra una
 * línea en el perfil antes que faltar un elemento.
 */
export function cajaTocaFranja(franja: Franja, caja: CajaDeEscenaM): boolean {
  const mediaLargo = franja.largoM / 2;
  const mediaEspesor = franja.espesorM / 2;

  const cx = (caja.min[0] + caja.max[0]) / 2;
  const cz = (caja.min[2] + caja.max[2]) / 2;
  const mediaX = (caja.max[0] - caja.min[0]) / 2;
  const mediaZ = (caja.max[2] - caja.min[2]) / 2;
  const dx = cx - franja.centroM[0];
  const dz = cz - franja.centroM[1];

  // Ejes de la escena: la caja del elemento contra la caja que envuelve a la franja.
  const alcanceX =
    Math.abs(franja.derechaM[0]) * mediaLargo + Math.abs(franja.miraHaciaM[0]) * mediaEspesor;
  const alcanceZ =
    Math.abs(franja.derechaM[1]) * mediaLargo + Math.abs(franja.miraHaciaM[1]) * mediaEspesor;
  if (Math.abs(dx) > alcanceX + mediaX) return false;
  if (Math.abs(dz) > alcanceZ + mediaZ) return false;

  // Ejes de la franja: la franja es un intervalo exacto y la caja, su proyección.
  const sobreDerecha = dx * franja.derechaM[0] + dz * franja.derechaM[1];
  const radioDerecha =
    mediaX * Math.abs(franja.derechaM[0]) + mediaZ * Math.abs(franja.derechaM[1]);
  if (Math.abs(sobreDerecha) > mediaLargo + radioDerecha) return false;

  const sobreMira = dx * franja.miraHaciaM[0] + dz * franja.miraHaciaM[1];
  const radioMira =
    mediaX * Math.abs(franja.miraHaciaM[0]) + mediaZ * Math.abs(franja.miraHaciaM[1]);
  return Math.abs(sobreMira) <= mediaEspesor + radioMira;
}

/**
 * Los PK de las transversales: uno cada `pasoM`, desde el origen y **hasta el final inclusive**.
 *
 * El final entra aunque no caiga en un múltiplo del paso: el último PK de un trazado es el que más
 * se pide, y dejarlo fuera por una cuestión de redondeo sería entregar un perfil al que le falta la
 * estación de llegada.
 */
export function estacionesCada(eje: EjeDePerfil, pasoM: number): number[] {
  if (!(pasoM > 0)) return [];
  const total = largoDelEjeM(eje);
  if (total === 0) return [];
  const pks: number[] = [];
  // Por multiplicación y no sumando: sumar `0.1` mil veces acumula error y el último PK sale torcido.
  for (let i = 0; i * pasoM < total; i += 1) pks.push(i * pasoM);
  pks.push(total);
  return pks;
}

/**
 * Recorta segmentos al rango `[sMin, sMax]` en la horizontal del dibujo.
 *
 * Entran y salen como pares de puntos `[s1, h1, s2, h2, …]`. Un segmento que se sale queda cortado
 * donde cruza el borde, con la altura interpolada: **cortarlo y no descartarlo** es lo que deja un
 * muro largo terminando justo en el borde del tramo, y no desaparecido ni asomando hasta el
 * siguiente. Liang–Barsky en una dimensión.
 */
export function recortarSegmentos(
  segmentos: ArrayLike<number>,
  sMin: number,
  sMax: number,
): number[] {
  const salida: number[] = [];
  for (let i = 0; i + 3 < segmentos.length; i += 4) {
    let s1 = segmentos[i]!;
    let h1 = segmentos[i + 1]!;
    let s2 = segmentos[i + 2]!;
    let h2 = segmentos[i + 3]!;

    if ((s1 < sMin && s2 < sMin) || (s1 > sMax && s2 > sMax)) continue;

    const ds = s2 - s1;
    if (ds !== 0) {
      const aMin = (sMin - s1) / ds;
      const aMax = (sMax - s1) / ds;
      const entra = Math.max(0, Math.min(aMin, aMax));
      const sale = Math.min(1, Math.max(aMin, aMax));
      if (entra > sale) continue;
      const nuevoH1 = h1 + (h2 - h1) * entra;
      const nuevoH2 = h1 + (h2 - h1) * sale;
      const nuevoS1 = s1 + ds * entra;
      const nuevoS2 = s1 + ds * sale;
      s1 = nuevoS1;
      s2 = nuevoS2;
      h1 = nuevoH1;
      h2 = nuevoH2;
    }
    salida.push(s1, h1, s2, h2);
  }
  return salida;
}
