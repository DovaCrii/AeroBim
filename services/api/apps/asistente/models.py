from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel, Organizacion


class UsoDelAsistente(BaseModel):
    """Una consulta al asistente, **sin su texto**.

    Existe para dos cosas: llevar el permiso `usar_asistente` y contar el coste (tokens) por
    organizacion. **Nunca guarda la pregunta ni la respuesta**: lo que la persona pregunta sobre
    su obra no tiene por que quedar en la base, y menos si salio de la VM.
    """

    ESTADOS = [
        ("ok", _("Answered")),
        ("error", _("Failed")),
        ("limite", _("Rate limited")),
    ]

    organizacion = models.ForeignKey(Organizacion, on_delete=models.CASCADE, related_name="usos")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="usos_del_asistente"
    )
    modelo = models.CharField(max_length=120)
    tokens_entrada = models.PositiveIntegerField(default=0)
    tokens_salida = models.PositiveIntegerField(default=0)
    estado = models.CharField(max_length=10, choices=ESTADOS, default="ok")

    class Meta:
        verbose_name = _("assistant use")
        verbose_name_plural = _("assistant uses")
        ordering = ["-created_at"]
        permissions = [("usar_asistente", "Puede usar el asistente")]

    def __str__(self):
        return f"{self.modelo} ({self.estado})"
