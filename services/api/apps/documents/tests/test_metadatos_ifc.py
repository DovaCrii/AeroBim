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

from apps.documents.ifc import extraer


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
