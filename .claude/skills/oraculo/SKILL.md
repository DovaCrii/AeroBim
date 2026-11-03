---
name: oraculo
description: Comprueba una capacidad de AeroBim contra su oráculo externo (Bonsai para árbol, propiedades y cantidades; QGIS para georreferencia; un CAD para el DXF; CloudCompare para nube ↔ modelo) y anota el resultado con fecha y cifras en docs/PRUEBAS_CON_ORACULO.md. Úsala antes de marcar ✅ una fila que lee el modelo.
disable-model-invocation: true
argument-hint: "[fila o capacidad, p. ej. F13.6 o psets]"
---

# Oráculo externo: `$ARGUMENTS`

`AGENTS.md` («Verificación: cada capacidad necesita un oráculo externo»): una prueba que compara nuestra salida
con nuestra propia lectura no prueba nada. Esta skill compara con **otro lector**.

## 1. Qué oráculo toca y si está aquí

| Capacidad                                      | Oráculo                  | Cómo, en esta máquina                                                                                                   |
| ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Árbol espacial, propiedades, psets, cantidades | **Bonsai/BlenderBIM**    | MCP `bonsai`: `get_spatial_structure`, `get_psets`, `list_elements`, `get_quantities` (solo las herramientas **QUERY**) |
| Georreferencia (Fase 6)                        | **QGIS**                 | MCP `qgis`: `add_vector_layer`, `get_layer_features`, `get_project_info`                                                |
| DXF exportado (planos, perfiles)               | Un **CAD**               | MCP `CAD`: `open_drawing`, `list_layers`, `list_entities`, `screenshot`                                                 |
| Alineación nube ↔ modelo                       | **CloudCompare**         | Manual: lo corre la persona; anota sus cifras                                                                           |
| BCF                                            | **Solibri o Navisworks** | Manual: lo abre la persona                                                                                              |

Si el MCP no responde o no hay un modelo abierto, **dilo y detente** en lo que dependa de él: no lo sustituyas
por una aserción propia. **No uses las herramientas EDIT** de Bonsai (no se edita el IFC: decisión 6) ni guardes
archivos en Blender o el CAD.

## 2. Comparar con cifras

- El **mismo archivo** en los dos lados (una muestra de `apps/web/public/samples/`, nunca un IFC de cliente sin
  que la persona lo dé).
- Por **GUID**: elige 3 a 5 elementos y compara clase, nombre, contenedor espacial, 3 psets y una cantidad;
  cuenta elementos por clase en los dos.
- Cifras, no «pasó»: cuántos coinciden, cuáles no y la diferencia (en mm, en m², en número de entidades).

## 3. Anotar

En `docs/PRUEBAS_CON_ORACULO.md` (créalo si no existe), una sección con **fecha**, capacidad, archivo, oráculo y
su versión, las cifras y lo que **no** coincidió. Si la fila queda ✅, su texto en `MASTER_PLAN.md` cita esa
sección; si no coincide, la fila sigue 🔶 con el motivo.

## 4. Informar

Qué se comparó, con qué versión del oráculo, cifras, y qué no se pudo correr aquí y por qué.
