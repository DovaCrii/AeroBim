# El piloto en la obra del CC 741

> El guion para probar AeroBim con **personas reales** en la pasarela del CC 741 · Camino Agrícola.
> Está escrito para que el equipo lo siga sin nadie que lo explique: cada etapa dice qué hace falta
> para empezar, qué se considera terminado, y **con qué se comprueba que salió bien** — con una
> herramienta que no sea AeroBim, siempre que exista.

## 1. Para qué es esto

**No es una demostración.** Es un ciclo real de trabajo con archivos reales, para responder tres
preguntas que ninguna prueba automática contesta:

1. ¿Alguien de la obra puede usarlo **sin que le expliquen la pantalla**?
2. ¿Lo que sale de AeroBim —un DXF, un BCF, un informe, un CSV— **abre en las herramientas que ya
   usa la oficina**?
3. ¿Qué falta de verdad? La lista de mejoras hasta hoy la escribió quien programó; esta la escribe
   quien trabaja.

Lo que se decida arreglar entra en `MASTER_PLAN.md` como una fila con su origen (`PILOTO obs <uuid>`)
**y su oráculo**. Lo que no, se dice y se deja escrito por qué.

## 2. Quién participa

**Una persona real = una cuenta con correo real.** Los avisos salen a `usuario.email`
(`apps/documents/notify.py`), así que una cuenta sin correo entra, trabaja y **no recibe nada**.

| Persona                                             | Grupo (`apps/accounts/roles.py`) | Qué hace                                                                                      |
| --------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| Coordinador BIM                                     | `Coordinador BIM`                | Obra, entregables, etiquetas, reparto, transmittals, interferencias, BCF, informe. **Cierra** |
| Proyectista (estructura, y luego cada especialidad) | `Proyectista`                    | Sube revisiones, responde, valida IDS. **No cierra**                                          |
| ITO                                                 | `Revisor`                        | Abre observaciones sobre documento y modelo, cambia idoneidad, cierra las suyas               |
| Mandante                                            | `Mandante`                       | Lee **solo A y B**, descarga, comenta, acusa transmittals. **No abre observaciones**          |
| Dirección _(opcional)_                              | `Direccion`                      | Solo el resumen por correo                                                                    |

**El ITO va en `Revisor` y no en `Mandante`**, y la diferencia importa: `Mandante` no puede abrir
observaciones, y el ITO existe para abrirlas.

**La cuenta de administración va aparte de la del coordinador.** Trabajar todo el día con la cuenta
que puede borrar una obra es cómo se borra una obra.

> ### La trampa que cuesta media hora entender
>
> **Sin `Membresia`, la cuenta entra y no ve nada.** `scope_queryset_to_organizacion` devuelve
> `none()` para quien no es miembro: el login funciona, el portal carga, y **todas las listas salen
> vacías, sin un solo mensaje que lo explique**. Por eso el paso 5 del checklist no es «entró» sino
> «entró **y vio la obra**».

## 3. Las etapas

Cada una empieza cuando la anterior cerró. **Ninguna cierra con un hallazgo de prioridad `alta`
abierto** en la obra `PILOTO-AEROBIM`.

| Etapa                       | Estado | Hace falta                                              |
| --------------------------- | ------ | ------------------------------------------------------- |
| 0 · Preparación             | ⬜     | El checklist de la sección 6                            |
| 1 · Registro documental     | ⬜     | La etapa 0. **No hace falta el IFC: empieza ya**        |
| 2 · Visor con el primer IFC | ⬜     | Que llegue el modelo de la pasarela (en construcción)   |
| 3 · Coordinación            | ⬜     | ≥ 1 IFC vigente para notas; **≥ 2** para interferencias |
| 4 · Nube y desviación       | ⬜     | El COPC en el expediente y el IFC con emplazamiento     |

### Etapa 1 · Registro documental

**Un ciclo entero, de verdad:** entregable → revisión en `S3` → observación con dueño y fecha →
respondida → cerrada con su resolución → publicada en `A` → el mandante ve **solo la A**.

Se comprueba con:

- El **correo de asignación recibido** en la bandeja de quien recibió el hallazgo. No «enviado»:
  recibido.
- El `sha256` del archivo descargado **igual al original** (`sha256sum` en el equipo de quien lo
  descarga, contra el que enseña la ficha de la revisión).
- La observación anclada a un punto del documento **aparece en el mismo sitio en otro equipo**.
- El CSV exportado **abre en Excel con los acentos bien**.

### Etapa 2 · Visor con el primer IFC

Al pedir el modelo, pedirlo así: **IFC4, con `IfcMapConversion` y EPSG:32719** (ver
[`FORMATOS.md`](FORMATOS.md)). Sin el emplazamiento la nube no se calza sola y hay que señalar tres
pares a mano.

Se comprueba con: **el mismo IFC abierto en Bonsai/BlenderBIM** — mismos GUID, misma cantidad de
elementos por clase, y tres cotas conocidas iguales dentro de tolerancia. Y el DXF generado por
AeroBim **abriendo en el CAD de la oficina**.

### Etapa 3 · Coordinación

Una reunión de coordinación real, con el informe en PDF, y un BCF que **va y vuelve**.

Se comprueba con: el BCF exportado **abierto en Solibri, Navisworks o BIMcollab Zoom** — con su
cámara, su foto y su elemento seleccionado. Y la respuesta importada de vuelta **no duplica** los
temas que ya estaban.

### Etapa 4 · Nube y desviación

El ITO abre una observación de desviación con las seis cifras, y el proyectista responde. **Empieza
por el calce automático**, que es el que está verificado; el manual de tres pares es el respaldo.

Se comprueba con: **CloudCompare** —solo lo tiene el usuario— haciendo `cloud-to-mesh` sobre el
mismo elemento, y `pdal info` sobre el COPC comparado con el LAS original.

## 4. Cómo se registra un hallazgo

**En AeroBim mismo**, en la obra `PILOTO-AEROBIM`. No en un chat, no en un cuaderno: si el producto
no sirve para anotar lo que le falta, eso también es un hallazgo.

Un hallazgo lleva **una etiqueta de cada eje** —el prefijo es lo que los separa—, prioridad y
**fecha**:

| Eje          | Etiquetas                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------- |
| Qué clase es | `defecto` (algo está mal) · `mejora` (funciona y podría ser mejor) · `duda` (no se entiende) |
| Dónde se vio | `pantalla:portal` · `:expediente` · `:observaciones` · `:visor` · `:documento` · `:nube`     |
| Del triage   | `plan:pospuesto`, para que lo aparcado no se cuente como abierto sin más                     |

Ciclo, con los estados que ya existen: `abierta` = nuevo → `respondida` = triado → `cerrada`
**verificado en el despliegue**, con su `resolucion` → `descartada` con su motivo.

**Sin fecha, un hallazgo no está en la bandeja de nadie**: `pendientes_por_tramo` filtra por
`responsable` y `vence`. Repartir es lo que convierte un hallazgo en la tarea de alguien.

## 5. Cadencia y guiones

**Sesiones** de 60–90 min, 2–3 personas, con un guion por rol. Regla: **no ayudar los primeros diez
minutos**. Lo que alguien no encuentra en diez minutos es un hallazgo, y ayudar antes lo borra.

**Triage semanal**, 45 min, sobre
`/documentos/observaciones/?obra=PILOTO-AEROBIM&estado=abierta&orden=-prioridad`. Tres salidas y
ninguna más: **arreglar** (entra a `MASTER_PLAN.md` con origen y oráculo), **posponer**
(`plan:pospuesto`), **descartar** (con motivo escrito).

**Un despliegue por semana**, después del triage, con el commit anotado en la bitácora. **Las
sesiones no se programan el día del despliegue**: la interfaz cambiando a mitad de una sesión
invalida lo que se observó.

La lista tabular con `?estado=` y orden por prioridad basta para 30–60 filas; **la vista tablero no
se construye para el piloto** y se reabre solo si el triage la pide dos semanas seguidas.

## 6. El checklist antes de empezar

> **Qué de esto está corrido de verdad y qué no** (2026-09-08). Los tres comandos que el checklist
> nombra tenían pruebas y **no se habían ejecutado nunca**, que son dos cosas distintas: una prueba
> comprueba lo que alguien imaginó que podía fallar, y una corrida comprueba el resto.
>
> | Comando           | Corrido | Lo que enseñó                                                                                                                                                                                                                                             |
> | ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `preparar_piloto` | ✅      | Crea la organización, la membresía, la obra y sus 10 etiquetas. **Corrido tres veces seguidas**: la segunda y la tercera dicen «ya existía» y añaden 0 etiquetas — la idempotencia que promete es real                                                    |
> | `enviar_resumen`  | ✅      | Genera un correo por persona con sus pendientes. **Y avisa de que no está enviando**: «CORREO NO ENVIADO: EMAIL_HOST no esta configurado», nombrando las cinco variables que faltan. No finge                                                             |
> | `metricas_piloto` | ✅      | Salió entero **y con un defecto**: no contaba el ancla de la nube que `F12.14` acababa de añadir, así que esas observaciones desaparecían del bloque de contexto. Arreglado el mismo día                                                                  |
> | `respaldo.sh`     | ❌      | **Sigue sin correrse.** Necesita PostgreSQL —`pg_dump`, `pg_restore`, `createdb`— y aquí la base es SQLite. Es la razón de que no se instale un timer para él: un respaldo automático que nadie vio funcionar es peor que ninguno, porque se confía en él |
>
> Todo esto fue contra la base de **desarrollo** y con el correo a consola. Lo que hace falta en la
> VM sigue en el checklist de abajo.

- [ ] Decidida **la rama a desplegar** y la VM.
- [ ] `/health/` responde `ok`. Sin COOP/COEP, `client_max_body_size 200M`, `conversor_cad` según se
      haya decidido sobre ODA ([`DEPLOY.md`](DEPLOY.md)).
- [ ] `EMAIL_BACKEND` de SMTP **real**. Con el de consola la aplicación diría «enviado» y lo
      imprimiría en el log.
- [ ] El **timer del resumen** instalado, y probado con `enviar_resumen --dry-run` y una corrida de
      verdad. Hasta el 2026-09-07 **no existía**: el resumen no salía nunca.
- [ ] Base **limpia**, no la de desarrollo: `migrate`, `bootstrap_roles`, `createsuperuser`,
      `preparar_piloto`.
- [ ] **Cada cuenta entró y vio la obra.** No solo entró: ver la trampa de la sección 2.
- [ ] Al menos **una revisión en `A`**, o el mandante entra a un expediente vacío.
- [ ] **Copia de seguridad hecha y restaurada una vez**: `respaldo.sh` y `respaldo.sh --verificar`.
      Un volcado que nunca se restauró no es un respaldo.
- [ ] **Nada del CC 741 en `apps/web/public/`.** `HEAD /static/visor/samples/...` tiene que dar 404.

## 7. Las métricas, con su consulta

**La mitad automática** sale de un comando de solo lectura — no escribe nada, no deja fila de
trabajo, y se puede correr a mitad de una sesión sin cambiar lo que se está midiendo:

```bash
cd /opt/aerobim/services/api
sudo -u aerobim .venv/bin/python manage.py metricas_piloto --obra PILOTO-AEROBIM
sudo -u aerobim .venv/bin/python manage.py metricas_piloto --desde 2026-09-08 --hasta 2026-09-14
```

Da: hallazgos abiertos, cerrados y **descartados aparte** —descartar no cuenta como arreglar—;
tiempo de ciclo con mediana, media y máximo; **con qué contexto se abrieron** (punto de vista, foto,
anclados **al modelo, a la nube o al documento** — las tres anclas reparten el total, no se
solapan); por pantalla y por tipo; cuántos tienen respuesta y **cuántos la tienen con imagen**; y lo
abierto hoy por prioridad, con las vencidas.

Esa última cifra mide lo que `F12.11` vino a resolver: hasta el 2026-09-08 una queja del portal se
contaba con palabras. **Si nadie adjunta nada, la función no hizo falta** — y saberlo vale tanto
como lo contrario.

**La otra mitad se anota a mano en la bitácora**, porque la base no la sabe:

| Métrica                            | De dónde sale                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Expediente → modelo, «hasta verse» | Cronómetro en la sesión. El log da el `Δ` entre las dos peticiones, no cuándo se vio |
| Errores 4xx y 5xx                  | `status_code` en `aerobim.log`                                                       |
| Quién abandonó una tarea           | Mirando. No hay forma de contarlo                                                    |

**La primera semana es la línea base. No se fijan metas antes de tenerla.**

## 8. Qué no se prueba, y por qué

Decirlo de entrada evita que alguien lo eche en falta a mitad y lo apunte como defecto:

| Fuera                             | Por qué                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| Gaussian splatting (`F2.6`)       | Decisión del usuario: fuera de alcance                                 |
| Fase 6 (Cesium, territorio)       | Ídem                                                                   |
| `F4.5` trazo libre                | Espera que el usuario mire un BCF exportado                            |
| Varias organizaciones a la vez    | Hay una; el aislamiento está probado en las pruebas, no con personas   |
| Token de API                      | Nada externo consume la API todavía                                    |
| PostgreSQL bajo concurrencia real | SQLite con WAL basta para cinco personas. Se mide si aparecen bloqueos |
| Validación IDS                    | Hace falta **un IDS del mandante**, y no hay                           |
| Detección de interferencias       | Hacen falta **dos IFC vigentes**. Con uno no hay nada que cruzar       |

## 9. Qué hacer si…

**«Entro y no veo nada, ni las obras.»** Falta la `Membresia`. No es un fallo de permisos y no da
error: da vacío. Lo arregla `preparar_piloto --miembro <usuario>`.

**«Me dice que la sesión caducó.»** La sesión dura **12 h y se renueva en cada petición**
(`SESSION_COOKIE_AGE`, `SESSION_SAVE_EVERY_REQUEST`), así que caduca por **12 h sin tocar nada** —
típicamente al volver al día siguiente. Se entra otra vez. Si pasa a mitad de escribir una nota, es
un hallazgo: apúntalo con `pantalla:visor`.

**«No me deja entrar y la clave es la buena.»** Cinco intentos fallidos bloquean **el nombre de
usuario** durante 15 min (`django-axes`). Se espera, o se desbloquea:

```bash
sudo -u aerobim .venv/bin/python manage.py axes_reset_username <usuario>
```

**«Subí un DWG y no puedo abrirlo en el visor.»** Falta ODA File Converter en el servidor, o esa
revisión entró antes de instalarlo — la conversión pasa **al recibir el archivo** y no se reintenta.
El original sigue guardado y descargable. Ver [`FORMATOS.md`](FORMATOS.md).

**«El visor está vacío y soy el mandante.»** Es correcto: el mandante ve **solo `A` y `B`**. Si todo
está en `S3`, no hay nada que abrir.

**«No llega el resumen por correo.»** `/administracion/trabajos/` lo dice: si el correo no sale de la
máquina, el resumen de la corrida lleva un prefijo que lo marca. **Una corrida que fue bien y un
correo que no salió se ven igual** sin ese aviso.

**«Abrí la nube y no se ve nada.»** El visor abre **COPC**, no un LAZ cualquiera: un `.laz` suelto se
archiva pero no se ofrece abrir. Se convierte con `apps/web/scripts/a-copc.py`.

**«No llegó todavía el IFC de esta etapa y ya tengo el levantamiento.»** No hace falta esperar
(`F12.14`): con la nube sola se encuadra, se mide y **se deja una nota anclada a una coordenada**.
Se pulsa un punto de la nube y su ficha sale a la izquierda con la coordenada del archivo, y desde
ahí «Dejar una nota aquí». La coordenada va también en el texto del BCF, porque el formato no sabe
señalar un punto de una nube.

**«Adjunté una captura al comentario y el mandante no la ve en Solibri.»** Es correcto y está dicho
debajo del campo: un BCF lleva la imagen **del tema**, no las del hilo. El adjunto se queda en
AeroBim. Si la imagen tiene que viajar, va como instantánea de la observación —la que toma el
visor— o como un entregable con su código.

## 10. Bitácora semanal

Una entrada por semana, en este archivo, debajo de esta línea. Corta y con las cifras pegadas del
comando:

```
### Semana del AAAA-MM-DD
Desplegado: <commit>
Sesiones: <quién, cuánto, qué etapa>
Hallazgos: <abiertos> nuevos · <cerrados> cerrados · <pospuestos> pospuestos
Lo que salió: <una línea por hallazgo que importe>
Decidido en el triage: <a MASTER_PLAN / pospuesto / descartado>
Métricas: <pegar la salida de metricas_piloto>
```

_(Sin entradas todavía: el piloto no ha empezado.)_

## 11. Los datos y el respaldo

**Nada del CC 741 entra en el repositorio.** Ni los IFC, ni los DWG, ni la nube, ni los PDF — y
**tampoco los BCF ni los informes exportados**, que son dato de obra igual que el original
(`AGENTS.md`). Los archivos viven en `DOCUMENTS_DIR`, fuera del repositorio, y un `git pull` no puede
tocarlos.

**Antes de la primera sesión**, y después una vez al día:

```bash
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh
sudo -u aerobim /opt/aerobim/services/api/deploy/respaldo.sh --verificar
```

Son **dos cosas** y por eso se copian juntas: la base guarda _qué_ existe y `documentos/` guarda _los
bytes_. Un volcado sin los archivos es un catálogo de archivos que no están. El detalle y lo que
todavía **no** está —sacar la copia de la VM, y cifrarla si sale— en
[`DEPLOY.md`](DEPLOY.md#copias-de-seguridad).

Y la primera sesión empieza leyendo en voz alta **«La frase que define el alcance»** de
[`MVP.md`](MVP.md), para que nadie eche en falta un modelador: AeroBim revisa y coordina.
