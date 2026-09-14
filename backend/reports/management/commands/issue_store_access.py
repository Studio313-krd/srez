import json
import os
import secrets
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from reports.models import Store, Access


class Command(BaseCommand):
    help = 'Issue one restricted account per active store; write initial passwords to a private file once.'

    def add_arguments(self, parser):
        parser.add_argument('--output', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        target = Path(options['output'])
        if target.exists(): raise CommandError('Output already exists; existing passwords are never overwritten.')
        result = []
        User = get_user_model()
        for store in Store.objects.filter(archived=False):
            username = 'store.' + store.code.lower()
            existing = User.objects.filter(username=username).first()
            if existing:
                access = Access.objects.filter(user=existing, role='store').first()
                if not access or list(access.stores.values_list('pk', flat=True)) != [store.pk]:
                    raise CommandError('Username already belongs to a different access: ' + username)
                continue
            password = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789') for _ in range(14))
            user = User.objects.create_user(username, password=password, first_name=store.code, last_name=store.city)
            Access.objects.create(user=user, role='store').stores.add(store)
            result.append({'code':store.code, 'city':store.city, 'store':store.name, 'username':username, 'password':password})
        with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as output:
            json.dump(result, output, ensure_ascii=False, indent=2)
        self.stdout.write(f'Created {len(result)} store accounts. Credentials saved to the specified private file.')
