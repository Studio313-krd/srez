"""Short acceptance runs, restricted to the explicitly isolated test installation."""
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from .models import Store, Report, Plan, Revision, Finding, FindingAction, Notification, ManagementEvent
from .services import DomainError, role
from .views import endpoint, body


def require_test_admin(request):
    if not settings.SREZ_TEST_MODE: raise DomainError('Страница не найдена.', 404)
    if role(request.user) != 'manager': raise DomainError('Прогоном управляет администратор.', 403)


@endpoint()
def status(request):
    require_test_admin(request)
    day = timezone.localdate()
    reports = Report.objects.filter(date=day, store__profile__sandbox_store=True)
    return JsonResponse({'date':day, 'started':reports.exists(), 'reports':list(reports.values('checkpoint','available_at','deadline','store__code'))})


@endpoint(('POST',))
@transaction.atomic
def start(request):
    require_test_admin(request)
    data = body(request)
    stores = list(Store.objects.select_for_update().order_by('pk'))
    if len(stores)!=2 or {s.code for s in stores}!={'TEST-MS','TEST-KK'} or any(not s.profile.get('sandbox_store') for s in stores):
        raise DomainError('Прогон разрешён только для двух учебных магазинов.', 409)
    now, day = timezone.now(), timezone.localdate()
    if (now+timedelta(minutes=12)).astimezone(timezone.get_current_timezone()).date()!=day:
        raise DomainError('До полуночи мало времени. Начните прогон после 00:00.')
    reports = Report.objects.filter(store__in=stores, date=day)
    if reports.exists() and data.get('restart_confirmed') is not True:
        raise DomainError('Прогон уже есть. Подтвердите удаление сегодняшних учебных отчётов.', 409)
    # All removals are scoped to this day's two explicitly marked sandbox stores.
    Notification.objects.filter(finding__report__in=reports).delete()
    FindingAction.objects.filter(finding__report__in=reports).delete()
    Finding.objects.filter(report__in=reports).delete()
    Revision.objects.filter(report__in=reports).delete()
    reports.delete()
    # Prior-day exercises remain visible, but should not keep notifying after restart.
    Finding.objects.filter(report__store__in=stores).exclude(report__date=day).update(state='resolved')
    for store in stores:
        store.monitoring_enabled=True
        store.profile={**store.profile,'monitoring_from':day.isoformat()}
        store.expected_through=day
        store.save(update_fields=['monitoring_enabled','profile','expected_through'])
        for checkpoint, opening, deadline in [('13',0,3),('17',3,6),('close',6,9)]:
            Report.objects.create(store=store, date=day, checkpoint=checkpoint,
                available_at=now+timedelta(minutes=opening), deadline=now+timedelta(minutes=deadline),
                source_data={'test_run':now.isoformat()})
        if not Plan.objects.filter(store=store,date=day).exists():
            Plan.objects.create(store=store,date=day,revenue=25000,receipts=25,units=35,approved_by=request.user,reason='Учебный план')
    ManagementEvent.objects.create(author=request.user,action='Начат тестовый прогон',entity=day.isoformat(),after={'started_at':now.isoformat()})
    return JsonResponse({'ok':True,'date':day,'started_at':now,'message':'Прогон начат: три среза за 9 минут. Откройте сегодняшний день.'})
