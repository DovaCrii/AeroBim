# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** La historia detallada vive en `git log`.
> La **fuente de verdad del trabajo pendiente** es [MASTER_PLAN.md](MASTER_PLAN.md).

## Cómo seguir (leer esto primero)

El repositorio acaba de nacer (2026-08-18). Trae **documentación, plan y marca; no
hay código de aplicación todavía**.

### El siguiente paso que más vale

**`F0.4`: abrir un IFC real de la organización en el navegador y medir cuánto
tarda.**

Es lo único que puede invalidar el stack elegido, y ninguna fase posterior lo
despeja. El estudio de alternativas verificó licencias, actividad de repositorio y
funcionalidades — **no rendimiento sobre nuestros modelos**. Un visor que abre el
modelo de demostración de la documentación en dos segundos y el IFC de una obra
real en cuatro minutos no sirve, y eso no se descubre leyendo un README.

Antes hace falta `F0.3` (el andamiaje del monorepo), que es mecánico.

**Qué se necesita para `F0.4`:** un archivo IFC de un proyecto real, de tamaño
representativo. Sin eso la prueba no vale: un modelo de ejemplo de internet no dice
nada sobre los modelos que esta herramienta va a abrir en producción.

### Y después, en este orden

1. **`F0.5` y `F0.6`** — medir la conversión a Fragments y decidir con esos números
   si corre en el navegador o en un worker. Esa decisión define si el backend de la
   Fase 3 es opcional u obligatorio.
2. **Fase 1 — visor IFC usable.** Árbol espacial, propiedades y psets, cortes,
   mediciones y varios modelos a la vez. Con eso ya hay algo que alguien de oficina
   técnica usa en vez de pedir una licencia de escritorio.
3. **Fase 2 — nubes de puntos.** El as-built contra el modelo, que es la
   comparación que hoy nadie puede hacer sin software de pago.

## Alcance: ver y coordinar, nunca procesar ni modelar

Misma regla que AeroPlanner, con dos límites en vez de uno:

- **No procesa.** No genera nubes de puntos, ortofotos ni DSM. Abre lo que otro
  produjo — un COG se lee por rangos HTTP y una nube con octree se descarga por
  niveles, así que el coste es del cliente y a demanda.
- **No modela.** No edita geometría IFC. Modelar es trabajo de Revit, ArchiCAD o
  Bonsai; aquí se revisa, se mide y se coordina.

Regla corta: **la aplicación abre lo que otro produjo, y anota lo que hay que
corregir.**

## Estado al 2026-08-18

- **Código:** ninguno todavía. `F0.3` monta el monorepo.
- **Documentación:** completa para arrancar — plan por fases, MVP, arquitectura,
  estudio de referencias con licencias verificadas y contrato con AeroPlanner.
- **Licencia:** MIT.
- **Marca:** `assets/aerobim-mark.svg` — el dron de la familia con un cubo
  isométrico, en violeta `#9B5DE5`.
- **Repositorios hermanos:** [AeroControl](https://github.com/DovaCrii/AeroControl),
  [AeroPlanner](https://github.com/DovaCrii/AeroPlanner) y
  [AeroLink](https://github.com/DovaCrii/AeroLink) — **de solo lectura desde aquí**.

## Decisiones tomadas

1. **AeroBim se separa de AeroPlanner** (2026-08-18). Lo geoespacial —ortofoto, DEM,
   curvas de nivel, nube del vuelo— **se queda en AeroPlanner**, porque ahí cierra
   el ciclo de planificación. Lo BIM —IFC, psets, BCF, interferencias— es otro
   dominio y vive aquí.
2. **That Open Company para el visor**, no xeokit. xeokit es técnicamente superior
   en varios puntos (doble precisión para coordenadas globales, IFC y nube de puntos
   en la misma escena listo para usar) pero es **AGPL-3.0**: servir la aplicación
   obligaría a liberarla completa o a pagar licencia comercial. La decisión es
   legal, no técnica, y está registrada como tal.
3. **El backend llega en la Fase 3.** Las fases 0 a 2 corren enteras en el
   navegador, porque un visor que exige servidor para abrir un archivo local
   contradice el local-first de la familia.
4. **Speckle queda como referencia, no como dependencia.** Adoptarlo condicionaría
   toda la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo.

## La zona gris ya repartida: nubes de puntos

Aparecen en los dos productos y se reparten **por propósito**, no por formato:

| La nube como…                                              | Vive en         |
| ---------------------------------------------------------- | --------------- |
| Producto del vuelo: verla, medirla, navegar la faena       | **AeroPlanner** |
| As-built contra modelo: verificar avance, coordinar        | **AeroBim**     |

La tecnología de visor puede terminar siendo la misma —ambos son Three.js— y eso es
una ventaja: lo que se aprenda de un lado sirve del otro.

## Decisiones pendientes que solo el usuario puede tomar

- **El IFC de prueba para `F0.4`.** Cuál modelo real se usa como referencia de
  rendimiento. Sin él, la fase no puede cerrarse.
- **Prioridad frente a los hermanos.** AeroPlanner tiene cuatro PRs apilados sin
  fusionar y su `F0.9` sin verificar; AeroControl está en pausa. Este es un tercer
  frente, y decidir cuánto avanza en paralelo no es una decisión técnica.
- **Nombre de despliegue y dominio** (`bim.<dominio>`), y si comparte VM con las
  otras aplicaciones.
