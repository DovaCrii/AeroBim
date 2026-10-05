@AGENTS.md

## Claude Code en este repositorio

- **Retomar:** lee `HANDOFF.md` (corto, ≤120 líneas). La historia está en `docs/historial/` y en `git log`; no la cargues.
- **No cargues `MASTER_PLAN.md` ni `CHANGELOG.md` enteros** (>100 mil y ~40 mil tokens). Para una fila: `node scripts/claude/plan-fila.mjs F2.4 [--seccion]`; para lo abierto: `--abiertas`.
- **Verificar:** `/verificar` o `node scripts/claude/verificar.mjs [todo|web|api]`. No pegues salidas largas de pytest, vitest o build en la conversación: el resumen y el log en `.claude/tmp/verificar/` bastan.
- **Skills del proyecto:** `/verificar`, `/cerrar-tarea F2.4`, `/abrir-pr`, `/triar-hallazgo <uuid>`, `/refactor-seguro <archivo>`.
- Responde en español. Commits en español, imperativo y con ámbito (`feat(viewer): …`).
- Lo que choque con `AGENTS.md` se resuelve a favor de `AGENTS.md`.
