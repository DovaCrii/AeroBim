"""El alta de una persona: la clave inicial, y **por qué se genera y no se escribe**.

Dejar que quien crea la cuenta invente la clave produce, siempre, la misma lista: el nombre de la
obra más un número, o la misma para las once personas del equipo. Es lo que hace que una clave
inicial «temporal» acabe siendo la de todo el piloto.

Aquí se genera, se enseña **una vez** y se exige cambiarla en la primera entrada.
"""

import secrets

#: El alfabeto de la clave inicial: **sin caracteres que se confundan al dictarla**.
#:
#: Esta clave se pasa de viva voz, por teléfono o en un papel, así que la confusión no es teórica.
#: Fuera `l`/`I`/`1`, `O`/`0`, `S`/`5`, `B`/`8` y `Z`/`2`. Y fuera los símbolos: no aportan entropía
#: frente a un alfabeto de este tamaño y sí hacen que alguien teclee la coma en vez del punto.
ALFABETO = "abcdefghijkmnpqrtuvwxyzACDEFGHJKLMNPQRTUVWXY34679"

#: Cuántos grupos y de qué largo. Cuatro de cuatro son 16 caracteres.
#:
#: Con 48 símbolos, 16 caracteres son log2(48)*16 ≈ **89 bits**, muy por encima de cualquier ataque
#: por fuerza bruta contra el hash de Django. El límite real no es este número sino el tiempo que
#: vive: se cambia en la primera entrada.
GRUPOS = 4
LARGO_DE_GRUPO = 4


def generar_clave() -> str:
    """Una clave inicial legible: `abcd-efgh-ijkl-mnpq`.

    **Los guiones no son decoración.** Sin ellos, dictar dieciséis caracteres seguidos por teléfono
    falla; con grupos de cuatro se dicta y se teclea sin errores, y el guion está en el alfabeto de
    cualquier teclado. Cuentan como caracteres de la clave, así que no restan nada.

    `secrets` y no `random`: el segundo es un generador predecible a partir de su semilla y no debe
    tocar nada que sea una credencial. Es la clase de sustitución que se hace «porque da igual».
    """
    grupos = (
        "".join(secrets.choice(ALFABETO) for _ in range(LARGO_DE_GRUPO)) for _ in range(GRUPOS)
    )
    return "-".join(grupos)


def nombre_de_usuario(nombre: str, apellido: str, ya_usados) -> str:
    """Un nombre de usuario a partir del nombre real, **sin chocar con los que ya hay**.

    `ya_usados` es cualquier cosa que conteste a `in` — un `set`, o un queryset con `__contains__`.
    Se le pasa el conjunto y no se consulta la base aquí para que esto se pueda probar sin base y
    para que quien llama decida el alcance de la comprobación.

    Se prefiere `nombre.apellido` a la inicial porque es lo que la gente reconoce en una lista de
    responsables, que es donde este texto se va a leer mil veces.
    """
    import unicodedata

    def limpiar(texto: str) -> str:
        sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
        return "".join(c for c in sin_tildes.lower() if c.isalnum())

    base = ".".join(p for p in (limpiar(nombre), limpiar(apellido)) if p) or "usuario"
    if base not in ya_usados:
        return base
    # **Un número al final y no un guion bajo.** Dos personas con el mismo nombre existen —pasa en
    # cualquier obra— y `juan.perez2` se entiende; `juan.perez_` parece un error de tecleo.
    for n in range(2, 100):
        candidato = f"{base}{n}"
        if candidato not in ya_usados:
            return candidato
    raise ValueError(f"no hay nombre libre para «{base}»")
