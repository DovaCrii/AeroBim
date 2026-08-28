"""Que trae de verdad cada clase del modelo, y con que cobertura: `F3.10`.

**Es el paso que falta para poder exigir algo.** Subir un IDS y validar contra el ya funciona
(`F3.5`), y lo que no habia era **el archivo**: nadie tiene un IDS escrito para su obra, y
escribirlo a ciegas produce una de dos cosas — un requisito que el modelo ya cumple entero, que no
dice nada, o uno que no cumple en absoluto, que se ignora desde el primer dia.

Asi que primero se mide. Este modulo contesta, clase por clase: cuantos elementos hay, que psets
aparecen, y **en cuantos de ellos**. Con esos numeros el requisito lo decide alguien mirando datos:

- **cobertura alta pero incompleta** —802 de 805 vigas traen `Pset_MemberCommon`— es un requisito
  que el modelo casi cumple, y exigirlo es cerrar una brecha real;
- **cobertura total** no hace falta exigirla: ya se cumple;
- **cobertura cero** seria inventarle al proyecto una exigencia que nadie pidio.

Se lee con `ifcopenshell.util.element.get_psets`, que es quien sabe resolver las relaciones —un pset
puede venir del elemento o **heredado de su tipo**, y contarlos por separado daria cobertura cero en
un modelo bien hecho—.
"""

from collections import Counter
from pathlib import Path

#: Cuantas clases se devuelven. Un IFC federado tiene decenas de clases con un elemento cada una, y
#: el ruido tapa las tres que importan.
TOPE_DE_CLASES = 25

#: Cuantos psets se detallan por clase, del mas frecuente al menos.
TOPE_DE_PSETS = 12

#: Debajo de esto una clase no da para exigir nada: con cuatro elementos, la cobertura es anecdota.
MINIMO_DE_ELEMENTOS = 5

#: La franja en la que un pset **merece ser un requisito**: el modelo casi lo cumple.
#:
#: Por debajo, exigirlo es pedirle al proyecto algo que hoy no hace y que habria que negociar. Por
#: encima, ya se cumple y el requisito no cambia nada. Los dos extremos son requisitos que nadie
#: mira, y eso es peor que no tenerlos: enseñan a ignorar el informe de validacion.
COBERTURA_MINIMA = 0.5
COBERTURA_MAXIMA = 0.999


def medir(ruta: Path) -> dict:
    """La cobertura de psets del modelo, clase por clase.

    Devuelve `{"error": ...}` en vez de levantar, igual que `ifc.py`: un archivo que no se puede
    leer no debe tumbar la pantalla que lo muestra.
    """
    try:
        import ifcopenshell
        import ifcopenshell.util.element
    except ImportError as fallo:  # pragma: no cover - la dependencia esta en el proyecto
        return {"error": f"ifcopenshell no disponible: {fallo}"}

    try:
        archivo = ifcopenshell.open(str(ruta))
    except Exception as fallo:
        return {"error": str(fallo)[:300]}

    # `IfcElement` cubre todo lo que es una pieza construida y deja fuera los contenedores
    # —proyecto, sitio, planta— y las relaciones. Es la pregunta correcta: que trae **lo que se
    # modela**, no cuantas plantas hay.
    try:
        elementos = archivo.by_type("IfcElement")
    except Exception as fallo:
        return {"error": str(fallo)[:300]}

    por_clase: dict[str, dict] = {}
    ilegibles = 0
    for elemento in elementos:
        clase = elemento.is_a().upper()
        acumulado = por_clase.setdefault(clase, {"cuantos": 0, "psets": Counter()})
        acumulado["cuantos"] += 1

        # **Se piden con la herencia del tipo incluida**, que es el comportamiento por defecto:
        # un pset declarado en `IfcBeamType` lo traen todas sus vigas, y contar solo los directos
        # daria cobertura cero en un modelo bien hecho.
        #
        # Un elemento suelto con una relacion rota no puede invalidar la medicion entera, **pero
        # tampoco se calla**: se cuenta y se devuelve. Si fallaron cuatrocientos de ochocientos, la
        # cobertura que sale de aca no significa nada y quien la mire tiene que saberlo — un
        # `except: continue` a secas convierte un archivo roto en una tabla de ceros creible.
        try:
            psets = ifcopenshell.util.element.get_psets(elemento)
        except Exception:
            ilegibles += 1
            psets = {}
        for nombre in psets:
            acumulado["psets"][nombre] += 1

    clases = [
        {
            "clase": clase,
            "cuantos": datos["cuantos"],
            "psets": [
                {
                    "nombre": nombre,
                    "cuantos": veces,
                    "cobertura": round(veces / datos["cuantos"], 4),
                    # **Si merece ser un requisito, y por que.** Es el dato que convierte la tabla
                    # en una decision en vez de una lista de nombres.
                    "candidato": _es_candidato(veces, datos["cuantos"]),
                }
                for nombre, veces in datos["psets"].most_common(TOPE_DE_PSETS)
            ],
        }
        for clase, datos in por_clase.items()
    ]
    # Las clases con mas elementos primero: es donde un requisito tiene mas efecto.
    clases.sort(key=lambda c: -c["cuantos"])

    return {
        "esquema": archivo.schema,
        "elementos": len(elementos),
        "clases": clases[:TOPE_DE_CLASES],
        "clasesOmitidas": max(0, len(clases) - TOPE_DE_CLASES),
        # Cuantos elementos no se pudieron leer. Cero es lo normal; un numero grande dice que la
        # cobertura de arriba no significa nada.
        "ilegibles": ilegibles,
    }


def _es_candidato(veces: int, cuantos: int) -> bool:
    """`True` si ese pset esta en la franja que merece convertirse en requisito.

    Ver {@link COBERTURA_MINIMA}: **alta pero incompleta**. Y con menos de cinco elementos no se
    propone nada — con cuatro vigas, «tres de cuatro» no es una tendencia, es una anecdota.
    """
    if cuantos < MINIMO_DE_ELEMENTOS:
        return False
    cobertura = veces / cuantos
    return COBERTURA_MINIMA <= cobertura <= COBERTURA_MAXIMA
