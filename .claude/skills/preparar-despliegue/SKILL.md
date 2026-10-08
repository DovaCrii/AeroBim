---
name: preparar-despliegue
description: Cierra una tanda de trabajo antes de producción - todos los bloques abiertos terminados, sus PR fusionados en orden con el CI verde, main verificado y un resumen corto para que el usuario despliegue en la VM. Úsala cuando el usuario diga "cerrar la tanda", "dejar listo para producción" o "listo para la VM".
disable-model-invocation: true
argument-hint: "[nota opcional sobre la tanda]"
---

# Preparar el despliegue (cierre de tanda)

**Regla:** a la VM no se manda nada a medias. Antes de pedir el despliegue se **cierran todos los
bloques** de la tanda, se **juntan y fusionan todos sus PR** y `main` queda verificado entero. El
usuario solo despliega (`AGENTS.md`); el agente no toca la VM.

1. **Inventario.** `gh pr list --state open`, `git branch -r --no-merged origin/main` y
   `node scripts/claude/plan-fila.mjs --abiertas`. Separa: (a) bloques **cerrables por el agente**,
   (b) bloques que **dependen del usuario o de archivos de obra** (se listan, no bloquean salvo que
   el usuario diga que sí), (c) ramas huérfanas (se cierran o se borran, nunca se dejan).
2. **Cerrar los bloques de (a).** Para cada uno: `/siguiente` y `/cerrar-tarea <fila>`; si es
   trabajo largo y acotado, delégalo a un subagente `ejecutor-de-fila` (Sonnet) con la fila, los
   archivos y el criterio de hecho; revisa su diff antes de aceptarlo. Un bloque a medias se
   **revierte o se declara pendiente** en el plan; no se fusiona roto.
3. **Fusionar en orden de dependencia** (`/abrir-pr`, paso 7): base primero; `main` fusionado en
   cada rama antes de su turno; **nunca `push --force`**. Tras cada fusión, el siguiente PR vuelve a
   pasar el CI si `main` cambió. Conflictos en `MASTER_PLAN.md` o `django.po`: toma `main` y
   reaplica lo propio.
4. **Verificar `main`** ya integrado: `git checkout main && git pull`,
   `node scripts/claude/verificar.mjs todo` (incluye el gate `api`), y mirar en el navegador lo que
   cambió (`preview_start`), con `Piso 5.ifc`. Contraste en oscuro.
5. **Documentación al día:** `MASTER_PLAN.md` (fila y conteo), `HANDOFF.md` (≤120 líneas, estado
   y último PR), `CHANGELOG.md` («Sin publicar»). Migraciones nuevas y variables de entorno nuevas
   van **explícitas** en el resumen.
6. **Entregar al usuario**, en un bloque corto: PR fusionados (enlaces), migraciones, cambios de
   configuración o de nginx, lo que **no** está probado y por qué, y los dos pasos de siempre:
   `respaldo.sh` y luego `desplegar.sh` (`docs/DEPLOY.md`). Termina con «listo para desplegar» solo
   si el paso 4 está en verde; si no, di qué falta.

No hagas: fusionar con CI rojo, desplegar, tocar la VM, marcar ✅ sin oráculo, ni ocultar un bloque
pendiente para que la tanda «parezca» cerrada.
