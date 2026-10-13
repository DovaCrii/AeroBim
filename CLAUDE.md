@AGENTS.md

## Claude Code en este repositorio

- **Retomar:** lee `HANDOFF.md` (corto, ≤120 líneas). La historia está en `docs/historial/` y en `git log`; no la cargues.
- **No cargues `MASTER_PLAN.md` (un tablero de ~500 líneas; las fases cerradas están en `docs/historial/plan/`) ni `CHANGELOG.md` enteros.** Para una fila: `node scripts/claude/plan-fila.mjs F2.4 [--seccion]`; para lo abierto: `--abiertas`.
- **Verificar:** `/verificar` o `node scripts/claude/verificar.mjs [todo|web|api]`. No pegues salidas largas de pytest, vitest o build en la conversación: el resumen y el log en `.claude/tmp/verificar/` bastan.
- **Skills del proyecto:** `/siguiente` (qué toca en el plan), `/verificar`, `/cerrar-tarea F2.4`, `/abrir-pr`, `/preparar-despliegue` (cierra la tanda: todos los bloques y PR fusionados antes de que el usuario despliegue), `/triar-hallazgo <uuid>`, `/refactor-seguro <archivo>`.
- **Coordinación y subagentes:** la sesión principal es el **coordinador** (Opus; `claude --agent coordinador`) y reparte con `/coordinar`: `explorador`, `verificador` y `redactor-de-cierre` (Haiku), `ejecutor-de-fila` y `revisor-visual` (Sonnet). Revisa siempre el diff de lo que vuelve.
- **Asistente de IA:** diseño en `docs/ASISTENTE_IA.md` (`F17.3`). **Nunca una clave en el repositorio ni en el chat.**
- **Privacidad:** el repositorio es público. Antes de cada PR corre `python tools/kit/privacy_scan.py` (o la skill `/revision-privacidad`). El método general de la suite está en `docs/ESTANDAR_TRABAJO.md`.
- Responde en español. Commits en español, imperativo y con ámbito (`feat(viewer): …`).
- Lo que choque con `AGENTS.md` se resuelve a favor de `AGENTS.md`.
