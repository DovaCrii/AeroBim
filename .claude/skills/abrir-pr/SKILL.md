---
name: abrir-pr
description: Prepara, abre y fusiona un PR de AeroBim siguiendo AGENTS.md - rama codex/..., git fetch antes de empujar, sin force-push, fusión solo con el CI verde.
disable-model-invocation: true
argument-hint: "[área o fase, p. ej. fase-12-interfaz]"
---

# Abrir y fusionar un PR

Reglas de `AGENTS.md` (no se negocian): nunca se empuja a `main`; una rama por bloque
(`codex/<área-o-fase>`); un PR por fase o entrega vertical; **el agente fusiona sus PR con el CI
verde y sin conflictos, y el usuario solo despliega** (decisión del 2026-10-05, en `AGENTS.md`);
nunca `push --force`.

1. `git status` y `git fetch`. Si la rama divergió, **detente y pregunta**; no fuerces.
2. Si estás en `main`, crea `codex/$ARGUMENTS` (o `codex/<área>` si no hay argumento) antes de
   confirmar nada.
3. `/verificar todo` en verde. Si no se puede correr el gate `api`, dilo en el PR.
4. Commits en español, imperativo y con ámbito. No mezcles fases en un commit.
5. `git push -u origin <rama>`.
6. PR con `gh pr create` si `gh` está disponible; si no, entrega el texto. Cuerpo en español:
   - **Qué cambia** (una frase por cambio).
   - **Cómo se midió:** oráculo usado y cifras, con fecha.
   - **Filas del plan** tocadas y su nuevo estado.
   - **Riesgos y lo que queda sin comprobar.**
   - Si cambió `AGENTS.md`, dilo arriba y por qué: esa guía no se cambia en silencio.
7. **Fusión.** Espera al CI (`gh pr checks <n> --watch`). Con las dos comprobaciones en verde y
   `mergeStateStatus` en `CLEAN`, `gh pr merge <n> --merge`. Si el CI falla o hay conflicto, **no
   fusiones**: arregla (merge de `main` en la rama, nunca `push --force`) o dilo. Un PR apilado
   se fusiona después de su base. Si el usuario dijo de una entrega concreta «no la fusiones», se
   respeta: la instrucción expresa manda sobre esta regla general.
