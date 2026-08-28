"""Gunicorn en la VM. Cada numero de aqui tiene un motivo, y ninguno es el de fabrica.

**Se sirve por socket de UNIX, no por puerto.** Con `127.0.0.1:8000` cualquier
proceso de la maquina puede hablarle a Django saltandose el proxy —y con el la
terminacion TLS y las cabeceras que el proxy pone—. Un socket con permisos del
grupo del servidor web deja pasar solo a quien tiene que pasar.

**El WSGI es sincrono y a proposito.** El trabajo pesado de esta aplicacion es CPU
—`ifcopenshell` leyendo un IFC, `ifctester` validando un IDS— y ahi los workers
asincronos no ayudan: bloquean el bucle igual y ademas complican el diagnostico.
"""

import multiprocessing
import os

# El socket lo crea systemd con su propietario y su grupo; aqui solo se nombra.
bind = os.environ.get("GUNICORN_BIND", "unix:/run/aerobim.sock")

# La cuenta clasica para trabajo mixto. Se puede fijar por entorno porque la VM
# compartida con las otras aplicaciones de la familia no da los nucleos enteros.
workers = int(os.environ.get("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))

# **Dos hilos por worker, no mas.** Django no es seguro con hilos en cualquier
# codigo; dos cubren la espera de disco al servir un documento sin convertir la
# aplicacion en concurrente de verdad.
threads = int(os.environ.get("GUNICORN_THREADS", 2))

# **120 s, no 30.** Convertir un IFC grande o validar un IDS pasa del minuto, y con
# el tiempo de fabrica gunicorn mata al worker a mitad y el usuario ve un 502 sin
# explicacion. Lo que tarde mas que esto es trabajo para Celery (`F3.4`), no para
# una peticion.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 120))
graceful_timeout = 30

# Reciclar workers acota cualquier fuga de memoria de las librerias nativas —que las
# tienen— sin tener que encontrarla. El jitter evita que se reinicien todos a la vez.
max_requests = 1000
max_requests_jitter = 100

# **Los logs van a stdout/stderr**, que es donde systemd los recoge para el journal.
# El log propio de la aplicacion, con su formato JSON, sigue yendo a `LOGS_DIR`.
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOGLEVEL", "info")

# **La direccion real del cliente llega en `X-Forwarded-For`.** Sin declarar de quien
# se acepta esa cabecera, gunicorn se fia de cualquiera y el bloqueo por intentos de
# axes se puede falsificar. Solo el proxy local.
forwarded_allow_ips = os.environ.get("GUNICORN_FORWARDED_ALLOW_IPS", "127.0.0.1")

# El nombre con el que sale en `ps` y en el journal, que con varias aplicaciones de la
# familia en la misma VM es la diferencia entre saber cual reiniciar y adivinar.
proc_name = "aerobim-api"
