---
paths:
  - "services/api/**"
---

# services/api (Django + DRF)

El contrato completo está en `AGENTS.md` («Contrato de permisos y lectura»). Esta lista es para
tenerla delante al editar:

- **Vista nueva = permiso explícito.** Mutar pide `add_*`/`change_*`/`delete_*`; leer pide `view_*`.
  `LoginRequiredMixin` solo no alcanza.
- **Acota el queryset por organización**, no solo compruebas el permiso.
- **Trae su prueba de 403** (autenticado sin permiso) y, si aplica, su prueba de aislamiento entre
  organizaciones. Es una fila en `apps/accounts/tests/test_permisos.py`.
- **Anónimo → login; autenticado sin permiso → 403 duro.** Nunca al revés.
- **Roles de lectura con lista blanca**, jamás «todo lo que empiece por `view_`». Nunca
  `fields = "__all__"` en escritura ni en exportación.
- **Textos de interfaz:** márcalos y compila el catálogo; el gate borra los `.mo` y recompila.
- **Orden por `vence`:** usa `nulos_al_final`.
- **Archivos grandes:** nunca enteros en RAM; escritura atómica; `FileResponse` conserva el `filename`.
- **Concurrencia:** no calcules «máximo + 1». `AuditEvent.sequence` tuvo 165 duplicados en 192
  escrituras con PostgreSQL; hizo falta un cerrojo con nombre. Si tocas algo concurrente, prueba
  contra PostgreSQL (el CI lo hace).
- **Despliegue:** nunca sirvas `COOP` ni `COEP`; la CSP necesita `'wasm-unsafe-eval'` y
  `worker-src 'self' blob:`. Un ajuste de `prod.py` que nadie importa es un ajuste que nadie prueba.
- Gate: `node scripts/claude/verificar.mjs api`. Si añades un paso a `verify.ps1`, añádelo a
  `.github/workflows/ci.yml` (y al revés).
