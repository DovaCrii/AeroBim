<div align="center">

<img src="assets/aerobim-mark.svg" width="140" height="105" alt="Logo de AeroBim" />

# AeroBim

**Visor y coordinador BIM en el navegador: modelos IFC, nubes de puntos y coordinación, sin licencias por puesto.**

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-9B5DE5.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-1B2A4A.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/three.js-r170+-1B2A4A.svg)](https://threejs.org/)
[![Versión](https://img.shields.io/badge/versión-0.1.0%20sin%20publicar-1B2A4A.svg)](#dónde-vamos-la-meta-y-la-versión)
[![Estado](https://img.shields.io/badge/estado-fase%2012%20·%20la%20interfaz-9B5DE5.svg)](#en-qué-punto-estamos-hoy)

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

| Capacidad              | Qué hace                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Visor IFC**          | Abre modelos IFC 2x3/4/4x3 en el navegador, con árbol espacial, propiedades y psets   |
| **Planos 2D**          | Carga el DXF del proyecto bajo el modelo, con sus capas y colores, y deja compararlos |
| **Portal**             | Credenciales, roles y módulos por etapa de trabajo: cada uno abre lo que le toca      |
| **Control documental** | Entregables, revisiones con código ISO 19650, transmittals y avance físico            |
| **Seguimiento**        | Observaciones y actividades con responsable y vencimiento, y aviso por correo         |
| **Nubes de puntos**    | Carga el levantamiento (LAS/LAZ) en la misma escena que el modelo                     |
| **Coordinación**       | Temas de observación con viewpoints, importables y exportables como BCF 2.1/3.0       |
| **Interferencias**     | Detección de clashes entre grupos de elementos, con resultado navegable               |
| **Geo + BIM**          | El modelo georreferenciado sobre la ortofoto y el terreno del propio vuelo            |

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

## Dónde vamos: la meta y la versión

**Versión `0.1.0`, sin publicar.** Es el número que llevan los cuatro paquetes
(`package.json`, `services/api/pyproject.toml`) y **no hay ninguna etiqueta de git**: no se ha
liberado nada todavía, y decir otra cosa sería inventarlo. La primera versión con número propio
sale cuando el piloto del CC 741 cierre su Etapa 1.

**La meta de la `0.1.0`** es la frase de alcance de [`docs/MVP.md`](docs/MVP.md): abrir un IFC en el
navegador, recorrerlo, consultar sus propiedades, compararlo con el levantamiento, y dejar la
observación de coordinación en un formato que el resto de la industria entienda. Todo lo que no
sirve a esa frase queda fuera — en particular **no** se está construyendo un modelador.

| Hito                      | Qué significa que esté hecho                                               | Estado |
| ------------------------- | -------------------------------------------------------------------------- | ------ |
| **El motor**              | Visor, registro ISO 19650, coordinación, BCF, interferencias, planos, nube | ✅     |
| **La interfaz** (Fase 12) | Que las capacidades tengan puerta y el producto no se lea como dos mitades | 🔶     |
| **El piloto** (CC 741)    | Un ciclo de trabajo real hecho por personas de la obra                     | ⬜     |
| **`0.1.0` publicada**     | Etapa 1 del piloto cerrada, con su etiqueta de git                         | ⬜     |

### En qué punto estamos hoy

Actualizado el **2026-09-08**. La fuente de verdad de lo pendiente sigue siendo
[MASTER_PLAN.md](MASTER_PLAN.md); esto es el resumen de una línea.

**Diez de las doce fases con trabajo están cerradas, y la Fase 12 acaba de cerrar sus tres
bloques.** Queda la Fase 2 a falta de un modelo que el usuario todavía no tiene, dos tareas de la
Fase 12 que no son de estilo, y la Fase 6 pospuesta a propósito.

| Fase                       | Estado                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| 0 · Cimientos              | ✅                                                                        |
| 1 · Visor                  | ✅ salvo `F1.13`, tres nombres que decide el usuario                      |
| 3 · Backend                | ✅                                                                        |
| 4 · Coordinación           | ✅ salvo `F4.5`, condicionado a que el usuario mire un BCF exportado      |
| 5 · Interferencias         | ✅                                                                        |
| 7 · Planos y salida        | ✅                                                                        |
| 8 · Registro documental    | ✅                                                                        |
| 9 · Diseño                 | ✅ entera — `F9.6` cerró el 2026-09-07                                    |
| 10 · Etiquetas y tablas    | ✅                                                                        |
| 11 · El portal se ve plano | ✅                                                                        |
| **2 · Nubes de puntos**    | 🔶 abre, se maneja, calza y entra al expediente. `F2.4` espera **el IFC** |
| **12 · La interfaz**       | 🔶 **los tres bloques cerrados.** Quedan `F12.2` y `F12.11`, no de estilo |
| 6 · Geo + BIM              | ⬜ pospuesta el 2026-09-02, para poner la coordinación delante            |

**La Fase 12, en detalle**, porque es donde está el trabajo:

| Bloque                    | Qué es                                                                                                                                        | Estado      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1 · Desbloquear el piloto | Repartir hallazgos, `preparar_piloto`, timer del resumen, respaldo, COPC en el expediente, `docs/PILOTO.md`, métricas                         | ✅          |
| 2 · El portal             | Gate de `app.css`, catálogo, barra lateral, cabecera, «Mi trabajo», bandeja, observaciones, la puerta, docs                                   | ✅          |
| 3 · El visor              | `UX.md` ✅, tokens ✅, movimiento ✅, cota con su número ✅, puerta de entrada ✅, cinta ✅, navegador ✅, rail ✅, tema claro ✅, costura ✅ | ✅ los diez |

**El levantamiento del CC 741 se abre desde el expediente**, medido: 130.795.022 bytes de COPC
servidos por tramos, 62 peticiones y **26,9 %** del archivo para el primer encuadre, con la ficha
diciendo 97,4 × 143,5 × 17,0 m y UTM 19S declarado dentro.

**Y lo que dejó el bloque del visor**, también medido y no estimado:

| Lo que cambió                                                       | Medido                                        |
| ------------------------------------------------------------------- | --------------------------------------------- |
| La cota lleva su número y sus tres magnitudes encima del modelo     | **14,22:1** a 11 px, desde 4,13 que no pasaba |
| La cinta reparte grande y pequeño, y **no crece**                   | 137,1 → 136,8 px; pequeño 88 × 26,4           |
| El navegador se pliega a rail y le devuelve el sitio al modelo      | 346 → 49,4 px de panel, **+301 px** de lienzo |
| El tema claro, barrido pantalla por pantalla en los dos temas       | 16 pasadas, **cero** textos bajo el suelo     |
| El botón primario dejó de ser negro sobre violeta con el tema claro | 1,92:1 → **8,26:1**, y eran doce botones      |

**Lo que falta para la `0.1.0`** son tres cosas y ninguna es de código:

1. **El IFC de la pasarela**, que está en construcción — sin él, `F2.4` no se puede cerrar.
2. **Que el usuario mire un BCF exportado** en Solibri o Navisworks (`F4.5`).
3. **Correr el piloto** con las personas de la obra ([`docs/PILOTO.md`](docs/PILOTO.md)).

### Cómo se comprueba que esto funciona

```powershell
pwsh services/api/scripts/setup.ps1   # dependencias, migraciones y roles
pwsh services/api/scripts/verify.ps1  # el gate: check, pytest, ruff, bandit, pip-audit
npm test                              # el visor y el dominio
```

**978 pruebas** en `services/api` y **516** en `packages/*` y `apps/web`. La regla que las ordena
está en [AGENTS.md](AGENTS.md): cada capacidad se comprueba contra **un oráculo independiente** —
Bonsai para el IFC, Solibri o BIMcollab para el BCF, CloudCompare y `pdal` para la nube, el CAD de
la oficina para el DXF — y **cada número se mide, no se estima**.

---

## Lo que ya hace, medido

**Sobre los archivos de la organización, no sobre ejemplos.** Fase 1, comprobada el 2026-08-19:

| Lo que hace                                                                          | Comprobado con                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Abre varios IFC, con la conversión en un worker                                      | 23,6 MB de OpenBuildings en **2,2 s**, 1.316 elementos        |
| Árbol espacial, propiedades y psets **con su unidad**                                | `Qto_BeamBaseQuantities` con m², m³ y mm                      |
| Apagar, aislar y **salir del aislamiento** volviendo a lo de antes                   | Sobre modelo cargado, en el navegador                         |
| Mide distancia, ángulo, área y perpendicular; corta por tres ejes                    | Fase 1                                                        |
| Vistas guardadas: cámara, visibilidad y cortes                                       | Sobreviven a recargar                                         |
| **Carga un DXF** con sus capas, colores y rótulos, y lo ajusta sobre el modelo       | `ACAD-Piso 5_Base.dxf`: 5.711 trazos en **137 ms**            |
| **Dibuja el plano como el CAD**: grosores, rayados, cotas, llamadas y capas apagadas | 242 trazos a 0,30 mm contra 5.469 a 0,25; 23 rayados `ANSI31` |
| **Clic en un trazo del plano** → capa, plano de origen y largo del tramo             | `0-MUROS`, 0,71 m — el largo exacto del segmento              |
| Avisa cuando el archivo trae elementos que no se cargaron                            | Delató 433 `IfcProxy` en un modelo real                       |

**La puerta y el registro** (`services/api`, Django 6), desde el 2026-08-26: portal de ingreso con
roles, control documental con el vocabulario de ISO 19650, y aviso por correo a quien le toca.
Comprobado con el servidor corriendo: un `Mandante` ve el registro y **no** la administración
—pedir esa URL a mano devuelve 403—, un ejecutable renombrado a `.pdf` se rechaza, y el nombre del
archivo del cliente nunca llega al disco.

**La coordinación y la nube**, después: interferencias contra los dos modelos reales de la
organización (20 s, sin duplicar al repetir), BCF 2.1 que va y vuelve, DWG y DGN convertidos al
entrar, y el levantamiento del CC 741 abierto por tramos desde su expediente.

La fidelidad del plano se comprueba sin necesitar un archivo de cliente:
`/diag.html?modo=plano&dxf=/samples/fidelidad-2d.dxf`. Y [docs/UX.md](docs/UX.md) explica cómo está
repartida la pantalla y con qué regla crece.

Se parte con una decisión ya tomada y documentada: **That Open Company**
(MIT/MPL-2.0) para el visor, no xeokit — que es técnicamente superior pero AGPL, y
eso obligaría a liberar la aplicación completa o a pagar licencia comercial. El
razonamiento está en [docs/REFERENCES.md](docs/REFERENCES.md).

## Cómo se lee este repositorio

| Documento                                                          | Para qué                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [MASTER_PLAN.md](MASTER_PLAN.md)                                   | **Fuente de verdad del trabajo pendiente**, por fases y con estado    |
| [HANDOFF.md](HANDOFF.md)                                           | Punto exacto de retome                                                |
| [AGENTS.md](AGENTS.md)                                             | Convenciones obligatorias antes de tocar código                       |
| [docs/MVP.md](docs/MVP.md)                                         | Qué entra en la primera versión y qué queda fuera, con el motivo      |
| [docs/UX.md](docs/UX.md)                                           | Cómo se reparte la pantalla, por qué, y con qué regla crece           |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                       | Paquetes, límites entre capas y flujo de datos                        |
| [docs/REFERENCES.md](docs/REFERENCES.md)                           | Cada proyecto de referencia, su licencia y qué se toma de él          |
| [docs/INTEGRATION_AEROPLANNER.md](docs/INTEGRATION_AEROPLANNER.md) | Contrato con AeroPlanner: qué cruza la frontera y qué no              |
| [docs/PILOTO.md](docs/PILOTO.md)                                   | El guion del piloto en el CC 741: etapas, roles, y qué no se prueba   |
| [docs/DEPLOY.md](docs/DEPLOY.md)                                   | Poner esto en una VM, y las dos cosas que rompen el visor en silencio |
| [docs/FORMATOS.md](docs/FORMATOS.md)                               | Qué formatos entran, qué se convierte y qué hay que pedir             |
| [docs/NUBES_DE_PUNTOS.md](docs/NUBES_DE_PUNTOS.md)                 | Por qué COPC y no Potree ni 3D Tiles, medido                          |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                     | Los tokens, y qué prohíbe el sistema                                  |

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
