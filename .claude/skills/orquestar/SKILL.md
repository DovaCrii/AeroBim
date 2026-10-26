---
name: orquestar
description: Reparte una ronda de trabajo de AeroBim entre subagentes - Opus diseña, decide y publica; Sonnet implementa; Haiku revisa e inventaría - para no gastar tokens de más. Úsala cuando una petición tenga varias partes independientes o mucho trabajo mecánico. Mismo esquema que AeroControl.
---

# Orquestar una ronda

Es el mismo esquema que `AeroControl/.claude/skills/orquestar`. Orden de la persona (2026-10-16):
**Opus diseña y decide, Sonnet implementa, Haiku revisa.**

## Quién hace qué

| Modelo                      | Rol                                                                                   | Ejemplos                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Opus** (esfuerzo medio)   | Diseña, decide y establece cómo se hace; reparte, revisa, integra y **publica el PR** | Plan, decisiones de alcance, seguridad y licencias, revisar el diff, resolver conflictos, fusionar  |
| **Sonnet** (esfuerzo medio) | Implementa lo que Opus dejó decidido                                                  | Código y pruebas, interfaz, documentos; **un worktree por agente**                                  |
| **Haiku** (esfuerzo medio)  | Lo que Opus estime conveniente para no gastar de más                                  | Revisión mecánica del diff, inventarios (`pendientes-github`), buscar dónde está algo, resumir logs |

Los agentes del proyecto ya traen su modelo (`.claude/agents/`): `explorador`, `verificador` y
`redactor-de-cierre` (Haiku), `ejecutor-de-fila` y `revisor-visual` (Sonnet). **Al lanzar uno pasa siempre
`model` explícito** (`"opus"`, `"sonnet"` o `"haiku"`) y, para diseño, `subagent_type: "Plan"` (solo lee y
propone). Un subagente **no puede lanzar otros**: todo reparto sale de esta sesión.

## Orden

1. **Entender (Opus).** Separar el pedido en partes independientes; lo que dependa de una decisión de la
   persona se pregunta antes.
2. **Explorar (Haiku, opcional).** Ubicar archivos y dueños antes de repartir.
3. **Repartir (Sonnet, en paralelo).** Un agente por parte, con **dueños de archivos sin cruce**: el prompt
   dice qué edita y qué **no** toca; cada uno en su `git worktree` (`isolation: "worktree"`).
   **Los subagentes hacen commit en su rama pero NO hacen `git push` ni abren PR**: publica Opus.
4. **Integrar (Opus).** Leer el informe, **mirar el diff** (`git diff main...<rama>`) y correr `/verificar`.
   Lo que toque seguridad, permisos, claves o licencias se lee línea a línea.
5. **Verificar (Haiku).** `verificador` y la revisión mecánica al final.
6. **Publicar (Opus).** `terminar-bloques/scripts/open_pr.ps1`, `wait_ci.ps1` y `merge_pr.ps1`.
   **Opus fusiona** con el CI verde y sin conflictos (decisión del usuario, 2026-10-05, `AGENTS.md`); la
   persona **solo despliega** en `p340`. Nunca `push --force`.

## Límites que ya costaron

- **Navegador compartido:** hay **un** panel. Como mucho un subagente lo usa, con su pestaña
  (`tabs_create`) y `tabId` en cada llamada; un script sin `tabId` corre en la pestaña de otro. Con la
  ventana oculta `innerWidth` da 0: `resize_window` antes de medir. **El panel no compone fotogramas** (la
  proyección queda en «Building BVH…», el giro de cámara se ve a medias): lo que no se vio **se dice**.
- **Paralelismo:** como mucho 3 subagentes de código con archivos disjuntos; `App.tsx` es el cuello de
  botella (cambios mínimos y localizados, y fusionar `main` antes de publicar).
- **Un agente cortado** deja trabajo **sin commitear** en su worktree: `git status --short` en su ruta antes
  de dar nada por perdido; se retoma con `SendMessage`, que conserva su contexto.
- **Nunca se reparte:** claves y credenciales (jamás en un encargo, archivo del repositorio o chat),
  licencias, cambios de `AGENTS.md`, migraciones destructivas y el despliegue a la VM.

## Ahorro de tokens

- No dupliques búsquedas entre agentes. Prompts autosuficientes y cortos: contexto, archivos dueños,
  criterio de aceptación, cómo verificar, qué reportar.
- Informes concisos (archivos, decisiones, pruebas); el detalle se lee del diff.
- Si un agente arrancó con el modelo equivocado y lleva poco, detenlo y relánzalo.

El recorrido completo de una tanda (rama, prueba, gate, PR, CI, fusión y qué falta subir) está en
`terminar-bloques`; lo que se acumula alrededor (PR sueltos, ramas, worktrees), en `pendientes-github`.
