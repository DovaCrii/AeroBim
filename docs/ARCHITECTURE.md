# Arquitectura — AeroBim

> Estado: **construido de la Fase 0 a la Fase 1, y la mitad de entrada de la Fase 7**. Los
> paquetes `bim-core`, `viewer` y `apps/web` existen y `F0.6` está cerrada: la conversión corre en
> un worker. **`services/` todavía no existe** — es la Fase 3, y lo que se describe abajo de ella
> sigue siendo diseño. Última revisión: 2026-08-26.

## El principio que ordena todo

**El dominio no sabe de Three.js, y la escena no sabe de reglas de negocio.**

Es la misma separación que hace útil a `mission-core` en AeroPlanner: lo que se
puede probar en Node sin navegador vive aparte de lo que necesita una GPU. En un
visor la tentación de mezclar es fuerte —"esto es solo geometría"— y hay que
resistirla, porque el día que la coordinación necesite correr en un servidor, o que
haya que exportar un BCF sin abrir la pantalla, el código tiene que dejarse.

## Paquetes

```
aerobim/
├── apps/
│   └── web/              React 19 + TypeScript + Vite. La aplicación.
├── packages/
│   ├── bim-core/         Dominio puro. Sin React, sin Three.js, sin DOM.
│   └── viewer/           Envoltura del visor: escena, cámara, selección, cortes.
└── services/             (Fase 3 en adelante)
    ├── api/              Django + DRF: proyectos, modelos, versiones, temas.
    └── worker/           Celery: ifcopenshell, ifctester, ifcclash.
```

### `packages/bim-core` — el dominio

Lo que entra aquí:

- **Identidad de elementos**: el GUID de IFC como clave, y las conversiones desde
  los identificadores efímeros de cada motor.
- **Modelo de temas de coordinación**: tema, viewpoint, comentario, estado, ciclo de
  vida. Independiente de BCF como formato — BCF es un _adapter_, igual que WPML lo
  es en AeroPlanner.
- **Filtros y agrupación**: "todos los muros de la planta 3", "estructura vs
  instalaciones". Reglas, no consultas a una escena.
- **Tolerancias y unidades**: conversión desde las unidades declaradas por el IFC,
  y las tolerancias de interferencia y de desviación nube ↔ modelo.

Lo que **no** entra: nada que necesite un `canvas` para probarse. Se testea en Node.

### `packages/viewer` — la escena

Envuelve `@thatopen/components` y Three.js. Existe como paquete aparte por una razón
concreta: **aísla el punto de ruptura**. That Open rompió su API entre 2.x y 3.x, y
volverá a hacerlo; si la aplicación entera importa sus componentes directamente, una
migración toca cientos de archivos. Con la envoltura, toca uno.

### `apps/web` — la aplicación

React 19, igual que AeroPlanner, para que la experiencia de mantener ambos sea la
misma. Aquí viven los paneles, el árbol, las tablas de propiedades y el estado de
interfaz.

### `services/` — desde la Fase 3

Django + DRF por coherencia con AeroControl: el mismo lenguaje, el mismo estilo de
despliegue, un equipo que ya sabe mantenerlo. `ifcopenshell` es Python, así que la
extracción de metadatos, la validación IDS y las interferencias caen naturalmente
del mismo lado.

**No existe hasta la Fase 3, y eso es deliberado.** Las fases 0 a 2 abren un archivo
local en el navegador y no necesitan servidor.

## El flujo de un modelo

```
   IFC en disco
        │
        ├─► web-ifc (WASM, en el navegador)  ──┐
        │                                      ├─► Fragments ──► escena Three.js
        └─► worker Node (@thatopen/fragments) ─┘                      │
                    (Fase 3, si F0.6 lo decide)                       │
                                                                      ▼
                                             árbol espacial · propiedades · psets
```

**Las dos rutas producen lo mismo.** La diferencia es dónde se paga el costo, y
`F0.6` la decide con los números medidos en `F0.5`, no por preferencia
arquitectónica. Por eso `packages/viewer` recibe **Fragments**, no un IFC: de dónde
vinieron es problema de la capa de arriba.

### Por qué Fragments y no IFC directo en la escena

Un IFC es texto con referencias cruzadas: para dibujar un muro hay que resolver su
representación, su perfil, su material y su ubicación relativa, y eso se paga cada
vez que se abre el archivo. Fragments es el resultado ya teselado en binario
(FlatBuffers): se convierte una vez y las siguientes aperturas cargan sin volver a
interpretar nada.

La contrapartida honesta: es un formato de un proyecto, no un estándar. Si That Open
lo abandona, los `.frag` guardados dejan de tener quién los lea — pero el IFC
original sigue ahí, y volver a convertir es un job. **Nunca se guarda solo el
Fragments; el IFC de origen es la fuente de verdad.**

## Las dos vistas, y por qué son dos

| Vista                    | Motor                | Para qué                                       |
| ------------------------ | -------------------- | ---------------------------------------------- |
| **Modelo** (Fases 1–5)   | Three.js + That Open | Coordinar: árbol, psets, cortes, BCF, clashes  |
| **Geoespacial** (Fase 6) | CesiumJS             | Situar: ortofoto, terreno, contexto de la obra |

Podrían haber sido una sola, y sería peor. La vista de modelo trabaja en
coordenadas locales de proyecto con precisión de milímetros; la geoespacial trabaja
sobre un elipsoide con coordenadas de siete cifras. Forzar ambas al mismo motor
significa o perder precisión en el modelo, o arrastrar doble precisión en toda la
escena. Son dos problemas distintos y cada uno tiene su herramienta.

**El puente entre ambas** es `IfcSite` y el mapa de conversión del modelo — la única
pieza que traduce coordenadas locales a globales. Vive en `bim-core`, con su CRS
declarado, y es la parte que más test necesita.

## Las nubes de puntos, y su límite

La nube entra en la escena de la vista de modelo (Fase 2) para poder compararla con
el modelo. Se carga por niveles desde un formato con octree, así que el navegador
descarga lo que cabe en pantalla, no el archivo completo.

**La conversión ocurre fuera de la aplicación**, con `PotreeConverter` o `pdal`, y eso
está documentado en `F2.5` en vez de implementado. La razón es la misma que en
AeroPlanner: convertir es un pipeline de procesamiento, y esta familia de
aplicaciones no procesa.

## Seguridad, desde la Fase 3

Reglas heredadas de AeroControl y AeroPlanner, que aplican en cuanto exista API:

- Toda ruta que maneje datos de usuario valida el token como primera operación, y
  toda consulta se acota con el ID del usuario autenticado tomado del token —
  **nunca con un identificador enviado por el cliente**.
- Las cargas de archivo se validan por extensión, tipo MIME y tamaño máximo, y
  **nunca se usa el nombre de archivo del usuario en el filesystem**. Un IFC es un
  archivo de texto que llega de fuera: se trata como entrada hostil.
- Los `.env` no se confirman, y el secreto de firma debe ser aleatorio de verdad en
  producción. AeroPlanner arrastró exactamente este problema —un secreto por defecto
  publicado en el código con registro abierto— y aquí no se repite.
- Nunca se exponen errores crudos ni trazas al cliente.

## Lo que esta arquitectura deja fuera a propósito

- **Un servidor de teselas propio.** Ni para ortofotos ni para modelos. COG por
  rangos HTTP y Fragments servidos como archivos estáticos alcanzan.
- **Una base de datos compartida con las aplicaciones hermanas.** Regla de la
  familia. La integración es por archivo y por API.
- **Estado de sesión en el servidor para el visor.** Lo que el usuario ve —cámara,
  visibilidad, cortes— es estado de cliente. Solo se persiste cuando alguien lo
  guarda como vista o como viewpoint de un tema.
