# Poner AeroBim en la VM

> Lo que hay que hacer, en orden, y **por qué** en los sitios donde hacerlo distinto
> rompe algo sin dejar rastro. Las dos reglas del principio no son preferencias: cada
> una costó una sesión encontrarla.

## Las dos que rompen el visor en silencio

1. **Nunca servir `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`.** Con
   aislamiento de origen, `web-ifc` elige su WASM multihilo, que no funciona empaquetado,
   y la conversión **se queda esperando sin emitir ningún error**. Django no las sirve por
   su cuenta; el riesgo es que alguien las añada en nginx "por seguridad". El visor falla
   al arrancar con un mensaje explícito si detecta `crossOriginIsolated`, y esa
   comprobación no se quita.
2. **La CSP necesita `'wasm-unsafe-eval'` en `script-src` y `worker-src 'self' blob:`.**
   Ya están en `config/settings/base.py` y salen en los dos entornos. Un proxy que
   sobreescriba la cabecera `Content-Security-Policy` con una propia deja la página en
   blanco.

## Lo que hace falta en la máquina

| Qué                  | Para qué                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Python ≥ 3.12 y `uv` | La aplicación y su entorno                                               |
| PostgreSQL           | Opcional: con SQLite basta hasta que haya concurrencia real de escritura |
| nginx                | TLS y el socket de UNIX. Django no termina TLS                           |
| Node ≥ 22            | **Solo para construir el visor.** No hace falta en tiempo de ejecución   |

Usuario y directorios, con la aplicación fuera de `/home`:

```bash
sudo useradd --system --home /opt/aerobim --shell /usr/sbin/nologin aerobim
sudo install -d -o aerobim -g aerobim /opt/aerobim /var/lib/aerobim /var/log/aerobim
```

`/var/lib/aerobim` es donde van los documentos y `/var/log/aerobim` los registros. Los
dos están fuera del repositorio a propósito: los datos de una obra no viven en git, y un
`git pull` no puede borrarlos.

## El despliegue, paso a paso

```bash
sudo -u aerobim git clone https://github.com/DovaCrii/AeroBim.git /opt/aerobim
cd /opt/aerobim
```

**1. El SPA del visor.** Se construye una vez y se sirve como estático; Node no vuelve a
hacer falta.

```bash
npm ci && npm run build
```

Lo que entra en `apps/web/dist` lo decide la **lista blanca** de
`apps/web/scripts/limpiar-dist.mjs`, no una lista de lo prohibido. Es lo que impide que
un modelo de prueba de la organización quede descargable sin autenticar — ya pasó, con
34 MB y un 200.

**2. El entorno de Python, con el grupo del despliegue.**

```bash
cd services/api
uv sync --no-default-groups --group deploy
```

`--group deploy` trae `gunicorn` y `psycopg[binary]`. **Sin él, `DB_ENGINE=postgresql` no
arranca**, y hasta hoy fallaba nombrando `psycopg2` —el paquete anterior—, que manda a
instalar el que no es. Ahora `config/settings/base.py` lo comprueba al cargar los ajustes
y dice cuál es el comando.

`--no-default-groups` deja fuera el grupo `dev`: pytest, ruff y bandit no pintan nada en
producción.

**3. El `.env`.** Se copia del ejemplo y **no se confirma nunca**.

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # para SECRET_KEY
```

Lo que hay que cambiar sí o sí:

| Variable               | Valor en la VM                                                              |
| ---------------------- | --------------------------------------------------------------------------- |
| `SECRET_KEY`           | La que salió del comando de arriba. Nunca la de ejemplo                     |
| `DEBUG`                | `False`                                                                     |
| `ALLOWED_HOSTS`        | `bim.<dominio>,127.0.0.1` — el `127.0.0.1` es para `/health/`               |
| `CSRF_TRUSTED_ORIGINS` | `https://bim.<dominio>`                                                     |
| `SITE_BASE_URL`        | `https://bim.<dominio>` — es la base de los enlaces del correo              |
| `DOCUMENTS_DIR`        | `/var/lib/aerobim/documentos`                                               |
| `LOGS_DIR`             | `/var/log/aerobim`                                                          |
| `VISOR_DEV_URL`        | **Vacío.** Con valor, `/visor/` redirige al Vite que no existe              |
| `EMAIL_BACKEND`        | El de SMTP. Con el de consola la aplicación diría "enviado" y lo imprimiría |

**4. La base de datos y los estáticos.**

```bash
export DJANGO_SETTINGS_MODULE=config.settings.prod
uv run python manage.py migrate
uv run python manage.py collectstatic --noinput
uv run python manage.py compilemessages
uv run python manage.py createsuperuser
```

`createsuperuser` es el único usuario que se crea solo: **no hay auto-registro**, y el
resto los da de alta un administrador desde la aplicación.

**5. Las unidades de systemd.**

```bash
sudo cp services/api/deploy/aerobim.socket /etc/systemd/system/
sudo cp services/api/deploy/aerobim.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aerobim.socket aerobim.service
```

Dos cosas de esas unidades que conviene tener presentes:

- **`Type=notify`, no `simple`.** Con `simple`, systemd da por arrancado el servicio en
  cuanto el proceso existe —o sea antes de que Django cargue los ajustes—, y un
  `SECRET_KEY` que falta se ve como `active` hasta la primera petición.
- **`ProtectSystem=strict`**, con solo `/var/lib/aerobim` y `/var/log/aerobim` en
  `ReadWritePaths`. Si `DOCUMENTS_DIR` o `LOGS_DIR` apuntan fuera de ahí, el servicio
  arranca y falla al guardar el primer documento. `/health/` lo dice antes.

**6. nginx.** Lo mínimo, y **sin tocar la CSP ni añadir COOP/COEP**:

```nginx
location / {
    proxy_pass http://unix:/run/aerobim.sock;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200M;   # un IFC de obra pasa de 30 MB
}
```

`X-Forwarded-For` importa de verdad: es de donde axes saca quién intenta entrar.
`gunicorn.conf.py` solo la acepta de `127.0.0.1`, para que no se pueda forjar desde
fuera.

## Comprobar que quedó bien

```bash
curl -s https://bim.<dominio>/health/ | python3 -m json.tool
```

```json
{ "estado": "ok", "comprobaciones": { "base": "ok", "documentos": "ok", "visor": "ok" } }
```

Qué significa cada respuesta:

| Respuesta                     | Qué pasó                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200` con `estado: ok`        | Atiende                                                                                                                                                        |
| `200` con `estado: degradado` | El SPA no está construido: falta el paso 1. El portal y la API sí funcionan                                                                                    |
| `503` con `base: fallo`       | PostgreSQL no contesta, o falta `psycopg`                                                                                                                      |
| `503` con `documentos: fallo` | El montaje no está o es de solo lectura. **Es el fallo que destruye datos en silencio**: sin esto, Django escribiría en el disco local y lo subido se perdería |

La respuesta **no dice qué ruta falló ni con qué error**, a propósito: `/health/` es la
única ruta sin login, y el detalle va al journal, donde ya hay alguien autorizado
mirando.

```bash
journalctl -u aerobim -f
```

Y el gate completo, que es lo mismo que corre en el equipo de desarrollo:

```bash
cd services/api && pwsh scripts/verify.ps1
```

## Actualizar

```bash
cd /opt/aerobim && sudo -u aerobim git pull
npm ci && npm run build
cd services/api && uv sync --no-default-groups --group deploy
uv run python manage.py migrate && uv run python manage.py collectstatic --noinput
sudo systemctl restart aerobim
curl -s https://bim.<dominio>/health/
```

**El `curl` al final no es adorno**: `systemctl restart` vuelve sin error aunque los
workers hayan muerto al cargar los ajustes, y `/health/` es lo que distingue "reiniciado"
de "reiniciado y sirviendo".

## Lo que todavía no está

- **`F3.4` — Celery.** Convertir un IFC grande y validar un IDS pasan del minuto y hoy
  corren dentro de la petición. El `timeout` de gunicorn está en 120 s por eso, que es un
  parche con fecha de caducidad, no una solución.
- **Copias de seguridad.** No hay nada escrito. Lo que hay que copiar son dos cosas y
  están separadas a propósito: la base de datos y `/var/lib/aerobim`.
- **Qué dominio y si comparte VM** con AeroControl y AeroPlanner. Es una decisión del
  usuario, y sigue abierta en `HANDOFF.md`.
