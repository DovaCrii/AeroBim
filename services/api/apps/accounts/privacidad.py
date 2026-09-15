"""**Qué guarda AeroBim de quien lo usa, dicho en la pantalla y no en un documento interno.**

## Por qué existe este archivo

El producto se va a abrir a personas reales de una obra, y hay dos preguntas que van a aparecer —
una del equipo y otra de quien administra la empresa:

1. **«¿Esto lleva cookies? ¿Hay que poner el aviso ese?»**
2. **«¿Qué guarda de nosotros?»**

Las dos tienen respuesta corta y buena, y por eso conviene que esté escrita: **solo hay dos
cookies y las dos son estrictamente necesarias**, así que no hace falta pedir consentimiento. Poner
un banner igualmente no sería prudencia: sería enseñarle a la gente a aceptar cosas sin leerlas, que
es el daño real que hicieron los banners.

**Lo que sí corresponde es decirlo**, que es distinto de pedir permiso. Eso es esta pantalla.

## Y por qué el texto vive aquí y no en la plantilla

Porque es **la misma lista que una prueba comprueba**. `apps/core/tests/test_las_cookies.py` mide
qué cookies pone el producto de verdad en un ciclo de entrada completo, y falla si aparece una que
nadie declaró. Con el texto en la plantilla, esa prueba y esta página se separarían el día que
alguien añadiera una cookie — y la pantalla seguiría diciendo que hay dos.

**Va en español literal y sin `gettext`**, por el mismo motivo que `ayuda.py`: es prosa que ya está
en el idioma del catálogo, y marcarla obligaría a traducirla a sí misma.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Cookie:
    nombre: str
    quien: str
    para_que: str
    cuanto: str


#: Las dos únicas cookies. **La lista está atada a `test_las_cookies.py`**: si aparece una tercera,
#: esa prueba falla antes de que esta página pueda mentir.
COOKIES: tuple[Cookie, ...] = (
    Cookie(
        nombre="sessionid",
        quien="AeroBim",
        para_que=(
            "Es lo que recuerda que ya entraste. Sin ella habría que escribir la contraseña en "
            "cada pantalla."
        ),
        cuanto="Se borra al cerrar el navegador, y en todo caso a las 12 horas.",
    ),
    Cookie(
        nombre="csrftoken",
        quien="AeroBim",
        para_que=(
            "Impide que otra página web pueda enviar formularios en tu nombre mientras tienes la "
            "sesión abierta. Es una protección, no un seguimiento."
        ),
        cuanto="Un año, o hasta que borres los datos del navegador.",
    ),
)

#: Lo que se guarda de cada persona. **Enumerado, no resumido**: «datos de la cuenta» no contesta la
#: pregunta que alguien hace cuando pregunta esto.
QUE_SE_GUARDA: tuple[tuple[str, str], ...] = (
    (
        "Tu nombre, tu usuario y tu correo",
        "Los pone quien crea la cuenta. El correo es a donde llegan los avisos de lo que se te "
        "asigna; sin él no te enterarías de nada.",
    ),
    (
        "Tu contraseña, cifrada",
        "Nunca se guarda tal cual, ni la puede ver quien administra. Si la pierdes no se recupera: "
        "se genera otra.",
    ),
    (
        "Qué hiciste y cuándo",
        # **Sin Markdown.** Esta cadena se pinta tal cual en la plantilla, así que un `**` se ve
        # como dos asteriscos. Se vio en la pantalla. Lo que en los docstrings del código es
        # énfasis, aquí tiene que ser la propia frase.
        "Cada vez que alguien sube una revisión, cierra un hallazgo o cambia una idoneidad queda "
        "registrado con su nombre y la hora. Es el punto del producto: un registro documental de "
        "obra existe para poder decir quién emitió qué y cuándo, y eso no se puede borrar.",
    ),
    (
        "Los intentos de entrar que fallan",
        "Con tu usuario y la hora, para poder bloquear tras cinco intentos seguidos. Se limpian "
        "solos cada semana.",
    ),
)

#: Lo que **no** se hace. Va escrito porque es la mitad que tranquiliza, y porque es una promesa que
#: obliga: si algún día deja de ser cierto, esta lista es lo que hay que venir a cambiar.
LO_QUE_NO = (
    "No hay analítica, ni publicidad, ni cookies de terceros: solo las dos de arriba.",
    "Los archivos de la obra —modelos, planos, nubes de puntos— se quedan en el servidor de la "
    "organización. No se suben a la nube de nadie.",
    "No se comparte nada con terceros. El único camino hacia fuera es un enlace que alguien crea "
    "a propósito, y que caduca y se puede cerrar.",
    "Nadie de fuera de tu organización ve tus obras, ni tus hallazgos, ni la lista de quién "
    "trabaja contigo.",
)

#: El aviso que hay que dar antes de crear el enlace, repetido aquí porque quien lee esta página es
#: quien va a preguntar por él. Es la misma frase que sale en la pantalla de compartir.
SOBRE_LOS_ENLACES = (
    "Un enlace compartido abre un solo documento a quien tenga la dirección, sin cuenta. Caduca, "
    "se puede cerrar en cualquier momento y se ve cuántas veces se abrió. Lo que no puede impedir "
    "es que quien lo abra se quede una copia del archivo: el visor lo dibuja en su máquina, así "
    "que el archivo llega allí. Compártelo sabiendo eso."
)
