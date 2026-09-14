# Operar AeroBim, una vez que está arriba

> **`DEPLOY.md` dice cómo ponerlo; esto dice cómo mantenerlo vivo.** Son dos páginas distintas
> porque se leen en momentos distintos: aquella una vez, ésta cada semana — y una de sus secciones,
> la de restaurar, a las tres de la mañana.
>
> Todo lo de aquí sale de **lo que rompe a los días o a los meses**, no el primer día. Por eso no
> está en ningún checklist de instalación.

## Los datos de esta instalación

Rellenar al desplegar, y **no dejarlo para después**: es la primera pregunta de cualquiera que tenga
que mirar esto y no lo haya montado.

|                              |                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nombre                       | `<host>.<tailnet>.ts.net`                                                                                                                        |
| Dirección del tailnet        | `100.x.y.z`                                                                                                                                      |
| **Cómo se entra**            | **Solo por Tailscale.** Si el nombre no resuelve, probar `https://100.x.y.z/` y aceptar el aviso del certificado                                 |
| Certificado                  | Let's Encrypt por `tailscale cert`. Caduca a los 90 días; lo renueva `aerobim-certificado.timer`                                                 |
| Expiración de clave del nodo | **Desactivada** en la consola del tailnet. Si alguien la reactiva, la VM sale del tailnet a los 180 días y el servicio queda sano e inalcanzable |
| Base de datos                | PostgreSQL 16                                                                                                                                    |
| Respaldos                    | `/var/backups/aerobim`, 14 juegos, `aerobim-respaldo.timer` a las 02:00                                                                          |

**Las cuatro cifras del primer día**, porque sin línea base «está creciendo» no es un dato:

|                                                           | Valor el día que se desplegó |
| --------------------------------------------------------- | ---------------------------- |
| Lo que ocupa un juego de respaldo                         |                              |
| `df -h /` libre                                           |                              |
| Memoria de un worker en reposo (`ps -o rss= -C gunicorn`) |                              |
| Filas de `core_auditevent`                                |                              |

## Lo que corre solo

Cinco trabajos, todos con `Persistent=true` —si la máquina estuvo apagada, se hacen al arrancar— y
todos en **hora local**, que exige `timedatectl set-timezone America/Santiago`.

| Cuándo             | Qué                                      | Unidad                        |
| ------------------ | ---------------------------------------- | ----------------------------- |
| 02:00 diario       | Respaldo de la base y de los documentos  | `aerobim-respaldo.timer`      |
| 03:30 los domingos | Sesiones caducadas y registros de acceso | `aerobim-mantenimiento.timer` |
| 04:30 diario       | Renovar el certificado y recargar nginx  | `aerobim-certificado.timer`   |
| 07:30 diario       | Resumen de pendientes por correo         | `aerobim-resumen.timer`       |
| Diario             | Rotación del registro                    | `logrotate`, del sistema      |

```bash
systemctl list-timers 'aerobim-*'
```

## El repaso diario, un minuto

```bash
curl -s https://<host>.<tailnet>.ts.net/health/ | python3 -m json.tool
systemctl is-active aerobim nginx postgresql
systemctl list-timers 'aerobim-*' --all
```

Y una cosa que **ningún `curl` sustituye**: mirar **`/administracion/trabajos/`** en el navegador. Es
donde se ve una corrida que murió a mitad y, sobre todo, **un correo que no salió** — una corrida que
fue bien y un correo que no salió se ven igual si nadie lo marca, y ahí se marca.

## El repaso semanal

```bash
df -h / /var/backups /var/log /tmp
journalctl --disk-usage
journalctl -u aerobim --since '7 days ago' -p err
ls -1d /var/backups/aerobim/*/ | tail -3
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh --verificar
```

**El respaldo se comprueba, no se supone.** `--verificar` restaura el último juego en una base
aparte, corre `manage.py check` contra ella y cuenta las migraciones. Un volcado que nunca se
restauró no es un respaldo: es un archivo del que se supone algo.

## El repaso mensual

```bash
sudo openssl x509 -in /etc/ssl/aerobim/aerobim.crt -noout -dates
tailscale status
sudo -u postgres psql aerobim -c 'select count(*) from django_session'
sudo -u postgres psql aerobim -c 'select count(*) from core_auditevent'
```

Las dos cuentas se comparan con las del primer día. `django_session` la limpia el aseo semanal;
**`core_auditevent` no la limpia nadie** — ver «Lo que no está resuelto».

## Lo que crece, y cuándo empieza a doler

| Qué                   | Por qué                                                                                                                                                                                                                                                                       | Cuándo                    | Qué hacer                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **`/var/backups`**    | El respaldo hace un `tar` **completo y sin comprimir** de los documentos en cada corrida —y con razón: son IFC, LAZ y PDF, ya comprimidos—. Catorce juegos. Con un COPC de 130 MB dentro, el primer entregable ya pesa                                                        | semanas                   | `df -h /var/backups`. Bajar `CUANTOS` en `respaldo.sh` o sacar los juegos viejos de la VM. **Es el riesgo operativo número uno** |
| **El journal**        | gunicorn manda su registro de acceso a `stdout`: **una línea por petición**                                                                                                                                                                                                   | semanas                   | `SystemMaxUse=500M` en `/etc/systemd/journald.conf`                                                                              |
| **`core_auditevent`** | Una fila por cada petición que muta. **No hay política de retención**                                                                                                                                                                                                         | meses                     | Decidirla antes de que haga falta                                                                                                |
| **Memoria**           | Ya **no** es lo que decía aquí: subir y descargar van por tramos desde el 2026-09-14, así que la memoria de una transferencia no depende del tamaño del archivo. Lo que sigue pesando es `ifcopenshell` leyendo un federado para sacar sus metadatos, y hay `cpu*2+1` workers | el primer día de uso real | **`GUNICORN_WORKERS` según la RAM y no según los núcleos.** Con 4 GB, tres                                                       |
| **`/tmp`**            | Django escribe a temporales las subidas de más de 2,5 MB                                                                                                                                                                                                                      | con el primer COPC grande | `df -h /tmp`. Si es `tmpfs`, esa subida es RAM                                                                                   |

## Cómo se reinicia, y cómo se sabe que reinició

```bash
sudo systemctl restart aerobim
curl -s https://<host>.<tailnet>.ts.net/health/
```

**El `curl` no es adorno.** `systemctl restart` vuelve sin error aunque los workers hayan muerto al
cargar los ajustes: es lo único que distingue «reiniciado» de «reiniciado y sirviendo».

Para actualizar, el guion hace los siete pasos y **termina comprobando `/health/`**:

```bash
sudo -u aerobim /opt/aerobim/services/api/deploy/desplegar.sh
```

**Antes, un respaldo a mano.** El de las 02:00 no sirve si el despliegue es a las 10:00. Y **los
despliegues no se hacen el día de una sesión del piloto**.

## Cómo se restaura

Escrito para leerse con prisa.

1. **Elegir el juego.** `ls -1d /var/backups/aerobim/*/` — el nombre es la fecha y la hora.
2. **Las dos mitades tienen que ser del mismo sello.** La base guarda _qué_ existe y el `tar` guarda
   _los bytes_: recuperar mitades de fechas distintas deja revisiones apuntando a archivos que
   todavía no existen.
3. Parar el servicio: `sudo systemctl stop aerobim`.
4. La base:
   ```bash
   sudo -u postgres dropdb aerobim && sudo -u postgres createdb -O aerobim aerobim
   sudo -u aerobim pg_restore --dbname=aerobim --no-owner --no-privileges <juego>/base.dump
   ```
5. Los documentos:
   ```bash
   sudo -u aerobim tar --extract --file=<juego>/documentos.tar --directory=/var/lib/aerobim
   ```
6. Arrancar y comprobar: `sudo systemctl start aerobim && curl .../health/`.

## Qué hacer si…

| Síntoma                                                    | Casi siempre es                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **«Entro y no veo nada»**, con el portal cargando bien     | Falta la **`Membresia`**. Sin ella todas las listas salen vacías **sin un solo mensaje**. Y ojo: un superusuario lo ve todo igualmente, así que probar con esa cuenta no prueba nada                                                                                                                      |
| **No llega el resumen**                                    | `/administracion/trabajos/`: dice si la corrida fue y si el correo salió                                                                                                                                                                                                                                  |
| **Subí un DWG y no lo puedo abrir**                        | Falta ODA File Converter. El archivo está guardado y se descarga; lo que falta es el DXF                                                                                                                                                                                                                  |
| **El visor se queda cargando un IFC, sin error**           | Alguien añadió `Cross-Origin-Opener-Policy` **y** `Cross-Origin-Embedder-Policy`. Es la trampa más cara del proyecto y no emite ningún mensaje                                                                                                                                                            |
| **La página del visor sale en blanco**                     | Un proxy sobreescribió la `Content-Security-Policy`. Tiene que llevar `'wasm-unsafe-eval'` y `worker-src 'self' blob:`                                                                                                                                                                                    |
| **`ERR_TOO_MANY_REDIRECTS`**, o los botones no hacen nada  | nginx no está mandando `X-Forwarded-Proto`. Sin ella Django redirige en bucle, y en su versión silenciosa **cada POST responde 403**                                                                                                                                                                      |
| **Todo va bien y nadie puede entrar**                      | La clave del nodo de Tailscale caducó. La consola del tailnet lo dice                                                                                                                                                                                                                                     |
| **`413` al subir**                                         | `client_max_body_size` en nginx. Son 200 MB, igual que el tope del registro                                                                                                                                                                                                                               |
| **«Revisar interferencias» dice que no cabe y no arranca** | **Es correcto, no un fallo.** Los pares crecen al cuadrado: con cuatro modelos vigentes son seis comparaciones, unos dos minutos, y eso no entra en una petición — antes moría a mitad **dejando hallazgos escritos**. Se corre desde el servidor: `manage.py detectar_interferencias`, que no tiene tope |

## Lo que no está resuelto, dicho

- **El respaldo vive en la misma VM.** Protege de un borrado, **no** de que se muera el disco ni de
  que se pierda la máquina. Con qué se saca —`rclone`, un `scp`, el respaldo del hipervisor— es una
  decisión de infraestructura. Y si sale de la VM **tiene que ir cifrado**: el volcado lleva correos
  y hashes de contraseña.
- **`core_auditevent` no tiene retención.** Ni el comando ni la decisión existen.
- **El dominio público.** Hoy quien no esté en el tailnet no entra, y los enlaces del correo solo
  resuelven en un dispositivo con Tailscale. Lo que cambia el día que haya dominio está en
  `DEPLOY.md`.
- **ODA File Converter**, si se instala tarde: las revisiones ya subidas **no se reconvierten** y el
  comando que las recorra no está escrito.
