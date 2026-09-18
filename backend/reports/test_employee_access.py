import hashlib
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings, Client
from django.utils import timezone
from .employee_links import signer
from .models import Access, Employee, Store, ManagementEvent, LoginAttempt


@override_settings(SECURE_SSL_REDIRECT=False)
class EmployeeAccessTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user('administrator')
        Access.objects.create(user=self.admin, role='manager')
        self.person = Employee.objects.create(name='Учебный Продавец', key=hashlib.sha256(b'employee').hexdigest())
        self.store = Store.objects.create(code='ACCESS-1', name='Первый', city='Самара', network='MM',
            active_from=timezone.localdate(), monitoring_enabled=False)
        self.other = Store.objects.create(code='ACCESS-2', name='Второй', city='Самара', network='KK',
            active_from=timezone.localdate(), monitoring_enabled=False)
        self.url = f'/api/manage/employees/{self.person.pk}/access/'
        self.client.force_login(self.admin)

    def grant(self, **changes):
        data = {'enabled': True, 'store_ids': [self.store.pk]}
        data.update(changes)
        return self.client.post(self.url, data, content_type='application/json')

    def token(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['link_path'].split('#seller=')[1]

    def enter(self, client, token):
        return client.post('/api/employee-link/login/', {'token': token}, content_type='application/json')

    def test_reusable_link_only_assigned_stores_and_no_secret_in_audit(self):
        token = self.token(self.grant())
        self.person.refresh_from_db()
        self.assertFalse(self.person.user.has_usable_password())
        self.assertEqual(self.person.user.access.role, 'store')
        seller = Client()
        login = self.enter(seller, token)
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()['user']['employee_name'], self.person.name)
        self.assertEqual([s['id'] for s in seller.get('/api/dashboard/').json()['stores']], [self.store.pk])
        self.assertEqual(seller.get('/api/manage/').status_code, 403)
        self.assertEqual(seller.get(self.url).status_code, 403)
        self.assertEqual(seller.post(self.url, {}, content_type='application/json').status_code, 403)
        self.assertEqual(self.enter(Client(), token).status_code, 200)
        self.assertEqual(self.token(self.client.get(self.url)), token)
        self.assertEqual(self.token(self.grant()), token)
        events = str(list(ManagementEvent.objects.values('before', 'after')))
        self.assertNotIn(token, events)
        self.assertNotIn(self.person.login_version, events)
        overview = str(self.client.get('/api/manage/').json())
        self.assertNotIn(token, overview)
        self.assertNotIn(self.person.login_version, overview)

    def test_bad_grants_are_atomic_and_admin_access_cannot_be_changed(self):
        self.assertEqual(Client().get(self.url).status_code, 401)
        for changes in [{'store_ids': []}, {'store_ids': [999]}, {'enabled': 'true'}, {'store_ids': [True]}, {'rotate_link': 'true'}]:
            self.assertEqual(self.grant(**changes).status_code, 400, changes)
        self.person.refresh_from_db()
        self.assertIsNone(self.person.user_id)
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertFalse(ManagementEvent.objects.exists())
        self.person.user = self.admin
        self.person.save()
        self.assertEqual(self.grant().status_code, 403)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_change_stores_disable_and_reenable_do_not_revive_old_session(self):
        token = self.token(self.grant())
        seller = Client()
        self.enter(seller, token)
        self.assertEqual(self.token(self.grant(store_ids=[self.other.pk])), token)
        self.assertEqual([s['id'] for s in seller.get('/api/dashboard/').json()['stores']], [self.other.pk])
        self.grant(enabled=False, store_ids=[])
        self.assertEqual(self.enter(Client(), token).status_code, 401)
        self.grant()
        self.assertEqual(seller.get('/api/dashboard/').status_code, 401)
        self.assertEqual(self.enter(seller, token).status_code, 200)

    def test_replacement_revokes_old_link_and_every_old_session(self):
        old = self.token(self.grant())
        seller = Client()
        self.enter(seller, old)
        new = self.token(self.grant(rotate_link=True))
        self.assertNotEqual(new, old)
        self.assertEqual(self.enter(Client(), old).status_code, 401)
        self.assertEqual(seller.get('/api/dashboard/').status_code, 401)
        self.assertEqual(self.enter(seller, new).status_code, 200)

    def test_archiving_and_inactive_status_close_link_and_sessions(self):
        token = self.token(self.grant())
        self.person.refresh_from_db()
        seller = Client()
        self.enter(seller, token)
        archive_url = f'/api/manage/employees/{self.person.pk}/archive/'
        self.client.post(archive_url, {'archived': True}, content_type='application/json')
        self.assertEqual(self.enter(Client(), token).status_code, 401)
        self.assertEqual(self.grant().status_code, 400)
        self.client.post(archive_url, {'archived': False}, content_type='application/json')
        self.assertEqual(self.enter(Client(), token).status_code, 401)
        self.grant()
        self.assertEqual(seller.get('/api/dashboard/').status_code, 401)
        self.assertEqual(self.enter(seller, token).status_code, 200)
        self.client.post(f'/api/manage/employees/{self.person.pk}/', {'active': False}, content_type='application/json')
        self.assertEqual(self.enter(Client(), token).status_code, 401)
        self.assertEqual(seller.get('/api/dashboard/').status_code, 401)
        self.assertNotIn(self.person.login_version, str(list(ManagementEvent.objects.values('before', 'after'))))

    def test_invalid_and_tampered_links_are_rejected(self):
        token = self.token(self.grant())
        self.person.refresh_from_db()
        wrong_person = signer().sign_object({'id': 9999, 'version': self.person.login_version})
        for bad in ['', None, {}, 'x' * 2049, token + 'x', wrong_person, signer().sign_object([])]:
            self.assertEqual(self.enter(Client(), bad).status_code, 401, bad)
        self.assertEqual(self.enter(Client(), token).status_code, 200)
        self.assertEqual(self.client.get('/api/employee-link/login/').status_code, 405)

    def test_link_login_requires_csrf_and_limits_repeated_failures(self):
        token = self.token(self.grant())
        strict = Client(enforce_csrf_checks=True)
        self.assertEqual(self.enter(strict, token).status_code, 403)
        csrf = strict.get('/api/session/').json()['csrf']
        self.assertEqual(strict.post('/api/employee-link/login/', {'token': token}, content_type='application/json', HTTP_X_CSRFTOKEN=csrf).status_code, 200)
        for _ in range(20):
            self.assertEqual(self.enter(Client(), 'bad-signature').status_code, 401)
        self.assertEqual(LoginAttempt.objects.get().failures, 20)
        self.assertEqual(self.enter(Client(), 'bad-signature').status_code, 429)

    def test_link_replaces_existing_account_session(self):
        token = self.token(self.grant())
        other_person = Employee.objects.create(name='Второй продавец', key='second')
        response = self.client.post(f'/api/manage/employees/{other_person.pk}/access/',
            {'enabled': True, 'store_ids': [self.other.pk]}, content_type='application/json')
        second = self.token(response)
        seller = Client()
        self.enter(seller, token)
        self.assertEqual(self.enter(seller, second).json()['user']['employee_name'], other_person.name)
        self.assertEqual([s['id'] for s in seller.get('/api/dashboard/').json()['stores']], [self.other.pk])
