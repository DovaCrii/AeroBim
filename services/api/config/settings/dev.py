"""Desarrollo: lo mismo, con la clave de firma y `DEBUG` puestos por defecto."""

import os

# Sin `.env`, `decouple` fallaria al leer `SECRET_KEY` y el mensaje no diria por
# que. En desarrollo se pone una y **solo aqui**: `prod.py` la exige del entorno.
os.environ.setdefault("SECRET_KEY", "solo-para-desarrollo-nunca-en-produccion")
os.environ.setdefault("DEBUG", "True")

from .base import *  # noqa: E402, F403

DEBUG = True
# Sin esto, whitenoise avisa de que no existe `staticfiles/` —que la crea
# `collectstatic`, o sea el despliegue— en cada peticion de desarrollo y en cada test.
# Un aviso que sale siempre deja de significar algo.
WHITENOISE_AUTOREFRESH = True
WHITENOISE_USE_FINDERS = True
