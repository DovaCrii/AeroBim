"""Que la conversión de DWG y DGN a DXF se comporte bien **sin tener la herramienta**.

## Por qué estas pruebas pueden existir

`ODA File Converter` es software de terceros que se instala a mano y no está en el entorno de
integración. Sin él, lo tentador sería no probar nada y decir «cuando lo instales, ya veremos» —y
entonces el día que se instale nadie sabría si el pegamento alrededor está bien.

Lo que **sí** se puede fijar sin el binario es todo lo demás, que es donde están los errores caros:

- que **la subida no se pierda** cuando no hay conversor,
- que los motivos lleven **código estable** y no dependan del idioma,
- que se le pasen al programa **los argumentos correctos y en el orden correcto**,
- y que **no se crea el código de salida**, que es 0 aunque no convierta nada.

Los tres últimos se comprueban con un conversor de mentira: un script que escribe un DXF donde le
digan. Eso ejerce el camino entero —carpetas temporales, argumentos, lectura del resultado— sin
depender de la Open Design Alliance.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from django.test import override_settings

from apps.documents.conversion import (
    CONVERTIBLES,
    ConversionImposible,
    a_dxf,
    dxf_para,
    estado_del_conversor,
    hay_conversor,
    se_puede_convertir,
)

DXF_MINIMO = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"


@pytest.fixture()
def conversor_de_mentira(tmp_path: Path) -> Path:
    """Un ejecutable que hace lo mismo que el de verdad: escribir un DXF en la carpeta de salida.

    Se escribe como script de Python y se invoca con el propio intérprete, para que funcione igual
    en Windows y en Linux sin depender de `chmod` ni de una extensión.
    """
    script = tmp_path / "conversor_falso.py"
    # **La anotación de argumentos va a `tmp_path` y no a la carpeta de salida**: esa la borra la
    # propia conversión al terminar, así que el archivo desaparecía antes de poder leerlo. Lo cazó
    # la primera ejecución de esta prueba.
    anotacion = tmp_path / "argumentos.txt"
    script.write_text(
        "import sys, pathlib\n"
        # Los argumentos son posicionales: entrada, salida, version, tipo, recursivo, auditar.
        "salida = pathlib.Path(sys.argv[2])\n"
        f"(salida / 'plano.dxf').write_bytes({DXF_MINIMO!r})\n"
        f"pathlib.Path({str(anotacion)!r}).write_text("
        "'\\n'.join(sys.argv[1:]), encoding='utf8')\n",
        encoding="utf8",
    )
    return script


class TestSinHerramienta:
    """El caso que se da hoy en cualquier máquina del proyecto: no está instalada."""

    @override_settings(ODA_CONVERTER="")
    def test_sin_configurar_lo_dice_y_no_revienta(self):
        estado = estado_del_conversor()
        assert estado.disponible is False
        assert "ODA File Converter" in estado.motivo
        assert hay_conversor() is False

    @override_settings(ODA_CONVERTER="/no/existe/ODAFileConverter")
    def test_una_ruta_que_no_existe_lo_dice_con_la_ruta(self):
        # **Se nombra la ruta configurada.** «No hay conversor» con una ruta puesta manda a mirar
        # la instalación; con la ruta delante se ve el error de tipeo en dos segundos.
        estado = estado_del_conversor()
        assert estado.disponible is False
        assert "/no/existe/ODAFileConverter" in estado.motivo

    @override_settings(ODA_CONVERTER="")
    def test_convertir_sin_herramienta_levanta_con_codigo_estable(self):
        with pytest.raises(ConversionImposible) as fallo:
            a_dxf(b"cualquier cosa", "dwg")
        # El código no cambia aunque el mensaje se traduzca: misma disciplina que `CargaRechazada`.
        assert fallo.value.codigo == "sin-conversor"

    @override_settings(ODA_CONVERTER="")
    def test_la_subida_NO_se_pierde_cuando_falta_la_herramienta(self):
        # **Es la propiedad que importa de todo este módulo.** Un registro documental que rechaza
        # un archivo porque le falta una herramienta de conversión es un registro que pierde el
        # archivo. El DXF es una comodidad; el original es el entregable.
        dxf, motivo = dxf_para(b"cualquier cosa", "dwg")
        assert dxf is None
        assert motivo != ""


class TestExtensiones:
    def test_dwg_y_dgn_se_convierten(self):
        assert se_puede_convertir("dwg")
        assert se_puede_convertir("dgn")
        assert se_puede_convertir(".DWG")  # con punto y en mayúsculas, que es como llegan

    def test_lo_demas_no(self):
        for otra in ["dxf", "ifc", "pdf", "laz", ""]:
            assert not se_puede_convertir(otra), otra

    def test_convertir_algo_que_no_toca_levanta_antes_de_buscar_la_herramienta(self):
        # Sin conversor configurado igualmente: el motivo tiene que ser la extensión, no la falta
        # de herramienta, porque es lo que le dice a quien subió que el archivo no era para esto.
        with override_settings(ODA_CONVERTER=""):
            with pytest.raises(ConversionImposible) as fallo:
                a_dxf(b"%PDF-", "pdf")
        assert fallo.value.codigo == "extension-no-convertible"

    def test_la_lista_es_la_declarada(self):
        assert CONVERTIBLES == frozenset({"dwg", "dgn"})


class TestConUnConversorDeMentira:
    """El camino entero, sin depender de la Open Design Alliance."""

    def test_convierte_y_devuelve_los_bytes_del_dxf(self, conversor_de_mentira, tmp_path):
        envoltorio = _envoltorio(tmp_path, conversor_de_mentira)
        with override_settings(ODA_CONVERTER=str(envoltorio)):
            salida = a_dxf(b"un dwg de mentira", "dwg")
        assert salida == DXF_MINIMO

    def test_le_pasa_los_argumentos_en_el_orden_que_espera(self, conversor_de_mentira, tmp_path):
        # **El orden es posicional y sin nombres**, así que equivocarse no da un error: da una
        # conversión a otra versión, o sin auditar, y nadie se entera.
        envoltorio = _envoltorio(tmp_path, conversor_de_mentira)
        with override_settings(ODA_CONVERTER=str(envoltorio)):
            a_dxf(b"un dwg", "dwg")

        anotados = (tmp_path / "argumentos.txt").read_text(encoding="utf8").splitlines()
        assert len(anotados) == 6
        entrada, salida, version, tipo, recursivo, auditar = anotados
        assert Path(entrada).name == "entra"
        assert Path(salida).name == "sale"
        assert version == "ACAD2018"
        assert tipo == "DXF"
        assert recursivo == "0"
        assert auditar == "1"

    def test_si_no_escribe_ningun_dxf_se_dice_aunque_el_programa_diga_que_todo_bien(
        self, tmp_path
    ):
        # **El conversor devuelve 0 aunque no convierta nada**, así que creerse el código de salida
        # daría por buena una conversión que no ocurrió — y el visor recibiría un archivo vacío.
        # Este falso termina bien y no escribe nada.
        mudo = tmp_path / "mudo.py"
        mudo.write_text("import sys\nsys.exit(0)\n", encoding="utf8")
        envoltorio = _envoltorio(tmp_path, mudo)

        with override_settings(ODA_CONVERTER=str(envoltorio)):
            with pytest.raises(ConversionImposible) as fallo:
                a_dxf(b"un dwg", "dwg")
        assert fallo.value.codigo == "sin-salida"

    def test_no_deja_carpetas_temporales_detras(self, conversor_de_mentira, tmp_path):
        # Cada conversión abre un directorio propio para que dos subidas a la vez no se pisen. Si
        # no se limpiaran, un servidor que convierte planos todo el día se llena.
        import tempfile

        envoltorio = _envoltorio(tmp_path, conversor_de_mentira)
        antes = set(Path(tempfile.gettempdir()).glob("aerobim-conv-*"))
        with override_settings(ODA_CONVERTER=str(envoltorio)):
            a_dxf(b"un dwg", "dwg")
        despues = set(Path(tempfile.gettempdir()).glob("aerobim-conv-*"))
        assert despues == antes


class _RevisionFalsa:
    """Lo justo de una revisión para preguntarle a `abribles`. No toca la base de datos."""

    def __init__(self, nombre: str, clave_dxf: str = "") -> None:
        self.nombre_original = nombre
        self.clave_dxf = clave_dxf
        self.clave_archivo = "obra/entregable/abc.dwg"


class TestQueSePuedeAbrir:
    """Un DWG es abrible **si se pudo convertir**, y no lo es si no."""

    def test_un_dwg_sin_dxf_no_es_abrible(self):
        # **Mirar solo la extensión diría que sí**, y llevaría a una pantalla en blanco. Que la
        # subida se guardara no significa que se pueda mirar.
        from apps.documents import abribles

        assert abribles.visor_de(_RevisionFalsa("plano.dwg")) is None
        assert abribles.es_abrible(_RevisionFalsa("plano.dwg")) is False

    def test_un_dwg_con_dxf_se_abre_en_el_visor_de_modelos(self):
        from apps.documents import abribles

        revision = _RevisionFalsa("plano.dwg", clave_dxf="obra/entregable/def.dxf")
        assert abribles.visor_de(revision) == abribles.VISOR_MODELO

    def test_lo_mismo_para_dgn(self):
        from apps.documents import abribles

        assert abribles.visor_de(_RevisionFalsa("planta.dgn")) is None
        assert (
            abribles.visor_de(_RevisionFalsa("planta.dgn", clave_dxf="x.dxf"))
            == abribles.VISOR_MODELO
        )

    def test_al_visor_se_le_sirve_el_dxf_convertido_y_no_el_original(self):
        from apps.documents import abribles

        revision = _RevisionFalsa("plano.dwg", clave_dxf="obra/entregable/def.dxf")
        assert abribles.clave_para_el_visor(revision) == "obra/entregable/def.dxf"

    def test_y_de_lo_que_no_se_convierte_se_sirve_su_propio_archivo(self):
        from apps.documents import abribles

        revision = _RevisionFalsa("modelo.ifc")
        assert abribles.clave_para_el_visor(revision) == revision.clave_archivo


class TestDgnSeAcepta:
    def test_las_dos_generaciones_de_dgn_pasan_la_validacion(self):
        # **El registro guarda lo que le den.** Que un v7 se pueda convertir o no lo decide el
        # conversor; rechazarlo al entrar perdería el archivo.
        from apps.documents.storage import EXTENSIONES_ACEPTADAS, FIRMAS

        assert "dgn" in EXTENSIONES_ACEPTADAS
        assert b"\xd0\xcf\x11\xe0" in FIRMAS["dgn"]  # v8: contenedor compuesto
        assert b"\x08\x09\xfe" in FIRMAS["dgn"]  # v7: formato propio anterior


class TestLaSaludLoDice:
    """El conversor se ve en `/health/`, **sin poner el servidor en amarillo**."""

    @override_settings(ODA_CONVERTER="")
    def test_ausente_se_informa(self, client):
        cuerpo = client.get("/health/").json()
        assert cuerpo["comprobaciones"]["conversor_cad"] == "ausente"

    def test_instalado_se_informa(self, tmp_path, client):
        falso = tmp_path / "ODAFileConverter"
        falso.write_text("no importa: solo se mira que exista", encoding="utf8")
        with override_settings(ODA_CONVERTER=str(falso)):
            cuerpo = client.get("/health/").json()
        assert cuerpo["comprobaciones"]["conversor_cad"] == "instalado"

    def test_tenerlo_o_no_NO_cambia_el_estado_del_servidor(self, tmp_path, client):
        # **Es la propiedad que importa, y se comprueba comparando en vez de fijando un valor.**
        #
        # Afirmar «responde 200» ataría esta prueba a que el resto del entorno esté sano —y no lo
        # está: en integración el health devuelve 503 por otras razones—. Lo que este cambio tiene
        # que garantizar es que el conversor **no mueva la aguja**, y eso se ve mirando el mismo
        # servidor con y sin él.
        falso = tmp_path / "ODAFileConverter"
        falso.write_text("existe", encoding="utf8")

        with override_settings(ODA_CONVERTER=""):
            sin = client.get("/health/")
        with override_settings(ODA_CONVERTER=str(falso)):
            con = client.get("/health/")

        assert sin.status_code == con.status_code
        assert sin.json()["estado"] == con.json()["estado"]


def _envoltorio(tmp_path: Path, script: Path) -> Path:
    """Un `.cmd`/`.sh` que llama al script con el intérprete actual.

    `subprocess` necesita un ejecutable, y un `.py` no lo es en Windows salvo que esté asociado.
    Se escribe el envoltorio que corresponde al sistema.
    """
    if sys.platform.startswith("win"):
        envoltorio = tmp_path / "conversor.cmd"
        envoltorio.write_text(f'@"{sys.executable}" "{script}" %*\n', encoding="utf8")
    else:
        envoltorio = tmp_path / "conversor.sh"
        envoltorio.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n', encoding="utf8")
        envoltorio.chmod(0o755)
    return envoltorio
