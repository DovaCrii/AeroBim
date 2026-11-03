# HANDOFF — AeroBim

> **Resumen de estado, no bitácora.** ≤120 líneas. La historia detallada vive en
> [`docs/historial/`](docs/historial/) y en `git log`. La fuente de verdad del trabajo pendiente es
> [`MASTER_PLAN.md`](MASTER_PLAN.md) (tablero de ~500 líneas desde el 2026-10-05; las fases cerradas están en `docs/historial/plan/`; `/siguiente` dice qué toca).

**Estado al:** 2026-11-03 · **`main` en:** `511dabe` · **Último PR fusionado:** #158 · **Ninguno abierto** · **Tanda desplegada en la VM**

## Reparto del trabajo

- **El agente** empuja la rama, abre el PR y **lo fusiona con el CI verde** y sin conflictos (PR
  apilados, después de su base; nunca `push --force`). Decidido el 2026-10-05 y escrito en `AGENTS.md`.
- **El usuario solo despliega** en la VM `p340`. Si dice de una entrega «no la fusiones», se respeta.

## Dónde está el proyecto

- Versión `0.1.0`, **sin publicar** (no hay etiqueta de git).
- **El visor, el registro ISO 19650 y el portal están construidos**, con **perfiles** por PK y dos
  espacios (_Modelo 3D_ y _Planos 2D y perfiles_). Verificado **con datos de muestra**: falta el oráculo
  externo con los archivos del metro (`F13.6`).
- Pruebas (gate local 2026-10-09): **1 775** en `services/api` (+7 omitidas) y **249** en TypeScript por paquete.

## Filas abiertas (verificar con `plan-fila.mjs --abiertas`)

| Fila                  | Qué falta                                                                                   | Quién la cierra         |
| --------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| `F2.4`                | El IFC de la pasarela (la medida ya cuadra con un corrimiento conocido)                     | Un archivo de obra      |
| `F4.5`                | Trazo libre; depende de mirar un BCF exportado en Solibri/Navisworks                        | El usuario, mirando     |
| `F12.2`               | Señalar tres pares de puntos con un ratón (el par de archivos ya está)                      | El usuario, pinchando   |
| `F2.6`, `F6.1`–`F6.5` | Gaussian splatting; Geo + BIM                                                               | Pospuestas por decisión |
| `F13.6`               | La misma sección en **Bonsai** (IFC) y **CloudCompare** (nube) con el archivo real          | Quien tiene la obra     |
| `F13.7`               | Medir el perfil de nube con la **nube real de 127 MB** y decidir el techo (hoy 40 000)      | Un archivo de obra      |
| `F13.11`              | Hecho: PK y cotas sobre la malla del perfil, en DXF y PDF. **Falta mirar el DXF en un CAD** | El usuario, mirando     |
| `F16.1`               | Línea del tiempo 4D, **pospuesta** a otra etapa (lo de That Open)                           | Pospuesta por decisión  |

La **Fase 14** (proceso de agentes y base de código, `F14.1`–`F14.7`) está en el plan desde #79.
`F14.1` (el kit) se aplicó en #80 y queda 🔶: **faltan las cifras de `/context` antes y después**, que
solo se miden en una sesión interactiva. `F14.2` (la revisión de solo lectura) es lo siguiente, y
empieza con el piloto en marcha.

## Hallazgos de la revisión del 2026-10-06 (bandeja, no `alta`)

Detalle en `.claude/tmp/informes/revision-2026-10-06.md` (fuera de git). **M1 y M2 mitigados el 2026-10-08:**
la auditoría y los trabajos (`SoloPlataformaMixin`) solo los ve el superusuario en cuanto hay **más de una
organización**; con una se conserva lo de siempre. **Decidido el 2026-10-08: de momento sin auditoría
propia por organización** (no hay campo ni migración).

## Lo que es tuyo (bloqueos que el código no cierra)

- **Próximo despliegue a `p340`**: respaldo primero (`respaldo.sh`), luego `desplegar.sh`
  (`docs/DEPLOY.md`). Las **líneas de nginx se añaden a mano** («Lo que el guion no toca»): compresión
  del IFC y `client_max_body_size 500M`.
- **SMTP de Microsoft 365**: último bloqueo de `listo_para_produccion`.
- **Conversor ODA** en la VM (`conversor_cad` en `/health/`); sin él no abren los DWG.
- Decisiones abiertas: retención de `core_auditevent`; enlace para compartir con externos; dominio y
  VM compartida; política de copias de seguridad.
- Un modelo > 50 MB y uno de instalaciones (deciden si `F3.4` procede: el umbral es 30 s).
- El **piloto** ([`docs/PILOTO.md`](docs/PILOTO.md)): las cinco etapas, de la 0 a la 4, siguen sin
  empezar. La Etapa 1 (registro documental) no necesita el IFC.

## Desplegado en la VM (2026-11-03)

**La VM `p340` corre `511dabe` (#158)**, con todo hasta #158. Lo nuevo en esta tanda:

- Carga del registro con progreso, «Cancelar» y **caché local** de modelos convertidos (IndexedDB; #155).
- **Luz de revisión** y color «Neutro» en el visor (#157).
- Barra de ayuda de uso (`F17.1`, #145).
- **Tope de 500 MB para IFC/IFCZIP** (#158; el resto sigue en 200 MB). `client_max_body_size 500M` se puso a
  mano en el nginx de la VM; el repo lo lleva en `services/api/deploy/nginx-aerobim.conf`.
- Servidor del asistente de IA **apagado por defecto** (#148; `Organizacion.asistente_activo = False`).
- Dependencias sin avisos de `npm audit` ni `pip-audit` (#153, #156).
- Agentes por rol y skills `orquestar`, `terminar-bloques`, `pendientes-github` y `oraculo` (#151, #154).

**Migraciones aplicadas en esta tanda:** `core/0006_asistente_activo` y `asistente/0001`.

**Lo que sigue:**

- `F17.3b`: el asistente habla con NVIDIA (en curso).
- Vaciar la caché local al cerrar sesión (en curso; hoy `vaciarCache()` solo lo llama el botón de
  `CacheLocal.tsx`).
- `F17.2`: herramientas agrupadas por tarea; espera una captura del usuario.
- Del usuario: poner `NIM_API_KEY` **solo en el `.env` de la VM** (nunca en chat ni en el repositorio) y
  correr `asistente_probar` cuando exista.

**Sin confirmar a ojo:** una subida real de 300–500 MB; un IFC grande abierto en el visor; la caché contra la
VM real; la cámara en planta del espacio 2D. Diseño del asistente: `docs/ASISTENTE_IA.md`.

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

- [Fase 15](docs/historial/HANDOFF-tanda-fase-15.md) · [Tanda #72 a #80](docs/historial/HANDOFF-tanda-72-a-80.md) · [Hasta 2026-10-05](docs/historial/HANDOFF-hasta-2026-10-05.md).
