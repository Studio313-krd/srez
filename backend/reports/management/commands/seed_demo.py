import secrets
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from reports.models import Store, Access, Plan, Report
from reports.services import ensure_reports, submit


class Command(BaseCommand):
    help = 'Create explicitly fictional local demo data; refuses production and existing demo accounts.'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Demo seed is only allowed with SREZ_DEBUG=true.')
        User = get_user_model()
        if User.objects.filter(username__in=['demo.store', 'demo.office', 'demo.admin']).exists():
            raise CommandError('Demo already exists. Existing passwords and reports are preserved.')
        credentials = []
        users = {}
        for suffix, name, role in [('store', 'Сотрудник магазина', 'store'), ('office', 'Видеоконтроль', 'office'), ('admin', 'Администратор', 'manager')]:
            password = secrets.token_urlsafe(18)
            user = User.objects.create_user('demo.' + suffix, password=password, first_name=name,
                is_staff=suffix == 'admin', is_superuser=suffix == 'admin')
            Access.objects.create(user=user, role=role)
            users[suffix] = user
            credentials.append(f'demo.{suffix}: {password}')
        day = timezone.localdate() - timedelta(days=1)
        names = [('ДЕМО-01', 'Учебный магазин · Центральный', 'MM'), ('ДЕМО-02', 'Учебный магазин · Вокзальный', 'KK'),
                 ('ДЕМО-03', 'Учебный магазин · Северный', 'MM'), ('ДЕМО-04', 'Учебный магазин · Парковый', 'MM')]
        for index, (code, name, network) in enumerate(names):
            store = Store.objects.create(code=code, name=name, city='Демонстрационный город', network=network, active_from=day)
            users['store'].access.stores.add(store)
            for target_day in [day, day + timedelta(days=1)]:
                Plan.objects.create(store=store, date=target_day, revenue=72000, receipts=None, units=60,
                                    approved_by=users['admin'], reason='Учебные данные')
                ensure_reports(store, target_day)
            for i, report in enumerate(Report.objects.filter(store=store, date=day).order_by('available_at')):
                if index == 1 or (index == 2 and i > 0):
                    continue
                submit(users['store'], report.pk, {'version': 0, 'request_id': str(__import__('uuid').uuid4()),
                    'revenue': str(Decimal(24500 + i * 23000) if index != 3 else Decimal(31000 - i * 5000)),
                    'receipts': 10 + i * 12, 'units': 18 + i * 20, 'comment': 'Учебный пример; демонстрируем проверку показателей.'})
        directory = settings.BASE_DIR.parent / '.local'
        directory.mkdir(exist_ok=True)
        (directory / 'demo-credentials.txt').write_text('\n'.join(credentials), encoding='utf-8')
        self.stdout.write(f'Demo created for {day}. Credentials: .local/demo-credentials.txt (local only).')
