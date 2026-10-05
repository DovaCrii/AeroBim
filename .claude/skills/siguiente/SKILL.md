---
name: siguiente
description: Dice qué sigue en el plan de AeroBim sin leer MASTER_PLAN.md entero - lo abierto por quién lo cierra, la fila que el agente puede tomar ya, y el paso a /cerrar-tarea. También archiva una fase al cerrarla.
disable-model-invocation: true
argument-hint: "[código de fila, p. ej. F13.5 - opcional]"
---

# Qué sigue en el plan

`MASTER_PLAN.md` es un **tablero corto** (~500 líneas): estado por fase, lo abierto, las decisiones
del usuario y las fases vivas (6, 13, 14). Las fases cerradas están enteras en
`docs/historial/plan/FASE-*.md`. **No leas ninguno de los dos enteros.**

## Sin argumento: elegir la fila

1. `node scripts/claude/plan-fila.mjs --siguiente` — lo abierto agrupado por quién lo cierra.
2. Toma de «▶» (lo que cierra el agente) la **primera que no dependa de un archivo de obra ni de
   una decisión pendiente**. Si todas dependen, dilo y propón la más cercana, sin inventar el dato.
3. `node scripts/claude/plan-fila.mjs <código> --seccion` — su fila y su sección. Si la fila no
   explica el porqué, está en el historial: el script busca allí también.
4. Di en tres líneas: la fila elegida, qué la cierra (oráculo de `AGENTS.md`) y qué queda fuera.
   Rama `codex/<área>` y a trabajar; al terminar, `/cerrar-tarea <código>` y `/abrir-pr`.

## Con un código: abrir esa fila

Pasos 3 y 4 con el código dado.

## Al cerrar una fase entera

1. Su sección sale de `MASTER_PLAN.md` a `docs/historial/plan/FASE-N.md`, **sin reescribirla**
   (cabecera de «archivo histórico»; enlaces relativos subidos tres niveles).
2. En el plan quedan: su fila de estado, su fila en el índice «Historial por fase» y, si dejó filas
   abiertas, su fila en «Lo que queda, por fase».
3. Actualiza «Quedan N filas abiertas» y `HANDOFF.md`.

## Reglas

- Nunca se marca ✅ sin el oráculo cumplido. Cifras medidas, con fecha.
- Una fila nueva se añade en su tabla de fase **y** en «Lo que queda» si queda abierta.
- Si el plan vuelve a pasar de ~700 líneas, archiva antes de seguir.
