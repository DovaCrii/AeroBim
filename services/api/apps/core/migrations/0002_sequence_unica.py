"""`AuditEvent.sequence` pasa a ser unico, y lo que ya estuviera repetido se renumera.

**Por que hace falta renumerar antes.** El `save()` anterior calculaba el numero leyendo el maximo y
sumandole uno, sin transaccion ni bloqueo. Con un solo proceso eso funciona; con los
`workers = cpu*2+1` de gunicorn, no. Medido contra PostgreSQL con dieciseis hilos escribiendo doce
filas cada uno: **192 filas y 27 valores distintos, o sea 165 duplicados**. O sea que cualquier base
que haya recibido trafico concurrente los tiene, y `AlterField` a secas fallaria ahi con un error de
unicidad a mitad del despliegue.

**Como se renumera.** Por `(sequence, created_at, id)`, que es el orden que la tabla ya declara
(`ordering = ["-sequence"]`) con dos desempates estables. No recupera el orden real de lo que se
escribio a la vez —eso se perdio cuando se escribio— pero deja un orden total y reproducible, que es
lo que el campo promete a partir de aqui.
"""

from django.db import migrations, models


def renumerar(apps, schema_editor):
    """Reasigna 1..N conservando el orden que se pueda conservar."""
    AuditEvent = apps.get_model("core", "AuditEvent")
    # Se escribe en tandas para no traer una tabla de auditoria entera a memoria.
    filas = AuditEvent.objects.order_by("sequence", "created_at", "id").only("id", "sequence")
    pendientes = []
    for numero, fila in enumerate(filas.iterator(chunk_size=2000), start=1):
        if fila.sequence != numero:
            fila.sequence = numero
            pendientes.append(fila)
        if len(pendientes) >= 2000:
            AuditEvent.objects.bulk_update(pendientes, ["sequence"])
            pendientes = []
    if pendientes:
        AuditEvent.objects.bulk_update(pendientes, ["sequence"])


def no_se_deshace(apps, schema_editor):
    """Quitar la unicidad no pide tocar los datos: los numeros ya son validos sin ella."""


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(renumerar, no_se_deshace),
        migrations.AlterField(
            model_name="auditevent",
            name="sequence",
            field=models.PositiveBigIntegerField(default=0, editable=False, unique=True),
        ),
    ]
