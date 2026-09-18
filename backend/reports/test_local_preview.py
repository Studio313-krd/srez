from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from .models import Access, Store, Report, ManagementEvent
from django.utils import timezone


@override_settings(DEBUG=True, SREZ_LOCAL_PREVIEW=True, SECURE_SSL_REDIRECT=False, ALLOWED_HOSTS=['localhost','testserver'])
class LocalPreviewTests(TestCase):
    def setUp(self):
        for username,role in [('test.admin','manager'),('test.seller','store')]:
            Access.objects.create(user=get_user_model().objects.create_user(username),role=role)

    def enter(self,**extra):
        return self.client.post('/api/local-preview/login/',{'role':'store'},content_type='application/json',HTTP_HOST='localhost:8099',**extra)

    def test_loopback_switches_to_seller(self):
        response=self.enter()
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['user']['role'],'store')

    def test_shortcut_is_unavailable_outside_explicit_local_preview(self):
        with override_settings(DEBUG=False):self.assertEqual(self.enter().status_code,404)
        with override_settings(SREZ_LOCAL_PREVIEW=False):self.assertEqual(self.enter().status_code,404)
        self.assertEqual(self.enter(REMOTE_ADDR='192.0.2.1').status_code,404)
        self.assertEqual(self.client.post('/api/local-preview/login/',{'role':'store'},content_type='application/json').status_code,404)
        self.assertNotIn('_auth_user_id',self.client.session)

    def create_store(self, **changes):
        data = {'code':'LOCAL-KK-001','name':'Учебный магазин','city':'Калининград','network':'KK',
                'timezone':'Europe/Kaliningrad','active_from':timezone.localdate().isoformat(),
                'opens_at':'10:00','closes_at':'22:00','weekdays':list(range(7)),
                'monitoring_enabled':True,'staff':[]}
        data.update(changes)
        return self.client.post('/api/local-preview/stores/',data,content_type='application/json',HTTP_HOST='localhost:8099')

    def test_create_store_is_visible_to_local_seller_and_keeps_first_day_without_lateness(self):
        self.client.force_login(get_user_model().objects.get(username='test.admin'))
        response=self.create_store(timezone='Europe/Moscow')
        self.assertEqual(response.status_code,200,response.content)
        store=Store.objects.get()
        self.assertEqual(store.network,'KK')
        self.assertTrue(Access.objects.get(user__username='test.seller').stores.filter(pk=store.pk).exists())
        self.assertEqual(Report.objects.filter(store=store).count(),3)
        self.assertFalse(Report.objects.filter(store=store,deadline__isnull=False).exists())
        self.assertTrue(ManagementEvent.objects.filter(action='Добавление магазина').exists())
        self.assertEqual(self.create_store().status_code,400)
        self.assertEqual(Store.objects.count(),1)

    def test_creation_rejects_sellers_and_disabled_preview(self):
        self.client.force_login(get_user_model().objects.get(username='test.seller'))
        self.assertEqual(self.create_store().status_code,403)
        self.client.force_login(get_user_model().objects.get(username='test.admin'))
        with override_settings(SREZ_LOCAL_PREVIEW=False):self.assertEqual(self.create_store().status_code,404)
        self.assertFalse(Store.objects.exists())

    def test_invalid_store_rolls_back_and_a_closed_day_has_no_reports(self):
        self.client.force_login(get_user_model().objects.get(username='test.admin'))
        self.assertEqual(self.create_store(timezone='Invalid/Zone').status_code,400)
        self.assertEqual(self.create_store(staff=[{'slot':'seller1','id':999999}]).status_code,400)
        self.assertFalse(Store.objects.exists())
        tomorrow_weekday=(timezone.localdate().weekday()+1)%7
        self.assertEqual(self.create_store(weekdays=[tomorrow_weekday]).status_code,200)
        self.assertFalse(Report.objects.exists())
