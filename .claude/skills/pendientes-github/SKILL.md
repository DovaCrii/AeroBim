---
name: pendientes-github
description: Cierra lo que queda pendiente en GitHub de AeroBim - PR abiertos, ramas ya fusionadas y worktrees sobrantes - con el reparto Opus decide, Sonnet implementa, Haiku revisa. Úsala al terminar una tanda, antes de dictar un despliegue o cuando la persona pida «cerrar los pendientes de GitHub».
---

# Cerrar los pendientes de GitHub

Complementa a `terminar-bloques` (bloques de **código**) y a `orquestar` (quién hace qué). Se ocupa de lo que
se acumula **alrededor**: PR sueltos, ramas que ya están en `main` y copias de trabajo viejas.

## 1. Inventario (Haiku, solo lectura)

```powershell
pwsh .claude/skills/pendientes-github/scripts/inventario.ps1
```

PR abiertos con su estado, ramas remotas ya fusionadas y worktrees (con los de cambios sin commitear
marcados). Un subagente `verificador` o `explorador` puede correrlo y resumir; no decide nada.

## 2. Decidir (Opus)

| Caso                                      | Qué hacer                                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Propio, `CLEAN`, CI verde                 | Fusionar con `terminar-bloques/scripts/merge_pr.ps1`                                                                                                                                                 |
| Propio, `DIRTY` por fusionar `main`       | Fusionar `origin/main` en la rama (nunca `push --force`), resolver y volver a esperar el CI                                                                                                          |
| De dependabot con el CI en rojo           | Mirar **primero la causa** (`gh run view <id> --log-failed`); un bump de `uv.lock` o de `package-lock.json` roto se rehace a mano en `codex/deps-<tema>` y se cierra el de dependabot citando ese PR |
| Antiguo (semanas) o que ya nadie recuerda | **Preguntar a la persona** antes de cerrar; nunca por inercia                                                                                                                                        |

Un bump de **Django**, **ruff** o **Vite** puede cambiar comportamiento: va solo, con el gate completo. Nunca se
mezclan dos dependencias en un PR.

## 3. Implementar, revisar y publicar

Según `orquestar` (Sonnet implementa, Haiku revisa, Opus publica). La revisión mecánica de Haiku busca:
`localStorage` sin `try/catch`, animaciones fuera de `prefers-reduced-motion`, cadenas nuevas sin entrada en
el `.po` y el `.mo`, **claves o datos personales o rutas de la VM en archivos versionados**, y la fila de
`MASTER_PLAN.md` y la entrada de `CHANGELOG.md`.

## 4. Limpieza

- **Ramas remotas ya fusionadas:** `merge_pr.ps1` ya las borra; las que queden se borran una a una con
  `git push origin --delete <rama>` **solo si el inventario las lista como fusionadas** y la persona lo confirma.
- **Worktrees:** `git worktree list`. Los de `.claude/worktrees/agent-*` de un agente que ya terminó se quitan
  con `git worktree remove <ruta>` **después de comprobar que su rama está en `origin/main`**; si tiene cambios
  sin commitear (el inventario los marca) **no se borra**: se retoma el agente con `SendMessage`.
- **Servidores de prueba** levantados para verificar en el navegador: detenerlos.

## Trampas conocidas

- `mergeStateStatus` pasa a `UNKNOWN`/`DIRTY` cada vez que otro PR llega a `main`: es normal, se vuelve a consultar.
- Conflictos típicos: `CHANGELOG.md`, `MASTER_PLAN.md` y el `.po`: conservar **ambos** lados; el `.mo` se
  regenera con `compilemessages`, nunca a mano.
- `gh pr checks` con «fail» a los 7–10 s casi siempre es un paso de preparación (instalación), no una prueba;
  un trabajo cancelado a los 15 min sin paso fallido se relanza con `gh run rerun <id> --failed`.
