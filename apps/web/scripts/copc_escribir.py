"""Escribir un COPC de prueba: el octree, la cabecera y **la comprobacion de lo escrito**.

**Esto estaba dentro de `nube-sintetica.py` y ahora lo comparten dos generadores.** Se saco al
escribir el segundo -- `nube-del-muro.py`, el levantamiento del muro en UTM para `F12.2` -- porque
copiar cien lineas de octree es la clase de duplicado que despues divergue: el dia que una version
arregle el cubo o el reparto por espacio, la otra seguira escribiendo un fixture malo y nadie lo
vera, porque los dos archivos se leen igual de bien.

`copclib` **no es dependencia del proyecto** y no debe serlo: los generadores se corren a mano, en
un entorno desechable, cuando haya que regenerar un fixture.

    uv run --with copclib --with numpy python apps/web/scripts/<generador>.py
"""

from pathlib import Path

import copclib as copc
import numpy as np

#: Celdas por eje dentro de un nodo. La especificacion de COPC usa 128; aca 16, y a proposito: con
#: 128 el nivel 0 traeria tan pocos puntos que el fixture no serviria para ver la forma, y ademas
#: harian falta mas niveles para colocarlos todos. Son fixtures de kilobytes, no levantamientos.
GRILLA = 16
PROFUNDIDAD_MAXIMA = 6


def escribir_copc(
    ruta: Path,
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    clases: np.ndarray,
    *,
    escala: float,
    origen: tuple[float, float, float],
    wkt: str,
) -> None:
    """Escribe esos puntos como COPC en `ruta`, y **comprueba lo escrito antes de volver**."""
    n = x.size

    cfg = copc.CopcConfigWriter(6, copc.Vector3(escala, escala, escala), copc.Vector3(*origen), wkt)
    cfg.las_header.min = copc.Vector3(float(x.min()), float(y.min()), float(z.min()))
    cfg.las_header.max = copc.Vector3(float(x.max()), float(y.max()), float(z.max()))

    # El cubo del octree tiene que ser un cubo -no la caja de la nube- y contenerla entera: se toma
    # el lado mas largo. Sin el cubo no se pueden derivar las cajas de los nodos, y sin ellas no hay
    # recorte por lo que se esta mirando.
    lado = max(float(x.max() - x.min()), float(y.max() - y.min()), float(z.max() - z.min()))
    centro = np.array(
        [
            float((x.min() + x.max()) / 2),
            float((y.min() + y.max()) / 2),
            float((z.min() + z.max()) / 2),
        ]
    )
    cubo_min = centro - lado / 2

    cfg.copc_info.center_x = float(centro[0])
    cfg.copc_info.center_y = float(centro[1])
    cfg.copc_info.center_z = float(centro[2])
    cfg.copc_info.halfsize = lado / 2
    cfg.copc_info.spacing = lado / GRILLA

    escritor = copc.FileWriter(str(ruta), cfg)

    def nodo(indices):
        """Empaqueta esos puntos en un `Points` de copclib."""
        p = copc.Points(escritor.copc_config.las_header)
        for i in indices:
            punto = p.CreatePoint()
            punto.x = float(x[i])
            punto.y = float(y[i])
            punto.z = float(z[i])
            punto.classification = int(clases[i])
            p.AddPoint(punto)
        return p

    # --- El octree, repartido por el ESPACIO ------------------------------------------
    #
    # **La primera version reparto por el orden del archivo, y eso no es un octree.** Servia para
    # comprobar que el lector pide los nodos por separado, y para nada mas: los nodos no tenian
    # relacion con donde estan los puntos, asi que no se podia comprobar el recorte por vista
    # -pedir solo lo que se esta mirando-, que es de lo que trata `F2.3`.
    #
    # Esto si es el reparto de verdad, el mismo criterio de Potree y de PDAL: en cada nivel se
    # cuadricula el espacio con celdas cada vez mas finas y **se toma un punto por celda**, el
    # primero que caiga. Un punto que ya entro en un nivel no vuelve a salir. Asi cada nivel es una
    # muestra uniforme de la nube entera -no un trozo- y la raiz sola ya ensena la forma.
    profundidad = np.full(n, -1, dtype=np.int64)
    sin_colocar = np.arange(n)

    for d in range(PROFUNDIDAD_MAXIMA + 1):
        if sin_colocar.size == 0:
            break
        celda = lado / (GRILLA * (2**d))
        # El indice de celda de cada punto que queda, en la cuadricula global de este nivel.
        indices = np.floor(
            (np.stack([x[sin_colocar], y[sin_colocar], z[sin_colocar]], axis=1) - cubo_min) / celda
        ).astype(np.int64)
        # `np.unique` con `return_index` da **el primero de cada celda**, que es justo la regla.
        _, primeros = np.unique(indices, axis=0, return_index=True)
        profundidad[sin_colocar[primeros]] = d
        sin_colocar = np.setdiff1d(sin_colocar, sin_colocar[primeros])

    # **Lo que sobre va al nivel mas profundo, y no se tira.** Un generador que descarte puntos
    # escribiria un archivo que dice tener menos de los que se le dieron, y la comprobacion de ida y
    # vuelta dejaria de significar nada.
    if sin_colocar.size:
        profundidad[sin_colocar] = PROFUNDIDAD_MAXIMA

    # Y ahora, la clave de nodo de cada punto: en que octante cae, a su profundidad.
    nodos: dict[tuple[int, int, int, int], list[int]] = {}
    for i in range(n):
        d = int(profundidad[i])
        ancho = lado / (2**d)
        cx = min(int((x[i] - cubo_min[0]) / ancho), 2**d - 1)
        cy = min(int((y[i] - cubo_min[1]) / ancho), 2**d - 1)
        cz = min(int((z[i] - cubo_min[2]) / ancho), 2**d - 1)
        nodos.setdefault((d, cx, cy, cz), []).append(i)

    for (d, cx, cy, cz), indices in sorted(nodos.items()):
        escritor.AddNode(copc.VoxelKey(d, cx, cy, cz), nodo(indices))

    escritor.Close()

    por_nivel: dict[int, tuple[int, int]] = {}
    for (d, _cx, _cy, _cz), indices in nodos.items():
        cuantos, cuantas = por_nivel.get(d, (0, 0))
        por_nivel[d] = (cuantos + len(indices), cuantas + 1)
    for d in sorted(por_nivel):
        puntos_d, nodos_d = por_nivel[d]
        print(f"  nivel {d}: {puntos_d:,} puntos en {nodos_d} nodo(s)")
    print(f"escrito: {ruta} ({ruta.stat().st_size / 1024:.1f} KB)")

    # --- Y se comprueba lo escrito, que es la mitad del trabajo -----------------------
    lector = copc.FileReader(str(ruta))
    cab = lector.copc_config.las_header
    assert cab.point_count == n, f"puntos: {cab.point_count} != {n}"
    assert "32719" in lector.copc_config.wkt, "el WKT no llego"

    leidos = lector.GetAllNodes()
    assert len(leidos) == len(nodos), f"nodos: {len(leidos)} != {len(nodos)}"
    assert sum(nd.point_count for nd in leidos) == n, "se perdieron puntos por el camino"
    assert lector.GetMaxDepth() >= 2, "un octree de un solo nivel no prueba el recorte por vista"

    # **Y que cada punto este dentro de la caja de su nodo**, que es la propiedad que hace que el
    # recorte por vista sea correcto. Si un nodo contuviera puntos de fuera, pedir solo los nodos
    # que se ven dejaria agujeros -o traeria puntos de detras de la camara- y el defecto se veria
    # como una nube incompleta, no como un error de indices.
    for nd in leidos:
        d, cx, cy, cz = nd.key.d, nd.key.x, nd.key.y, nd.key.z
        ancho = lado / (2**d)
        caja_min = cubo_min + np.array([cx, cy, cz]) * ancho
        caja_max = caja_min + ancho
        puntos = lector.GetPoints(nd)
        cs = np.stack([np.array(puntos.x), np.array(puntos.y), np.array(puntos.z)], axis=1)
        # Una holgura de la escala declarada: la ida y vuelta cuantiza al milimetro.
        holgura = escala * 2
        assert (cs >= caja_min - holgura).all(), f"nodo {d}-{cx}-{cy}-{cz}: hay puntos por debajo"
        assert (cs <= caja_max + holgura).all(), f"nodo {d}-{cx}-{cy}-{cz}: hay puntos por encima"

    print(
        f"comprobado: {n:,} puntos, WKT, {len(leidos)} nodos hasta el nivel "
        f"{lector.GetMaxDepth()}, y cada punto dentro de la caja de su nodo"
    )
