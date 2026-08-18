# Changelog — AeroBim

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **Arranque del repositorio** (2026-08-18). AeroBim se separa de AeroPlanner como
  producto propio: visor y coordinador BIM en el navegador — modelos IFC, nubes de
  puntos, temas de coordinación en BCF y detección de interferencias.
- `MASTER_PLAN.md` con siete fases, cada una con criterio de salida y oráculo de
  verificación, más los riesgos abiertos. `F0.4` (abrir un IFC real y medir el
  rendimiento) queda marcada como la tarea que puede invalidar el stack elegido.
- `AGENTS.md` con las convenciones obligatorias: el GUID de IFC como única identidad,
  unidades explícitas en los nombres, CRS declarado en toda coordenada, y
  `packages/bim-core` sin dependencias de interfaz.
- `docs/REFERENCES.md` con el estudio de alternativas open-source y **las licencias
  verificadas** contra la API de GitHub, npm y PyPI.
- `docs/ARCHITECTURE.md`, `docs/MVP.md` y `docs/INTEGRATION_AEROPLANNER.md`.
- Marca `assets/aerobim-mark.svg`: el dron común de la familia —mismos brazos, mismos
  cuatro rotores, mismo fuselaje— con un cubo isométrico como motivo propio, en
  violeta `#9B5DE5`. Es el cuarto color de la familia, junto al turquesa de
  AeroControl, el ámbar de AeroPlanner y el amarillo de AeroLink.

### Decisiones registradas

- **That Open Company para el visor** (MIT / MPL-2.0), no xeokit. xeokit es superior en
  varios puntos —doble precisión para coordenadas globales, IFC y nube de puntos en una
  misma escena listos para usar— pero es AGPL-3.0: servir la aplicación obligaría a
  liberarla completa o a pagar licencia comercial. La decisión es legal, no técnica, y
  queda registrada como tal para no reabrirla con información incompleta.
- **El backend llega en la Fase 3**, no antes. Las fases 0 a 2 corren enteras en el
  navegador: un visor que exige servidor para abrir un archivo local contradice el
  local-first de la familia.
- **Speckle queda como referencia**, no como dependencia: adoptarlo condicionaría toda
  la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo.
- **Lo geoespacial se queda en AeroPlanner.** Ortofoto, DEM, curvas de nivel y la nube
  del vuelo cierran allá el ciclo de planificación. Las nubes de puntos se reparten por
  propósito: producto del vuelo en AeroPlanner, as-built contra modelo en AeroBim.
