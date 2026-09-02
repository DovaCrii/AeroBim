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

import { readFileSync } from "node:fs";
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

/** Los `--color-*` declarados en `@theme`, tal como se compilan. */
function tokens(): Record<string, string> {
  const encontrados: Record<string, string> = {};
  for (const linea of CSS.split("\n")) {
    const par = /^\s*--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/.exec(linea);
    if (par !== null) encontrados[par[1] as string] = (par[2] as string).toLowerCase();
  }
  return encontrados;
}

const T = tokens();

/** Lo que el visor pinta debajo del texto. El texto tiene que pasar AA sobre los tres. */
const SUPERFICIES = ["shell", "surface", "surface-2", "surface-3"] as const;

/** Los tres niveles de texto. El más apagado también pasa AA: eso es el punto. */
const TEXTOS = ["fg", "fg-2", "fg-3"] as const;

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
  const fuentes = ["App.tsx", "documento.tsx", "index.css"].map((n) => join(VISOR, n));

  function todoElVisor(): string {
    // Se leen los componentes además de las dos raíces: es donde vive el noventa por ciento de las
    // clases.
    const componentes = [
      "Coordinacion",
      "DrawingsPanel",
      "ModelsPanel",
      "NotaFlotante",
      "Origen",
      "PlansPanel",
      "ProjectBrowser",
      "PropertiesPanel",
      "Resizer",
      "Ribbon",
      "Selector",
      "SpatialTree",
      "StatusBar",
      "ViewCube",
      "VistasCompartidas",
    ].map((n) => join(VISOR, "components", `${n}.tsx`));
    return [...fuentes, ...componentes]
      .map((r) => sinComentarios(readFileSync(r, "utf8")))
      .join("\n");
  }

  const CODIGO = todoElVisor();

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
