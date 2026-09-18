import csv
import hashlib
import json
from datetime import date, timedelta
from functools import wraps
from secrets import compare_digest as secrets_compare
from django.contrib.auth import authenticate, login, logout
from django.conf import settings
from django.core.signing import BadSignature
from django.db import connection, transaction, IntegrityError
from django.http import JsonResponse, HttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.cache import never_cache
from .models import Report, Plan, Finding, FindingAction, LoginAttempt, WorkerHealth, Employee
from .employee_links import signer
from .services import (DomainError, allowed_stores, role, business_date, ensure_reports, report_json,
    revision_json, submit, checkpoint_status, CHECKPOINTS, make_finding, queue_notification)


def endpoint(methods=('GET',), authenticated=True):
    def decorate(fn):
        @never_cache
        @wraps(fn)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({'error': 'Метод не поддерживается.'}, status=405)
            if authenticated and not request.user.is_authenticated:
                return JsonResponse({'error': 'Войдите в личный кабинет.'}, status=401)
            try:
                return fn(request, *args, **kwargs)
            except DomainError as error:
                return JsonResponse({'error': error.message}, status=error.status)
            except IntegrityError:
                return JsonResponse({'error': 'Данные изменены другим запросом. Обновите страницу.'}, status=409)
        return wrapped
    return decorate


def body(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (ValueError, UnicodeDecodeError):
        raise DomainError('Некорректный формат запроса.')


def csrf_failure(request, reason=''):
    return JsonResponse({'error': 'Сессия устарела. Обновите страницу и повторите действие.'}, status=403)


def user_json(user):
    person = getattr(user, 'employee_profile', None)
    return {'id': user.pk, 'name': user.get_full_name() or user.username, 'username': user.username,
            'employee_name': person.name if person and not person.archived else '',
            'role': role(user), 'admin': user.is_staff}


@ensure_csrf_cookie
@endpoint(authenticated=False)
def session(request):
    return JsonResponse({'user': user_json(request.user) if request.user.is_authenticated else None,
                         'csrf': get_token(request), 'today': timezone.localdate().isoformat(), 'test_mode': settings.SREZ_TEST_MODE,
                         'local_preview': settings.DEBUG and getattr(settings, 'SREZ_LOCAL_PREVIEW', False)})


@endpoint(('POST',), authenticated=False)
def sign_in(request):
    data = body(request)
    username, password = data.get('username', ''), data.get('password', '')
    if not isinstance(username, str) or not isinstance(password, str) or len(username) > 150 or len(password) > 1024:
        raise DomainError('Проверьте логин и пароль.')
    # Database-backed account and peer limits also work with multiple web workers.
    keys = [hashlib.sha256(v.encode()).hexdigest() for v in ['user:' + username.lower(), 'ip:' + request.META.get('REMOTE_ADDR', '')]]
    now = timezone.now()
    with transaction.atomic():
        attempts = []
        for key in sorted(keys):
            LoginAttempt.objects.get_or_create(key=key, defaults={'window_start': now})
            attempt = LoginAttempt.objects.select_for_update().get(key=key)
            if now - attempt.window_start > timedelta(minutes=15):
                attempt.failures, attempt.window_start = 0, now
            if attempt.failures >= 20:
                raise DomainError('Слишком много попыток входа. Повторите через 15 минут.', 429)
            attempts.append(attempt)
        user = authenticate(request, username=username, password=password)
        for attempt in attempts:
            attempt.failures = 0 if user else attempt.failures + 1
            attempt.save()
    if not user:
        raise DomainError('Неверный логин или пароль.', 401)
    login(request, user)
    return JsonResponse({'user': user_json(user), 'csrf': get_token(request)})


@endpoint(('POST',), authenticated=False)
def employee_link_login(request):
    token = body(request).get('token', '')
    if not isinstance(token, str) or not token or len(token) > 2048:
        raise DomainError('Ссылка недействительна. Попросите видеоконтроль прислать новую.', 401)
    user = None
    key = hashlib.sha256(('employee-link-ip:' + request.META.get('REMOTE_ADDR', '')).encode()).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        LoginAttempt.objects.get_or_create(key=key, defaults={'window_start': now})
        attempt = LoginAttempt.objects.select_for_update().get(key=key)
        if now - attempt.window_start > timedelta(minutes=15):
            attempt.failures, attempt.window_start = 0, now
        if attempt.failures >= 20:
            raise DomainError('Слишком много попыток входа. Повторите через 15 минут.', 429)
        try:
            payload = signer().unsign_object(token)
            if not isinstance(payload, dict) or type(payload.get('id')) is not int or not isinstance(payload.get('version'), str):
                raise ValueError()
            person = Employee.objects.select_for_update().filter(pk=payload['id'], active=True, archived=False).first()
            if person and person.login_version and secrets_compare(person.login_version, payload['version']) and person.user_id:
                candidate = person.user
                if candidate.is_active and not candidate.is_staff and not candidate.is_superuser and role(candidate) == 'store':
                    user = candidate
        except (BadSignature, ValueError, TypeError, UnicodeDecodeError):
            pass
        attempt.failures = 0 if user else attempt.failures + 1
        attempt.save()
        if user:
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    if not user:
        raise DomainError('Ссылка недействительна или вход закрыт. Обратитесь к видеоконтролю.', 401)
    return JsonResponse({'user': user_json(user), 'csrf': get_token(request)})


@endpoint(('POST',))
def sign_out(request):
    logout(request)
    return JsonResponse({'ok': True, 'csrf': get_token(request)})


def requested_day(request, stores):
    raw = request.GET.get('date')
    try:
        day = date.fromisoformat(raw) if raw else (business_date(stores[0]) if len(stores) == 1 else timezone.localdate())
    except (ValueError, TypeError):
        raise DomainError('Укажите рабочую дату в формате ГГГГ-ММ-ДД.')
    if not timezone.localdate() - timedelta(days=366) <= day <= timezone.localdate() + timedelta(days=366):
        raise DomainError('Доступны даты в пределах года до и после сегодняшнего дня.')
    return day


def dashboard_data(request):
    stores = list(allowed_stores(request.user).prefetch_related('staff__employee'))
    day = requested_day(request, stores)
    selected = [s for s in stores if s.active_from <= day and (not s.active_until or s.active_until >= day)]
    for store in selected:
        if day <= business_date(store):
            ensure_reports(store, day)
    reports = Report.objects.filter(store__in=selected, date=day).select_related('store').prefetch_related('revisions__author', 'findings__actions__author')
    plans = Plan.objects.filter(store__in=selected, date=day)
    plan_map = {}
    for plan in plans:
        plan_map.setdefault(plan.store_id, plan)
    grouped = {}
    for report in reports:
        grouped.setdefault(report.store_id, []).append(report_json(report))
    result = []
    for store in selected:
        plan = plan_map.get(store.pk)
        result.append({'id': store.pk, 'code': store.code, 'name': store.name, 'city': store.city,
            'network': store.network, 'timezone': store.timezone, 'profile': store.profile, 'monitoring_enabled': store.monitoring_enabled,
            'employees': [{'employee_id': a.employee_id, 'employee__name': a.employee.name, 'slot': a.slot}
                          for a in store.staff.all() if not a.employee.archived],
            'business_date': business_date(store).isoformat(),
            'checkpoint_status': {s: checkpoint_status(store, day, s) for s in CHECKPOINTS if not any(r['checkpoint'] == s for r in grouped.get(store.pk, []))},
            'reports': sorted(grouped.get(store.pk, []), key=lambda r: ['13','17','close'].index(r['checkpoint'])),
            'plan': {'revenue': str(plan.revenue) if plan.revenue is not None else None, 'receipts': plan.receipts, 'units': plan.units,
                     'approved_at': plan.approved_at.isoformat(), 'origin': plan.origin, 'units_per_receipt': str(plan.units_per_receipt) if plan.units_per_receipt is not None else None, 'id': plan.pk} if plan else None})
    health = WorkerHealth.objects.filter(name='scheduler').first()
    return {'date': day.isoformat(), 'server_time': timezone.now().isoformat(), 'stores': result,
        'worker_ok': bool(health and timezone.now() - health.last_success < timedelta(minutes=3))}


@endpoint()
def dashboard(request):
    return JsonResponse(dashboard_data(request))


@endpoint(('GET', 'POST'))
def report_detail(request, pk):
    if request.method == 'POST':
        revision, created = submit(request.user, pk, body(request))
        return JsonResponse({'revision': revision_json(revision), 'created': created}, status=201 if created else 200)
    try:
        report = Report.objects.select_related('store').prefetch_related('revisions__author', 'findings__actions__author').get(pk=pk, store__in=allowed_stores(request.user))
    except Report.DoesNotExist:
        raise DomainError('Отчёт не найден или нет доступа.', 404)
    result = report_json(report)
    result['history'] = [revision_json(r) for r in report.revisions.all()]
    return JsonResponse(result)


@endpoint(('POST',))
@transaction.atomic
def finding_action(request, pk):
    try:
        finding = Finding.objects.select_for_update(of=('self',)).get(pk=pk, report__store__in=allowed_stores(request.user))
    except Finding.DoesNotExist:
        raise DomainError('Замечание не найдено.', 404)
    data = body(request)
    action, comment = data.get('action'), data.get('comment')
    valid = ['requested', 'accepted', 'escalated'] if role(request.user) in ['office', 'manager'] else ['reply']
    if action not in valid or not isinstance(comment, str) or not comment.strip() or len(comment) > 2000:
        raise DomainError('Выберите доступное действие и добавьте комментарий.')
    if action != 'reply':
        if finding.state == 'resolved':
            raise DomainError('Показатели уже исправлены. Обновите список замечаний.', 409)
        finding.state = action
        finding.save(update_fields=['state'])
    saved_action = FindingAction.objects.create(finding=finding, author=request.user, action=action, comment=comment.strip())
    if action == 'reply':
        queue_notification(finding, saved_action)
    return JsonResponse({'ok': True})


@endpoint(('POST',))
@transaction.atomic
def report_question(request, pk):
    if role(request.user) not in ['store', 'office', 'manager']:
        raise DomainError('Нет доступа к обсуждению.', 403)
    report = Report.objects.select_for_update().filter(pk=pk, store__in=allowed_stores(request.user)).first()
    if not report:
        raise DomainError('Отчёт не найден.', 404)
    comment = body(request).get('comment')
    if not isinstance(comment, str) or not comment.strip() or len(comment) > 2000:
        raise DomainError('Напишите сообщение, не более 2000 символов.')
    seller = role(request.user) == 'store'
    finding = make_finding(report, report.current_version, 'manual_question',
                           'Вопрос от продавца' if seller else 'Вопрос от видеоконтроля', notify=False)
    finding.state = 'requested'
    finding.save(update_fields=['state'])
    action = FindingAction.objects.create(finding=finding, author=request.user,
                                          action='question' if seller else 'requested', comment=comment.strip())
    if seller: queue_notification(finding, action)
    return JsonResponse({'ok': True})


def spreadsheet_safe(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else text


@endpoint()
def export_csv(request):
    if role(request.user) not in ['office', 'manager']:
        raise DomainError('Выгрузка доступна офису и руководителю.', 403)
    data = dashboard_data(request)
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="srez-{data["date"]}.csv"'
    response.write('\ufeff')
    writer = csv.writer(response, delimiter=';')
    writer.writerow(['Дата', 'Код', 'Сеть', 'Город', 'Магазин', 'Срез', 'Сотрудник', 'Выручка', 'Чеки', 'Алкогольные единицы', 'Ед./чек', 'План выручки', 'Первое получение (ISO)', 'Срок (ISO)', 'Статус', 'Версия'])
    for store in data['stores']:
        for report in store['reports']:
            current = report['current'] or {}
            fields = [data['date'], store['code'], store['network'], store['city'], store['name'], report['checkpoint'],
                current.get('author', ''), current.get('revenue', ''), current.get('receipts', ''), current.get('units', ''),
                current.get('units_per_receipt', ''), (store['plan'] or {}).get('revenue', ''), report['first_received_at'] or '',
                report['deadline'], report['status'], report['version']]
            writer.writerow([spreadsheet_safe(f) if isinstance(f, str) else f for f in fields])
    return response


@endpoint(authenticated=False)
def health(request):
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return JsonResponse({'ok': True})


@endpoint(('POST',))
def export_table(request):
    from .exports import export_table_data
    return export_table_data(request, body(request))
