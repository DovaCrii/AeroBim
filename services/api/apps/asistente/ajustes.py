"""Cuando existe el asistente.

**Sin clave, el asistente no existe** (el modelo tiene un valor por
omision): el endpoint contesta 404 y la interfaz no lo ofrece. Se lee de `django.conf.settings`
en cada llamada (no se copia a una constante) para que una prueba pueda cambiarlo, y para que
esta funcion sea la unica que decide.

**La clave no sale de aqui.** Esta funcion devuelve un booleano; ninguna otra pieza del modulo
lee `NIM_API_KEY` para mostrarla, registrarla o ponerla en un mensaje.
"""

from django.conf import settings


def asistente_disponible() -> bool:
    return bool(getattr(settings, "NIM_API_KEY", ""))
