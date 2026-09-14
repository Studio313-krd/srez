"""Isolated, fictional application instance used only to capture user guides."""
import hashlib
import json
import os
import secrets
import sys
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
os.environ['SREZ_DEBUG'] = 'true'
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE':'django.db.backends.sqlite3', 'NAME':ROOT/'.local/guide-demo.sqlite3'}}
settings.TELEGRAM_ENABLED = False
settings.MAX_ENABLED = False
settings.ALLOWED_HOSTS = ['127.0.0.1','localhost']
settings.CSRF_TRUSTED_ORIGINS = ['http://127.0.0.1:8096']
import django
django.setup()
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from reports.models import Store, Access, Employee, StoreStaff, Plan, Report, Revision, Finding, FindingAction, WorkerHealth
from reports.services import ensure_reports

call_command('migrate', verbosity=0)
User = get_user_model()
path = ROOT/'.local/guide-demo.json'
if not User.objects.exists():
    day = timezone.localdate()-timedelta(days=1)
    credentials = {'date':str(day),'admin':secrets.token_urlsafe(18),'seller':secrets.token_urlsafe(18)}
    office = User.objects.create_superuser('admin', password=credentials['admin'], first_name='Администратор')
    seller = User.objects.create_user('seller', password=credentials['seller'], first_name='Сотрудник магазина')
    Access.objects.create(user=office, role='manager')
    access = Access.objects.create(user=seller, role='store')
    people = []
    for name in ['Иванова Анна','Петрова Елена','Смирнова Ольга']:
        people.append(Employee.objects.create(name=name, key=hashlib.sha256(name.casefold().encode()).hexdigest()))
    stores=[]
    for i, name in enumerate(['Учебный магазин Центральный','Учебный магазин Садовый','Учебный магазин Лесной']):
        store=Store.objects.create(code=f'УЧ-0{i+1}',name=name,city='Белгород',network='KK' if i==2 else 'MM',active_from=day,
            profile={'region':'Белгородская область','vacancies':0,'shift_rate':'2500','staffing':'Штат укомплектован'})
        stores.append(store)
        StoreStaff.objects.create(store=store,employee=people[i],slot='seller1')
        Plan.objects.create(store=store,date=day,revenue=25000,units=35,approved_by=office,reason='План на день')
        ensure_reports(store, day)
    access.stores.add(stores[0])
    def revision(store, checkpoint, revenue, receipts, units):
        report=Report.objects.get(store=store, date=day, checkpoint=checkpoint)
        r=Revision.objects.create(report=report,version=1,author=seller,employee=people[stores.index(store)].name,
            revenue=revenue,receipts=receipts,units=units,received_at=report.available_at+timedelta(minutes=2),request_id=uuid4(),payload_hash='training')
        report.current_version=1; report.first_received_at=r.received_at; report.save()
        return report
    revision(stores[0],'13',5000,5,8)
    revision(stores[1],'13',7000,7,10)
    revision(stores[1],'17',15000,15,23)
    earlier=revision(stores[2],'13',12000,12,18)
    later=revision(stores[2],'17',7000,7,10)
    Finding.objects.create(report=later,version=1,kind='cumulative_13',message='Накопительные показатели не согласуются со срезом 13:00.')
    missing=Report.objects.get(store=stores[0],date=day,checkpoint='17')
    Finding.objects.create(report=missing,version=0,kind='missing',message='Отчёт не получен к установленному сроку.')
    path.write_text(json.dumps(credentials),encoding='utf-8')
WorkerHealth.objects.update_or_create(name='scheduler',defaults={'last_success':timezone.now()})
if '--prepare-review' in sys.argv:
    # Fictional screenshot fixtures in this script's isolated SQLite database only.
    for code, amount, receipts, units in [('УЧ-02',18000,18,26),('УЧ-03',18500,6,None)]:
        report = Report.objects.filter(store__code=code, checkpoint='close').first()
        if not report.current_version:
            r = Revision.objects.create(report=report, version=1, author=User.objects.get(username='admin'),
                employee='Петрова Елена' if code=='УЧ-02' else 'Смирнова Ольга', revenue=amount, receipts=receipts, units=units,
                origin='sheets' if units is None else 'manual', received_at=None if units is None else report.available_at,
                request_id=uuid4(), payload_hash='training-review')
            report.current_version=1; report.first_received_at=r.received_at
            if units is None: report.imported=True; report.deadline=None; report.available_at=None
            report.save()
    sys.exit(0)
if '--prepare-seller' in sys.argv:
    store=Store.objects.get(code='УЧ-01')
    day=timezone.localdate()-timedelta(days=2)
    store.active_from=min(store.active_from,day); store.save()
    ensure_reports(store,day)
    Plan.objects.get_or_create(store=store,date=day,defaults={'revenue':25000,'units':35,'approved_by':User.objects.get(username='admin'),'reason':'Учебный план'})
    report=Report.objects.get(store=store,date=day,checkpoint='13')
    if not report.current_version:
        r=Revision.objects.create(report=report,version=1,author=User.objects.get(username='seller'),employee='Иванова Анна',revenue=5000,receipts=5,units=8,received_at=report.available_at,request_id=uuid4(),payload_hash='training')
        report.current_version=1;report.first_received_at=r.received_at;report.save()
    sys.exit(0)
if '--refresh' in sys.argv:
    sys.exit(0)
print('Guide demo: isolated SQLite database, fictional data, http://127.0.0.1:8096/',flush=True)
call_command('runserver','127.0.0.1:8096','--noreload',verbosity=0)
