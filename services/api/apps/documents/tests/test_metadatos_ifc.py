"""Lo que un IFC declara de si mismo: `F3.3`.

Los fixtures son **IFC escritos a mano**, minimos y con un caso por cada cosa que puede salir mal.
No se usa un modelo del cliente: `AGENTS.md` lo prohibe, y ademas un archivo real no permite
comprobar el caso raro — hay que poder escribir un sitio en `(0, 0, 0, 0)` a proposito.

Los dos defectos que estas pruebas fijan aparecieron **en la primera pasada sobre los modelos
reales**, y ninguno se habria visto con un solo archivo de muestra:

1. `IfcMapConversion` **no existe en IFC2X3** y pedirlo alli levanta, asi que la extraccion entera
   fallaba para la mayoria de los IFC del mundo. El de muestra en IFC4 funcionaba.
2. Un sitio con latitud y longitud **exactamente cero** salia como georreferenciado. Es el marcador
   de posicion que escriben Revit y otros cuando nadie fijo el emplazamiento, y creerselo manda a
   buscar el edificio a la isla nula, en el golfo de Guinea.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission

from apps.core.models import Membresia
from apps.documents.ifc import extraer


@pytest.fixture
def mirona_con_expediente(db, client, organizacion):
    """Alguien que puede abrir el expediente, y nada mas. Ya conectada.

    Las dos pruebas de pantalla de este archivo miran **lo que dice la plantilla**, no los permisos
    —eso lo cubre `test_pantallas.py`—, asi que el usuario se monta con lo justo para que la pagina
    abra y la fila de la revision aparezca.

    **Y `change_revision` hace falta de verdad, no es un atajo.** El expediente muestra a quien solo
    lee unicamente las revisiones **publicadas**, y la del fixture es una `S3` en curso: sin ese
    permiso la fila no se dibuja y la prueba comprobaria una pagina vacia. Que sea el coordinador
    quien vea esto tambien es lo correcto: es quien decide si el modelo se puede cruzar con la nube.
    """
    usuario = get_user_model().objects.create_user(username="mirona", password="clave-larga-99")
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    for codename in ("view_entregable", "change_revision"):
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label="documents", codename=codename)
        )
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    return usuario


def ifc(esquema: str, cuerpo: str) -> str:
    """Un IFC valido y minimo, con el esquema y las entidades que se le pidan."""
    return (
        "ISO-10303-21;\n"
        "HEADER;\n"
        "FILE_DESCRIPTION((''),'2;1');\n"
        "FILE_NAME('prueba','2026-08-26T00:00:00',(''),(''),'','','');\n"
        f"FILE_SCHEMA(('{esquema}'));\n"
        "ENDSEC;\n"
        "DATA;\n"
        f"{cuerpo}"
        "ENDSEC;\n"
        "END-ISO-10303-21;\n"
    )


# Un proyecto con unidades en milimetros. Es lo minimo para que `calculate_unit_scale` conteste.
BASE_2X3 = """\
#1=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaa0',$,'Proyecto de prueba',$,$,$,$,(#20),#10);
#10=IFCUNITASSIGNMENT((#11));
#11=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
"""


def escribir(tmp_path, texto: str):
    ruta = tmp_path / "modelo.ifc"
    ruta.write_text(texto, encoding="utf-8")
    return ruta


#: El mismo proyecto, declarando la masa en **gramos sin prefijo**.
#:
#: **No es un caso inventado**: es lo que declara un modelo real del usuario mientras escribe
#: valores que son kilos, y por eso la ficha de un perfil de acero mostraba `UnitWeight 85,3 g`.
CON_MASA_EN_GRAMOS = BASE_2X3.replace(
    "#10=IFCUNITASSIGNMENT((#11));",
    "#10=IFCUNITASSIGNMENT((#11,#12));\n#12=IFCSIUNIT(*,.MASSUNIT.,$,.GRAM.);",
)


def test_se_lee_la_unidad_de_masa_declarada_tal_como_esta(tmp_path):
    """**Se guarda para que se vea, no para corregirla.**

    Un exportador que declara `GRAM` mientras escribe kilos produce un dato malo, y la lectura fiel
    lo muestra tal cual: `85,3 g` para un perfil. Cambiarlo por `kg` desde acá seria inventar el
    mismo error de tres ordenes de magnitud que este proyecto se cuida de no cometer, solo al
    reves. Lo que se hace es dejarlo a la vista en el expediente, para que quien recibe el modelo
    pueda pedirle la correccion a quien lo exporto.
    """
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", CON_MASA_EN_GRAMOS)))

    assert datos["unidades"]["masa"] == "GRAM"


def test_un_archivo_que_no_declara_masa_no_inventa_una(tmp_path):
    """Callar es la respuesta correcta: la unidad que no esta, no esta."""
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", BASE_2X3)))

    assert datos["unidades"]["masa"] == ""


def test_lee_el_esquema_las_unidades_y_el_proyecto(tmp_path):
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", BASE_2X3)))

    assert "error" not in datos
    assert datos["esquema"] == "IFC2X3"
    assert datos["proyecto"] == "Proyecto de prueba"
    # El factor importa mas que el nombre: es lo que dice si un numero son metros o milimetros.
    assert datos["unidades"]["metrosPorUnidad"] == pytest.approx(0.001)
    assert "MILLI" in datos["unidades"]["longitud"]


def test_un_ifc2x3_no_falla_por_no_tener_conversion_de_mapa(tmp_path):
    """**Es el defecto que se habria escapado.**

    `IfcMapConversion` es de IFC4; en IFC2X3 `by_type` no devuelve vacio, **levanta**. Antes eso
    convertia "este IFC2X3 no tiene conversion de mapa" —que es lo normal— en "no se pudieron leer
    los metadatos", y la mayoria de los IFC de obra siguen siendo IFC2X3.
    """
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", BASE_2X3)))

    assert "error" not in datos
    assert datos["georreferencia"]["georreferenciado"] is False
    assert datos["georreferencia"]["conversiones"] == []


def test_un_sitio_en_cero_cero_no_esta_georreferenciado(tmp_path):
    """**Latitud y longitud exactamente cero son el marcador de posicion, no una ubicacion.**

    Es lo que declara `Piso 5.ifc`, y darlo por bueno manda a buscar el edificio a la isla nula.
    """
    cuerpo = (
        BASE_2X3 + "#30=IFCSITE('0bbbbbbbbbbbbbbbbbbbb0',$,'Site',$,$,$,$,$,.ELEMENT.,"
        "(0,0,0,0),(0,0,0,0),0.,$,$);\n"
    )
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", cuerpo)))

    assert datos["georreferencia"]["georreferenciado"] is False
    assert datos["georreferencia"]["via"] == ""
    # Las coordenadas **se informan igual**: lo que se niega es que situen el proyecto, no que
    # esten escritas.
    [sitio] = datos["georreferencia"]["sitios"]
    assert (sitio["latitud"], sitio["longitud"]) == (0.0, 0.0)


def test_un_sitio_con_coordenadas_de_verdad_si_esta_georreferenciado(tmp_path):
    """Y con el signo donde va: en IFC **solo el primer termino lo lleva**.

    `(-33, 26, 15)` es 33° 26' 15" **sur**. Sumando los terminos con su signo saldria una latitud
    en otro hemisferio, que es un error que no se ve hasta que el modelo aparece en el mar.
    """
    cuerpo = (
        BASE_2X3 + "#30=IFCSITE('0bbbbbbbbbbbbbbbbbbbb0',$,'Obra',$,$,$,$,$,.ELEMENT.,"
        "(-33,26,15,0),(-70,39,0,0),520.,$,$);\n"
    )
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", cuerpo)))

    geo = datos["georreferencia"]
    assert geo["georreferenciado"] is True
    assert geo["via"] == "IfcSite"
    [sitio] = geo["sitios"]
    # 33° 26' 15" sur = -33.4375. Comprobable a mano, que es lo que hace que la prueba sirva.
    assert sitio["latitud"] == pytest.approx(-33.4375)
    assert sitio["longitud"] == pytest.approx(-70.65)
    assert sitio["elevacion"] == pytest.approx(520.0)


# Un IFC4 con la conversion de mapa **completa**: desplazamiento, giro, escala y sistema.
#
# Es el archivo que hace falta para `F2.2`, y el que descubrio que faltaba el giro: la extraccion
# leia este, norte, altura y escala, y se dejaba las dos componentes del eje. Con eso el visor podia
# trasladar el modelo y **no orientarlo**.
#
# El giro son 30°: `(cos 30°, sen 30°)` = `(0.8660254, 0.5)`.
BASE_IFC4_CON_MAPA = """\
#1=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaa0',$,'Obra con mapa',$,$,$,$,(#20),#10);
#10=IFCUNITASSIGNMENT((#11));
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
#30=IFCPROJECTEDCRS('EPSG:32719','WGS 84 / UTM zone 19S',$,$,$,$,$);
#31=IFCMAPCONVERSION(#20,#30,345012.5,6298044.25,561.3,0.8660254,0.5,0.9996);
"""


def test_la_conversion_de_mapa_trae_el_giro_y_el_sistema(tmp_path):
    """**El giro es media alineacion, y no se estaba leyendo.**

    `XAxisAbscissa` y `XAxisOrdinate` son las componentes del eje X local medidas en el sistema del
    mapa: de ellas sale el angulo con el que se orienta el modelo sobre la nube. Sin ellas se podia
    situar el edificio y no orientarlo, y un edificio girado 20° sobre su levantamiento no se cruza
    con nada — que es justo lo que promete `F2.4`.

    Y el sistema de referencia se lee porque un desplazamiento sin sistema no dice donde esta el
    edificio: dice un par de numeros.
    """
    datos = extraer(escribir(tmp_path, ifc("IFC4", BASE_IFC4_CON_MAPA)))

    geo = datos["georreferencia"]
    assert geo["georreferenciado"] is True
    assert geo["via"] == "IfcMapConversion"
    [conversion] = geo["conversiones"]

    assert conversion["este"] == pytest.approx(345012.5)
    assert conversion["norte"] == pytest.approx(6298044.25)
    assert conversion["altura"] == pytest.approx(561.3)
    assert conversion["escala"] == pytest.approx(0.9996)
    # Las dos componentes, que son lo que faltaba.
    assert conversion["abscisaEjeX"] == pytest.approx(0.8660254)
    assert conversion["ordenadaEjeX"] == pytest.approx(0.5)
    assert conversion["sistema"] == "EPSG:32719"


def test_el_giro_leido_son_los_30_grados_del_archivo(tmp_path):
    """Comprobable a mano, que es lo que hace que la prueba sirva.

    `atan2(0.5, 0.8660254)` son 30°. Se comprueba aca —y no solo en `bim-core`, donde vive la
    aritmetica de la alineacion— porque lo que importa es que **el numero que sale del archivo** sea
    el que llega: una lectura que intercambiara las dos componentes daria 60° y las demas pruebas
    seguirian pasando.
    """
    datos = extraer(escribir(tmp_path, ifc("IFC4", BASE_IFC4_CON_MAPA)))
    [conversion] = datos["georreferencia"]["conversiones"]

    assert conversion["giroGrados"] == pytest.approx(30.0, abs=1e-5)


def test_el_vector_nulo_del_eje_no_es_cero_grados_medidos(tmp_path):
    """`(0, 0)` es el marcador de posicion, igual que la latitud en cero.

    Es lo que escriben los exportadores que no saben la orientacion. Devolver `0.0` lo convertiria
    en «cero grados, medidos», y el expediente diria «girado 0°» sobre un archivo que no declaro
    nada. Es el mismo error de la isla nula, en el otro campo.
    """
    cuerpo = BASE_IFC4_CON_MAPA.replace(
        "561.3,0.8660254,0.5,0.9996);",
        "561.3,0.,0.,0.9996);",
    )
    datos = extraer(escribir(tmp_path, ifc("IFC4", cuerpo)))
    [conversion] = datos["georreferencia"]["conversiones"]

    assert conversion["giroGrados"] is None
    # Las componentes crudas si se informan: lo que se niega es que orienten, no que esten escritas.
    assert conversion["abscisaEjeX"] == pytest.approx(0.0)


def test_una_conversion_sin_giro_declarado_no_inventa_uno(tmp_path):
    """`$` en las dos componentes es «no lo se», y tiene que llegar como tal.

    Un cero en su lugar se leeria como «cero grados, medidos», y son cosas distintas: el visor
    presenta la alineacion diciendo por que via la supo, y no puede decir «sin giro declarado» si el
    dato llega convertido en un numero.
    """
    cuerpo = BASE_IFC4_CON_MAPA.replace(
        "#31=IFCMAPCONVERSION(#20,#30,345012.5,6298044.25,561.3,0.8660254,0.5,0.9996);",
        "#31=IFCMAPCONVERSION(#20,#30,345012.5,6298044.25,561.3,$,$,$);",
    )
    datos = extraer(escribir(tmp_path, ifc("IFC4", cuerpo)))
    [conversion] = datos["georreferencia"]["conversiones"]

    assert conversion["abscisaEjeX"] is None
    assert conversion["ordenadaEjeX"] is None
    assert conversion["giroGrados"] is None
    assert conversion["escala"] is None
    # El desplazamiento si esta: lo que falta es la orientacion, no la posicion.
    assert conversion["este"] == pytest.approx(345012.5)


def test_un_ifc2x3_sigue_sin_traer_conversion_y_sin_fallar(tmp_path):
    """El campo nuevo no puede reabrir el defecto que `_del_tipo` cerro.

    `IfcProjectedCRS` tampoco existe en IFC2X3, y `_nombre_de_crs` se llama con lo que traiga
    `TargetCRS`. Si eso levantara, la extraccion entera volveria a fallar para la mayoria de los IFC
    de obra — que es exactamente el defecto que estas pruebas fijan.
    """
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", BASE_2X3)))

    assert "error" not in datos
    assert datos["georreferencia"]["conversiones"] == []


@pytest.mark.django_db
def test_el_expediente_dice_el_sistema_y_el_giro(client, mirona_con_expediente, revision):
    """**Lo leido tiene que llegar a la pantalla, o no sirve de nada.**

    Un "georreferenciado (IfcMapConversion)" a secas no deja decidir nada. Con el sistema y los
    grados, quien recibe el modelo comprueba en obra que el edificio esta orientado como dice —una
    brujula mide 30°— y sabe si su levantamiento esta en el mismo sistema.

    Y se prueba renderizando la pantalla de verdad porque una plantilla **falla callando**: un
    `is not None` mal escrito no levanta, deja el hueco en blanco.
    """
    from django.urls import reverse

    revision.metadatos = {
        "esquema": "IFC4",
        "unidades": {"longitud": "METRE"},
        "georreferencia": {
            "georreferenciado": True,
            "via": "IfcMapConversion",
            "conversiones": [
                {
                    "este": 345012.5,
                    "norte": 6298044.25,
                    "altura": 561.3,
                    "escala": 0.9996,
                    "abscisaEjeX": 0.8660254,
                    "ordenadaEjeX": 0.5,
                    "giroGrados": 30.0,
                    "sistema": "EPSG:32719",
                }
            ],
            "sitios": [],
        },
    }
    # **Hace falta un archivo, y no es un detalle del fixture.** El expediente muestra lo que
    # declara el modelo dentro del bloque de la revision **que tiene archivo**: sin archivo no hay
    # nada que declarar, asi que la plantilla lo omite entero — y eso es correcto.
    revision.clave_archivo = "org/proy/716-LCD-AR-P-001-P01.ifc"
    revision.nombre_original = "Piso 5.ifc"
    revision.save(update_fields=["metadatos", "clave_archivo", "nombre_original"])

    pagina = client.get(
        reverse("documents:expediente", args=[revision.entregable.pk])
    ).content.decode()

    assert "EPSG:32719" in pagina
    assert "girado 30,0° respecto al norte" in pagina


@pytest.mark.django_db
def test_el_expediente_dice_cuando_no_hay_giro_declarado(client, mirona_con_expediente, revision):
    """«Sin giro declarado» no es «girado 0°», y la pantalla tiene que distinguirlo.

    Es lo que decide si la nube se puede calzar leyendo el archivo o hay que señalar puntos a mano,
    asi que callarlo dejaria a quien mira creyendo que el modelo esta orientado.
    """
    from django.urls import reverse

    revision.metadatos = {
        "esquema": "IFC4",
        "unidades": {"longitud": "METRE"},
        "georreferencia": {
            "georreferenciado": True,
            "via": "IfcMapConversion",
            "conversiones": [
                {
                    "este": 345012.5,
                    "norte": 6298044.25,
                    "altura": 561.3,
                    "escala": None,
                    "abscisaEjeX": None,
                    "ordenadaEjeX": None,
                    "giroGrados": None,
                    "sistema": "",
                }
            ],
            "sitios": [],
        },
    }
    # **Hace falta un archivo, y no es un detalle del fixture.** El expediente muestra lo que
    # declara el modelo dentro del bloque de la revision **que tiene archivo**: sin archivo no hay
    # nada que declarar, asi que la plantilla lo omite entero — y eso es correcto.
    revision.clave_archivo = "org/proy/716-LCD-AR-P-001-P01.ifc"
    revision.nombre_original = "Piso 5.ifc"
    revision.save(update_fields=["metadatos", "clave_archivo", "nombre_original"])

    pagina = client.get(
        reverse("documents:expediente", args=[revision.entregable.pk])
    ).content.decode()

    assert "sin giro declarado" in pagina
    assert "girado" not in pagina


def test_cuenta_los_elementos_por_tipo(tmp_path):
    cuerpo = (
        BASE_2X3
        + "#30=IFCSITE('0bbbbbbbbbbbbbbbbbbbb0',$,'Obra',$,$,$,$,$,.ELEMENT.,$,$,0.,$,$);\n"
        "#40=IFCWALL('0ccccccccccccccccccc1',$,'Muro 1',$,$,$,$,$);\n"
        "#41=IFCWALL('0ccccccccccccccccccc2',$,'Muro 2',$,$,$,$,$);\n"
        "#42=IFCBEAM('0ddddddddddddddddddd1',$,'Viga',$,$,$,$,$);\n"
    )
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", cuerpo)))

    # El sitio tambien es un `IfcProduct`: tiene sitio en el espacio.
    assert datos["elementos"] == 4
    assert datos["porTipo"]["IfcWall"] == 2
    assert datos["porTipo"]["IfcBeam"] == 1
    assert datos["tiposDistintos"] == 3


def test_un_archivo_que_no_es_ifc_no_levanta(tmp_path):
    """**Nunca levanta**, y eso es una decision: un archivo que no se puede leer sigue siendo un
    entregable valido —se descarga, se emite, se comenta— y rechazar la subida por no poder leerle
    los metadatos seria confundir dos cosas."""
    ruta = tmp_path / "no-es.ifc"
    ruta.write_text("esto no es un IFC ni se le parece\n", encoding="utf-8")

    datos = extraer(ruta)
    assert "error" in datos
    assert "elementos" not in datos


def test_un_ifc_vacio_da_cero_y_no_error(tmp_path):
    """Un archivo bien formado y sin elementos **no es un fallo**: es un archivo vacio, y decirlo
    con un cero es mas util que con un error."""
    datos = extraer(escribir(tmp_path, ifc("IFC2X3", BASE_2X3)))

    assert "error" not in datos
    assert datos["elementos"] == 0
    assert datos["porTipo"] == {}


@pytest.mark.django_db
def test_al_subir_un_ifc_se_guardan_sus_metadatos(client, entregable, proyectista, tmp_path):
    """El ciclo completo: se sube por la pantalla y el registro queda sabiendo qué es el archivo."""
    from django.contrib.auth.models import Permission
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import override_settings
    from django.urls import reverse

    from apps.documents.models import Idoneidad, Revision

    for etiqueta in ("add_revision", "view_entregable"):
        proyectista.user_permissions.add(
            Permission.objects.get(content_type__app_label="documents", codename=etiqueta)
        )
    client.force_login(proyectista)

    cuerpo = BASE_2X3 + "#40=IFCWALL('0ccccccccccccccccccc1',$,'Muro',$,$,$,$,$);\n"
    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.post(
            reverse("documents:subir-revision", args=[entregable.pk]),
            {
                "correlativo": "A1",
                "idoneidad": Idoneidad.A,
                "archivo": SimpleUploadedFile(
                    "Estructura piso 5.ifc", ifc("IFC2X3", cuerpo).encode("utf-8")
                ),
            },
        )
        assert respuesta.status_code == 302

        revision = Revision.objects.get(entregable=entregable, correlativo="A1")
        assert revision.metadatos["esquema"] == "IFC2X3"
        assert revision.metadatos["unidades"]["metrosPorUnidad"] == pytest.approx(0.001)
        assert revision.metadatos["porTipo"]["IfcWall"] == 1


@pytest.mark.django_db
def test_al_subir_un_pdf_no_se_intenta_leerlo_como_ifc(client, entregable, proyectista, tmp_path):
    """**Solo los IFC se leen.** Pasarle un PDF a `ifcopenshell` costaría tiempo para devolver un
    error, y el registro quedaría con un mensaje de fallo sobre un archivo que está perfecto."""
    from django.contrib.auth.models import Permission
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import override_settings
    from django.urls import reverse

    from apps.documents.models import Idoneidad, Revision

    proyectista.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="add_revision")
    )
    client.force_login(proyectista)

    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.post(
            reverse("documents:subir-revision", args=[entregable.pk]),
            {
                "correlativo": "A1",
                "idoneidad": Idoneidad.A,
                "archivo": SimpleUploadedFile("plano.pdf", b"%PDF-1.7\n%%EOF\n"),
            },
        )

        revision = Revision.objects.get(entregable=entregable, correlativo="A1")
        assert revision.metadatos == {}
