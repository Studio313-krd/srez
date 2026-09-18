import json
from datetime import timedelta
from io import BytesIO, StringIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from .models import Access, Store, Report, Revision, Finding, FindingAction, Notification, NotificationChannel, ScheduleException
from .services import make_finding, queue_notification, submit
from .worker import deliver_notifications, notification_status


@override_settings(TELEGRAM_BOT_TOKEN='setup-telegram-secret', MAX_BOT_TOKEN='setup-max-secret',
    MAX_API_URL='https://platform-api2.max.ru', MAX_CA_BUNDLE='')
class BotSetupTests(SimpleTestCase):
    @patch('reports.management.commands.bot_chat_id.urlopen')
    def test_telegram_reads_chat_ids_without_acknowledging_or_printing_messages(self, request):
        request.return_value.__enter__.return_value = BytesIO(json.dumps({'ok':True, 'result':[
            {'message':{'chat':{'id':-123, 'title':'Office'}, 'text':'private message'}},
            {'my_chat_member':{'chat':{'id':-456, 'title':'Group without commands'}}}
        ]}).encode())
        output = StringIO()
        call_command('bot_chat_id', 'telegram', stdout=output)
        self.assertEqual(output.getvalue(), '-123\tOffice\n-456\tGroup without commands\n')
        query = request.call_args.args[0]
        self.assertEqual(query.get_method(), 'GET')
        self.assertNotIn('offset', query.full_url)

    @patch('reports.management.commands.bot_chat_id.urlopen')
    def test_max_reads_event_chat_ids_with_tls_and_header_token(self, request):
        request.return_value.__enter__.return_value = BytesIO(json.dumps({'updates':[
            {'update_type':'bot_added', 'chat_id':123},
            {'update_type':'message_created', 'message':{'recipient':{'chat_id':456}, 'body':{'text':'private message'}}}
        ]}).encode())
        output = StringIO()
        call_command('bot_chat_id', 'max', stdout=output)
        self.assertEqual(output.getvalue(), '123\tbot_added\n456\tmessage_created\n')
        query = request.call_args.args[0]
        self.assertEqual(query.get_method(), 'GET')
        self.assertEqual(query.get_header('Authorization'), 'setup-max-secret')
        self.assertNotIn('secret', query.full_url)
        self.assertNotIn('marker', query.full_url)
        self.assertTrue(request.call_args.kwargs['context'].check_hostname)

    @patch('reports.management.commands.bot_chat_id.urlopen')
    def test_missing_token_or_insecure_max_endpoint_makes_no_request(self, request):
        with override_settings(TELEGRAM_BOT_TOKEN=''), self.assertRaises(CommandError):
            call_command('bot_chat_id', 'telegram')
        with override_settings(MAX_API_URL='http://api.invalid'), self.assertRaises(CommandError):
            call_command('bot_chat_id', 'max')
        request.assert_not_called()

    @patch('reports.management.commands.bot_chat_id.urlopen', side_effect=TimeoutError('secret in request URL'))
    def test_setup_error_does_not_expose_token(self, request):
        with self.assertRaises(CommandError) as error:
            call_command('bot_chat_id', 'telegram')
        self.assertIn('TimeoutError', str(error.exception))
        self.assertNotIn('secret', str(error.exception))


@override_settings(SECURE_SSL_REDIRECT=False, TELEGRAM_ENABLED=False, MAX_ENABLED=False)
class ReviewTests(TestCase):
    def setUp(self):
        self.day = timezone.localdate() - timedelta(days=1)
        self.admin = get_user_model().objects.create_superuser('admin')
        self.seller = get_user_model().objects.create_user('seller')
        self.store = Store.objects.create(code='R1', name='Store', city='City', network='MM', active_from=self.day, monitoring_enabled=False)
        Access.objects.create(user=self.seller, role='store').stores.add(self.store)
        self.client.force_login(self.admin)

    def dashboard(self, day=None):
        response = self.client.get('/api/dashboard/', {'date': str(day or self.day)})
        self.assertEqual(response.status_code, 200)
        return response.json()['stores'][0]

    def test_empty_history_and_store_without_rows_are_visible_without_fake_lateness(self):
        report = Report.objects.create(store=self.store, date=self.day, checkpoint='13', imported=True)
        result = self.dashboard()
        self.assertEqual(result['reports'][0]['status'], 'unfilled')
        self.assertFalse(result['reports'][0]['late'])
        self.assertEqual(result['checkpoint_status']['close'], 'unfilled')
        report.refresh_from_db(); self.assertIsNone(report.deadline)

    def test_future_blank_rows_do_not_require_attention(self):
        day = self.day + timedelta(days=3)
        Report.objects.create(store=self.store, date=day, checkpoint='13', imported=True)
        result = self.dashboard(day)
        self.assertEqual(result['reports'][0]['status'], 'waiting')
        self.assertEqual(result['checkpoint_status']['close'], 'waiting')

    def test_confirmed_day_off_is_not_missing(self):
        self.store.monitoring_enabled = True; self.store.save()
        ScheduleException.objects.create(store=self.store, date=self.day, closed=True, reason='Closed')
        result = self.dashboard()
        self.assertEqual(result['reports'], [])
        self.assertEqual(set(result['checkpoint_status'].values()), {'not_expected'})

    def test_confirmed_overdue_report_is_missing(self):
        self.store.monitoring_enabled = True; self.store.save()
        self.assertEqual({r['status'] for r in self.dashboard()['reports']}, {'missing'})

    def test_question_for_partial_report_and_seller_reply(self):
        report = Report.objects.create(store=self.store, date=self.day, checkpoint='close', imported=True, current_version=1)
        Revision.objects.create(report=report, version=1, author=self.admin, revenue='10', receipts=1, units=None, origin='sheets', request_id=uuid4())
        response = self.client.post(f'/api/reports/{report.pk}/question/', {'comment':'Уточните количество единиц'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        finding = Finding.objects.get(report=report)
        self.assertEqual(finding.state, 'requested'); self.assertFalse(Notification.objects.exists())
        self.client.force_login(self.seller)
        response = self.client.post(f'/api/findings/{finding.pk}/action/', {'action':'reply','comment':'Проверили, две единицы'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(Notification.objects.values_list('channel', flat=True)), {'telegram','max'})
        submit(self.seller, report.pk, {'version':1,'request_id':str(uuid4()),'revenue':'10','receipts':1,'units':2,'comment':'Уточнили по кассе'})
        finding.refresh_from_db(); self.assertEqual(finding.state, 'requested')

    def test_store_can_ask_own_question_but_cannot_access_other_store(self):
        report = Report.objects.create(store=self.store, date=self.day, checkpoint='13')
        self.client.force_login(self.seller)
        self.assertEqual(self.client.post(f'/api/reports/{report.pk}/question/', {'comment':'Помогите с отчётом'}, content_type='application/json').status_code, 200)
        own_question = Finding.objects.get(report=report, kind='manual_question')
        self.assertEqual(own_question.actions.get().action, 'question')
        self.assertEqual(Notification.objects.filter(finding=own_question).count(), 2)
        self.assertEqual(self.client.get('/api/manage/').status_code, 403)
        other = Store.objects.create(code='R2', name='Other', city='City', network='MM', active_from=self.day)
        foreign = Report.objects.create(store=other, date=self.day, checkpoint='13')
        self.assertEqual(self.client.post(f'/api/reports/{foreign.pk}/question/', {'comment':'x'}, content_type='application/json').status_code, 404)
        finding = make_finding(foreign, 0, 'missing', 'Missing')
        self.assertEqual(self.client.post(f'/api/findings/{finding.pk}/action/', {'action':'reply','comment':'x'}, content_type='application/json').status_code, 404)


@override_settings(TELEGRAM_ENABLED=True, TELEGRAM_BOT_TOKEN='telegram-secret', TELEGRAM_CHAT_ID='-123',
    MAX_ENABLED=True, MAX_BOT_TOKEN='max-secret', MAX_CHAT_ID='456', PUBLIC_URL='https://reports.example.ru')
class NotificationTests(TestCase):
    def setUp(self):
        store = Store.objects.create(code='N1', name='Store', city='City', network='MM', active_from=timezone.localdate())
        self.report = Report.objects.create(store=store, date=timezone.localdate(), checkpoint='close')
        self.finding = make_finding(self.report, 0, 'missing', 'Missing')

    @staticmethod
    def response(value):
        result = MagicMock()
        result.__enter__.return_value.read.return_value = json.dumps(value).encode()
        return result

    @patch('reports.worker.urlopen')
    def test_both_channels_send_correct_card_and_do_not_repeat_success(self, request):
        request.side_effect = [self.response({'ok':True}), self.response({'message':{'body':{'mid':'m1'}}})]
        self.assertEqual(deliver_notifications(), 2); self.assertEqual(deliver_notifications(), 0)
        telegram, max_call = [c.args[0] for c in request.call_args_list]
        payload = json.loads(telegram.data)
        self.assertIn('Закрытие', payload['text'])
        self.assertIn(f'report={self.report.pk}', payload['reply_markup']['inline_keyboard'][0][0]['url'])
        self.assertIn('platform-api2.max.ru/messages?chat_id=456', max_call.full_url)
        self.assertNotIn('max-secret', max_call.full_url)
        self.assertEqual(max_call.get_header('Authorization'), 'max-secret')
        self.assertTrue(request.call_args_list[1].kwargs['context'].check_hostname)
        self.assertEqual(Notification.objects.filter(sent_at__isnull=False).count(), 2)

    @patch('reports.worker.urlopen')
    def test_channel_failure_does_not_block_the_other(self, request):
        request.side_effect = [TimeoutError('secret in URL'), self.response({'message':{'body':{'mid':'m1'}}})]
        self.assertEqual(deliver_notifications(), 1)
        item = Notification.objects.get(channel='telegram')
        self.assertEqual(item.last_error, 'TimeoutError'); self.assertGreater(item.next_attempt_at, timezone.now())
        self.assertIsNotNone(Notification.objects.get(channel='max').sent_at)

    @patch('reports.worker.urlopen')
    def test_disabled_channel_and_incomplete_config_do_not_make_requests(self, request):
        with override_settings(TELEGRAM_ENABLED=False, MAX_BOT_TOKEN=''):
            self.assertEqual(deliver_notifications(), 0)
        request.assert_not_called()

    @patch('reports.worker.urlopen')
    def test_local_link_is_not_sent_to_real_chat(self, request):
        with override_settings(PUBLIC_URL='http://localhost:8087'):
            self.assertEqual(deliver_notifications(), 0)
        request.assert_not_called()

    @patch('reports.worker.urlopen')
    def test_resolved_and_archived_findings_are_not_sent(self, request):
        self.finding.state = 'resolved'; self.finding.save()
        self.assertEqual(deliver_notifications(), 0)
        self.finding.state = 'open'; self.finding.save()
        self.report.store.archived = True; self.report.store.save()
        self.assertEqual(deliver_notifications(), 0); request.assert_not_called()

    @patch('reports.worker.urlopen')
    def test_retry_after_and_sanitized_error(self, request):
        error = HTTPError('https://secret.invalid/token', 429, 'sensitive response', {}, BytesIO(b'{"parameters":{"retry_after":300}}'))
        request.side_effect = [error, self.response({'message':{'body':{'mid':'m1'}}})]
        deliver_notifications(); item = Notification.objects.get(channel='telegram')
        self.assertEqual(item.last_error, 'HTTP 429')
        self.assertGreater(item.next_attempt_at, timezone.now() + timedelta(seconds=290))
        self.assertGreater(NotificationChannel.objects.get(channel='telegram').next_send_at, timezone.now() + timedelta(seconds=290))

    @patch('reports.worker.urlopen')
    def test_rate_limit_and_reply_event_deduplication(self, request):
        user = get_user_model().objects.create_user('seller')
        action = FindingAction.objects.create(finding=self.finding, author=user, action='reply', comment='Checked')
        queue_notification(self.finding, action); queue_notification(self.finding, action)
        self.assertEqual(Notification.objects.count(), 4)
        request.side_effect = [self.response({'ok':True}), self.response({'message':{'body':{'mid':'m1'}}})]
        self.assertEqual(deliver_notifications(), 2); self.assertEqual(deliver_notifications(), 0)
        self.assertEqual(request.call_count, 2)

    def test_status_does_not_expose_secrets(self):
        result = json.dumps(notification_status(), default=str)
        self.assertNotIn('telegram-secret', result); self.assertNotIn('max-secret', result)
        self.assertNotIn('456', result)
