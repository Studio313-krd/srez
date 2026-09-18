import hashlib
import json
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from .models import Access, Store, Employee, StoreStaff, Plan, Report, Revision, SourceSheet, ImportIssue, ManagementEvent
from .services import ensure_reports, submit, report_json
from .worker import tick


@override_settings(SECURE_SSL_REDIRECT=False)
class ManagementTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser('administrator', password='original-test-password')
        self.client.force_login(self.admin)
        self.day = timezone.localdate() - timedelta(days=1)
        self.store = Store.objects.create(code='MS-900', name='Test address', city='City', network='MM', active_from=self.day, monitoring_enabled=False)

    def post(self, path, data):
        return self.client.post('/api/manage/' + path, json.dumps(data), content_type='application/json')

    def test_manager_can_edit_registry_with_audit_and_zero_values(self):
        response = self.post('employees/0/', {'name': 'Иванов Иван', 'position': 'Продавец', 'notes': 'Подмена', 'active': True})
        self.assertEqual(response.status_code, 200, response.content)
        person = Employee.objects.get(pk=response.json()['id'])
        response = self.post(f'stores/{self.store.pk}/', {'name': 'New address', 'profile': {'shift_rate': '1500.00', 'vacancies': 0}, 'staff': [{'slot': 'seller1', 'id': person.pk}]})
        self.assertEqual(response.status_code, 200, response.content)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'New address')
        self.assertEqual(self.store.staff.get().employee, person)
        self.assertEqual(self.store.profile['vacancies'], 0)
        response = self.post('plans/', {'store_id': self.store.pk, 'date': str(self.day), 'revenue': '0', 'receipts': 0, 'units': 0, 'units_per_receipt': 0, 'reason': 'Нет продаж'})
        self.assertEqual(response.status_code, 200, response.content)
        plan = Plan.objects.get()
        self.assertEqual((plan.revenue, plan.receipts, plan.units, plan.units_per_receipt), (0,0,0,0))
        self.assertEqual(ManagementEvent.objects.count(), 3)

    def test_invalid_changes_are_atomic_and_management_is_restricted(self):
        response = self.post(f'stores/{self.store.pk}/', {'name': 'Should not persist', 'staff': [{'slot': 'seller1', 'id': 999}]})
        self.assertEqual(response.status_code, 400)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'Test address')
        self.assertEqual(self.post(f'stores/{self.store.pk}/', {'profile': {'vacancies': -1}}).status_code, 400)
        self.assertEqual(self.post(f'stores/{self.store.pk}/', {'timezone': 'Wrong/Zone'}).status_code, 400)
        self.assertEqual(self.post('schedule/', {'store_id': self.store.pk, 'date': 'bad-date'}).status_code, 400)
        user = get_user_model().objects.create_user('seller')
        Access.objects.create(user=user, role='store').stores.add(self.store)
        self.client.force_login(user)
        for path in ['', 'plans/', 'schedule/', 'sheets/1/']:
            self.assertEqual(self.client.get('/api/manage/'+path).status_code, 403)
        self.assertEqual(self.post(f'stores/{self.store.pk}/', {'name':'Denied'}).status_code, 403)
        self.assertEqual(Client().get('/api/manage/').status_code, 401)

    def test_create_store_without_local_preview_allows_first_day_reports(self):
        day = timezone.localdate()
        with override_settings(DEBUG=False, SREZ_LOCAL_PREVIEW=False):
            response = self.post('stores/0/', {'code':'NEW-ONLINE', 'name':'Новый магазин',
                'city':'Москва', 'network':'MM', 'timezone':'Europe/Moscow',
                'active_from':str(day), 'opens_at':'10:00', 'closes_at':'22:00',
                'weekdays':list(range(7)), 'monitoring_enabled':True, 'staff':[]})
        self.assertEqual(response.status_code, 200, response.content)
        store = Store.objects.get(pk=response.json()['id'])
        reports = Report.objects.filter(store=store, date=day)
        self.assertEqual(set(reports.values_list('checkpoint', flat=True)), {'13','17','close'})
        self.assertFalse(reports.filter(deadline__isnull=False).exists())
        self.assertEqual(store.profile['monitoring_from'], str(day+timedelta(days=1)))
        self.assertFalse(store.access_set.exists())

    def test_manual_report_creation_and_admin_submission(self):
        response = self.post('reports/', {'store_id': self.store.pk, 'date': str(self.day), 'checkpoint': '13'})
        self.assertEqual(response.status_code, 200, response.content)
        report = Report.objects.get(pk=response.json()['id'])
        result = self.client.post(f'/api/reports/{report.pk}/', json.dumps({'version':0,'request_id':str(uuid4()),'revenue':'1000','receipts':2,'units':3,'employee':'Иванов Иван','comment':''}), content_type='application/json')
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(result.json()['revision']['employee'], 'Иванов Иван')
        self.assertEqual(report.revisions.get().author, self.admin)
        self.assertEqual(self.post('reports/', {'store_id': self.store.pk, 'date': str(self.day+timedelta(days=2)), 'checkpoint':'13'}).status_code, 400)

    def test_monitoring_activation_does_not_backfill_false_lateness(self):
        tomorrow = timezone.localdate()+timedelta(days=1)
        historical = Report.objects.create(store=self.store, date=self.day, checkpoint='13', imported=True)
        upcoming = Report.objects.create(store=self.store, date=tomorrow, checkpoint='13', imported=True)
        response = self.post(f'stores/{self.store.pk}/', {'monitoring_enabled': True})
        self.assertEqual(response.status_code, 200, response.content)
        self.store.refresh_from_db()
        self.assertEqual(self.store.profile['monitoring_from'], str(tomorrow))
        ensure_reports(self.store, self.day)
        ensure_reports(self.store, tomorrow)
        historical.refresh_from_db(); upcoming.refresh_from_db()
        self.assertIsNone(historical.deadline)
        self.assertIsNotNone(upcoming.deadline)
        tick()
        self.assertFalse(historical.findings.exists())

    def test_password_changes_keep_current_session_and_invalidate_other_sessions(self):
        other = Client(); other.force_login(self.admin)
        self.assertEqual(self.post('password/', {'current':'wrong','password':'new-test-password-123'}).status_code, 400)
        response = self.post('password/', {'current':'original-test-password','password':'new-test-password-123'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get('/api/manage/').status_code, 200)
        self.assertEqual(other.get('/api/manage/').status_code, 401)
        event = ManagementEvent.objects.get()
        self.assertNotIn('password', json.dumps(event.after))


@override_settings(SECURE_SSL_REDIRECT=False)
class SourceImportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser('demo.admin', password='test-password')
        get_user_model().objects.create_user('demo.office', password='office-password')
        get_user_model().objects.create_user('demo.store', password='store-password')
        self.day = str(timezone.localdate()-timedelta(days=1))
        self.temp = TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name); (self.directory/'sources').mkdir()
        for name in ['mm-complete.json','kk-complete.json','hr.json']:
            (self.directory/'sources'/name).write_text(json.dumps({'title': name,'sheets':[{'title':'Лист','values':[['ФИО',None,0]],'formulas':[[None,None,'=1-1']]}]}, ensure_ascii=False), encoding='utf-8')
        key = hashlib.sha256('иванов иван'.encode()).hexdigest()
        self.manifest = {'stats':{'stores':1,'from':self.day}, 'stores':[{'code':'MS-001','name':'Address','city':'City','network':'MM','timezone':'Europe/Moscow','profile':{'vacancies':0},'staff':{'seller1':key}}],
            'employees':[{'key':key,'name':'Иванов Иван','position':'Продавец','sources':['Реестр']}], 'legal_entities':[], 'issues':[],
            'plans':[{'code':'MS-001','date':self.day,'revenue':'10000.00','receipts':None,'units':20,'units_per_receipt':'2.00','source_data':{'sheet':'Лист'}}],
            'reports':[{'code':'MS-001','date':self.day,'checkpoint':'13','values':{'revenue':'0.00','receipts':0,'units':None},'source_data':{'employee':'Иванов Иван'},'has_values':True},
                       {'code':'MS-001','date':self.day,'checkpoint':'17','values':{'revenue':None,'receipts':None,'units':None},'source_data':{'employee':''},'has_values':False}]}

    def run_import(self):
        (self.directory/'prepared.json').write_text(json.dumps(self.manifest, ensure_ascii=False),encoding='utf-8')
        call_command('import_sources', str(self.directory), apply=True, stdout=StringIO())

    def test_complete_idempotent_import_preserves_null_zero_source_and_unknown_time(self):
        Store.objects.create(code='ДЕМО-01', name='Demo', city='City', network='MM', active_from=self.day)
        self.run_import(); self.run_import()
        self.assertEqual(list(get_user_model().objects.filter(is_active=True).values_list('username',flat=True)), ['demo.admin'])
        self.assertEqual(Store.objects.filter(archived=False).count(), 1)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(StoreStaff.objects.count(), 1)
        self.assertEqual(SourceSheet.objects.count(), 3)
        self.assertEqual(SourceSheet.objects.first().values, [['ФИО',None,0]])
        self.assertEqual(SourceSheet.objects.first().formulas, [[None,None,'=1-1']])
        self.assertEqual((Plan.objects.count(), Report.objects.count(), Revision.objects.count()), (1,2,1))
        report = Report.objects.get(checkpoint='13')
        r = report.revisions.get()
        self.assertEqual((r.revenue, r.receipts, r.units), (Decimal('0'),0,None))
        self.assertIsNone(r.received_at); self.assertIsNone(report.first_received_at); self.assertIsNone(report.deadline)
        self.assertEqual(report_json(report)['status'], 'partial')
        tick()
        self.assertFalse(report.findings.exists())

    def test_import_never_overwrites_manual_correction_or_plan(self):
        self.run_import()
        report = Report.objects.get(checkpoint='13')
        submit(self.admin, report.pk, {'version':1,'request_id':str(uuid4()),'revenue':'100','receipts':1,'units':2,'employee':'Иванов Иван','comment':'Уточнение'})
        Plan.objects.create(store=report.store,date=self.day,revenue=12000,approved_by=self.admin,reason='Уточнение')
        self.manifest['reports'][0]['values']['revenue'] = '50.00'
        self.manifest['plans'][0]['revenue'] = '11000.00'
        self.run_import()
        report.refresh_from_db()
        self.assertEqual(report.current_version, 2)
        self.assertEqual(report.revisions.last().revenue, 100)
        self.assertIsNone(report.first_received_at)
        self.assertEqual(Plan.objects.first().revenue, 12000)
        self.assertEqual(ImportIssue.objects.filter(kind='manual_preserved').count(), 2)

    def test_changed_source_and_reverting_to_previous_values_create_history(self):
        self.run_import()
        self.manifest['reports'][0]['values']['revenue'] = '20.00'; self.run_import()
        self.manifest['reports'][0]['values']['revenue'] = '0.00'; self.run_import()
        self.assertEqual(Revision.objects.count(), 3)
        self.assertEqual(Report.objects.get(checkpoint='13').current_version, 3)

    def test_partial_plan_is_retained_without_inventing_revenue(self):
        self.manifest['plans'][0]['revenue'] = None
        self.run_import(); self.run_import()
        self.assertEqual(Plan.objects.count(), 1)
        self.assertIsNone(Plan.objects.get().revenue)
        self.assertEqual(Plan.objects.get().units, 20)
        self.client.force_login(self.admin)
        data = self.client.get('/api/dashboard/', {'date': self.day}).json()
        self.assertIsNone(data['stores'][0]['plan']['revenue'])
