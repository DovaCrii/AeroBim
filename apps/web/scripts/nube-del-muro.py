"""Genera `samples/levantamiento-del-muro.copc.laz`: **el levantamiento del muro que hay**.

## Por que hace falta este fixture y no bastaba el que ya habia

`F12.2` -- el calce a mano en pantalla, senalando pares de puntos -- quedo en 🔶 con el motivo
medido el 2026-09-08: en `muro-en-utm.ifc` el muro ocupa **una traza de pocos pixeles a cualquier
encuadre que incluya el levantamiento**, y dieciocho clics en una rejilla sobre el no dieron ni uno
en el modelo. La causa no era el rayo -- eso quedo descartado con `F12.14` -- sino que **el modelo y
la nube del repositorio no son del mismo sitio**: el muro esta en E 349 724 / N 6 292 884 y
`levantamiento-sintetico.copc.laz` en E 345 000 / N 6 298 000, o sea a casi cinco kilometros. Al
encuadrar los dos, el muro mide un pixel.

Esto es el par que faltaba: **el levantamiento de ese muro**, en su sitio, como lo veria un escaner
puesto al lado. Con los dos en pantalla el muro ocupa media escena y sus esquinas se pueden pinchar.

## El desplazamiento conocido, que es el oraculo

La nube sale **corrida a proposito** respecto al modelo:

    ΔE = +0,240 m    ΔN = -0,150 m    ΔH = +0,075 m

Es una **traslacion pura y sin giro**, y las dos cosas son decisiones:

- Corrida, porque una nube que ya calza no ejercita nada: el calce a mano existe para recuperar ese
  desajuste, y con el desplazamiento escrito aca las cifras que reporte el panel se comprueban a
  mano. Es el mismo criterio con el que se comprobo `F2.2` -- «con una desalineacion conocida de
  22,5°, el giro se recupera exacto».
- Sin giro, porque quien pincha tres pares a mano lo hace con la punteria de un raton: con un giro
  dentro, un error de pocos centimetros al senalar se convierte en grados y el residuo dejaria de
  ser comprobable a mano. El giro ya esta comprobado aparte, en `?modo=calceauto` y en las pruebas
  de `calce.ts`. Aca lo que se ejercita es **el gesto**.

## Que contiene, y por que cada cosa

El muro de `muro-en-utm.ifc` esta completamente determinado por el archivo: perfil de
`4000 x 200 mm` centrado, extruido `3000 mm` hacia arriba, colocado en
`(349723696, 6292883878, 561466)` mm. O sea, en metros absolutos:

    E ∈ [349 721,696 , 349 725,696]    N ∈ [6 292 883,778 , 6 292 883,978]    H ∈ [561,466 , 564,466]

- **El suelo**, 16 x 16 m alrededor del muro y a su cota de base, clase 2. Es lo que da contexto:
  una nube que solo trae el muro no se parece a un levantamiento.
- **Las dos caras largas y las dos testas del muro**, clase 6, a 5 cm de paso. Son las superficies
  que un escaner ve de verdad -- el interior no -- y sus bordes son las esquinas que se pinchan.
- **El coronamiento**, clase 6. Sin el, la esquina de arriba no existe en la nube y es justo la mas
  facil de identificar en las dos mitades.
- **Coordenadas UTM 19S absolutas y escala de 1 mm**, igual que el otro fixture: es el caso en que
  la coordenada norte gasta las cifras significativas de un `float32`.

## Como se ejecuta

    uv run --with copclib --with numpy python apps/web/scripts/nube-del-muro.py
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from copc_escribir import escribir_copc  # noqa: E402  -- vive al lado, no es un paquete

# --- El muro, leido de `muro-en-utm.ifc` ---------------------------------------------
# Las unidades del archivo son MILLI, asi que esto son milimetros pasados a metros.
MURO_E = 349_723.696
MURO_N = 6_292_883.878
MURO_H = 561.466
LARGO = 4.0  # XDim del perfil
GRUESO = 0.2  # YDim del perfil
ALTO = 3.0  # la extrusion

#: El desajuste que el calce a mano tiene que recuperar. Ver la cabecera.
CORRIMIENTO = (0.240, -0.150, 0.075)

LADO_DEL_SUELO = 16.0
PASO_DEL_SUELO = 0.10
PASO_DEL_MURO = 0.05
ESCALA = 0.001

WKT = (
    'PROJCS["WGS 84 / UTM zone 19S",GEOGCS["WGS 84",DATUM["WGS_1984",'
    'SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],'
    'UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],'
    'PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-69],'
    'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],'
    'PARAMETER["false_northing",10000000],UNIT["metre",1],AUTHORITY["EPSG","32719"]]'
)

destino = Path(__file__).resolve().parents[1] / "public" / "samples"
ruta = destino / "levantamiento-del-muro.copc.laz"

# --- El suelo -------------------------------------------------------------------------
paso = np.arange(-LADO_DEL_SUELO / 2, LADO_DEL_SUELO / 2 + PASO_DEL_SUELO, PASO_DEL_SUELO)
sx, sy = np.meshgrid(paso, paso)
sx, sy = sx.ravel(), sy.ravel()
# Fuera la huella del muro: el suelo no se ve por debajo de el, y dejar puntos ahi pondria suelo
# dentro del muro -- que es justo lo que un calce mal hecho produce, y aqui confundiria.
bajo_el_muro = (np.abs(sx) <= LARGO / 2) & (np.abs(sy) <= GRUESO / 2)
sx, sy = sx[~bajo_el_muro], sy[~bajo_el_muro]
suelo = np.stack([MURO_E + sx, MURO_N + sy, np.full(sx.size, MURO_H)], axis=1)

# --- El muro: dos caras largas, dos testas y el coronamiento ---------------------------
a_lo_largo = np.arange(-LARGO / 2, LARGO / 2 + PASO_DEL_MURO, PASO_DEL_MURO)
a_lo_alto = np.arange(0.0, ALTO + PASO_DEL_MURO, PASO_DEL_MURO)
a_lo_ancho = np.arange(-GRUESO / 2, GRUESO / 2 + PASO_DEL_MURO, PASO_DEL_MURO)

caras = []
for lado in (-GRUESO / 2, GRUESO / 2):
    cx, cz = np.meshgrid(a_lo_largo, a_lo_alto)
    caras.append(
        np.stack(
            [MURO_E + cx.ravel(), np.full(cx.size, MURO_N + lado), MURO_H + cz.ravel()], axis=1
        )
    )
for testa in (-LARGO / 2, LARGO / 2):
    ty, tz = np.meshgrid(a_lo_ancho, a_lo_alto)
    caras.append(
        np.stack(
            [np.full(ty.size, MURO_E + testa), MURO_N + ty.ravel(), MURO_H + tz.ravel()], axis=1
        )
    )
kx, ky = np.meshgrid(a_lo_largo, a_lo_ancho)
caras.append(
    np.stack([MURO_E + kx.ravel(), MURO_N + ky.ravel(), np.full(kx.size, MURO_H + ALTO)], axis=1)
)
muro = np.concatenate(caras)

# --- Todo junto, y corrido ------------------------------------------------------------
puntos = np.concatenate([suelo, muro])
clases = np.concatenate([np.full(len(suelo), 2), np.full(len(muro), 6)])
puntos = puntos + np.array(CORRIMIENTO)

print(f"puntos: {len(puntos):,} · suelo: {len(suelo):,} · muro: {len(muro):,}")
print(f"corrimiento aplicado: {CORRIMIENTO[0]:+.3f} {CORRIMIENTO[1]:+.3f} {CORRIMIENTO[2]:+.3f} m")
print(
    "el muro en la nube: "
    f"E [{puntos[len(suelo) :, 0].min():.3f}, {puntos[len(suelo) :, 0].max():.3f}] · "
    f"N [{puntos[len(suelo) :, 1].min():.3f}, {puntos[len(suelo) :, 1].max():.3f}] · "
    f"H [{puntos[len(suelo) :, 2].min():.3f}, {puntos[len(suelo) :, 2].max():.3f}]"
)

escribir_copc(
    ruta,
    puntos[:, 0],
    puntos[:, 1],
    puntos[:, 2],
    clases,
    escala=ESCALA,
    origen=(MURO_E, MURO_N, MURO_H),
    wkt=WKT,
)

# **Y la propiedad que hace de esto un fixture util**, comprobada aqui y no supuesta: la esquina de
# arriba del muro en la nube esta a exactamente el corrimiento de la del modelo. Es el numero que el
# panel de calce tiene que recuperar, y si este generador cambiara sin querer, esto se pone rojo.
esquina_del_modelo = np.array([MURO_E + LARGO / 2, MURO_N + GRUESO / 2, MURO_H + ALTO])
esquina_de_la_nube = esquina_del_modelo + np.array(CORRIMIENTO)
del_muro = puntos[len(suelo) :]
mas_cerca = del_muro[np.argmin(np.linalg.norm(del_muro - esquina_de_la_nube, axis=1))]
assert np.allclose(mas_cerca, esquina_de_la_nube, atol=ESCALA * 2), (
    f"la esquina de la nube esta en {mas_cerca}, se esperaba {esquina_de_la_nube}"
)
print(
    "comprobado: la esquina superior del muro en la nube cae a "
    f"{np.linalg.norm(mas_cerca - esquina_del_modelo):.3f} m de la del modelo, "
    f"que es el modulo del corrimiento"
)
