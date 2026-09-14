import json
import tempfile
from pathlib import Path
from django.core.management import call_command, CommandError
from django.test import TestCase, RequestFactory, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Store, Access
from .proxy import TrustedProxyMiddleware


class LaunchTests(TestCase):
    def test_store_accounts_have_only_their_store_and_repeat_preserves_password(self):
        store = Store.objects.create(code='MS-001', name='Shop', city='City', network='MM', active_from=timezone.localdate())
        Store.objects.create(code='OLD', name='Old', city='City', network='MM', active_from=timezone.localdate(), archived=True)
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / 'first.json'
            call_command('issue_store_access', output=str(first), verbosity=0)
            rows = json.loads(first.read_text(encoding='utf-8'))
            self.assertEqual(len(rows), 1)
            user = get_user_model().objects.get(username=rows[0]['username'])
            self.assertTrue(user.check_password(rows[0]['password']))
            self.assertFalse(user.is_staff or user.is_superuser)
            self.assertEqual(Access.objects.get(user=user).role, 'store')
            self.assertEqual(list(user.access.stores.all()), [store])
            second = Path(directory) / 'second.json'
            call_command('issue_store_access', output=str(second), verbosity=0)
            self.assertEqual(json.loads(second.read_text()), [])
            with self.assertRaises(CommandError): call_command('issue_store_access', output=str(first))
            user.refresh_from_db(); self.assertTrue(user.check_password(rows[0]['password']))

    @override_settings(DEBUG=False, TRUSTED_PROXY_CIDRS='127.0.0.1/32,172.18.0.2/32')
    def test_only_trusted_proxy_can_assert_https(self):
        middleware = TrustedProxyMiddleware(lambda request: request.is_secure())
        trusted = RequestFactory().get('/', REMOTE_ADDR='172.18.0.2', HTTP_X_FORWARDED_PROTO='https')
        external = RequestFactory().get('/', REMOTE_ADDR='198.51.100.5', HTTP_X_FORWARDED_PROTO='https')
        self.assertTrue(middleware(trusted))
        self.assertFalse(middleware(external))
