import hashlib
from datetime import timedelta
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Access, Employee, ManagementEvent, Plan, Report, Revision, Store, StoreStaff
from .services import allowed_stores, business_date, ensure_reports, make_finding
from .worker import pending_notifications, tick


@override_settings(SECURE_SSL_REDIRECT=False, SREZ_TEST_MODE=False)
class ArchiveTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user('admin')
        Access.objects.create(user=self.admin, role='manager')
        self.seller = get_user_model().objects.create_user('seller')
        self.day = timezone.localdate() - timedelta(days=2)
        self.store = Store.objects.create(code='MS-901', name='Магазин', city='Самара', network='MM',
                                         active_from=self.day, monitoring_enabled=False)
        Access.objects.create(user=self.seller, role='store').stores.add(self.store)
        name = 'Иванов Иван'
        self.employee = Employee.objects.create(name=name, key=hashlib.sha256(name.casefold().encode()).hexdigest())
        self.assignment = StoreStaff.objects.create(store=self.store, employee=self.employee, slot='seller1')
        self.report = Report.objects.create(store=self.store, date=self.day, checkpoint='13', current_version=1)
        self.revision = Revision.objects.create(report=self.report, version=1, author=self.seller, employee=name,
            revenue=1500, receipts=3, units=4, request_id=uuid4(), payload_hash='archive-test')
        self.plan = Plan.objects.create(store=self.store, date=self.day, revenue=25000,
                                       approved_by=self.admin, reason='План')
        self.client.force_login(self.admin)

    def post(self, path, data):
        return self.client.post('/api/manage/' + path, data, content_type='application/json')

    def archive(self, kind, item, archived=True):
        return self.post(f'{kind}/{item.pk}/archive/', {'archived': archived})

    def test_store_archive_and_restore_preserve_reports_plans_assignments_and_access(self):
        self.assertEqual(self.archive('stores', self.store).status_code, 200)
        self.assertEqual(self.archive('stores', self.store).status_code, 200)
        self.assertFalse(allowed_stores(self.seller).exists())
        self.assertEqual(self.client.get('/api/manage/').json()['stores'], [])
        archived = self.client.get('/api/manage/?include_archived=1').json()['stores']
        self.assertTrue(archived[0]['archived'])
        self.assertEqual(self.client.get(f'/api/dashboard/?date={self.day}').json()['stores'], [])
        self.assertEqual(self.post(f'stores/{self.store.pk}/', {'name': 'Lost'}).status_code, 409)
        self.assertEqual(self.post('reports/', {'store_id': self.store.pk, 'date': str(self.day), 'checkpoint': '17'}).status_code, 400)
        self.assertEqual(self.archive('stores', self.store, False).status_code, 200)
        self.store.refresh_from_db()
        self.assertFalse(self.store.archived)
        self.assertFalse(self.store.monitoring_enabled)
        self.assertTrue(allowed_stores(self.seller).filter(pk=self.store.pk).exists())
        self.assertTrue(Plan.objects.filter(pk=self.plan.pk, revenue=25000).exists())
        self.assertTrue(Revision.objects.filter(pk=self.revision.pk, revenue=1500, employee=self.employee.name).exists())
        self.assertTrue(StoreStaff.objects.filter(pk=self.assignment.pk).exists())
        self.assertEqual(ManagementEvent.objects.filter(action='Удаление магазина').count(), 1)
        event = ManagementEvent.objects.get(action='Восстановление магазина')
        self.assertTrue(event.before['archived'])
        self.assertFalse(event.after['archived'])

    def test_store_archive_pauses_reports_notifications_and_restore_does_not_backfill_gap(self):
        self.store.monitoring_enabled = True
        self.store.save()
        make_finding(self.report, 1, 'question', 'Проверьте цифры')
        overdue = Report.objects.create(store=self.store, date=self.day, checkpoint='17',
                                        deadline=timezone.now() - timedelta(days=1))
        self.assertEqual(pending_notifications('telegram').count(), 1)
        self.archive('stores', self.store)
        tick()
        self.assertEqual(Report.objects.count(), 2)
        self.assertFalse(overdue.findings.exists())
        self.assertFalse(pending_notifications('telegram').exists())
        self.archive('stores', self.store, False)
        self.store.refresh_from_db()
        today = business_date(self.store)
        self.assertEqual(self.store.profile['monitoring_from'], str(today + timedelta(days=1)))
        self.assertEqual(self.store.expected_through, today)
        ensure_reports(self.store, self.day + timedelta(days=1))
        ensure_reports(self.store, today)
        self.assertEqual(Report.objects.count(), 2)
        ensure_reports(self.store, today + timedelta(days=1))
        self.assertEqual(Report.objects.filter(date=today + timedelta(days=1)).count(), 3)

    def test_employee_archive_hides_picker_keeps_history_and_restores_work_status(self):
        for active in (True, False):
            self.employee.active = active
            self.employee.save()
            self.assertEqual(self.archive('employees', self.employee).status_code, 200)
            self.assertEqual(self.client.get('/api/manage/').json()['employees'], [])
            overview = self.client.get('/api/manage/?include_archived=1').json()
            self.assertTrue(overview['employees'][0]['archived'])
            self.assertTrue(overview['stores'][0]['staff'][0]['archived'])
            self.client.force_login(self.seller)
            dashboard = self.client.get(f'/api/dashboard/?date={self.day}').json()
            self.assertEqual(dashboard['stores'][0]['employees'], [])
            self.client.force_login(self.admin)
            self.assertEqual(self.post(f'employees/{self.employee.pk}/', {'name': 'Changed'}).status_code, 409)
            self.assertEqual(self.archive('employees', self.employee, False).status_code, 200)
            self.employee.refresh_from_db()
            self.assertEqual(self.employee.active, active)
            self.assertFalse(self.employee.archived)
        self.revision.refresh_from_db()
        self.assertEqual(self.revision.employee, self.employee.name)
        self.assertTrue(StoreStaff.objects.filter(pk=self.assignment.pk).exists())
        self.assertEqual(self.client.get(f'/api/dashboard/?date={self.day}').json()['stores'][0]['employees'][0]['employee_id'], self.employee.pk)

    def test_archived_employee_cannot_get_new_assignment_but_existing_is_preserved(self):
        self.archive('employees', self.employee)
        existing = {'staff': [{'slot': 'seller1', 'id': self.employee.pk}]}
        self.assertEqual(self.post(f'stores/{self.store.pk}/', existing).status_code, 200)
        invalid = {'name': 'Must roll back', 'staff': [{'slot': 'seller2', 'id': self.employee.pk}]}
        self.assertEqual(self.post(f'stores/{self.store.pk}/', invalid).status_code, 400)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'Магазин')
        self.assertEqual(self.store.staff.get().slot, 'seller1')

    def test_archive_requires_manager_and_strict_boolean_and_cannot_be_bypassed_by_edit(self):
        for kind, item in [('stores', self.store), ('employees', self.employee)]:
            for value in [None, 'false', 1]:
                self.assertEqual(self.archive(kind, item, value).status_code, 400)
            self.assertEqual(self.post(f'{kind}/{item.pk}/', {'archived': True}).status_code, 200)
            item.refresh_from_db()
            self.assertFalse(item.archived)
            self.client.force_login(self.seller)
            self.assertEqual(self.archive(kind, item).status_code, 403)
            self.assertEqual(self.client.get('/api/manage/?include_archived=1').status_code, 403)
            self.client.logout()
            self.assertEqual(self.archive(kind, item).status_code, 401)
            self.client.force_login(self.admin)
            self.assertEqual(self.post(f'{kind}/999999/archive/', {'archived': True}).status_code, 404)
        self.assertFalse(ManagementEvent.objects.filter(action__startswith='Удаление').exists())
