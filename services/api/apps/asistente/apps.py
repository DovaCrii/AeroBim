from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AsistenteConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.asistente"
    verbose_name = _("Assistant")
