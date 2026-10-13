"""El servidor del asistente de IA (`F17.3a`): estado y una entrada de chat **provisional**.

Contrato de `AGENTS.md`: permiso propio (`asistente.usar_asistente`), interruptor por organizacion
y 403 duro. **Anonimo**: como en el resto de las APIs JSON del proyecto, lo resuelve DRF (401/403),
no una redireccion al login.

Orden de las comprobaciones, y es deliberado: permiso e interruptor → ajustes. Quien no tiene el
permiso recibe 403 aunque el asistente no este configurado, para no revelar el estado del servidor
a quien no debe saberlo; quien lo tiene y el servidor no tiene clave, 404.

**La clave nunca aparece aqui**: ni en el cuerpo de las respuestas ni en un mensaje de error.
"""

from django.conf import settings
from django.http import Http404
from django.utils.translation import gettext as _
from rest_framework.exceptions import ParseError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.asistente.ajustes import asistente_disponible
from apps.core.tenancy import organizaciones_de

MAXIMO_MENSAJES = 20
MAXIMO_CARACTERES = 4000
ROLES_PERMITIDOS = ("user", "assistant")


class PuedeUsarElAsistente(BasePermission):
    """`asistente.usar_asistente`, y que **alguna organizacion del usuario lo tenga encendido**."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.has_perm("asistente.usar_asistente")):
            return False
        return organizaciones_de(user).filter(asistente_activo=True).exists()


class _AsistenteBase(APIView):
    permission_classes = [PuedeUsarElAsistente]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not asistente_disponible():
            raise Http404


def validar_mensajes(cuerpo) -> str | None:
    """Devuelve el motivo del rechazo, o `None` si el cuerpo es valido."""
    if not isinstance(cuerpo, dict):
        return _("The request body must be a JSON object.")
    mensajes = cuerpo.get("mensajes")
    if not isinstance(mensajes, list) or not mensajes:
        return _("The assistant needs at least one message.")
    if len(mensajes) > MAXIMO_MENSAJES:
        return _("Too many messages.")
    for mensaje in mensajes:
        if not isinstance(mensaje, dict) or mensaje.get("rol") not in ROLES_PERMITIDOS:
            return _("Each message needs a valid role.")
        texto = mensaje.get("texto")
        if not isinstance(texto, str) or not texto.strip():
            return _("Each message needs some text.")
        if len(texto) > MAXIMO_CARACTERES:
            return _("A message is too long.")
    return None


class EstadoAPI(_AsistenteBase):
    """Si el asistente esta disponible y con que modelo. Es lo que decide si el visor lo ofrece."""

    def get(self, request, *args, **kwargs):
        return Response({"disponible": True, "modelo": settings.NIM_MODEL or None})


class ChatAPI(_AsistenteBase):
    """**Provisional**: valida el cuerpo y contesta 501. El streaming llega en `F17.3b`."""

    def post(self, request, *args, **kwargs):
        try:
            cuerpo = request.data
        except ParseError:
            return Response({"error": _("The request body is not valid JSON.")}, status=400)
        motivo = validar_mensajes(cuerpo)
        if motivo:
            return Response({"error": motivo}, status=400)
        return Response({"error": _("Pending: the chat is not implemented yet.")}, status=501)
