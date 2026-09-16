import json
import tempfile
from pathlib import Path
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from .models import Store, Report, Revision, Finding, Notification
from .services import ensure_reports
from .worker import tick, deliver_notifications


@override_settings(SREZ_TEST_MODE=True, ALLOWED_HOSTS=['testserver'])
class TestSiteTests(TestCase):
    def setUp(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'private.json'
            call_command('seed_test_site',output=str(target),verbosity=0)
            self.credentials=json.loads(target.read_text(encoding='utf-8'))
        self.admin=get_user_model().objects.get(username='test.admin')
        self.seller=get_user_model().objects.get(username='test.seller')
        self.client.force_login(self.admin)
        self.now=timezone.now().replace(hour=9,minute=0,second=0,microsecond=0)

    def begin(self, data=None):
        with patch('reports.test_site.timezone.now',return_value=self.now):
            return self.client.post('/api/test-site/start/',data=json.dumps(data or {}),content_type='application/json')

    def test_seed_has_exact_stores_and_restricted_seller_and_cannot_overwrite(self):
        self.assertEqual(set(Store.objects.values_list('network',flat=True)),{'MM','KK'})
        self.assertEqual(self.seller.access.stores.count(),2)
        self.assertFalse(self.seller.is_staff or self.seller.is_superuser)
        self.assertTrue(self.seller.check_password(self.credentials['accounts'][1]['password']))
        with self.assertRaises(CommandError):call_command('seed_test_site',output='/unused',verbosity=0)
        self.assertEqual(get_user_model().objects.count(),2)

    def test_disabled_and_seller_cannot_start(self):
        with override_settings(SREZ_TEST_MODE=False):
            self.assertEqual(self.begin().status_code,404)
            with self.assertRaises(CommandError):call_command('seed_test_site',output='/unused')
        self.client.force_login(self.seller)
        self.assertEqual(self.begin().status_code,403)
        self.assertFalse(Report.objects.exists())

    def test_short_run_and_no_automatic_next_day(self):
        self.assertEqual(self.begin().status_code,200)
        self.assertEqual(Report.objects.count(),6)
        r=Report.objects.get(store__code='TEST-MS',checkpoint='13')
        self.assertEqual(r.available_at,self.now)
        self.assertEqual(r.deadline,self.now+timedelta(minutes=3))
        ensure_reports(r.store,r.date+timedelta(days=1))
        self.assertEqual(Report.objects.count(),6)
        tick(self.now+timedelta(minutes=3,seconds=1))
        self.assertEqual(Finding.objects.filter(kind='missing').count(),2)
        self.assertEqual(Notification.objects.count(),4)

    def test_restart_requires_confirmation_and_rejects_foreign_data(self):
        self.assertEqual(self.begin().status_code,200)
        ids=set(Report.objects.values_list('pk',flat=True))
        self.assertEqual(self.begin().status_code,409)
        self.assertEqual(set(Report.objects.values_list('pk',flat=True)),ids)
        tick(self.now+timedelta(minutes=10))
        self.assertEqual(self.begin({'restart_confirmed':True}).status_code,200)
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(Finding.objects.exists())
        self.assertFalse(ids & set(Report.objects.values_list('pk',flat=True)))
        Store.objects.filter(code='TEST-MS').update(profile={})
        self.assertEqual(self.begin({'restart_confirmed':True}).status_code,409)
        self.assertEqual(Report.objects.count(),6)

    @override_settings(TELEGRAM_ENABLED=True,TELEGRAM_BOT_TOKEN='test-token',TELEGRAM_CHAT_ID='-100',PUBLIC_URL='https://srez-test.example.com')
    def test_real_pipeline_marks_test_messages(self):
        self.begin();tick(self.now+timedelta(minutes=4))
        with patch('reports.worker.urlopen') as connection:
            connection.return_value.__enter__.return_value.read.return_value=b'{"ok":true}'
            self.assertEqual(deliver_notifications(),1)
            payload=json.loads(connection.call_args.args[0].data)
            self.assertTrue(payload['text'].startswith('[ТЕСТ СРЕЗА]'))
            self.assertIn('https://srez-test.example.com/',payload['text'])
