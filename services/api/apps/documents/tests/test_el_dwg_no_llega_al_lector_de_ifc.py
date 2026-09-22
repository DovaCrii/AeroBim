"""**Un DWG soltado en el visor tumbaba el WebAssembly, y el aviso no decía nada.**

Lo que se veía arriba en la cinta, en rojo, con cero modelos cargados:

    memory access out of bounds

## De dónde salía

Del repartidor de `apps/web/src/App.tsx`, cuya última línea era —con su propio comentario— un
«todo lo demás se intenta como IFC». Y «todo lo demás» incluía el DWG: `web-ifc` espera texto STEP,
un DWG es binario, el lector recorre memoria ajena y el WASM se cae. El `accept` del selector no
protegía, porque filtra el diálogo y no el arrastre.

No es un fallo del archivo ni del producto: `docs/FORMATOS.md` decide y documenta que AeroBim lee
IFC, DXF y COPC, y que el único lector abierto de DWG es GPL-3 y contagiaría la licencia. Lo que
faltaba era **decirlo** en vez de caerse.

## Por qué el guardián vive aquí y no en el visor

Porque lo que se puede romper en silencio es **la costura entre las dos mitades**. `abribles.py` ya
sabe qué extensión abre cada visor y cuáles solo se abren por su DXF convertido; el cliente acaba de
aprender lo mismo en `packages/viewer/src/formatos.ts`. Son dos archivos que dicen lo mismo en dos
idiomas, y eso diverge: la prueba de vitest comprueba que el módulo del cliente decide bien, pero no
que decida **lo que el servidor sabe**, ni que `App.tsx` llegue a preguntárselo.

Es el mismo patrón que ya sujeta `testigoCompartido` contra su equivalente de Python
(`test_las_cookies.py`) y la escala del visor contra la del portal (`test_sistema_de_diseno.py`).
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

from apps.documents.abribles import POR_SU_DXF, VISOR_MODELO, VISOR_POR_EXTENSION

APP = Path(settings.REPO_DIR) / "apps" / "web" / "src" / "App.tsx"
FORMATOS = Path(settings.REPO_DIR) / "packages" / "viewer" / "src" / "formatos.ts"


def _sin_comentarios(ruta: Path) -> str:
    """El código sin su prosa.

    **Sin esto, la prueba mediría los comentarios.** Los dos archivos citan el código antiguo para
    explicar qué se arregló —`return openIfc(file)` aparece literalmente en la explicación— así que
    un barrido ingenuo denunciaría el texto que documenta el arreglo. Misma cautela que toman el
    guardián de plantillas y el de la escala visual.
    """
    texto = ruta.read_text(encoding="utf-8")
    return re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)


def _cerrados_del_cliente() -> set[str]:
    """Las extensiones que `formatos.ts` rechaza, leídas de su tabla `CERRADOS`."""
    cuerpo = re.search(r"const CERRADOS[^{]*\{(.*?)\n\};", _sin_comentarios(FORMATOS), re.DOTALL)
    assert cuerpo is not None, "no se encontró la tabla `CERRADOS` en formatos.ts"
    return set(re.findall(r"^\s*([a-z0-9]+):", cuerpo.group(1), re.MULTILINE))


def test_el_repartidor_pregunta_antes_de_abrir():
    """**El defecto, literal.** Mientras `openFile` no consulte, un DWG llega a `web-ifc`."""
    codigo = _sin_comentarios(APP)
    repartidor = re.search(r"const openFile = useCallback\((.*?)\n  \);", codigo, re.DOTALL)

    assert repartidor is not None, "no se encontró `openFile` en App.tsx"
    cuerpo = repartidor.group(1)
    assert "queHacerCon" in cuerpo, (
        "`openFile` reparte por su cuenta: lo que no reconoce acaba en el lector de IFC y el WASM "
        "se cae con `memory access out of bounds`"
    )
    assert "no-se-puede" in cuerpo, "`openFile` no atiende el caso de lo que no se puede leer"


def test_el_cliente_rechaza_todo_lo_que_el_servidor_convierte():
    """Lo que el registro convierte a DXF **no lo lee el visor por sí mismo**.

    Si `abribles.py` aprende mañana un formato cerrado más y el cliente no se entera, ese formato
    vuelve a caer en el lector de IFC por la puerta de atrás.
    """
    faltan = POR_SU_DXF - _cerrados_del_cliente()

    assert faltan == set(), (
        f"el visor no rechaza {sorted(faltan)}, que el servidor sabe que solo se abren por su DXF: "
        "acabarían en el lector de IFC"
    )


@pytest.mark.parametrize(
    "extension",
    sorted(e for e, visor in VISOR_POR_EXTENSION.items() if visor == VISOR_MODELO),
)
def test_lo_que_el_visor_si_abre_no_esta_rechazado(extension):
    """**La otra mitad, y la que rompería algo que hoy funciona.**

    Una lista de rechazo que se pase de celosa deja de abrir el IFC o el DXF que el registro sirve
    —y eso sí sería una regresión, no un aviso.
    """
    assert extension not in _cerrados_del_cliente(), (
        f"`.{extension}` se abre en el visor y el cliente lo está rechazando"
    )
