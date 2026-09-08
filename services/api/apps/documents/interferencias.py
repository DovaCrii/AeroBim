"""Detectar interferencias con `ifcclash`: `F5.2`.

**`ifcclash` se usa como libreria y no se copia una linea**, que es exactamente lo que `AGENTS.md`
permite con LGPL-3.0: enlazar si, portar no. Lo que hay aca es el envoltorio — traducir nuestros
grupos de comparacion a su vocabulario, y traducir sus resultados al nuestro.

## Las tres cosas que se midieron antes de escribir esto

**1. El oraculo funciona.** Sobre `interferencias-a-proposito.ifc` —un muro y cuatro pilares con las
coordenadas escritas en el propio archivo— encuentra **exactamente el pilar que cruza el muro**:
descarta el que esta tres metros al este, descarta el que tiene la misma huella en planta pero esta
un metro mas arriba —o sea que compara volumenes y no plantas— y descarta el que apoya contra la
cara sin penetrar. Con el roce admitido, ese ultimo aparece. Es la prueba de que el parametro hace
lo que dice.

**2. Tarda de verdad.** Medido:

| Comparacion                                        | Tiempo    | Interferencias |
| -------------------------------------------------- | --------- | -------------- |
| El fixture (1 muro vs 4 pilares)                   | 30 ms     | 1              |
| `Piso 5`: 470 proxies vs 10 puertas                | 431 ms    | 6              |
| El grande: 805 `IfcMember` vs 34 `IfcColumn`       | **15,7 s** | 3             |
| Cruzando los dos: 470 proxies vs 805 `IfcMember`   | **20,0 s** | 35            |

Veinte segundos **dentro de una peticion no se sostienen**, y es el primer trabajo de este
repositorio que se acerca al umbral de 30 s que dejo escrito `F3.4`. Por eso la corrida entra por un
comando de gestion y no por una vista: ver `detectar_interferencias`.

**3. Dos trampas de la libreria, que no dan un error legible.**

- **Un grupo vacio la hace reventar** con `TypeError: Attribute of type AGGREGATE OF STRING needs a
  python sequence of strs`, que no menciona los selectores ni los grupos. Pasa cuando un selector no
  encuentra nada — y pasa facil: `Piso 5.ifc` **no tiene un solo `IfcWall`**, son 470
  `IfcBuildingElementProxy`. Aca se comprueba antes y se dice cual de los dos grupos esta vacio.
- **El modo `intersection` exige `check_all`** y sin esa clave lanza un `AssertionError` **sin
  mensaje**, desde un `assert` de la libreria. Se pasa siempre.
"""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("aerobim.jobs")

#: Modo de comparacion. Son los dos que sirven, de los tres que ofrece la libreria.
#:
#: - `collision`: se cruzan los volumenes. Con `admitir_roce` en falso, dos caras que coinciden sin
#:   penetrar **no** son un conflicto — que es lo que pasa cuando el modelador apoya un pilar contra
#:   un muro, y en obra no es un problema.
#: - `intersection`: lo mismo con una tolerancia en metros, para exigir una penetracion minima.
COLISION = "collision"
INTERSECCION = "intersection"

#: Penetracion minima por defecto, en metros. Dos milimetros: por debajo de eso es ruido de malla.
TOLERANCIA_POR_DEFECTO_M = 0.002


class GrupoVacio(Exception):
    """Un lado de la comparacion no tiene ningun elemento.

    **Es un error de quien pide la comparacion, no de la libreria**, y por eso tiene su propia
    excepcion: `ifcclash` lo convierte en un `TypeError` sobre secuencias de cadenas que no menciona
    ni los grupos ni los selectores, y con eso nadie encuentra que el problema era el filtro.
    """


@dataclass(frozen=True)
class Grupo:
    """Un lado de la comparacion: un archivo y qué se mira de él. `F5.1` en su forma minima.

    El `selector` es la consulta de IfcOpenShell —`IfcWall`, `IfcMember`, o algo mas fino— y es lo
    que define el grupo. Comparar dos disciplinas es comparar dos archivos; comparar dentro de una,
    dos selectores del mismo.
    """

    ruta: Path
    selector: str


@dataclass(frozen=True)
class Interferencia:
    """Un conflicto, ya traducido a nuestro vocabulario.

    **Los dos puntos son lo que se dibuja en el viewpoint** (`F4.5`): el segmento entre ellos es el
    marcado que viaja en el BCF, y llega ya en coordenadas del modelo porque es donde `ifcclash`
    trabaja.
    """

    guid_a: str
    guid_b: str
    clase_a: str
    clase_b: str
    nombre_a: str
    nombre_b: str
    #: `[x, y, z]` en metros del sistema del IFC.
    punto_a: list[float]
    punto_b: list[float]
    distancia: float


def _cuantos(grupo: Grupo) -> int:
    """Cuántos elementos trae el grupo. Se abre el archivo solo para contar."""
    import ifcopenshell
    from ifcopenshell.util.selector import filter_elements

    archivo = ifcopenshell.open(str(grupo.ruta))
    return len(filter_elements(archivo, grupo.selector))


def detectar(
    a: Grupo,
    b: Grupo,
    *,
    modo: str = COLISION,
    admitir_roce: bool = False,
    tolerancia_m: float = TOLERANCIA_POR_DEFECTO_M,
) -> list[Interferencia]:
    """Las interferencias entre los dos grupos.

    Lanza `GrupoVacio` si un lado no tiene elementos — ver el docstring del modulo: dejarlo pasar
    produce un error de tipos que no menciona ni los grupos ni los selectores.
    """
    from ifcclash.ifcclash import Clasher, ClashSettings

    for etiqueta, grupo in (("A", a), ("B", b)):
        if _cuantos(grupo) == 0:
            raise GrupoVacio(
                f"El grupo {etiqueta} no tiene ningun elemento: «{grupo.selector}» no encuentra "
                f"nada en {grupo.ruta.name}."
            )

    ajustes = ClashSettings()
    ajustes.logger = logger
    # La libreria escribe su informe en un archivo aunque no se le pida. Va a un temporal que se
    # borra: lo que nos interesa vuelve en memoria, dentro del propio conjunto.
    with tempfile.TemporaryDirectory() as temporal:
        ajustes.output = str(Path(temporal) / "clashes.json")
        clasher = Clasher(ajustes)

        conjunto: dict = {
            "name": f"{a.selector} vs {b.selector}",
            "a": [{"file": str(a.ruta), "mode": "i", "selector": a.selector}],
            "b": [{"file": str(b.ruta), "mode": "i", "selector": b.selector}],
            "mode": modo,
        }
        if modo == COLISION:
            conjunto["allow_touching"] = admitir_roce
        else:
            # **`check_all` va siempre.** Sin esa clave la libreria lanza un `AssertionError` sin
            # mensaje, desde un `assert` propio: es la clase de fallo que cuesta media hora.
            conjunto["tolerance"] = tolerancia_m
            conjunto["check_all"] = True

        clasher.clash_sets = [conjunto]
        clasher.clash()

        crudas = conjunto.get("clashes") or {}

    return [
        Interferencia(
            guid_a=str(c.get("a_global_id") or ""),
            guid_b=str(c.get("b_global_id") or ""),
            clase_a=str(c.get("a_ifc_class") or ""),
            clase_b=str(c.get("b_ifc_class") or ""),
            nombre_a=str(c.get("a_name") or ""),
            nombre_b=str(c.get("b_name") or ""),
            punto_a=[float(v) for v in (c.get("p1") or [0, 0, 0])],
            punto_b=[float(v) for v in (c.get("p2") or [0, 0, 0])],
            distancia=float(c.get("distance") or 0.0),
        )
        for c in crudas.values()
    ]


def identidad(uno: Interferencia) -> str:
    """La pareja de GUID sin orden, que es la identidad de una interferencia. `F5.5`.

    **Es la misma regla que `identidadDeInterferencia` de `bim-core`**, y esta escrita dos veces a
    proposito: el visor la necesita para agrupar y el servidor para no reabrir un conflicto ya
    descartado. Son dos lineas y una prueba a cada lado; compartirla obligaria a un viaje de red
    para contestar «¿es este el mismo?».

    Devuelve cadena vacia si la pareja no sirve como identidad: sin GUID no se puede volver a
    encontrar el conflicto en la corrida siguiente, asi que tampoco se puede descartar.
    """
    a, b = uno.guid_a, uno.guid_b
    if not a or not b or a == b:
        return ""
    return f"{a}·{b}" if a < b else f"{b}·{a}"
