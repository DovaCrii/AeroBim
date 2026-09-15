"""**Los doce iconos del rail eran del mismo gris, y a 64 px eso son doce manchas iguales.**

## Qué estaba plano, y por qué no se veía como defecto

`.rail-icono` heredaba `--ab-text-secondary` de su enlace: **el mismo color y el mismo peso de
trazo que el rótulo de al lado**, doce veces seguidas. El acento del grupo existía, estaba medido y
llegaba solo a tres píxeles de borde en el rótulo del grupo, así que la columna entera era gris con
cuatro rayitas de color.

Y donde más costaba es donde el dibujo es lo único que queda: **entre 760 y 1100 px el rail se
pliega y el rótulo se oculta**. Elegir a dónde ir con doce manchas grises idénticas de 20 px.

Ningún oráculo lo veía porque **no hay nada que falle**: el contraste del trazo contra el fondo del
rail siempre pasó —es el color del texto secundario, 9:1— y el icono se dibuja. Lo que no había era
nada que midiera *si un icono se distingue del de arriba*, que es otra pregunta.

## Lo que fija esta prueba

La baldosa es `color-mix(in srgb, var(--acento) 20%, transparent)` sobre el rail, o sea el acento al
20 % compuesto sobre `--ab-surface`. Dos medidas por tema:

1. **El trazo contra su propia baldosa** ≥ 3:1. Es WCAG 1.4.11: el icono es un gráfico que
   transmite información. Esta no se negocia.
2. **La baldosa contra el rail** ≥ 1,25:1. Esto es una decisión del producto —WCAG no cubre «se ve
   la baldosa»— y es la que hace que la pasada valga para algo: al 14 %, que fue el primer valor
   que tuvo la misma baldosa en las tarjetas del portal, **casi no existe**.

Las dos están acopladas y por eso van juntas: subir la mezcla separa mejor la baldosa **y hunde el
trazo contra ella**. Al 40 % el trazo cae a 2,99:1 en el acento gris, o sea por debajo del suelo de
WCAG. La ventana que cumple las dos es estrecha y es lo que esta prueba sujeta.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

#: WCAG 2.1 AA para gráficos con significado. No se baja.
COMPONENTE = 3.0

#: Y la separación, que es decisión del producto: que la baldosa **exista**. Medido en el navegador
#: el 2026-09-15 con la mezcla al 20 %: 1,49–1,59 en oscuro y 1,32–1,39 en claro. El suelo se pone
#: por debajo del peor de los dos temas con holgura para un retoque de tono, no para aflojarlo.
SEPARACION_BALDOSA = 1.25

#: Hoy la mezcla es 20 %. **Este número no se usa para medir** —se lee del CSS, ver `_mezcla()`—;
#: está aquí solo para que el motivo quede escrito junto a las medidas del 2026-09-15.
MEZCLA_DE_HOY = 0.20


def _css() -> str:
    return (Path(settings.BASE_DIR) / "static" / "css" / "app.css").read_text(encoding="utf-8")


def _rgb(hexa: str) -> tuple[float, float, float]:
    hexa = hexa.lstrip("#")
    if len(hexa) == 3:
        hexa = "".join(c * 2 for c in hexa)
    return tuple(int(hexa[i : i + 2], 16) for i in (0, 2, 4))


def _luminancia(rgb) -> float:
    def canal(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (canal(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b) -> float:
    x, y = sorted((_luminancia(a), _luminancia(b)), reverse=True)
    return round((x + 0.05) / (y + 0.05), 2)


def mezcla(frente, fondo, proporcion: float):
    """`color-mix(in srgb, frente P%, transparent)` compuesto sobre `fondo`.

    Mezclar con `transparent` en sRGB premultiplica, así que el resultado es el acento con alfa `P`;
    componerlo sobre el rail es la interpolación lineal de los dos en el espacio de 0–255. Es lo que
    hace el navegador, comprobado contra `getComputedStyle` el 2026-09-15.
    """
    return tuple(f * proporcion + b * (1 - proporcion) for f, b in zip(frente, fondo, strict=True))


def _acentos(css: str, oscuro: bool) -> dict[int, tuple[float, float, float]]:
    """Los cinco `--acento` de un tema, leídos del archivo que de verdad se sirve."""
    patron = (
        r'\[data-theme="dark"\]\s*\.acento-(\d)\s*\{[^}]*?--acento:\s*(#[0-9a-fA-F]{3,6})'
        if oscuro
        else r"(?<!\])\s\.acento-(\d)\s*\{[^}]*?--acento:\s*(#[0-9a-fA-F]{3,6})"
    )
    return {int(n): _rgb(v) for n, v in re.findall(patron, css, re.S)}


def _superficie(css: str, oscuro: bool) -> tuple[float, float, float]:
    """`--ab-surface`, que es el fondo del rail (`.rail { background: var(--ab-surface) }`)."""
    bloque = css.split('[data-theme="dark"]', 1)[1 if oscuro else 0]
    m = re.search(r"--ab-surface:\s*(#[0-9a-fA-F]{3,6})", bloque)
    assert m, "no se encontró --ab-surface"
    return _rgb(m.group(1))


def _mezcla(css: str) -> float:
    """La proporción del acento en la baldosa, **leída de `app.css`**.

    Es lo que hace que esto sea una prueba y no un número repetido en dos sitios. Con la proporción
    tecleada aquí, cambiarla en el CSS no rompía nada: las medidas seguían calculándose con la
    vieja y la prueba pasaba midiendo un color que ya nadie pinta. Medido: con la constante fija,
    subirla al 45 % —que hunde el trazo por debajo de WCAG— no hacía fallar ninguna de las dos
    pruebas de contraste.
    """
    reglas = re.search(r"\.rail-icono\s*\{(.*?)\}", css, re.S)
    assert reglas, "no está `.rail-icono`"
    # El `var(--acento, var(--ab-primary))` lleva paréntesis anidados —«Mi trabajo» y «Cómo se usa»
    # no están en ningún grupo y caen al violeta de la marca— así que no vale con `[^)]*`.
    m = re.search(r"background:\s*color-mix\(in srgb, var\(--acento.*?\s(\d+)%", reglas.group(1))
    assert m, "la baldosa del rail ya no se pinta con `color-mix`"
    return int(m.group(1)) / 100


def test_la_baldosa_sigue_pintandose_como_esta_prueba_cree():
    """Si la baldosa deja de ser un `color-mix` del acento, las medidas de abajo **no miden nada**.

    No fija el porcentaje —ese se lee— sino la forma: que el fondo del icono siga saliendo del
    acento de su grupo. Cambiarlo por un color propio es una decisión legítima, y lo que no puede
    es pasar de largo dejando estas tres pruebas comprobando aire.
    """
    assert 0 < _mezcla(_css()) < 1


@pytest.mark.parametrize("oscuro", [False, True], ids=["claro", "oscuro"])
def test_el_trazo_se_lee_sobre_su_propia_baldosa(oscuro):
    """WCAG 1.4.11. El icono dice a qué sección lleva: por debajo de 3:1 deja de decirlo."""
    css = _css()
    rail = _superficie(css, oscuro)
    proporcion = _mezcla(css)
    acentos = _acentos(css, oscuro)
    assert len(acentos) == 5, f"se esperaban cinco acentos, hay {len(acentos)}"

    flojos = {
        n: contraste(ac, mezcla(ac, rail, proporcion))
        for n, ac in acentos.items()
        if contraste(ac, mezcla(ac, rail, proporcion)) < COMPONENTE
    }
    assert not flojos, f"el trazo no llega a {COMPONENTE}:1 sobre su baldosa: {flojos}"


@pytest.mark.parametrize("oscuro", [False, True], ids=["claro", "oscuro"])
def test_la_baldosa_existe(oscuro):
    """La otra mitad, y la que motivó la pasada: **que se vea que hay una baldosa**.

    Sin esto el trazo pasaría el contraste siendo un dibujo suelto en una columna gris, que es
    exactamente el estado del que se viene. WCAG no lo cubre; el suelo es nuestro.
    """
    css = _css()
    rail = _superficie(css, oscuro)
    proporcion = _mezcla(css)
    acentos = _acentos(css, oscuro)

    invisibles = {
        n: contraste(mezcla(ac, rail, proporcion), rail)
        for n, ac in acentos.items()
        if contraste(mezcla(ac, rail, proporcion), rail) < SEPARACION_BALDOSA
    }
    assert not invisibles, f"la baldosa no se separa del rail: {invisibles}"


@pytest.mark.parametrize("oscuro", [False, True], ids=["claro", "oscuro"])
def test_en_la_entrada_activa_la_baldosa_se_llena_y_la_tinta_aguanta(oscuro):
    """La entrada activa es la única con el acento sólido, así que la tinta encima **cambia**.

    Es la trampa que el producto ya pisó dos veces —la inicial de una persona y el botón primario—:
    un par de colores medido como *texto sobre superficie* deja de valer cuando uno de los dos pasa
    a ser **relleno**. En oscuro los acentos son claros, y blanco encima daba 2,09:1. Por eso
    `.rail-activo .rail-icono` usa `--acento-fg` y no un color fijo.
    """
    css = _css()
    acentos = _acentos(css, oscuro)
    patron = (
        r'\[data-theme="dark"\]\s*\.acento-(\d)\s*\{[^}]*?--acento-fg:\s*([^;]+);'
        if oscuro
        else r"(?<!\])\s\.acento-(\d)\s*\{[^}]*?--acento-fg:\s*([^;]+);"
    )
    tintas = dict(re.findall(patron, css, re.S))
    assert len(tintas) == 5

    # En oscuro la tinta es `var(--ab-navy)`; se resuelve al hexadecimal que declara `:root`.
    navy = re.search(r"--ab-navy:\s*(#[0-9a-fA-F]{3,6})", css)
    assert navy

    flojos = {}
    for n, acento in acentos.items():
        crudo = tintas[str(n)].strip()
        tinta = _rgb(navy.group(1)) if "navy" in crudo else _rgb(crudo)
        ratio = contraste(tinta, acento)
        if ratio < COMPONENTE:
            flojos[n] = ratio
    assert not flojos, f"la tinta del icono activo no se lee sobre el acento sólido: {flojos}"
