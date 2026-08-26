from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class VisorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.visor"
    verbose_name = _("Viewer")
