"""Partir un listado **por obra**, para que no se llene de todo.

## De donde sale

Del encargo, literal: *«en esta seccion es importante poder separarlo y diferenciarlo por proyectos
para mantener un orden general de lo que se tiene y a quien esta ligado, y que se pueda colapsar la
lista y no se llene de todo»*.

Con una obra, un listado plano es lo correcto. Con cuatro —que es lo que hay en cuanto el piloto
arranca— una lista de sesenta archivos ordenada por fecha **mezcla cuatro obras** y deja de servir
para lo unico que sirve un repositorio: encontrar algo.

## Dos decisiones

**Se agrupa solo cuando hay mas de una obra.** Con una sola, un unico grupo plegable es un clic de
mas y un titulo que repite lo que ya dice la pagina. Que la pantalla cambie de forma segun lo que
hay no es incoherencia: es que con una obra no hay nada que separar.

**El grupo se pliega con `<details>` nativo.** Sin una linea de JavaScript —que aqui no es gratis:
la CSP no permite `unsafe-inline`— y con el teclado y el lector de pantalla funcionando de fabrica.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GrupoDeObra:
    """Las filas de una obra, con lo que su cabecera necesita decir."""

    codigo: str
    nombre: str
    #: `real`, `prueba` o `demo`. La cabecera pinta la pildora solo si no es real.
    naturaleza: str
    #: Para enlazar a la ficha. Cadena vacia si la fila no lleva la obra completa.
    pk: str
    filas: list = field(default_factory=list)

    @property
    def cuantas(self) -> int:
        return len(self.filas)


def por_obra(filas, de_la_obra) -> list[GrupoDeObra]:
    """Reparte `filas` en grupos, uno por obra, **en el orden en que llegan**.

    `de_la_obra` saca el `Proyecto` de una fila: cada listado lo tiene a distinta profundidad —el
    repositorio en `revision.entregable.proyecto`, los transmittals en `transmittal.proyecto`— y
    resolverlo aqui con `getattr` encadenados seria adivinar.

    **No se reordena nada.** Cada listado ya decidio su orden —lo mas reciente primero, por codigo,
    por vencimiento— y reordenar aqui lo tiraria sin que se note. Lo unico que cambia es que las
    filas de una misma obra quedan juntas.

    Una fila sin obra va a un grupo propio al final, y no se descarta: si hay veinte sin asignar,
    eso es justamente lo que hay que ver.
    """
    grupos: dict[str, GrupoDeObra] = {}
    for fila in filas:
        obra = de_la_obra(fila)
        clave = str(obra.pk) if obra is not None else ""
        grupo = grupos.get(clave)
        if grupo is None:
            grupo = GrupoDeObra(
                codigo=obra.codigo if obra is not None else "",
                nombre=obra.nombre if obra is not None else "",
                naturaleza=getattr(obra, "naturaleza", "") if obra is not None else "",
                pk=clave,
            )
            grupos[clave] = grupo
        grupo.filas.append(fila)

    # Las que tienen obra primero y por codigo; las sueltas, al final.
    return sorted(grupos.values(), key=lambda g: (g.codigo == "", g.codigo))
