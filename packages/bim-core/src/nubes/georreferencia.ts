/**
 * Del sistema local del IFC al sistema del levantamiento, y de vuelta.
 *
 * ## El problema, en una frase
 *
 * Un IFC de obra viene en **coordenadas locales de proyecto** —el origen en una esquina del
 * edificio, y a veces el norte girado para que las plantas salgan rectas en el papel— mientras la
 * nube viene **georreferenciada del vuelo**, en UTM. Poner las dos en la misma escena es aplicar la
 * transformación que las relaciona; el resto de la Fase 2 se apoya en esto.
 *
 * ## Y la respuesta está escrita en el archivo, cuando está
 *
 * IFC4 define `IfcMapConversion` justo para esto, y no hay que inventar nada: da el desplazamiento
 * (`Eastings`, `Northings`, `OrthogonalHeight`), **el giro** (`XAxisAbscissa`, `XAxisOrdinate`, que
 * son las dos componentes del eje X local expresado en el sistema del mapa) y la escala (`Scale`).
 *
 * **El giro es la mitad que faltaba.** El extractor del servidor leía desplazamiento y escala pero
 * **no las dos componentes del eje**, así que con lo que llegaba al visor se podía trasladar el
 * modelo y no orientarlo — y un edificio girado 20° sobre la nube no se cruza con nada. Se añadió
 * junto a este módulo.
 *
 * ## Las tres vías, que no son equivalentes, y la cuarta que es no saber
 *
 * | Vía                                     | Qué da                                  | Sirve para alinear |
 * | --------------------------------------- | --------------------------------------- | ------------------ |
 * | `IfcMapConversion` (IFC4)               | Desplazamiento, giro y escala           | **Sí, del todo**   |
 * | `TrueNorth` del contexto                | Solo el giro                            | A medias           |
 * | `IfcSite.RefLatitude/RefLongitude`      | En qué ciudad está                       | No                 |
 * | Nada — la mayoría de los IFC de obra    | —                                       | Calce a mano       |
 *
 * Cada resultado **dice por qué vía salió**, y eso no es un adorno: alinear con `IfcMapConversion`
 * es leer el archivo, y alinear con puntos a mano es una estimación con residuos. Presentar las dos
 * como «alineado» sería la mentira con dos decimales que ya nos costó una fase.
 *
 * ## Y una cosa que este módulo no hace: proyectar
 *
 * No convierte latitud y longitud a UTM. Eso pide una biblioteca de proyecciones —`proj4`— y una
 * decisión que no toca acá. `IfcSite` sitúa el proyecto en el mundo pero no lo orienta ni lo escala:
 * se informa, y se dice que no basta.
 */

/**
 * La conversión de mapa tal como la declara IFC4, con los nombres del esquema traducidos.
 *
 * `abscisaEjeX` y `ordenadaEjeX` son `XAxisAbscissa` y `XAxisOrdinate`: las componentes del eje X
 * local **medidas en el sistema del mapa**. No hacen falta normalizadas —el esquema no lo exige— y
 * acá se normalizan al usarlas.
 */
export interface ConversionDeMapa {
  /** `Eastings`: el este del origen local, en unidades del mapa. */
  este: number;
  /** `Northings`: el norte del origen local. */
  norte: number;
  /** `OrthogonalHeight`: la altura del origen local. */
  altura: number;
  /** `XAxisAbscissa`. Ausente o nulo significa **sin giro declarado**, que no es lo mismo que 0°. */
  abscisaEjeX?: number | null;
  /** `XAxisOrdinate`. Ver `abscisaEjeX`. */
  ordenadaEjeX?: number | null;
  /** `Scale`. Ausente significa 1, que es lo que dice el esquema. */
  escala?: number | null;
}

/** Por qué vía se supo orientar el modelo. Se arrastra hasta la interfaz a propósito. */
export type ViaDeGiro = "IfcMapConversion" | "TrueNorth" | "sin giro declarado";

/**
 * La transformación del sistema local al del mapa, ya resuelta y lista para aplicar.
 *
 * Se guardan el seno y el coseno en vez del ángulo porque es lo que se usa —y porque volver a pasar
 * por `atan2` y `cos` introduce error donde no hacía falta—. `giroGrados` está para poder
 * **enseñárselo a una persona**: «el modelo está girado 21,3° respecto al norte» es una frase que se
 * puede comprobar en obra, y `0,371 rad` no.
 */
export interface Alineacion {
  este: number;
  norte: number;
  altura: number;
  escala: number;
  cos: number;
  sen: number;
  /** El giro del eje X local respecto al este del mapa, en grados, en `(-180, 180]`. */
  giroGrados: number;
  via: ViaDeGiro;
}

/** Un punto en el sistema que sea: local, o del mapa. Se distinguen por el nombre de la variable. */
export type Punto3 = readonly [number, number, number];

/**
 * Resuelve la conversión de mapa en una alineación aplicable.
 *
 * **El giro sale de las dos componentes juntas**, con `atan2`, y no de dividirlas: dividir pierde el
 * cuadrante —un eje que apunta al suroeste daría el mismo cociente que uno al noreste— y ese error
 * pone el edificio girado 180°, que es de los que se ven pero solo si alguien mira.
 *
 * Si el par de componentes **no está o es el vector nulo**, se toma «sin giro» y **se dice**: es un
 * archivo que no declaró su orientación, y tratarlo como 0° medido sería afirmar algo que nadie
 * escribió. Igual con la escala ausente, que el esquema fija en 1.
 */
export function alineacionDeMapa(conversion: ConversionDeMapa): Alineacion {
  const escala =
    numeroUtil(conversion.escala) && conversion.escala !== 0 ? (conversion.escala as number) : 1;

  const a = numeroUtil(conversion.abscisaEjeX) ? (conversion.abscisaEjeX as number) : null;
  const o = numeroUtil(conversion.ordenadaEjeX) ? (conversion.ordenadaEjeX as number) : null;

  // El vector nulo no es una direccion. `(0,0)` es lo que escriben los programas que no saben la
  // orientacion, igual que el `(0,0,0,0)` de la latitud, y darlo por «cero grados medidos» es el
  // mismo error de la isla nula.
  const largo = a === null || o === null ? 0 : Math.hypot(a, o);
  if (largo === 0) {
    return {
      este: conversion.este,
      norte: conversion.norte,
      altura: conversion.altura,
      escala,
      cos: 1,
      sen: 0,
      giroGrados: 0,
      via: "sin giro declarado",
    };
  }

  return {
    este: conversion.este,
    norte: conversion.norte,
    altura: conversion.altura,
    escala,
    cos: (a as number) / largo,
    sen: (o as number) / largo,
    giroGrados: (Math.atan2(o as number, a as number) * 180) / Math.PI,
    via: "IfcMapConversion",
  };
}

/**
 * La alineación cuando lo único que hay es el norte verdadero del contexto geométrico.
 *
 * `TrueNorth` de `IfcGeometricRepresentationContext` es una dirección 2D que dice **dónde cae el
 * norte en coordenadas locales**. Ojo al cambio de papel: `IfcMapConversion` da el eje X local visto
 * desde el mapa, y esto da el norte del mapa visto desde lo local. Son transformaciones inversas, y
 * confundirlas gira el modelo al otro lado —un error que se ve como un edificio espejado en planta—.
 *
 * Orienta pero **no sitúa**: sin desplazamiento el modelo queda girado bien y en el sitio
 * equivocado. Se devuelve con el desplazamiento en cero, y la vía dicha.
 */
export function alineacionDeNorteVerdadero(norteLocal: readonly [number, number]): Alineacion {
  const [nx, ny] = norteLocal;
  const largo = Math.hypot(nx, ny);
  if (largo === 0) {
    return {
      este: 0,
      norte: 0,
      altura: 0,
      escala: 1,
      cos: 1,
      sen: 0,
      giroGrados: 0,
      via: "sin giro declarado",
    };
  }

  // El norte local `(nx, ny)` visto desde el mapa es el eje Y del mapa. El angulo del norte medido
  // desde el eje Y local es `atan2(nx, ny)`; el eje X local visto desde el mapa gira lo mismo en
  // sentido contrario, de ahi el signo.
  const anguloNorte = Math.atan2(nx, ny);
  const giro = -anguloNorte;
  return {
    este: 0,
    norte: 0,
    altura: 0,
    escala: 1,
    cos: Math.cos(giro),
    sen: Math.sin(giro),
    giroGrados: (giro * 180) / Math.PI,
    via: "TrueNorth",
  };
}

/**
 * Lleva un punto del sistema local del IFC al del mapa.
 *
 * Es la fórmula del esquema, literal: girar, escalar y desplazar, en ese orden. La altura no gira
 * —el giro es alrededor del eje vertical, que es lo único que un `IfcMapConversion` describe— pero
 * **sí escala**: una escala distinta de 1 que no se aplicara a la altura dejaría el edificio
 * achatado, que es un defecto que se ve pero no se sospecha.
 */
export function localAMapa(punto: Punto3, a: Alineacion): [number, number, number] {
  const [x, y, z] = punto;
  return [
    a.este + a.escala * (x * a.cos - y * a.sen),
    a.norte + a.escala * (x * a.sen + y * a.cos),
    a.altura + a.escala * z,
  ];
}

/**
 * Y de vuelta: del mapa al sistema local.
 *
 * Hace falta en los dos sentidos, y el de vuelta es el que más se usa: la nube llega en coordenadas
 * del mapa y hay que **traerla al sistema del modelo**, porque el modelo es lo que ya está en la
 * escena y moverlo movería las observaciones, las vistas guardadas y los planos —todo lo que hay
 * anotado sobre él—.
 *
 * Es la inversa exacta, no una aproximación: se deshace el desplazamiento, se divide por la escala y
 * se gira al revés. Una escala de cero devuelve `NaN`, y eso es correcto: no hay inversa.
 */
export function mapaALocal(punto: Punto3, a: Alineacion): [number, number, number] {
  const dx = (punto[0] - a.este) / a.escala;
  const dy = (punto[1] - a.norte) / a.escala;
  return [dx * a.cos + dy * a.sen, -dx * a.sen + dy * a.cos, (punto[2] - a.altura) / a.escala];
}

/** `true` si el valor es un número con el que se puede contar. `null`, `undefined` y `NaN` no. */
function numeroUtil(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v);
}
