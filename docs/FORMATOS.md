# Qué formatos entran a AeroBim, y qué pedir a quien los manda

> **Creado:** 2026-09-03 · A raíz de dos preguntas del usuario: «¿puede abrir DWG?» y «¿y DGN de
> Bentley?»

Este documento existe para dos cosas: **decidir de una vez qué lee la aplicación**, y **poder
pasárselo a quien entrega archivos** sin tener que explicarlo cada vez.

## La decisión, en una línea

**AeroBim lee IFC, DXF y COPC.** No lee DWG ni DGN, y no es una carencia pendiente: es una decisión
que se sostiene en licencias y en lo que un formato de intercambio tiene que garantizar.

| Para qué               | Formato            | Estado |
| ---------------------- | ------------------ | ------ |
| Modelo 3D              | **IFC** 2x3 / 4    | ✅ lee |
| Plano 2D de referencia | **DXF**            | ✅ lee |
| Levantamiento          | **COPC** (LAZ 1.4) | ✅ lee |
| Modelo 3D de Autodesk  | DWG                | ❌ no  |
| Modelo o plano Bentley | DGN                | ❌ no  |

## Por qué no DWG

**Es un formato cerrado de Autodesk**, y no hay lector abierto que sea a la vez completo y limpio de
licencia:

| Opción                 | Por qué no                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **LibreDWG**           | GPL-3: **contagiaría la licencia de AeroBim entero**. Y va por detrás de las versiones recientes   |
| **ODA Drawings SDK**   | Es la solución real y es **comercial** — cuota anual, y en C++: habría que compilarlo a WASM       |
| Lectores en JavaScript | No hay ninguno serio. DWG cambia de estructura con cada versión y nadie sostiene un lector abierto |

**Y DXF no es un apaño**: es el formato de intercambio **que publica la propia Autodesk**, está
documentado, y cualquier CAD exporta a él en un paso. AeroBim tiene lector propio con capas,
colores, sombreados y unidades declaradas.

## Por qué no DGN, y qué hacer con Bentley

**DGN v8** —el que escribe MicroStation desde 2001— está en la misma situación que DWG: cerrado, y
el único lector completo es el de la Open Design Alliance, comercial. DGN v7 sí lo lee GDAL con un
controlador abierto, pero **casi nadie entrega v7 hoy**.

**Pero para Bentley hay una respuesta mejor que convertir, y este proyecto ya tiene la prueba.**
AeroBim abre un IFC de **32,7 MB exportado por ProStructures 24 de Bentley** — está en el plan, con
sus cifras—: 805 `IFCMEMBER`, 34 `IFCCOLUMN` y 433 `IFCPROXY`. De hecho **ese archivo destapó un
defecto real** —los `IFCPROXY` no se importaban— que hoy está corregido.

O sea: **el camino Bentley → IFC → AeroBim está probado con un modelo de obra de verdad**, no
supuesto. ProStructures y OpenPlant exportan IFC, y es lo que hay que pedir.

## Qué pedir a quien entrega, y por qué cada cosa

Esta es la lista corta que conviene mandar tal cual:

1. **El modelo en IFC** — 2x3 o 4. De Revit, de ProStructures, de OpenPlant o de lo que sea: todos
   exportan.
2. **IFC4 con `IfcMapConversion`, y el EPSG dicho** (para este proyecto, **EPSG:32719**). No es un
   capricho: si el modelo trae su emplazamiento, **la nube se calza sola, sin señalar un punto y sin
   residuo**. Si no lo trae, hay que calzar a mano señalando pares.
3. **Los planos en DXF**, no en DWG. Es «Guardar como» en cualquier CAD.
4. **El levantamiento en LAS o LAZ**, sin convertir, **con su sistema de referencia declarado**. Una
   nube sin CRS no se puede cruzar con nada, y el dato se pierde para siempre si nadie lo apunta al
   entregarla. La conversión a COPC se hace acá.

## Subir DWG o DGN: se convierten al entrar

**El usuario lo pidió el 2026-09-03 y está hecho.** Un DWG o un DGN se suben al expediente como
cualquier otro documento, y **el registro los convierte a DXF al recibirlos**. El visor sigue
leyendo un solo formato 2D, que es lo que lo mantiene simple: _lo que entra al expediente se
normaliza al entrar_, igual que las nubes de puntos.

- **El original es el entregable** y no se toca: se guarda y se descarga entero desde el expediente.
- **El DXF es la copia con la que se mira**, y es lo que se le sirve al visor.
- El `sha256` que viaja al visor es **el del original**, no el del DXF: es la prueba de qué
  entregable se está mirando, y el del DXF cambiaría con la versión del conversor aunque el DWG
  fuera el mismo. La respuesta lleva `X-Aerobim-Convertido: dxf` para decir que es una conversión.

### La herramienta hay que instalarla, y AeroBim no la trae

**ODA File Converter** es un ejecutable **gratuito** de la Open Design Alliance, con su propia
licencia: no se distribuye con AeroBim ni se descarga solo.

1. Descargarlo de la web de la Open Design Alliance e instalarlo **en el servidor**.
2. Apuntar la variable `ODA_CONVERTER` a su ejecutable. En Windows suele ser
   `C:\Program Files\ODA\ODAFileConverter <versión>\ODAFileConverter.exe`.
3. Reiniciar el servicio.

### Y sin la herramienta, la subida no se pierde

Es la decisión que importa de todo esto: **un registro documental que rechaza un archivo porque le
falta una herramienta de conversión es un registro que pierde el archivo.** Sin conversor, el DWG se
guarda igual, la revisión queda con su motivo escrito —`sin-conversor`— y **no aparece como abrible**
en el visor, que es lo honesto: mirar solo la extensión diría que sí y llevaría a una pantalla en
blanco.

Los motivos llevan **código estable** además del mensaje, por la misma razón que los rechazos de
carga: `sin-conversor`, `extension-no-convertible`, `sin-salida`, `tardo-demasiado`.

### Lo que está probado sin tener el binario

`ODA File Converter` no está en el entorno de integración, y aun así **18 pruebas** cubren el
pegamento, que es donde están los errores caros:

- que la subida no se pierda sin conversor, y que el motivo lleve su código;
- que un DWG **sin** DXF no sea abrible y **con** DXF sí;
- que al visor se le sirva el convertido y no el original;
- que se le pasen al programa **los seis argumentos en el orden correcto** —son posicionales y sin
  nombre, así que equivocarse no da error: da una conversión a otra versión y nadie se entera—;
- y que **no se crea el código de salida**, que es `0` aunque no convierta nada: lo que se comprueba
  es que el DXF exista.

Lo último se ejerce con un conversor de mentira —un script que escribe un DXF donde le digan—, que
recorre el camino entero sin depender de la Open Design Alliance.
