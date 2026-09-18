"""Local-only interface study: separate SQLite data, no outgoing notifications."""
import os
import sys
from pathlib import Path
from datetime import timedelta
from uuid import uuid4

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
os.environ['SREZ_DEBUG']='true'
os.environ['SREZ_TEST_MODE']='true'
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
from django.conf import settings
settings.SREZ_LOCAL_PREVIEW=True
settings.DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':root/'.local/simple-preview.sqlite3','OPTIONS':{'timeout':20}}}
settings.ALLOWED_HOSTS=['localhost','127.0.0.1']
settings.CSRF_TRUSTED_ORIGINS=['http://localhost:8099','http://127.0.0.1:8099','http://127.0.0.1:8098']
settings.SESSION_COOKIE_NAME='srez_simple_session'
settings.CSRF_COOKIE_NAME='srez_simple_csrf'
settings.PUBLIC_URL='http://localhost:8099'
settings.TELEGRAM_ENABLED=False
settings.MAX_ENABLED=False
import django
django.setup()
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.utils import timezone
from reports.models import Store, Report, Revision, Plan
from reports.worker import tick

if '--worker' in sys.argv:
    call_command('run_worker')
else:
    call_command('migrate',verbosity=0)
    if not get_user_model().objects.exists():
        call_command('seed_test_site',output=str(root/'.local/simple-preview-access.json'))
    day,now=timezone.localdate(),timezone.now()
    admin=get_user_model().objects.get(username='test.admin')
    seller=get_user_model().objects.get(username='test.seller')
    # Keep the fictional examples separate from stores created through the UI.
    for store in Store.objects.filter(code__in=['TEST-MS', 'TEST-KK'], archived=False):
        if Report.objects.filter(store=store,date=day).exists():continue
        store.monitoring_enabled=True
        store.expected_through=day
        store.save(update_fields=['monitoring_enabled','expected_through'])
        Plan.objects.get_or_create(store=store,date=day,defaults={'revenue':25000,'receipts':25,'units':35,'approved_by':admin,'reason':'Учебный план'})
        for stage,minutes in [('13',-15),('17',180),('close',480)]:
            report=Report.objects.create(store=store,date=day,checkpoint=stage,available_at=now-timedelta(hours=1),deadline=now+timedelta(minutes=minutes))
            if store.code=='TEST-MS' and stage=='13':
                received=now-timedelta(minutes=20)
                Revision.objects.create(report=report,version=1,author=seller,received_at=received,revenue=5000,receipts=5,units=8,
                    employee='Программист (тестовый сотрудник)',request_id=uuid4(),payload_hash='local-example',comment='Учебный пример')
                report.current_version=1;report.first_received_at=received
                report.save(update_fields=['current_version','first_received_at'])
    tick()
    print('Simple local preview API: http://127.0.0.1:8098; UI: http://localhost:8099',flush=True)
    if '--check' not in sys.argv:call_command('runserver','127.0.0.1:8098',use_reloader=False)
