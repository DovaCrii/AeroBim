"""**Las medidas del tema, comprobadas sobre el CSS de verdad en cada corrida.**

## Por qué esta prueba existe

Los tokens de color de `app.css` llevaban sus ratios escritos en comentarios —«7,4:1», «5,1:1»— y un
comentario no comprueba nada. Un token que alguien afloja medio tono sigue pareciendo correcto
porque **el número de al lado no se recalcula**, y el defecto no se ve: el texto sigue ahí, solo que
un poco menos legible, y nadie abre una incidencia por eso.

## Y lo que se descubrió al medirlo de verdad

Recorriendo el DOM de la portada con el tema oscuro puesto salieron **cero fallos de contraste de
texto** y 14 de 14 iconos por encima de 3:1. O sea que lo que se leía mal **no eran las letras**:
era lo que separa una cosa de otra, y de eso no había ni una medida escrita porque no es texto.
La tarjeta sobre la página daba 1,12:1, el borde 1,28:1, y `--ab-primary-soft` —el fondo de las
píldoras de conteo— **1,03:1, invisible**.

Por eso aquí hay dos familias de reglas y no una:

- **Texto y componentes**, donde el mínimo lo pone WCAG 2.1 AA: 4,5:1 para texto normal, 3:1 para
  contornos de control y gráficos con significado.
- **Separación**, donde WCAG no dice nada porque un fondo de tarjeta no es un componente. Los
  mínimos de aquí abajo son **decisiones del producto**, elegidas para que la estructura de la
  página se vea, y por eso van con su motivo escrito al lado.

**Las dos familias están acopladas**, que es lo que hace que esto tenga que ser una prueba de
conjunto y no once pruebas sueltas: subir la superficie para que la tarjeta se separe del fondo
**empeora todo el texto que va encima**. En el primer intento, `--ab-text-muted` sobre la fila
alterna cayó a 4,3:1 mientras se arreglaba otra cosa. Una prueba por token no vería ese cruce.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

#: Mínimos de WCAG 2.1 AA. No son negociables y no se bajan: son el suelo legal de accesibilidad.
TEXTO = 4.5
COMPONENTE = 3.0

#: Y los de separación, que son **decisiones del producto**. WCAG no cubre «se ve el borde de la
#: tarjeta», así que estos números los elegimos nosotros y por eso llevan su motivo.

#: **Que se vea dónde empieza y acaba una tarjeta.** Es una disyunción y no una medida sola, y eso
#: salió de que la versión con una sola medida **no tiene solución**: para separar una tarjeta
#: blanca por relleno hay que oscurecer la página, y eso hunde el texto apagado que va sobre la
#: página por debajo de 4,5:1. Medido: no existe ningún conjunto de valores que cumpla las dos.
#:
#: El principio que sí se sostiene en los dos temas es que la tarjeta se distingue **por el relleno
#: o por el borde**, y cada tema usa el que su física permite — en oscuro el borde, porque una
#: sombra negra sobre casi negro no se ve; en claro el borde con la sombra ayudando.
SEPARACION_TARJETA = 1.85
SEPARACION_FILA = 1.20
SEPARACION_BORDE = 1.85
SEPARACION_CARRIL = 1.70
SEPARACION_SUAVE = 1.45


def _css() -> str:
    return (Path(settings.BASE_DIR) / "static" / "css" / "app.css").read_text(encoding="utf-8")


def tokens(bloque: str) -> dict[str, str]:
    """Los `--ab-*: #hex` de un bloque del CSS, leídos del archivo que de verdad se sirve.

    **Se lee el archivo y no una copia**: una tabla de colores repetida aquí sería otra cosa que
    mantener sincronizada, y la primera vez que se desincronizara la prueba pasaría comprobando
    colores que ya nadie pinta.
    """
    texto = _css()
    inicio = texto.index(bloque)
    cuerpo = texto[inicio : texto.index("}", inicio)]
    return {n: v for n, v in re.findall(r"(--ab-[a-z-]+):\s*(#[0-9a-fA-F]{3,6})\s*;", cuerpo)}


def canal(v: float) -> float:
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminancia(hexa: str) -> float:
    h = hexa.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def contraste(a: str, b: str) -> float:
    x, y = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def reglas(t: dict[str, str]) -> list[tuple[str, float, float]]:
    """Las medidas del tema, para los dos. Es la misma lista que resolvió los valores del oscuro."""
    return [
        # --- Separación: que la estructura de la página se vea -----------------------------
        (
            "se ve dónde acaba la tarjeta (por relleno o por borde)",
            max(
                contraste(t["--ab-surface"], t["--ab-bg"]),
                contraste(t["--ab-border"], t["--ab-bg"]),
            ),
            SEPARACION_TARJETA,
        ),
        (
            "la fila alterna sobre la tarjeta",
            contraste(t["--ab-surface-alt"], t["--ab-surface"]),
            SEPARACION_FILA,
        ),
        (
            "el borde sobre la tarjeta",
            contraste(t["--ab-border"], t["--ab-surface"]),
            SEPARACION_BORDE,
        ),
        ("el carril de la barra", contraste(t["--ab-track"], t["--ab-surface"]), SEPARACION_CARRIL),
        (
            "el acento suave sobre la tarjeta",
            contraste(t["--ab-primary-soft"], t["--ab-surface"]),
            SEPARACION_SUAVE,
        ),
        # --- Componentes: WCAG 3:1 ---------------------------------------------------------
        (
            "el contorno de un control",
            contraste(t["--ab-border-control"], t["--ab-surface"]),
            COMPONENTE,
        ),
        (
            "el contorno de un control sobre la página",
            contraste(t["--ab-border-control"], t["--ab-bg"]),
            COMPONENTE,
        ),
        # --- Texto: WCAG 4,5:1 -------------------------------------------------------------
        ("el texto sobre la tarjeta", contraste(t["--ab-text"], t["--ab-surface"]), TEXTO),
        ("el texto sobre la página", contraste(t["--ab-text"], t["--ab-bg"]), TEXTO),
        ("el texto secundario", contraste(t["--ab-text-secondary"], t["--ab-surface"]), TEXTO),
        (
            "el texto apagado sobre la tarjeta",
            contraste(t["--ab-text-muted"], t["--ab-surface"]),
            TEXTO,
        ),
        (
            "el texto apagado sobre la fila alterna",
            contraste(t["--ab-text-muted"], t["--ab-surface-alt"]),
            TEXTO,
        ),
        ("el texto apagado sobre la página", contraste(t["--ab-text-muted"], t["--ab-bg"]), TEXTO),
        ("el acento como texto", contraste(t["--ab-primary"], t["--ab-surface"]), TEXTO),
        (
            "el acento sobre el acento suave",
            contraste(t["--ab-primary"], t["--ab-primary-soft"]),
            TEXTO,
        ),
        (
            "el texto sobre el acento suave",
            contraste(t["--ab-text"], t["--ab-primary-soft"]),
            TEXTO,
        ),
    ]


#: El claro hereda del `:root`, así que se completa con él; el oscuro redefine lo que cambia.
CLARO = ":root {"
OSCURO = '[data-theme="dark"] {'


def tema(cual: str) -> dict[str, str]:
    base = tokens(CLARO)
    return base if cual == "claro" else {**base, **tokens(OSCURO)}


@pytest.mark.parametrize("cual", ["claro", "oscuro"])
def test_el_tema_cumple_todas_sus_medidas(cual):
    """**El conjunto entero, de una vez.** Que fallen todas las que fallen, no la primera.

    Un `assert` por medida diría «el borde está flojo» y callaría que el arreglo obvio del borde
    rompe otras tres. Aquí el mensaje trae la lista completa, que es lo que se necesita para poder
    resolverlo como el sistema acoplado que es.
    """
    flojas = [
        f"{que}: {medida:.2f}:1 — hace falta {minimo}:1"
        for que, medida, minimo in reglas(tema(cual))
        if medida < minimo
    ]
    assert not flojas, "el tema {} afloja {} medida(s):\n  {}".format(
        cual, len(flojas), "\n  ".join(flojas)
    )


@pytest.mark.parametrize("cual", ["claro", "oscuro"])
def test_el_texto_sobre_el_relleno_del_acento(cual):
    """El color que va **encima** del botón primario, que cambia de tema con él.

    En claro el violeta es oscuro y encima va blanco; en oscuro es claro y encima va el navy. Es el
    par que más fácil se rompe al retocar el acento, porque están en dos sitios del archivo.
    """
    t = tema(cual)
    encima = t["--ab-sobre-primary"] if cual == "claro" else t["--ab-navy"]
    assert contraste(encima, t["--ab-primary"]) >= TEXTO


def sombra_posada(cual: str) -> tuple[float, str]:
    """Cuánto separa **de verdad** la sombra de ese tema: su tinta ya compuesta sobre el fondo.

    Una sombra se declara como un color con alfa, y ese número no dice nada por sí solo: `rgb(0 0 0
    / 35%)` suena a mucho y sobre un fondo casi negro no se ve. Lo que se mide es la tinta **ya
    posada** sobre el fondo del tema, contra ese mismo fondo.
    """
    bloque = CLARO if cual == "claro" else OSCURO
    texto = _css()
    inicio = texto.index(bloque)
    cuerpo = texto[inicio : texto.index("}", inicio)]
    crudo = re.search(r"--ab-shadow:\s*([^;]+);", cuerpo).group(1)
    r, g, b, pct = (
        float(x) for x in re.search(r"rgb\((\d+) (\d+) (\d+) / (\d+)%\)", crudo).groups()
    )
    alfa = pct / 100
    fondo = tema(cual)["--ab-bg"].lstrip("#")
    fr, fg, fb = (int(fondo[i : i + 2], 16) for i in (0, 2, 4))
    posada = "#" + "".join(
        f"{round(c * alfa + f * (1 - alfa)):02x}" for c, f in ((r, fr), (g, fg), (b, fb))
    )
    return contraste(posada, "#" + fondo), crudo.strip()


def test_la_sombra_del_tema_oscuro_no_separa_nada():
    """**El hecho medido que obliga a que el borde del oscuro haga todo el trabajo.**

    Es la lección que costó la primera pasada, y merece ser una prueba porque es contraintuitiva: la
    sombra del tema oscuro está declarada **más opaca** que la del claro —35 % contra 8 %— así que
    leyendo el archivo parece la más fuerte de las dos. Posada sobre su fondo es la más débil,
    porque es negra sobre casi negro.

    Mientras esto siga siendo verdad, **relajar `SEPARACION_BORDE` para el tema oscuro deja las
    tarjetas sin contorno de ningún tipo**, y no habría nada que lo dijera: la sombra seguiría
    escrita en el CSS, aparentando que separa.

    **Y la corrección a mí mismo, que esta prueba sustituye:** aquí había otra que exigía que el
    borde del oscuro separase más que el del claro. Era la comparación equivocada —al arreglar el
    tema claro, su borde subió a 2,16:1 y el del oscuro se quedó en 1,94:1, y la prueba falló sin
    que nada estuviera mal—. Lo que importa no es cuál de los dos bordes es mayor, sino **que en
    oscuro el borde está solo**. Eso es lo que se mide aquí.
    """
    claro, _ = sombra_posada("claro")
    oscuro, declarada = sombra_posada("oscuro")

    assert oscuro < claro, (
        f"la sombra del oscuro ({declarada}) ahora separa {oscuro:.2f}:1, más que la del claro "
        f"({claro:.2f}:1). Si eso es cierto, la premisa de que en oscuro solo separa el borde ha "
        "cambiado y hay que rehacer la nota de `app.css` antes de tocar los mínimos"
    )
    assert oscuro < SEPARACION_TARJETA, (
        f"la sombra del oscuro llega a {oscuro:.2f}:1 y ya podría dibujar una tarjeta sola"
    )


def test_ningun_token_de_color_se_queda_sin_usar():
    """Un token declarado y sin un solo `var()` es una decisión que parece tomada y no lo está.

    El archivo ya perdió tres por este motivo —su comentario lo cuenta— y uno de ellos mentía sobre
    su propio valor durante meses sin que nadie lo viera, precisamente porque no pintaba nada.
    """
    texto = _css()
    declarados = {n for n, _ in re.findall(r"(--ab-[a-z-]+):\s*(#[0-9a-fA-F]{3,6})\s*;", texto)}
    huerfanos = sorted(n for n in declarados if f"var({n})" not in texto)

    assert not huerfanos, f"tokens declarados que nadie usa: {huerfanos}"
