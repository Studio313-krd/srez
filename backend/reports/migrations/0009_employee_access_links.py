import secrets
from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def convert_personal_logins(apps, schema_editor):
    Employee = apps.get_model('reports', 'Employee')
    Access = apps.get_model('reports', 'Access')
    for person in Employee.objects.using(schema_editor.connection.alias).exclude(user=None).select_related('user'):
        user = person.user
        if user.is_staff or user.is_superuser or not Access.objects.using(schema_editor.connection.alias).filter(user=user, role='store').exists():
            continue
        person.login_version = secrets.token_urlsafe(32)
        person.save(update_fields=['login_version'])
        user.password = make_password(None)
        user.save(update_fields=['password'])


class Migration(migrations.Migration):
    dependencies = [('reports', '0008_employee_login')]
    operations = [
        migrations.AddField(model_name='employee', name='login_version',
            field=models.CharField(max_length=64, blank=True, default='', editable=False)),
        migrations.RunPython(convert_personal_logins, migrations.RunPython.noop),
    ]
