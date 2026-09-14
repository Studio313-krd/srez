import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import skipUnless
from unittest.mock import patch, MagicMock
from uuid import uuid4
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.db import connection, close_old_connections
from django.test import TestCase, TransactionTestCase, Client, override_settings
from django.utils import timezone
from .models import Access, Store, Report, Revision, Finding, FindingAction, Notification, NotificationChannel, ScheduleException, WorkerHealth
from .services import ensure_reports, submit, DomainError, business_date, make_finding
from .worker import tick, deliver_notifications


@override_settings(SECURE_SSL_REDIRECT=False)
class ReportingTests(TestCase):
    def setUp(self):
        self.day = timezone.localdate() - timedelta(days=1)
        self.store = Store.objects.create(code='T-01', name='Test', city='City', network='MM', active_from=self.day)
        self.other_store = Store.objects.create(code='T-02', name='Other', city='City', network='KK', active_from=self.day)
        self.user = get_user_model().objects.create_user('store', password='private-test-password')
        self.office = get_user_model().objects.create_user('office', password='private-test-password')
        Access.objects.create(user=self.user, role='store').stores.add(self.store)
        Access.objects.create(user=self.office, role='office')
        ensure_reports(self.store, self.day)
        ensure_reports(self.other_store, self.day)
        self.report = Report.objects.get(store=self.store, date=self.day, checkpoint='13')
        self.client.force_login(self.user)

    def payload(self, **overrides):
        return {'version': 0, 'request_id': str(uuid4()), 'revenue': '24500.20', 'receipts': 10, 'units': 18, 'comment': '', **overrides}

    def post(self, data, report=None, client=None):
        return (client or self.client).post(f'/api/reports/{(report or self.report).pk}/', json.dumps(data), content_type='application/json')

    def test_auth_and_store_isolation(self):
        self.assertEqual(Client().get('/api/dashboard/').status_code, 401)
        dashboard = self.client.get('/api/dashboard/', {'date': str(self.day)}).json()
        self.assertEqual([s['id'] for s in dashboard['stores']], [self.store.pk])
        foreign = Report.objects.filter(store=self.other_store).first()
        self.assertEqual(self.post(self.payload(), foreign).status_code, 404)
        self.assertEqual(self.client.get(f'/api/reports/{foreign.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/export/').status_code, 403)

    def test_csrf_login_and_submission(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.post('/api/login/', {'username': 'store'}).status_code, 403)
        token = browser.get('/api/session/').json()['csrf']
        response = browser.post('/api/login/', json.dumps({'username': 'store', 'password': 'private-test-password'}), content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.post(self.payload(), client=browser).status_code, 403)
        result = browser.post(f'/api/reports/{self.report.pk}/', json.dumps(self.payload()), content_type='application/json', HTTP_X_CSRFTOKEN=response.json()['csrf'])
        self.assertEqual(result.status_code, 201)

    def test_idempotency_and_original_timestamp_survive_correction(self):
        payload = self.payload()
        first = self.post(payload)
        self.assertEqual(first.status_code, 201)
        again = self.post(payload)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.json()['revision'], again.json()['revision'])
        changed_id_payload = {**payload, 'revenue': '30000'}
        self.assertEqual(self.post(changed_id_payload).status_code, 409)
        self.assertEqual(self.post(self.payload(version=1, revenue='26000', comment='Corrected receipt')).status_code, 201)
        self.report.refresh_from_db()
        self.assertEqual(self.report.current_version, 2)
        self.assertEqual(self.report.first_received_at.isoformat(), first.json()['revision']['received_at'])
        self.assertEqual(self.report.revisions.count(), 2)
        self.assertTrue(self.report.findings.filter(kind='late').exists())

    def test_stale_version_rejected_and_reason_required(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)
        self.assertEqual(self.post(self.payload()).status_code, 409)
        self.assertEqual(self.post(self.payload(version=1)).status_code, 400)

    def test_blank_zero_decimal_and_nonfinite(self):
        for overrides in [{'revenue': ''}, {'receipts': ''}, {'units': None}, {'receipts': '1.5'}, {'revenue': 'NaN'},
                          {'revenue': 'Infinity'}, {'revenue': '0.001'}, {'receipts': -1}, {'units': True}, {'revenue': '1e50'}]:
            with self.subTest(overrides=overrides):
                self.assertEqual(self.post(self.payload(**overrides)).status_code, 400)
        self.assertEqual(self.post(self.payload(revenue='0', receipts=0, units=0)).status_code, 201)
        self.assertEqual(self.report.revisions.get().revenue, Decimal('0'))

    def test_anomalies_require_explanation_and_recheck_earlier_edit(self):
        self.post(self.payload())
        later = Report.objects.get(store=self.store, checkpoint='17')
        self.assertEqual(self.post(self.payload(revenue='23000'), later).status_code, 400)
        self.assertEqual(self.post(self.payload(revenue='30000', receipts=20, units=30), later).status_code, 201)
        self.assertEqual(self.post(self.payload(version=1, revenue='40000', comment='Returns correction')).status_code, 201)
        self.assertTrue(later.findings.filter(kind='cumulative_13', state='open').exists())
        self.assertEqual(self.post(self.payload(version=2, revenue='25000', comment='Fixed totals')).status_code, 201)
        self.assertTrue(later.findings.filter(kind='cumulative_13', state='resolved').exists())

    def test_zero_receipts_with_sales_requires_comment(self):
        self.assertEqual(self.post(self.payload(receipts=0)).status_code, 400)
        self.assertEqual(self.post(self.payload(receipts=0, comment='Cash register correction')).status_code, 201)
        self.assertTrue(self.report.findings.filter(kind='zero_receipts').exists())

    def test_future_checkpoint_rejected(self):
        self.report.available_at = timezone.now() + timedelta(hours=1)
        self.report.save()
        self.assertEqual(self.post(self.payload()).status_code, 400)

    def test_office_cannot_replace_store_numbers_and_store_cannot_approve(self):
        office = Client(); office.force_login(self.office)
        self.assertEqual(self.post(self.payload(), client=office).status_code, 403)
        finding = make_finding(self.report, 0, 'missing', 'Not received')
        url = f'/api/findings/{finding.pk}/action/'
        self.assertEqual(self.client.post(url, json.dumps({'action': 'accepted', 'comment': 'Ignore'}), content_type='application/json').status_code, 400)
        self.assertEqual(office.post(url, json.dumps({'action': 'requested', 'comment': 'Please explain'}), content_type='application/json').status_code, 200)
        self.assertEqual(self.client.post(url, json.dumps({'action': 'reply', 'comment': 'Connection lost'}), content_type='application/json').status_code, 200)
        self.assertEqual(finding.actions.count(), 2)
        self.assertEqual(FindingAction.objects.last().author, self.user)

    def test_worker_deduplicates_and_receipt_resolves_missing(self):
        tick(); tick()
        self.assertEqual(self.report.findings.filter(kind='missing').count(), 1)
        self.assertEqual(Notification.objects.filter(finding__report=self.report, finding__kind='missing').count(), 2)
        self.post(self.payload())
        self.assertEqual(self.report.findings.get(kind='missing').state, 'resolved')
        self.assertTrue(WorkerHealth.objects.exists())

    def test_closing_next_day_timezone_and_weekend(self):
        store = self.other_store
        Report.objects.filter(store=store).delete()
        store.timezone = 'Asia/Yekaterinburg'; store.opens_at = time(10); store.closes_at = time(1); store.save()
        ensure_reports(store, self.day)
        closing = Report.objects.get(store=store, checkpoint='close')
        local = closing.deadline.astimezone(ZoneInfo(store.timezone))
        self.assertEqual(local.date(), self.day + timedelta(days=1))
        self.assertEqual(local.time(), time(1, 15))
        self.assertEqual(business_date(store, closing.available_at - timedelta(minutes=10)), self.day)
        future = self.day + timedelta(days=3)
        ScheduleException.objects.create(store=store, date=future, closed=True, reason='Holiday')
        ensure_reports(store, future)
        self.assertFalse(Report.objects.filter(store=store, date=future).exists())

    def test_deadlines_frozen_after_schedule_change(self):
        deadline = self.report.deadline
        self.store.timezone = 'Asia/Yekaterinburg'; self.store.save()
        ensure_reports(self.store, self.day)
        self.report.refresh_from_db()
        self.assertEqual(self.report.deadline, deadline)

    def test_worker_catches_up_after_downtime(self):
        start = self.day - timedelta(days=5)
        self.store.active_from = start
        self.store.expected_through = start
        self.store.save()
        tick()
        self.assertTrue(Report.objects.filter(store=self.store, date=start + timedelta(days=2), checkpoint='17').exists())
        self.store.refresh_from_db()
        self.assertGreaterEqual(self.store.expected_through, self.day)

    def test_admin_login_uses_shared_personal_login(self):
        self.assertEqual(Client().get('/admin/login/').status_code, 302)
        self.assertEqual(Client().get('/admin/login/')['Location'], '/')

    def test_export_and_formula_escape(self):
        self.store.name = '=IMPORTXML("bad")'; self.store.save()
        self.client.force_login(self.office)
        response = self.client.get('/api/export/', {'date': str(self.day)})
        self.assertEqual(response.status_code, 200)
        self.assertIn("'=IMPORTXML", response.content.decode())
        self.assertTrue(response.content.decode().startswith('\ufeff'))

    def test_login_rate_limit_persists_between_clients(self):
        for _ in range(20):
            response = Client().post('/api/login/', json.dumps({'username': 'store', 'password': 'bad'}), content_type='application/json')
            self.assertEqual(response.status_code, 401)
        self.assertEqual(Client().post('/api/login/', json.dumps({'username': 'store', 'password': 'bad'}), content_type='application/json').status_code, 429)

    @override_settings(TELEGRAM_ENABLED=False)
    @patch('reports.worker.urlopen')
    def test_notifications_disabled_by_default(self, request):
        tick(); self.assertEqual(deliver_notifications(), 0); request.assert_not_called()

    @override_settings(TELEGRAM_ENABLED=True, TELEGRAM_BOT_TOKEN='test-token', TELEGRAM_CHAT_ID='test-chat', PUBLIC_URL='https://test.invalid')
    @patch('reports.worker.urlopen')
    def test_notification_retry_and_success(self, request):
        finding = make_finding(self.report, 0, 'missing', 'Missing')
        item = Notification.objects.get(finding=finding, channel='telegram')
        request.side_effect = TimeoutError('hidden token url')
        deliver_notifications()
        item.refresh_from_db()
        self.assertEqual(item.attempts, 1)
        self.assertEqual(item.last_error, 'TimeoutError')
        self.assertIsNone(item.sent_at)
        self.assertGreater(item.next_attempt_at, timezone.now())
        item.next_attempt_at = timezone.now(); item.save()
        NotificationChannel.objects.update(next_send_at=timezone.now())
        request.side_effect = None
        request.return_value.__enter__.return_value.read.return_value = b'{"ok":true}'
        self.assertEqual(deliver_notifications(), 1)
        self.assertEqual(deliver_notifications(), 0)


@skipUnless(connection.vendor == 'postgresql', 'Row-lock concurrency is verified on PostgreSQL.')
class ConcurrencyTests(TransactionTestCase):
    def test_identical_concurrent_submission_has_one_revision(self):
        day = timezone.localdate() - timedelta(days=1)
        store = Store.objects.create(code='C-01', name='Concurrent', city='City', network='MM', active_from=day)
        user = get_user_model().objects.create_user('concurrent')
        Access.objects.create(user=user, role='store').stores.add(store)
        ensure_reports(store, day)
        report = Report.objects.get(store=store, checkpoint='13')
        payload = {'version': 0, 'request_id': str(uuid4()), 'revenue': '100', 'receipts': 2, 'units': 3}
        def send(_):
            close_old_connections()
            try:
                return submit(get_user_model().objects.get(pk=user.pk), report.pk, payload)[1]
            finally:
                connection.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            created = list(pool.map(send, range(2)))
        self.assertEqual(sorted(created), [False, True])
        self.assertEqual(Revision.objects.count(), 1)
