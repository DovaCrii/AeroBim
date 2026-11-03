# Plantilla de encargo a un agente

Un encargo corto: lo repetido ya está en `implementador.md`, `disenador.md` y en las skills. Copia, rellena lo
que está entre `<>` y borra lo que no aplique.

```text
**Tu rol**: lee primero `.claude/agents/<implementador|disenador>.md` y síguelo.
Rama `codex/<tema>` desde `origin/main` (haz `git fetch`), commits pequeños, **sin push, sin PR**.

## Fila <F00.0>: <título>
<Qué se entrega, en uno o dos párrafos con el porqué (qué pidió la persona y qué decidió).>
<Hechos ya localizados (rutas:líneas) para que no repita la búsqueda.>
<Reglas de la fila: qué identidad usa (GUID), qué unidades, qué sistema de coordenadas, qué no sale de la máquina.>

## Oráculo
<Qué otro lector comprueba la salida (Bonsai, CloudCompare, QGIS, un CAD) y con qué datos de muestra.
Qué queda sin comprobar si no se puede correr aquí.>

## Archivos tuyos y archivos que NO tocas
<Los que puede editar. Los de otras ramas abiertas (codex/...: qué tocan), para no chocar.>

## Devuelve
Rama y commits, archivos, pruebas nuevas con su oráculo y cifras, resultado del gate, lo que quedó sin
comprobar y por qué.
```

Cada encargo, además:

- `model` explícito (`"sonnet"` para implementar y diseñar, `"haiku"` para buscar, verificar o redactar),
  `effort: "medium"`, e `isolation: "worktree"` y `run_in_background: true` si escribe código.
- Si algo necesita **descargar** (bibliotecas, fuentes, datos), dilo con el permiso de la persona; sin él, no descarga.
- Si se conoce un dato que el agente no debe copiar (una clave, una ruta de cliente, un IFC de obra), se dice que
  **no** lo copie.
- **Navegador:** como mucho un agente a la vez, con su pestaña (`tabs_create`) y `tabId` en cada llamada.
