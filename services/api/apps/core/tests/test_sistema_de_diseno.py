"""El gate del sistema de diseño del portal: **lee `app.css` y lo mide**.

## Por qué hace falta

Porque hasta hoy **ninguna prueba leía `app.css`**. El visor tiene su gate en
`sistemaDeDiseno.test.ts` desde `F9.1` y el portal no tenía nada, así que el contraste y la
coherencia de los tokens del portal eran una revisión a ojo — y una revisión a ojo no se repite en
cada cambio.

**Lo que encontró en su primera corrida**, y por eso existe:

1. **`--ab-track` se usaba y no estaba declarado.** La pista de la barra de avance no se pintaba, y
   una barra sin pista se lee como una barra al 0 %. No da error: se ve como un defecto de diseño.
2. **El contorno de los campos daba 1,24:1 en claro y 1,17:1 en oscuro.** WCAG 1.4.11 pide 3:1, y
   el propio `app.css` decía en un comentario que `--ab-border-control` «no existe en este archivo».
3. **Tres tokens declarados y sin un solo `var()`**: `--ab-control-height`, `--ab-sidebar-width` y
   `--ab-shell`. Una decisión que parece tomada y no lo está.
4. **Y una costura que ya estaba rota**: `--ab-shell` decía en su comentario «= --color-shell» y
   valía `#161f2d` contra el `#101725` del visor. Nadie lo veía porque el token no pintaba nada.

## El oráculo, y por qué no se porta nada

`apps/projects/color.py` ya tiene `luminancia` y `contraste` —la misma fórmula de WCAG 2.1 y la
misma constante que `packages/bim-core/src/color/contraste.ts`—, escritas para colorear las
etiquetas de disciplina. Se reutilizan tal cual: **el oráculo no puede ser código de la prueba**, o
mediría su propio error.

## Lo que se mide, y lo que a propósito no

Se mide **pares de color**: un texto sobre una superficie. **No se mide una composición**: que
`--ab-primary-soft` con un borde de `--ab-primary` y texto de `--ab-primary` «se vea bien» no es un
número, y decir que lo es sería inventarlo. Eso se mira.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

from apps.projects.color import contraste

CSS = Path(settings.BASE_DIR) / "static" / "css" / "app.css"
#: El del visor, para medir **la costura**: los tokens compartidos tienen que ser el mismo
#: hexadecimal a los dos lados, y eso es comprobable en vez de opinable.
CSS_DEL_VISOR = Path(settings.REPO_DIR) / "apps" / "web" / "src" / "index.css"

#: El mínimo de WCAG AA para texto normal. El grande (18 pt, o 14 pt en negrita) admite 3:1, pero el
#: portal no tiene texto grande de color: los títulos van en `--ab-text`.
AA = 4.5
#: El mínimo para un borde o un icono que **transmite información** (WCAG 1.4.11).
AA_NO_TEXTO = 3.0


def _sin_comentarios(texto: str) -> str:
    """Fuera los `/* ... */`.

    Hace falta porque los comentarios de este archivo **citan hexadecimales y nombres de token**
    —«= --color-ink», «2,9:1 sobre blanco»— y sin quitarlos el análisis contaría como declaración lo
    que es una nota al margen.
    """
    return re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)


def _bloque(css: str, selector: str) -> str:
    """El contenido del primer bloque de ese selector.

    Se busca el primer `{` después del selector y se cierra en el primer `}`: los bloques de tokens
    no anidan, así que no hace falta contar llaves — y contar llaves mal daría un bloque de más.
    """
    inicio = css.index(selector)
    abre = css.index("{", inicio)
    cierra = css.index("}", abre)
    return css[abre + 1 : cierra]


def _tokens(bloque: str) -> dict[str, str]:
    return {
        nombre: valor.strip()
        for nombre, valor in re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", bloque)
    }


@pytest.fixture(scope="module")
def css() -> str:
    return _sin_comentarios(CSS.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def claro(css) -> dict[str, str]:
    return _tokens(_bloque(css, ":root"))


@pytest.fixture(scope="module")
def oscuro(css) -> dict[str, str]:
    return _tokens(_bloque(css, '[data-theme="dark"]'))


# --- 1. Que todo lo que se usa exista ------------------------------------------------


def _sin_los_bloques_oscuros(css: str) -> str:
    """El CSS **como lo ve el tema claro**: fuera todo lo que vive dentro de `[data-theme="dark"]`.

    Hace falta porque el tema claro es el de partida: un token que solo se declara en el bloque
    oscuro **no existe en claro**, y ahí es donde `var()` se rinde.
    """
    return re.sub(r'\[data-theme="dark"\][^{]*\{[^}]*\}', "", css)


def test_todo_var_esta_declarado_en_el_tema_claro(css):
    """**Es la prueba que caza `--ab-track`.**

    Un `var(--x)` sin declarar no falla: CSS se salta la propiedad entera y queda un elemento sin
    fondo, sin borde o sin altura. Eso se ve como un defecto de diseño, no como un error, así que
    nadie lo busca donde está.

    Dos cosas que aprendió esta prueba en cuanto se corrió:

    1. **Se miran las declaraciones del archivo entero y no solo las de `:root`.** `--acento` se
       declara dentro de `.acento-0`…`.acento-4` —local a cada grupo a propósito, para que la
       tarjeta herede el color del suyo— y mirar solo `:root` lo habría denunciado como
       inexistente. Un falso positivo en un gate enseña a apagarlo.
    2. **Y se miran quitando los bloques oscuros**, que es lo que salió al mutar el arreglo a mano:
       con `--ab-track` declarado solo en `[data-theme="dark"]`, la versión anterior de esta prueba
       pasaba — y la pista seguía sin pintarse en tema claro, que es el que se usa por defecto. Un
       token a medias es el mismo defecto y más difícil de ver.
    """
    en_claro = _sin_los_bloques_oscuros(css)
    usados = set(re.findall(r"var\((--[a-z0-9-]+)", en_claro))
    declarados = set(re.findall(r"(--[a-z0-9-]+)\s*:", en_claro))

    faltan = sorted(usados - declarados)

    assert faltan == [], f"Se usan y no están declarados en tema claro: {faltan}"


def test_ningun_token_declarado_sin_usar(css, claro):
    """Un token que nadie usa es una decisión que parece tomada y no lo está.

    Se mira solo el bloque claro: el oscuro **redefine** los del claro, así que un token que solo
    esté ahí ya sería un fallo de la prueba de parejas.
    """
    usados = set(re.findall(r"var\((--[a-z0-9-]+)", css))

    sobran = sorted(set(claro) - usados)

    assert sobran == [], f"Declarados y sin usar: {sobran}"


def test_cada_token_del_claro_tiene_su_pareja_en_oscuro_o_es_invariante(claro, oscuro):
    """No todos se redefinen, y **está bien**: un radio o un ancho no cambian con el tema.

    Lo que no puede pasar es que un **color** se quede sin pareja: sobre superficie oscura, un color
    pensado para blanco deja de leerse. Así que la regla se aplica solo a los que son color.
    """
    # **La marca no cambia con el tema, y es la excepción correcta.** `--ab-navy` y `--ab-violet`
    # son los mismos hexadecimales que el visor (ver la prueba de la costura): si el tema oscuro los
    # redefiniera, el portal y el visor dejarían de compartir marca justo donde más se compara —el
    # portal en oscuro al lado del visor, que siempre es oscuro—.
    DE_MARCA = {"--ab-navy", "--ab-violet"}
    invariantes = ("--ab-radio-", "--ab-radius", "--ab-sidebar-", "--ab-rail-", "--ab-touch-")
    sin_pareja = sorted(
        nombre
        for nombre, valor in claro.items()
        if valor.startswith("#")
        and nombre not in oscuro
        and nombre not in DE_MARCA
        and not nombre.startswith(invariantes)
    )

    assert sin_pareja == [], f"Colores sin pareja en el tema oscuro: {sin_pareja}"


# --- 2. El contraste, en los dos temas ----------------------------------------------

#: Los textos que hay que poder leer, y sobre qué superficies se ponen.
TEXTOS = ("--ab-text", "--ab-text-secondary", "--ab-text-muted")
SUPERFICIES = ("--ab-bg", "--ab-surface", "--ab-surface-alt")


@pytest.mark.parametrize("tema", ["claro", "oscuro"])
def test_los_textos_se_leen_sobre_todas_las_superficies(tema, claro, oscuro):
    tokens = claro if tema == "claro" else {**claro, **oscuro}

    flojos = []
    for texto in TEXTOS:
        for fondo in SUPERFICIES:
            ratio = contraste(tokens[texto], tokens[fondo])
            if ratio < AA:
                flojos.append(f"{texto} sobre {fondo}: {ratio:.2f}")

    assert flojos == [], f"Por debajo de {AA}:1 en tema {tema}: {flojos}"


@pytest.mark.parametrize("tema", ["claro", "oscuro"])
def test_los_colores_de_estado_se_leen_sobre_la_superficie(tema, claro, oscuro):
    """`danger`, `ok` y `warn` **llevan texto**: son la palabra de la píldora, no solo su fondo."""
    tokens = claro if tema == "claro" else {**claro, **oscuro}

    flojos = [
        f"{nombre}: {contraste(tokens[nombre], tokens['--ab-surface']):.2f}"
        for nombre in ("--ab-danger", "--ab-ok", "--ab-warn", "--ab-primary")
        if contraste(tokens[nombre], tokens["--ab-surface"]) < AA
    ]

    assert flojos == [], f"Estados por debajo de {AA}:1 en tema {tema}: {flojos}"


def test_el_violeta_de_marca_sigue_siendo_decorativo(claro):
    """**Al revés que las demás: esta exige que NO pase.**

    `--ab-violet` es la marca (#9b5de5) y no llega a 4,5:1 sobre blanco. La prueba fija que siga
    siendo decorativo, porque el error que se comete es el contrario del habitual: alguien lo ve
    bonito, lo pone en un enlace, y deja texto que no se lee. Si algún día alguien lo aclara para
    «arreglarlo», esta prueba avisa de que está cambiando la marca.
    """
    ratio = contraste(claro["--ab-violet"], claro["--ab-surface"])

    assert ratio < AA, (
        f"--ab-violet da {ratio:.2f}:1 sobre la superficie. Es la marca y es decorativo; "
        "lo que lleva texto es --ab-primary."
    )


def test_blanco_sobre_primary_se_lee(claro):
    """El botón primario: fondo `--ab-primary` y texto blanco."""
    assert contraste("#ffffff", claro["--ab-primary"]) >= AA


@pytest.mark.parametrize("tema", ["claro", "oscuro"])
def test_el_borde_de_un_control_se_distingue_del_fondo(tema, claro, oscuro):
    """Un borde que no se ve deja un campo de texto que no parece un campo de texto.

    WCAG 1.4.11 pide 3:1 para lo que transmite información sin ser texto, y el borde de un control
    lo es: es lo que dice dónde se puede escribir.
    """
    tokens = claro if tema == "claro" else {**claro, **oscuro}

    ratio = contraste(tokens["--ab-border-control"], tokens["--ab-surface"])

    assert ratio >= AA_NO_TEXTO, f"--ab-border-control da {ratio:.2f}:1 en tema {tema}"


def _acentos(css: str, tema: str) -> list[str]:
    """Los cinco `--acento` de `.acento-0`…`.acento-4`, en el tema que se pida.

    Se leen del CSS y no de una lista escrita aquí **porque son los que se van a reutilizar** para
    la inicial de cada persona (`F12.7`): si alguien añade un sexto grupo con un color sin medir, la
    inicial de alguien saldría con él.
    """
    patron = (
        r'\[data-theme="dark"\]\s+\.acento-\d\s*\{\s*--acento:\s*(#[0-9a-f]{6})'
        if tema == "oscuro"
        else r"(?<!\])\s\.acento-\d\s*\{\s*--acento:\s*(#[0-9a-f]{6})"
    )
    return re.findall(patron, f" {css}")


@pytest.mark.parametrize("tema", ["claro", "oscuro"])
def test_los_cinco_acentos_se_leen_sobre_su_superficie(tema, css, claro, oscuro):
    """Los cinco colores de grupo, que además pintarán la inicial de cada persona.

    **Llevan texto**: el color del `border-left` del rótulo es el mismo con el que se escribe, así
    que se miden como texto sobre la superficie y no como decoración. Los ratios están anotados en
    una tabla dentro de `app.css`; esto comprueba que la tabla sigue siendo verdad.
    """
    acentos = _acentos(css, tema)
    fondo = (claro if tema == "claro" else {**claro, **oscuro})["--ab-surface"]

    assert len(acentos) == 5, f"Se esperaban cinco acentos en {tema} y hay {len(acentos)}"

    flojos = [
        f"{color}: {contraste(color, fondo):.2f}"
        for color in acentos
        if contraste(color, fondo) < AA
    ]
    assert flojos == [], f"Acentos por debajo de {AA}:1 en tema {tema}: {flojos}"


def test_los_cinco_acentos_no_se_parecen_entre_si(css):
    """**Tener cinco colores no basta si dos son el mismo color a 18 px.**

    Ya pasó, y está escrito en `app.css`: el cian del modelo y el verde de coordinación estaban a
    **21 grados** de tono, y el usuario lo dijo como «todo del mismo tono». El par más cercano tiene
    que quedar por encima de 40 grados — hoy está en 63.
    """
    import colorsys

    tonos = []
    for color in _acentos(css, "claro"):
        r, g, b = (int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))
        matiz, _luz, saturacion = colorsys.rgb_to_hls(r, g, b)
        # El gris de administración no entra: **es gris a propósito** (11 % de saturación), y el
        # tono de un gris no significa nada — compararlo daría un par «cercano» inventado.
        if saturacion > 0.2:
            tonos.append(matiz * 360)

    tonos.sort()
    cercano = min(b - a for a, b in zip(tonos, tonos[1:], strict=False))

    assert cercano > 40, f"Dos acentos a {cercano:.0f} grados de tono: a 18 px son el mismo color"


# --- 3. La costura con el visor, medida ---------------------------------------------


def test_la_marca_es_el_mismo_hexadecimal_en_las_dos_mitades():
    """**Es la costura, y es comprobable.**

    `app.css` dice en un comentario que `--ab-navy` es `--color-ink` y `--ab-violet` es
    `--color-brand`. Un comentario no impide que uno de los dos cambie: esto sí. Sin la prueba, la
    marca se separa un dígito cada vez que alguien retoca un tema, y nadie lo nota hasta que se ven
    las dos pantallas juntas.
    """
    visor = _sin_comentarios(CSS_DEL_VISOR.read_text(encoding="utf-8"))
    del_visor = _tokens(visor)
    portal = _tokens(_bloque(_sin_comentarios(CSS.read_text(encoding="utf-8")), ":root"))

    assert portal["--ab-navy"] == del_visor["--color-ink"]
    assert portal["--ab-violet"] == del_visor["--color-brand"]


def test_la_pista_de_avance_deja_ver_el_relleno(claro, oscuro):
    """**La otra mitad de arreglar `--ab-track`.**

    Declararla no basta: lo que la barra comunica es **cuánto** hay hecho, y eso lo dice el relleno
    contra la pista. Es un indicador no textual, así que WCAG 1.4.11 pide 3:1 — y ahí es donde una
    pista demasiado clara deja una barra que no se distingue de su hueco.

    La cifra en tanto por ciento va escrita al lado (`.avance-cifra`), que es lo que hace que esto
    no sea la única forma de saberlo. Pero el gráfico tiene que funcionar como gráfico.
    """
    for tema, tokens in (("claro", claro), ("oscuro", {**claro, **oscuro})):
        ratio = contraste(tokens["--ab-primary"], tokens["--ab-track"])
        assert ratio >= AA_NO_TEXTO, f"relleno sobre pista en {tema}: {ratio:.2f}:1"


# --- 4. Que nada quede ilegible por tamaño -------------------------------------------


def test_ningun_tamano_de_letra_baja_de_11px(css):
    """Por debajo de 11 px no se lee en una pantalla de obra, con luz y a un brazo de distancia.

    Se miran los `px` porque son absolutos; los `rem` dependen de la raíz y se comprueban por su
    token.
    """
    pequenos = [
        crudo
        for crudo, valor in (
            (m.group(0), float(m.group(1))) for m in re.finditer(r"font-size:\s*([0-9.]+)px", css)
        )
        if valor < 11
    ]

    assert pequenos == [], f"Tamaños por debajo de 11 px: {pequenos}"
