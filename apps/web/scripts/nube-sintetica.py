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

## Cómo se ejecuta

`copclib` **no es dependencia del proyecto** y no debe serlo: esto se corre a mano, en un entorno
desechable, cuando haya que regenerar el fixture.

    uv run --with copclib --with numpy python apps/web/scripts/nube-sintetica.py
"""

from pathlib import Path

import copclib as copc
import numpy as np

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

print(f"puntos: {x.size:,} · en el muro: {int(en_el_muro.sum()):,}")

# --- La cabecera, con todo lo que hace falta ------------------------------------------
cfg = copc.CopcConfigWriter(
    6, copc.Vector3(ESCALA, ESCALA, ESCALA), copc.Vector3(ORIGEN_E, ORIGEN_N, ORIGEN_H), WKT
)
cfg.las_header.min = copc.Vector3(float(x.min()), float(y.min()), float(z.min()))
cfg.las_header.max = copc.Vector3(float(x.max()), float(y.max()), float(z.max()))

# El cubo del octree tiene que ser un cubo -no la caja de la nube- y contenerla entera: se toma el
# lado mas largo. El espaciado es la distancia entre puntos en la raiz, que la especificacion fija
# en el lado del cubo partido por 128.
lado = max(float(x.max() - x.min()), float(y.max() - y.min()), float(z.max() - z.min()))
cfg.copc_info.center_x = float((x.min() + x.max()) / 2)
cfg.copc_info.center_y = float((y.min() + y.max()) / 2)
cfg.copc_info.center_z = float((z.min() + z.max()) / 2)
cfg.copc_info.halfsize = lado / 2
cfg.copc_info.spacing = lado / 128

escritor = copc.FileWriter(str(ruta), cfg)


def nodo(indices):
    """Empaqueta esos puntos en un `Points` de copclib."""
    p = copc.Points(escritor.copc_config.las_header)
    for i in indices:
        punto = p.CreatePoint()
        punto.x = float(x[i])
        punto.y = float(y[i])
        punto.z = float(z[i])
        punto.classification = 6 if bool(en_el_muro[i]) else 2
        p.AddPoint(punto)
    return p


# Tres nodos en dos niveles. **No es un octree de verdad** —eso lo hace PDAL, repartiendo por el
# espacio— y basta para lo que el fixture tiene que probar: que el lector pide los nodos por
# separado y que la raiz sola ya deja ver la forma. Si algun dia hace falta comprobar el recorrido
# por vista, hara falta un archivo hecho con PDAL.
todos = np.arange(x.size)
raiz = todos[::64]
resto = np.setdiff1d(todos, raiz)
mitad = resto.size // 2

escritor.AddNode(copc.VoxelKey(0, 0, 0, 0), nodo(raiz))
escritor.AddNode(copc.VoxelKey(1, 0, 0, 0), nodo(resto[:mitad]))
escritor.AddNode(copc.VoxelKey(1, 1, 1, 0), nodo(resto[mitad:]))
escritor.Close()

print(f"  nivel 0 (raiz): {raiz.size:,} puntos")
print(f"  nivel 1: {resto.size:,} puntos en dos nodos")
print(f"escrito: {ruta} ({ruta.stat().st_size / 1024:.1f} KB)")

# --- Y se comprueba lo escrito, que es la mitad del trabajo ---------------------------
lector = copc.FileReader(str(ruta))
cab = lector.copc_config.las_header
assert cab.point_count == x.size, f"puntos: {cab.point_count} != {x.size}"
assert "32719" in lector.copc_config.wkt, "el WKT no llego"
assert cab.max.z - cab.min.z == ALTO_DEL_MURO, f"el muro mide {cab.max.z - cab.min.z}"
assert len(lector.GetAllNodes()) == 3, "no hay tres nodos"
print("comprobado: puntos, WKT, altura del muro y nodos")
