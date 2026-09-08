"""Cuántas consultas cuesta una pantalla. Es una medida, no una opinión.

Estas pruebas existen para que una lista de treinta entregables no pase a costar treinta
consultas más el día que alguien añada una columna. `assertNumQueries` falla con el número
exacto, así que el que sube el coste se entera al correr la suite y no en producción.
"""

import pytest
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Idoneidad, Revision
from apps.projects.models import Disciplina, Proyecto


class ConsultasDeLosListados(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model

        cls.organizacion = Organizacion.objects.create(nombre="Constructora", slug="c")
        cls.usuario = get_user_model().objects.create_user(username="mirona", password="x-99")
        Membresia.objects.create(organizacion=cls.organizacion, usuario=cls.usuario)
        cls.usuario.user_permissions.add(
            *Permission.objects.filter(
                content_type__app_label="documents", codename="view_entregable"
            )
        )
        proyecto = Proyecto.objects.create(
            organizacion=cls.organizacion, codigo="P1", nombre="Proyecto"
        )
        disciplina = Disciplina.objects.create(proyecto=proyecto, codigo="AR", nombre="Arq")

        # Veinte entregables, cada uno con dos revisiones: suficiente para que un N+1 se vea.
        for i in range(20):
            entregable = Entregable.objects.create(
                organizacion=cls.organizacion,
                proyecto=proyecto,
                disciplina=disciplina,
                codigo=f"P1-AR-{i:03d}",
                titulo=f"Plano {i}",
                responsable=cls.usuario,
                peso=1,
            )
            Revision.objects.create(
                entregable=entregable,
                correlativo="P01",
                idoneidad=Idoneidad.S0,
                subida_por=cls.usuario,
            )
            Revision.objects.create(
                entregable=entregable,
                correlativo="P02",
                idoneidad=Idoneidad.S3,
                subida_por=cls.usuario,
            )

    def _consultas_del_listado(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        ruta = reverse("documents:entregables")
        with CaptureQueriesContext(connection) as capturadas:
            respuesta = self.client.get(ruta)
        assert respuesta.status_code == 200
        return len(capturadas.captured_queries), respuesta.content.decode()

    def test_el_listado_no_crece_con_el_numero_de_entregables(self):
        """**Lo que se mide es la invariancia, no un número.**

        Un `assertNumQueries(11)` se rompe cada vez que alguien toca el middleware y no dice
        nada del defecto real; lo que importa es que **duplicar las filas no duplique las
        consultas**. Antes de arreglarlo, veinte filas costaban 71 consultas —una por fila
        para la revisión vigente y otra para el avance, que la vuelve a pedir— y cuarenta
        habrían costado el doble.
        """
        self.client.force_login(self.usuario)
        # La primera pasada calienta el caché de sesión y de permisos, que no es lo medido.
        self._consultas_del_listado()

        con_veinte, cuerpo = self._consultas_del_listado()
        assert cuerpo.count("P1-AR-") == 20

        # Se duplican las filas, con sus dos revisiones cada una.
        proyecto = Proyecto.objects.get(codigo="P1")
        disciplina = Disciplina.objects.get(proyecto=proyecto)
        for i in range(20, 40):
            entregable = Entregable.objects.create(
                organizacion=self.organizacion,
                proyecto=proyecto,
                disciplina=disciplina,
                codigo=f"P1-AR-{i:03d}",
                titulo=f"Plano {i}",
                responsable=self.usuario,
                peso=1,
            )
            for correlativo, idoneidad in (("P01", Idoneidad.S0), ("P02", Idoneidad.S3)):
                Revision.objects.create(
                    entregable=entregable,
                    correlativo=correlativo,
                    idoneidad=idoneidad,
                    subida_por=self.usuario,
                )

        con_cuarenta, cuerpo = self._consultas_del_listado()
        assert cuerpo.count("P1-AR-") == 40

        assert con_cuarenta == con_veinte, (
            f"El listado pasó de {con_veinte} a {con_cuarenta} consultas al duplicar las "
            "filas: hay una consulta por fila."
        )


@pytest.mark.django_db
def test_se_puede_llegar_a_las_filas_de_la_segunda_pagina(
    client, organizacion, proyecto, disciplina, proyectista
):
    """**Faltaban los controles y eso truncaba en silencio.**

    Las vistas declaraban `paginate_by = 50` y ninguna plantilla dibujaba los enlaces, así
    que de la fila cincuenta en adelante el registro era inalcanzable sin escribir `?page=2`
    a mano. Un registro documental que no llega a sus propias filas no es un registro.
    """
    from django.contrib.auth.models import Permission

    for i in range(55):
        Entregable.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            disciplina=disciplina,
            codigo=f"E-{i:03d}",
            titulo=f"Plano {i}",
            responsable=proyectista,
            peso=1,
        )
    proyectista.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_entregable")
    )
    client.force_login(proyectista)

    primera = client.get(reverse("documents:entregables")).content.decode()
    assert "E-000" in primera
    assert "E-054" not in primera
    # **El enlace tiene que estar.** Sin él, esas cinco filas no existen para nadie.
    assert "page=2" in primera

    segunda = client.get(reverse("documents:entregables") + "?page=2").content.decode()
    assert "E-054" in segunda


@pytest.mark.django_db
def test_pasar_de_pagina_no_pierde_el_filtro(
    client, organizacion, proyecto, disciplina, proyectista
):
    """Sin conservar el filtro, pasar de página desde «solo mías» devuelve la lista entera y
    parece que el filtro no funciona."""
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Permission

    otro = get_user_model().objects.create_user(username="otro", password="x-99")
    # Sesenta suyos y cinco de otro: los suyos **desbordan** la página, que es la única
    # forma de que este defecto se note.
    for i in range(65):
        Entregable.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            disciplina=disciplina,
            codigo=f"E-{i:03d}",
            titulo=f"Plano {i}",
            responsable=proyectista if i < 60 else otro,
            peso=1,
        )
    proyectista.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_entregable")
    )
    client.force_login(proyectista)

    ruta = reverse("documents:entregables")
    primera = client.get(ruta + "?mios=1").content.decode()
    # El enlace a la página siguiente **lleva el filtro puesto**.
    assert "mios=1&amp;page=2" in primera

    segunda = client.get(ruta + "?mios=1&page=2").content.decode()
    # En la segunda siguen apareciendo solo los suyos: los cinco de «otro» no se cuelan.
    assert "E-059" in segunda
    assert "E-064" not in segunda

    # Y sin filtro, el enlace no inventa uno.
    sin_filtro = client.get(ruta).content.decode()
    assert "mios=1" not in sin_filtro.split("page=2")[0][-40:]


@pytest.mark.django_db
def test_el_avance_del_proyecto_no_consulta_una_vez_por_entregable(
    django_assert_num_queries, organizacion, proyecto, disciplina, proyectista
):
    """`avance_fisico` recorre los entregables y cada uno mira su revisión vigente. Sin
    precargar, un proyecto de doscientos entregables son doscientas consultas para pintar
    un número."""
    for i in range(10):
        entregable = Entregable.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            disciplina=disciplina,
            codigo=f"E-{i:03d}",
            titulo=f"Plano {i}",
            responsable=proyectista,
            peso=1,
        )
        Revision.objects.create(
            entregable=entregable,
            correlativo="P01",
            idoneidad=Idoneidad.A,
            subida_por=proyectista,
        )

    proyecto.refresh_from_db()
    with django_assert_num_queries(2):
        assert proyecto.avance_fisico == 1.0
