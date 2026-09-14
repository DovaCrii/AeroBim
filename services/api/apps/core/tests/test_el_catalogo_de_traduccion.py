"""**Una traducción adivinada es peor que ninguna**, y el catálogo se llena de ellas solo.

## De dónde sale esta prueba

Al añadir la pantalla de alta de cuentas, `makemessages` dejó doce entradas nuevas marcadas
`fuzzy`, cada una con la traducción de **otra cadena parecida** copiada encima:

| lo que dice el código | lo que gettext puso en español |
| --- | --- |
| `Last name` | «Última corrida» |
| `Create account` | «Crear borrador» |
| `Disabled` | «Entregable» |
| `Initial password` | «Cambiar la contraseña» |
| `Not signed in yet` | «Todavía no se emitió.» |

No es un fallo de gettext: es lo que hace a propósito para ahorrarle trabajo a quien traduce, y por
eso las marca. El problema es que **`msgfmt` las compila igual si nadie mira**, así que la pantalla
sale en un español correcto y falso — que es mucho peor que salir en inglés, porque en inglés se ve
que falta algo y en «Crear borrador» no.

Y no lo cazaba nada: una búsqueda de `msgstr ""` da cero, porque estas **sí** tienen texto.
"""

import re
from pathlib import Path

from django.conf import settings

CATALOGO = Path(settings.BASE_DIR) / "locale" / "es" / "LC_MESSAGES" / "django.po"


def entradas():
    """Cada bloque del catálogo, partido por la línea en blanco que los separa."""
    return re.split(r"\n\n+", CATALOGO.read_text(encoding="utf-8"))


def texto_de(bloque: str, etiqueta: str) -> str:
    """Junta un `msgid`/`msgstr` que puede venir repartido en varias líneas entrecomilladas."""
    hallado = re.search(rf'^{re.escape(etiqueta)} ((?:"[^"]*"\n?)+)', bloque, re.M)
    if not hallado:
        return ""
    return "".join(x.strip().strip('"') for x in hallado.group(1).strip().splitlines())


def traduccion_de(bloque: str) -> str:
    """La traducción de una entrada, **contando las que tienen plural**.

    Una entrada con `msgid_plural` no lleva `msgstr` a secas sino `msgstr[0]` y `msgstr[1]`, y una
    comprobación que solo mire `msgstr ` las da todas por vacías. Fue el primer resultado de esta
    prueba: veintitantas cadenas «sin traducir» que sí lo estaban, porque hablaban de una cosa o de
    varias. Se devuelven concatenadas: para lo que se pregunta aquí —¿hay algo escrito?— basta.
    """
    if "msgid_plural" not in bloque:
        return texto_de(bloque, "msgstr")
    return "".join(texto_de(bloque, f"msgstr[{n}]") for n in (0, 1))


def test_no_queda_ninguna_traduccion_adivinada():
    """Ninguna entrada marcada `fuzzy`. Ver el motivo arriba: son texto plausible y equivocado."""
    difusas = [
        f"{texto_de(b, 'msgid')[:60]!r} → {traduccion_de(b)[:50]!r}"
        for b in entradas()
        if re.search(r"^#,.*\bfuzzy\b", b, re.M) and texto_de(b, "msgid")
    ]

    assert not difusas, (
        "{} traducción(es) que gettext adivinó y nadie aprobó. Revísalas una a una y quítales la "
        "marca `#, fuzzy` junto con la línea `#| msgid` de al lado:\n  {}".format(
            len(difusas), "\n  ".join(difusas)
        )
    )


def test_no_queda_ningun_texto_sin_traducir():
    """Y el caso fácil, que sin el de arriba daría una falsa sensación de catálogo completo."""
    vacias = [
        texto_de(b, "msgid")[:70]
        for b in entradas()
        if texto_de(b, "msgid") and not traduccion_de(b)
    ]

    assert not vacias, "textos sin traducir:\n  " + "\n  ".join(vacias)


def test_ninguna_traduccion_sale_escrita_dos_veces():
    """**El defecto que se vio en la pantalla y que ninguna otra comprobación veía.**

    En el catálogo, un texto largo se reparte en varias líneas entrecomilladas que gettext
    concatena. Una entrada bien formada empieza por `msgstr ""` y pone el contenido debajo:

        msgstr ""
        "Hasta que la cambie, esta clave la conocen dos personas. AeroBim le pedirá "
        "elegir la suya…"

    Si alguien —una herramienta, un script de relleno— escribe el texto **en la propia línea del
    `msgstr`** sin borrar las de continuación, gettext las suma y la frase sale **dos veces
    seguidas**. Pasó con cuatro entradas y se vio en la pantalla, no en el archivo: el `.po` se lee
    correcto de un vistazo, y ni «sin traducir» ni «fuzzy» lo detectan, porque ni está vacío ni
    está marcado.

    La firma es exacta y por eso esta prueba no tiene falsos positivos: un `msgstr` **con texto**
    seguido de líneas de continuación no lo produce ninguna herramienta que funcione bien.
    """
    dobles = []
    for bloque in entradas():
        hallado = re.search(r'^msgstr "([^"]+)"\n((?:"[^"]*"\n?)+)', bloque, re.M)
        if hallado:
            dobles.append(
                f"{texto_de(bloque, 'msgid')[:50]!r}: sale como {hallado.group(1)[:40]!r} "
                f"+ {len(hallado.group(2).splitlines())} línea(s) más, o sea repetido"
            )

    assert not dobles, "traducciones que se imprimen dos veces seguidas:\n  " + "\n  ".join(dobles)


def test_las_traducciones_conservan_sus_huecos():
    """**Un `%(nombre)s` que se pierde al traducir revienta la página en tiempo de ejecución.**

    Es el único error de este archivo que no se ve leyéndolo: la cadena en español queda bien
    escrita, y `str % {...}` levanta `KeyError` cuando alguien abre esa pantalla. `msgfmt --check`
    lo comprueba para `printf`, pero **solo en las entradas marcadas `python-format`**, y esa marca
    la pone gettext cuando la reconoce — no siempre.
    """

    def huecos(s: str) -> set[str]:
        return set(re.findall(r"%\((\w+)\)[sdf]", s))

    rotas = []
    for bloque in entradas():
        # **Forma con forma, y no el singular contra las dos traducciones juntas.** En una entrada
        # con plural el singular puede no llevar hueco y el plural sí —«One deliverable has no
        # revision» frente a «%(total)s deliverables…»— así que compararlos mezclados da seis
        # falsos positivos. Fue el primer resultado de esta prueba, y era mío.
        if "msgid_plural" in bloque:
            pares = [
                (texto_de(bloque, "msgid"), texto_de(bloque, "msgstr[0]")),
                (texto_de(bloque, "msgid_plural"), texto_de(bloque, "msgstr[1]")),
            ]
        else:
            pares = [(texto_de(bloque, "msgid"), texto_de(bloque, "msgstr"))]

        for original, traducida in pares:
            if not original or not traducida:
                continue
            if huecos(original) != huecos(traducida):
                rotas.append(f"{original[:50]!r}: {huecos(original)} → {huecos(traducida)}")

    assert not rotas, "traducciones con los huecos cambiados:\n  " + "\n  ".join(rotas)
