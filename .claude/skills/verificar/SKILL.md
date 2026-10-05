---
name: verificar
description: Corre la verificación de AeroBim (prettier, oxlint, build, pruebas TypeScript y el gate de services/api) y devuelve un resumen corto. Úsala antes de dar algo por terminado o de abrir un PR.
allowed-tools: Bash(node scripts/claude/*)
---

# Verificar

1. Elige el alcance según lo tocado: `web` (packages/ o apps/web), `api` (services/api) o `todo`.
2. Ejecuta `node scripts/claude/verificar.mjs <alcance>`. No ejecutes `pytest --cov`, `vitest` ni
   `npm run build` a pelo: vuelcan miles de líneas al contexto.
3. Si todo está en verde, informa en una línea (cuántos pasos y las cifras de pruebas que imprime).
4. Si algo falla: lee solo «Lo que falló» y «Final de la salida». Abre el log
   (`.claude/tmp/verificar/<paso>.log`) por rangos solo si hace falta. Arregla la causa, no el
   síntoma, y vuelve a correr **solo** el alcance que falló.
5. Nunca digas «en verde» sin haber visto la salida de este comando en esta sesión.

Notas:

- El gate de `api` necesita `pwsh` y `uv`. Si faltan, dilo; no lo sustituyas por otra cosa.
- Esto resume la puerta de calidad; no la reemplaza. El CI sigue siendo la referencia
  (`.github/workflows/ci.yml`; los pasos de `verify.ps1` y del CI deben coincidir).
- Pasar la suite no cumple el oráculo externo de `AGENTS.md`: para marcar ✅ hace falta además la
  comprobación independiente que corresponda.
