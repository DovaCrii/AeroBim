# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** ≤120 líneas. La historia detallada vive en
> [`docs/historial/`](docs/historial/) y en `git log`. La fuente de verdad del trabajo pendiente es
> [`MASTER_PLAN.md`](MASTER_PLAN.md) (tablero de ~500 líneas desde el 2026-10-05; las fases cerradas están en `docs/historial/plan/`; `/siguiente` dice qué toca).

**Estado al:** 2026-10-06 · **`main` en:** `efd0ace` · **Último PR fusionado:** #103 · **Ninguno abierto**

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
- Pruebas: **1 756** en `services/api` (+7 omitidas; gate local del 2026-10-06) y **761** en
  TypeScript (`npm test`: 569 de `bim-core`, 115 de `viewer` y 77 de `apps/web`).

## Filas abiertas (verificar con `plan-fila.mjs --abiertas`)

| Fila                  | Qué falta                                                                                   | Quién la cierra         |
| --------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| `F2.4`                | El IFC de la pasarela (la medida ya cuadra con un corrimiento conocido)                     | Un archivo de obra      |
| `F4.5`                | Trazo libre; depende de mirar un BCF exportado en Solibri/Navisworks                        | El usuario, mirando     |
| `F12.2`               | Señalar tres pares de puntos con un ratón (el par de archivos ya está)                      | El usuario, pinchando   |
| `F2.6`, `F6.1`–`F6.5` | Gaussian splatting; Geo + BIM                                                               | Pospuestas por decisión |
| `F13.5`               | `ClipStyler` para el relleno de un corte, sin ensayar                                       | El agente               |
| `F13.6`               | La misma sección en **Bonsai** (IFC) y **CloudCompare** (nube) con el archivo real          | Quien tiene la obra     |
| `F13.7`               | Medir el perfil de nube con la **nube real de 127 MB** y decidir el techo (hoy 40 000)      | Un archivo de obra      |
| `F13.11`              | Hecho: PK y cotas sobre la malla del perfil, en DXF y PDF. **Falta mirar el DXF en un CAD** | El usuario, mirando     |
| `F16.1`               | Línea del tiempo 4D, **pospuesta** a otra etapa (lo de That Open)                           | Pospuesta por decisión  |

La **Fase 14** (proceso de agentes y base de código, `F14.1`–`F14.7`) está en el plan desde #79.
`F14.1` (el kit) se aplicó en #80 y queda 🔶: **faltan las cifras de `/context` antes y después**, que
solo se miden en una sesión interactiva. `F14.2` (la revisión de solo lectura) es lo siguiente, y
empieza con el piloto en marcha.

## Hallazgos de la revisión del 2026-10-06 (bandeja, no `alta`)

Detalle en `.claude/tmp/informes/revision-2026-10-06.md` (fuera de git). **M1:** `AuditoriaView` muestra la auditoría de
todas las organizaciones —`AuditEvent` no tiene organización—; **decide**: ¿de plataforma (solo superusuario) o por
organización (campo y migración)? **M2:** `TrabajosView` es de plataforma y hay que declararlo. **B2:** siete funciones con
complejidad > 10; el umbral baja cuando se refactoricen. Falta un paso de `npm audit` en el CI.

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

## Última tanda: la Fase 15, revisión con marcas (#89 a #103) — **cerrada entera**

Pedida con tres capturas de referencia (ProjectWise en 2D, iTwin Design Review en 3D y un panel de
reportes). **Hecho:** `F15.1` panel de observaciones del documento con marcas numeradas · `F15.2`
rectángulo, nube de revisión y llamada (migración `0016`) · `F15.3` globos numerados en la escena, su
tarjeta y la **barra vertical** de herramientas · `F15.4` hilo, responder y **@menciones** sin salir del
visor (`HiloDeObservacionAPI`, `avisar_menciones`) · `F15.5` página **Reportes** con cifras, dona, barras y
CSV · `F15.6` **buscador**: elementos del modelo en el visor (nombre, clase o GUID, con «Aislar») y página
«Buscar» del registro. Además #90 dejó el plan en ~500 líneas con `/siguiente`, #91 y #100 la malla del
perfil con sus cifras, y #93 `werkzeug` 3.1.9 (`pip-audit` lo marcó).

**Dicho y no hecho:** búsquedas guardadas como objeto (la URL `?q=` ya sirve) y que el buscador del registro
ignore acentos (pide `unaccent` de PostgreSQL: decisión de despliegue). Los globos se ven a través de los
muros, a propósito.

## La tanda anterior (#72 a #80)

Interferencias **en segundo plano y sin tope**, IFC comprimido (`.ifczip`) con gzip en nginx (#74); perfil
IFC y de nube (#75, #77); los dos espacios de trabajo y Comparar, y `ARCHITECTURE.md` reescrito (#78); la
Fase 14 y el kit de proceso (#79, #80).

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
- **Un texto ya traducido puede significar otra cosa.** `Open` era el verbo «Abrir» y el estado de una
  observación salía así en cada pantalla; `Status` era «Código». Mira la pantalla renderizada y usa
  contexto de traducción (`pgettext`) en vez de reutilizar el texto.
- **Cada cadena nueva necesita su entrada en `locale/es` y el `.mo` recompilado**: hay una prueba que
  falla en el CI y no en las pruebas sueltas del archivo que tocas.
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
