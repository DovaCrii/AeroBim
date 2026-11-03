---
name: orquestar
description: Reparte una ronda de trabajo de AeroBim entre subagentes - Opus diseña, decide y publica; Sonnet implementa, diseña, investiga y revisa reglas; Haiku busca, verifica, redacta y fusiona con los scripts - para no gastar tokens de más. Úsala cuando una petición tenga varias partes independientes o mucho trabajo mecánico. Mismo esquema que AeroControl, AeroConvert y AeroGeo.
---

# Orquestar una ronda

Orden de la persona (2026-10-16): **Opus diseña y decide, Sonnet implementa, Haiku revisa.** Es el mismo
esquema de AeroControl (`orquestar`, `terminar-bloques`, `pendientes-github`) con el reparto de agentes de
AeroConvert y AeroGeo, adaptado a AeroBim.

## Quién hace qué (`.claude/agents/`)

| Agente                        | Modelo          | Qué hace                                                           | Cuándo                                                   |
| ----------------------------- | --------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| **coordinador** (esta sesión) | **Opus**, medio | Entiende, decide, reparte, **revisa el diff**, publica y fusiona   | Siempre                                                  |
| `implementador`               | Sonnet          | Una fila de código y pruebas en su worktree, **sin push**          | Cada bloque de código                                    |
| `disenador`                   | Sonnet          | Interfaz: tokens, contraste medido, disposición; maquetas          | Lo visual                                                |
| `investigador`                | Sonnet          | Web, licencias, APIs, proyectos de referencia; informe con fuentes | Antes de adoptar algo                                    |
| `revisor-de-reglas`           | Sonnet          | El diff contra las reglas de `AGENTS.md` (solo lectura)            | Filas con permisos, datos, IFC, geometría o dependencias |
| `revisor-visual`              | Sonnet          | Mirar la pantalla en oscuro, solapes, consola (sin editar)         | Tras un cambio de interfaz                               |
| `explorador`                  | Haiku           | Dónde está algo y qué lo usa; rutas, no código                     | Antes de repartir                                        |
| `verificador`                 | Haiku           | `verificar.mjs` y su resumen corto                                 | Antes de publicar                                        |
| `redactor-de-cierre`          | Haiku           | HANDOFF, CHANGELOG, texto de PR con datos dados                    | Cierre de tanda                                          |
| `fusionador-de-pr`            | Haiku           | `wait_ci.ps1` y `merge_pr.ps1`; si falla, el extracto              | Mientras se sigue con otro bloque                        |

La plantilla del encargo está en `.claude/agents/ENCARGO.md`. **Pasa siempre `model` explícito** y, para un plan,
`subagent_type: "Plan"` (solo lee y propone). Un subagente **no puede lanzar otros**: todo reparto sale de aquí.

## Orden

1. **Entender (Opus).** Partir el pedido en partes independientes; lo que dependa de una decisión de la persona
   se pregunta antes.
2. **Explorar (`explorador`, Haiku).** Ubicar archivos y dueños antes de repartir; si hace falta la web,
   `investigador`.
3. **Repartir (Sonnet, en paralelo).** Un agente por parte, con **dueños de archivos sin cruce**; cada uno en su
   worktree (`isolation: "worktree"`). **Los subagentes hacen commit pero no empujan ni abren PR.**
4. **Integrar (Opus).** Leer el informe y **el diff**; lo que toque seguridad, permisos, claves, licencias o el
   IFC, además, `revisor-de-reglas`.
5. **Verificar (Haiku).** `verificador`; y `/oraculo` antes de un ✅ que lee el modelo.
6. **Publicar (Opus).** `open_pr.ps1`; el `fusionador-de-pr` espera y fusiona con el CI verde y `CLEAN`
   (decisión del usuario, 2026-10-05). La persona **solo despliega** en `p340`. Nunca `push --force`.

## Límites que ya costaron

- **Navegador compartido:** un solo panel; como mucho un agente lo usa, con su pestaña (`tabs_create`) y `tabId`
  en cada llamada. `resize_window` antes de medir. **El panel no compone fotogramas** a veces («Building BVH…»,
  giro de cámara a medias): lo que no se vio **se dice**.
- **Paralelismo:** como mucho 3 agentes de código con archivos disjuntos; `App.tsx` es el cuello de botella.
- **Dependencias:** `npm audit` y `pip-audit` van en el CI y se rompen solos con avisos nuevos; si el CI exige
  los dos, se arreglan en **un** PR o se combinan antes de fusionar.
- **Un agente cortado** deja trabajo sin commitear en su worktree: `git status --short` allí y `SendMessage`.
- **Nunca se reparte:** claves y credenciales, decisiones de licencia, cambios de `AGENTS.md`, migraciones
  destructivas y el despliegue a la VM.

## Ahorro de tokens

No dupliques búsquedas; encargos autosuficientes y cortos (contexto, archivos dueños, criterio, cómo verificar,
qué reportar); informes concisos (el detalle se lee del diff). Si un agente arrancó con el modelo equivocado,
detenlo y relánzalo.

El recorrido de una tanda está en `/terminar-bloques`; lo que se acumula alrededor, en `/pendientes-github`.
