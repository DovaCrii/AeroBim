---
name: refactor-seguro
description: Refactor de AeroBim sin cambio de comportamiento - línea base, pruebas de caracterización, movimiento mecánico con re-exportación y comparación antes/después.
disable-model-invocation: true
argument-hint: "<archivo o módulo a dividir>"
---

# Refactor seguro: `$ARGUMENTS`

Este proyecto **funciona**. Un refactor aquí cambia estructura, nunca comportamiento. Si durante el
trabajo ves un defecto, **anótalo aparte** (no lo arregles en el mismo cambio).

1. **Alcance.** Di qué mueves y por qué, en tres líneas. Si toca el visor, WASM, WebGL, nubes de
   puntos o coordenadas, **detente y pregunta**: ahí las pruebas no bastan (ver paso 7).
2. **Línea base.** `/verificar todo` en verde antes de tocar nada. Anota: número de pruebas
   (pytest y vitest), líneas del archivo y, en Django, la lista de URL resueltas (un script con
   `get_resolver` basta; guárdala fuera del repo).
3. **Red de seguridad.** Si lo que vas a mover no tiene pruebas que lo cubran, escribe **primero**
   pruebas de caracterización (capturan lo que hace hoy, aunque no te guste) y confirma que pasan
   sobre el código sin tocar. Sin red, no se mueve.
4. **Movimiento mecánico.** Un movimiento por commit; sin renombrar, sin «mejorar», sin reordenar
   lógica. **Re-exporta** desde el lugar original (`__init__.py` en Python, `export … from` en
   TypeScript) para que ningún importador, URL ni ruta cambie.
5. **Después de cada movimiento:** `/verificar` del alcance. El número de pruebas **no baja** y la
   lista de URL es idéntica a la de la línea base.
6. **Reglas de AGENTS.md siguen vigentes:** un PR por entrega, rama `codex/…`, sin force-push,
   fusión solo con el CI verde (ver `/abrir-pr`). `bim-core` sigue sin importar interfaz.
7. **Visor y render.** Que pasen las pruebas no prueba que la escena se dibuje igual. Antes de
   cerrar, abre en el navegador el mismo IFC (y la misma nube, si aplica) con el código anterior y
   con el nuevo, y compara con el oráculo que corresponde en `AGENTS.md`.
8. **PR pequeño** con números antes/después (pruebas, líneas por archivo, URL idénticas) y la lista
   de defectos que viste y **no** tocaste.
