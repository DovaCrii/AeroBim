/**
 * El sistema de diseño del visor, comprobado sobre el CSS que se sirve. `F9.1`–`F9.3`.
 *
 * **Esta prueba lee `apps/web/src/index.css`, y eso es a propósito.** La alternativa —copiar la
 * tabla de tokens en un archivo de TypeScript y comprobar la copia— sería una prueba que pasa
 * mientras la aplicación está mal: exactamente la clase de prueba que este repositorio no quiere.
 * Leyendo el archivo que se compila, si alguien retoca un hexadecimal y baja un texto por debajo
 * de AA, **falla el gate**.
 *
 * El precio es que un paquete de dominio mira un archivo de la aplicación. Solo lo hace una
 * prueba, nunca el código que se publica, y si el archivo se mueve esto falla de forma ruidosa —
 * que es lo correcto.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA_NO_TEXTO, AA_TEXTO, contrastRatio } from "./contraste.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const VISOR = join(AQUI, "..", "..", "..", "..", "apps", "web", "src");
const CSS = readFileSync(join(VISOR, "index.css"), "utf8");

/**
 * El archivo sin sus comentarios.
 *
 * **Hace falta, y la primera versión de esta prueba lo descubrió fallando.** Los comentarios de
 * este repositorio **nombran a propósito lo que se dejó de usar** —«`text-white/30` daba 2,67:1»,
 * «convivían `red-400`, `rose-300`…»— porque es la explicación de por qué existe el token nuevo.
 * Una prohibición que también prohíbe explicarla obligaría a borrar el porqué, que es justo lo que
 * no se borra acá.
 *
 * Se quitan los bloques `/* … *\/` y las líneas que empiezan por `//` o `*`. Nunca se corta a
 * mitad de línea: una cadena de clases puede llevar `//` dentro de una URL.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((linea) => !/^\s*(\/\/|\*)/.test(linea))
    .join("\n");
}

const CSS_CODIGO = sinComentarios(CSS);

/**
 * El contenido de un bloque `{ … }` que empieza en el selector dado.
 *
 * **Hace falta desde que hay dos temas.** Antes `tokens()` recorría el archivo entero, y eso
 * funcionaba mientras solo existía `@theme`: con un bloque `[data-theme="light"]` que redeclara los
 * mismos `--color-*`, el diccionario se queda con **el último que lee**, o sea que el gate mediría
 * el tema claro creyendo que mide el oscuro. Los ratios saldrían de una mezcla de los dos.
 *
 * Se cuentan las llaves porque `@theme` puede llevar `@media` dentro; parar en el primer `}` daría
 * medio bloque.
 */
function bloque(fuente: string, selector: string): string {
  const inicio = fuente.indexOf(selector);
  if (inicio < 0) return "";
  const abre = fuente.indexOf("{", inicio);
  let nivel = 0;
  for (let i = abre; i < fuente.length; i += 1) {
    if (fuente[i] === "{") nivel += 1;
    else if (fuente[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fuente.slice(abre + 1, i);
    }
  }
  return fuente.slice(abre + 1);
}

/** Los `--color-*` declarados dentro de un bloque, tal como se compilan. */
function tokensDe(fuente: string): Record<string, string> {
  const encontrados: Record<string, string> = {};
  for (const linea of fuente.split("\n")) {
    const par = /^\s*--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/.exec(linea);
    if (par !== null) encontrados[par[1] as string] = (par[2] as string).toLowerCase();
  }
  return encontrados;
}

/** Los del tema oscuro, que es el de partida del visor. */
function tokens(): Record<string, string> {
  return tokensDe(bloque(CSS, "@theme"));
}

const T = tokens();

/** Solo lo que el bloque claro **redeclara**, para poder preguntar qué falta y qué no debe estar. */
const SOLO_CLARO = tokensDe(bloque(CSS, '[data-theme="light"]'));

/**
 * El color que **se ve** con el tema claro puesto: lo redeclarado sobre lo heredado.
 *
 * Las dos cosas hacen falta y miden preguntas distintas. `SOLO_CLARO` contesta «¿está redefinido?»
 * —y la marca tiene que salir `undefined` ahí—; `CLARO` contesta «¿qué contraste da?», y para eso
 * hay que aplicar la cascada, porque un token heredado se ve igual que uno redeclarado.
 */
const CLARO: Record<string, string> = { ...T, ...SOLO_CLARO };

/**
 * Todo el visor, **leyendo el directorio y no una lista a mano**.
 *
 * La lista escrita a mano tenía quince nombres y el directorio veinte: se escapaban `CalcePanel`,
 * `CuadrosPanel`, `CuadroFlotante`, `NubesPanel` e `icons`. O sea que **las cuatro pantallas más
 * nuevas —las de la nube y el calce— no las miraba nadie**, que es al revés de lo que hace falta:
 * un gate protege sobre todo lo que se acaba de escribir.
 *
 * Y el fallo era invisible por construcción: añadir un componente **no** rompe nada, así que nadie
 * se acuerda de añadirlo aquí. Con `readdirSync` la omisión ya no es posible.
 *
 * Vive al nivel del módulo porque lo miran dos bloques: el de lo que el visor no puede escribir y
 * el del tema claro.
 */
function todoElVisor(): string {
  const raices = ["App.tsx", "documento.tsx", "index.css"].map((n) => join(VISOR, n));
  const componentes = readdirSync(join(VISOR, "components"))
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => join(VISOR, "components", n));
  return [...raices, ...componentes].map((r) => sinComentarios(readFileSync(r, "utf8"))).join("\n");
}

const CODIGO = todoElVisor();

/** Lo que el visor pinta debajo del texto. El texto tiene que pasar AA sobre los tres. */
const SUPERFICIES = ["shell", "surface", "surface-2", "surface-3"] as const;

/** Los tres niveles de texto. El más apagado también pasa AA: eso es el punto. */
const TEXTOS = ["fg", "fg-2", "fg-3"] as const;

describe("el movimiento está declarado", () => {
  // **Había siete `transition-colors` sueltos y ninguna duración escrita**, así que el producto
  // tenía un movimiento —el de fábrica de Tailwind— que no había elegido nadie.

  it("las tres duraciones y la curva existen", () => {
    for (const token of ["--ease-ab", "--duracion-corta", "--duracion-media", "--duracion-larga"]) {
      expect(CSS_CODIGO).toContain(token);
    }
  });

  it("quien pide menos movimiento lo recibe", () => {
    // No es una preferencia estética: la declara quien se marea con el movimiento en pantalla, y en
    // un visor 3D —donde la cámara ya se mueve— importa más que en una página normal.
    expect(CSS_CODIGO).toContain("prefers-reduced-motion: reduce");
  });

  it("y se apaga a 0.01ms, no a 0", () => {
    // **Con `0` algunos navegadores no disparan `transitionend`**, así que un código que espere el
    // final de la transición se queda esperando para siempre. Es el truco de siempre y esta prueba
    // existe para que nadie lo «arregle» poniendo cero.
    const reducido = bloque(CSS_CODIGO, "prefers-reduced-motion");
    expect(reducido).toContain("0.01ms");
    expect(reducido).not.toMatch(/transition-duration:\s*0\s*(!important)?\s*;/);
  });

  it("existe el tamaño de 24 px que el sistema nombra", () => {
    // `DESIGN_SYSTEM.md` lo tenía en su tabla como `--fs-2xl` y el código no lo tenía, así que el
    // título de la puerta habría ido escrito a mano — y un tamaño a mano es el primer paso para
    // tener siete.
    expect(CSS_CODIGO).toContain("--text-lg: 1.5rem");
  });
});

describe("los tokens están declarados", () => {
  it("están todos los que el sistema nombra", () => {
    // Si alguien borra un token, esto lo dice antes de que la clase que lo usaba salga sin color —
    // que en Tailwind no es un error, es una clase que no genera nada.
    for (const nombre of [
      ...SUPERFICIES,
      ...TEXTOS,
      "borde",
      "borde-campo",
      "brand",
      "action",
      "action-hover",
      "action-press",
      "accent",
      "ok",
      "warn",
      "danger",
      "apagado",
      "apagado-fg",
      "ink",
    ]) {
      expect(T[nombre], `falta --color-${nombre}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("el tema claro", () => {
  // **Es la columna «Claro» de `DESIGN_SYSTEM.md`, que llevaba escrita desde el 2026-09-01 y no
  // estaba implementada en ninguna parte.** El visor solo tenía el oscuro.

  it("redefine todo lo que cambia con el tema, y solo eso", () => {
    // **La marca no está en la lista a propósito**: es la misma en los dos temas y en las dos
    // mitades del producto. Si apareciera aquí, alguien la habría aclarado «para mejorar el
    // contraste», y entonces deja de ser la marca.
    const faltan = [
      ...SUPERFICIES,
      ...TEXTOS,
      "borde",
      "borde-campo",
      "track",
      "action",
      "action-hover",
      "action-press",
      "accent",
      "accent-hover",
      "ok",
      "warn",
      "danger",
      "apagado",
      "apagado-fg",
    ].filter((n) => SOLO_CLARO[n] === undefined);

    expect(faltan, `el tema claro no redefine: ${faltan.join(", ")}`).toEqual([]);
  });

  it("la marca no cambia con el tema", () => {
    // Al revés que las demás: esta exige que **no** esté redefinida.
    expect(SOLO_CLARO["brand"]).toBeUndefined();
  });

  it("los tres niveles de texto pasan AA sobre las tres superficies claras", () => {
    const flojos: string[] = [];
    for (const texto of TEXTOS) {
      for (const fondo of ["shell", "surface", "surface-2"] as const) {
        const ratio = contrastRatio(CLARO[texto] as string, CLARO[fondo] as string);
        if (ratio < AA_TEXTO) flojos.push(`${texto} sobre ${fondo}: ${ratio.toFixed(2)}`);
      }
    }
    expect(flojos, `por debajo de AA en tema claro: ${flojos.join(" · ")}`).toEqual([]);
  });

  it("blanco sobre el relleno de acción se lee", () => {
    expect(contrastRatio("#ffffff", CLARO["action"] as string)).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  it("el contorno de un campo se distingue de su fondo", () => {
    // WCAG 1.4.11: 3:1 para lo que transmite información sin ser texto, y el contorno de un campo
    // es lo único que dice dónde se puede escribir.
    expect(
      contrastRatio(CLARO["borde-campo"] as string, CLARO["surface"] as string),
    ).toBeGreaterThanOrEqual(AA_NO_TEXTO);
  });

  it("y las sombras dejan de ser negras del tema oscuro", () => {
    // **Lo que se olvida al hacer un tema claro.** Las de `@theme` son negro al 30–60 %, calculadas
    // para fondo oscuro; sobre blanco, negro al 45 % es una mancha. Es el mismo error que
    // `--ab-shadow` tenía en el portal y que `F9.5` arregló allí.
    const claro = bloque(CSS_CODIGO, '[data-theme="light"]');
    expect(claro).toContain("--shadow-sm");
    expect(claro).toContain("--shadow-md");
    expect(claro).toContain("--shadow-xl");
    expect(claro).not.toMatch(/--shadow-[a-z]+:[^;]*rgb\(0 0 0/);
  });

  it("la sombra se pide por su variable, no por la utilidad de Tailwind", () => {
    // **Y esto lo enseñó el navegador, no el razonamiento.**
    //
    // Redefinir `--shadow-xl` en el bloque claro **no cambiaba nada**: medido, `shadow-xl` seguía
    // dando `rgba(0, 0, 0, 0.6)` con el tema claro puesto. Tailwind hornea el valor del tema
    // **dentro de la utilidad** en tiempo de compilación, así que la variable que se redefine
    // después ya no la consulta nadie.
    //
    // Los colores sí son tematizables por variable —`bg-action/30` resuelve su `color-mix()` en
    // tiempo de ejecución, comprobado: `oklab(0.519…)` en oscuro contra `oklab(0.442…)` en claro—
    // y esa asimetría es justo lo que había que verificar mirándolo en vez de suponerlo.
    //
    // La forma que funciona es pedirla como valor arbitrario: `shadow-[var(--shadow-xl)]`. Medido
    // después del cambio: `rgba(0, 0, 0, 0.6)` en oscuro y `rgba(18, 34, 59, 0.18)` en claro.
    // El `(?<!-)` no es adorno: sin él, la expresión caza el `--shadow-xl` de dentro del propio
    // `var()` —y también su declaración en `index.css`— así que el arreglo fallaría su propia
    // prueba. Lo que se prohíbe es la **utilidad** de Tailwind, no el nombre de la variable.
    expect(CODIGO).not.toMatch(/(?<!-)\bshadow-xl\b/);
  });
});

describe("contraste del texto", () => {
  it("los tres niveles pasan AA sobre las cuatro superficies", () => {
    // **Es el objetivo de salida de la fase.** Antes, `text-white/30` daba 2,67:1 sobre el fondo de
    // un panel y era el rótulo de grupo de la cinta, a 9,9 px: el peor par posible.
    for (const texto of TEXTOS) {
      for (const fondo of SUPERFICIES) {
        const ratio = contrastRatio(T[texto] as string, T[fondo] as string);
        expect(ratio, `${texto} sobre ${fondo} da ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          AA_TEXTO,
        );
      }
    }
  });

  it("los cuatro colores de estado también", () => {
    for (const estado of ["ok", "warn", "danger", "accent"] as const) {
      for (const fondo of SUPERFICIES) {
        const ratio = contrastRatio(T[estado] as string, T[fondo] as string);
        expect(ratio, `${estado} sobre ${fondo} da ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          AA_TEXTO,
        );
      }
    }
  });

  it("el blanco sobre los tres rellenos de acción", () => {
    // El botón `Abrir` es la acción principal de la aplicación y con el violeta de marca daba
    // 4,13:1: no pasaba. Los rellenos de acción existen justamente para eso.
    for (const relleno of ["action", "action-hover", "action-press"] as const) {
      const ratio = contrastRatio("#ffffff", T[relleno] as string);
      expect(ratio, `blanco sobre ${relleno} da ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        AA_TEXTO,
      );
    }
  });
});

describe("los suelos de lo que no es texto", () => {
  it("el contorno de campo pasa 3:1, que es lo que pide WCAG 1.4.11", () => {
    expect(
      contrastRatio(T["borde-campo"] as string, T["surface"] as string),
    ).toBeGreaterThanOrEqual(AA_NO_TEXTO);
  });

  it("lo deshabilitado no pasa AA a propósito, pero se lee", () => {
    // Declara que no se puede usar; si además no se lee, nadie sabe qué dice el botón que no puede
    // pulsar. Por eso tiene suelo propio y no exención.
    const ratio = contrastRatio(T["apagado-fg"] as string, T["surface"] as string);
    expect(ratio).toBeGreaterThanOrEqual(AA_NO_TEXTO);
    expect(ratio).toBeLessThan(AA_TEXTO);
  });

  it("la marca no sirve para texto, y por eso hay un acento aparte", () => {
    // No es una opinión: 3,96:1 sobre la superficie de un panel. La prueba fija la razón de que
    // exista `--color-accent`, para que nadie «simplifique» volviendo a usar el violeta de marca.
    expect(contrastRatio(T["brand"] as string, T["surface"] as string)).toBeLessThan(AA_TEXTO);
  });

  it("las superficies se separan por borde y sombra, no por luminancia", () => {
    // Entre un plano y el siguiente hay poco más de 1,1:1, y es deliberado: no compiten por
    // atención, solo se ordenan. Si alguien las separa a base de luz, esto lo dice.
    for (const [a, b] of [
      ["shell", "surface"],
      ["surface", "surface-2"],
      ["surface-2", "surface-3"],
    ] as const) {
      expect(contrastRatio(T[a] as string, T[b] as string)).toBeLessThan(1.3);
    }
  });
});

describe("lo que el visor ya no puede escribir", () => {
  it("nunca `transition-all`", () => {
    // **Es la regla del movimiento y la única que se puede comprobar leyendo.** `transition-all`
    // anima todo lo que cambie, incluidas las propiedades que fuerzan al navegador a recalcular el
    // diseño en cada fotograma: `width`, `height`, `top`. En un visor 3D eso compite por los mismos
    // milisegundos que el modelo.
    //
    // Y no da error: se ve como una interfaz que va a tirones al mover un panel.
    expect(CODIGO).not.toMatch(/\btransition-all\b/);
  });

  it("el barrido lee el directorio entero, no una lista", () => {
    // **Una prueba sobre la prueba**, y hace falta: si `readdirSync` mirara la carpeta equivocada,
    // devolvería una lista vacía y todas las de abajo pasarían sin mirar nada.
    const cuantos = readdirSync(join(VISOR, "components")).filter((n) => n.endsWith(".tsx")).length;
    expect(cuantos).toBeGreaterThanOrEqual(20);
  });

  it("ni un solo `white/NN` ni `black/NN`", () => {
    // **Es el oráculo que la propia fase declara.** El color jerárquico salía de bajar la opacidad
    // del blanco hasta que el texto dejaba de leerse; ahora sale del papel que le toca.
    const encontrados = CODIGO.match(/\b(?:white|black)\/[\d[]/g) ?? [];
    expect(encontrados).toEqual([]);
  });

  it("ningún color de la paleta de Tailwind haciendo de estado", () => {
    // Convivían `red-400`, `rose-300`, `amber-200/80`, `amber-300`, `emerald-300` y tres grises.
    // Son cuatro estados con nombre, y siempre llevan texto al lado.
    const encontrados =
      CODIGO.match(/\b(?:red|rose|amber|emerald|green|yellow|slate|gray|zinc|neutral)-\d{3}\b/g) ??
      [];
    expect(encontrados).toEqual([]);
  });

  it("`text-brand` no existe: la marca pinta, no se lee", () => {
    expect(CODIGO).not.toMatch(/\btext-brand\b/);
  });

  it("ninguna acción escondida detrás del ratón", () => {
    // **`F9.4`.** `opacity-0 group-hover:opacity-100` no existe para el teclado, no existe en
    // táctil, y aparece bajo el dedo justo cuando el cursor pasa por encima. Eran cinco: cerrar un
    // modelo, borrar una vista, borrar una cota, quitar una vista compartida y el ojo del árbol.
    expect(CODIGO).not.toMatch(/\bopacity-0\b/);
  });

  it("ningún `font-size` en porcentaje", () => {
    // El `html { font-size: 110% }` era el síntoma de una escala mal calibrada. La escala está
    // calibrada; el zoom sobra.
    expect(CSS_CODIGO).not.toMatch(/font-size:\s*\d+%/);
  });

  it("y hay una regla de foco global, que antes no había ninguna", () => {
    // Cero coincidencias de `focus` en todo `apps/web/src`: quien navegaba con el tabulador no
    // sabía nunca dónde estaba.
    expect(CSS).toMatch(/:focus-visible\s*\{/);
    expect(CSS).toMatch(/outline:\s*2px solid var\(--color-accent\)/);
  });
});

describe("el área de toque, el radio y la elevación", () => {
  it("los botones de icono llevan su área mínima, y la regla se hereda", () => {
    // **`F9.4`.** Cuarenta y cuatro píxeles es lo que pide una revisión de accesibilidad para algo
    // que se toca con el dedo, y había veinte botones por debajo. La regla se engancha a
    // `aria-label` porque un botón cuyo nombre sale de un atributo **es** un botón de icono: así
    // el que se escriba mañana lo hereda sin que nadie se acuerde.
    expect(CSS_CODIGO).toMatch(/button\[aria-label\]::before/);
    expect(CSS_CODIGO).toMatch(/min-width:\s*44px/);
    expect(CSS_CODIGO).toMatch(/min-height:\s*44px/);
  });

  it("la escala de radio es la del portal", () => {
    // `F9.5`. 6 para un control, 10 para una tarjeta, y 12 que es el `--ab-radius` que el portal ya
    // tenía: es lo que hace que la costura entre las dos mitades no se note.
    for (const [nombre, px] of [
      ["sm", 6],
      ["md", 10],
      ["lg", 12],
    ] as const) {
      const encontrado = new RegExp(`--radius-${nombre}:\\s*(\\d+)px`).exec(CSS_CODIGO);
      expect(encontrado, `falta --radius-${nombre}`).not.toBeNull();
      expect(Number(encontrado?.[1])).toBe(px);
    }
  });

  it("las elevaciones son oscuras, porque el visor lo es", () => {
    // La sombra de fábrica de Tailwind es negro al 10%, calculada para fondo claro: sobre un panel
    // oscuro no se ve y la separación la hacía solo el borde.
    for (const nombre of ["sm", "md", "xl"] as const) {
      expect(CSS_CODIGO, `falta --shadow-${nombre}`).toMatch(
        new RegExp(`--shadow-${nombre}:.*rgb\\(0 0 0 / \\d+%\\)`),
      );
    }
  });
});

describe("la escala, y la densidad que no se paga", () => {
  it("ningún tamaño de letra por debajo de 11 px", () => {
    // El suelo del sistema. Había dos tokens por debajo —9,9 px y 10,9— y la raíz subida un 10%
    // para compensarlos, que agrandaba también la cinta.
    const tamanos = [...CSS.matchAll(/--text-[\w-]+:\s*([\d.]+)rem/g)].map((m) =>
      Number(m[1] as string),
    );
    expect(tamanos.length).toBeGreaterThan(0);
    for (const rem of tamanos) {
      expect(rem * 16, `${rem}rem son ${rem * 16} px`).toBeGreaterThanOrEqual(11);
    }
  });

  it("la unidad de espaciado conserva los 4,4 px de antes", () => {
    // Toda la escala de espaciado de Tailwind es un múltiplo de esto y está en `rem`: con la raíz
    // de vuelta a 16, dejarla en 0,25 habría apretado la interfaz un 10% con la letra casi igual.
    const unidad = /--spacing:\s*([\d.]+)rem/.exec(CSS);
    expect(unidad).not.toBeNull();
    expect(Number(unidad?.[1]) * 16).toBeCloseTo(4.4, 1);
  });
});
