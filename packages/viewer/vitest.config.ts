import { defineConfig } from "vitest/config";

/**
 * **Las pruebas se buscan solo en `src`, y esto arregla un defecto medido.**
 *
 * Por omisión, vitest recorre el paquete entero — y `dist/` llegó a tener copias compiladas de los
 * propios archivos de prueba. El resultado: cuarenta pruebas contadas como **ochenta**, la mitad
 * corriendo contra JavaScript viejo. Una copia rancia puede pasar contra código que ya no existe,
 * que es peor que no tener prueba: afirma que algo funciona cuando nadie lo ha comprobado.
 *
 * `tsconfig.json` ya excluye las pruebas del `dist`, así que no volverán a generarse. Esto es el
 * cinturón: si alguien quita esa exclusión, aquí no se cuelan igual.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
