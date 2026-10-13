---
name: coordinar
description: Protocolo para repartir el trabajo de AeroBim entre modelos - la sesión coordinadora (Opus) descompone y revisa; Haiku hace lo mecánico y Sonnet el código y la pantalla. Úsala cuando una petición tenga varias actividades o cuando el coste importe.
disable-model-invocation: true
argument-hint: "[la petición del usuario]"
---

# Coordinar el trabajo

**El coordinador es la sesión principal** (Opus 5.5, esfuerzo medio: `claude --agent coordinador` o `/model opus`).
Un subagente no puede lanzar otros, así que **todo reparto sale de aquí**. Optimizar es no gastar un modelo
caro en lo que uno barato hace igual de bien, **sin** bajar la calidad de lo que se fusiona.

## 1. Descomponer

Parte la petición en actividades de **un solo tipo**, cada una con su criterio de hecho medible. Si dos
actividades tocan el mismo archivo, **no van en paralelo**: se ordenan, o se le da a una la propiedad del
archivo y a la otra se le prohíbe tocarlo (ponlo en el encargo).

## 2. Elegir quién la hace

| Actividad                                                                | Quién                                  | Por qué                                      |
| ------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------- |
| Descomponer, decidir alcance, seguridad, permisos, licencias, conflictos | **Coordinador (Opus)**                 | Es juicio; un error cuesta más que el ahorro |
| Revisar el diff de un subagente y fusionar                               | **Coordinador (Opus)**                 | La responsabilidad no se delega              |
| Inventarios, «¿existe ya…?», mapas de archivos, contar usos              | `explorador` (**Haiku**, solo lectura) | Mecánico y barato                            |
| Correr `verificar.mjs` y resumir                                         | `verificador` (**Haiku**)              | Salida larga, resumen corto                  |
| HANDOFF, CHANGELOG, texto de PR, contadores                              | `redactor-de-cierre` (**Haiku**)       | Documentación con datos dados                |
| Código, pruebas, rediseño de una pantalla, una fila acotada              | `ejecutor-de-fila` (**Sonnet**)        | Necesita criterio de código                  |
| Mirar la pantalla en oscuro, solapes, que funcione                       | `revisor-visual` (**Sonnet**)          | Necesita juicio visual                       |

Regla de desempate: si el trabajo **escribe código que se despliega**, mínimo Sonnet; si solo **lee o redacta
con datos dados**, Haiku; si **decide qué se hace**, Opus.

## 3. El encargo (plantilla)

Cada encargo trae: **objetivo y criterio de hecho**, los archivos que **sí** puede tocar y los que **no**, el
comando de verificación, «`git add` con rutas explícitas, nunca `-A`; nunca `push --force`; PR abierto, **sin
fusionar**», y qué devuelve (rama, PR, lo medido, lo que no pudo comprobar). Los subagentes de código van con
`isolation: "worktree"` y en segundo plano.

## 4. Límites que ya costaron

- **Navegador compartido:** hay **un** panel. Como mucho **un** subagente a la vez mira la pantalla, con su
  pestaña (`tabs_create`) y `tabId` en cada llamada; el coordinador no navega mientras otro lo hace.
- **Paralelismo:** como mucho **3** subagentes de código a la vez, con propiedad de archivos disjunta; el
  coste de reconciliar `App.tsx` crece más rápido que el ahorro.
- **El panel no compone fotogramas** (la proyección se queda en «Building BVH…» y el giro de cámara se ve a
  medias): lo que no se vio se dice, no se declara verificado.

## 5. Recibir y cerrar

1. Lee el informe y **el diff** (`gh pr diff`), no solo el resumen. Un subagente puede equivocarse con
   seguridad.
2. CI verde y sin conflicto → `gh pr merge --merge`, en orden de dependencia (`/abrir-pr`, paso 7).
3. Tras fusionar varios, **verifica `main` entero** (`verificador`) antes de decir que algo está listo.
4. Cierre de tanda: `/preparar-despliegue`; el `redactor-de-cierre` deja los documentos y tú revisas.

## 6. Qué no se reparte nunca

Claves y credenciales (jamás en un encargo, un archivo del repositorio ni el chat), decisiones de licencia,
cambios de `AGENTS.md`, migraciones destructivas, y el despliegue a la VM (es del usuario).
