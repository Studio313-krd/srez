"""Initialize the separate two-store acceptance site; never import production data."""
import hashlib
import json
import os
import secrets
from datetime import time
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from reports.models import Store, Employee, StoreStaff, Access, Plan


class Command(BaseCommand):
    help = 'Initialize the isolated test site with two stores and two accounts.'

    def add_arguments(self, parser):
        parser.add_argument('--output', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.SREZ_TEST_MODE:
            raise CommandError('This command is available only on the test site.')
        if Store.objects.exists() or get_user_model().objects.exists():
            raise CommandError('Database is not empty; initialization will not overwrite existing data.')
        target = Path(options['output'])
        if target.exists(): raise CommandError('Credential file already exists.')
        passwords = {name: secrets.token_urlsafe(18) for name in ['test.admin', 'test.seller']}
        User = get_user_model()
        admin = User.objects.create_superuser('test.admin', password=passwords['test.admin'], first_name='Видеоконтроль', last_name='Тест')
        seller = User.objects.create_user('test.seller', password=passwords['test.seller'], first_name='Программист', last_name='Тест')
        Access.objects.create(user=admin, role='manager')
        access = Access.objects.create(user=seller, role='store')
        person = Employee.objects.create(name='Программист (тестовый сотрудник)', key=hashlib.sha256(b'srez-test-programmer').hexdigest(), notes='Учебная запись. Можно заменить имя в Управлении.')
        for code, network, name in [('TEST-MS', 'MM', 'Тестовый Мильстрим'), ('TEST-KK', 'KK', 'Тестовая Культура крепкого')]:
            store = Store.objects.create(code=code, network=network, name=name, city='Учебный магазин', active_from=timezone.localdate(),
                opens_at=time(0), closes_at=time(23,59), monitoring_enabled=False, profile={'sandbox_store':True})
            StoreStaff.objects.create(store=store, employee=person, slot='seller1')
            access.stores.add(store)
            Plan.objects.create(store=store, date=timezone.localdate(), revenue=25000, receipts=25, units=35,
                approved_by=admin, reason='Учебный план для первого запуска')
        payload = {'url':settings.PUBLIC_URL, 'accounts':[{'username':name, 'password':passwords[name]} for name in passwords]}
        with os.fdopen(os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600), 'w', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        self.stdout.write('Created 2 test stores, 1 employee and 2 accounts. Credentials saved privately.')
