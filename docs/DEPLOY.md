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

| Qué                  | Para qué                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| Python ≥ 3.12 y `uv` | La aplicación y su entorno                                                           |
| PostgreSQL           | Opcional: con SQLite basta hasta que haya concurrencia real de escritura             |
| nginx                | TLS y el socket de UNIX. Django no termina TLS                                       |
| Node ≥ 22            | **Solo para construir el visor.** No hace falta en tiempo de ejecución               |
| ODA File Converter   | **Opcional, y hay que instalarlo a mano.** Sin él no se abren DWG ni DGN — ver abajo |

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
  reinicio nocturno se lleva el resumen del día y en `/cuentas/trabajos/` se ve como «no corrió» sin
  motivo.
- **Sin `Restart=on-failure`.** Un SMTP caído reintentaría, y la gente recibiría el mismo correo
  cuatro veces.

**Dónde se comprueba que salió:** `/cuentas/trabajos/`. Cada corrida deja su fila en `JobRun`, y si
el correo no sale de la máquina el resumen de la fila lo dice con un prefijo — **una corrida que fue
bien y un correo que no salió se ven igual** si nadie lo marca.

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
- **Qué dominio y si comparte VM** con AeroControl y AeroPlanner. Es una decisión del
  usuario, y sigue abierta en `HANDOFF.md`.
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

**Y para que corra solo**, el mismo patrón que el resumen: un `.service` de `Type=oneshot` que llame
al guion y un `.timer` con `OnCalendar=*-*-* 02:00:00` y `Persistent=true`. No van en el repositorio
todavía porque **el guion no se ha corrido nunca en una máquina de verdad** —se escribió y se
comprobó en Windows: sintaxis con `bash -n` y la rotación con 20 juegos falsos, que deja los 14 más
nuevos—; `pg_dump`, `pg_restore` y `createdb` no se han ejecutado. Programarlo antes de verlo
funcionar a mano dejaría un respaldo que se cree hecho.
