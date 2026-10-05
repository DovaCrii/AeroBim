---
paths:
  - "MASTER_PLAN.md"
  - "HANDOFF.md"
  - "CHANGELOG.md"
  - "docs/**"
---

# Plan, retome y documentación

- **`MASTER_PLAN.md` no se lee entero.** `node scripts/claude/plan-fila.mjs <código> [--seccion]` y,
  con el número de línea que imprime, lee un rango y edita solo esa fila.
- **Al cerrar una fila, hay dos sitios:** su tabla de fase y la tabla «Lo que queda, por fase»;
  actualiza también el conteo. Ese tablero se desactualizó al menos dos veces.
- **Solo se marca ✅ con el oráculo cumplido** (tabla de `AGENTS.md`, «Verificación»). Cada número
  se mide, con fecha; no se estima.
- **`HANDOFF.md` es un resumen de estado, no una bitácora:** ≤120 líneas, se reescribe, no se
  apila. Lo que se retira va a `docs/historial/`.
- **`CHANGELOG.md`:** una entrada breve en «Sin publicar»; el detalle largo vive en el PR.
- **Una afirmación sobre el código se comprueba contra el código** antes de escribirla: el repo
  registró varias afirmaciones de documentación que eran falsas.
- Prettier corre sobre los `.md` (`npm run fmt:check`): formatea antes de confirmar.
