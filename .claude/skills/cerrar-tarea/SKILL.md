---
name: cerrar-tarea
description: Cierra una tarea del plan de AeroBim (p. ej. F2.4) - comprueba el oráculo, marca la fila, actualiza HANDOFF y CHANGELOG y prepara el commit.
disable-model-invocation: true
argument-hint: "<código de fila, p. ej. F2.4>"
---

# Cerrar tarea `$ARGUMENTS`

1. `node scripts/claude/plan-fila.mjs $ARGUMENTS --seccion` — lee la fila y su sección. No abras
   `MASTER_PLAN.md` entero.
2. **Oráculo.** Busca en la tabla «Verificación» de `AGENTS.md` qué lo comprueba. Si el oráculo
   externo (Bonsai, CloudCompare, Solibri/Navisworks, QGIS, un IFC de obra real…) no se ha
   ejecutado, **no marques ✅**: marca 🔶 o ❓, di qué falta y quién lo cierra.
3. `/verificar` con el alcance que corresponda, en verde.
4. **Plan.** Edita solo la fila (con su número de línea) en su tabla de fase y en «Lo que queda, por
   fase» si está ahí; actualiza el conteo de ese bloque. Cifras medidas y con fecha.
5. **HANDOFF.md.** Reescribe lo que cambió (estado, abiertas, bloqueos). No apiles historia; si algo
   se retira, va a `docs/historial/`. Debe seguir ≤120 líneas.
6. **CHANGELOG.md.** Una entrada breve en «Sin publicar».
7. Prepara el commit: `npm run fmt` sobre lo tocado y mensaje en español, imperativo y con ámbito
   (`feat(viewer): …`, `fix(ifc): …`, `docs: …`).
8. La fusión del PR la hace `/abrir-pr`, con el CI verde. Termina con: qué se cerró, con qué
   medida, y qué queda abierto.
