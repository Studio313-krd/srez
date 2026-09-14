import hashlib
from datetime import date, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.forms.models import model_to_dict
from django.http import JsonResponse
from django.utils import timezone
from .models import (Store, Employee, StoreStaff, LegalEntity, Plan, SourceDocument, SourceSheet,
                     ImportIssue, ManagementEvent, Access, Report, ScheduleException)
from .services import DomainError, role, ensure_reports, business_date, report_json, CHECKPOINTS
from .views import endpoint, body


def require_admin(request):
    if role(request.user) != 'manager':
        raise DomainError('Раздел доступен администратору.', 403)


def record_event(request, action, entity, before=None, after=None):
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    ManagementEvent.objects.create(author=request.user, action=action, entity=str(entity),
        before=json.loads(json.dumps(before or {}, cls=DjangoJSONEncoder)),
        after=json.loads(json.dumps(after or {}, cls=DjangoJSONEncoder)))


def validate(instance):
    try:
        instance.full_clean()
    except ValidationError as error:
        raise DomainError('; '.join(error.messages))


def store_data(store):
    return {'id': store.pk, 'code': store.code, 'name': store.name, 'city': store.city, 'network': store.network,
        'timezone': store.timezone, 'opens_at': store.opens_at.isoformat(timespec='minutes'),
        'closes_at': store.closes_at.isoformat(timespec='minutes'), 'weekdays': store.weekdays,
        'active_from': store.active_from, 'active_until': store.active_until, 'monitoring_enabled': store.monitoring_enabled,
        'archived': store.archived, 'profile': store.profile,
        'staff': [{'id': s.employee_id, 'name': s.employee.name, 'slot': s.slot} for s in store.staff.all()]}


@endpoint()
def overview(request):
    require_admin(request)
    from .worker import notification_status
    return JsonResponse({'stores': [store_data(s) for s in Store.objects.filter(archived=False).prefetch_related('staff__employee')],
        'notifications': notification_status(),
        'employees': [{'id': p.pk, 'name': p.name, 'position': p.position, 'active': p.active, 'notes': p.notes,
            'sources': p.source_data.get('sources', []), 'stores': [{'code': a.store.code, 'name': a.store.name, 'slot': a.slot} for a in p.assignments.all() if not a.store.archived]}
            for p in Employee.objects.prefetch_related('assignments__store').order_by('name')],
        'legal_entities': list(LegalEntity.objects.order_by('name').values('id', 'name', 'data')),
        'sources': [{'id': d.pk, 'title': d.title, 'url': d.url, 'imported_at': d.imported_at, 'stats': d.stats,
            'sheets': list(d.sheets.order_by('title').values('id', 'title'))} for d in SourceDocument.objects.all()],
        'issues': list(ImportIssue.objects.select_related('store').order_by('resolved','kind','pk').values('id','kind','message','details','resolved','resolution','store__code')),
        'users': [{'id': u.pk, 'username': u.username, 'name': u.get_full_name() or u.username, 'role': role(u), 'active': u.is_active,
                   'stores': [s.code for s in u.access.stores.all()] if hasattr(u, 'access') else []}
                  for u in get_user_model().objects.filter(is_active=True).select_related('access').prefetch_related('access__stores').order_by('username')],
        'events': [{'id': e.pk, 'author': e.author.get_full_name() or e.author.username, 'action': e.action, 'entity': e.entity, 'at': e.created_at}
                   for e in ManagementEvent.objects.select_related('author').order_by('-pk')[:100]]})


@endpoint(('POST',))
@transaction.atomic
def save_store(request, pk):
    require_admin(request)
    store = Store.objects.select_for_update().filter(pk=pk).first() if pk else Store()
    if store is None: raise DomainError('Магазин не найден.', 404)
    before = store_data(store) if pk else {}
    data = body(request)
    was_monitoring = store.monitoring_enabled if pk else False
    for field in ['code', 'name', 'city', 'network', 'timezone', 'opens_at', 'closes_at', 'weekdays', 'active_from', 'active_until', 'monitoring_enabled']:
        if field in data:
            value = data[field]
            if field == 'monitoring_enabled' and type(value) is not bool: raise DomainError('Некорректный режим контроля.')
            setattr(store, field, value or None if field == 'active_until' else value)
    if 'profile' in data:
        if not isinstance(data['profile'], dict): raise DomainError('Некорректная карточка магазина.')
        store.profile = {**store.profile, **{k: v for k,v in data['profile'].items() if k in ['legal_entity','region','vacancies','staffing','shift_rate']}}
        for field in ['vacancies', 'shift_rate']:
            value = store.profile.get(field)
            if value not in [None, '']:
                try:
                    number = Decimal(str(value))
                    if not number.is_finite() or number < 0 or (field == 'vacancies' and number != int(number)): raise ValueError()
                except (ValueError, ArithmeticError): raise DomainError('Проверьте ставку и число вакансий.')
    validate(store)
    if store.monitoring_enabled and not was_monitoring:
        start = business_date(store) + timedelta(days=1)
        store.profile['monitoring_from'] = start.isoformat()
        store.expected_through = start - timedelta(days=1)
    store.save()
    if 'staff' in data:
        if not isinstance(data['staff'], list): raise DomainError('Некорректный список сотрудников.')
        desired = {}
        for item in data['staff']:
            if not isinstance(item, dict) or item.get('slot') not in ['seller1','seller2','curator']: raise DomainError('Неизвестная должность.')
            employee = Employee.objects.filter(pk=item.get('id')).first()
            if not employee: raise DomainError('Сотрудник не найден.')
            if not employee.active and not StoreStaff.objects.filter(store=store, employee=employee, slot=item['slot']).exists():
                raise DomainError('Неактивного сотрудника нельзя назначить в магазин.')
            if item['slot'] in desired: raise DomainError('Место сотрудника указано дважды.')
            desired[item['slot']] = employee
        store.staff.exclude(slot__in=desired).delete()
        for slot, employee in desired.items():
            StoreStaff.objects.update_or_create(store=store, slot=slot, defaults={'employee': employee})
    after = store_data(store)
    record_event(request, 'Изменение магазина' if pk else 'Добавление магазина', store.code, before, after)
    return JsonResponse(after)


@endpoint(('POST',))
@transaction.atomic
def save_employee(request, pk):
    require_admin(request)
    person = Employee.objects.select_for_update().filter(pk=pk).first() if pk else Employee()
    if person is None: raise DomainError('Сотрудник не найден.', 404)
    before = model_to_dict(person) if pk else {}
    data = body(request)
    for field in ['name','position','active','notes']:
        if field in data: setattr(person, field, data[field])
    if not isinstance(person.name, str): raise DomainError('Укажите ФИО.')
    person.name = ' '.join(person.name.split())
    person.key = hashlib.sha256(person.name.casefold().replace('ё','е').encode()).hexdigest()
    validate(person); person.save()
    record_event(request, 'Изменение сотрудника' if pk else 'Добавление сотрудника', person.name, before, model_to_dict(person))
    return JsonResponse({'ok': True, 'id': person.pk})


@endpoint(('POST',))
@transaction.atomic
def save_legal(request, pk):
    require_admin(request)
    item = LegalEntity.objects.select_for_update().filter(pk=pk).first() if pk else LegalEntity()
    if item is None: raise DomainError('Юридическое лицо не найдено.', 404)
    before = model_to_dict(item) if pk else {}
    data = body(request)
    item.name = data.get('name', item.name)
    if not isinstance(data.get('data', {}), dict): raise DomainError('Некорректные реквизиты.')
    item.data = {**item.data, **data.get('data', {})}
    validate(item); item.save()
    record_event(request, 'Реквизиты юридического лица', item.name, before, model_to_dict(item))
    return JsonResponse({'ok': True, 'id': item.pk})


@endpoint(('GET','POST'))
@transaction.atomic
def plans(request):
    require_admin(request)
    if request.method == 'GET':
        try: day = date.fromisoformat(request.GET.get('date', timezone.localdate().isoformat()))
        except ValueError: raise DomainError('Проверьте дату плана.')
        return JsonResponse({'plans': [{'id': p.pk, 'store_id': p.store_id, 'date': p.date, 'revenue': p.revenue,
            'receipts': p.receipts, 'units': p.units, 'units_per_receipt': p.units_per_receipt,
            'origin': p.origin, 'reason': p.reason, 'source_data': p.source_data, 'created_at': p.approved_at}
            for p in Plan.objects.filter(date=day, store__archived=False)]})
    data = body(request)
    store = Store.objects.filter(pk=data.get('store_id'), archived=False).first()
    if not store: raise DomainError('Выберите магазин.')
    if data.get('revenue') in [None, '']: raise DomainError('Укажите план выручки.')
    plan = Plan(store=store, date=data.get('date'), revenue=data.get('revenue'), receipts=data.get('receipts') if data.get('receipts') != '' else None,
        units=data.get('units') if data.get('units') != '' else None,
        units_per_receipt=data.get('units_per_receipt') if data.get('units_per_receipt') != '' else None, reason=data.get('reason',''), approved_by=request.user)
    validate(plan); plan.save()
    record_event(request, 'Новая версия плана', store.code, after=model_to_dict(plan))
    return JsonResponse({'ok': True, 'id': plan.pk})


@endpoint()
def source_sheet(request, pk):
    require_admin(request)
    sheet = SourceSheet.objects.select_related('document').filter(pk=pk).first()
    if not sheet: raise DomainError('Лист не найден.', 404)
    return JsonResponse({'title': sheet.title, 'source': sheet.document.title, 'values': sheet.values, 'formulas': sheet.formulas})


@endpoint(('POST',))
@transaction.atomic
def resolve_issue(request, pk):
    require_admin(request)
    issue = ImportIssue.objects.select_for_update().filter(pk=pk).first()
    if not issue: raise DomainError('Замечание не найдено.', 404)
    data = body(request)
    text = data.get('resolution','')
    if not isinstance(text,str) or not text.strip(): raise DomainError('Опишите результат сверки.')
    issue.resolution, issue.resolved = text.strip(), True
    issue.save(update_fields=['resolution','resolved'])
    record_event(request, 'Сверка источников', issue.key, after={'resolution': text})
    return JsonResponse({'ok': True})


@endpoint(('POST',))
def change_password(request):
    require_admin(request)
    data = body(request)
    current, password = data.get('current',''), data.get('password','')
    if not isinstance(current,str) or not request.user.check_password(current): raise DomainError('Текущий пароль неверен.')
    if not isinstance(password,str): raise DomainError('Введите новый пароль.')
    try: validate_password(password, request.user)
    except ValidationError as error: raise DomainError('; '.join(error.messages))
    request.user.set_password(password); request.user.save(update_fields=['password'])
    update_session_auth_hash(request, request.user)
    record_event(request, 'Смена пароля', request.user.username)
    return JsonResponse({'ok': True})


@endpoint(('GET','POST'))
@transaction.atomic
def schedule_exceptions(request):
    require_admin(request)
    if request.method == 'GET':
        return JsonResponse({'exceptions': list(ScheduleException.objects.select_related('store').order_by('-date').values('id','store_id','store__code','date','closed','opens_at','closes_at','reason')[:300])})
    data = body(request)
    store = Store.objects.filter(pk=data.get('store_id'), archived=False).first()
    if not store: raise DomainError('Выберите магазин.')
    try: day = date.fromisoformat(data.get('date', ''))
    except (ValueError, TypeError): raise DomainError('Проверьте дату исключения.')
    if Report.objects.filter(store=store, date=day, imported=False).exists():
        raise DomainError('Сроки этого дня уже зафиксированы. Укажите пояснение в отчёте.')
    item, created = ScheduleException.objects.get_or_create(store=store, date=day, defaults={'reason': data.get('reason','')})
    before = model_to_dict(item)
    for field in ['closed','opens_at','closes_at','reason']:
        if field in data: setattr(item, field, data[field] or None if field in ['opens_at','closes_at'] else data[field])
    validate(item); item.save()
    record_event(request, 'Исключение графика', store.code, before, model_to_dict(item))
    return JsonResponse({'ok': True})


@endpoint(('POST',))
@transaction.atomic
def create_report(request):
    require_admin(request)
    data = body(request)
    store = Store.objects.select_for_update().filter(pk=data.get('store_id'), archived=False).first()
    if not store: raise DomainError('Выберите магазин.')
    try: day = date.fromisoformat(data.get('date', ''))
    except (ValueError, TypeError): raise DomainError('Проверьте рабочую дату.')
    if day > business_date(store): raise DomainError('Нельзя заполнить отчёт за будущий день.')
    if day < store.active_from or (store.active_until and day > store.active_until):
        raise DomainError('Дата вне периода работы магазина в сервисе.')
    checkpoint = data.get('checkpoint')
    if checkpoint not in CHECKPOINTS: raise DomainError('Выберите срез.')
    ensure_reports(store, day)
    item, created = Report.objects.get_or_create(store=store, date=day, checkpoint=checkpoint)
    if created: record_event(request, 'Создание среза', store.code, after={'date': day, 'checkpoint': checkpoint})
    return JsonResponse(report_json(item))
