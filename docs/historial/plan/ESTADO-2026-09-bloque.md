# Hasta dónde llega el bloque, revisado el 2026-09-03

> **Archivo histórico, solo lectura.** Salió de `MASTER_PLAN.md` el 2026-10-05, tal cual estaba, para que el tablero se pueda leer entero. Lo abierto sigue en [MASTER_PLAN.md](../../../MASTER_PLAN.md); `node scripts/claude/plan-fila.mjs <código>` busca aquí también.

### Hasta dónde llega este bloque, revisado el 2026-09-03

El usuario lo encargó así: **«revisar el plan de los módulos pendientes y ver hasta dónde llegar, ya
que de momento la coordinación, nubes de puntos e IFC son lo más importante en este bloque»**. Esto
es la respuesta, con lo que se puede afirmar y lo que no.

**De los tres, dos están hechos y el tercero no ha empezado.**

| Lo importante del bloque | Dónde está de verdad                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coordinación**         | **Cerrada salvo medio punto.** Las fases 4, 5, 10 y 11 completas: detectar, agrupar, repartir, descartar, distinguir lo nuevo, el papel, el BCF de ida y vuelta. Queda `F4.5` |
| **IFC**                  | **Cerrado como camino completo**: se lee, se valida con IDS, se cruza, se anota por GUID, se saca en BCF, en DXF, en PDF y en cuadros. No queda ninguna fila abierta          |
| **Nubes de puntos**      | **Sin empezar: seis filas.** Y con dos condiciones que hay que decir antes de prometer plazos                                                                                 |

**Lo que queda de coordinación son dos tardes**, no un bloque: `F4.5` —el trazo libre sobre el
modelo— y las tres anotaciones que faltan de `F7.3` —ángulos, pendientes y llamadas—, las dos por
caminos que ya están abiertos. Eso es lo que se hace primero, porque cierra dos fases enteras.

**Y sobre las nubes, dos cosas que cambian la conversación:**

1. **El problema real es la alineación, no el render.** Cargar puntos es un `loader` y se hace en una
   tarde. Que caigan **donde corresponde respecto al modelo** es lo difícil: un IFC viene en
   coordenadas locales de proyecto y a veces con el norte rotado, mientras la nube viene
   georreferenciada del vuelo. `F2.1` sin `F2.2` es una nube bonita al lado del edificio, y `F2.4`
   —medir la desviación entre lo construido y lo modelado, que es para lo que sirve todo esto— mide
   basura con dos decimales hasta que `F2.2` esté resuelta.
2. **No se puede verificar en este entorno.** El oráculo de la fase es CloudCompare y el panel del
   navegador **no compone fotogramas**: es la misma limitación que tuvo `F7.1` parada meses y que
   obligó al corte por falta de latido. Una nube se juzga mirándola. Lo que sí se puede comprobar sin
   pantalla es la aritmética de la alineación —una transformación conocida aplicada a puntos
   conocidos— y ahí es donde conviene poner el esfuerzo medible.

**La recomendación, entonces, en este orden:**

1. ~~`F4.5` y lo que falta de `F7.3`~~ — **`F7.3` cerrada el 2026-09-03**, y con ella la fase 7
   entera. `F4.5` sigue condicionada a que mires un BCF exportado.
2. ~~`F2.5` **antes que `F2.1`**~~ — **cerrada el 2026-09-03**, y acertó el orden: decidió que entra
   **COPC** y no Potree, con lo que el cargador se escribe una vez. Está en
   [`docs/NUBES_DE_PUNTOS.md`](../../../docs/NUBES_DE_PUNTOS.md).
3. **`F2.2`, la alineación** — es lo que sigue, con su prueba de aritmética pura en `bim-core`:
   transformación conocida, puntos conocidos, desviación esperada. Y ahora se sabe que empieza por
   **restar el desplazamiento**, no por rotar: en coordenadas UTM absolutas el `float32` de WebGL ya
   pierde 20 cm antes de que nadie alinee nada.
4. `F2.1` y `F2.3` después, sabiendo que **su aspecto queda pendiente de tu pantalla**, no de la
   nuestra. Y que lo primero de `F2.1` es comprobar que `copc` + `laz-perf` abren en el navegador el
   archivo que escribe `pdal` — eso está **sin verificar**, y el documento lo dice.

**Y las decisiones que siguen bloqueadas** —hoy el trazo libre de `F4.5`— no están en
esta lista porque no son trabajo: son elecciones. Están abajo, en «Las decisiones que solo el usuario
puede tomar».

⭐ = prioridad del 2026-09-02. Las fases 2 y 6 **no se descartan, se posponen**: son las dos que no
tienen ni un archivo con el que verificarse hoy —no hay nube de puntos ni ortofoto en el
repositorio— así que abrirlas sería construir a ciegas mientras la coordinación espera.

**El orden no es el número de la fase.** Va primero lo que deja la aplicación entera y usable con
lo que ya hay —la Fase 9— y después lo que abre frente nuevo. Las fases 2, 5 y 6 son las tres
grandes que quedan por empezar, y ninguna se abre con la anterior a medio cerrar.
