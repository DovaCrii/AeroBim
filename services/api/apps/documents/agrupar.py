"""Agrupar interferencias vecinas: **la mitad que le quedaba a `F5.5`**.

**Veinte tornillos contra la misma viga son un problema, no veinte.** El silenciado —descartar un
falso positivo y que la corrida siguiente no lo reabra— cerro la mitad que decide si la herramienta
se usa una segunda vez. Esta es la otra: una corrida que devuelve treinta y cinco filas cuando hay
cuatro problemas no se tria, se abandona. Repartir veinte observaciones de la misma union
atornillada entre cuatro personas es peor que no repartir nada.

## La regla, y por que tiene dos mitades

Dos interferencias son **el mismo problema** cuando cumplen las dos cosas:

1. **Comparten un elemento.** Sin esto, dos conflictos distintos que caen cerca —un conducto que
   cruza un muro y, medio metro mas alla, una tuberia que cruza otro— se colapsarian en uno. Son dos
   problemas, los resuelven dos personas.
2. **Sus puntos de contacto estan cerca.** Sin esto, un muro de cuarenta metros que choca con ocho
   instalaciones repartidas por toda la planta seria **un** problema, y no lo es: cada choque esta
   en un sitio distinto de la obra y se resuelve en una visita distinta.

Se usa el **punto medio** del segmento de contacto y no uno de sus extremos: los dos extremos son la
cara de cada elemento, asi que el medio es el unico que no depende de cual de los dos se leyo
primero.

## Que se elige como representante, y por que no es el mas grande

El cumulo se abre como **una** observacion, asi que hay que elegir de que pareja de GUID lleva la
identidad. Se elige **la identidad que ordena primero**, no la de mayor separacion ni la mas
centrada: la separacion es un `float` que se mueve con la malla, con la tolerancia y con la version
de la libreria, y un representante que baila abre una observacion nueva en cada corrida. Los GUID no
se mueven.

**Y de aqui sale un caso que no se resuelve bien y va dicho.** El cumulo se reconoce en la corrida
siguiente porque **alguna** de sus parejas ya tiene observacion. Si lo que se corrige es justo la
pareja representante y el resto del cumulo sigue chocando, el cumulo nuevo ya no coincide con nada y
se abre por segunda vez, mientras la primera queda apuntando a una pareja que ya no choca. Es el
precio de no guardar las parejas del cumulo en una tabla propia; la alternativa —un modelo mas y su
migracion— no se paga hasta que el caso aparezca sobre una obra de verdad.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import dist

from apps.documents.interferencias import Interferencia, identidad

#: Cuan cerca tienen que estar dos contactos para ser el mismo problema, en metros.
#:
#: **Un metro, y es una cifra medida.** Sobre el par real de la organizacion —470
#: `IfcBuildingElementProxy` de `Piso 5.ifc` contra 805 `IfcMember` del modelo de instalaciones, la
#: corrida de unos veinte segundos que devuelve **35 interferencias**— asi se comporta el radio:
#:
#: | Radio  | Cumulos | El mayor  | Lo que dice                                          |
#: | ------ | ------- | --------- | ---------------------------------------------------- |
#: | 0,00 m | 35      | 1 miembro | sin agrupar: es de donde se viene                    |
#: | 0,10 m | 27      | 6         | solo lo que practicamente se toca                    |
#: | 0,25 m | 22      | 6         |                                                      |
#: | 0,50 m | 20      | 6         |                                                      |
#: | 1,00 m | **13**  | **6**     | **el elegido**                                       |
#: | 2,00 m | 8       | 17        | un cumulo se come la mitad de la corrida             |
#: | 5,00 m | 5       | 22        | y de aqui ya no baja: 22 de 35 en una sola fila      |
#:
#: **De 35 a 13, y el cumulo mas grande sigue siendo de 6.** Es un tercio de las filas que triar sin
#: que ninguna deje de ser un problema que se resuelve de una vez.
#:
#: **Y a los dos metros no se agrupa mas: se derrumba.** La union es transitiva —si A y B son
#: vecinas y B y C tambien, las tres caen en el mismo cumulo aunque A y C esten lejos—, asi que
#: pasado un punto los cumulos se encadenan por la obra entera: a 2 m el mayor salta de 6 a 17
#: miembros, y a 5 m son 22 de las 35. Eso ya no es «un problema», es una lista con otro nombre. El
#: metro esta justo antes de ese salto, y esa es la razon de elegirlo — no que la curva se aplane.
#:
#: **Y agrupar no cuesta nada**: 0,1 ms sobre esas 35 interferencias, contra los veinte segundos que
#: tarda encontrarlas. La cifra importa por lo que descarta: no hay que decidir si esto entra en la
#: peticion o en una cola, porque al lado de la deteccion no se mide.
RADIO_POR_DEFECTO_M = 1.0

#: Tope de miembros que se guardan como marcado del cumulo.
#:
#: **El mismo que `marcado.MAXIMO_LINEAS`**, porque es exactamente ahi donde acaban: un segmento por
#: interferencia dentro del viewpoint.
MAXIMO_MARCADO = 200


def _centro(una: Interferencia) -> tuple[float, float, float]:
    """El punto medio del segmento de contacto.

    Ver el docstring del modulo: los dos extremos son la cara de cada elemento, asi que el medio es
    el unico que no depende de cual se leyo primero.
    """
    a, b = una.punto_a, una.punto_b
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)


@dataclass(frozen=True)
class Cumulo:
    """Un problema, hecho de una o varias interferencias vecinas."""

    miembros: tuple[Interferencia, ...]

    @property
    def principal(self) -> Interferencia:
        """La interferencia que le presta su identidad al cumulo.

        **La que ordena primero por identidad**, que es lo unico estable entre corridas. Ver el
        docstring del modulo.
        """
        return min(self.miembros, key=identidad)

    @property
    def identidades(self) -> tuple[str, ...]:
        """Las parejas del cumulo, ordenadas. Es con lo que se pregunta si ya se conocia."""
        return tuple(sorted({identidad(una) for una in self.miembros} - {""}))

    @property
    def parejas(self) -> int:
        """Cuantos conflictos **distintos** trae el cumulo.

        **No es lo mismo que `len(miembros)`, y la diferencia se ve en la lista.** La deteccion
        informa el mismo conflicto dos veces cuando los dos modelos comparten GUID, asi que un
        cumulo de dos miembros puede ser un unico problema: titularlo «A × B y 1 mas» seria contar
        dos veces lo mismo delante de quien lo tiene que resolver.
        """
        return len(self.identidades) or len(self.miembros)

    @property
    def elementos(self) -> tuple[str, ...]:
        """Los GUID de todo lo que entra en el cumulo, **sin repetir y en orden estable**.

        Es lo que se aisla al abrir la observacion: el problema entero en pantalla y nada mas.
        """
        vistos: dict[str, None] = {}
        for una in self.miembros:
            for guid in (una.guid_a, una.guid_b):
                if guid:
                    vistos.setdefault(guid, None)
        return tuple(vistos)

    @property
    def compartido(self) -> str:
        """El elemento que esta en **todos** los miembros, o `""` si no hay exactamente uno.

        Es la viga de los veinte tornillos, y es lo que permite titular el cumulo por lo que de
        verdad hay que ir a mirar. Con un solo conflicto no hay compartido que valga: los dos lo
        estan, y no dice nada.
        """
        if self.parejas < 2:
            return ""
        comunes = set(self.elementos)
        for una in self.miembros:
            comunes &= {una.guid_a, una.guid_b}
        return next(iter(sorted(comunes))) if len(comunes) == 1 else ""

    def nombre(self, guid: str) -> str:
        """Como se llama un elemento del cumulo: su nombre, o su clase IFC cuando no tiene.

        Misma regla que `tituloDeInterferencia` de `bim-core`. Sirve para titular el cumulo por el
        elemento compartido, que es lo que hay que ir a mirar.
        """
        for una in self.miembros:
            if una.guid_a == guid:
                return (una.nombre_a or "").strip() or (una.clase_a or "").strip()
            if una.guid_b == guid:
                return (una.nombre_b or "").strip() or (una.clase_b or "").strip()
        return ""

    @property
    def marcado(self) -> list[dict]:
        """Un segmento **por conflicto distinto**, que es el marcado del viewpoint. `F4.5`.

        **Todos y no solo el del representante**: dibujar un unico segmento de un cumulo de veinte
        afirma que el problema esta en un punto, y esta a lo largo de la union entera.

        **Y uno por pareja, no uno por informe.** La deteccion informa el mismo conflicto dos veces
        cuando los dos modelos comparten GUID, y entonces se dibujarian dos segmentos de la misma
        interseccion — cuarenta lineas para veinte tornillos. Se queda el primero de cada pareja.
        """
        lineas: list[dict] = []
        vistas: set[str] = set()
        for una in self.miembros:
            clave = identidad(una)
            if clave and clave in vistas:
                continue
            if clave:
                vistas.add(clave)
            lineas.append({"inicio": una.punto_a, "fin": una.punto_b})
            if len(lineas) == MAXIMO_MARCADO:
                break
        return lineas


def _vecinas(a: Interferencia, b: Interferencia, radio_m: float) -> bool:
    """La regla, en el orden que descarta antes.

    Primero comparten elemento —una comparacion de cadenas— y solo despues la distancia, que son
    tres restas y una raiz. Con un cumulo de quinientos miembros la diferencia se nota.
    """
    # **La misma pareja de GUID es siempre el mismo problema, y la distancia no opina.** No es un
    # atajo: la deteccion informa el mismo conflicto **dos veces** cuando los dos modelos comparten
    # GUID —A contra B y B contra A—, y cada informe trae una cara distinta del contacto. Medido
    # sobre `interferencias-a-proposito.ifc`: los dos centros del mismo muro contra el mismo pilar
    # caen a **1,95 m** uno del otro. Con la proximidad sola quedaban como dos problemas.
    identidad_a = identidad(a)
    if identidad_a and identidad_a == identidad(b):
        return True

    if not {a.guid_a, a.guid_b} & {b.guid_a, b.guid_b}:
        return False
    return dist(_centro(a), _centro(b)) <= radio_m


def agrupar(
    interferencias: list[Interferencia], *, radio_m: float = RADIO_POR_DEFECTO_M
) -> list[Cumulo]:
    """Los cumulos de una corrida, cada uno un problema.

    Con `radio_m` en cero se apaga la agrupacion por proximidad y queda **un cumulo por pareja de
    GUID**, que es el comportamiento de antes de que esto existiera. No es «un cumulo por
    interferencia»: la misma pareja informada dos veces sigue siendo un problema, y eso no depende
    del radio. Sirve para medir cuanto agrupa la proximidad y para apagarla sin tocar el codigo que
    llama.

    **Las que no tienen identidad se dejan pasar como cumulos de una.** No se pueden reconocer en la
    corrida siguiente, y quien las descarta es `revisar_proyecto`: agrupar no es el sitio donde se
    decide que entra.
    """
    total = len(interferencias)
    if total == 0:
        return []

    # Union-find con compresion de caminos. Sin la compresion, un cumulo largo se recorre entero en
    # cada consulta y el coste pasa de casi lineal a cuadratico.
    padre = list(range(total))

    def raiz(i: int) -> int:
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    def unir(i: int, j: int) -> None:
        ri, rj = raiz(i), raiz(j)
        if ri != rj:
            padre[max(ri, rj)] = min(ri, rj)

    # **Solo se comparan las que comparten un elemento**, y para eso se agrupan por GUID primero.
    # Comparar todas contra todas seria cuadratico sobre la corrida entera; asi lo es solo dentro de
    # cada cubeta, y una cubeta es «lo que choca contra este elemento».
    cubetas: dict[str, list[int]] = {}
    for indice, una in enumerate(interferencias):
        for guid in (una.guid_a, una.guid_b):
            if guid:
                cubetas.setdefault(guid, []).append(indice)

    for indices in cubetas.values():
        for posicion, i in enumerate(indices):
            for j in indices[posicion + 1 :]:
                if _vecinas(interferencias[i], interferencias[j], radio_m):
                    unir(i, j)

    por_raiz: dict[int, list[Interferencia]] = {}
    for indice, una in enumerate(interferencias):
        por_raiz.setdefault(raiz(indice), []).append(una)

    cumulos = [Cumulo(miembros=tuple(miembros)) for miembros in por_raiz.values()]
    # **Orden estable y no el del diccionario**: el mismo archivo tiene que dar la misma lista, o la
    # prueba de que no se duplica nada depende del orden de iteracion.
    cumulos.sort(key=lambda c: identidad(c.principal))
    return cumulos
