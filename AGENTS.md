# AeroBim — guía para agentes (Codex / Claude Code)

## Objetivo

Visor y coordinador BIM en el navegador: modelos IFC, nubes de puntos, temas de
coordinación en BCF y detección de interferencias. **Local-first**: corre en la
infraestructura de la organización, sin licencia por puesto ni dependencia de un
proveedor externo.

Es un producto **independiente** de [AeroControl](https://github.com/DovaCrii/AeroControl),
[AeroPlanner](https://github.com/DovaCrii/AeroPlanner) y
[AeroLink](https://github.com/DovaCrii/AeroLink). Se comunica con ellos por
archivo o API, **nunca por base de datos compartida**.

La fidelidad al modelo prevalece sobre todo lo demás: un visor que muestra una
propiedad distinta a la que trae el IFC, o que sitúa un elemento donde no está, es
peor que no tener visor — alguien tomará una decisión de obra con ese dato.

> **Si existe `HANDOFF.md` en la raíz, léelo antes que nada.** Dice el punto exacto
> de retome. `MASTER_PLAN.md` es la fuente de verdad de qué sigue.

## Decisiones ya tomadas (no reabrir sin que el usuario lo pida)

1. **El visor es That Open Company** (`@thatopen/components`, `web-ifc`,
   `@thatopen/fragments`), sobre Three.js. MIT y MPL-2.0.
2. **xeokit queda fuera por licencia, no por calidad.** Es AGPL-3.0: servir la
   aplicación por red obligaría a liberarla completa, o a pagar su licencia
   comercial. Técnicamente es superior en varios puntos y eso está reconocido en
   `docs/REFERENCES.md`; la decisión es legal.
3. **Speckle no se adopta como plataforma.** Condicionaría toda la arquitectura a
   su modelo de datos, y sus comentarios no son BCF nativo. Queda como referencia.
4. **El backend es Python**, con `ifcopenshell`, `ifctester`, `ifcclash` y
   `bcf-client`. Django + DRF por coherencia con AeroControl.
5. **El backend llega en la Fase 3, no antes.** Las fases 0 a 2 corren enteras en
   el navegador. Un visor que exige servidor para abrir un archivo local contradice
   el local-first.
6. **La aplicación no procesa ni modela.** No genera nubes ni ortofotos, no edita
   geometría IFC, no clasifica nubes. Abre lo que otro produjo. **No agregar
   pipelines de procesamiento.**
7. **Cesium ion queda fuera.** El runtime CesiumJS (Apache-2.0) se usa en la Fase
   6; el servicio ion es comercial. El terreno y las ortofotos son propios.
8. **Los repositorios hermanos son de solo lectura desde aquí.** AeroPlanner está
   en su MVP y AeroControl en pausa de estabilización. Cualquier cambio allá entra
   por el `MASTER_PLAN.md` de ese repositorio.

## Precedencia documental

Cuando dos documentos parezcan contradecirse, este es el orden de autoridad:

`AGENTS.md` (este archivo) > `MASTER_PLAN.md` (qué hacer y en qué orden) >
`docs/ARCHITECTURE.md` > `docs/MVP.md` > `docs/INTEGRATION_AEROPLANNER.md` >
`docs/REFERENCES.md` > `README.md`.

Si un plan externo propone una convención que choca con lo ya establecido aquí, se
reconcilia a favor de lo vigente en el repo y se deja constancia en el PR o en
`MASTER_PLAN.md`. No se cambia esta guía en silencio.

## Flujo de trabajo Git

- `main` siempre desplegable. **Nunca se commitea ni se empuja directamente a
  `main`** una vez pasado el arranque documental.
- Una rama por bloque de trabajo: `codex/<area-o-fase>` (p. ej.
  `codex/fase-0-andamiaje`). Misma convención que AeroControl y AeroPlanner.
- Un PR por fase o entrega vertical. No mezclar fases distintas en un commit.
- `git fetch` **antes** de cualquier push. Puede haber otra sesión de agente
  empujando a la misma rama; si divergió, **nunca** `push --force`.
- **Nunca fusionar un PR sin permiso explícito del usuario.** Que diga "dale" o
  "hazlo" significa implementar y empujar, no fusionar.
- Cada fase cerrada marca su fila ✅ en `MASTER_PLAN.md` y actualiza `HANDOFF.md`.
- Mensajes de commit en español, en imperativo y con ámbito:
  `feat(viewer): ...`, `fix(ifc): ...`, `docs: ...`.

## Convenciones de dominio (no negociables)

- **`packages/bim-core` no depende de la interfaz.** Nada de imports de React, de
  Three.js ni del DOM. Si un cálculo necesita el navegador para probarse, está en
  el lugar equivocado. Lo que entra ahí: identidad de elementos, filtros, reglas de
  agrupación, tolerancias, modelo de temas de coordinación.
- **El GUID de IFC es la identidad, siempre.** Nunca un índice de array, un
  `expressID` ni una posición en el árbol: cambian entre versiones del modelo y
  entre motores. Un tema BCF que apunte a un `expressID` queda huérfano en la
  siguiente exportación del modelo.
- **Unidades explícitas en el nombre.** `lengthM`, `toleranceMm`, `areaM2`. Un
  número sin unidad en la firma es un bug esperando su turno. Internamente todo va
  en SI; los IFC declaran sus propias unidades y **se convierten al entrar**, nunca
  se asume metros.
- **Toda coordenada declara su sistema.** Un IFC vive en coordenadas locales de
  proyecto; una nube de puntos llega georreferenciada. Mezclarlas sin conversión
  explícita es el error que hace que un modelo aparezca en otro continente. El tipo
  debe hacerlo imposible.
- **TypeScript estricto.** Sin `any` en el dominio.
- **Texto de interfaz en _sentence case_.** Solo la primera palabra y los nombres
  propios en mayúscula; las siglas se mantienen (IFC, BCF, IDS, LAS, COG, GUID).
  Correcto: `"Model tree"`, `"Clash groups"`. Incorrecto: `"Model Tree"`.
- Modelos IFC, nubes de puntos, ortofotos y datos de proyectos reales viven **fuera
  del repositorio**. Nunca confirmar un IFC de cliente ni un dato de obra.

## Licencias: verificar antes de portar

Este proyecto es MIT y debe seguir siéndolo. Antes de copiar o adaptar código de un
proyecto de referencia, confirmar su licencia en `docs/REFERENCES.md` y registrar el
origen en el archivo destino.

| Origen                                          | Licencia   | Se puede                                                                                       |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| That Open (`components`, `fragments`), Three.js | MIT        | Portar e integrar, manteniendo el aviso de copyright                                           |
| `web-ifc`                                       | MPL-2.0    | Usar como dependencia. Si se **modifica** un archivo suyo, ese archivo queda bajo MPL           |
| Potree, PDAL                                    | BSD        | Portar e integrar, manteniendo el aviso                                                         |
| CesiumJS, `3d-tiles-tools`, TerriaJS            | Apache-2.0 | Portar e integrar, conservando avisos y el archivo `NOTICE` si existe                           |
| IfcOpenShell, `ifcclash`, `bcf-client`          | LGPL-3.0   | **Usar como librería o proceso aparte, sin copiar su código.** Enlazar sí; portar líneas no      |
| xeokit-sdk, BIMserver                           | AGPL-3.0   | **Solo leer como referencia conceptual.** No copiar código ni enlazarlo                        |
| xbim                                            | CDDL       | Referencia conceptual. Stack .NET, fuera de nuestra arquitectura                               |

Una línea copiada de un proyecto AGPL contamina todo el repositorio. Ante la duda,
se reimplementa desde la documentación, no desde el código.

**Sobre LGPL en Python:** invocar `ifcopenshell` como librería o `ifcclash` como
proceso está permitido y no obliga a liberar nuestro código. Copiar fragmentos de su
código fuente al nuestro, sí. La distinción importa.

## Verificación: cada capacidad necesita un oráculo externo

Los tests que solo comparan el código consigo mismo no prueban que el modelo se
esté leyendo bien. Antes de marcar ✅:

| Qué se construye                | Contra qué se verifica                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Árbol espacial, propiedades, psets | El mismo IFC abierto en **Bonsai/BlenderBIM** o cualquier visor de escritorio      |
| Mediciones                      | Cotas conocidas del modelo, y el mismo par de puntos en un visor de escritorio       |
| Alineación nube ↔ modelo        | **CloudCompare** con el mismo par de archivos                                        |
| Export BCF                      | El archivo **abre en Navisworks o Solibri** con el viewpoint intacto, y a la inversa |
| Interferencias                  | Conjunto de prueba con conflictos colocados a propósito: cuántos encuentra y cuántos pierde |
| Georreferenciación (Fase 6)     | Un punto de coordenada conocida, comprobado en **QGIS**                              |
| Rendimiento                     | Un IFC de obra **real**, no el modelo de demostración de la documentación            |

Antes de entregar: build, lint y formato en verde, y **verificación en el navegador**
de lo que se ve. Un lector de IFC correcto con la escena mal dibujada sigue siendo un
entregable roto.

## Referencias

- Plan de trabajo por fases: `MASTER_PLAN.md` (fuente de verdad de qué sigue).
- Punto de retome: `HANDOFF.md`.
- Arquitectura y límites entre paquetes: `docs/ARCHITECTURE.md`.
- Alcance del MVP y lo explícitamente excluido: `docs/MVP.md`.
- Proyectos de referencia, licencias y qué se toma de cada uno: `docs/REFERENCES.md`.
- Contrato con AeroPlanner: `docs/INTEGRATION_AEROPLANNER.md`.
