"""Decirle a la auditoria **sobre que** fue la accion.

El middleware ya sabe quien, cuando, con que metodo y con que resultado. Lo que no
puede deducir es a que objeto se refirio, y sin eso la auditoria contesta "alguien
guardo algo" — que no es una respuesta.
"""


def set_audit_context(request, instance, action=None, metadata=None):
    if instance is None:
        return
    # DRF envuelve la peticion de Django en la suya, y el middleware lee el contexto
    # de la de Django: se desenvuelve una vez aqui. Para una peticion normal no hace
    # nada.
    request = getattr(request, "_request", request)
    request._audit_context = {
        "model_label": instance._meta.label,
        "object_id": str(instance.pk),
    }
    if action:
        request._audit_context["action"] = action
    if metadata:
        request._audit_context["metadata"] = dict(metadata)
