"""Validacion IDS: **el modelo cumple o no el requisito de informacion del proyecto** (`F3.5`).

`MASTER_PLAN.md` lo dice asi: es lo que separa un visor de una herramienta de control. Revisar a
mano si cada elemento trae el pset que el mandante exigio no escala — 702 vigas por modelo— y un IDS
lo verifica en segundos.

IDS es el estandar de buildingSMART para escribir ese requisito: un XML que declara, para un
conjunto de elementos, que datos tienen que traer. `ifctester` (LGPL-3.0, **usado como libreria**,
que es lo que `AGENTS.md` permite) lo ejecuta.

**Tres decisiones que hacen que el resultado no mienta**, y las tres salieron de mirar el informe
crudo antes de escribir nada:

1. **"No aplica" no es "cumple".** Una especificacion cuyo conjunto de elementos no existe en el
   modelo sale de `ifctester` con `status: True` y `is_skipped: True`. Contarla como cumplida diria
   que el modelo satisface un requisito que **nunca se comprobo**, y es justo el numero que alguien
   mira antes de aprobar una etapa. Aca son tres estados y no dos.
2. **Si no aplico ninguna, no se cumple nada.** Un IDS escrito para otra disciplina da cero
   comprobaciones y "todo bien"; lo que corresponde decir es que no se comprobo nada.
3. **El informe crudo no se guarda.** Son **944 KB** para un modelo de 24 MB: `ifctester` incluye la
   linea STEP completa de cada elemento que falla, 702 veces. Se guarda un resumen con un tope de
   fallos por requisito, y cada fallo lleva su **GUID**, que es la identidad estable y lo que
   permite abrir una observacion sobre ese elemento.
"""

import logging
from pathlib import Path

logger = logging.getLogger("aerobim.jobs")

#: Cuantos elementos fallidos se guardan por requisito.
#:
#: Con 702 vigas fallando, la lista completa son cientos de kilobytes y nadie la lee: se revisan los
#: primeros, se corrige el modelo y se vuelve a validar. El **conteo total va aparte**, asi que la
#: cifra que se informa es la verdadera aunque la lista este recortada.
TOPE_DE_FALLOS = 50

#: Los tres estados de una especificacion. Ver el docstring del modulo.
CUMPLE = "cumple"
FALLA = "falla"
NO_APLICA = "no_aplica"


def titulo_de_ids(contenido: bytes) -> str | None:
    """El titulo que el IDS declara, o `None` si el archivo **no es un IDS legible**.

    Sirve para dos cosas de una: comprobar que el requisito se puede abrir **antes** de guardarlo
    —uno que no se abre no rechaza ni aprueba nada, solo da error en cada validacion— y tomarle el
    nombre, que ya viene escrito dentro. Pedirlo aparte dejaria dos nombres para la misma cosa.

    Devuelve `""` para un IDS valido que no declare titulo, que es distinto de `None`.
    """
    import tempfile

    try:
        from ifctester import ids as idsmod
    except ImportError:  # pragma: no cover - solo si alguien quita la dependencia
        return None

    # `ifctester` abre por ruta y valida contra el XSD al abrir, que es exactamente la comprobacion
    # que hace falta. El temporal se borra siempre.
    with tempfile.NamedTemporaryFile(suffix=".ids", delete=False) as temporal:
        temporal.write(contenido)
        ruta = Path(temporal.name)
    try:
        documento = idsmod.open(str(ruta))
        return str(documento.info.get("title") or "")
    except Exception:
        return None
    finally:
        ruta.unlink(missing_ok=True)


def validar(ruta_ids: Path, ruta_ifc: Path) -> dict:
    """Corre un IDS contra un IFC y devuelve el resumen.

    **Nunca levanta**, por lo mismo que la extraccion de metadatos: un IDS mal formado o un IFC que
    no se puede abrir son un problema del que valida, no del entregable. Se devuelve
    `{"error": ...}` y la pantalla lo dice.
    """
    try:
        import ifcopenshell
        from ifctester import ids as idsmod
        from ifctester import reporter
    except ImportError as falta:  # pragma: no cover - solo si alguien quita la dependencia
        return {"error": f"ifctester no esta instalado: {falta}"}

    try:
        especificacion = idsmod.open(str(ruta_ids))
    except Exception as fallo:
        logger.warning("ids_no_se_pudo_abrir", extra={"recipient": str(ruta_ids), "item_count": 0})
        return {"error": f"no se pudo leer el IDS: {fallo}"}

    try:
        modelo = ifcopenshell.open(str(ruta_ifc))
    except Exception as fallo:
        return {"error": f"no se pudo abrir el IFC: {fallo}"}

    try:
        especificacion.validate(modelo)
        informe = reporter.Json(especificacion)
        informe.report()
        crudo = informe.to_dict() if hasattr(informe, "to_dict") else _desde_json(informe)
    except Exception as fallo:
        logger.warning(
            "ids_no_se_pudo_validar", extra={"recipient": str(ruta_ids), "item_count": 0}
        )
        return {"error": f"la validacion fallo: {fallo}"}

    return _resumir(crudo)


def _desde_json(informe) -> dict:
    import json

    return json.loads(informe.to_string())


def _resumir(crudo: dict) -> dict:
    """El informe de `ifctester`, recortado a lo que se puede guardar y sirve para actuar."""
    especificaciones = [_resumir_una(una) for una in crudo.get("specifications", [])]

    aplicaron = [una for una in especificaciones if una["estado"] != NO_APLICA]
    fallaron = [una for una in aplicaron if una["estado"] == FALLA]

    return {
        "titulo": crudo.get("title") or "",
        # **El veredicto, y las dos condiciones son necesarias.** No basta con que nada falle: si
        # ninguna especificacion aplico, no se comprobo nada y decir que cumple seria inventarlo.
        "cumple": bool(aplicaron) and not fallaron,
        "seComprobo": bool(aplicaron),
        "especificaciones": len(especificaciones),
        "aplicaron": len(aplicaron),
        "fallaron": len(fallaron),
        "noAplicaron": len(especificaciones) - len(aplicaron),
        # Los totales de comprobacion vienen del informe: son por elemento y requisito, no por
        # especificacion, y es la cifra que dice el tamaño real del problema.
        "comprobaciones": crudo.get("total_checks", 0),
        "comprobacionesQuePasan": crudo.get("total_checks_pass", 0),
        "detalle": especificaciones,
    }


def _resumir_una(especificacion: dict) -> dict:
    aplicables = especificacion.get("total_applicable", 0) or 0

    # **El orden de estas tres ramas importa.** `ifctester` marca como `status: True` una
    # especificacion que no aplico a nada, asi que preguntar primero por el estado la contaria como
    # cumplida. Se pregunta primero si aplico.
    if especificacion.get("is_skipped") or aplicables == 0:
        estado = NO_APLICA
    elif especificacion.get("status"):
        estado = CUMPLE
    else:
        estado = FALLA

    return {
        "nombre": especificacion.get("name") or "",
        "estado": estado,
        "aplicables": aplicables,
        "pasan": especificacion.get("total_applicable_pass", 0) or 0,
        "fallan": especificacion.get("total_applicable_fail", 0) or 0,
        "requisitos": [
            _resumir_requisito(uno) for uno in especificacion.get("requirements", []) or []
        ],
    }


def _resumir_requisito(requisito: dict) -> dict:
    fallidos = requisito.get("failed_entities", []) or []
    return {
        # `label` es el nombre corto —"Pset_WallCommon.LoadBearing"— y `description` la frase que el
        # IDS trae para que una persona entienda que se le pide. Se guardan las dos: una para la
        # lista y otra para el detalle.
        "etiqueta": requisito.get("label") or "",
        "descripcion": requisito.get("description") or "",
        "cumple": bool(requisito.get("status")),
        # El conteo va **antes** que la lista y sale del informe, no del largo de la lista: la lista
        # esta recortada y el numero no.
        "totalFallan": len(fallidos),
        "fallos": [_resumir_fallo(uno) for uno in fallidos[:TOPE_DE_FALLOS]],
        "fallosRecortados": max(0, len(fallidos) - TOPE_DE_FALLOS),
    }


def _resumir_fallo(fallo: dict) -> dict:
    """Un elemento que no cumple, con **lo justo para poder actuar sobre el**.

    Se queda fuera `element` y `element_type`, que son la linea STEP completa: cientos de bytes por
    elemento, ilegibles, y de donde ya se extrajo lo util. Lo que se guarda es el **GUID** —la
    identidad estable, la que viaja en un BCF y la que ancla una observacion al modelo—, su clase,
    su nombre y **el motivo**, que es lo que dice que hay que arreglar.
    """
    return {
        "guid": fallo.get("global_id") or "",
        "clase": fallo.get("class") or "",
        "nombre": fallo.get("name") or "",
        "motivo": fallo.get("reason") or "",
    }
