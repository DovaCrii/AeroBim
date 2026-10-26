---
name: terminar-bloques
description: Termina todos los bloques pendientes de AeroBim sin parar - por cada uno rama, prueba primero, gate, PR, CI, fusión y comprobación en origin/main - y al final dicta qué falta subir a p340 y los comandos justos. El agente hace todo hasta GitHub; el usuario solo despliega. Úsala cuando pida «terminar los bloques», «avanzar en todo» o «dejar listo para la VM». Mismo esquema que AeroControl.
disable-model-invocation: true
argument-hint: "[hash que corre la VM - opcional]"
---

# Terminar los bloques y dejar listo lo que se sube

**Decisión del usuario (2026-10-05 y 2026-10-08):** el agente crea, verifica y **fusiona** sus PR —todo
hasta GitHub— sin pedir permiso entre bloques; el usuario **solo despliega en la VM `p340`**, y se despliega
**una sola vez al final** (`AGENTS.md`). `/abrir-pr`, `/cerrar-tarea`, `/verificar` y `/preparar-despliegue`
siguen mandando en el detalle; aquí se encadenan. El reparto entre modelos es el de `orquestar`.

Los scripts viven en `.claude/skills/terminar-bloques/scripts/` (se llaman con `pwsh -NoProfile -File`):

| Script                                  | Para qué                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `open_pr.ps1 -Title … -BodyFile …`      | sube la rama (salida **completa**), la comprueba en `origin` y abre el PR                                  |
| `wait_ci.ps1 -Number N`                 | espera el CI hasta 9 min; salida 0 verde, 1 falló, 2 sigue (volver a llamarlo)                             |
| `merge_pr.ps1 -Number N`                | fusiona **solo** con los tres trabajos en verde y `CLEAN`, y comprueba que el commit está en `origin/main` |
| `deploy_plan.ps1 -From <hash de la VM>` | lista lo que falta subir y dicta `respaldo.sh` y `desplegar.sh` con los avisos que correspondan            |

## 1. Qué bloques se hacen

1. `git fetch`; `git log --oneline HEAD..origin/main`; `git branch --show-current`. Parar si algo está fuera
   de lugar.
2. Leer lo pendiente **sin abrir el plan entero:** `node scripts/claude/plan-fila.mjs --abiertas` (y
   `<fila> --seccion` de cada una).
3. **Antes de implementar una fila, `grep` del código que describe**: el tablero miente en las dos
   direcciones (un `⬜` puede estar hecho).
4. Se hace **todo lo que se puede hacer sin una decisión del usuario.** Se **salta**, y se anota por qué en el
   informe final, lo que:
   - depende de una decisión de negocio (límites, metas: nunca se inventa un número);
   - exige una dependencia nueva que el usuario no haya decidido;
   - es del usuario en la VM (clave en el `.env`, SMTP, datos) o de **otro producto** (AeroConvert, Academy);
   - necesita un archivo de obra o su mirada (los oráculos de `AGENTS.md`);
   - es un refactor grande bloqueado por el plan (`F14.7`).
5. Si una fila depende de otra, se hace **la de abajo primero** y se fusiona antes de empezar la siguiente.

## 2. Por cada bloque (un PR por intención)

6. Rama `codex/<tema>` **desde `origin/main` actualizado**, la prueba primero (y se ve fallar), implementar, y
   entonces `/cerrar-tarea` y `/abrir-pr` (`open_pr.ps1`, `wait_ci.ps1`, `merge_pr.ps1`). La entrada de
   `HANDOFF.md` dice **qué lleva migración, qué variables nuevas y cualquier advertencia** (se anota **al
   fusionar**, no al desplegar).
7. `git add` **por nombre** (nunca `-A`: `.atl/` y `claude-info/` no se confirman) y `git commit -F <archivo>`
   o `-m` con ámbito.
8. Al encadenar bloques:
   - **No se espera ocioso:** mientras corre el CI se empieza el bloque siguiente en **otra rama desde
     `origin/main`** (no desde la del PR en espera).
   - Conflicto casi seguro en `CHANGELOG.md`, `MASTER_PLAN.md` y `django.po` al fusionar el segundo PR en
     vuelo: `git fetch && git merge origin/main`, **conservar las dos entradas**, regenerar el `.mo`
     (`uv run python manage.py compilemessages -l es -i ".venv"`), correr lo que toca esos archivos y empujar.
     Si el merge cambia el hash, el CI corre otra vez: es el costo de tener dos PR en vuelo.

## 3. Al terminar: lo que falta subir y los comandos justos

9. Pedir **un solo dato**: el hash que corre la VM (`git log --oneline -1` allá), o tomarlo de `HANDOFF.md`
   («Desplegado en la VM»). Si no se sabe, **se pregunta**: desplegar desde un hash equivocado repite el salto
   de tanda.
10. `pwsh -NoProfile -File .claude/skills/terminar-bloques/scripts/deploy_plan.ps1 -From <hash>`: imprime los
    commits que faltan, qué llevan (migraciones, visor, dependencias, `nginx`, unidades) y los dos comandos.
11. Se dictan **de uno en uno** si el usuario lo pide; el `sudo` pide la contraseña **del usuario** y nunca se
    repite una contraseña que aparezca en una salida. Solo cuenta como llegado el hash final de `origin/main`.
12. Con el despliegue confirmado: «Desplegado en la VM» de `HANDOFF.md` pasa al hash nuevo. Viaja en el
    **siguiente** PR, no en uno propio.

## 4. El informe final (siempre estas tres partes, cortas)

- **Fusionado:** una línea por PR con su número y fila; el hash de `main`.
- **Falta subir** (la salida de `deploy_plan.ps1`, resumida) **y los comandos**.
- **Queda sin hacer, y por qué:** cada fila saltada con su motivo y **qué decisión se necesita** para
  destrabarla. Lo que **no se pudo comprobar** (un gesto real del ratón, el panel que no compone, producción)
  se dice con esas palabras.

## No hacer

- Pedir desplegar entre bloques (salvo producción rota o hallazgo de seguridad), marcar ✅ lo que no se
  comprobó, o decidir por el usuario un tema de negocio.
- `push -q`, `--force`, `--no-verify`, empujar a `main`; fusionar tras un «no checks reported»; dar por
  desplegado algo sin ver el hash final en la salida de la VM.
