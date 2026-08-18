# Integración con AeroPlanner (y el resto de la familia)

> Estado: **contrato de diseño**. Nada implementado; entra con la Fase 6.
> Última revisión: 2026-08-18.

## La regla que no se negocia

**Ninguna aplicación de la familia comparte base de datos con otra.** Cada una tiene
su esquema, su despliegue y su ciclo de vida. La integración es **por archivo
primero, por API después** — el mismo camino que AeroPlanner acordó con AeroControl.

El motivo es concreto: una base compartida convierte cuatro aplicaciones
independientes en una sola con cuatro frentes, donde una migración de esquema rompe
tres despliegues ajenos y nadie puede desplegar sin coordinar con los demás.

## Quién produce qué

```
   AeroPlanner                                    AeroBim
 planifica el vuelo                          revisa el modelo
        │                                            │
        │  ortofoto (COG)                            │  IFC del proyecto
        │  terreno (DEM/DSM)                         │  nube del levantamiento
        │  nube del vuelo                            │
        │                                            │
        └──────────────►  archivo  ─────────────────►┘
```

**AeroPlanner produce el contexto; AeroBim consume el contexto.** El flujo natural va
en una dirección: el vuelo genera ortofoto, modelo de elevación y nube de puntos, y
esos productos sirven para situar y verificar el modelo BIM.

## Qué cruza la frontera

Solo archivos, en formatos estándar y abiertos:

| Producto              | Formato          | Lo genera   | Lo consume | Para qué en AeroBim                      |
| --------------------- | ---------------- | ----------- | ---------- | ---------------------------------------- |
| Ortofoto              | **COG** (GeoTIFF) | AeroPlanner | AeroBim    | Base de la vista geoespacial (`F6.2`)     |
| Terreno               | **GeoTIFF** DEM/DSM | AeroPlanner | AeroBim  | Relieve bajo el modelo (`F6.2`)           |
| Nube del levantamiento | **LAZ / COPC**   | AeroPlanner | AeroBim    | As-built contra modelo (Fase 2, `F6.4`)   |

Ninguno es un formato propio de la familia: todos son estándares que cualquier
herramienta puede leer. Eso es deliberado — si mañana una de las dos aplicaciones
deja de existir, los archivos siguen sirviendo.

## Qué NO cruza la frontera

Vale escribirlo, porque son justo las cosas que parecen buena idea:

| Qué                                        | Por qué no                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **La base de datos**                       | Regla de la familia, sin excepciones                                                            |
| **Los modelos IFC hacia AeroPlanner**      | El planificador no tiene nada que hacer con un IFC. Planificar un vuelo no necesita el modelo    |
| **Los temas BCF hacia otra aplicación**    | La coordinación es dominio de AeroBim. AeroControl registra cumplimiento, no observaciones de obra |
| **Usuarios y sesiones**                    | Cada aplicación autentica por su cuenta. Un SSO común sería un proyecto aparte, y hoy no se pide |
| **Escrituras de AeroBim en las hermanas**  | AeroBim **nunca** escribe en AeroPlanner, AeroControl ni AeroLink                                |

## El problema técnico real: dos sistemas de coordenadas

Aquí está la dificultad de la integración, y no es el transporte de archivos.

- Los productos de AeroPlanner llegan **georreferenciados**: coordenadas geográficas o
  proyectadas, con su CRS declarado.
- Un IFC vive normalmente en **coordenadas locales de proyecto**, con el origen en
  algún punto que decidió el modelador y a veces con el norte rotado.

Situar el modelo sobre el terreno exige la conversión entre ambos, que en IFC viene —
cuando viene — en `IfcSite` y en el mapa de conversión del modelo (`IfcMapConversion`).
**Muchos modelos reales no la traen, o la traen mal.**

Consecuencias asumidas en el plan:

1. `F6.3` incluye **ajuste manual** cuando el modelo no declara su georreferenciación.
   Un modelo sin conversión no es un caso de error, es el caso común.
2. La conversión vive en `packages/bim-core`, con su CRS explícito en los tipos, y es
   la pieza que más pruebas necesita. Equivocarla no produce un error visible: produce
   un modelo colocado con confianza en el lugar equivocado.
3. El oráculo es un **punto de coordenada conocida comprobado en QGIS**, no la
   apariencia. Un modelo puede verse perfectamente encajado en la ortofoto y estar
   corrido treinta metros.

## Relación con AeroControl y AeroLink

Ninguna, por ahora, y eso está bien.

- **AeroControl** registra flota, operadores, permisos y cumplimiento. No tiene
  interés en un modelo BIM ni AeroBim en sus permisos de vuelo.
- **AeroLink** recoge telemetría y evidencia de vuelo. Tampoco se cruza con lo BIM.

Si algún día apareciera un caso —por ejemplo, colgar un modelo de un centro de costo
de AeroControl— entraría por el `MASTER_PLAN.md` **de ese repositorio**, con su propio
contrato HTTP versionado y de solo lectura, como el que AeroControl ya tiene con
AeroLink. **No se implementa desde aquí.**

## Cuándo esto se implementa

Con la **Fase 6**, no antes. Las fases 0 a 5 no necesitan nada de las aplicaciones
hermanas: un IFC llega de la oficina técnica y una nube llega convertida del
levantamiento, sin que importe quién voló.

Ese orden es deliberado. La integración es lo más fácil de sobrediseñar y lo más
difícil de acertar sin haber usado antes las dos puntas.
