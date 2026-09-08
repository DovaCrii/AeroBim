"""El catálogo tiene que decir la verdad, y hay cuatro formas de que no la diga.

Portado en su idea de `AeroControl/apps/core/test_translations.py`, que existe porque un
catálogo se rompe **en silencio**: la aplicación sigue funcionando y solo muestra inglés donde
debería mostrar español, y eso nadie lo nota hasta que un usuario lo dice.

Las cuatro:

1. **El `fuzzy` de la cabecera.** `makemessages` lo pone al crear el archivo, y con él gettext
   **ignora el catálogo entero**: se traducen las 277 cadenas y no se ve ni una.
2. **Una cadena sin traducir**, o traducida con el original.
3. **El `fuzzy` de una entrada suelta**, que es el que faltaba y costó una pantalla. Ver abajo.
4. **El `.mo` separado del `.po`.** El binario es lo que lee Django; si alguien edita el `.po`
   y no compila, la pantalla sigue mostrando lo viejo sin que nada falle.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings
from django.utils.translation import activate, deactivate, gettext

PO = Path(settings.BASE_DIR) / "locale" / "es" / "LC_MESSAGES" / "django.po"
MO = PO.with_suffix(".mo")


def bloques():
    """Los pares (msgid, msgstr) del catálogo, ya reunidos de sus líneas partidas."""
    texto = PO.read_text(encoding="utf-8")
    for bloque in texto.split("\n\n"):
        ids = re.search(r'^msgid ((?:"[^"]*"\n?)+)', bloque, re.M)
        strs = re.search(r'^msgstr ((?:"[^"]*"\n?)+)', bloque, re.M)
        if ids is None or strs is None:
            continue
        msgid = "".join(re.findall(r'"([^"]*)"', ids.group(1)))
        msgstr = "".join(re.findall(r'"([^"]*)"', strs.group(1)))
        if msgid:
            yield bloque, msgid, msgstr


def test_el_catalogo_existe():
    assert PO.is_file(), "Falta `locale/es/LC_MESSAGES/django.po`: corre `makemessages -l es`."
    assert MO.is_file(), (
        "Falta el `.mo`. El `.po` no lo lee nadie en tiempo de ejecución: corre "
        "`manage.py compilemessages -i .venv`."
    )


def test_la_cabecera_no_esta_marcada_fuzzy():
    """**Es el fallo que más caro sale y el más fácil de no ver.** Con el `fuzzy` en la
    cabecera, gettext descarta el archivo completo y la interfaz sigue en inglés."""
    cabecera = PO.read_text(encoding="utf-8").split("\n\n", 1)[0]

    assert "#, fuzzy" not in cabecera
    assert '"Language: es' in cabecera


def test_no_queda_ninguna_cadena_sin_traducir():
    vacias = [msgid for _b, msgid, msgstr in bloques() if not msgstr.strip()]

    assert vacias == [], f"Sin traducir: {vacias[:8]}"


def test_ninguna_entrada_esta_marcada_fuzzy():
    """**Es el hueco que costó una pantalla, y el peor de todos porque parece traducido.**

    `makemessages` marca `#, fuzzy` cuando *adivina* la traducción de una cadena parecida, y
    gettext **ignora esas entradas**: la pantalla sale en inglés teniendo el español escrito al
    lado. Ninguna de las otras pruebas lo veía —el `msgstr` no está vacío ni repite el original— y
    un `git diff` tampoco, porque la línea que lo delata es un comentario.

    Y adivina mal, que es lo que lo hace peligroso: `"Open observations"` heredó
    *«Abrir una observación»*, que es otra cosa; `"New discipline"` heredó *«disciplina»*. Si el
    `fuzzy` se quitara sin leer, la pantalla mostraría un español equivocado en vez de inglés — y
    eso ya no se nota.

    Se encontraron **quince**, seis de ellas anteriores: `information requirement`,
    `IDS validation`, `issued by` y `acknowledged` llevaban desde su día mostrándose en inglés.
    """
    texto = PO.read_text(encoding="utf-8")
    marcadas = []
    for bloque in texto.split("\n\n"):
        if not re.search(r"(?m)^#, .*\bfuzzy\b", bloque):
            continue
        ids = re.search(r'(?ms)^msgid ((?:"[^"]*"\n?)+)', bloque)
        marcadas.append("".join(re.findall(r'"([^"]*)"', ids.group(1))) if ids else bloque[:40])

    assert marcadas == [], (
        "Entradas fuzzy: gettext las ignora y la pantalla sale en inglés. Revisa la traducción "
        f"que adivinó `makemessages` —suele estar mal— y quita la marca: {marcadas[:8]}"
    )


def test_ninguna_traduccion_repite_el_original():
    """Una traducción igual al original **casi siempre es un descuido**, y el catálogo dice que
    está traducida. Las excepciones son reales y van nombradas: nombres propios y siglas que en
    español se escriben igual."""
    iguales_a_proposito = {
        "No",
        "Roles",
        "Portal",
        "transmittal",
        "transmittals",
        "Transmittals",
        # El asunto del correo: marca, préstamo del oficio y dos marcadores. No queda ni una
        # palabra que traducir, y forzar «Transmisión» pondría en el asunto una palabra que
        # nadie usa en obra.
        "[AeroBim] Transmittal %(folio)s: %(asunto)s",
    }
    sospechosas = [
        msgid
        for _b, msgid, msgstr in bloques()
        if msgstr.strip() == msgid.strip() and msgid not in iguales_a_proposito
    ]

    assert sospechosas == [], f"Traducción igual al original: {sospechosas[:8]}"


def test_los_marcadores_de_formato_sobreviven_a_la_traduccion():
    """**Un `%(n)s` que se pierde es un `KeyError` en producción**, no un texto raro: Django
    interpola y falla. Y uno que cambia de nombre, lo mismo."""
    for _b, msgid, msgstr in bloques():
        if not msgstr.strip():
            continue
        assert sorted(re.findall(r"%\([a-zA-Z_]+\)s", msgid)) == sorted(
            re.findall(r"%\([a-zA-Z_]+\)s", msgstr)
        ), f"Los marcadores no coinciden en «{msgid[:60]}»"


@pytest.mark.parametrize(
    "fuente,esperado",
    [
        ("Sign in", "Entrar"),
        ("Deliverables", "Entregables"),
        ("What is missing", "Lo que falta"),
        ("Open in the viewer", "Abrir en el visor"),
        ("S3 · Suitable for review and comment", "S3 · Apto para revisión y comentario"),
        (
            "Invalid username or password. Try again.",
            "Usuario o contraseña inválidos. Inténtalo de nuevo.",
        ),
    ],
)
def test_el_binario_devuelve_el_espanol(fuente, esperado):
    """**Esta es la que prueba el `.mo` y no el `.po`.** Es lo que lee Django, y un `.po`
    editado sin compilar deja la pantalla mostrando lo viejo sin que nada falle."""
    activate("es")
    try:
        assert gettext(fuente) == esperado
    finally:
        deactivate()


@pytest.mark.django_db
def test_la_pantalla_sale_en_espanol(client):
    """De punta a punta: la página de ingreso, que es lo primero que alguien ve."""
    from django.urls import reverse

    cuerpo = client.get(reverse("login")).content.decode()

    assert "Entrar" in cuerpo
    assert "Modelo, planos y control documental." in cuerpo
    # Y no queda el original al lado.
    assert "Model, plans and document control." not in cuerpo
