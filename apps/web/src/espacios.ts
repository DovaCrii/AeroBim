/**
 * Los dos espacios de trabajo: **Modelo 3D** y **Planos y perfiles** (2026-10-05).
 *
 * ## Qué es y qué no es
 *
 * Un espacio es **una forma de usar el mismo visor**, no otra aplicación: el motor, la escena, la
 * selección y los cortes son los mismos, y cambiar de espacio **no reconvierte nada**. Lo único que
 * cambia es **qué se muestra**: qué secciones del navegador y qué grupos de la cinta.
 *
 * Existe por el trabajo de un proyecto lineal —un metro—, donde se alterna entre revisar el modelo y
 * sacar, leer y entregar perfiles y planos. Con todo en una sola columna, esa segunda tarea quedaba
 * enterrada entre doce secciones que no usa. Revierte a propósito la decisión de «una sola ventana»
 * de `docs/UX.md`: ahí el umbral para una pestaña nueva era «un modo de trabajo entero», y éste lo es.
 *
 * ## Por qué un módulo aparte y puro
 *
 * Las reglas —qué se oculta, cuándo se cambia solo— son lo que más se va a tocar y lo que peor se
 * prueba mirando la pantalla. Aquí no hay React: son datos y funciones con respuesta calculable.
 */

export type Espacio = "modelo" | "planos";

export const ESPACIOS: readonly Espacio[] = ["modelo", "planos"];

export const TITULO_DE_ESPACIO: Record<Espacio, string> = {
  modelo: "Modelo 3D",
  planos: "Planos 2D y perfiles",
};

/**
 * Las secciones del navegador que **no** se muestran en cada espacio.
 *
 * Se declara lo oculto y no lo visible a propósito: una sección nueva aparece en los dos espacios
 * hasta que alguien decide dónde no va, que es el fallo menos dañino —sobra una sección— frente a
 * la alternativa —una capacidad que no aparece en ninguna parte—.
 *
 * - **Modelo 3D** deja fuera lo que es del papel: los planos 2D de referencia y los generados.
 * - **Planos y perfiles** deja fuera lo que es del modelo y de la nube: estructura, cuadros, calce y
 *   coordinación. «Modelos abiertos» se queda, porque comparar un plano con el modelo es encender y
 *   apagar los dos.
 */
export const SECCIONES_OCULTAS: Record<Espacio, readonly string[]> = {
  modelo: ["planos", "generados"],
  planos: ["coordinacion", "nubes", "calce", "estructura", "cuadros", "vistas", "vistas-proyecto"],
};

/**
 * Los grupos de la cinta que **no** se muestran en cada espacio.
 *
 * Los cortes son una herramienta del 3D —se arrastran sobre el modelo—; en el espacio de planos
 * estorban y prometen algo que ahí no se hace.
 */
export const GRUPOS_OCULTOS: Record<Espacio, readonly string[]> = {
  modelo: [
    // «Documentar» (generar un plano, trazar un eje) **también está en el 3D** desde el 2026-10-08: se
    // ocultaba aquí por ser trabajo de papel, y quien tenía el modelo delante no encontraba cómo
    // sacar un plano. Generarlo abre el visor 2D solo.
    // «Modo 2D» y «Comparar» son del plano. No se ocultan como grupo —«Referencias» conserva los
    // ejes, que el 3D sí usa— sino cada uno por su rótulo.
    botonDe("Modo 2D"),
    botonDe("Comparar"),
  ],
  planos: [
    "Cortes",
    "Vistas guardadas",
    // Observar cuelga de un elemento seleccionado, y ese espacio no muestra el árbol donde se elige.
    "Coordinar",
  ],
};

/**
 * Cómo se llama cada pestaña de la cinta en cada espacio, cuando no es su nombre de siempre.
 *
 * La pestaña `modelo` en el espacio de planos no tiene modelo: lleva la visibilidad y lo que se
 * documenta. Llamarla «Modelo» ahí dice lo contrario de lo que contiene.
 */
export const TITULOS_DE_PESTANA: Record<Espacio, Readonly<Record<string, string>>> = {
  modelo: {},
  planos: { modelo: "Documentar" },
};

/** Cómo se nombra, en `GRUPOS_OCULTOS`, un botón suelto de la cinta y no un grupo entero. */
export function botonDe(rotulo: string): string {
  return `boton:${rotulo}`;
}

/** El otro espacio. */
export function elOtro(espacio: Espacio): Espacio {
  return espacio === "modelo" ? "planos" : "modelo";
}

/** Si una sección del navegador se ve en un espacio. */
export function seccionVisible(espacio: Espacio, clave: string): boolean {
  return !SECCIONES_OCULTAS[espacio].includes(clave);
}

/**
 * En qué espacio hay que estar para ver una sección.
 *
 * Si ya se ve en el actual, **no se cambia**: la persona decide dónde está y no se la mueve sin
 * motivo. Solo se cambia cuando pedir la sección en el actual no llevaría a ninguna parte. Una
 * sección que no se ve en ninguno de los dos devuelve el actual: no hay adónde ir.
 */
export function espacioParaVerSeccion(actual: Espacio, clave: string): Espacio {
  if (seccionVisible(actual, clave)) return actual;
  const otro = elOtro(actual);
  return seccionVisible(otro, clave) ? otro : actual;
}

/**
 * El espacio que pide la dirección, `?espacio=planos`. Cualquier otra cosa es el 3D, que es de donde
 * se parte: un valor que no se entiende no puede dejar la aplicación en un estado raro.
 */
export function espacioPedido(busqueda: string): Espacio {
  const pedido = new URLSearchParams(busqueda).get("espacio");
  return pedido === "planos" ? "planos" : "modelo";
}

/**
 * Si abrir este archivo lleva al espacio de planos.
 *
 * Un DXF es un plano: abrirlo en el 3D lo dejaría en una sección que ese espacio no muestra. El IFC y
 * la nube son del modelo y no mueven a nadie.
 */
export function espacioDeUnArchivo(nombre: string): Espacio | null {
  return nombre.toLowerCase().endsWith(".dxf") ? "planos" : null;
}

/** Lo que hay abierto, que decide qué secciones del navegador tienen algo que decir. */
export interface ContextoDeSecciones {
  /** Hay una nube de puntos abierta. */
  readonly hayNube: boolean;
  /** Lo abierto viene de una obra del registro. */
  readonly hayProyecto: boolean;
}

/**
 * Las secciones del navegador que **no aplican a lo que hay abierto** (2026-10-05).
 *
 * El navegador tenía 14 cabeceras con un solo modelo abierto, y tres de ellas decían «vacío»: una
 * sección para una nube que no existe, un calce que necesita esa nube, y las notas de una obra cuando el
 * archivo vino del disco. **Una sección que no puede tener contenido no es una herramienta, es ruido.**
 * Aparecen solas cuando hay algo a lo que aplicarlas, y por eso esto no oculta nada que se pueda necesitar:
 *
 * - **Nube y calce** necesitan una nube. Abrirla no depende de esta sección: está el botón «Abrir» de la
 *   barra y soltar el archivo en cualquier parte del lienzo.
 * - **Coordinación y vistas del proyecto** son de una obra del registro: de un archivo del disco no hay
 *   obra, y la sección solo diría «abre un modelo del registro».
 */
export function seccionesQueNoAplican(contexto: ContextoDeSecciones): readonly string[] {
  const fuera: string[] = [];
  if (!contexto.hayNube) fuera.push("nubes", "calce");
  if (!contexto.hayProyecto) fuera.push("coordinacion", "vistas-proyecto");
  return fuera;
}
