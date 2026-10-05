---
name: triar-hallazgo
description: Triaje de un hallazgo del piloto de AeroBim - clasifica, decide si entra al plan y, si entra, crea la fila con su origen y su oráculo.
disable-model-invocation: true
argument-hint: "<uuid del hallazgo o su texto>"
---

# Triar hallazgo `$ARGUMENTS`

Los hallazgos se registran **en AeroBim mismo**, en la obra `PILOTO-AEROBIM` (ver `docs/PILOTO.md`,
sección 4), no en un chat ni en un cuaderno. Esta skill trabaja con lo que el usuario te dé: el uuid
o el texto del hallazgo. No inventes datos que no tengas.

1. **Clasifica** con una etiqueta de cada eje: clase (`defecto` · `mejora` · `duda`), dónde se vio
   (`pantalla:portal`, `:expediente`, `:observaciones`, `:visor`, `:documento`, `:nube`) y prioridad
   (`alta` · `media` · `baja`). Una etapa del piloto no cierra con un `alta` abierto.
2. **Reproduce o verifica** en el código antes de aceptar la causa que parece obvia. Muchos
   defectos de este repo no eran lo que parecían (el contraste era un tamaño; «archivar» no
   sacaba la obra de la bandeja).
3. **Decide:**
   - Entra al plan → crea una fila con el **mismo formato** que las vecinas de su fase (copia una),
     origen `PILOTO obs <uuid>` y **su oráculo**. Usa `plan-fila.mjs` para encontrar el sitio; no
     abras el plan entero.
   - Se aparca → etiqueta `plan:pospuesto` y di por qué.
   - Se descarta → estado `descartada` con su motivo.
   - Es una decisión del usuario (alcance, licencia, exposición pública) → no la tomes: plantéala.
4. **Fecha y responsable:** sin fecha, un hallazgo no está en la bandeja de nadie
   (`pendientes_por_tramo` filtra por `responsable` y `vence`). Propón ambos.
5. Entrega: clasificación, decisión, fila propuesta (o creada) y qué falta para cerrarla verificada
   en el despliegue.
