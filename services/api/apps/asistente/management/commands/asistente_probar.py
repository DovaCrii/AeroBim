"""Diagnostico del asistente con la clave real: **lo corre quien despliega, en la VM**.

    manage.py asistente_probar             # prueba la cadena configurada (NIM_MODEL y respaldos)
    manage.py asistente_probar --modelos   # lista los modelos que ofrece {NIM_BASE_URL}/models
    manage.py asistente_probar --buscar    # prueba los de chat y sugiere NIM_MODEL y los respaldos

Nunca imprime la clave.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.asistente import cliente

# Lo que no es un modelo de chat (embeddings, reordenadores, guardas...): se salta en --buscar.
_NO_CHAT = ("embed", "rerank", "retriev", "guard", "safety", "clip", "parse", "image", "tts", "asr")


class Command(BaseCommand):
    help = "Prueba el proveedor del asistente de IA con la clave configurada (no imprime la clave)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--modelos", action="store_true", help="Lista los modelos del proveedor."
        )
        parser.add_argument(
            "--buscar",
            action="store_true",
            help="Prueba los modelos de chat y sugiere la configuracion.",
        )

    def handle(self, *args, **opciones):
        if not settings.NIM_API_KEY:
            raise CommandError(
                "NIM_API_KEY esta vacia: el asistente no existe. Ponla en el .env de la VM."
            )
        self.stdout.write(f"Proveedor: {settings.NIM_BASE_URL}")
        try:
            if opciones["modelos"]:
                for modelo in cliente.listar_modelos():
                    self.stdout.write(modelo)
            elif opciones["buscar"]:
                self._buscar()
            else:
                self._probar(cliente._cadena_de_modelos())
        except cliente.ErrorAsistente as exc:
            raise CommandError(f"El proveedor no contesto bien ({type(exc).__name__}).") from None

    def _probar(self, modelos):
        buenos = []
        for modelo in modelos:
            ok, detalle = cliente.probar_modelo(modelo)
            self.stdout.write(f"{'OK   ' if ok else 'FALLA'} {modelo}: {detalle}")
            if ok:
                buenos.append(modelo)
        if not buenos:
            raise CommandError("Ningun modelo de la cadena respondio.")
        return buenos

    def _buscar(self):
        candidatos = [
            m for m in cliente.listar_modelos() if not any(x in m.lower() for x in _NO_CHAT)
        ]
        self.stdout.write(f"{len(candidatos)} candidatos de chat; probando...")
        buenos = self._probar(candidatos)
        self.stdout.write("\nSugerencia para el .env:")
        self.stdout.write(f"NIM_MODEL={buenos[0]}")
        self.stdout.write(f"NIM_MODEL_FALLBACKS={','.join(buenos[1:4])}")
