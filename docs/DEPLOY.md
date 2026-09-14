# Poner AeroBim en la VM

> **Esta página se lee una vez. Para lo de después está [`OPERACION.md`](OPERACION.md)**: el repaso
> diario, lo que crece hasta llenar el disco, cómo se restaura un respaldo con prisa, y la tabla de
> «qué hacer si…». Son dos documentos porque se leen en momentos distintos.

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

## Esto no va a un PaaS, y hay un `vercel.json` para impedirlo

**El 2026-09-08, al aparecer el código en `main`, Vercel mandó un correo ofreciendo importar dos
proyectos**: `apps/web` como Vite y `services/api` como Django. No era un fallo —nada se estaba
construyendo— era una invitación, y es la invitación la que hay que rechazar por escrito.

**Importar cualquiera de los dos rompe la premisa del producto.** AeroBim es local-first: corre en
un equipo o servidor de la organización, y los datos de obra están bajo su control. Tres razones
concretas, no una de principio:

1. **`DOCUMENTS_DIR` necesita un disco que siga ahí mañana.** Ahí viven los IFC, los DXF, el COPC de
   130 MB y las capturas de los comentarios. Un entorno sin estado los pierde entre peticiones, y
   una revisión de obra que desaparece no es un registro documental.
2. **Subirlo sería sacar los datos de la organización a un tercero.** Un expediente ISO 19650, con
   los transmittals y los hallazgos, en la infraestructura de otra empresa. Eso es exactamente lo
   que la primera línea del `README` dice que este producto no hace.
3. **El visor solo tampoco sirve.** `apps/web` sin la API es una pantalla que no puede abrir nada
   del registro, y desplegarla publicaría además la carpeta `samples`.

Por eso el repositorio lleva un **`vercel.json` con `git.deploymentEnabled: false`**: si alguien
importa el proyecto por descuido, Vercel no construye nada. Es una barrera, no una configuración —
no hay ningún despliegue de Vercel que ajustar.

> **Lo que ese archivo NO hace, dicho para no confiar en él de más:** el correo de «projects
> available to import» **lo genera la app de GitHub de Vercel al mirar los repositorios a los que
> tiene acceso**, y eso vive en la cuenta y no en el código. Para que deje de llegar hay que quitarle
> a Vercel el acceso a este repositorio (GitHub → Settings → Applications → Vercel → Repository
> access) o desactivar ese aviso desde el enlace del propio correo. Un archivo en el repositorio no
> puede apagar una notificación de la cuenta.

## Lo que hace falta en la máquina

| Qué                  | Para qué                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Python ≥ 3.12 y `uv` | La aplicación y su entorno                                                                                                     |
| **PostgreSQL**       | **No es opcional.** Ver abajo: `respaldo.sh` solo funciona con él, y el respaldo es la puerta                                  |
| **`gettext`**        | `compilemessages` falla con «Can't find msgfmt» sin él, y el mensaje no dice que falte esto                                    |
| nginx                | TLS y el socket de UNIX. Django no termina TLS                                                                                 |
| **Node ≥ 22**        | Solo para construir el visor. **`apt install nodejs` en Ubuntu 24.04 da Node 18 y el build muere ahí** — hace falta NodeSource |
| ODA File Converter   | **Opcional, y hay que instalarlo a mano.** Sin él no se abren DWG ni DGN — ver abajo                                           |

```bash
sudo apt install -y python3 postgresql postgresql-client gettext nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
node -v   # v22.x o más: con v18 el build del visor no termina
```

> **PostgreSQL dejó de ser opcional el 2026-09-11, y el motivo es el respaldo.** `respaldo.sh` usa
> `pg_dump` y `pg_restore`, así que **con SQLite no hay ningún camino de respaldo** — y el checklist
> del piloto exige «copia hecha y restaurada una vez» como bloqueante. Además, la base SQLite caería
> dentro de `/opt/aerobim`, que `ProtectSystem=strict` deja de solo lectura.
>
> La suite entera **se corrió contra PostgreSQL 16 por primera vez** ese día, en un Ubuntu 24.04
> igual al de la VM, y pasó. De ahí salió un defecto que SQLite escondía: el número de orden de la
> auditoría se repetía con varios workers (ver `apps/core/models.py`).

Usuario y directorios, con la aplicación fuera de `/home`:

```bash
sudo useradd --system --home /opt/aerobim --shell /usr/sbin/nologin aerobim
sudo install -d -o aerobim -g aerobim /opt/aerobim /var/lib/aerobim /var/log/aerobim
```

`/var/lib/aerobim` es donde van los documentos y `/var/log/aerobim` los registros. Los
dos están fuera del repositorio a propósito: los datos de una obra no viven en git, y un
`git pull` no puede borrarlos.

### ODA File Converter — para abrir DWG y DGN

**Hay que instalarlo a mano y AeroBim no lo trae.** Es un ejecutable **gratuito** de la Open Design
Alliance, con su propia licencia: no se distribuye con el producto, no se descarga solo, y **ningún
paso automático del despliegue lo va a traer**. Si nadie lo instala, no está.

Es lo único de esta lista que se instala fuera de `uv` y de `npm`, y por eso se pasa por alto — de
ahí que esté escrito dos veces: aquí y en [`docs/FORMATOS.md`](FORMATOS.md).

1. Descargarlo de la web de la Open Design Alliance —pide un registro gratuito— e instalarlo **en la
   máquina del servidor**.
2. Poner en el `.env`:

   ```bash
   ODA_CONVERTER=/opt/oda/ODAFileConverter
   ```

   En Windows suele ser `C:\Program Files\ODA\ODAFileConverter <versión>\ODAFileConverter.exe`.

3. Reiniciar el servicio.

**Qué pasa si no está, y por qué no es una emergencia.** Subir un DWG o un DGN **sigue funcionando**:
el archivo se guarda, se descarga y queda en el expediente como cualquier entregable. Lo único que no
ocurre es la conversión, así que **esa revisión no se puede abrir en el visor** y lo dice con su
motivo. Un registro documental que rechazara el archivo por no tener una herramienta de conversión
sería un registro que pierde el archivo.

> **Y si se instala más tarde, las revisiones ya subidas no se convierten solas.** La conversión pasa
> al recibir el archivo, así que lo que entró antes se queda sin DXF. Hoy la salida es volver a subir
> la revisión; si algún día hay muchas, hace falta una orden de gestión que las recorra — **no está
> escrita**, y queda dicho para que nadie la dé por hecha.

## Antes de nada: ¿esta máquina está libre?

**`p340` no está vacía.** AeroControl y AeroConvert ya viven ahí, y hay una cosa que, mal hecha,
**tumba los tres servicios a la vez**.

```bash
sudo /opt/aerobim/services/api/deploy/comprobar-vecinos.sh
```

No cambia nada: mira y contesta. Devuelve `0` si se puede instalar y `1` si hay algo que decidir.

### Por qué AeroBim casi no puede chocar, y dónde sí

|                 |                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El puerto**   | No usa ninguno. gunicorn habla por el socket `/run/aerobim.sock`, no por `127.0.0.1:8000`. No hay nada que ocupar                                           |
| **Los nombres** | Todo lleva el suyo: usuario `aerobim`, `/opt/aerobim`, `/var/lib/aerobim`, `/var/log/aerobim`, `/var/backups/aerobim`, base `aerobim`, unidades `aerobim-*` |
| **nginx**       | **Aquí sí.** Ver abajo                                                                                                                                      |

**El `default_server` del 443 solo lo puede declarar un sitio en toda la máquina.** Con dos,
`nginx -t` falla con `a duplicate default server for 0.0.0.0:443` y **nginx entero no arranca** —
o sea que instalar AeroBim dejaría también a AeroConvert sin servir, con un error que no menciona
a AeroBim por ninguna parte.

Medido en un WSL con el mismo Ubuntu 24.04 y el mismo nginx 1.24, los tres casos:

|                                                                                 |                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| AeroBim solo, con su servidor por defecto                                       | `syntax is ok`                                   |
| AeroBim **con** su servidor por defecto, junto a un vecino que ya tiene el suyo | **`a duplicate default server for 0.0.0.0:443`** |
| AeroBim **sin** su servidor por defecto, junto a ese vecino                     | `syntax is ok`                                   |

Por eso son **dos archivos** y no uno:

- `deploy/nginx-aerobim.conf` — el sitio. **Se instala siempre.**
- `deploy/nginx-aerobim-default.conf` — el servidor por defecto. **Solo si nadie más lo tiene.**
  Lo único que hace es cerrar el escaneo por IP; si ya lo cierra otro, no hace falta.

---

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

| Variable                          | Valor en la VM                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SECRET_KEY`                      | La que salió del comando de arriba. Nunca la de ejemplo                                             |
| `DEBUG`                           | `False`                                                                                             |
| `ALLOWED_HOSTS`                   | `<host>.<tailnet>.ts.net,100.x.y.z,127.0.0.1` — el `127.0.0.1` es para `/health/`                   |
| `CSRF_TRUSTED_ORIGINS`            | `https://<host>.<tailnet>.ts.net` — **con esquema**, o cada POST responde 403                       |
| `SITE_BASE_URL`                   | Lo mismo. Es la base de los enlaces del correo, y si está mal no abren                              |
| `DB_ENGINE`                       | `postgres`                                                                                          |
| `DB_NAME` `DB_USER` `DB_PASSWORD` | La conexión. `DB_NAME` y `DB_USER` **no tienen valor por omisión**: sin ellos los ajustes no cargan |
| `DOCUMENTS_DIR`                   | `/var/lib/aerobim/documentos` — **ruta absoluta**, ver abajo                                        |
| `LOGS_DIR`                        | `/var/log/aerobim` — ídem                                                                           |
| `VISOR_DEV_URL`                   | **Vacío.** Con valor, `/visor/` redirige al Vite que no existe                                      |
| `EMAIL_BACKEND`                   | El de SMTP. Con el de consola la aplicación diría "enviado" y lo imprimiría                         |
| `SECURE_HSTS_SECONDS`             | `3600` la primera semana. Ver «HSTS» más abajo                                                      |

> **Las dos rutas van absolutas, y el ejemplo las trae relativas.** `.env.example` tiene
> `DOCUMENTS_DIR=../../../aerobim-datos/documentos`, que se resuelve contra el `WorkingDirectory` de
> la unidad y cae **fuera de `ReadWritePaths`**. Con `ProtectSystem=strict` eso deja el destino de
> solo lectura. Quien copie el ejemplo y no toque esas dos líneas se lleva un servicio que arranca y
> no puede guardar nada.

> **Este archivo lo leen dos parsers distintos** —`python-decouple` desde Django y **systemd** desde
> `EnvironmentFile=`— y no coinciden en comillas, `$` ni `#` a mitad de línea. **Regla: ningún valor
> lleva comillas, espacios, `#` ni `$`.** La `SECRET_KEY` de `token_urlsafe` es segura por
> construcción; una contraseña de SMTP puede no serlo.

**4. La base de datos y los estáticos.**

```bash
sudo -u postgres createuser --pwprompt aerobim
sudo -u postgres psql -c 'ALTER ROLE aerobim CREATEDB;'   # lo necesita `respaldo.sh --verificar`
sudo -u postgres createdb -O aerobim aerobim
sudo install -d -o aerobim -g aerobim /var/lib/aerobim/documentos   # nadie más lo crea

export DJANGO_SETTINGS_MODULE=config.settings.prod
uv run python manage.py migrate
uv run python manage.py showmigrations --plan | grep -c '^\[X\]'   # ANOTAR: lo pide --verificar
uv run python manage.py bootstrap_roles
uv run python manage.py collectstatic --noinput
uv run python manage.py compilemessages -i .venv -i staticfiles
uv run python manage.py check --deploy
uv run python manage.py createsuperuser
```

Cuatro cosas de esa lista que faltaban en este documento y cuesta caro descubrir:

- **`ALTER ROLE ... CREATEDB`.** `respaldo.sh --verificar` restaura sobre una base **aparte** y para
  eso la crea. Sin el permiso, la comprobación del respaldo falla.
- **`/var/lib/aerobim/documentos` no lo crea nadie.** `/health/` devuelve **503** recién instalado
  hasta que alguien sube el primer archivo, y el mensaje dice `documentos: fallo`, que es el aviso
  reservado para «el montaje no está» — o sea el fallo que destruye datos en silencio.
- **`bootstrap_roles`.** Su propio docstring dice «se corre en cada despliegue» y no estaba aquí.
  Sin él, un permiso nuevo tras un `git pull` **no llega a ningún rol**: alguien no puede hacer su
  trabajo y no hay ningún error.
- **`-i .venv -i staticfiles` en `compilemessages`**, que ya llevan `verify.ps1` y la CI. Sin ellos
  recorre el árbol entero e intenta compilar los catálogos de Django dentro del entorno virtual.

`createsuperuser` es el único usuario que se crea solo: **no hay auto-registro**, y el
resto los da de alta un administrador desde la aplicación. **Ojo con usarlo para comprobar los
permisos**: `apps/core/tenancy.py` le devuelve el queryset entero a un superusuario, así que probar
con esa cuenta **no prueba nada** sobre las membresías.

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

**5 bis. El resumen diario por correo.** Es su propio par de unidades, y **hasta hoy no existía**:
el comando `enviar_resumen` estaba escrito y nadie lo disparaba, así que el resumen no salía nunca.

```bash
sudo cp services/api/deploy/aerobim-resumen.service /etc/systemd/system/
sudo cp services/api/deploy/aerobim-resumen.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aerobim-resumen.timer
systemctl list-timers aerobim-resumen.timer      # cuándo toca la siguiente
```

Y **antes de esperar a mañana**, comprobarlo en seco: cuenta a quién le llegaría sin mandar nada.

```bash
cd /opt/aerobim/services/api
sudo -u aerobim .venv/bin/python manage.py enviar_resumen --dry-run
sudo systemctl start aerobim-resumen.service     # el de verdad, una vez
journalctl -u aerobim-resumen.service -n 30
```

Tres cosas de esas unidades:

- **`OnCalendar=07:30` en hora local, no UTC.** El resumen dice qué vence hoy, así que llega antes
  de la jornada. Con la VM en UTC sale a las 03:30 **o a las 04:30 según el horario de verano**, y
  ese salto de una hora dos veces al año no se relaciona con la zona:
  `timedatectl set-timezone America/Santiago`.
- **`Persistent=true`.** Si la máquina estaba apagada a esa hora, sale al arrancar. Sin esto un
  reinicio nocturno se lleva el resumen del día y en `/administracion/trabajos/` se ve como «no corrió» sin
  motivo.
- **Sin `Restart=on-failure`.** Un SMTP caído reintentaría, y la gente recibiría el mismo correo
  cuatro veces.

**Dónde se comprueba que salió:** `/administracion/trabajos/`. Cada corrida deja su fila en `JobRun`, y si
el correo no sale de la máquina el resumen de la fila lo dice con un prefijo — **una corrida que fue
bien y un correo que no salió se ven igual** si nadie lo marca.

**5 ter. El aseo semanal.** Dos tablas crecían para siempre y **no las limpiaba nadie**:
`django_session` —porque `SESSION_SAVE_EVERY_REQUEST` reescribe la fila en cada petición, que es lo
que hace deslizante la sesión de doce horas— y las de `axes`, una fila por intento de entrada.
Ninguna hace daño el primer mes; las dos lo hacen el primer año, y entonces el síntoma es un disco
lleno que nadie relaciona con esto.

```bash
sudo cp services/api/deploy/aerobim-mantenimiento.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aerobim-mantenimiento.timer
sudo systemctl start aerobim-mantenimiento.service    # una corrida a mano, para verla
```

**6. El certificado, por Tailscale y no por certbot.**

La VM se alcanza **solo por el tailnet**: no hay dominio público ni puerto abierto a internet. Eso
descarta el HTTP-01 de Let's Encrypt, y lo sustituye algo mejor — `tailscale cert` pide el mismo
certificado real por DNS-01 a través de Tailscale, **sin abrir el 80 y sin registro DNS público**.

```bash
tailscale status --json | jq -r .Self.DNSName     # el nombre exacto; se usa seis veces
sudo mkdir -p /etc/ssl/aerobim
sudo tailscale cert --cert-file /etc/ssl/aerobim/aerobim.crt \
                    --key-file  /etc/ssl/aerobim/aerobim.key  <host>.<tailnet>.ts.net
sudo openssl x509 -in /etc/ssl/aerobim/aerobim.crt -noout -subject -issuer -dates
```

Tres cosas que dependen de la consola del tailnet y no de la VM, y por eso van primero:

1. **MagicDNS y «HTTPS Certificates» activados.** Sin lo segundo, `tailscale cert` falla diciendo
   que HTTPS no está habilitado. Es lo único que puede pararlo todo por algo que no está aquí.
2. **Desactivar la expiración de clave del nodo.** Por omisión caduca a los 180 días: el servicio
   queda perfectamente sano e **inalcanzable**. Es la causa número uno de «dejó de funcionar meses
   después y nadie supo por qué».
3. **Comprobar que Funnel está apagado** en este nodo. Funnel expone a internet, y con él encendido
   toda la premisa de «no hay nada público» es falsa.

**La renovación es nuestra:** el certificado dura 90 días. **Sin timer, el servicio muere a los tres
meses** con un error que nadie relaciona con Tailscale. El par de unidades ya está escrito:

```bash
# `AEROBIM_FQDN=<host>.<tailnet>.ts.net` en el `.env` — de ahí lo lee la unidad.
sudo cp services/api/deploy/aerobim-certificado.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aerobim-certificado.timer
sudo systemctl start aerobim-certificado.service
sudo openssl x509 -in /etc/ssl/aerobim/aerobim.crt -noout -dates
```

Corre **a diario** aunque el certificado dure noventa: `tailscale cert` no lo pide de nuevo si el que
hay todavía sirve, así que las corridas de en medio no cuestan nada y dan treinta oportunidades de
que salga bien antes de que la caducidad importe. Es la única de las cinco unidades que corre como
`root`, porque habla con el socket de `tailscaled` y recarga nginx.

> **Por qué no `tailscale serve`, que renovaría solo.** Proxea a TCP y no a un socket de UNIX, así
> que obligaría a poner gunicorn en `127.0.0.1:8000` y **se perdería el candado `0660
aerobim:www-data`** del socket — que es justamente lo que hace seguro que Django se fíe de
> `X-Forwarded-Proto`. Y desaparecería el archivo donde viven `client_max_body_size` y la regla de
> COOP/COEP.

**7. nginx**, que ya no es un fragmento suelto:

```bash
sudo cp services/api/deploy/nginx-aerobim.conf /etc/nginx/sites-available/aerobim
sudo sed -i "s/AEROBIM_FQDN/<host>.<tailnet>.ts.net/" /etc/nginx/sites-available/aerobim
sudo ln -sf /etc/nginx/sites-available/aerobim /etc/nginx/sites-enabled/aerobim
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Y el cortafuegos, que es lo que de verdad acota a quién escucha:

```bash
sudo ufw default deny incoming
sudo ufw allow in on tailscale0
sudo ufw enable && sudo ufw status verbose
```

Se acota por **interfaz** y no atando nginx a la IP `100.x`: si nginx arrancara antes que tailscaled,
esa dirección no existe todavía y el servicio quedaría muerto tras un reinicio.

Tres cosas de ese archivo que no son adorno:

- **`X-Forwarded-Proto`.** Sin ella, `SECURE_SSL_REDIRECT=True` deja el sitio en
  `ERR_TOO_MANY_REDIRECTS`, `/health/` incluido. Y aunque el bucle no se diera, el `Origin` de CSRF
  compararía `http://` contra `https://` y **cada POST respondería 403**: la página carga y los
  botones no hacen nada. La otra mitad del arreglo es `SECURE_PROXY_SSL_HEADER` en `prod.py`.
- **`proxy_read_timeout 300s`**, y no los 60 de fábrica. Revisar interferencias con cuatro modelos
  son seis pares × 20 s = **120 s exactos**: con el valor por omisión el usuario ve un `504` a los
  60 s mientras gunicorn sigue trabajando otro minuto, y el hallazgo se guarda igual.
- **`X-Forwarded-For`** es de donde axes saca quién intenta entrar, y `gunicorn.conf.py` solo la
  acepta de `127.0.0.1` para que no se pueda forjar desde fuera.

### HSTS: corto la primera semana

`prod.py` fija `SECURE_HSTS_INCLUDE_SUBDOMAINS` y `SECURE_HSTS_PRELOAD` en `True` sin poder
apagarlos, y un año sobre un nombre nuevo **no se deshace desde el servidor**. Se arranca con
`SECURE_HSTS_SECONDS=3600` y se sube a `31536000` cuando el despliegue esté asentado.
`check --deploy` avisará con `security.W004` mientras tanto; es un aviso, no un error, y no rompe el
gate.

## Comprobar que quedó bien

```bash
curl -s https://<host>.<tailnet>.ts.net/health/ | python3 -m json.tool
```

```json
{
  "estado": "ok",
  "comprobaciones": {
    "base": "ok",
    "documentos": "ok",
    "visor": "ok",
    "conversor_cad": "ausente"
  }
}
```

> **`conversor_cad` es informativo y no cambia el estado.** Dice `instalado` o `ausente`, y `ausente`
> **no pone el servidor en amarillo**: la mayoría de los despliegues no reciben ni un DWG, y una
> alarma que suena siempre deja de mirarse. Está ahí porque es **lo único del despliegue que no
> traen `uv` ni `npm`**, y por eso es lo que se olvida — así se ve sin leer esta página.

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

### Las tres comprobaciones que protegen lo caro

```bash
curl -sI https://<host>.<tailnet>.ts.net/ | grep -i 'cross-origin'
```

**Tiene que salir vacío.** Si sale algo, el visor se cuelga sin error y nadie lo relaciona con nginx.

```bash
curl -sI https://<host>.<tailnet>.ts.net/accounts/login/ | grep -i content-security-policy
```

Exactamente una cabecera `Content-Security-Policy` —no `-Report-Only`—, y dentro
`script-src 'self' 'wasm-unsafe-eval'` y `worker-src 'self' blob:`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -I \
  https://<host>.<tailnet>.ts.net/static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc   # 404
```

**404, no 200.** Ya pasó una vez que archivos de obra quedaron descargables **sin autenticar**
—200 y 34 MB—, y de ahí salió la lista blanca de `limpiar-dist.mjs`.

Y la que ningún `curl` sustituye: **entrar desde un portátil, abrir un IFC real desde el expediente
y verlo convertir.** Es la única comprobación de que COOP/COEP, la CSP, el WASM y
`client_max_body_size` funcionan **a la vez**.

### El gate

`pwsh scripts/verify.ps1` es de Windows y `pwsh` no viene en Ubuntu. El equivalente en la VM:

```bash
cd services/api && uv run pytest -q
```

Lo demás del gate —`ruff`, `bandit`, `pip-audit`, `makemigrations --check`— vive en el grupo `dev`,
que `--no-default-groups` deja fuera a propósito: son comprobaciones del repositorio, no del
servidor, y ya corren en la CI.

## Actualizar

**Un guion, y no siete comandos a mano.** Los pasos son siete y **un despliegue que se puede hacer a
medias se hace a medias**: se olvida `bootstrap_roles` y un permiso nuevo no llega a ningún rol, o se
olvida `collectstatic` y el visor sirve el JavaScript de la versión anterior. Ninguna de las dos da
error.

```bash
# Antes, un respaldo a mano: el de las 02:00 no sirve si el despliegue es a las 10:00.
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh
sudo -u aerobim /opt/aerobim/services/api/deploy/desplegar.sh
```

Para al primer fallo —`set -euo pipefail`— y **termina comprobando `/health/`, fallando si no dice
`ok`**: `systemctl restart` vuelve sin error aunque los workers hayan muerto al cargar los ajustes, y
esa comprobación es lo único que distingue «reiniciado» de «reiniciado y sirviendo».

**Y las migraciones no se deshacen solas.** Si la versión nueva trae una destructiva, la vuelta atrás
es restaurar el volcado — por eso el respaldo previo no es opcional. El procedimiento está en
[`OPERACION.md`](OPERACION.md).

> **Los despliegues no se hacen el día de una sesión del piloto** (`docs/PILOTO.md`).

## Lo que todavía no está

- **La detección de interferencias se corre a mano, y por eso está medida.** Cruzar los dos
  modelos reales de la organización tarda **20 s**, así que no entra en una petición:

  ```bash
  uv run python manage.py detectar_interferencias <revision-a> <revision-b> \
      --clase-a IfcWall --clase-b IfcMember --autor <usuario> --dry-run
  ```

  Con `--dry-run` cuenta lo que abriría sin escribir nada. Cada conflicto se abre como una
  observación con su viewpoint, y **volver a correrlo no duplica**: lo ya descartado no vuelve.
  Deja su fila en `JobRun`, que es donde se ve una corrida que murió a mitad.

- **Trabajos en segundo plano (`F3.4`) — medido, y hoy no hace falta.** Sobre el IFC real de
  32,7 MB: extraer metadatos 1,4 s, medir cobertura 1,5 s, validar un IDS 0,7 s. El `timeout`
  de 120 s es holgura, no un parche. Si algún día un trabajo llega a 30 s sobre un archivo
  real, ese es el momento de sacarlo de la petición.
- **Un dominio público.** Hoy se entra **solo por el tailnet**, y eso tiene una consecuencia que no
  es técnica: **quien no esté en Tailscale no entra**. Para un mandante externo hay que invitarlo al
  tailnet o esperar al dominio. Y los enlaces del correo diario —que salen de `SITE_BASE_URL`— solo
  resuelven en un dispositivo con Tailscale y MagicDNS: un teléfono sin la aplicación ve un enlace
  muerto. Conviene decírselo por escrito a quien reciba el resumen.

  **Y lo mismo vale para los enlaces compartidos**, que es lo que los deja a medias hoy: el producto
  ya sabe crearlos, caducarlos y revocarlos, pero quien los recibe no los puede abrir si no está en
  el tailnet — que es justo lo contrario de para qué existen. La decisión de sacarlos a internet
  está tomada (2026-09-14) y **el trabajo que falta es de despliegue, no de código**:

  |                                   |                                                                          |
  | --------------------------------- | ------------------------------------------------------------------------ |
  | Un nombre público                 | dominio propio, o Tailscale Funnel si sirve para el piloto               |
  | Un certificado para ese nombre    | Let's Encrypt por HTTP-01, o el de Funnel                                |
  | Que **solo** `/compartido/` salga | un `server` aparte que no proxee nada más; todo lo demás se queda dentro |
  | El límite de peticiones           | ya está escrito en `nginx-aerobim.conf`, zona `aerobim_compartido`       |

  Lo que **no** cambia: el resto de la aplicación sigue solo en el tailnet. Abrir la puerta de los
  enlaces no es abrir el registro.

  El día que haya dominio cambian **tres valores del `.env`** —`ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `SITE_BASE_URL`—, el `server_name` de nginx y el origen del certificado.
  Nada más: gunicorn, el socket, whitenoise, la CSP y las reglas de COOP/COEP no dependen del nombre.
  Conviene **dejar el nombre `ts.net` una semana más** en `ALLOWED_HOSTS` para que los enlaces ya
  enviados por correo no mueran de golpe.

- **El reparto de la VM con AeroControl y AeroConvert.** Lo que podía chocar ya no choca —ver
  «¿esta máquina está libre?» al principio— y lo que queda es un reparto, no un conflicto:
  **`GUNICORN_WORKERS` se fija a la RAM de `p340` y no a sus núcleos**, porque el número de fábrica
  (`cpu*2+1`) supone que la máquina es entera nuestra y no lo es.
- **Llevar el respaldo fuera de la VM.** El guion de abajo copia a `/var/backups`, que protege de un
  borrado y **no** de que se muera el disco ni de que se pierda la máquina. Con qué se saca —`rclone`,
  un `scp` a otra máquina, el respaldo del hipervisor— es una decisión de infraestructura del
  usuario. Y si la copia sale de la VM **tiene que ir cifrada**: el volcado lleva correos y hashes de
  contraseña.

## Copias de seguridad

**Son dos cosas, y están separadas a propósito.** La base guarda _qué_ existe —el entregable, su
revisión, su `sha256`, quién la subió— y `/var/lib/aerobim/documentos` guarda _los bytes_. Los
archivos no pasan por la base, así que un `pg_dump` solo es un catálogo de archivos que no están, y
una copia de los documentos sin la base es un montón de ficheros con nombre de hash y sin nadie que
sepa qué son. Por eso el guion copia las dos **en el mismo instante**: recuperar mitades de fechas
distintas deja revisiones apuntando a archivos que todavía no existen.

```bash
sudo mkdir -p /var/backups/aerobim && sudo chown aerobim:aerobim /var/backups/aerobim
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh --verificar
```

Deja un juego por corrida en `/var/backups/aerobim/AAAAMMDD-HHMMSS/`: `base.dump` (`pg_dump
--format=custom`, restaurable por tablas), `documentos.tar` y `sha256sums.txt`. Guarda **14 juegos**
y borra los anteriores. Toma la conexión del `.env` —`DB_NAME`, `DB_USER`…— y no de un
`DATABASE_URL` propio: la misma conexión escrita de dos formas acaba apuntando a otra base sin
decirlo.

**`--verificar` es lo que hace de esto un respaldo y no un archivo grande.** Comprueba los `sha256`,
restaura el volcado en **una base aparte** —nunca sobre producción—, corre `manage.py check
--database default` contra ella y cuenta las migraciones aplicadas; después comprueba que el `tar`
trae archivos dentro. Un volcado que nunca se restauró no es un respaldo: es un archivo del que se
supone algo. Y hasta que `--verificar` pase una vez, el piloto no arranca (`docs/PILOTO.md`).

Los documentos **no se comprimen**: son IFC, LAZ y PDF, ya comprimidos —el COPC del CC 741 son
124,7 MB de LAZ que no bajan de forma útil—. El `tar` está para conservar rutas y permisos.

### `--verificar` pasó por primera vez el 2026-09-11

**El motivo por el que el `.service` y el `.timer` del respaldo no iban en el repositorio está
cumplido.** Decía que `pg_dump`, `pg_restore` y `createdb` no se habían ejecutado nunca y que
programar el respaldo antes de eso dejaría «un respaldo que se cree hecho». Se ejecutaron: en un WSL
con **Ubuntu 24.04, el mismo sistema que la VM**, contra **PostgreSQL 16** de verdad.

Lo que salió, con sus cuatro oráculos:

| Oráculo                                                   | Resultado                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| La frase final                                            | `OK: de este respaldo se puede volver`                                                                  |
| Migraciones en la copia **=** migraciones en la base viva | **50 = 50**                                                                                             |
| Bases de prueba huérfanas tras la comprobación            | **ninguna** — el `trap` funciona                                                                        |
| Lo que ocupa un juego                                     | 348 KB con documentos de mentira; **hay que volver a medirlo con los de obra antes de fijar `CUANTOS`** |

Eso hizo ensayable el guion, y para conseguirlo hubo que quitarle las rutas escritas a mano: llevaba
`/opt/aerobim/services/api` y `.venv/bin/python` en cuatro sitios, así que **solo corría en la VM**.
Ahora sale de `AEROBIM_HOME` y `AEROBIM_PYTHON`. Sin eso, el primer `--verificar` de la historia
habría sido el de producción, que es justo lo que no se quiere de un guion de respaldo.

**Así que las unidades ya están escritas** —`deploy/aerobim-respaldo.service` y `.timer`,
`OnCalendar=*-*-* 02:00:00` y `Persistent=true`— y queda **una puerta, ahora de operación**: se
instalan **después** de que `--verificar` pase una vez **en la máquina donde va a correr**.

```bash
sudo cp services/api/deploy/aerobim-respaldo.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now aerobim-respaldo.timer
sudo systemctl start aerobim-respaldo.service     # una corrida a mano, para verla
```

Llevan `/var/backups/aerobim` en `ReadWritePaths`, que es lo que las distingue de las otras dos: sin
esa ruta, `ProtectSystem=strict` deja el destino de solo lectura y el fallo aparece a las 02:00 de
mañana, no ahora.

**Lo que sí se ejercitó antes, el 2026-09-09, y lo que encontró.** El guion se corrió entero por primera
vez con los programas de PostgreSQL sustituidos por otros que anotan cómo se los llama
(`apps/core/tests/test_respaldo.py`, que corre en la CI porque el guion es de Linux). Eso separa dos
preguntas que juntas bloqueaban las dos: **si PostgreSQL vuelve de un volcado** —sigue sin
comprobarse, y no se simula porque una respuesta simulada no vale— y **si el guion hace lo que
dice**: el orden, las comillas, la rotación que borra, el `sha256sum` que compara, el `trap` que
limpia.

Y ahí había un defecto: el nombre de la base de prueba estaba en una variable `local` y **el
`trap EXIT` que la borra no la veía** —bash deshace el alcance de la función antes de correr el trap
de salida, por los dos caminos—, así que el `dropdb --if-exists ""` que salía de ahí no borraba nada
y el `|| true` se tragaba la queja. Con la comprobación diaria que este guion propone, eso deja
**una copia entera de la base por día, para siempre**, en el mismo disco que protege — y cada una
con los correos y los hashes de contraseña que el guion se cuida de no dejar legibles. Es
exactamente la clase de cosa que esconde un guion que nunca se ha ejecutado.
