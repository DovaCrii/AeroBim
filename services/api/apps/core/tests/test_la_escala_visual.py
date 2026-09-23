"""**La escala existe o no existe; no puede existir «casi».**

`docs/DESIGN_SYSTEM.md` norma nueve ejes desde su primer dia. Medido el 2026-09-16:
`apps/web/src/index.css` —el visor— los cumple los nueve, y `app.css` **cumplia cuatro**. Los cinco
que incumplia son exactamente los que producen jerarquia:

| Eje                  | El visor        | `app.css`, antes                          |
| -------------------- | --------------- | ----------------------------------------- |
| Escala tipografica   | **6 tokens**    | **0.** 86 declaraciones con 23 valores    |
| Unidad de espaciado  | **si**          | **ninguna.** 42 `padding`, 21 `gap`       |
| Elevacion            | **3 niveles**   | **2**, y solo en una clase (ver la nota)  |
| Superficies          | **4 planos**    | **3** (ver la nota del plano 3, abajo)    |
| Movimiento           | **4 tokens**    | ninguno                                   |

De los 23 tamaños, **once caian entre 0,82 y 0,95 rem** — nueve escalones dentro de dos pixeles.
Eso no produce jerarquia: produce ruido de un solo peso, que es literalmente lo que se ve como
«plano», y es lo que el usuario dijo tres veces.

## Por que este guardian y no una revision

Porque una pasada de diseño **se deshace sola**. Nadie reintroduce veintitres tamaños de golpe: se
escribe `font-size: 0.83rem` en una pantalla nueva porque ahi queda mejor, y tres meses despues hay
otra vez veintitres. La escala no se sostiene por acuerdo, se sostiene porque falla.

Es el mismo patron que ya sujeta el contraste (`test_contraste_del_tema.py`) y los codigos de
tramo: **el archivo se relee y se mide**, en vez de confiar en que alguien se acuerde.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

CSS = Path(settings.BASE_DIR) / "static" / "css" / "app.css"

#: Lo que se permite fuera de la escala, con su motivo. **Se añade una entrada con su razón, no se
#: borra la prueba.**
TAMANOS_A_PROPOSITO = {
    # El titular de la puerta de entrada es fluido: crece con el ancho de la ventana, así que no es
    # un escalón de la escala sino una función de ella. Un `clamp()` no se puede tokenizar sin
    # perder justo lo que lo hace útil.
    "clamp(1.6rem, 3.4vw, 2.3rem)",
}


def texto() -> str:
    return CSS.read_text(encoding="utf-8")


def _valores(propiedad: str) -> list[str]:
    """Los valores de esa propiedad, sin los comentarios del archivo.

    **Sin quitar los comentarios, esto mediría la prosa.** `app.css` está fuertemente comentado y
    sus comentarios citan CSS —«iba `font-size: 0.85rem`»— así que un barrido ingenuo denunciaría
    la explicación en vez del código. Es la misma cautela que ya toma el guardián de plantillas.
    """
    limpio = re.sub(r"/\*.*?\*/", "", texto(), flags=re.DOTALL)
    return [m.group(1).strip() for m in re.finditer(rf"{propiedad}:\s*([^;}}]+)[;}}]", limpio)]


def test_la_escala_tipografica_existe():
    """Los seis escalones del visor, más la cifra de tablero que el visor no tiene."""
    hay = texto()
    for token in (
        "--ab-texto-micro",
        "--ab-texto-nota",
        "--ab-texto-xs",
        "--ab-texto-sm",
        "--ab-texto-base",
        "--ab-texto-lg",
        "--ab-texto-cifra",
    ):
        assert f"{token}:" in hay, f"falta {token}: la escala tipográfica está incompleta"


def test_ningun_tamano_de_letra_fuera_de_la_escala():
    """**El guardián que impide que vuelvan los veintitrés.**

    Se escribe `0.83rem` en una pantalla nueva porque ahí queda mejor, y tres meses después hay
    otra vez veintitrés. Aquí falla el mismo día.
    """
    sueltos = sorted(
        {
            v
            for v in _valores("font-size")
            if not v.startswith("var(") and v not in TAMANOS_A_PROPOSITO
        }
    )

    assert sueltos == [], (
        f"tamaños de letra fuera de la escala: {sueltos}. Usa `--ab-texto-*`, o añade el valor a "
        "`TAMANOS_A_PROPOSITO` con su motivo."
    )


def test_la_escala_de_espaciado_existe():
    """El ritmo 4·8·12·16·24·32·48 que `DESIGN_SYSTEM.md:183` norma y nadie implementó."""
    hay = texto()
    # **Cinco escalones y no siete.** El ritmo llega hasta 24: los 32 y 48 que quedaban en el
    # archivo estan dentro de `calc()` de anchos, que no es espaciado. Declarar dos escalones que
    # ninguna regla usa es declarar intencion, no implementarla — y hay un guardian que ya lo
    # prohibe (`test_sistema_de_diseno.py::test_ningun_token_declarado_sin_usar`).
    for n, px in ((1, "4px"), (2, "8px"), (3, "12px"), (4, "16px"), (5, "24px")):
        assert f"--ab-esp-{n}: {px};" in hay, f"falta `--ab-esp-{n}` o no vale {px}"


def test_hay_elevacion_de_verdad_y_un_plano_elevado():
    """**Un solo plano de profundidad es la definición literal de «plano».**

    De los quince `box-shadow` del archivo, solo tres eran elevación — y dos de ellos eran la misma
    clase, `.tarjeta` y su `:hover`. Todo lo demás vivía a `z=0` con la misma receta.
    """
    # **Tres niveles de verdad, y dos de ellos ya existian.** `--ab-shadow` y `--ab-shadow-alto`
    # son el «lo que flota» y el «levantado al pasar por encima» de esta escala: estan medidos y
    # los usan tres reglas. Lo que faltaba era el de abajo —apenas despegado—, que es el que
    # convierte una seccion en un contenedor. Anadir un `--ab-elev-md` al lado de `--ab-shadow`
    # habria sido un segundo nombre para lo mismo.
    hay = texto()
    for token in ("--ab-elev-sm", "--ab-shadow", "--ab-shadow-alto"):
        assert f"{token}:" in hay, f"falta {token}"
    # **Un plano elevado y no dos.** `DESIGN_SYSTEM.md` norma cuatro; se anadio un tercero, se
    # midio, y para que el texto apagado llegara a 4,5:1 encima habia que oscurecerlo hasta ser
    # indistinguible del plano 2 —1,03:1—. Se dejo fuera con el motivo escrito en `app.css`.
    assert "--ab-surface-2:" in hay, "falta `--ab-surface-2`: siguen siendo los mismos planos"


def test_los_planos_elevados_estan_en_los_dos_temas():
    """**Media escala es peor que ninguna.**

    En oscuro los planos **suben** en vez de bajar —la luz viene de arriba— así que un token
    definido solo en `:root` daría un elevado *más claro que el fondo* en claro y *más oscuro que
    la superficie* en oscuro. Es exactamente el defecto que ya tuvo `--ab-shadow-alto`, escrito a
    mano con el azul del tema claro y por tanto invisible sobre fondo oscuro.
    """
    oscuro = texto().split('[data-theme="dark"]', 1)
    assert len(oscuro) == 2, "no se encontró el bloque del tema oscuro"
    dentro = oscuro[1].split("\n}", 1)[0]

    for token in ("--ab-surface-2", "--ab-elev-sm"):
        assert f"{token}:" in dentro, f"{token} no se redefine en el tema oscuro"


def test_se_respeta_quien_pidio_menos_movimiento():
    """El visor lo respeta desde `F9.x`; el portal corría sus transiciones igual."""
    assert "prefers-reduced-motion" in texto()


@pytest.mark.parametrize("clase", [".bloque", ".dato"])
def test_el_bloque_y_la_baldosa_ya_no_se_dibujan_igual(clase):
    """**Éste era el defecto de fondo: todo pesaba lo mismo.**

    `.tarjeta`, `.dato`, `table`, `.tareas` y `.linea-tiempo` compartían la receta exacta
    —superficie, borde de 1 px y radio 12— así que un dato de resumen y una tabla de sesenta filas
    se dibujaban idénticos. Y `.bloque`, que envuelve cada sección de «Mi trabajo», **no tenía
    receta ninguna**: su regla entera era un margen inferior.
    """
    limpio = re.sub(r"/\*.*?\*/", "", texto(), flags=re.DOTALL)
    regla = re.search(rf"\n{re.escape(clase)} \{{(.*?)\}}", limpio, re.DOTALL)

    assert regla is not None, f"no se encontró la regla de `{clase}`"
    cuerpo = regla.group(1)
    assert "box-shadow" in cuerpo, f"`{clase}` sigue a ras de página: no se distingue de una tabla"
    assert "background" in cuerpo, f"`{clase}` no tiene superficie propia"
