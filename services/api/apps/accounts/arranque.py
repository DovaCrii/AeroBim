"""La tarjeta de arranque de la portada: **por dónde seguir, con estado**.

## Lo que había

Tres enlaces en un `<ol>` **al final de la portada**, debajo de todo — o sea justo donde no lo ve
quien más lo necesita, que es el que entra por primera vez y no sabe qué se espera de él. Y los tres
pesaban igual: nada decía cuál es el siguiente ni si alguno ya está hecho.

## Y por qué aquí no hay una barra de «llevas 3 de 9»

**Porque sería mentira, y una barra que miente es peor que ninguna.** El plan pedía una, y al ir a
construirla se midió qué se puede saber de verdad sobre cada uno de los nueve pasos:

| Paso                        | ¿Queda rastro?                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| 1 · Entra en la obra        | **No.** Visitar una pantalla no se registra                        |
| 2 · Abre el modelo          | **No.** Es un `GET`, y la auditoría solo anota lo que muta         |
| 3 · Mira y mide             | **No.** Ocurre entero en el navegador                              |
| **4 · Deja una nota**       | **Sí, exacto** — una `Observacion` con `autor` = esta persona      |
| **5 · Cruza los modelos**   | **Sí, exacto** — su `interferencia_con` no está vacío              |
| **6 · Reparte y sigue**     | **Sí, exacto** — la escribió para que la conteste otro             |
| 7 · Saca el papel           | **No.** Descargar es un `GET`                                      |
| 8 · Manda y recibe BCF      | **No.** La importación no deja marca de origen en la observación   |
| 9 · Saca los planos         | **No.** Se genera y se descarga sin pasar por la base              |

Tres de nueve. Una barra sobre ese denominador le diría «llevas 1 de 9» a alguien que lleva siete
—porque seis de los pasos no se pueden contar—, y eso no orienta: desanima con un dato falso. Es
exactamente el defecto de los oráculos que cuentan sin medir, que en este repositorio ya costó dos
pasadas.

**Así que `hecho` solo se pinta cuando hay una fila en la base que lo demuestra.** Los otros seis
pasos no llevan marca, ni buena ni mala, y la posición —«1 · …» de nueve— da la orientación que la
barra iba a dar. Lo que no se puede medir, no se afirma.

## El siguiente, en cambio, sí se sabe siempre

Es el primer paso que esta persona **puede** hacer y que no está marcado como hecho. Eso no necesita
historial: sale del recorrido y de sus permisos, que es lo que ya calculaba `pasos_para`.
"""

from __future__ import annotations

from dataclasses import dataclass

from apps.accounts.ayuda import PASOS, PasoResuelto, pasos_para

#: Cuántos pasos se enseñan en la portada. El recorrido entero está en la pantalla de ayuda.
#:
#: **Tres y no nueve**, y es la misma decisión de siempre: la portada es una puerta, no un manual.
#: El usuario pidió explícitamente que la pantalla no estuviera «todo tan colapsado».
CUANTOS_SE_ENSENAN = 3

HECHO = "hecho"
SIGUIENTE = "siguiente"
PENDIENTE = "pendiente"


@dataclass(frozen=True)
class PasoDeArranque:
    """Un paso del recorrido con su sitio y su estado."""

    paso: PasoResuelto
    #: Su número dentro del recorrido completo, empezando en 1. Es lo que sitúa a quien lo lee: el
    #: primero que puede hacer un mandante es el `1`, pero el de quien coordina puede ser el `4`.
    numero: int
    estado: str

    @property
    def es_siguiente(self) -> bool:
        return self.estado == SIGUIENTE

    @property
    def esta_hecho(self) -> bool:
        return self.estado == HECHO


@dataclass(frozen=True)
class Arranque:
    """Lo que la portada necesita para dibujar la tarjeta."""

    pasos: tuple[PasoDeArranque, ...]
    #: Cuántos pasos tiene el recorrido completo, para poder decir «de 9» sin escribirlo a mano.
    total: int
    #: Si la tarjeta va **arriba** en vez de al final de la portada.
    #:
    #: Va arriba solo para quien no ha empezado —sin ninguna obra, o sin haber escrito su primera
    #: nota pudiendo—. Ponerla arriba para todos empujaría «Tus obras» hacia abajo cada día, que es
    #: la superficie de trabajo de verdad, para ayudar una vez a quien entra.
    destacado: bool


def _lo_que_ha_hecho(usuario, senales: set[str]) -> set[str]:
    """Cuáles de esas señales tiene esta persona, **en una sola consulta**.

    Con tres pasos marcables, tres `exists()` no se notarían; escribirlos en un bucle sí se notaría
    el día que las señales sean diez, y entonces el defecto vive en un bucle que nadie mira.
    """
    if not senales:
        return set()

    from django.db.models import Count, Q

    from apps.documents.models import Observacion

    # `autor=usuario` es el filtro más estrecho posible y solo devuelve booleanos sobre lo que esta
    # persona escribió: no hace falta acotar por organización porque no se lee nada de nadie más.
    cuentas = Observacion.objects.filter(autor=usuario).aggregate(
        nota=Count("pk"),
        # Una observación nacida de una corrida de interferencias: `interferencia_con` guarda el
        # GUID del otro elemento, y está vacío en todo lo que escribe una persona a mano.
        cruce=Count("pk", filter=~Q(interferencia_con="")),
        # **Repartir es escribirla para que la conteste otro.** Una nota que uno se asigna a sí
        # mismo es un recordatorio, no un reparto, y contarla diría que ya coordinó a alguien.
        reparto=Count("pk", filter=~Q(responsable=usuario)),
    )
    return {senal for senal in senales if cuentas.get(senal, 0) > 0}


def arranque_para(usuario, *, cuantas_obras: int) -> Arranque:
    """La tarjeta de arranque de esta persona.

    ## Por qué la tarjeta **avanza**, y no enseña siempre los tres primeros

    Enseñar «los tres primeros que puede hacer» es lo que había, y medido resulta que para todo el
    mundo son **el 1, el 2 y el 3** — porque esos tres no piden ningún permiso. O sea que quien
    lleva medio año coordinando abría su portada y leía «1 · Entra en la obra». Eso es exactamente
    la pantalla plana de la que se quejó el usuario: ocupa sitio y no dice nada nuevo nunca.

    Así que el punto de partida **sale de lo que la persona ya hizo**: el paso más avanzado del que
    hay rastro en la base. Quien ya repartió un hallazgo está al menos en el 6, y lo que tiene por
    delante es el 7, el 8 y el 9.

    Y el paso alcanzado se enseña arriba, marcado como hecho. No es adorno: sin él la tarjeta salta
    de golpe al 7 sin decir de dónde viene, y quien la mira no sabe si se saltó algo.

    `cuantas_obras` llega de fuera porque la portada **ya lo contó** para las tarjetas de obra:
    volver a contarlo aquí sería una segunda consulta para el mismo número.
    """
    suyos = [uno for uno in pasos_para(usuario) if uno.puedes]

    # **El sitio se cuenta sobre el recorrido entero, no sobre los suyos.** Decir «paso 1» del que
    # para todo el mundo es el cuarto haría que dos personas no pudieran hablar del mismo paso.
    donde = {paso: numero for numero, paso in enumerate(PASOS, start=1)}

    # Se mide solo si alguno de sus pasos deja rastro. Para quien solo mira obras, esto no llega a
    # tocar la base de datos.
    senales = {uno.paso.senal for uno in suyos if uno.paso.senal is not None}
    hechas = _lo_que_ha_hecho(usuario, senales)

    alcanzados = [uno for uno in suyos if uno.paso.senal in hechas]
    # El más avanzado y no el último escrito: hacer una nota nueva después de haber repartido no
    # devuelve a nadie al paso 4.
    alcanzado = max((donde[uno.paso] for uno in alcanzados), default=0)

    por_delante = [uno for uno in suyos if donde[uno.paso] > alcanzado]
    # El hecho ocupa un sitio de los tres: la tarjeta enseña tres cosas, no cuatro.
    cuantos_nuevos = CUANTOS_SE_ENSENAN - (1 if alcanzado else 0)

    a_la_vista: list[tuple[PasoResuelto, str]] = []
    if alcanzado:
        ultimo = next(uno for uno in alcanzados if donde[uno.paso] == alcanzado)
        a_la_vista.append((ultimo, HECHO))
    for indice, uno in enumerate(por_delante[:cuantos_nuevos]):
        a_la_vista.append((uno, SIGUIENTE if indice == 0 else PENDIENTE))

    pasos = tuple(
        PasoDeArranque(paso=uno, numero=donde[uno.paso], estado=estado)
        for uno, estado in a_la_vista
    )

    # Sin obra no se puede hacer nada de lo demás, y quien puede anotar y no ha anotado nunca está
    # empezando. Las dos son medidas, no suposiciones sobre la antigüedad de la cuenta.
    puede_anotar = "nota" in senales
    destacado = cuantas_obras == 0 or (puede_anotar and alcanzado == 0)

    return Arranque(pasos=pasos, total=len(PASOS), destacado=destacado)
