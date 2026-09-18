import hashlib
import json
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID
from zoneinfo import ZoneInfo
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .models import Access, Store, ScheduleException, Report, Revision, Finding, Notification

ACTIVE_STATES = ['open', 'requested', 'escalated']
CHECKPOINTS = ['13', '17', 'close']


class DomainError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def role(user):
    if user.is_superuser:
        return 'manager'
    try:
        return user.access.role
    except Access.DoesNotExist:
        return None


def allowed_stores(user):
    if role(user) in ['office', 'manager']:
        return Store.objects.filter(archived=False)
    if role(user) == 'store':
        return user.access.stores.filter(archived=False)
    return Store.objects.none()


def business_date(store, now=None):
    local = (now or timezone.now()).astimezone(ZoneInfo(store.timezone))
    yesterday = local.date() - timedelta(days=1)
    previous = schedule(store, yesterday)
    if previous and previous[1].date() > yesterday and local < previous[1] + timedelta(minutes=15):
        return yesterday
    return local.date()


def schedule(store, day):
    if day < store.active_from or (store.active_until and day > store.active_until):
        return None
    override = ScheduleException.objects.filter(store=store, date=day).first()
    if (override and override.closed) or (not override and day.weekday() not in store.weekdays):
        return None
    opening = override.opens_at if override and override.opens_at else store.opens_at
    closing = override.closes_at if override and override.closes_at else store.closes_at
    tz = ZoneInfo(store.timezone)
    start = datetime.combine(day, opening, tz)
    end = datetime.combine(day + timedelta(days=closing <= opening), closing, tz)
    return start, end


def ensure_reports(store, day):
    if settings.SREZ_TEST_MODE and store.profile.get('sandbox_store'):
        # Acceptance reports are created explicitly by the short-run controller.
        return
    if store.archived or not store.monitoring_enabled:
        return
    monitoring_from = store.profile.get('monitoring_from')
    if monitoring_from and day < date.fromisoformat(monitoring_from):
        return
    bounds = schedule(store, day)
    if not bounds:
        return
    start, end = bounds
    points = [('13', datetime.combine(day, time(13), start.tzinfo), 5),
              ('17', datetime.combine(day, time(17), start.tzinfo), 5), ('close', end, 15)]
    for checkpoint, at, grace in points:
        if checkpoint == 'close' or start <= at < end:
            report, created = Report.objects.get_or_create(store=store, date=day, checkpoint=checkpoint,
                defaults={'available_at': at, 'deadline': at + timedelta(minutes=grace)})
            # Future source rows may already exist. Monitoring starts explicitly
            # from the next business day; historical imports keep unknown deadlines.
            if monitoring_from and report.deadline is None:
                report.available_at, report.deadline = at, at + timedelta(minutes=grace)
                report.save(update_fields=['available_at', 'deadline'])


def make_finding(report, version, kind, message, notify=True):
    finding, created = Finding.objects.get_or_create(report=report, version=version, kind=kind, defaults={'message': message})
    if created and notify:
        queue_notification(finding)
    return finding


def queue_notification(finding, action=None):
    for channel in ['telegram', 'max']:
        Notification.objects.get_or_create(finding=finding, channel=channel,
            event_key=f'action:{action.pk}' if action else 'created',
            defaults={'action': action, 'next_attempt_at': timezone.now()})


def checkpoint_status(store, day, checkpoint):
    """Coverage for a missing row, without inventing a historical deadline."""
    if day > business_date(store):
        return 'waiting'
    monitoring_from = store.profile.get('monitoring_from')
    confirmed = store.monitoring_enabled and (not monitoring_from or day >= date.fromisoformat(monitoring_from))
    if confirmed:
        bounds = schedule(store, day)
        if not bounds:
            return 'not_expected'
        start, end = bounds
        if checkpoint != 'close' and not start <= datetime.combine(day, time(int(checkpoint)), start.tzinfo) < end:
            return 'not_expected'
    return 'unfilled'


def anomalies(report, revenue, receipts, units):
    result = []
    if revenue is not None and revenue < 0:
        result.append(('negative', 'Отрицательная выручка: проверьте возвраты и пояснение.'))
    if receipts == 0 and (revenue not in [None, 0] or units not in [None, 0]):
        result.append(('zero_receipts', 'Продажи или алкогольные единицы указаны при нуле чеков.'))
    siblings = Report.objects.filter(store=report.store, date=report.date).exclude(pk=report.pk).order_by('available_at')
    for sibling in siblings:
        last = sibling.revisions.order_by('-version').first()
        if not last:
            continue
        before = CHECKPOINTS.index(sibling.checkpoint) < CHECKPOINTS.index(report.checkpoint)
        values, other = (revenue, receipts, units), (last.revenue, last.receipts, last.units)
        if any((a < b if before else a > b) for a, b in zip(values, other) if a is not None and b is not None):
            result.append((f'cumulative_{sibling.checkpoint}',
                f'Накопительные показатели не согласуются со срезом {sibling.get_checkpoint_display()}.'))
    return result


def parse_values(data):
    try:
        value = data.get('revenue')
        if not isinstance(value, (str, int, float)) or isinstance(value, bool) or str(value).strip() == '':
            raise ValueError()
        revenue = Decimal(str(value).replace(' ', '').replace('\u00a0', '').replace(',', '.'))
        if not revenue.is_finite() or abs(revenue) >= Decimal('1000000000000') or revenue != revenue.quantize(Decimal('.01')):
            raise ValueError()
        counts = []
        for name in ['receipts', 'units']:
            raw = data.get(name)
            if isinstance(raw, bool) or raw is None or str(raw).strip() == '':
                raise ValueError()
            number = Decimal(str(raw))
            if not number.is_finite() or number != number.to_integral_value() or not 0 <= number <= 2147483647:
                raise ValueError()
            counts.append(int(number))
        comment = data.get('comment', '')
        if not isinstance(comment, str) or len(comment) > 2000:
            raise ValueError()
        request_id = UUID(str(data.get('request_id')))
        if type(data.get('version')) is not int or data['version'] < 0:
            raise ValueError()
        return revenue, *counts, comment.strip(), request_id
    except (ValueError, TypeError, InvalidOperation):
        raise DomainError('Заполните три показателя. Выручка — до двух знаков после запятой; чеки и единицы — целые неотрицательные числа.')


@transaction.atomic
def submit(user, report_id, data):
    # The store row serializes submissions for all checkpoints of the same store,
    # including late corrections of earlier cumulative totals.
    try:
        initial = Report.objects.get(pk=report_id, store__in=allowed_stores(user))
    except Report.DoesNotExist:
        raise DomainError('Отчёт не найден или нет доступа.', 404)
    if role(user) not in ['store', 'manager']:
        raise DomainError('Отчёты отправляет сотрудник магазина со своего аккаунта.', 403)
    Store.objects.select_for_update().get(pk=initial.store_id)
    report = Report.objects.select_for_update().select_related('store').get(pk=report_id)
    revenue, receipts, units, comment, request_id = parse_values(data)
    employee = data.get('employee', '')
    if not isinstance(employee, str) or len(employee) > 200:
        raise DomainError('Проверьте ФИО сотрудника.')
    digest = hashlib.sha256(json.dumps([report.pk, data['version'], str(revenue.quantize(Decimal('.01'))), receipts, units, comment, employee]).encode()).hexdigest()
    replay = Revision.objects.filter(request_id=request_id).first()
    if replay:
        if replay.author_id != user.pk or replay.report_id != report.pk or replay.payload_hash != digest:
            raise DomainError('Идентификатор отправки уже использован для другого запроса.', 409)
        return replay, False
    if data['version'] != report.current_version:
        raise DomainError('Отчёт уже изменён. Обновите данные перед исправлением.', 409)
    now = timezone.now()
    if report.available_at and now < report.available_at:
        raise DomainError('Этот срез ещё не наступил. Отправьте показатели после указанного времени.')
    if report.date > business_date(report.store, now):
        raise DomainError('Нельзя отправить отчёт за будущую рабочую дату.')
    issues = anomalies(report, revenue, receipts, units)
    if (report.current_version or issues) and not comment:
        raise DomainError('Добавьте причину исправления или пояснение к необычным показателям.')
    revision = Revision.objects.create(report=report, version=report.current_version + 1, author=user,
        revenue=revenue, receipts=receipts, units=units, comment=comment, employee=employee, request_id=request_id, payload_hash=digest)
    if not report.first_received_at and (not report.imported or report.deadline):
        report.first_received_at = revision.received_at
    report.current_version = revision.version
    report.save(update_fields=['first_received_at', 'current_version'])
    report.findings.filter(kind='missing', state__in=ACTIVE_STATES).update(state='resolved')
    # Re-evaluate both sides when any checkpoint is corrected. Findings/actions
    # stay in the audit trail; approvals of unchanged findings stay in effect.
    for sibling in Report.objects.filter(store=report.store, date=report.date):
        last = sibling.revisions.order_by('-version').first()
        if not last:
            continue
        current = anomalies(sibling, last.revenue, last.receipts, last.units)
        kinds = [kind for kind, _ in current]
        sibling.findings.filter(state__in=ACTIVE_STATES).exclude(kind__in=['late', 'missing', 'manual_question']).exclude(
            version=last.version, kind__in=kinds).update(state='resolved')
        for kind, message in current:
            finding = make_finding(sibling, last.version, kind, message)
            if finding.state == 'resolved':
                finding.state = 'open'
                finding.save(update_fields=['state'])
    if report.first_received_at and report.deadline and report.first_received_at > report.deadline:
        make_finding(report, 1, 'late', 'Первый отчёт получен после срока сдачи.')
    return revision, True


def revision_json(revision):
    return {'version': revision.version, 'author': revision.employee or ('Не указан в источнике' if revision.origin == 'sheets' else revision.author.get_full_name() or revision.author.username),
        'recorded_by': revision.author.get_full_name() or revision.author.username, 'origin': revision.origin,
        'employee': revision.employee, 'source_data': revision.source_data,
        'imported_at': revision.imported_at.isoformat() if revision.imported_at else None,
        'received_at': revision.received_at.isoformat() if revision.received_at else None, 'revenue': str(revision.revenue) if revision.revenue is not None else None,
        'receipts': revision.receipts, 'units': revision.units, 'comment': revision.comment,
        'units_per_receipt': str(round(Decimal(revision.units) / revision.receipts, 2)) if revision.receipts and revision.units is not None else None}


def report_json(report):
    revisions = list(report.revisions.all())
    current = revisions[-1] if revisions else None
    findings = list(report.findings.all())
    active = [f for f in findings if f.state in ACTIVE_STATES]
    late = bool(report.first_received_at and report.deadline and report.first_received_at > report.deadline)
    status = ('review' if active else 'partial' if any(v is None for v in [current.revenue, current.receipts, current.units]) else 'imported' if current.origin == 'sheets' else 'late' if late else 'ok') if current else ('missing' if report.deadline and timezone.now() > report.deadline else 'waiting' if report.deadline or report.date > business_date(report.store) else 'unfilled')
    return {'id': report.pk, 'checkpoint': report.checkpoint, 'imported': report.imported, 'source_data': report.source_data, 'deadline': report.deadline.isoformat() if report.deadline else None,
        'available_at': report.available_at.isoformat() if report.available_at else None, 'first_received_at': report.first_received_at.isoformat() if report.first_received_at else None,
        'version': report.current_version, 'status': status, 'late': late,
        'current': revision_json(current) if current else None,
        'findings': [{'id': f.pk, 'kind': f.kind, 'message': f.message, 'state': f.state, 'version': f.version,
            'actions': [{'author': a.author.get_full_name() or a.author.username, 'author_role': role(a.author), 'action': a.action,
                         'comment': a.comment, 'at': a.created_at.isoformat()} for a in f.actions.all()]} for f in findings]}
