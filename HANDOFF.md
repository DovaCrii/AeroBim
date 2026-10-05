# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** ≤120 líneas. La historia detallada vive en
> [`docs/historial/`](docs/historial/) y en `git log`. La fuente de verdad del trabajo pendiente es
> [`MASTER_PLAN.md`](MASTER_PLAN.md) (léelo por filas: `node scripts/claude/plan-fila.mjs <código>`).

**Estado al:** 2026-10-05 · **`main` en:** `84d3e00` · **Último PR fusionado:** #80

## Reparto del trabajo

- **El agente** empuja la rama, abre el PR y **lo fusiona con el CI verde** y sin conflictos (PR
  apilados, después de su base; nunca `push --force`). Decidido el 2026-10-05 y escrito en `AGENTS.md`.
- **El usuario solo despliega** en la VM `p340`. Si dice de una entrega «no la fusiones», se respeta.

## Dónde está el proyecto

- Versión `0.1.0`, **sin publicar** (no hay etiqueta de git).
- **El visor, el registro documental ISO 19650 y el portal están construidos.** Desde la Fase 13 hay
  **perfiles** (IFC y nube, desarrollados por PK) y **dos espacios de trabajo**, _Modelo 3D_ y _Planos
  y perfiles_, con **Comparar**. Todo verificado en el navegador **con datos de muestra**: falta el
  oráculo externo con los archivos del metro (`F13.6`).
- Pruebas: **1 675** en `services/api` (+2 omitidas; CI del 2026-10-05) y **659** en TypeScript
  (`npm test`: 528 de `bim-core`, 103 de `viewer` y 28 de `apps/web`).

## Filas abiertas (verificar con `plan-fila.mjs --abiertas`)

| Fila                  | Qué falta                                                                              | Quién la cierra         |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| `F2.4`                | El IFC de la pasarela (la medida ya cuadra con un corrimiento conocido)                | Un archivo de obra      |
| `F4.5`                | Trazo libre; depende de mirar un BCF exportado en Solibri/Navisworks                   | El usuario, mirando     |
| `F12.2`               | Señalar tres pares de puntos con un ratón (el par de archivos ya está)                 | El usuario, pinchando   |
| `F2.6`, `F6.1`–`F6.5` | Gaussian splatting; Geo + BIM                                                          | Pospuestas por decisión |
| `F13.5`               | `ClipStyler` para el relleno de un corte, sin ensayar                                  | El agente               |
| `F13.6`               | La misma sección en **Bonsai** (IFC) y **CloudCompare** (nube) con el archivo real     | Quien tiene la obra     |
| `F13.7`               | Medir el perfil de nube con la **nube real de 127 MB** y decidir el techo (hoy 40 000) | Un archivo de obra      |

La **Fase 14** (proceso de agentes y base de código, `F14.1`–`F14.7`) está en el plan desde #79.
`F14.1` (el kit) se aplicó en #80 y queda 🔶: **faltan las cifras de `/context` antes y después**, que
solo se miden en una sesión interactiva. `F14.2` (la revisión de solo lectura) es lo siguiente, y
empieza con el piloto en marcha.

## Lo que es tuyo (bloqueos que el código no cierra)

- **Desplegar `main` a `p340`**: respaldo primero (`respaldo.sh`), luego `desplegar.sh`
  (`docs/DEPLOY.md`). Las **líneas de compresión de nginx se añaden a mano** («Lo que el guion no
  toca»); sin ellas el IFC comprimido no viaja comprimido.
- **SMTP de Microsoft 365**: último bloqueo de `listo_para_produccion`.
- **Conversor ODA** en la VM (`conversor_cad` en `/health/`); sin él no abren los DWG.
- Decisiones abiertas: retención de `core_auditevent`; enlace para compartir con externos; dominio y
  VM compartida; política de copias de seguridad.
- Un modelo > 50 MB y uno de instalaciones (deciden si `F3.4` procede: el umbral es 30 s).
- El **piloto** ([`docs/PILOTO.md`](docs/PILOTO.md)): las cinco etapas, de la 0 a la 4, siguen sin
  empezar. La Etapa 1 (registro documental) no necesita el IFC.

## Última tanda (#72 a #80)

- #76 dependencias sin avisos (`pypdf`, `urllib3`): `pip-audit` limpio.
- #72 el tablero del plan al día · #73 la ficha del hallazgo.
- #74 revisión de interferencias **en segundo plano y sin tope**, IFC comprimido (`.ifczip`), gzip en
  nginx y aviso de nube legible (un LAZ que no es COPC dice cómo convertirlo).
- #75 perfil IFC sobre una polilínea, con PK y transversales · #77 perfil de la nube (puntos, nunca
  una línea de terreno).
- #78 los dos espacios de trabajo y Comparar; `docs/ARCHITECTURE.md` reescrito contra el código.
- #79 la Fase 14 en el plan · #80 el kit de proceso (`CLAUDE.md`, `.claude/`, `scripts/claude/`) y este
  `HANDOFF` corto.

## Trampas vigentes (las que más costaron)

- Nunca `COOP`/`COEP`: el WASM multihilo de `web-ifc` se cuelga **sin error**.
- Ningún WASM desde un CDN: la CSP lo bloquea y la página queda en blanco.
- Cuenta sin `Membresia`: entra y no ve nada, sin mensaje. Comprueba «entró **y vio la obra**».
- `FileResponse` por tramos conservando `filename`; `write_bytes` no es atómico.
- Un correlativo repetido daba 500 y dejaba el archivo en disco.
- `avance_fisico` mide avance **documental**, no de obra.
- **El techo de puntos de una consulta de nube se aplica a lo que se acepta**, no a lo que trae el
  nodo: la primera versión dejó el perfil vacío con la nube llena.
- **`npm test` no ejecutaba `apps/web`** hasta el 2026-10-05: no tenía script `test`, y las pruebas de
  `espacios.ts` (#78) nunca pasaron por el CI. Ahora lo ejecuta; si añades una prueba allí, ya cuenta.
- **`npm run build` no comprueba tipos.** Un import olvidado pasa el build y tumba la aplicación en el
  navegador: `npx tsc --noEmit -p apps/web` y mirar la consola antes de dar algo por bueno.

## Cómo retomar

```powershell
pwsh scripts/preparar-git.ps1                 # una vez tras clonar
node scripts/claude/verificar.mjs todo        # resumen de la puerta de calidad
node scripts/claude/plan-fila.mjs --abiertas  # qué sigue
```

## Historial

- Hasta 2026-10-05: [`docs/historial/HANDOFF-hasta-2026-10-05.md`](docs/historial/HANDOFF-hasta-2026-10-05.md)
  (las secciones del 2026-09-23, 09-28 y 10-05, las «Trampas ya pagadas» y las decisiones tomadas).
