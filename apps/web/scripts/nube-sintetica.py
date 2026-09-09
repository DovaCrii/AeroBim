"""Genera `samples/levantamiento-sintetico.copc.laz`, la nube de prueba de `F2.1`.

**Existe para que el fixture no sea un binario opaco.** Versionar 7 KB de LAZ sin decir qué hay
dentro obliga a creerse los números que salgan del diagnóstico; con el generador al lado, la
geometría es comprobable: se sabe que el muro mide 3,000 m porque está escrito acá.

## Qué contiene, y por qué cada cosa

- **Coordenadas UTM 19S de Santiago** (E 345 000, N 6 298 000, H 560). No es decoración: es el
  caso en que la coordenada norte gasta las siete cifras significativas de un `float32` y el visor
  pierde 200 mm si no resta el desplazamiento. Una nube en coordenadas pequeñas no probaría nada.
- **Un plano y un muro de 3 m** en la franja `y ∈ [40, 42]`, con clasificación 2 (suelo) y 6
  (edificio). Es la geometría conocida contra la que se comprueban las alturas y las clases.
- **Escala de 1 mm**, que es lo que declara un levantamiento de verdad.
- **El WKT con `EPSG:32719` dentro**, porque sin sistema de referencia una nube no se puede cruzar
  con nada, y hay que poder comprobar que viaja.
- **El cubo del octree y el espaciado**, que la primera versión dejó en cero: sin cubo no se pueden
  derivar las cajas de los nodos y no hay recorte por vista posible. El lector de JavaScript leía el
  archivo igual, así que el defecto habría pasado desapercibido hasta `F2.3`.

**Esta nube no es del sitio de ningún modelo del repositorio**, y eso importa: para el calce a mano
de `F12.2` hace falta un par que coincida, y ese es `nube-del-muro.py`.

## Cómo se ejecuta

`copclib` **no es dependencia del proyecto** y no debe serlo: esto se corre a mano, en un entorno
desechable, cuando haya que regenerar el fixture.

    uv run --with copclib --with numpy python apps/web/scripts/nube-sintetica.py
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from copc_escribir import escribir_copc  # noqa: E402  -- vive al lado, no es un paquete

# Coordenadas de un levantamiento chileno de verdad: UTM 19S, zona de Santiago.
ORIGEN_E = 345_000.0
ORIGEN_N = 6_298_000.0
ORIGEN_H = 560.0

LADO = 100.0
POR_LADO = 250  # 62 500 puntos: bastan para comprobar, y el archivo pesa 7 KB
ESCALA = 0.001  # milimetro, lo que declara un levantamiento
ALTO_DEL_MURO = 3.0

WKT = (
    'PROJCS["WGS 84 / UTM zone 19S",GEOGCS["WGS 84",DATUM["WGS_1984",'
    'SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],'
    'UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],'
    'PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-69],'
    'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],'
    'PARAMETER["false_northing",10000000],UNIT["metre",1],AUTHORITY["EPSG","32719"]]'
)

destino = Path(__file__).resolve().parents[1] / "public" / "samples"
ruta = destino / "levantamiento-sintetico.copc.laz"

# --- La nube: un plano a 560 m y un muro de 3 m encima -------------------------------
paso = LADO / POR_LADO
ejes = np.arange(POR_LADO) * paso
xs, ys = np.meshgrid(ejes, ejes)
lx, ly = xs.ravel(), ys.ravel()
x = ORIGEN_E + lx
y = ORIGEN_N + ly
en_el_muro = (ly >= 40.0) & (ly <= 42.0)
z = np.where(en_el_muro, ORIGEN_H + ALTO_DEL_MURO, ORIGEN_H)
clases = np.where(en_el_muro, 6, 2)

print(f"puntos: {x.size:,} · en el muro: {int(en_el_muro.sum()):,}")

escribir_copc(
    ruta, x, y, z, clases, escala=ESCALA, origen=(ORIGEN_E, ORIGEN_N, ORIGEN_H), wkt=WKT
)

# La altura del muro se comprueba aquí y no en el escritor: es geometría de **este** fixture, y es
# el número que hace comprobables las alturas que salgan del diagnóstico.
alto = z.max() - z.min()
assert alto == ALTO_DEL_MURO, f"el muro mide {alto}"
print(f"comprobado: el muro mide {alto:.3f} m")
