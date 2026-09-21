# Codificación

> Cómo se nombra lo que se registra en AeroBim: las obras y los entregables.
> La implementación vive en `services/api/apps/documents/codificacion.py` y sus pruebas en
> `apps/documents/tests/test_la_codificacion.py`.

## Por qué existe este documento

Hasta hoy `Entregable.codigo` era **texto libre sin una sola regla escrita**: ni validación, ni
generador, ni un documento que dijera qué forma tiene. En `docs/` no había nada sobre codificación.
Eso tiene una consecuencia concreta y cara: dos personas de la misma oficina codifican el mismo
plano distinto, y nadie se entera hasta que hay que buscarlo seis meses después.

---

## 1. El código de un entregable

Siete campos separados por `-`, que es el nombre de contenedor de información de **BS EN ISO
19650-2, Anexo Nacional**:

```
OBRA   - ORIG - VOL - NIV - TIPO - DISC - NÚMERO
716LCD -  JEJ -  ZZ -  XX -   M3 -   ME -   0001
```

| Campo      | Qué es                     | De dónde sale                                                   |
| ---------- | -------------------------- | --------------------------------------------------------------- |
| **OBRA**   | El proyecto                | `Proyecto.codigo`, sin separadores (`716-LCD` → `716LCD`)       |
| **ORIG**   | Quién originó el documento | El `slug` de la organización, en mayúsculas, hasta 6 caracteres |
| **VOL**    | Volumen o sistema          | `ZZ` = toda la obra (el caso normal)                            |
| **NIV**    | Nivel o ubicación          | `XX` = varios niveles · `ZZ` = no aplica                        |
| **TIPO**   | Qué clase de documento     | Tabla de abajo                                                  |
| **DISC**   | Disciplina                 | `Disciplina.codigo` (`AR`, `ES`, `ME`…)                         |
| **NÚMERO** | Correlativo                | Cuatro cifras, por obra + tipo + disciplina                     |

### Los tipos

| Código | Qué es                 | Nuestro `TipoEntregable` |
| ------ | ---------------------- | ------------------------ |
| `DR`   | Plano                  | `plano`                  |
| `M3`   | Modelo 3D              | `modelo`                 |
| `RP`   | Memoria, informe       | `memoria`                |
| `SP`   | Especificación técnica | `especificacion`         |
| `ZZ`   | Otro o no aplica       | `otro`                   |

**`TipoEntregable` no cambia de valores.** Está en la base, en los formularios y en las
traducciones; reescribirlo para que guardara `DR` en vez de `plano` sería una migración con riesgo a
cambio de nada. La traducción vive en `codificacion.TIPO_ISO`, que es el único sitio que la necesita.

### El número se calcula leyendo, no contando

`codificacion.siguiente_numero()` busca **el mayor número que ya existe** en esa combinación de obra,
tipo y disciplina. Contar entregables daría un número repetido en cuanto alguien borre uno o registre
uno con codificación ajena.

Y los códigos que no siguen la estructura **no participan del cálculo**: el `P-102` que mandó un
tercero no dice nada sobre cuál es nuestro siguiente número.

---

## 2. La regla que gobierna todo: propone, no obliga

**Un código que no sigue la estructura se guarda igual, y la pantalla lo dice.**

No es dejadez. `Revision.correlativo` lleva escrito el motivo desde su primer día, y vale igual
aquí:

> «Va como texto porque cada mandante impone el suyo, y forzar un formato rechaza documentos
> válidos.»

Un plano que llega de un tercero con **su** codificación es un documento válido. Una aplicación que
no lo deja registrar no es más rigurosa: es inservible, y el trabajo se va a una carpeta compartida
donde no hay ningún registro.

Entonces:

- El formulario **llega con el código ya compuesto y el número puesto**. Quien no quiera pensarlo, no
  lo piensa.
- Si se teclea otro, se guarda y queda marcado como fuera de norma (`EntregableForm.codigo_fuera_de_norma`).
- **No hay ningún `validators=[...]`** colgado del campo del modelo, y no debe haberlo.

Lo que sí se impone es la **normalización**: el código se guarda en mayúsculas y sin espacios en los
bordes. Es un identificador, no un texto — `716-lcd-…` y `716-LCD-…` son el mismo documento, y la
restricción de unicidad de la base los daba por distintos. `Proyecto` y `Disciplina` ya lo hacían;
`Entregable` era el único que no, siendo el que más códigos tiene.

---

## 3. Las obras de prueba no se marcan con un prefijo

**Se marcan con un campo: `Proyecto.naturaleza`** — `real` · `prueba` · `demo`.

Un `PRB-` acordado de palabra lo respeta quien se acuerda. Y un prefijo dentro de un texto libre no
se puede filtrar sin adivinar, no se puede pintar distinto sin partir cadenas, y deja de existir el
día que alguien escriba `PRUEBA-2`.

Con un campo cerrado:

- Se ve de un vistazo en la lista, en la ficha y en la portada (`generic/_naturaleza.html`), con una
  píldora **rayada** — que se distingue impresa en blanco y negro y la distingue quien no distingue
  el ámbar del gris.
- Se puede esconder de la lista de obras, y la elección se recuerda entre visitas.
- Se dibuja **solo cuando la obra no es real**: una píldora «Obra real» en el 95 % de las filas
  dejaría de leerse justo el día que una dijera otra cosa.

Por omisión una obra nace **real**. Lo excepcional se declara.

---

## 4. El avance, y por qué el número era incoherente

Dos nombres, dos escalas, los dos del modelo:

| Propiedad                | Escala        | Para qué |
| ------------------------ | ------------- | -------- |
| `Proyecto.avance_fisico` | `0.0` – `1.0` | Calcular |
| `Proyecto.avance_pct`    | `0` – `100`   | Pintar   |

`avance_pct` **no existía**: se calculaba a mano en una sola vista (la portada), y la lista de obras
lo pedía sin que nadie se lo pusiera. En una plantilla de Django un atributo que no existe no es un
error, es la cadena vacía — así que la columna entera salía con `width: %` y un `%` sin número, en
todas las filas y sin una sola señal.

Hay un guardián que impide que vuelva:
`apps/projects/tests/test_el_avance_se_pinta.py` recorre las plantillas y falla si alguna pinta
`avance_fisico`, que es la fracción y ninguna pantalla quiere enseñar `0.75`.

> **Nota de vocabulario, ya documentada en tres sitios:** `avance_fisico` **no mide avance físico**.
> Mide avance documental — cuánto del papel está emitido y en qué idoneidad. Una obra al 100 % de
> `avance_fisico` puede no tener un ladrillo puesto.
