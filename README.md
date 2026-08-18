<div align="center">

<img src="assets/aerobim-mark.svg" width="140" height="105" alt="Logo de AeroBim" />

# AeroBim

**Visor y coordinador BIM en el navegador: modelos IFC, nubes de puntos y coordinación, sin licencias por puesto.**

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-9B5DE5.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-1B2A4A.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/three.js-r170+-1B2A4A.svg)](https://threejs.org/)
[![Estado](https://img.shields.io/badge/estado-fase%200%20·%20andamiaje-9B5DE5.svg)](#estado-actual)

Aplicaciones hermanas: **[AeroControl](https://github.com/DovaCrii/AeroControl)** (flota y cumplimiento) · **[AeroPlanner](https://github.com/DovaCrii/AeroPlanner)** (planificación de misiones) · **[AeroLink](https://github.com/DovaCrii/AeroLink)** (telemetría y evidencia) — funcionan por separado, se comunican cuando conviene

</div>

---

## Qué es

AeroBim abre un modelo IFC en el navegador, lo recorre, consulta sus propiedades
y lo coordina: temas de observación con BCF, detección de interferencias y la
nube de puntos del levantamiento en la misma escena que el modelo.

Es **local-first**, como el resto de la familia: corre en un equipo o servidor de
la organización y no depende de un proveedor externo ni de una licencia por
puesto para que alguien pueda mirar un modelo.

**Para quién.** Oficina técnica y coordinación de proyectos que hoy necesita una
licencia de escritorio para abrir un IFC, y equipos que levantan una obra con
dron y quieren contrastar lo construido contra lo modelado.

## Qué resuelve

| Capacidad | Qué hace |
| --- | --- |
| **Visor IFC** | Abre modelos IFC 2x3/4/4x3 en el navegador, con árbol espacial, propiedades y psets |
| **Nubes de puntos** | Carga el levantamiento (LAS/LAZ) en la misma escena que el modelo |
| **Coordinación** | Temas de observación con viewpoints, importables y exportables como BCF 2.1/3.0 |
| **Interferencias** | Detección de clashes entre grupos de elementos, con resultado navegable |
| **Geo + BIM** | El modelo georreferenciado sobre la ortofoto y el terreno del propio vuelo |

Ninguna de esas piezas se construye de cero: cada una tiene una base
open-source verificada en [docs/REFERENCES.md](docs/REFERENCES.md).

## Por qué existe como proyecto aparte

AeroBim nace de una separación deliberada, decidida el 2026-08-18. AeroPlanner
—el planificador de vuelo— iba acumulando dos dominios que no se parecen:

- **Lo geoespacial** (ortofoto, DEM, curvas de nivel, nube del vuelo) **se queda
  en AeroPlanner**, porque ahí cierra un ciclo: el modelo de elevación del vuelo
  anterior mejora el terrain following del siguiente.
- **Lo BIM** (IFC, psets, BCF, interferencias) **es otro dominio**: otro modelo de
  datos, otras librerías, otros usuarios y otro ciclo de vida. Metido en el
  planificador habría engordado un MVP que todavía no cierra sus fases.

La zona gris son las nubes de puntos, y se reparte por propósito: la nube como
**producto del vuelo** (verla, medirla, navegar la faena) vive en AeroPlanner; la
nube como **as-built contra modelo** (verificación de avance, coordinación) vive
aquí.

## Estado actual

**Fase 0 — andamiaje.** El repositorio trae el plan, la arquitectura, el estudio
de alternativas open-source con licencias verificadas y la marca. **Todavía no
hay código de aplicación**: la primera prueba de concepto del visor es la tarea
`F0.4` de [MASTER_PLAN.md](MASTER_PLAN.md), que es la fuente de verdad de qué
sigue.

Se parte con una decisión ya tomada y documentada: **That Open Company**
(MIT/MPL-2.0) para el visor, no xeokit — que es técnicamente superior pero AGPL, y
eso obligaría a liberar la aplicación completa o a pagar licencia comercial. El
razonamiento está en [docs/REFERENCES.md](docs/REFERENCES.md).

## Cómo se lee este repositorio

| Documento | Para qué |
| --- | --- |
| [MASTER_PLAN.md](MASTER_PLAN.md) | **Fuente de verdad del trabajo pendiente**, por fases y con estado |
| [HANDOFF.md](HANDOFF.md) | Punto exacto de retome |
| [AGENTS.md](AGENTS.md) | Convenciones obligatorias antes de tocar código |
| [docs/MVP.md](docs/MVP.md) | Qué entra en la primera versión y qué queda fuera, con el motivo |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Paquetes, límites entre capas y flujo de datos |
| [docs/REFERENCES.md](docs/REFERENCES.md) | Cada proyecto de referencia, su licencia y qué se toma de él |
| [docs/INTEGRATION_AEROPLANNER.md](docs/INTEGRATION_AEROPLANNER.md) | Contrato con AeroPlanner: qué cruza la frontera y qué no |

## Aplicaciones hermanas

Cuatro aplicaciones **independientes** — cada una con su base de datos y su
despliegue, ninguna escribe en el dominio de otra:

```
   AeroPlanner            AeroControl            AeroLink              AeroBim
 planifica el vuelo    flota · operadores   lo que pasó al volar   modelo · as-built
 geometría · terreno   permisos · docs      telemetría             IFC · nube · BCF
 simulación · KMZ      centros de costo     evidencia con hash     coordinación
```

Comparten la marca —el mismo dron, un motivo distinto por aplicación— y nada
más: **ninguna comparte base de datos con otra**.

## Licencia

MIT — ver [LICENSE](LICENSE).
