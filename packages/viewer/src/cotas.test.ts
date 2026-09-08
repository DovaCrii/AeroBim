/**
 * El texto de una cota. `F12.9`.
 *
 * Lo que se fija aquí es lo que puede salir mal **sin dar error**: un separador decimal en inglés
 * en un producto en español, un desnivel de `1e-7` escrito como si fuera un dato, o una numeración
 * que reusa huecos y renumera una cota que alguien ya citó en una observación.
 */

import { describe, expect, it } from "vitest";
import { DESNIVEL_MINIMO_M, metros, siguienteOrdinal, textoDeCota } from "./cotas.js";

describe("el número en metros", () => {
  it("lleva coma decimal, no punto", () => {
    // **El producto está en español.** `toFixed` da punto siempre, así que se cambia en un solo
    // sitio en vez de en cada sitio que pinte una longitud.
    expect(metros(2.693)).toBe("2,693 m");
  });

  it("lleva tres decimales: milímetros, que es lo que se replantea", () => {
    expect(metros(2)).toBe("2,000 m");
    expect(metros(0.7614)).toBe("0,761 m");
  });

  it("redondea y no trunca", () => {
    // Truncar sesga: mil cotas truncadas miden medio milímetro menos de media.
    expect(metros(1.2346)).toBe("1,235 m");
    expect(metros(1.2344)).toBe("1,234 m");
  });

  it("y en el medio exacto manda el binario, no la regla de redondeo", () => {
    // **Escrito porque la primera versión de esta prueba lo dio por sentado y falló.**
    //
    // `(1.2345).toFixed(3)` da `"1.234"` y no `"1.235"`: 1,2345 no es representable en binario, y
    // el valor que la máquina guarda es un pelo **menor**, así que redondea hacia abajo. No es un
    // defecto de `toFixed` ni algo que convenga «arreglar» con aritmética propia.
    //
    // Y no importa para lo que esto mide: la tolerancia de un levantamiento es el centímetro, así
    // que medio milímetro está dos órdenes por debajo del dato. Lo que sí importaría es no saberlo
    // — de ahí esta prueba, que fija el comportamiento real en vez del que uno supone.
    expect(metros(1.2345)).toBe("1,234 m");
  });
});

describe("la forma corta", () => {
  const partes = { directM: 2.693, horizontalM: 2.5, verticalM: 1.0 };

  it("es el ordinal y la distancia directa, y nada más", () => {
    // **Una cota vive sobre el modelo**, así que su texto compite con lo que hay que mirar.
    expect(textoDeCota(3, partes, false)).toEqual(["#3 · 2,693 m"]);
  });

  it("el ordinal va delante con `#`, que es la convención del CAD", () => {
    // Es lo que permite decir «la 3» en voz alta, y lo que hace que la lista de mediciones y la
    // escena hablen de lo mismo.
    expect(textoDeCota(12, partes, false)[0]).toMatch(/^#12 /);
  });
});

describe("la forma larga", () => {
  it("son las tres magnitudes, en tres líneas", () => {
    const lineas = textoDeCota(1, { directM: 3.2, horizontalM: 2.5, verticalM: 2.0 }, true);

    expect(lineas).toEqual(["#1 · 3,200 m", "H 2,500 m", "Δ 2,000 m"]);
  });

  it("y el desnivel NO se escribe cuando no lo hay", () => {
    // **Es la decisión que evita el ruido.** Medir dos puntos del mismo suelo da un desnivel de
    // `1e-7` por el redondeo del `float32` de la geometría, y «Δ 0,000 m» en tres de cada cuatro
    // cotas sugiere un dato donde hay un cero.
    const lineas = textoDeCota(1, { directM: 2.5, horizontalM: 2.5, verticalM: 1e-7 }, true);

    expect(lineas).toEqual(["#1 · 2,500 m", "H 2,500 m"]);
  });

  it("el umbral es el milímetro, y justo en el umbral sí se escribe", () => {
    // Por debajo del milímetro no hay dato: hay aritmética. La tolerancia de un levantamiento es
    // el centímetro.
    const justo = textoDeCota(
      1,
      { directM: 1, horizontalM: 1, verticalM: DESNIVEL_MINIMO_M },
      true,
    );
    const debajo = textoDeCota(
      1,
      { directM: 1, horizontalM: 1, verticalM: DESNIVEL_MINIMO_M - 1e-9 },
      true,
    );

    expect(justo).toHaveLength(3);
    expect(debajo).toHaveLength(2);
  });

  it("una cota vertical pura también se lee", () => {
    // El caso simétrico del anterior: horizontal cero. **Ese sí se escribe**, porque «H 0,000 m»
    // en una cota vertical es la información — dice que los dos puntos están en la misma vertical.
    const lineas = textoDeCota(4, { directM: 3, horizontalM: 0, verticalM: 3 }, true);

    expect(lineas).toEqual(["#4 · 3,000 m", "H 0,000 m", "Δ 3,000 m"]);
  });
});

describe("la numeración", () => {
  it("empieza en 1", () => {
    expect(siguienteOrdinal([])).toBe(1);
  });

  it("**no reusa los huecos**", () => {
    // Es la numeración de un CAD. Si se borra la 2, la siguiente es la 4: reusar el hueco
    // renumeraría una cota que alguien ya anotó o citó en una observación, y una cota cuyo número
    // cambia deja de servir para señalarla.
    expect(siguienteOrdinal([1, 3])).toBe(4);
  });

  it("y no cuenta cuántas hay, mira el mayor dado", () => {
    // Contar daría 3 con `[1, 5, 7]`, o sea que repetiría el 3 que ya existió.
    expect(siguienteOrdinal([1, 5, 7])).toBe(8);
  });

  it("borrarlas todas no vuelve a empezar", () => {
    // Con la lista vacía sí empieza en 1 —ver arriba— y eso es correcto: se le pasa la lista de
    // ordinales **dados**, no la de cotas vivas. Quien llama decide si borrar reinicia; hoy no.
    expect(siguienteOrdinal([9])).toBe(10);
  });
});
