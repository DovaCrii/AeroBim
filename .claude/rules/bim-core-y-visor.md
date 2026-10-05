---
paths:
  - "packages/**"
  - "apps/web/**"
---

# packages/bim-core, packages/viewer y apps/web

- **`bim-core` no depende de la interfaz:** sin React, Three.js ni DOM. Si un cálculo necesita el
  navegador para probarse, está en el lugar equivocado.
- **El GUID de IFC es la identidad**, nunca un `expressID`, un índice ni una posición en el árbol.
- **Unidades en el nombre** (`lengthM`, `toleranceMm`, `areaM2`). Todo en SI por dentro; el IFC se
  convierte al entrar.
- **Toda coordenada declara su sistema** (local de proyecto vs. georreferenciada). El tipo debe hacer
  imposible mezclarlas sin conversión. En nubes, restar el desplazamiento antes de nada.
- **TypeScript estricto**, sin `any` en el dominio.
- **Texto de interfaz en _sentence case_** (`"Model tree"`, no `"Model Tree"`); siglas intactas.
- **Ningún WASM desde un CDN:** busca el valor por defecto de la librería (`web-ifc` y PDFium traen
  una URL de `cdn.jsdelivr.net`) y empaquétalo con `?url`.
- **Lo que va a `apps/web/public/` se publica.** Lo decide la lista blanca de
  `apps/web/scripts/limpiar-dist.mjs`. Nunca un IFC ni datos de obra.
- **Estilos:** usa los tokens de `docs/DESIGN_SYSTEM.md`, no valores sueltos. Contraste AA, foco
  visible y sin recortar, objetivos táctiles según `docs/UX.md`.
- **Antes de dar algo por hecho:** build, lint y formato en verde (`/verificar web`) y mirar lo que
  se ve en el navegador. Un lector correcto con la escena mal dibujada es un entregable roto.
