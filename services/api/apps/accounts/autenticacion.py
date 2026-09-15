"""**Entrar con el correo, además de con el nombre de usuario.**

## Por qué

Las cuentas las crea una persona y el nombre de usuario lo genera AeroBim: `carolina.herrera`. Eso
está bien para que una lista de responsables se lea, y **es lo que nadie recuerda tres semanas
después**. El correo sí: es el que esa persona escribe diez veces al día.

Y hay una razón que pesa más que la comodidad. El correo es **el único dato de la cuenta que ya
tiene que ser correcto obligatoriamente**: sin él no llegan los avisos de lo que se le asigna, y
`listo_para_produccion` bloquea el despliegue si falta alguno. Dejar entrar por el mismo dato que ya
se exige correcto quita una cosa que mantener.

## Por qué un backend y no cambiar el modelo de usuario

Hacer del correo el `username` obligaría a un modelo de usuario propio, y cambiarlo con la base ya
migrada es de las operaciones más caras que existen en Django. Aquí no hace falta: el nombre de
usuario sigue siendo el que identifica —en la auditoría, en las listas, en el `/admin/`— y el correo
es **otra manera de decir el mismo nombre** al entrar.

## Y las dos cosas que este archivo tiene que hacer bien

1. **No dar pistas de si un correo existe.** El portal de ingreso ya contesta un error genérico a
   propósito —«enumerar usuarios es la mitad del trabajo de quien ataca»— y un backend que tardara
   distinto, o que fallara distinto, lo desharía. Por eso el camino es el mismo siempre.
2. **No dejar que dos cuentas con el mismo correo se cuelen.** El campo `email` de Django **no es
   único**, así que un correo repetido haría que «entrar con el correo» fuera ambiguo: entraría a
   una de las dos, y no necesariamente a la misma cada vez. `NuevaCuentaForm` ya lo impide al crear,
   y aquí se cierra el otro lado — si aun así hubiera dos, **no entra ninguna**.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CorreoOUsuario(ModelBackend):
    """Acepta el nombre de usuario o el correo, indistintamente.

    Hereda de `ModelBackend` y **solo cambia cómo encuentra a la persona**: la comprobación de la
    contraseña, la de `is_active` y todo el sistema de permisos siguen siendo los de Django. Es
    justo lo que no conviene reescribir.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        U = get_user_model()
        nombre = username or kwargs.get(U.USERNAME_FIELD)
        if nombre is None or password is None:
            return None

        if "@" not in nombre:
            # Sin arroba no es un correo, así que no hay nada que buscar por ahí: se deja el camino
            # de siempre. Es también lo más barato — una consulta menos en el caso normal.
            return super().authenticate(request, username=nombre, password=password, **kwargs)

        # **`filter` y no `get`.** Con dos cuentas que compartan el correo, `get` levantaría
        # `MultipleObjectsReturned` —un 500 en la pantalla de entrar— y aquí lo que corresponde es
        # no dejar entrar a ninguna: si el correo no identifica a una sola persona, no sirve para
        # identificar.
        encontrados = list(U.objects.filter(email__iexact=nombre)[:2])
        if len(encontrados) != 1:
            # **Se comprueba la contraseña igual**, contra un hash que no existe. Sin esto, un
            # correo desconocido contesta antes que uno conocido, y esa diferencia de tiempo dice
            # cuáles existen — que es exactamente lo que la pantalla de entrar evita en su texto.
            U().set_password(password)
            return None

        persona = encontrados[0]
        if persona.check_password(password) and self.user_can_authenticate(persona):
            return persona
        return None
