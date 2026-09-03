"""Convierte un LAS o LAZ a COPC, **fuera de la aplicación**.

## Por qué existe, y por qué no es `pdal`

`docs/NUBES_DE_PUNTOS.md` deja escrito que la conversión se hace con `pdal`, y sigue siendo lo
recomendado: es la herramienta del oficio y está probada por medio mundo. Pero **`pdal` no se puede
instalar en la máquina de desarrollo**: en PyPI viene solo como código fuente —necesita la
biblioteca C++ aparte— y no hay conda. Sin conversor no hay nada que abrir, así que el octree se
construye acá.

Es un script de desarrollo y **no parte de la aplicación**: el límite de la fase sigue en pie —
AeroBim abre lo que otro generó—. Cuando haya `pdal` en la máquina de quien opere esto, el comando
de una línea del documento es mejor que este archivo.

## Qué hace, en orden

1. **Mira la cabecera** y avisa de lo que va a doler: el recuento, la magnitud de las coordenadas y
   si falta el sistema de referencia.
2. **Diezma por rejilla**, si se le pide. No por «uno de cada n» sino **un punto por celda de un
   tamaño dado**, que es lo que hace `filters.sample` de PDAL: reparte la pérdida por el espacio en
   vez de por el orden del archivo, y deja una nube de densidad uniforme.
3. **Construye el octree** con el criterio de Potree y PDAL: en cada nivel se cuadricula más fino y
   se toma un punto por celda, el primero que caiga. Un punto que ya entró no vuelve a salir, así
   que **cada nivel es una muestra uniforme de la nube entera** y la raíz sola ya enseña la forma.
4. **Escribe y comprueba**: recuento, extensión, y que cada punto caiga dentro de la caja de su
   nodo — la propiedad de la que depende que el recorte por vista sea correcto.

## Lo que se pierde, dicho claro

Se conservan **posición, color, intensidad y clasificación**. Todo lo demás del registro de punto
—número de retorno, ángulo de escaneo, tiempo GPS, `point_source_id`— **se descarta**, porque el
visor no lo usa y arrastrarlo doblaría el archivo. Si algún día hace falta para medir, hay que
volver al original: **este archivo no lo sustituye**.

## Cómo se ejecuta

    uv run --with "laspy[lazrs]" --with copclib --with numpy python apps/web/scripts/a-copc.py ^
        "C:/ruta/al/levantamiento.las" "C:/ruta/salida.copc.laz" --celda 0.02

`--celda` en metros es el diezmado por rejilla; sin él entra la nube completa. `--epsg` declara el
sistema de referencia cuando el archivo no lo trae — **y solo se usa si se sabe de verdad**: un
sistema supuesto pone el edificio en otro país.
"""

import argparse
import sys
import time
from pathlib import Path

import copclib as copc
import laspy
import numpy as np

# Celdas por eje dentro de un nodo, y hasta dónde profundizar.
#
# **512 y no 128, y la diferencia se midió.** Con 128, la nube del proyecto salió en **15 017 nodos
# de unos 1 000 puntos cada uno**, y el visor tardaba 19 s en traer los que se veían: cada nodo es
# una petición de rango, así que el tiempo se lo comía el ir y venir, no los puntos. Con 512 la
# rejilla de cada nodo es más fina, así que **cada nodo lleva muchos más puntos y hacen falta menos
# niveles** para llegar al mismo detalle.
#
# La referencia son los 50 000 a 100 000 puntos por nodo con los que trabajan PotreeConverter y
# PDAL. Es la cifra que hay que mirar al convertir una nube nueva, y el script la imprime.
GRILLA = 512
PROFUNDIDAD_MAXIMA = 10


def main() -> int:
    trozos = argparse.ArgumentParser(description="Convierte un LAS/LAZ a COPC.")
    trozos.add_argument("origen", type=Path)
    trozos.add_argument("destino", type=Path)
    trozos.add_argument(
        "--celda",
        type=float,
        default=0.0,
        help="Diezmado por rejilla, en metros. Un punto por celda. Sin esto, entra todo.",
    )
    trozos.add_argument(
        "--epsg",
        type=int,
        default=0,
        help="Declara el sistema de referencia si el archivo no lo trae. Solo si se sabe.",
    )
    args = trozos.parse_args()

    if not args.origen.exists():
        print(f"no existe: {args.origen}")
        return 1

    print(f"origen: {args.origen.name} ({args.origen.stat().st_size / 1e6:.0f} MB)")

    # --- 1. Mirar antes de tocar ------------------------------------------------------
    with laspy.open(args.origen) as f:
        cab = f.header
        print(f"  LAS {cab.version} · formato {cab.point_format.id} · {cab.point_count:,} puntos")
        print(f"  extension: {[round(b - a, 2) for a, b in zip(cab.mins, cab.maxs)]} m")
        crs = cab.parse_crs()
        wkt = ""
        if crs is not None:
            wkt = crs.to_wkt()
            print(f"  sistema de referencia: {crs.name}")
        elif args.epsg:
            import pyproj

            wkt = pyproj.CRS.from_epsg(args.epsg).to_wkt()
            print(f"  sistema de referencia: DECLARADO A MANO como EPSG:{args.epsg}")
        else:
            # **No se adivina.** Una nube sin CRS no se puede cruzar con nada, y suponerlo es peor
            # que no tenerlo: el error no se ve hasta que el edificio aparece en otro sitio.
            print("  sistema de referencia: NINGUNO.")
            print("  El archivo no lo declara y no se adivina. Pasa --epsg si lo sabes de verdad.")
            print("  Se convierte igual, pero la nube no se podra georreferenciar.")

        for nombre, minimo, maximo in zip("XYZ", cab.mins, cab.maxs):
            peor = max(abs(minimo), abs(maximo))
            error = abs(float(np.float32(peor)) - peor)
            if error > 0.001:
                print(
                    f"  aviso: la coordenada {nombre} llega a {peor:.0f} y en un float32 "
                    f"perderia {error * 1000:.0f} mm. El visor resta el desplazamiento."
                )

    # --- 2. Leer por trozos, diezmando al vuelo ---------------------------------------
    #
    # **No se lee entera, y no es una optimización: no cabe.** La nube del proyecto son 3,37 GB en
    # disco y `laspy.read` deja en memoria el registro completo más las coordenadas en doble
    # precisión: unos 7 GB. Leyendo por trozos y quedándose solo con lo que sobrevive al diezmado,
    # la memoria es la de la nube **de salida**, que es la que importa.
    #
    # El diezmado es por rejilla y **global**, no por trozo: una celda ya ocupada por un trozo
    # anterior no vuelve a aceptar puntos. Hacerlo por trozo dejaría densidad distinta en las
    # zonas donde dos trozos se solapan, y en un levantamiento los trozos siguen el orden de
    # escaneo, así que se vería como bandas.
    t0 = time.perf_counter()
    trozos_x: list[np.ndarray] = []
    trozos_y: list[np.ndarray] = []
    trozos_z: list[np.ndarray] = []
    trozos_i: list[np.ndarray] = []
    trozos_c: list[np.ndarray] = []
    trozos_rgb: list[np.ndarray] = []
    ocupadas = np.empty(0, dtype=np.int64)
    leidos = 0
    tiene_color = False
    # El origen del que se cuentan las celdas del diezmado: el mínimo que declara la cabecera. Va
    # fuera del bucle porque **tiene que ser el mismo para todos los trozos**; uno por trozo daría
    # rejillas desplazadas entre sí y el diezmado global no serviría de nada.
    origen = np.array([float(v) for v in laspy.open(args.origen).header.mins])

    with laspy.open(args.origen) as f:
        for trozo in f.chunk_iterator(4_000_000):
            tx = np.asarray(trozo.x, dtype=np.float64)
            ty = np.asarray(trozo.y, dtype=np.float64)
            tz = np.asarray(trozo.z, dtype=np.float64)
            leidos += tx.size
            tiene_color = hasattr(trozo, "red")

            if args.celda > 0:
                # Las tres celdas empaquetadas en un solo `int64`: 21 bits por eje. Deduplicar
                # sobre un vector es un orden de magnitud más rápido que sobre una matriz de tres
                # columnas, y reserva un tercio.
                #
                # **El índice se cuenta desde el mínimo de la cabecera**, no desde el cero
                # absoluto: en UTM la coordenada norte partida por 2 cm son 314 millones, que **no
                # cabe en 21 bits** y el empaquetado se solaparía en silencio —dos celdas distintas
                # con la misma clave, o sea puntos descartados por error—. Restado el origen, el
                # índice máximo de esta nube es 7 200: sobra sitio hasta 2 097 151, que son 42 km
                # con celdas de 2 cm.
                cx = np.floor((tx - origen[0]) / args.celda).astype(np.int64)
                cy = np.floor((ty - origen[1]) / args.celda).astype(np.int64)
                cz = np.floor((tz - origen[2]) / args.celda).astype(np.int64)
                if max(int(cx.max()), int(cy.max()), int(cz.max())) >= (1 << 21):
                    raise SystemExit(
                        "la celda es demasiado fina para esta nube: el indice no cabe en 21 bits"
                    )
                empaque = (cx << 42) | (cy << 21) | cz

                # Primero se deduplica dentro del trozo, y luego contra lo ya ocupado.
                unicas, primeros = np.unique(empaque, return_index=True)
                nuevas = (
                    ~np.isin(unicas, ocupadas, assume_unique=True)
                    if ocupadas.size
                    else np.ones(unicas.size, dtype=bool)
                )
                guardar = np.sort(primeros[nuevas])
                ocupadas = np.union1d(ocupadas, unicas[nuevas])
            else:
                guardar = np.arange(tx.size)

            if guardar.size == 0:
                continue
            trozos_x.append(tx[guardar])
            trozos_y.append(ty[guardar])
            trozos_z.append(tz[guardar])
            trozos_i.append(np.asarray(trozo.intensity)[guardar])
            trozos_c.append(np.asarray(trozo.classification)[guardar])
            if tiene_color:
                trozos_rgb.append(
                    np.stack(
                        [
                            np.asarray(trozo.red)[guardar],
                            np.asarray(trozo.green)[guardar],
                            np.asarray(trozo.blue)[guardar],
                        ],
                        axis=1,
                    )
                )
            print(
                f"  {leidos:,} leidos · {sum(t.size for t in trozos_x):,} guardados"
                f" · {time.perf_counter() - t0:.0f} s"
            )

    x = np.concatenate(trozos_x)
    y = np.concatenate(trozos_y)
    z = np.concatenate(trozos_z)
    intensidad = np.concatenate(trozos_i)
    clase = np.concatenate(trozos_c)
    rgb = np.concatenate(trozos_rgb) if tiene_color else None
    rojo = rgb[:, 0] if rgb is not None else None
    verde = rgb[:, 1] if rgb is not None else None
    azul = rgb[:, 2] if rgb is not None else None
    del trozos_x, trozos_y, trozos_z, trozos_i, trozos_c, trozos_rgb, ocupadas

    n = x.size
    print(
        f"\nleida y diezmada en {time.perf_counter() - t0:.0f} s: "
        f"{n:,} de {leidos:,} puntos ({n / leidos * 100:.1f} %)"
    )

    # --- 3. El octree, repartido por el espacio ---------------------------------------
    lado = max(float(x.max() - x.min()), float(y.max() - y.min()), float(z.max() - z.min()))
    centro = np.array(
        [
            float((x.min() + x.max()) / 2),
            float((y.min() + y.max()) / 2),
            float((z.min() + z.max()) / 2),
        ]
    )
    cubo_min = centro - lado / 2

    print(f"\ncubo del octree: {lado:.2f} m de lado · espaciado en la raiz: {lado / GRILLA:.3f} m")

    t0 = time.perf_counter()
    profundidad = np.full(n, -1, dtype=np.int8)
    sin_colocar = np.arange(n)
    for d in range(PROFUNDIDAD_MAXIMA + 1):
        if sin_colocar.size == 0:
            break
        celda = lado / (GRILLA * (2**d))
        indices = np.floor(
            (np.stack([x[sin_colocar], y[sin_colocar], z[sin_colocar]], axis=1) - cubo_min) / celda
        ).astype(np.int64)
        _, primeros = np.unique(indices, axis=0, return_index=True)
        profundidad[sin_colocar[primeros]] = d
        sin_colocar = np.delete(sin_colocar, primeros)
        print(f"  nivel {d}: {primeros.size:,} puntos · quedan {sin_colocar.size:,}")

    # Lo que sobre va al nivel mas profundo: **no se tira ni un punto**.
    if sin_colocar.size:
        profundidad[sin_colocar] = PROFUNDIDAD_MAXIMA
        print(f"  al nivel {PROFUNDIDAD_MAXIMA} van {sin_colocar.size:,} que no cupieron antes")
    print(f"reparto en {time.perf_counter() - t0:.1f} s")

    # La clave de nodo: en que octante cae cada punto, a su profundidad. Vectorizado por nivel.
    claves = np.empty((n, 4), dtype=np.int64)
    claves[:, 0] = profundidad
    for d in np.unique(profundidad):
        cuales = profundidad == d
        ancho = lado / (2 ** int(d))
        for eje, coord in enumerate((x, y, z)):
            celda = np.floor((coord[cuales] - cubo_min[eje]) / ancho).astype(np.int64)
            claves[cuales, eje + 1] = np.clip(celda, 0, 2 ** int(d) - 1)

    # --- 4. Escribir -------------------------------------------------------------------
    # Formato 7 -posicion, intensidad, clase y RGB- si hay color; 6 si no. Son los formatos que
    # admite COPC, y llevan justo lo que el visor usa.
    formato = 7 if tiene_color else 6
    escala = 0.001  # milimetro: es la precision que promete un levantamiento, y basta
    cfg = copc.CopcConfigWriter(
        formato,
        copc.Vector3(escala, escala, escala),
        copc.Vector3(float(np.floor(x.min())), float(np.floor(y.min())), float(np.floor(z.min()))),
        wkt,
    )
    cfg.las_header.min = copc.Vector3(float(x.min()), float(y.min()), float(z.min()))
    cfg.las_header.max = copc.Vector3(float(x.max()), float(y.max()), float(z.max()))
    cfg.copc_info.center_x = float(centro[0])
    cfg.copc_info.center_y = float(centro[1])
    cfg.copc_info.center_z = float(centro[2])
    cfg.copc_info.halfsize = lado / 2
    cfg.copc_info.spacing = lado / GRILLA

    args.destino.parent.mkdir(parents=True, exist_ok=True)
    escritor = copc.FileWriter(str(args.destino), cfg)
    cabecera = escritor.copc_config.las_header

    # Agrupar por clave, ordenando: `np.unique` sobre las filas da los grupos de una vez.
    filas, inverso = np.unique(claves, axis=0, return_inverse=True)
    orden = np.argsort(inverso, kind="stable")
    cortes = np.searchsorted(inverso[orden], np.arange(filas.shape[0] + 1))

    t0 = time.perf_counter()
    print(f"\nescribiendo {filas.shape[0]:,} nodos...")
    for k in range(filas.shape[0]):
        indices = orden[cortes[k] : cortes[k + 1]]
        puntos = copc.Points(cabecera)
        for i in indices:
            p = puntos.CreatePoint()
            p.x = float(x[i])
            p.y = float(y[i])
            p.z = float(z[i])
            p.intensity = int(intensidad[i])
            p.classification = int(clase[i])
            if tiene_color:
                p.red = int(rojo[i])
                p.green = int(verde[i])
                p.blue = int(azul[i])
            puntos.AddPoint(p)
        d, cx, cy, cz = (int(v) for v in filas[k])
        escritor.AddNode(copc.VoxelKey(d, cx, cy, cz), puntos)
        if (k + 1) % 500 == 0:
            print(f"  {k + 1:,} de {filas.shape[0]:,} nodos · {time.perf_counter() - t0:.0f} s")
    escritor.Close()
    print(f"escrito en {time.perf_counter() - t0:.0f} s")
    print(f"destino: {args.destino} ({args.destino.stat().st_size / 1e6:.1f} MB)")

    # --- Y se comprueba lo escrito -----------------------------------------------------
    lector = copc.FileReader(str(args.destino))
    leida = lector.copc_config.las_header
    nodos = lector.GetAllNodes()
    assert leida.point_count == n, f"puntos: {leida.point_count} != {n}"
    assert sum(nd.point_count for nd in nodos) == n, "se perdieron puntos entre los nodos"

    # Que cada punto caiga en la caja de su nodo, en una muestra de nodos: es la propiedad de la
    # que depende que el recorte por vista sea correcto. Se muestrea porque comprobarlos todos en
    # una nube grande tarda mas que escribirla.
    generador = np.random.default_rng(0)
    muestra = generador.choice(len(nodos), size=min(40, len(nodos)), replace=False)
    for j in muestra:
        nd = nodos[int(j)]
        ancho = lado / (2**nd.key.d)
        caja_min = cubo_min + np.array([nd.key.x, nd.key.y, nd.key.z]) * ancho
        pts = lector.GetPoints(nd)
        cs = np.stack([np.array(pts.x), np.array(pts.y), np.array(pts.z)], axis=1)
        holgura = escala * 2
        assert (cs >= caja_min - holgura).all(), f"nodo {nd.key.d}: puntos por debajo de su caja"
        assert (cs <= caja_min + ancho + holgura).all(), f"nodo {nd.key.d}: puntos por encima"

    # **Puntos por nodo: la cifra que decide si el visor va suelto o a tirones.** Cada nodo es una
    # petición de rango, así que nodos pequeños son muchas idas y venidas para pocos puntos. La
    # referencia de PotreeConverter y PDAL son 50 000 a 100 000; por debajo de unos pocos miles,
    # conviene subir `GRILLA`.
    por_nodo = n / len(nodos)
    print(
        f"\ncomprobado: {n:,} puntos, {len(nodos):,} nodos hasta el nivel {lector.GetMaxDepth()}, "
        f"y en {len(muestra)} nodos al azar cada punto dentro de su caja"
    )
    print(
        f"puntos por nodo: {por_nodo:,.0f}"
        + (
            "  ← MUY BAJO: sube GRILLA, o el visor hara miles de peticiones para pocos puntos"
            if por_nodo < 5_000
            else "  (la referencia son 50.000 a 100.000)"
        )
    )
    print(f"CRS en el archivo: {'si' if lector.copc_config.wkt else 'NO'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
